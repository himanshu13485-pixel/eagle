import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { QuotaService } from "../storage/quota.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { RT_EVENTS, ScreenshotTrigger, UsageType } from "@eagle/shared";

interface Device {
  id: string;
  orgId: string;
  employeeId: string;
}

interface ScreenshotInput {
  capturedAt?: string;
  trigger?: string;
  app?: string;
  url?: string;
  isIdle?: string | boolean;
}

@Injectable()
export class IngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly quota: QuotaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async isActive(employeeId: string): Promise<boolean> {
    const e = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { active: true },
    });
    return !!e?.active;
  }

  async saveScreenshot(device: Device, file: Express.Multer.File, meta: ScreenshotInput) {
    // Deactivated employee → drop the data (defends against older agents that ignore `paused`).
    if (!(await this.isActive(device.employeeId))) return { ok: true, skipped: true };
    const capturedAt = meta.capturedAt ? new Date(meta.capturedAt) : new Date();
    const trigger = (meta.trigger as ScreenshotTrigger) ?? ScreenshotTrigger.PERIODIC;
    const isIdle = meta.isIdle === true || meta.isIdle === "true";
    const key = `${device.orgId}/${device.employeeId}/${capturedAt.getFullYear()}/${
      capturedAt.getMonth() + 1
    }/${capturedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

    await this.storage.putImage(key, file.buffer, file.mimetype || "image/jpeg");

    const shot = await this.prisma.screenshot.create({
      data: {
        orgId: device.orgId,
        employeeId: device.employeeId,
        deviceId: device.id,
        capturedAt,
        trigger,
        app: meta.app ?? null,
        url: meta.url ?? null,
        isIdle,
        s3Key: key,
        bytes: file.buffer.length,
      },
    });

    // Storage quota: count the new image, then drop the oldest screenshots if
    // the org has gone over its plan's cap. Runs after the upload is safely
    // stored, so a capture is never lost to make room for itself.
    this.quota.noteAdded(device.orgId, file.buffer.length);
    this.quota.enforce(device.orgId).catch(() => undefined);

    const realApp = ((meta.app ?? "").trim() && meta.app!.trim().toLowerCase() !== "idle") ? meta.app!.trim() : undefined;
    await this.prisma.employee.update({
      where: { id: device.employeeId },
      data: { lastScreenshotAt: capturedAt, lastApp: realApp },
    });

    const employee = await this.prisma.employee.findUnique({ where: { id: device.employeeId } });
    this.realtime.emitToOrg(device.orgId, RT_EVENTS.screenshotCreated, {
      id: shot.id,
      employeeId: device.employeeId,
      employeeName: employee?.name ?? "",
      capturedAt: capturedAt.toISOString(),
      trigger,
      app: meta.app ?? null,
      isIdle,
    });

    return { ok: true, id: shot.id };
  }

  async saveActivityBatch(
    device: Device,
    items: Array<{ type: string; name: string; startedAt: string; endedAt: string; isIdle?: boolean }>,
  ) {
    if (!items?.length) return { ok: true, count: 0 };
    if (!(await this.isActive(device.employeeId))) return { ok: true, count: 0 };
    const rows = items.map((i) => {
      const startedAt = new Date(i.startedAt);
      const endedAt = new Date(i.endedAt);
      return {
        orgId: device.orgId,
        employeeId: device.employeeId,
        type: (i.type as UsageType) ?? UsageType.APP,
        name: i.name,
        startedAt,
        endedAt,
        isIdle: !!i.isIdle,
        durationSec: Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)),
      };
    });
    await this.prisma.activitySession.createMany({ data: rows });
    return { ok: true, count: rows.length };
  }
}
