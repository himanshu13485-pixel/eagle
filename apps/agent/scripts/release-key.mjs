// Where the release signing key lives. Deliberately outside the repo, and
// never on the server: whoever holds it can push code to every monitored PC.
import { homedir } from "node:os";
import { join } from "node:path";

export const KEY_PATH =
  process.env.WORKK_SIGNING_KEY || join(homedir(), ".workk-release", "agent-signing.key");

export const PUBLIC_KEY_FILE = new URL("../src/update-key.ts", import.meta.url);
