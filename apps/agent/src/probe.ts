/**
 * Foreground app + idle detection.
 *
 * Windows: uses PowerShell + Win32 (GetForegroundWindow / GetWindowText / GetLastInputInfo)
 * so the agent needs no native addon or node-gyp build. macOS/Linux return safe defaults
 * for the first slice (extended with platform-native probes in a later phase).
 */
import { execFile } from "child_process";
import { promisify } from "util";

const pexec = promisify(execFile);

export interface ForegroundInfo {
  app: string | null; // process name, e.g. "chrome"
  title: string | null; // window title
  url: string | null; // best-effort website host parsed from browser titles
}

const PS_FOREGROUND = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
}
"@
$h = [W]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 1024
[void][W]::GetWindowText($h, $sb, 1024)
$pid2 = 0
[void][W]::GetWindowThreadProcessId($h, [ref]$pid2)
$proc = (Get-Process -Id $pid2 -ErrorAction SilentlyContinue).ProcessName
Write-Output ("{0}|{1}" -f $proc, $sb.ToString())
`;

// Compute idle-seconds entirely inside C# — reading the struct back in PowerShell
// after a [ref] P/Invoke is unreliable (dwTime stays 0 → "always idle"). Uint math
// also gives correct GetTickCount wraparound.
const PS_IDLE = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class EagleIdle {
  [StructLayout(LayoutKind.Sequential)]
  private struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")]
  private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static long Seconds() {
    LASTINPUTINFO lii = new LASTINPUTINFO();
    lii.cbSize = (uint)Marshal.SizeOf(lii);
    if (!GetLastInputInfo(ref lii)) return -1;
    uint idleMs = (uint)Environment.TickCount - lii.dwTime;
    return (long)(idleMs / 1000);
  }
}
"@
[EagleIdle]::Seconds()
`;

async function runPs(script: string): Promise<string> {
  const { stdout } = await pexec(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 8000 },
  );
  return stdout.trim();
}

export async function getForeground(): Promise<ForegroundInfo> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await pexec(
        "osascript",
        ["-e", 'tell application "System Events" to get name of first application process whose frontmost is true'],
        { timeout: 8000 },
      );
      return { app: stdout.trim() || null, title: null, url: null };
    } catch {
      return { app: null, title: null, url: null };
    }
  }
  if (process.platform !== "win32") return { app: null, title: null, url: null };
  try {
    const out = await runPs(PS_FOREGROUND);
    const [proc, ...rest] = out.split("|");
    const title = rest.join("|").trim() || null;
    return { app: proc?.trim() || null, title, url: hostFromTitle(proc, title) };
  } catch {
    return { app: null, title: null, url: null };
  }
}

export async function getIdleSeconds(): Promise<number> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await pexec("ioreg", ["-c", "IOHIDSystem"], {
        timeout: 8000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const m = stdout.match(/"HIDIdleTime"\s*=\s*(\d+)/);
      return m ? Math.floor(Number(m[1]) / 1e9) : 0; // ns → s
    } catch {
      return 0;
    }
  }
  if (process.platform !== "win32") return 0;
  try {
    const sec = Number(await runPs(PS_IDLE)); // C# already returns seconds
    return Number.isFinite(sec) && sec >= 0 ? sec : 0;
  } catch {
    return 0;
  }
}

const BROWSERS = ["chrome", "msedge", "firefox", "brave", "opera"];

/** Best-effort host extraction from browser window titles (no URL bar access without extensions). */
function hostFromTitle(proc: string | undefined, title: string | null): string | null {
  if (!proc || !title) return null;
  if (!BROWSERS.includes(proc.toLowerCase())) return null;
  const m = title.match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}
