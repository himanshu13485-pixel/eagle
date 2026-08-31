import { Injectable, Logger } from "@nestjs/common";
import { planLimits, storageLimitBytes } from "@eagle/shared";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "./storage.service";

/** How long a computed usage total is trusted before it is re-summed from the DB. */
const CACHE_MS = 5 * 60_000;
/** Most screenshots one eviction pass will delete, so a wildly over-quota org
 *  doesn't stall an upload request for minutes. The next upload continues. */
const EVICT_BATCH = 500;

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  percent: number; // 0..100+ (can exceed 100 briefly, before eviction catches up)
  screenshotRetentionDays: number;
  activityRetentionDays: number;
  tier: string;
}

/**
 * Per-org screenshot storage accounting and enforcement.
 *
 * Each plan caps total stored screenshot bytes (Basic 5 GB / Professional 10 GB
 * / Business 20 GB). When an org goes over its cap the oldest screenshots are
 * deleted until it is back under — the same "oldest first" rule the age-based
 * retention sweep uses, just triggered by size instead of by date.
 *
 * Usage is cached per org and adjusted in place on write/delete, so the common
 * path is a couple of arithmetic ops rather than a SUM over every row.
 */
@Injectable()
export class QuotaService {
  private readonly log = new Logger("Quota");
  private readonly cache = new Map<string, { bytes: number; at: number }>();
  private readonly tiers = new Map<string, { tier: string; at: number }>();
  private readonly evicting = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** The org's tier, cached briefly — enforce() runs on every upload and this
   *  would otherwise be a query per screenshot. A plan change takes effect within
   *  CACHE_MS; the nightly sweep is the authoritative pass either way. */
  private async tierOf(orgId: string): Promise<string> {
    const hit = this.tiers.get(orgId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.tier;
    const sub = await this.prisma.subscription.findUnique({
      where: { orgId },
      select: { tier: true },
    });
    const tier = sub?.tier ?? "PROFESSIONAL";
    this.tiers.set(orgId, { tier, at: Date.now() });
    return tier;
  }

  /** Bytes currently stored for the org (cached; recomputed at most every CACHE_MS). */
  async usedBytes(orgId: string, fresh = false): Promise<number> {
    const hit = this.cache.get(orgId);
    if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.bytes;
    const agg = await this.prisma.screenshot.aggregate({ where: { orgId }, _sum: { bytes: true } });
    const bytes = agg._sum.bytes ?? 0;
    this.cache.set(orgId, { bytes, at: Date.now() });
    return bytes;
  }

  /** Stored bytes for many orgs in one query — for the platform admin's
   *  cross-client views, where a per-org lookup would be an N+1. */
  async usedBytesByOrg(orgIds: string[]): Promise<Map<string, number>> {
    if (!orgIds.length) return new Map();
    const rows = await this.prisma.screenshot.groupBy({
      by: ["orgId"],
      where: { orgId: { in: orgIds } },
      _sum: { bytes: true },
    });
    return new Map(rows.map((r) => [r.orgId, Math.max(0, r._sum.bytes ?? 0)] as [string, number]));
  }

  /** Adjust the cached total without re-summing (called on every add/delete). */
  private adjust(orgId: string, delta: number) {
    const hit = this.cache.get(orgId);
    if (hit) hit.bytes = Math.max(0, hit.bytes + delta);
  }

  /** Usage + limits for the org, for the dashboard's storage meter. */
  async usage(orgId: string): Promise<StorageUsage> {
    const tier = await this.tierOf(orgId);
    const limits = planLimits(tier);
    const usedBytes = await this.usedBytes(orgId);
    const limitBytes = storageLimitBytes(tier);
    return {
      usedBytes,
      limitBytes,
      percent: limitBytes ? +((usedBytes / limitBytes) * 100).toFixed(1) : 0,
      screenshotRetentionDays: limits.screenshotRetentionDays,
      activityRetentionDays: limits.activityRetentionDays,
      tier,
    };
  }

  /** Record a newly stored image against the org's total. */
  noteAdded(orgId: string, bytes: number) {
    this.adjust(orgId, bytes);
  }

  /** Record bytes freed by a deletion the caller performed itself. */
  noteRemoved(orgId: string, bytes: number) {
    this.adjust(orgId, -bytes);
  }

  /**
   * Delete oldest screenshots until the org is back under its plan's cap.
   * Safe to call on every upload: it returns immediately when under quota, and
   * only one eviction per org runs at a time.
   */
  async enforce(orgId: string): Promise<{ deleted: number; freedBytes: number }> {
    if (this.evicting.has(orgId)) return { deleted: 0, freedBytes: 0 };
    const limitBytes = storageLimitBytes(await this.tierOf(orgId));
    let used = await this.usedBytes(orgId);
    if (used <= limitBytes) return { deleted: 0, freedBytes: 0 };

    this.evicting.add(orgId);
    try {
      // Re-sum before deleting anything: the cached figure may have drifted, and
      // deleting an employee's screenshots on a stale total would be unrecoverable.
      used = await this.usedBytes(orgId, true);
      if (used <= limitBytes) return { deleted: 0, freedBytes: 0 };

      let deleted = 0;
      let freed = 0;
      while (deleted < EVICT_BATCH) {
        // Re-sum each round rather than decrementing: rows whose `bytes` has not
        // been backfilled yet count as 0, and trusting arithmetic on those would
        // keep deleting without ever bringing the total down.
        used = await this.usedBytes(orgId, true);
        if (used <= limitBytes) break;

        const batch = await this.prisma.screenshot.findMany({
          where: { orgId },
          orderBy: { capturedAt: "asc" },
          take: 100,
          select: { id: true, s3Key: true, bytes: true },
        });
        if (!batch.length) break;

        for (const shot of batch) await this.storage.deleteImage(shot.s3Key);
        await this.prisma.screenshot.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } });
        const batchBytes = batch.reduce((n, b) => n + Math.max(0, b.bytes), 0);
        deleted += batch.length;
        freed += batchBytes;
        if (batchBytes === 0) {
          // Nothing was actually reclaimed — the oldest rows have no recorded size,
          // so deleting more of them can't help. Let the backfill run first.
          this.log.warn(`org ${orgId}: oldest screenshots have no recorded size — stopping eviction until backfill completes`);
          break;
        }
      }
      await this.usedBytes(orgId, true);
      if (deleted) {
        this.log.log(`org ${orgId}: evicted ${deleted} screenshots (${(freed / 1048576).toFixed(1)} MB) to stay under quota`);
        await this.prisma.dataRequest.create({
          data: {
            orgId,
            source: "SYSTEM",
            action: "RETENTION_QUOTA",
            dataType: "SCREENSHOTS",
            status: "COMPLETED",
          },
        }).catch(() => undefined);
      }
      return { deleted, freedBytes: freed };
    } finally {
      this.evicting.delete(orgId);
    }
  }

  /**
   * Fill in Screenshot.bytes for rows written before quotas existed, by asking
   * storage how big each image actually is. Rows whose file is missing are
   * marked -1 so they aren't re-checked forever.
   *
   * One chunk per call. Quota enforcement is inert for an org whose oldest rows
   * have no recorded size, so `backfillAll` runs this to completion on boot.
   */
  async backfill(limit = 2000): Promise<number> {
    const rows = await this.prisma.screenshot.findMany({
      where: { bytes: 0 },
      take: limit,
      select: { id: true, s3Key: true },
    });
    if (!rows.length) return 0;

    const sized = await Promise.all(
      rows.map(async (r) => ({ id: r.id, size: await this.storage.sizeOf(r.s3Key) })),
    );
    // One transaction per chunk: 2000 separate round-trips to Postgres is the
    // slow part here, not measuring the files.
    await this.prisma.$transaction(
      sized.map((r) =>
        this.prisma.screenshot.update({ where: { id: r.id }, data: { bytes: r.size ?? -1 } }),
      ),
    );
    this.cache.clear();
    return sized.filter((r) => r.size).length;
  }

  /**
   * Backfill every unmeasured screenshot, a chunk at a time. Returns the number
   * measured. Stops early if a chunk measures nothing new, so a store full of
   * missing files can't loop forever.
   */
  async backfillAll(): Promise<number> {
    let total = 0;
    for (;;) {
      const before = await this.prisma.screenshot.count({ where: { bytes: 0 } });
      if (!before) break;
      const filled = await this.backfill();
      total += filled;
      const after = await this.prisma.screenshot.count({ where: { bytes: 0 } });
      if (after >= before) break; // nothing was marked — avoid spinning
    }
    return total;
  }
}
