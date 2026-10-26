import { Injectable } from "@nestjs/common";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { mkdir, writeFile, unlink, stat, rename, copyFile } from "fs/promises";
import { createReadStream, type ReadStream } from "fs";
import { dirname, join } from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Screenshot storage with two drivers:
 *  - STORAGE_DRIVER=local (default): filesystem under STORAGE_DIR, served at /api/files/<key>. Zero-infra dev.
 *  - STORAGE_DRIVER=s3: any S3-compatible bucket (MinIO/AWS/Spaces) with presigned GET URLs. Production.
 */
@Injectable()
export class StorageService {
  /**
   * Key for signing local file URLs.
   *
   * Read as a class field, not a module-level const: ConfigModule loads .env
   * while the module graph is being built, which is *after* this file's imports
   * have been evaluated. A top-level read saw undefined and quietly fell back
   * to the random value below, so every signed URL failed verification.
   *
   * The random fallback itself is deliberate — with no secret configured, links
   * stop working on restart rather than being forgeable from a guessable value.
   */
  private readonly urlSecret =
    process.env.FILE_URL_SECRET || process.env.JWT_ACCESS_SECRET || randomBytes(32).toString("hex");

  private readonly driver = process.env.STORAGE_DRIVER || "local";
  private readonly dir = process.env.STORAGE_DIR || join(process.cwd(), "storage");
  private readonly publicBase =
    process.env.PUBLIC_API_URL || `http://localhost:${process.env.API_PORT || 4000}`;
  private readonly bucket = process.env.S3_BUCKET || "eagle-screenshots";
  private readonly s3 =
    this.driver === "s3"
      ? new S3Client({
          region: process.env.S3_REGION || "us-east-1",
          endpoint: process.env.S3_ENDPOINT,
          forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY || "eagle",
            secretAccessKey: process.env.S3_SECRET_KEY || "eagle-secret",
          },
        })
      : null;

  async putImage(key: string, body: Buffer, contentType = "image/jpeg"): Promise<void> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
      );
      return;
    }
    const full = join(this.dir, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async presignGet(key: string, expiresSec = 3600): Promise<string> {
    if (this.s3) {
      return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: expiresSec,
      });
    }
    // The local driver used to hand back a bare static URL. /api/files was
    // mounted with no auth at all, so anyone holding (or guessing) the path
    // could read an employee's screenshots, forever. Local URLs are now signed
    // and expiring, the same shape of guarantee S3 presigning gives.
    const expires = Math.floor(Date.now() / 1000) + expiresSec;
    const sig = this.signKey(key, expires);
    return `${this.publicBase}/api/files/${key}?e=${expires}&s=${sig}`;
  }

  private signKey(key: string, expires: number): string {
    return createHmac("sha256", this.urlSecret).update(`${key}\n${expires}`).digest("base64url");
  }

  /** Validate a signed file URL. Returns false for a bad, altered or expired link. */
  verifyFileUrl(key: string, expires: string | undefined, sig: string | undefined): boolean {
    const exp = Number(expires);
    if (!sig || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const want = Buffer.from(this.signKey(key, exp));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  }

  /**
   * Move a file that was built on local disk (a generated export archive) into
   * storage. Local driver renames it into place — no second copy of a multi-GB
   * archive — falling back to copy when the temp dir is on another filesystem.
   */
  async putFile(key: string, localPath: string, contentType = "application/zip"): Promise<number> {
    const size = (await stat(localPath)).size;
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: createReadStream(localPath),
          ContentLength: size,
          ContentType: contentType,
        }),
      );
      await unlink(localPath).catch(() => {});
      return size;
    }
    const full = join(this.dir, key);
    await mkdir(dirname(full), { recursive: true });
    try {
      await rename(localPath, full);
    } catch {
      await copyFile(localPath, full);
      await unlink(localPath).catch(() => {});
    }
    return size;
  }

  /** Read a stored object back as a stream, for authenticated downloads. */
  async getStream(key: string): Promise<ReadStream | NodeJS.ReadableStream | null> {
    if (this.s3) {
      try {
        const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
        return (res.Body as NodeJS.ReadableStream) ?? null;
      } catch {
        return null;
      }
    }
    const full = join(this.dir, key);
    try {
      await stat(full);
    } catch {
      return null;
    }
    return createReadStream(full);
  }

  /** Stored size in bytes, or null if the object is gone. Used to backfill
   *  Screenshot.bytes for images written before storage quotas existed. */
  async sizeOf(key: string): Promise<number | null> {
    try {
      if (this.s3) {
        const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        return head.ContentLength ?? null;
      }
      return (await stat(join(this.dir, key))).size;
    } catch {
      return null;
    }
  }

  async deleteImage(key: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => {});
      return;
    }
    await unlink(join(this.dir, key)).catch(() => {});
  }
}
