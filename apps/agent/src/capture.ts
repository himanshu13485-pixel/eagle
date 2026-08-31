import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, unlink, mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";

const pexec = promisify(execFile);

const AGENT_DIR = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "EagleAgent");
const CAPTURE_PS1 = join(AGENT_DIR, "capture3.ps1");
const FFMPEG = join(AGENT_DIR, "ffmpeg.exe");

// ---- Screen capture via a trusted on-disk PS1 (see Defender note) ----
// Supports: -Monitor (-1 = whole virtual desktop / all monitors; 0..N = a single monitor),
// -MaxWidth (used for live frames so 4K / multi-monitor setups stream at a fraction of the
// bytes) and -MaxHeight (the stored-screenshot cap — 1080 by default, so a 4K monitor
// doesn't cost 4x the storage of a full-HD one). 0 means "no cap" for either.
// Both are applied together: the image is scaled by whichever is more restrictive, so
// aspect ratio holds and a 3840x1080 dual-monitor desktop is left alone at MaxHeight 1080.
const CAPTURE_SCRIPT = `param([string]$Out,[int]$Quality=70,[int]$Monitor=-1,[int]$MaxWidth=0,[int]$MaxHeight=0)
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
if ($Monitor -ge 0) {
  $screens=[System.Windows.Forms.Screen]::AllScreens
  if ($Monitor -lt $screens.Length) { $b=$screens[$Monitor].Bounds } else { $b=[System.Windows.Forms.SystemInformation]::VirtualScreen }
} else { $b=[System.Windows.Forms.SystemInformation]::VirtualScreen }
$src=New-Object System.Drawing.Bitmap $b.Width,$b.Height
$g=[System.Drawing.Graphics]::FromImage($src)
$g.CopyFromScreen($b.X,$b.Y,0,0,(New-Object System.Drawing.Size($b.Width,$b.Height)))
$g.Dispose()
$img=$src
$scale=1.0
if ($MaxWidth -gt 0 -and $b.Width -gt $MaxWidth) { $scale=[Math]::Min($scale,$MaxWidth/$b.Width) }
if ($MaxHeight -gt 0 -and $b.Height -gt $MaxHeight) { $scale=[Math]::Min($scale,$MaxHeight/$b.Height) }
if ($scale -lt 1.0) {
  $nw=[int]($b.Width*$scale); $nh=[int]($b.Height*$scale)
  if ($nw -lt 1) { $nw=1 }
  if ($nh -lt 1) { $nh=1 }
  $dst=New-Object System.Drawing.Bitmap $nw,$nh
  $g2=[System.Drawing.Graphics]::FromImage($dst)
  $g2.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.DrawImage($src,0,0,$nw,$nh)
  $g2.Dispose(); $src.Dispose(); $img=$dst
}
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object{$_.MimeType -eq 'image/jpeg'}|Select-Object -First 1
$p=New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]$Quality)
$img.Save($Out,$enc,$p)
$img.Dispose()
`;

async function ensureScript(): Promise<void> {
  // capture2.ps1 = the versioned (monitor + downscale) script; always (re)write so upgraded
  // agents replace any older capture.ps1 that lacks the new params.
  await mkdir(AGENT_DIR, { recursive: true }).catch(() => {});
  if (!existsSync(CAPTURE_PS1)) await writeFile(CAPTURE_PS1, CAPTURE_SCRIPT, "utf8");
}

interface CaptureOpts { monitor?: number; maxWidth?: number; maxHeight?: number; quality?: number }

async function captureScreen(opts: CaptureOpts = {}): Promise<Buffer> {
  const monitor = opts.monitor ?? -1;
  const quality = opts.quality ?? 70;
  const maxWidth = opts.maxWidth ?? 0;
  const maxHeight = opts.maxHeight ?? 0;
  const out = join(tmpdir(), `eagle_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  if (process.platform === "darwin") {
    // macOS: needs Screen Recording permission. -D <n> selects a display (1-based).
    const args = ["-x", "-t", "jpg"];
    if (monitor >= 0) args.push("-D", String(monitor + 1));
    args.push(out);
    await pexec("screencapture", args, { timeout: 15000 });
    if (maxHeight > 0) await downscaleMac(out, maxHeight);
    const buf = await readFile(out);
    unlink(out).catch(() => {});
    return buf;
  }
  await ensureScript();
  await pexec(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", CAPTURE_PS1,
      "-Out", out, "-Quality", String(quality), "-Monitor", String(monitor),
      "-MaxWidth", String(maxWidth), "-MaxHeight", String(maxHeight)],
    { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
  );
  const buf = await readFile(out);
  unlink(out).catch(() => {});
  return buf;
}

/** macOS has no scaling option on `screencapture`, so resize in place with sips.
 *  Only shrinks: sips --resampleHeight would enlarge a shorter screen. */
async function downscaleMac(path: string, maxHeight: number): Promise<void> {
  try {
    const { stdout } = await pexec("sips", ["-g", "pixelHeight", path], { timeout: 8000 });
    const h = parseInt((stdout.match(/pixelHeight:\s*(\d+)/) ?? [])[1] ?? "0", 10);
    if (h > maxHeight) await pexec("sips", ["--resampleHeight", String(maxHeight), path], { timeout: 15000 });
  } catch {
    /* leave the capture at native size rather than losing it */
  }
}

/** Downscaled single-monitor capture for live streaming (small + cheap for 4K / multi-monitor). */
export async function captureLive(monitor = 0, maxWidth = 1600, quality = 55): Promise<Buffer> {
  return captureScreen({ monitor, maxWidth, quality });
}

/** Number of physical monitors (for the live-view monitor picker). */
export async function getMonitorCount(): Promise<number> {
  if (process.platform !== "win32") return 1;
  try {
    const { stdout } = await pexec(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName System.Windows.Forms; ([System.Windows.Forms.Screen]::AllScreens).Length"],
      { windowsHide: true, timeout: 8000 },
    );
    const n = parseInt(stdout.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

/**
 * Optional webcam snapshot, composited into the screenshot's corner.
 * Runs ONLY when the org's "Webcam Photos" setting is enabled (opt-in, disclosed) —
 * gated by the caller via `withWebcam`. Uses a bundled ffmpeg (fetched on demand).
 */
let serverUrl = "";
export function setServerUrl(u: string) {
  serverUrl = u;
}

async function ensureFfmpeg(): Promise<boolean> {
  if (existsSync(FFMPEG)) return true;
  if (!serverUrl) return false;
  try {
    const res = await fetch(`${serverUrl}/api/agent/ffmpeg`);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(AGENT_DIR, { recursive: true });
    await writeFile(FFMPEG, buf);
    return true;
  } catch {
    return false;
  }
}

// ffmpeg's -list_devices exits non-zero, so read stderr regardless of exit code.
function ffStderr(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(FFMPEG, args, { windowsHide: true, timeout: 12000 }, (_e, _o, stderr) => resolve(stderr || ""));
  });
}

let cachedCamera: string | null | undefined;
async function findCamera(): Promise<string | null> {
  if (cachedCamera !== undefined) return cachedCamera;
  const out = await ffStderr(["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"]);
  const m = out.match(/"([^"]+)"\s*\(video\)/);
  cachedCamera = m ? m[1] : null;
  return cachedCamera;
}

async function captureWebcamFile(): Promise<string | null> {
  const cam = await findCamera();
  if (!cam) return null;
  const out = join(tmpdir(), `eaglecam_${Date.now()}.jpg`);
  try {
    await pexec(
      FFMPEG,
      ["-hide_banner", "-loglevel", "error", "-f", "dshow", "-rtbufsize", "64M",
        "-i", `video=${cam}`, "-frames:v", "1", "-q:v", "6", "-y", out],
      { windowsHide: true, timeout: 15000 },
    );
    return existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

async function composite(screen: Buffer, webcamPath: string): Promise<Buffer> {
  const scr = join(tmpdir(), `eaglescr_${Date.now()}.jpg`);
  const out = join(tmpdir(), `eaglecomp_${Date.now()}.jpg`);
  await writeFile(scr, screen);
  try {
    await pexec(
      FFMPEG,
      ["-hide_banner", "-loglevel", "error", "-i", scr, "-i", webcamPath,
        "-filter_complex", "[1:v]scale=240:-1[wc];[0:v][wc]overlay=W-w-16:H-h-16",
        "-q:v", "5", "-y", out],
      { windowsHide: true, timeout: 15000 },
    );
    return await readFile(out);
  } finally {
    unlink(scr).catch(() => {});
    unlink(out).catch(() => {});
    unlink(webcamPath).catch(() => {});
  }
}

// After repeated webcam failures (no camera, or a security suite blocking ffmpeg's
// camera access) stop attempting for this process lifetime — otherwise every capture
// re-triggers the AV webcam prompt and adds a multi-second stall.
let webcamFailures = 0;
let webcamGaveUp = false;
const WEBCAM_MAX_FAILURES = 3;

/** Screenshot, with the webcam snapshot overlaid in the corner when enabled. */
export async function captureJpeg(withWebcam = false, maxHeight = 1080): Promise<Buffer> {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    throw new Error("Screen capture is implemented for Windows and macOS only");
  }
  const screen = await captureScreen({ maxHeight });
  // Webcam overlay is Windows-only for now (macOS uses a different capture path).
  if (!withWebcam || process.platform !== "win32" || webcamGaveUp) return screen;
  if (!(await ensureFfmpeg())) return screen;
  const cam = await captureWebcamFile();
  if (!cam) {
    if (++webcamFailures >= WEBCAM_MAX_FAILURES) {
      webcamGaveUp = true;
      console.warn("[capture] webcam unavailable (no camera or blocked by security software) — sending screen only from now on");
    }
    return screen;
  }
  webcamFailures = 0;
  try {
    return await composite(screen, cam);
  } catch {
    return screen; // fall back to plain screenshot on any webcam/composite error
  }
}
