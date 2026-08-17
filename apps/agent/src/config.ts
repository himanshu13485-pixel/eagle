import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface LocalConfig {
  serverUrl: string;
  enrollToken?: string;
  deviceId?: string;
  deviceToken?: string;
  employeeId?: string;
}

const DIR = join(homedir(), ".eagle-agent");
const FILE = join(DIR, "config.json");

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

export function loadConfig(): LocalConfig {
  const args = parseArgs();
  let saved: Partial<LocalConfig> = {};
  if (existsSync(FILE)) {
    try {
      saved = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      /* ignore corrupt config */
    }
  }
  const cfg: LocalConfig = {
    serverUrl: args.server ?? saved.serverUrl ?? process.env.EAGLE_SERVER ?? "http://localhost:4000",
    enrollToken: args.token ?? saved.enrollToken,
    deviceId: saved.deviceId,
    deviceToken: saved.deviceToken,
    employeeId: saved.employeeId,
  };
  return cfg;
}

export function saveConfig(cfg: LocalConfig): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(cfg, null, 2), "utf8");
}
