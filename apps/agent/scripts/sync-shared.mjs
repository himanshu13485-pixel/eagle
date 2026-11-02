/**
 * Copies the few modules the agent shares with the server into src/.
 *
 * The agent is deliberately not a @eagle/shared dependant — it is bundled and
 * installed on its own, and api.ts keeps its own copy of AgentConfig for that
 * reason. But the monitoring-window arithmetic cannot simply be rewritten here:
 * if the agent and the server disagree about whether it is 17:01, the agent
 * either captures when it must not or sits out a whole shift, and nothing in
 * either codebase would look wrong.
 *
 * So the server's copy stays canonical and this regenerates the agent's from
 * it. It runs before every build and bundle, so a drifted copy cannot ship.
 * The generated files are committed so `npm start` (ts-node) works without it.
 *
 * Only dependency-free modules can be copied this way; the check below fails
 * loudly rather than emitting a file with unresolvable imports.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const agentSrc = resolve(here, "..", "src");
const sharedSrc = resolve(here, "..", "..", "..", "packages", "shared", "src");

const MODULES = ["work-window.ts"];

const BANNER = (name) =>
  `// GENERATED FILE — DO NOT EDIT.\n` +
  `// Copied from packages/shared/src/${name} by scripts/sync-shared.mjs.\n` +
  `// Edit the shared copy; this one is regenerated on every build.\n\n`;

let changed = 0;
for (const name of MODULES) {
  const source = readFileSync(join(sharedSrc, name), "utf8");

  // A copied module has to stand alone: the agent has no @eagle/shared and no
  // matching relative paths, so any import here would resolve to nothing.
  const imports = source.match(/^\s*import\s.+$/gm);
  if (imports) {
    console.error(`sync-shared: ${name} has imports and cannot be copied:\n  ${imports.join("\n  ")}`);
    process.exit(1);
  }

  const out = join(agentSrc, name);
  const next = BANNER(name) + source;
  const prev = (() => {
    try {
      return readFileSync(out, "utf8");
    } catch {
      return null;
    }
  })();

  if (prev !== next) {
    writeFileSync(out, next);
    changed++;
    console.log(`sync-shared: refreshed src/${name}`);
  }
}

if (!changed) console.log(`sync-shared: ${MODULES.length} module(s) already current`);
