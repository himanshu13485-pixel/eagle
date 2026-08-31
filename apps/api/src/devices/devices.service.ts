import { Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import {
  AgentConfig,
  DEFAULT_AGENT_CONFIG,
  EnrollDeviceResponse,
  PresenceStatus,
  RT_EVENTS,
  TrackingMode,
} from "@eagle/shared";
import { EnrollDto, HeartbeatDto } from "./dto";

/** A usable foreground app name, or undefined for blanks / the "Idle" placeholder. */
function realApp(app?: string | null): string | undefined {
  const v = (app ?? "").trim();
  return v && v.toLowerCase() !== "idle" ? v : undefined;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async enroll(dto: EnrollDto): Promise<EnrollDeviceResponse> {
    const device = await this.prisma.device.findUnique({ where: { enrollToken: dto.token } });
    if (!device) throw new NotFoundException("Invalid enrollment token");

    const secret = randomBytes(24).toString("hex");
    const deviceTokenHash = bcrypt.hashSync(secret, 10);

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        enrolled: true,
        // Keep the enrollment token valid so re-running the SAME installer after an
        // uninstall/reinstall re-enrolls cleanly (issues a fresh device token). Nulling
        // it here previously made the second install fail with "Invalid enrollment token".
        deviceTokenHash,
        hostname: dto.hostname,
        platform: dto.platform,
        agentVersion: dto.agentVersion,
        status: PresenceStatus.ACTIVE,
        lastSeenAt: new Date(),
      },
    });

    // A reinstall means the person is being monitored again — bring the employee back
    // online. (An offboarded/deactivated employee otherwise stays paused, so the
    // reinstalled agent would run but report nothing.)
    await this.prisma.employee.update({
      where: { id: device.employeeId },
      data: { active: true, status: PresenceStatus.ACTIVE },
    });

    return {
      deviceId: device.id,
      deviceToken: `${device.id}.${secret}`,
      employeeId: device.employeeId,
      config: await this.configForEmployee(device.orgId, device.employeeId),
    };
  }

  async heartbeat(device: { id: string; orgId: string; employeeId: string }, dto: HeartbeatDto) {
    const now = new Date();
    await this.prisma.device.update({
      where: { id: device.id },
      data: { status: dto.status, lastSeenAt: now },
    });
    await this.prisma.employee.update({
      where: { id: device.employeeId },
      data: {
        status: dto.status,
        lastActiveAt: dto.status === PresenceStatus.ACTIVE ? now : undefined,
        // Keep the last *real* foreground app: don't overwrite it with a blank or
        // the literal "Idle" some agents report while the user is away.
        lastApp: realApp(dto.activeApp),
      },
    });
    this.realtime.emitToOrg(device.orgId, RT_EVENTS.presence, {
      employeeId: device.employeeId,
      status: dto.status,
      activeApp: dto.activeApp ?? null,
      at: now.toISOString(),
    });
    return { ok: true, config: await this.configForEmployee(device.orgId, device.employeeId) };
  }

  /** The agent's uninstaller calls this to deactivate its employee (free the seat, keep data). */
  async deactivateSelf(device: { id: string; employeeId: string; orgId: string }) {
    await this.prisma.employee.update({
      where: { id: device.employeeId },
      data: { active: false, status: PresenceStatus.OFFLINE },
    });
    await this.prisma.device.update({
      where: { id: device.id },
      data: { status: PresenceStatus.OFFLINE },
    });
    this.realtime.emitToOrg(device.orgId, RT_EVENTS.presence, {
      employeeId: device.employeeId,
      status: PresenceStatus.OFFLINE,
      at: new Date().toISOString(),
    });
    return { ok: true };
  }

  /** Per-employee tracking config = org TrackingSetting overlaid with any Bulk-Update override. */
  async configForEmployee(orgId: string, employeeId: string): Promise<AgentConfig> {
    const base = await this.configForOrg(orgId);
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { settingsJson: true, active: true },
    });
    let cfg = base;
    if (emp?.settingsJson) {
      try {
        cfg = { ...base, ...(JSON.parse(emp.settingsJson) as Partial<AgentConfig>) };
      } catch {
        /* ignore malformed override */
      }
    }
    // Deactivated employee → agent goes dormant (no captures/streaming).
    return { ...cfg, paused: emp ? !emp.active : false };
  }

  async configForOrg(orgId: string): Promise<AgentConfig> {
    const s = await this.prisma.trackingSetting.findUnique({ where: { orgId } });
    if (!s) return DEFAULT_AGENT_CONFIG;
    return {
      periodicScreenshots: s.periodicScreenshots,
      screenshotIntervalMin: s.screenshotIntervalMin,
      appSwitchScreenshots: s.appSwitchScreenshots,
      appSwitchDelayMin: s.appSwitchDelayMin,
      webcamPhotos: s.webcamPhotos,
      screenshotMaxHeight: s.screenshotMaxHeight,
      idleAfterMin: s.idleAfterMin,
      trackingMode: s.trackingMode as TrackingMode,
      strictTimeTracking: s.strictTimeTracking,
      heartbeatSec: DEFAULT_AGENT_CONFIG.heartbeatSec,
      paused: false,
    };
  }
}
