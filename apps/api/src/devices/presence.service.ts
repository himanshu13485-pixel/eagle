import { Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { PresenceStatus, RT_EVENTS } from "@eagle/shared";

/**
 * Marks an employee OFFLINE when no device has sent a heartbeat for a while
 * (PC asleep / shut down / network gone). Without this the last status (Active/
 * Idle) would stick forever. While the agent keeps heartbeating — even when the
 * person is idle — the employee stays Idle, not Offline.
 */
const OFFLINE_AFTER_MS = 120_000; // ~6 missed 20s heartbeats

@Injectable()
export class PresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Interval(30_000)
  async sweep() {
    const cutoff = new Date(Date.now() - OFFLINE_AFTER_MS);
    const employees = await this.prisma.employee.findMany({
      where: { status: { not: PresenceStatus.OFFLINE } },
      select: { id: true, orgId: true, devices: { select: { lastSeenAt: true } } },
    });
    for (const e of employees) {
      const fresh = e.devices.some((d) => d.lastSeenAt && d.lastSeenAt >= cutoff);
      if (fresh) continue;
      await this.prisma.employee.update({
        where: { id: e.id },
        data: { status: PresenceStatus.OFFLINE },
      });
      this.realtime.emitToOrg(e.orgId, RT_EVENTS.presence, {
        employeeId: e.id,
        status: PresenceStatus.OFFLINE,
        at: new Date().toISOString(),
      });
    }
  }
}
