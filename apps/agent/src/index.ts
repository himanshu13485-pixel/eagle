import { hostname, platform } from "os";
import { captureJpeg, setServerUrl } from "./capture";
import { EagleApi, type AgentConfig, type Presence } from "./api";
import { getForeground, getIdleSeconds } from "./probe";
import { loadConfig, saveConfig, type LocalConfig } from "./config";
import { connectLive } from "./live";
import { buffer } from "./buffer";
import { Control, type ControlCmd } from "./control";

const AGENT_VERSION = "0.1.0";
const TICK_MS = 5000;

function osPlatform(): "WINDOWS" | "MAC" | "LINUX" {
  const p = platform();
  if (p === "win32") return "WINDOWS";
  if (p === "darwin") return "MAC";
  return "LINUX";
}

const DEFAULT_CONFIG: AgentConfig = {
  periodicScreenshots: true,
  screenshotIntervalMin: 10,
  appSwitchScreenshots: true,
  appSwitchDelayMin: 1,
  webcamPhotos: false,
  idleAfterMin: 5,
  trackingMode: "VISIBLE",
  strictTimeTracking: true,
  heartbeatSec: 20,
};

class Agent {
  private cfg: AgentConfig = DEFAULT_CONFIG;
  private lastHeartbeat = 0;
  private lastApp: string | null = null;
  private lastUrl: string | null = null;
  private session: { type: "APP" | "WEB"; name: string; startedAt: Date; isIdle: boolean } | null = null;
  private nextPeriodicAt = 0;
  private lastAppSwitchAt = 0;
  // Visible ("Regular") mode: the employee can Clock In / Pause / Clock Out from a tray icon.
  private working = true;
  private trackedTodaySec = 0;
  private trackedDay = "";
  private control: Control;

  constructor(
    private readonly api: EagleApi,
    private readonly local: LocalConfig,
  ) {
    this.control = new Control(
      () => ({ working: this.working, mode: this.cfg.trackingMode, employeeName: null, trackedTodaySec: this.trackedTodaySec }),
      (cmd) => this.onControlCmd(cmd),
    );
  }

  private onControlCmd(cmd: ControlCmd) {
    const working = cmd === "clock-in" || cmd === "resume";
    if (this.working === working) return;
    this.working = working;
    console.log(`[control] employee ${working ? "clocked in / resumed" : cmd === "pause" ? "paused" : "clocked out"}`);
  }

  /** Start/stop the visible-mode tray + control server to match the server-driven trackingMode. */
  private syncControl() {
    const visible = this.cfg.trackingMode === "VISIBLE" && !this.cfg.paused;
    if (visible && !this.control.active) this.control.start();
    else if (!visible && this.control.active) this.control.stop();
  }

  async start() {
    console.log(`[eagle-agent] starting on ${hostname()} (${osPlatform()})`);
    await this.tick();
    setInterval(() => this.tick().catch((e) => console.error("[tick]", e.message)), TICK_MS);

    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      process.on(sig, () => this.shutdown().finally(() => process.exit(0)));
    }
  }

  private async tick() {
    const now = Date.now();

    // Dormant when deactivated (server) OR clocked-out/paused by the employee (visible mode):
    // no probes/captures/streaming, just a slow OFFLINE heartbeat.
    if (this.cfg.paused || !this.working) {
      if (now - this.lastHeartbeat >= this.cfg.heartbeatSec * 1000) {
        this.lastHeartbeat = now;
        try {
          const res = await this.api.heartbeat("OFFLINE", null, null);
          if (res.config) this.cfg = res.config;
          this.syncControl();
        } catch {
          /* offline — will retry */
        }
      }
      return;
    }

    // Roll the "tracked today" counter (visible-mode tray display), resetting at midnight.
    const day = new Date().toDateString();
    if (day !== this.trackedDay) { this.trackedDay = day; this.trackedTodaySec = 0; }

    const idleSec = await getIdleSeconds();
    const idle = idleSec >= this.cfg.idleAfterMin * 60;
    const fg = await getForeground();
    const status: Presence = idle ? "IDLE" : "ACTIVE";
    if (!idle) this.trackedTodaySec += TICK_MS / 1000;

    // Foreground / idle-state change → roll the activity session over.
    const appChanged = fg.app !== this.lastApp;
    const idleChanged = this.session ? this.session.isIdle !== idle : true;
    if (appChanged || idleChanged) {
      await this.rollSession(fg.app, fg.url, idle);
      if (appChanged && fg.app) this.onAppSwitch();
      this.lastApp = fg.app;
      this.lastUrl = fg.url;
    }

    // Heartbeat cadence (also refreshes server-driven config).
    if (now - this.lastHeartbeat >= this.cfg.heartbeatSec * 1000) {
      this.lastHeartbeat = now;
      try {
        const res = await this.api.heartbeat(status, fg.app, fg.url);
        if (res.config) this.cfg = res.config;
        this.syncControl(); // start/stop the visible-mode tray if the mode changed
        // Heartbeat succeeded → we're online → replay anything buffered offline.
        const sent = await buffer.flush(this.api).catch(() => 0);
        if (sent) console.log(`[sync] flushed ${sent} buffered item(s)`);
      } catch (e: any) {
        console.error("[heartbeat] offline —", e.message);
      }
    }

    // Periodic screenshot.
    if (!this.cfg.paused && this.cfg.periodicScreenshots && now >= this.nextPeriodicAt) {
      this.nextPeriodicAt = now + this.cfg.screenshotIntervalMin * 60_000;
      await this.capture("PERIODIC", fg.app, fg.url, idle);
    }
  }

  private onAppSwitch() {
    if (!this.cfg.appSwitchScreenshots) return;
    // Throttle: at most one app-switch shot per appSwitchDelayMin, so frequent
    // switching doesn't spam — but switches DO get captured (bug before: the
    // timer reset on every switch, so active users rarely got one; and it was
    // wrongly disabled in RESTRICTED mode).
    const now = Date.now();
    const minGapMs = Math.max(0, this.cfg.appSwitchDelayMin) * 60_000;
    if (now - this.lastAppSwitchAt < minGapMs) return;
    this.lastAppSwitchAt = now;
    // brief settle so the new window has rendered before the shot
    setTimeout(() => {
      getForeground().then((fg) => this.capture("APP_SWITCH", fg.app, fg.url, false));
    }, 2500);
  }

  private async rollSession(app: string | null, url: string | null, idle: boolean) {
    if (this.session) {
      const item = {
        type: this.session.type,
        name: this.session.name,
        startedAt: this.session.startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        isIdle: this.session.isIdle,
      };
      this.api.postActivity([item]).catch(() => buffer.enqueueActivity([item]));
    }
    if (app) {
      this.session = {
        type: url ? "WEB" : "APP",
        name: url ?? app,
        startedAt: new Date(),
        isIdle: idle,
      };
    } else {
      this.session = null;
    }
  }

  /** Resolution cap for stored screenshots. Older servers don't send the field,
   *  so fall back to full HD rather than uploading native 4K frames. */
  private maxHeight(): number {
    const h = (this.cfg as { screenshotMaxHeight?: number }).screenshotMaxHeight;
    return typeof h === "number" && h >= 0 ? h : 1080;
  }

  private async capture(trigger: "PERIODIC" | "APP_SWITCH" | "ON_DEMAND", app: string | null, url: string | null, isIdle: boolean) {
    let img: Buffer;
    try {
      img = await captureJpeg(this.cfg.webcamPhotos, this.maxHeight());
    } catch (e: any) {
      console.error("[capture]", e.message);
      return;
    }
    const meta = { capturedAt: new Date().toISOString(), trigger, app, url, isIdle };
    try {
      await this.api.uploadScreenshot(img, meta);
      console.log(`[capture] ${trigger} ${app ?? ""} ${url ?? ""}`.trim());
    } catch {
      buffer.enqueueScreenshot(img, meta);
      console.error(`[capture] offline — buffered (${buffer.pending()} pending)`);
    }
  }

  /** On-demand screenshot (dashboard "Screenshot request"). Always a fast plain
   *  screen grab — never the webcam path, so the request returns promptly. */
  async captureNow() {
    if (this.cfg.paused) return;
    const fg = await getForeground();
    console.log("[capture] on-demand request");
    let img: Buffer;
    try {
      img = await captureJpeg(false, this.maxHeight());
    } catch (e: any) {
      console.error("[capture]", e.message);
      return;
    }
    const meta = { capturedAt: new Date().toISOString(), trigger: "ON_DEMAND" as const, app: fg.app, url: fg.url, isIdle: false };
    try {
      await this.api.uploadScreenshot(img, meta);
      console.log("[capture] ON_DEMAND sent");
    } catch {
      buffer.enqueueScreenshot(img, meta);
    }
  }

  private async shutdown() {
    console.log("[eagle-agent] shutting down");
    this.control.stop();
    try {
      await this.api.heartbeat("OFFLINE", null, null);
    } catch {
      /* best effort */
    }
  }
}

async function main() {
  const local = loadConfig();
  const api = new EagleApi(local.serverUrl, local.deviceToken);
  setServerUrl(local.serverUrl); // used to fetch ffmpeg on demand when webcam is enabled

  async function enroll(reason: string): Promise<boolean> {
    if (!local.enrollToken) return false;
    console.log(`[eagle-agent] enrolling (${reason})…`);
    const res = await api.enroll({
      token: local.enrollToken,
      hostname: hostname(),
      platform: osPlatform(),
      agentVersion: AGENT_VERSION,
    });
    local.deviceId = res.deviceId;
    local.deviceToken = res.deviceToken;
    local.employeeId = res.employeeId;
    // Keep enrollToken on disk (the installer/scheduled-task passes it too) so the
    // agent can self-heal later if this device token is ever rejected.
    saveConfig(local);
    api.setDeviceToken(res.deviceToken);
    console.log(`[eagle-agent] enrolled as device ${res.deviceId}`);
    return true;
  }

  if (!local.deviceToken) {
    if (!(await enroll("first run"))) {
      console.error(
        "No device token and no enrollment token.\n" +
          "Run: npm run agent -- --server http://localhost:4000 --token <ENROLL_TOKEN>",
      );
      process.exit(1);
    }
  } else {
    // Self-heal on reinstall / server reset: probe with the saved token; if it's
    // rejected (401/403) and we still hold an enrollment key, re-enroll with it.
    try {
      await api.heartbeat("ACTIVE", null, null);
    } catch (e: any) {
      if (/\b(401|403)\b/.test(String(e?.message)) && local.enrollToken) {
        await enroll("saved device token rejected").catch((err) =>
          console.error("[eagle-agent] re-enroll failed —", err.message),
        );
      }
      // Network/offline errors: ignore here; the tick loop retries heartbeats.
    }
  }

  const agent = new Agent(api, local);

  // Live screen streaming + on-demand screenshot requests over the socket.
  if (local.deviceToken && local.employeeId) {
    connectLive(local.serverUrl, local.deviceToken, local.employeeId, () =>
      agent.captureNow().catch((e) => console.error("[capture-now]", e.message)),
    );
  }

  await agent.start();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
