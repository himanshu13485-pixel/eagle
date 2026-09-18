import { createWriteStream, type WriteStream } from "fs";
import { open } from "fs/promises";
import { once } from "events";

/**
 * Minimal ZIP writer, streaming straight to disk.
 *
 * Screenshot exports are JPEGs, which are already compressed — deflating them
 * again buys a percent or two for a lot of CPU — so every entry is STORED
 * (method 0). That keeps this to the archive format itself and means no new
 * dependency in an image whose npm installs already need retry logic.
 *
 * Writes Zip64 end-of-central-directory records when an archive needs them, so
 * exports past 4 GB or 65535 files still open correctly.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer, seed = 0): number {
  let c = ~seed >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** MS-DOS date/time, which is what the ZIP header format stores. */
function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

interface Entry {
  name: string;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

const ZIP64_LIMIT = 0xffffffff;

export class ZipWriter {
  private readonly out: WriteStream;
  private readonly entries: Entry[] = [];
  private offset = 0;
  private closed = false;

  constructor(private readonly path: string) {
    this.out = createWriteStream(path);
  }

  private async write(buf: Buffer): Promise<void> {
    if (!this.out.write(buf)) await once(this.out, "drain");
    this.offset += buf.length;
  }

  /** Names are stored UTF-8 with the language-encoding flag set, so non-ASCII
   *  filenames survive on every extractor that postdates 2007. */
  private nameBuf(name: string): Buffer {
    return Buffer.from(name.replace(/\\/g, "/"), "utf8");
  }

  async add(name: string, data: Buffer, modified = new Date()): Promise<void> {
    if (this.closed) throw new Error("ZipWriter is closed");
    const nameBuf = this.nameBuf(name);
    const { time, date } = dosDateTime(modified);
    const crc = crc32(data);
    const offset = this.offset;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // local file header
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(0, 8); // STORED
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); // compressed size
    header.writeUInt32LE(data.length, 22); // uncompressed size
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28); // no extra field

    await this.write(header);
    await this.write(nameBuf);
    await this.write(data);

    this.entries.push({ name, crc, size: data.length, offset, time, date });
  }

  /** Finish the archive and resolve once every byte is on disk. */
  async close(): Promise<{ bytes: number; files: number }> {
    if (this.closed) throw new Error("ZipWriter is closed");
    this.closed = true;

    const centralStart = this.offset;
    for (const e of this.entries) {
      const nameBuf = this.nameBuf(e.name);
      const needsZip64 = e.offset > ZIP64_LIMIT;
      const extra = needsZip64 ? Buffer.alloc(12) : Buffer.alloc(0);
      if (needsZip64) {
        extra.writeUInt16LE(0x0001, 0); // Zip64 extended information
        extra.writeUInt16LE(8, 2);
        extra.writeBigUInt64LE(BigInt(e.offset), 4);
      }

      const rec = Buffer.alloc(46);
      rec.writeUInt32LE(0x02014b50, 0); // central directory header
      rec.writeUInt16LE(20, 4); // version made by
      rec.writeUInt16LE(20, 6); // version needed
      rec.writeUInt16LE(0x0800, 8); // UTF-8 names
      rec.writeUInt16LE(0, 10); // STORED
      rec.writeUInt16LE(e.time, 12);
      rec.writeUInt16LE(e.date, 14);
      rec.writeUInt32LE(e.crc, 16);
      rec.writeUInt32LE(e.size, 20);
      rec.writeUInt32LE(e.size, 24);
      rec.writeUInt16LE(nameBuf.length, 28);
      rec.writeUInt16LE(extra.length, 30);
      rec.writeUInt16LE(0, 32); // comment length
      rec.writeUInt16LE(0, 34); // disk number
      rec.writeUInt16LE(0, 36); // internal attrs
      rec.writeUInt32LE(0, 38); // external attrs
      rec.writeUInt32LE(needsZip64 ? ZIP64_LIMIT : e.offset, 42);

      await this.write(rec);
      await this.write(nameBuf);
      if (extra.length) await this.write(extra);
    }
    const centralSize = this.offset - centralStart;
    const count = this.entries.length;
    const needsZip64 = count > 0xffff || centralStart > ZIP64_LIMIT || centralSize > ZIP64_LIMIT;

    if (needsZip64) {
      const z64 = Buffer.alloc(56);
      z64.writeUInt32LE(0x06064b50, 0); // Zip64 end of central directory
      z64.writeBigUInt64LE(BigInt(44), 4); // size of this record minus 12
      z64.writeUInt16LE(45, 12); // version made by
      z64.writeUInt16LE(45, 14); // version needed
      z64.writeUInt32LE(0, 16); // this disk
      z64.writeUInt32LE(0, 20); // disk with central dir
      z64.writeBigUInt64LE(BigInt(count), 24);
      z64.writeBigUInt64LE(BigInt(count), 32);
      z64.writeBigUInt64LE(BigInt(centralSize), 40);
      z64.writeBigUInt64LE(BigInt(centralStart), 48);
      await this.write(z64);

      const loc = Buffer.alloc(20);
      loc.writeUInt32LE(0x07064b50, 0); // Zip64 EOCD locator
      loc.writeUInt32LE(0, 4);
      loc.writeBigUInt64LE(BigInt(centralStart + centralSize), 8);
      loc.writeUInt32LE(1, 16); // total disks
      await this.write(loc);
    }

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // end of central directory
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(Math.min(count, 0xffff), 8);
    eocd.writeUInt16LE(Math.min(count, 0xffff), 10);
    eocd.writeUInt32LE(Math.min(centralSize, ZIP64_LIMIT), 12);
    eocd.writeUInt32LE(Math.min(centralStart, ZIP64_LIMIT), 16);
    eocd.writeUInt16LE(0, 20); // comment length
    await this.write(eocd);

    const bytes = this.offset;
    await new Promise<void>((resolve, reject) => {
      this.out.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
    // end()'s callback fires on flush, not on fsync; make sure the bytes are
    // really durable before another process is told the export is ready.
    const fh = await open(this.path, "r+");
    await fh.sync().catch(() => undefined);
    await fh.close();
    return { bytes, files: count };
  }
}
