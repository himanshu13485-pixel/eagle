// Sign the freshly built agent so installed agents will accept it as an update.
//
//   npm run build:exe -w @eagle/agent
//   npm run sign -w @eagle/agent
//
// Produces dist-bin/<binary>.manifest.json. Upload it next to the binary; the
// server hands it out as-is and needs no key of its own.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KEY_PATH, PUBLIC_KEY_FILE } from "./release-key.mjs";

const dir = "dist-bin";
const infoPath = join(dir, "build-info.json");
if (!existsSync(infoPath)) {
  console.error("No dist-bin/build-info.json — run `npm run build:exe` first.");
  process.exit(1);
}
const info = JSON.parse(readFileSync(infoPath, "utf8"));
const binPath = join(dir, info.file);
if (!existsSync(binPath)) {
  console.error(`Built binary ${binPath} is missing — rebuild it.`);
  process.exit(1);
}
if (!existsSync(KEY_PATH)) {
  console.error(`No signing key at ${KEY_PATH}. Set WORKK_SIGNING_KEY or run \`npm run keygen\` (first time only).`);
  process.exit(1);
}

const bin = readFileSync(binPath);
const payload = JSON.stringify({
  os: info.os,
  build: info.build,
  sha256: createHash("sha256").update(bin).digest("hex"),
  size: bin.length,
});
const signature = sign(null, Buffer.from(payload, "utf8"), createPrivateKey(readFileSync(KEY_PATH))).toString("base64");

// Check against the public key the agents are actually built with, so a key
// mix-up fails here instead of silently on every PC.
const embedded = /`(-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----)`/.exec(readFileSync(PUBLIC_KEY_FILE, "utf8"))?.[1];
if (!embedded || !verify(null, Buffer.from(payload, "utf8"), createPublicKey(embedded), Buffer.from(signature, "base64"))) {
  console.error("This key does not match the public key compiled into the agent (src/update-key.ts). Not signing.");
  process.exit(1);
}

const out = `${binPath}.manifest.json`;
writeFileSync(out, JSON.stringify({ payload, signature }, null, 2));
console.log(`✓ Signed build ${info.build} (${(bin.length / 1e6).toFixed(1)} MB) → ${out}`);
