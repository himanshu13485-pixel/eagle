import { Injectable } from "@nestjs/common";
import {
  ActivityCategory,
  DEFAULT_CATEGORY_RULES,
  classifyActivity,
  type CategoryRule,
} from "@eagle/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Rules change rarely and are read by every report; cache them briefly per org. */
const CACHE_MS = 60_000;

/**
 * Productivity classification: which apps and websites count as productive work
 * for a given org.
 *
 * Every org starts from DEFAULT_CATEGORY_RULES and stores only its overrides, so
 * a new customer gets meaningful numbers immediately and the defaults can improve
 * later without rewriting anyone's data. An org rule always beats a default for
 * the same pattern.
 */
@Injectable()
export class CategoriesService {
  private readonly cache = new Map<string, { rules: CategoryRule[]; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Defaults overlaid with the org's own rules (org wins on an identical pattern). */
  async rulesFor(orgId: string): Promise<CategoryRule[]> {
    const hit = this.cache.get(orgId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.rules;

    const own = await this.prisma.activityCategory.findMany({ where: { orgId } });
    const byKey = new Map<string, CategoryRule>();
    for (const r of DEFAULT_CATEGORY_RULES) byKey.set(`${r.type}:${r.pattern.toLowerCase()}`, r);
    for (const r of own) {
      byKey.set(`${r.type}:${r.pattern.toLowerCase()}`, {
        type: r.type as CategoryRule["type"],
        pattern: r.pattern,
        category: r.category as ActivityCategory,
      });
    }
    const rules = Array.from(byKey.values());
    this.cache.set(orgId, { rules, at: Date.now() });
    return rules;
  }

  private invalidate(orgId: string) {
    this.cache.delete(orgId);
  }

  /** A reusable classifier bound to one org's rules — built once per report. */
  async classifierFor(orgId: string): Promise<(type: string, name: string) => ActivityCategory> {
    const rules = await this.rulesFor(orgId);
    const memo = new Map<string, ActivityCategory>();
    return (type: string, name: string) => {
      const key = `${type}:${name}`;
      let c = memo.get(key);
      if (!c) {
        c = classifyActivity(type, name, rules);
        memo.set(key, c);
      }
      return c;
    };
  }

  /**
   * Everything this org has actually been seen using in the window, with its
   * current category — the list the Settings screen edits. Sorted by time spent,
   * so the apps worth classifying are at the top.
   */
  async observed(orgId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    const [sessions, own, classify] = await Promise.all([
      this.prisma.activitySession.groupBy({
        by: ["type", "name"],
        where: { orgId, isIdle: false, startedAt: { gte: since } },
        _sum: { durationSec: true },
      }),
      this.prisma.activityCategory.findMany({ where: { orgId } }),
      this.classifierFor(orgId),
    ]);
    const customPatterns = new Set(own.map((r) => `${r.type}:${r.pattern.toLowerCase()}`));

    return sessions
      .map((s) => ({
        type: s.type,
        name: s.name,
        totalSec: s._sum.durationSec ?? 0,
        category: classify(s.type, s.name),
        // true when the org set this exact name itself, rather than inheriting a
        // default or matching a broader pattern — drives the "Custom" chip.
        custom: customPatterns.has(`${s.type}:${s.name.toLowerCase()}`),
      }))
      .sort((a, b) => b.totalSec - a.totalSec);
  }

  /** The org's own overrides, for the "custom rules" list. */
  listRules(orgId: string) {
    return this.prisma.activityCategory.findMany({ where: { orgId }, orderBy: { pattern: "asc" } });
  }

  async setRule(orgId: string, type: string, pattern: string, category: string) {
    const clean = pattern.trim();
    const row = await this.prisma.activityCategory.upsert({
      where: { orgId_type_pattern: { orgId, type, pattern: clean } },
      create: { orgId, type, pattern: clean, category },
      update: { category },
    });
    this.invalidate(orgId);
    return row;
  }

  async removeRule(orgId: string, id: string) {
    await this.prisma.activityCategory.deleteMany({ where: { id, orgId } });
    this.invalidate(orgId);
    return { ok: true };
  }

  /** Drop every override and go back to the shipped defaults. */
  async resetToDefaults(orgId: string) {
    const r = await this.prisma.activityCategory.deleteMany({ where: { orgId } });
    this.invalidate(orgId);
    return { ok: true, removed: r.count };
  }
}
