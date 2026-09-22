/**
 * Linux support for the agent: screen capture, foreground app, idle time.
 *
 * Linux desktops vary wildly, so nothing is assumed — every external tool is
 * probed at runtime and the first available one wins. The happy path is X11
 * with ImageMagick (one command captures, downscales and JPEG-encodes) plus
 * xdotool/xprop for the active window and xprintidle for idle. Wayland locks
 * most of this down, so it is best-effort: grim can still capture on wlroots
 * compositors, but the active window and idle usually come back empty.
 *
 * The pure helpers (session detection, command building, output parsing) are
 * exported and unit-tested; the parts that shell out can only be verified on a
 * real Linux desktop.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const pexec = promisify(execFile);

/** X11 tools need a display to talk to; a systemd user service often starts
 *  without DISPLAY set, so default it to the primary seat. */
function guiEnv(): NodeJS.ProcessEnv {
  return { ...process.env, DISPLAY: process.env.DISPLAY || ":0" };
}

// ---------- tool availability (cached; names come from fixed lists) ----------
const toolCache = new Map<string, boolean>();
export async function hasTool(bin: string): Promise<boolean> {
  const hit = toolCache.get(bin);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    // `command -v` is a shell builtin, so go through sh. `which` isn't on every box.
    const { stdout } = await pexec("/bin/sh", ["-c", `command -v ${bin} 2>/dev/null`], { timeout: 4000 });
    ok = !!stdout.trim();
  } catch {
    ok = false;
  }
  toolCache.set(bin, ok);
  return ok;
}
/** Test seam. */
export function __setTool(bin: string, present: boolean) {
  toolCache.set(bin, present);
}

// ---------- session ----------
export function sessionType(env: NodeJS.ProcessEnv = process.env): "wayland" | "x11" {
  if ((env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland") return "wayland";
  if (env.WAYLAND_DISPLAY) return "wayland";
  return "x11";
}

// ---------- screen capture ----------
export interface GrabPlan {
  bin: string;
  args: string[];
  ext: "jpg" | "png";
  /** Whether this tool already applied the height cap + JPEG encode itself. */
  normalized: boolean;
}

const X11_GRABBERS = ["import", "scrot", "maim", "gnome-screenshot", "spectacle"];
const WAYLAND_GRABBERS = ["grim", "spectacle", "gnome-screenshot"];

/** Build the capture command for a tool. Pure, so it's unit-tested. */
export function planGrab(tool: string, out: string, maxHeight: number, quality: number): GrabPlan | null {
  switch (tool) {
    case "import": {
      // ImageMagick: capture root window, cap height (only shrink, never enlarge
      // — the trailing '>'), JPEG-encode, all in one.
      const args = ["-window", "root", "-silent"];
      if (maxHeight > 0) args.push("-resize", `x${maxHeight}>`);
      args.push("-quality", String(quality), out);
      return { bin: "import", args, ext: "jpg", normalized: true };
    }
    case "scrot":
      return { bin: "scrot", args: ["-o", "-q", String(quality), out], ext: "jpg", normalized: false };
    case "maim":
      return { bin: "maim", args: ["-u", out], ext: "jpg", normalized: false };
    case "grim":
      return { bin: "grim", args: [out], ext: "png", normalized: false };
    case "gnome-screenshot":
      return { bin: "gnome-screenshot", args: ["-f", out], ext: "png", normalized: false };
    case "spectacle":
      return { bin: "spectacle", args: ["-b", "-n", "-o", out], ext: "png", normalized: false };
    default:
      return null;
  }
}

/** ImageMagick convert command to normalize a capture to height-capped JPEG. */
export function planConvert(src: string, dst: string, maxHeight: number, quality: number): string[] {
  const a = [src];
  if (maxHeight > 0) a.push("-resize", `x${maxHeight}>`);
  a.push("-quality", String(quality), dst);
  return a;
}

export async function captureLinux(maxHeight: number, quality: number): Promise<Buffer> {
  const order = sessionType() === "wayland" ? WAYLAND_GRABBERS : X11_GRABBERS;
  let tool: string | null = null;
  for (const t of order) {
    if (await hasTool(t)) { tool = t; break; }
  }
  if (!tool) {
    throw new Error(
      `no screenshot tool found — install one of: ${order.join(", ")} ` +
        `(e.g. 'sudo apt install imagemagick', or 'grim' on Wayland)`,
    );
  }

  const stem = join(tmpdir(), `eagle_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const plan = planGrab(tool, `${stem}.${(planGrab(tool, "x", 0, 0) as GrabPlan).ext}`, maxHeight, quality)!;
  const raw = plan.args[plan.args.length - 1];
  await pexec(plan.bin, plan.args, { timeout: 15000, env: guiEnv(), maxBuffer: 4 * 1024 * 1024 });

  // Already a height-capped JPEG (ImageMagick import) → done.
  if (plan.normalized) {
    const buf = await readFile(raw);
    unlink(raw).catch(() => {});
    return buf;
  }

  // Otherwise normalize with ImageMagick if present: PNG→JPEG and/or downscale.
  const needsWork = plan.ext === "png" || maxHeight > 0;
  if (needsWork && (await hasTool("convert"))) {
    const jpg = `${stem}.norm.jpg`;
    await pexec("convert", planConvert(raw, jpg, maxHeight, quality), { timeout: 15000 });
    unlink(raw).catch(() => {});
    const buf = await readFile(jpg);
    unlink(jpg).catch(() => {});
    return buf;
  }

  // No converter available: send what we grabbed (a full-size JPEG from scrot/maim,
  // or a PNG the dashboard's <img> will still render).
  const buf = await readFile(raw);
  unlink(raw).catch(() => {});
  return buf;
}

// ---------- foreground window ----------
export interface Foreground {
  app: string | null;
  title: string | null;
}

/** The X11 window id in `xprop -root _NET_ACTIVE_WINDOW` output. */
export function parseActiveId(xpropRoot: string): string | null {
  const m = xpropRoot.match(/0x[0-9a-f]+/i);
  return m ? m[0] : null;
}

/** App name from a window's `WM_CLASS`: the last quoted string is the instance
 *  class (e.g. `"Navigator", "firefox"` → `firefox`), lower-cased so the
 *  category rules match it the same as Windows' `chrome`. */
export function parseWmClass(xprop: string): string | null {
  const line = xprop.match(/WM_CLASS\([^)]*\)\s*=\s*(.+)/);
  if (!line) return null;
  const quoted = line[1].match(/"((?:[^"\\]|\\.)*)"/g);
  if (!quoted?.length) return null;
  const cls = quoted[quoted.length - 1].slice(1, -1).replace(/\\"/g, '"');
  return cls.trim().toLowerCase() || null;
}

/** Window title from `_NET_WM_NAME` (preferred) or `WM_NAME`. */
export function parseWmName(xprop: string): string | null {
  const m =
    xprop.match(/_NET_WM_NAME\([^)]*\)\s*=\s*"((?:[^"\\]|\\.)*)"/) ||
    xprop.match(/WM_NAME\([^)]*\)\s*=\s*"((?:[^"\\]|\\.)*)"/);
  return m ? m[1].replace(/\\"/g, '"') : null;
}

async function foregroundX11(): Promise<Foreground> {
  const env = guiEnv();
  if (await hasTool("xprop")) {
    try {
      const { stdout: root } = await pexec("xprop", ["-root", "_NET_ACTIVE_WINDOW"], { timeout: 5000, env });
      const id = parseActiveId(root);
      if (id) {
        const { stdout } = await pexec("xprop", ["-id", id, "WM_CLASS", "_NET_WM_NAME", "WM_NAME"], { timeout: 5000, env });
        return { app: parseWmClass(stdout), title: parseWmName(stdout) };
      }
    } catch {
      /* fall through */
    }
  }
  if (await hasTool("xdotool")) {
    try {
      const { stdout: id } = await pexec("xdotool", ["getactivewindow"], { timeout: 5000, env });
      const wid = id.trim();
      if (wid) {
        const [cls, name] = await Promise.all([
          pexec("xdotool", ["getwindowclassname", wid], { timeout: 5000, env }).then((r) => r.stdout).catch(() => ""),
          pexec("xdotool", ["getwindowname", wid], { timeout: 5000, env }).then((r) => r.stdout).catch(() => ""),
        ]);
        return { app: cls.trim().toLowerCase() || null, title: name.trim() || null };
      }
    } catch {
      /* fall through */
    }
  }
  return { app: null, title: null };
}

async function foregroundWayland(): Promise<Foreground> {
  // sway/i3 expose the focused window; other compositors generally don't, so
  // this is the one Wayland case that works and everything else returns blank.
  if (await hasTool("swaymsg")) {
    try {
      const { stdout } = await pexec("swaymsg", ["-t", "get_tree"], { timeout: 5000, env: guiEnv(), maxBuffer: 8 * 1024 * 1024 });
      const focused = findFocused(JSON.parse(stdout));
      if (focused) {
        const app = (focused.app_id || focused.window_properties?.class || "").toLowerCase() || null;
        return { app, title: focused.name ?? null };
      }
    } catch {
      /* fall through */
    }
  }
  return { app: null, title: null };
}

/** Depth-first search for the `focused: true` node in a sway tree. Pure. */
export function findFocused(node: any): any | null {
  if (!node || typeof node !== "object") return null;
  if (node.focused === true) return node;
  for (const child of [...(node.nodes || []), ...(node.floating_nodes || [])]) {
    const f = findFocused(child);
    if (f) return f;
  }
  return null;
}

export function foregroundLinux(): Promise<Foreground> {
  return sessionType() === "wayland" ? foregroundWayland() : foregroundX11();
}

// ---------- idle ----------
/** Milliseconds string from xprintidle → whole seconds. Pure. */
export function parseIdleMs(stdout: string): number {
  const ms = parseInt(stdout.trim(), 10);
  return Number.isFinite(ms) && ms >= 0 ? Math.floor(ms / 1000) : 0;
}

export async function idleLinux(): Promise<number> {
  // No portable idle query exists on Wayland; report "active" rather than guess.
  if (sessionType() === "wayland") return 0;
  if (await hasTool("xprintidle")) {
    try {
      const { stdout } = await pexec("xprintidle", [], { timeout: 4000, env: guiEnv() });
      return parseIdleMs(stdout);
    } catch {
      return 0;
    }
  }
  return 0;
}
