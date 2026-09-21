// Builds a standalone agent binary via Node SEA — reuses the locally installed
// node (no base-binary download / C++ toolchain). Cross-platform: run it on
// Windows to get eagle-agent.exe, on macOS to get an eagle-agent mach-O binary.
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const dir = "dist-bin";
mkdirSync(dir, { recursive: true });
const run = (cmd) => execSync(cmd, { stdio: "inherit" });

// Build number = Unix seconds. The updater only moves to a higher build, so
// this is what makes "newer" mean something (and blocks rollback replays).
const build = Math.floor(Date.now() / 1000);

console.log(`1/4  bundling with esbuild… (build ${build})`);
run(
  `npx esbuild src/index.ts --bundle --platform=node --target=node20 --format=cjs ` +
    `--define:__AGENT_BUILD__=${build} ` +
    `--outfile=${dir}/agent-bundle.cjs --external:bufferutil --external:utf-8-validate`,
);

console.log("2/4  generating SEA blob…");
writeFileSync(
  join(dir, "sea-config.json"),
  JSON.stringify(
    { main: `${dir}/agent-bundle.cjs`, output: `${dir}/sea-prep.blob`, disableExperimentalSEAWarning: true },
    null,
    2,
  ),
);
run(`node --experimental-sea-config ${dir}/sea-config.json`);

const outName = isWin ? "eagle-agent.exe" : "eagle-agent";
const exe = join(dir, outName);
console.log(`3/4  copying node → ${outName}…`);
copyFileSync(process.execPath, exe);
if (isMac) {
  // The Node installer from nodejs.org is a universal (arm64 + x86_64) binary.
  // Each slice carries its own copy of the SEA fuse, so postject finds the
  // sentinel twice and refuses ("Multiple occurences of sentinel"). Thin it to
  // this machine's architecture first. `ditto` ships with macOS itself —
  // `lipo` would need the Xcode command-line tools, which a fresh Mac lacks.
  // On an already single-arch node (e.g. the GitHub runner's) this is a copy.
  const arch = process.arch === "arm64" ? "arm64" : "x86_64";
  run(`ditto --arch ${arch} "${exe}" "${exe}.thin"`);
  run(`mv -f "${exe}.thin" "${exe}"`);
  run(`codesign --remove-signature "${exe}"`); // postject invalidates the signature
}

console.log("4/4  injecting SEA blob (postject)…");
const seg = isMac ? " --macho-segment-name NODE_SEA" : "";
run(
  `npx postject "${exe}" NODE_SEA_BLOB ${dir}/sea-prep.blob ` +
    `--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2${seg}`,
);
if (isMac) {
  run(`chmod +x "${exe}"`);
  run(`codesign --sign - "${exe}"`); // ad-hoc sign so macOS will run it (notarize with a real cert for distribution)
}

if (!existsSync(exe)) throw new Error(`${outName} was not produced`);
// Read by scripts/sign.mjs so the signed manifest names the right build.
writeFileSync(
  join(dir, "build-info.json"),
  JSON.stringify({ build, os: isWin ? "win" : isMac ? "mac" : "linux", file: outName }, null, 2),
);
console.log(`\n✓ Built ${exe} (${(statSync(exe).size / 1e6).toFixed(1)} MB)`);
