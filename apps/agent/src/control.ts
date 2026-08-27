/**
 * Visible-mode control surface. When the org runs the agent in VISIBLE ("Regular")
 * mode, the employee gets a Windows system-tray icon with Clock In / Pause / Clock Out.
 *
 * The tray (a tiny WinForms PowerShell app — no native Node deps) talks to a
 * loopback-only HTTP server the agent hosts on 127.0.0.1. In RESTRICTED ("Silent")
 * mode none of this runs and the agent stays fully hidden.
 */
import { createServer, type Server } from "http";
import { execFile, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const AGENT_DIR = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "EagleAgent");
export const CONTROL_PORT = 47615;

export type ControlCmd = "clock-in" | "clock-out" | "pause" | "resume";
export interface ControlState {
  working: boolean;
  mode: string;
  employeeName: string | null;
  trackedTodaySec: number;
}

// WinForms tray app: shows status + Clock In / Pause / Clock Out, polling the local server.
const TRAY_PS1 = `param([int]$Port)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$script:base = "http://127.0.0.1:$Port"
function Get-St { try { Invoke-RestMethod -Uri "$script:base/status" -TimeoutSec 3 } catch { $null } }
function Send-Cmd([string]$c) { try { Invoke-RestMethod -Uri "$script:base/$c" -Method Post -TimeoutSec 3 | Out-Null } catch {} }

$ni = New-Object System.Windows.Forms.NotifyIcon
$ni.Icon = [System.Drawing.SystemIcons]::Application
$ni.Text = "Workk"
$ni.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miStat = New-Object System.Windows.Forms.ToolStripMenuItem("Workk: connecting..."); $miStat.Enabled = $false
$menu.Items.Add($miStat) | Out-Null
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$miIn = New-Object System.Windows.Forms.ToolStripMenuItem("Clock In"); $miIn.add_Click({ Send-Cmd "clock-in" }); $menu.Items.Add($miIn) | Out-Null
$miPause = New-Object System.Windows.Forms.ToolStripMenuItem("Pause"); $miPause.add_Click({ Send-Cmd "pause" }); $menu.Items.Add($miPause) | Out-Null
$miOut = New-Object System.Windows.Forms.ToolStripMenuItem("Clock Out"); $miOut.add_Click({ Send-Cmd "clock-out" }); $menu.Items.Add($miOut) | Out-Null
$ni.ContextMenuStrip = $menu

$script:fails = 0
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 4000
$timer.add_Tick({
  $s = Get-St
  if ($null -ne $s) {
    $script:fails = 0
    $state = if ($s.working) { "Working" } else { "Paused" }
    $mins = [int]($s.trackedTodaySec / 60)
    $miStat.Text = "Workk: $state - $mins min today"
    $ni.Text = "Workk - $state"
    $miIn.Enabled = -not $s.working
    $miPause.Enabled = $s.working
    $miOut.Enabled = $s.working
  } else {
    $script:fails++
    $miStat.Text = "Workk: connecting..."
    # Agent stopped/switched to silent mode → remove the tray icon and exit.
    if ($script:fails -ge 8) { $ni.Visible = $false; $ni.Dispose(); [System.Windows.Forms.Application]::Exit() }
  }
})
$timer.Start()
[System.Windows.Forms.Application]::Run((New-Object System.Windows.Forms.ApplicationContext))
`;

export class Control {
  private server?: Server;
  private tray?: ChildProcess;

  constructor(
    private readonly getState: () => ControlState,
    private readonly onCmd: (cmd: ControlCmd) => void,
  ) {}

  get active() {
    return !!this.server;
  }

  start() {
    if (this.server) return;
    this.server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      const url = (req.url || "").split("?")[0];
      if (req.method === "GET" && url === "/status") {
        res.end(JSON.stringify(this.getState()));
        return;
      }
      if (req.method === "POST") {
        const cmd = url.slice(1) as ControlCmd;
        if (cmd === "clock-in" || cmd === "clock-out" || cmd === "pause" || cmd === "resume") {
          this.onCmd(cmd);
          res.end(JSON.stringify(this.getState()));
          return;
        }
      }
      res.statusCode = 404;
      res.end("{}");
    });
    this.server.on("error", (e: any) => console.error("[control]", e.message));
    // 127.0.0.1 only — never reachable off the machine.
    this.server.listen(CONTROL_PORT, "127.0.0.1", () => console.log(`[control] visible mode on 127.0.0.1:${CONTROL_PORT}`));
    this.spawnTray();
  }

  stop() {
    if (this.tray) {
      try { this.tray.kill(); } catch { /* ignore */ }
      this.tray = undefined;
    }
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }

  private spawnTray() {
    if (process.platform !== "win32") return; // tray UI is Windows-only for now
    try {
      mkdirSync(AGENT_DIR, { recursive: true });
      const ps1 = join(AGENT_DIR, "tray.ps1");
      writeFileSync(ps1, TRAY_PS1, "utf8");
      this.tray = execFile(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", ps1, String(CONTROL_PORT)],
        { windowsHide: true },
      );
      this.tray.on("error", (e) => console.error("[tray]", e.message));
    } catch (e: any) {
      console.error("[tray]", e.message);
    }
  }
}
