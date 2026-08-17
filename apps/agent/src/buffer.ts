import {
  mkdirSync,
  existsSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  appendFileSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import type { EagleApi, Trigger } from "./api";

const DIR = join(homedir(), ".eagle-agent", "buffer");
const SHOTS = join(DIR, "shots");
const ACTIVITY = join(DIR, "activity.jsonl");

interface ShotMeta {
  capturedAt: string;
  trigger: Trigger;
  app: string | null;
  url: string | null;
  isIdle: boolean;
}
interface ActivityItem {
  type: "APP" | "WEB";
  name: string;
  startedAt: string;
  endedAt: string;
  isIdle: boolean;
}

function ensure() {
  if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
}

/**
 * Disk-backed store-and-forward queue. When the API is unreachable, screenshots
 * and activity are persisted under ~/.eagle-agent/buffer and replayed (oldest
 * first) once a heartbeat succeeds. Keeps at most MAX_SHOTS to bound disk use.
 */
const MAX_SHOTS = 500;

export const buffer = {
  enqueueScreenshot(img: Buffer, meta: ShotMeta) {
    ensure();
    const shots = readdirSync(SHOTS).filter((f) => f.endsWith(".jpg"));
    if (shots.length >= MAX_SHOTS) {
      // drop the oldest to stay bounded
      const oldest = shots.sort()[0];
      try {
        unlinkSync(join(SHOTS, oldest));
        unlinkSync(join(SHOTS, oldest.replace(/\.jpg$/, ".json")));
      } catch {
        /* ignore */
      }
    }
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    writeFileSync(join(SHOTS, `${id}.jpg`), img);
    writeFileSync(join(SHOTS, `${id}.json`), JSON.stringify(meta));
  },

  enqueueActivity(items: ActivityItem[]) {
    ensure();
    for (const it of items) appendFileSync(ACTIVITY, JSON.stringify(it) + "\n");
  },

  pending(): number {
    ensure();
    const shots = readdirSync(SHOTS).filter((f) => f.endsWith(".jpg")).length;
    const acts = existsSync(ACTIVITY)
      ? readFileSync(ACTIVITY, "utf8").split("\n").filter(Boolean).length
      : 0;
    return shots + acts;
  },

  /** Replay buffered items. Stops on the first failure (still offline). */
  async flush(api: EagleApi): Promise<number> {
    ensure();
    let sent = 0;
    for (const f of readdirSync(SHOTS).filter((x) => x.endsWith(".jpg")).sort()) {
      const id = f.replace(/\.jpg$/, "");
      try {
        const img = readFileSync(join(SHOTS, f));
        const meta = JSON.parse(readFileSync(join(SHOTS, `${id}.json`), "utf8")) as ShotMeta;
        await api.uploadScreenshot(img, meta);
        unlinkSync(join(SHOTS, f));
        try {
          unlinkSync(join(SHOTS, `${id}.json`));
        } catch {
          /* ignore */
        }
        sent++;
      } catch {
        return sent; // still offline
      }
    }
    if (existsSync(ACTIVITY)) {
      const lines = readFileSync(ACTIVITY, "utf8").split("\n").filter(Boolean);
      if (lines.length) {
        try {
          await api.postActivity(lines.map((l) => JSON.parse(l) as ActivityItem));
          unlinkSync(ACTIVITY);
          sent += lines.length;
        } catch {
          /* still offline */
        }
      }
    }
    return sent;
  },
};
