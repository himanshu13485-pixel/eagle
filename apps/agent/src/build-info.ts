declare const __AGENT_BUILD__: number | undefined;

/**
 * Build number of this binary — Unix seconds at build time, injected by
 * scripts/build-exe.mjs through esbuild's --define. The updater only ever moves
 * to a HIGHER build, so a server replaying an old (validly signed) release
 * can't roll a PC back to a version with known bugs.
 *
 * 0 when running from source (ts-node), which also keeps the updater off.
 */
export const AGENT_BUILD: number = typeof __AGENT_BUILD__ !== "undefined" ? __AGENT_BUILD__ : 0;
