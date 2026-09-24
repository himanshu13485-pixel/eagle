import { createServer, type Server } from "net";
import { execFile } from "child_process";
import { existsSync, writeFileSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { tmpdir, userInfo } from "os";

/**
 * Keeps the Windows agent running.
 *
 * The agent used to be started once, at logon, by a scheduled task made with
 * plain `schtasks /SC ONLOGON`. Two things then left a PC "Offline" until the
 * next logon:
 *   - if the process died for any reason, nothing started it again;
 *   - Windows' defaults for such a task skip it on battery power ("start only
 *     if on AC power"), so a laptop unplugged at logon never started the agent.
 *
 * The task is now registered from XML: logon trigger plus a 5-minute repeating
 * trigger, allowed on battery. Each repeat just re-runs the hidden launcher;
 * the single-instance lock below makes that a no-op while the agent is alive.
 *
 * macOS (launchd KeepAlive) and Linux (systemd Restart=always) already restart
 * the agent, so this is Windows-only.
 */

export const TASK_NAME = "EagleAgent";
// Present in the task's description; lets a running agent tell whether its
// autostart task is already the current kind, so it only rewrites it once.
const TASK_MARKER = "workk-autostart-v2";

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** DOMAIN\user of this process, as Task Scheduler wants it. */
export function currentUserId(): string {
  const user = process.env.USERNAME || userInfo().username;
  const domain = process.env.USERDOMAIN;
  return domain ? `${domain}\\${user}` : user;
}

export function taskXml(opts: { launcherPath: string; userId: string; runLevel?: "HighestAvailable" | "LeastPrivilege" }): string {
  const user = xmlEscape(opts.userId);
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Workk monitoring agent: starts at logon and is restarted within 5 minutes if it stops. ${TASK_MARKER}</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${user}</UserId>
    </LogonTrigger>
    <TimeTrigger>
      <Repetition>
        <Interval>PT5M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>2024-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${user}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>${opts.runLevel ?? "HighestAvailable"}</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>"${xmlEscape(opts.launcherPath)}"</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

function run(cmd: string, args: string[], timeout = 15000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as any).code === "number" ? (err as any).code : 1) : 0;
      resolve({ code, out: `${stdout ?? ""}${stderr ?? ""}` });
    });
  });
}

/** Create or replace the autostart task. Resolves true on success. */
export async function registerTask(opts: {
  launcherPath: string;
  taskName?: string;
  userId?: string;
  runLevel?: "HighestAvailable" | "LeastPrivilege";
}): Promise<{ ok: boolean; out: string }> {
  const xml = taskXml({ launcherPath: opts.launcherPath, userId: opts.userId ?? currentUserId(), runLevel: opts.runLevel });
  const file = join(tmpdir(), `workk-task-${process.pid}-${Date.now()}.xml`);
  // schtasks reads task XML reliably only as UTF-16 with a BOM.
  writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, "utf16le")]));
  try {
    const r = await run("schtasks", ["/Create", "/TN", opts.taskName ?? TASK_NAME, "/XML", file, "/F"]);
    return { ok: r.code === 0, out: r.out.trim() };
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}

/** The hidden launcher the installer writes next to the exe. */
export function launcherFor(exePath: string): string {
  return join(dirname(exePath), "launch.vbs");
}

/**
 * Called by a running agent: bring an old-style autostart task (installed
 * before this fix) up to date. Needs the rights the task runs with; if the
 * rewrite is refused the agent still runs, it just keeps the old task.
 */
export async function repairAutostart(exePath: string, log = console.log): Promise<void> {
  const launcher = launcherFor(exePath);
  if (!existsSync(launcher)) return; // not an installed agent (dev run)
  const q = await run("schtasks", ["/Query", "/TN", TASK_NAME, "/XML"]);
  if (q.code === 0 && q.out.includes(TASK_MARKER)) return; // already current
  const r = await registerTask({ launcherPath: launcher });
  log(r.ok ? "[watchdog] autostart task updated (restart-if-stopped, runs on battery)" : `[watchdog] could not update autostart task: ${r.out}`);
}

let lock: Server | null = null;

/**
 * One agent per Windows user. The 5-minute task re-runs the launcher even while
 * the agent is up, and an update briefly overlaps the old and new process, so a
 * second copy waits a little for the lock and otherwise bows out.
 */
export async function acquireSingleInstance(waitMs = 30_000): Promise<boolean> {
  const name = `\\\\.\\pipe\\workk-agent-${(process.env.USERNAME || userInfo().username).replace(/[^A-Za-z0-9_.-]/g, "_")}`;
  const deadline = Date.now() + waitMs;
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const srv = createServer((sock) => sock.destroy());
      srv.once("error", () => resolve(false));
      srv.listen(name, () => {
        lock = srv;
        resolve(true);
      });
    });
    if (ok) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
