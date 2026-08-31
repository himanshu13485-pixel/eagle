import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { planLimits } from "@eagle/shared";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { QuotaService } from "../storage/quota.service";

/**
 * Enforces the two data limits every plan carries: an age window (screenshots
 * and activity logs older than the plan's retention are removed) and a storage
 * cap (past it, the oldest screenshots are removed until the org fits again).
 * Both windows come from PLANS in @eagle/shared, so pricing copy and the code
 * that deletes data can't drift apart.
 */
@Injectable()
export class RetentionService implements OnModuleInit {
  private readonly log = new Logger("Retention");

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly quota: QuotaService,
  ) {}

  /** Screenshots stored before quotas existed have no recorded size; fill them
   *  in on boot so the storage meter and eviction have real numbers to work with. */
  onModuleInit() {
    // Runs to completion in the background — quota enforcement is deliberately
    // inert for an org whose oldest screenshots have no recorded size, so this
    // is what switches the storage cap on for an existing deployment.
    this.quota
      .backfillAll()
      .then((n) => n && this.log.log(`Backfilled sizes for ${n} pre-existing screenshots`))
      .catch((e) => this.log.warn(`size backfill failed: ${e.message}`));
  }

  /** Runs daily at 03:00 server time. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    const filled = await this.quota.backfillAll().catch(() => 0);
    if (filled) this.log.log(`Backfilled sizes for ${filled} screenshots`);
    const total = await this.pruneAll();
    this.log.log(
      `Retention sweep: removed ${total.screenshots} screenshots (${total.evicted} over quota), ${total.activity} activity rows`,
    );
  }

  async pruneAll() {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    let screenshots = 0;
    let activity = 0;
    let evicted = 0;
    for (const o of orgs) {
      const r = await this.prune(o.id);
      screenshots += r.screenshots;
      activity += r.activity;
      evicted += r.evicted;
    }
    return { screenshots, activity, evicted };
  }

  async prune(orgId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId } });
    const tier = sub?.tier ?? "PROFESSIONAL";
    const ret = planLimits(tier);
    const now = Date.now();
    const shotCut = new Date(now - ret.screenshotRetentionDays * 86400_000);
    const actCut = new Date(now - ret.activityRetentionDays * 86400_000);

    // delete expired screenshots (files first, then rows)
    const expired = await this.prisma.screenshot.findMany({
      where: { orgId, capturedAt: { lt: shotCut } },
      select: { id: true, s3Key: true, bytes: true },
    });
    for (const s of expired) await this.storage.deleteImage(s.s3Key);
    if (expired.length) {
      await this.prisma.screenshot.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } });
      this.quota.noteRemoved(orgId, expired.reduce((n, s) => n + Math.max(0, s.bytes), 0));
    }

    const act = await this.prisma.activitySession.deleteMany({
      where: { orgId, startedAt: { lt: actCut } },
    });

    // Age window done — now the size cap, which may still bite on a busy org
    // whose screenshots are all inside the retention window.
    const quota = await this.quota.enforce(orgId);

    // Audit trail: record the automated cleanup as SYSTEM data-requests (shown under
    // Data Management → "Show automated jobs"). Quota evictions log themselves.
    await this.prisma.dataRequest.createMany({
      data: [
        { orgId, source: "SYSTEM", action: "RETENTION_SCREENSHOTS", dataType: "SCREENSHOTS", rangeFrom: shotCut, rangeTo: shotCut, status: "COMPLETED" },
        { orgId, source: "SYSTEM", action: "RETENTION_LOGS", dataType: "LOGS", rangeFrom: actCut, rangeTo: actCut, status: "COMPLETED" },
      ],
    });

    return {
      screenshots: expired.length + quota.deleted,
      activity: act.count,
      evicted: quota.deleted,
      tier,
    };
  }
}
