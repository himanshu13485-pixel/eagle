import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

/** Data retention windows (days) by product tier. */
const RETENTION: Record<string, { screenshots: number; activity: number }> = {
  BASIC: { screenshots: 15, activity: 90 },
  PROFESSIONAL: { screenshots: 30, activity: 90 },
  BUSINESS: { screenshots: 60, activity: 180 },
};

@Injectable()
export class RetentionService {
  private readonly log = new Logger("Retention");

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Runs daily at 03:00 server time. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    const total = await this.pruneAll();
    this.log.log(`Retention sweep: removed ${total.screenshots} screenshots, ${total.activity} activity rows`);
  }

  async pruneAll() {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    let screenshots = 0;
    let activity = 0;
    for (const o of orgs) {
      const r = await this.prune(o.id);
      screenshots += r.screenshots;
      activity += r.activity;
    }
    return { screenshots, activity };
  }

  async prune(orgId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId } });
    const ret = RETENTION[sub?.tier ?? "PROFESSIONAL"] ?? RETENTION.PROFESSIONAL;
    const now = Date.now();
    const shotCut = new Date(now - ret.screenshots * 86400_000);
    const actCut = new Date(now - ret.activity * 86400_000);

    // delete expired screenshots (files first, then rows)
    const expired = await this.prisma.screenshot.findMany({
      where: { orgId, capturedAt: { lt: shotCut } },
      select: { id: true, s3Key: true },
    });
    for (const s of expired) await this.storage.deleteImage(s.s3Key);
    if (expired.length) {
      await this.prisma.screenshot.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } });
    }

    const act = await this.prisma.activitySession.deleteMany({
      where: { orgId, startedAt: { lt: actCut } },
    });

    // Audit trail: record the automated cleanup as SYSTEM data-requests (shown under
    // Data Management → "Show automated jobs").
    await this.prisma.dataRequest.createMany({
      data: [
        { orgId, source: "SYSTEM", action: "RETENTION_SCREENSHOTS", dataType: "SCREENSHOTS", rangeFrom: shotCut, rangeTo: shotCut, status: "COMPLETED" },
        { orgId, source: "SYSTEM", action: "RETENTION_LOGS", dataType: "LOGS", rangeFrom: actCut, rangeTo: actCut, status: "COMPLETED" },
      ],
    });

    return { screenshots: expired.length, activity: act.count, tier: sub?.tier ?? "PROFESSIONAL" };
  }
}
