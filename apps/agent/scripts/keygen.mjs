// One-time: create the Ed25519 key that signs agent updates.
//
//   npm run keygen -w @eagle/agent
//
// Writes the PRIVATE key to KEY_PATH (outside the repo) and the PUBLIC key into
// src/update-key.ts, which is compiled into every agent. Refuses to overwrite an
// existing key: agents only trust the key they were built with, so replacing it
// means every PC needs a manual reinstall to pick up the new one.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { KEY_PATH, PUBLIC_KEY_FILE } from "./release-key.mjs";

if (existsSync(KEY_PATH)) {
  console.error(`A signing key already exists at ${KEY_PATH}.`);
  console.error("Refusing to replace it — installed agents only trust that key.");
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
mkdirSync(dirname(KEY_PATH), { recursive: true });
writeFileSync(KEY_PATH, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });

const pem = publicKey.export({ type: "spki", format: "pem" }).trim();
writeFileSync(
  PUBLIC_KEY_FILE,
  `// Public half of the agent release-signing key (see scripts/keygen.mjs).
// The updater refuses any release manifest this key doesn't verify. The private
// half lives only on the release machine — never in the repo or on the server.
export const UPDATE_PUBLIC_KEY = \`${pem}\`;
`,
);

console.log(`Private key: ${KEY_PATH}`);
console.log("  → back this up somewhere safe (password manager / offline drive).");
console.log("  → never commit it and never copy it to the server.");
console.log("Public key written to src/update-key.ts — commit that file.");
