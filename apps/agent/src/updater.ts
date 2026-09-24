import { createHash, createPublicKey, verify } from "crypto";
import { createWriteStream, existsSync } from "fs";
import { rename, unlink } from "fs/promises";
import { once } from "events";
import { spawn } from "child_process";
import { basename, dirname, extname, join } from "path";

/**
 * Self-update for the Windows agent.
 *
 * Every few hours the agent asks the server for the current release manifest.
 * If it describes a newer build, the agent downloads the binary, checks it
 * against the manifest, swaps itself out and restarts — no reinstall.
 *
 * Trust does NOT come from the server. An auto-update channel is a way to run
 * a program on every monitored PC, often with admin rights, and the server is a
 * shared host. So the manifest is signed (Ed25519) with a private key that
 * lives on the release machine and never on the server; the agent embeds only
 * the public key and refuses anything that doesn't verify. A compromised
 * server can at worst withhold updates or serve an older signed release —
 * which the build-number check then refuses.
 *
 * macOS is deliberately left out: Screen Recording permission is tied to the
 * exact binary for ad-hoc-signed code, so every update would silently stop
 * screenshots. Enable it once the Mac agent is signed with a Developer ID.
 */

export interface SignedManifest {
  payload: string; // the exact JSON bytes that were signed
  signature: string; // base64 Ed25519 signature over `payload`
}

export interface ManifestPayload {
  os: "win" | "mac";
  build: number;
  sha256: string; // hex, of the binary served at /api/agent/binary
  size: number;
}

/** Verify a manifest's signature and shape. Null means "do not trust". */
export function verifyManifest(m: unknown, publicKeyPem: string): ManifestPayload | null {
  try {
    const sm = m as SignedManifest;
    if (typeof sm?.payload !== "string" || typeof sm?.signature !== "string") return null;
    const ok = verify(null, Buffer.from(sm.payload, "utf8"), createPublicKey(publicKeyPem), Buffer.from(sm.signature, "base64"));
    if (!ok) return null;
    const p = JSON.parse(sm.payload) as ManifestPayload;
    if (p.os !== "win" && p.os !== "mac") return null;
    if (!Number.isInteger(p.build) || p.build <= 0) return null;
    if (!/^[0-9a-f]{64}$/.test(p.sha256)) return null;
    if (!Number.isInteger(p.size) || p.size <= 0) return null;
    return p;
  } catch {
    return null;
  }
}

export type CheckResult = "none" | "current" | "rejected" | "failed" | "updated";

export interface UpdaterOpts {
  serverUrl: string;
  os: "win" | "mac";
  currentBuild: number;
  exePath: string; // the running executable, which gets replaced
  publicKeyPem: string;
  /** Start the freshly installed binary. Must reject if it could not start. */
  relaunch: (exePath: string) => Promise<void>;
  /** End this process once the new one is running. */
  exit: () => void;
  log?: (msg: string) => void;
}

const FIRST_CHECK_MIN_MS = 2 * 60_000;
const FIRST_CHECK_SPREAD_MS = 8 * 60_000;
const CHECK_EVERY_MS = 6 * 60 * 60_000;
// Spread a fleet's downloads: every PC pulling ~90 MB in the same minute is
// the one way this feature could strain the server.
const CHECK_SPREAD_MS = 60 * 60_000;

/** "eagle-agent.exe" → "eagle-agent.new.exe" */
function sibling(exePath: string, tag: string): string {
  const ext = extname(exePath);
  return join(dirname(exePath), `${basename(exePath, ext)}.${tag}${ext}`);
}

export class Updater {
  private checking = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly o: UpdaterOpts) {}

  private log(msg: string) {
    (this.o.log ?? console.log)(msg);
  }

  /** Check once and update if a newer signed build is available. */
  async checkOnce(): Promise<CheckResult> {
    if (this.checking) return "none";
    this.checking = true;
    const newPath = sibling(this.o.exePath, "new");
    try {
      const res = await fetch(`${this.o.serverUrl}/api/agent/update?os=${this.o.os}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (res.status === 404) return "none"; // nothing published for this OS
      if (!res.ok) return "failed";

      const manifest = verifyManifest(await res.json(), this.o.publicKeyPem);
      if (!manifest) {
        this.log("[update] release manifest failed signature check — refusing to update");
        return "rejected";
      }
      if (manifest.os !== this.o.os) return "rejected";
      if (manifest.build <= this.o.currentBuild) return "current";

      this.log(`[update] build ${manifest.build} available (running ${this.o.currentBuild}) — downloading`);
      const ok = await this.download(`${this.o.serverUrl}/api/agent/binary`, newPath, manifest);
      if (!ok) {
        await unlink(newPath).catch(() => undefined);
        this.log("[update] downloaded file did not match the signed manifest — discarded");
        return "rejected";
      }

      // Windows can't overwrite a running .exe, but it can rename one. Move the
      // running binary aside, put the new one in its place, and if that second
      // step fails, put the original straight back.
      const oldPath = sibling(this.o.exePath, "old");
      await unlink(oldPath).catch(() => undefined);
      await rename(this.o.exePath, oldPath);
      try {
        await rename(newPath, this.o.exePath);
      } catch (e) {
        await rename(oldPath, this.o.exePath).catch(() => undefined);
        throw e;
      }

      this.log(`[update] installed build ${manifest.build} — restarting`);
      try {
        await this.o.relaunch(this.o.exePath);
      } catch (e: any) {
        // The new binary is in place for the next logon; keep this process
        // running rather than leave the PC unmonitored until then.
        this.log(`[update] restart failed (${e?.message ?? e}) — new build takes over at next logon`);
        return "failed";
      }
      this.o.exit();
      return "updated";
    } catch (e: any) {
      await unlink(newPath).catch(() => undefined);
      this.log(`[update] check failed — ${e?.message ?? e}`);
      return "failed";
    } finally {
      this.checking = false;
    }
  }

  /** Stream to disk, hashing as we go; true only for an exact, complete match. */
  private async download(url: string, dest: string, m: ManifestPayload): Promise<boolean> {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok || !res.body) return false;
    const hash = createHash("sha256");
    const out = createWriteStream(dest);
    let bytes = 0;
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        const buf = Buffer.from(chunk);
        bytes += buf.length;
        if (bytes > m.size) return false; // longer than promised: not our file
        hash.update(buf);
        if (!out.write(buf)) await once(out, "drain");
      }
    } finally {
      await new Promise<void>((resolve) => out.end(() => resolve()));
    }
    return bytes === m.size && hash.digest("hex") === m.sha256;
  }

  /** First check a few minutes after start, then every ~6 hours, jittered. */
  start() {
    const schedule = (ms: number) => {
      this.timer = setTimeout(async () => {
        await this.checkOnce();
        schedule(CHECK_EVERY_MS + Math.random() * CHECK_SPREAD_MS);
      }, ms);
      this.timer.unref?.();
    };
    schedule(FIRST_CHECK_MIN_MS + Math.random() * FIRST_CHECK_SPREAD_MS);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/**
 * Start the new binary the same way the scheduled task does — through
 * launch.vbs, which carries the server/token arguments and keeps the window
 * hidden. The child inherits this process's token, so an elevated agent stays
 * elevated. Resolves once Windows has actually started it.
 */
export function relaunchWindows(exePath: string): Promise<void> {
  const vbs = join(dirname(exePath), "launch.vbs");
  const [cmd, args] = existsSync(vbs)
    ? ["wscript.exe", [vbs]]
    : [exePath, process.argv.slice(2)]; // config.json has the token either way
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args as string[], { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** Remove the binary a previous update moved aside (it was locked until the
 *  old process exited). Harmless when there isn't one. */
export async function cleanupPreviousUpdate(exePath: string): Promise<void> {
  await unlink(sibling(exePath, "old")).catch(() => undefined);
  await unlink(sibling(exePath, "new")).catch(() => undefined);
}
