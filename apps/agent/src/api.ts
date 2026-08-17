/**
 * Thin HTTP client to the Eagle API. Uses Node's global fetch/FormData/Blob (Node 18+).
 * Kept self-contained so the agent can be packaged/installed independently.
 */

export interface AgentConfig {
  periodicScreenshots: boolean;
  screenshotIntervalMin: number;
  appSwitchScreenshots: boolean;
  appSwitchDelayMin: number;
  webcamPhotos: boolean;
  idleAfterMin: number;
  trackingMode: "VISIBLE" | "RESTRICTED";
  strictTimeTracking: boolean;
  heartbeatSec: number;
  paused?: boolean;
}

export type Presence = "ACTIVE" | "IDLE" | "OFFLINE";
export type Trigger = "PERIODIC" | "APP_SWITCH" | "WEBCAM" | "ON_DEMAND";

export class EagleApi {
  constructor(
    private readonly baseUrl: string,
    private deviceToken?: string,
  ) {}

  setDeviceToken(t: string) {
    this.deviceToken = t;
  }

  private authHeaders(): Record<string, string> {
    return this.deviceToken ? { Authorization: `Bearer ${this.deviceToken}` } : {};
  }

  async enroll(input: {
    token: string;
    hostname: string;
    platform: "WINDOWS" | "MAC" | "LINUX";
    agentVersion: string;
  }): Promise<{ deviceId: string; deviceToken: string; employeeId: string; config: AgentConfig }> {
    const res = await fetch(`${this.baseUrl}/api/devices/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Enroll failed: ${res.status} ${await res.text()}`);
    return res.json() as any;
  }

  async heartbeat(
    status: Presence,
    activeApp?: string | null,
    activeUrl?: string | null,
  ): Promise<{ ok: boolean; config: AgentConfig }> {
    const res = await fetch(`${this.baseUrl}/api/devices/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.authHeaders() },
      body: JSON.stringify({ status, activeApp, activeUrl }),
    });
    if (!res.ok) throw new Error(`Heartbeat failed: ${res.status}`);
    return res.json() as any;
  }

  async uploadScreenshot(
    image: Buffer,
    meta: { capturedAt: string; trigger: Trigger; app?: string | null; url?: string | null; isIdle: boolean },
  ): Promise<void> {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "shot.jpg");
    form.append("capturedAt", meta.capturedAt);
    form.append("trigger", meta.trigger);
    if (meta.app) form.append("app", meta.app);
    if (meta.url) form.append("url", meta.url);
    form.append("isIdle", String(meta.isIdle));
    const res = await fetch(`${this.baseUrl}/api/ingest/screenshot`, {
      method: "POST",
      headers: { ...this.authHeaders() },
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }

  async postActivity(
    items: Array<{ type: "APP" | "WEB"; name: string; startedAt: string; endedAt: string; isIdle: boolean }>,
  ): Promise<void> {
    if (!items.length) return;
    const res = await fetch(`${this.baseUrl}/api/ingest/activity`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.authHeaders() },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error(`Activity post failed: ${res.status}`);
  }
}
