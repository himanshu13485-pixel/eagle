import { Injectable, NotFoundException } from "@nestjs/common";
import {
  ActivityCategory,
  CATEGORY_GROUPS,
  GROUP_BY_KEY,
  classifyActivity,
  rulesForEmployee,
  type CategoryOverride,
  type CategoryRule,
} from "@eagle/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Rules change rarely and are read by every report; cache them briefly. */
const CACHE_MS = 60_000;

/**
 * Productivity classification: which apps and websites count as work.
 *
 * Patterns ship in named groups ("Social media", "Personal messaging &
 * texting", "In-house & business apps"…) so a manager can make one decision
 * instead of forty. Only overrides are stored, so a new customer gets
 * meaningful numbers on day one and the shipped defaults can improve later
 * without rewriting anyone's data.
 *
 * An override is either a whole group or a single pattern, and applies either
 * to the whole organisation or to one employee — "YouTube is productive for
 * the person who runs our channel" without changing it for everyone else.
 */
@Injectable()
export class CategoriesService {
  /** Keyed by `${orgId}:${employeeId ?? "*"}` — a per-employee rule set is a
   *  different answer from the org-wide one. */
  private readonly cache = new Map<string, { rules: CategoryRule[]; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** The shipped groups plus this scope's current verdict for each. */
  async groupsFor(orgId: string, employeeId?: string | null) {
    const overrides = await this.overridesFor(orgId, employeeId);
    return CATEGORY_GROUPS.map((g) => {
      // Only a row actually tied to an employee counts as theirs. Comparing
      // against `employeeId ?? null` matched the org-wide row when no employee
      // was selected, so the org's own rule was reported as an employee's.
      const mine = employeeId ? overrides.find((o) => o.groupKey === g.key && o.employeeId === employeeId) : undefined;
      const org = overrides.find((o) => o.groupKey === g.key && !o.employeeId);
      return {
        key: g.key,
        label: g.label,
        description: g.description,
        defaultCategory: g.defaultCategory,
        /** What actually applies here, after org and employee overrides. */
        category: (mine?.category ?? org?.category ?? g.defaultCategory) as ActivityCategory,
        /** Where that verdict came from, so the UI can show it honestly. */
        source: mine ? "employee" : org ? "organisation" : "default",
        examples: [...g.apps, ...g.sites].slice(0, 6),
        appCount: g.apps.length,
        siteCount: g.sites.length,
      };
    });
  }

  private async overridesFor(orgId: string, employeeId?: string | null): Promise<CategoryOverride[]> {
    const rows = await this.prisma.activityCategory.findMany({
      where: { orgId, OR: [{ employeeId: null }, ...(employeeId ? [{ employeeId }] : [])] },
    });
    return rows.map((r) => ({
      groupKey: r.groupKey,
      type: r.type,
      pattern: r.pattern,
      category: r.category as ActivityCategory,
      employeeId: r.employeeId,
    }));
  }

  /** The effective rules for one employee, or for the org when none is given. */
  async rulesFor(orgId: string, employeeId?: string | null): Promise<CategoryRule[]> {
    const key = `${orgId}:${employeeId ?? "*"}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.rules;

    const rules = rulesForEmployee(await this.overridesFor(orgId, employeeId), employeeId ?? null);
    this.cache.set(key, { rules, at: Date.now() });
    return rules;
  }

  /** Clear every cached scope for an org — an org-wide change moves them all. */
  private invalidate(orgId: string) {
    for (const key of this.cache.keys()) if (key.startsWith(`${orgId}:`)) this.cache.delete(key);
  }

  /**
   * A reusable classifier for a whole report.
   *
   * Reports cover many employees at once, so this resolves each employee's own
   * rules lazily and memoises per employee — a per-employee override has to be
   * reflected in the numbers, not just on the settings screen.
   */
  async classifierFor(orgId: string): Promise<(type: string, name: string, employeeId?: string | null) => ActivityCategory> {
    const all = await this.overridesFor(orgId, null);
    const orgRules = rulesForEmployee(all, null);

    // Only the employees who actually have their own overrides need a rule set
    // of their own; everyone else shares the org's. Resolved up front so the
    // returned function stays synchronous — reports call it per row.
    const withOwn = (
      await this.prisma.activityCategory.findMany({
        where: { orgId, NOT: { employeeId: null } },
        select: { employeeId: true },
        distinct: ["employeeId"],
      })
    ).map((r) => r.employeeId!);

    const perEmployee = new Map<string, CategoryRule[]>();
    if (withOwn.length) {
      const rows = await this.prisma.activityCategory.findMany({
        where: { orgId, employeeId: { in: withOwn } },
      });
      const own: CategoryOverride[] = rows.map((r) => ({
        groupKey: r.groupKey,
        type: r.type,
        pattern: r.pattern,
        category: r.category as ActivityCategory,
        employeeId: r.employeeId,
      }));
      for (const id of withOwn) perEmployee.set(id, rulesForEmployee([...all, ...own], id));
    }

    const memo = new Map<string, ActivityCategory>();
    return (type: string, name: string, employeeId?: string | null) => {
      const rules = (employeeId && perEmployee.get(employeeId)) || orgRules;
      const memoKey = `${employeeId && perEmployee.has(employeeId) ? employeeId : "*"}:${type}:${name}`;
      const cached = memo.get(memoKey);
      if (cached) return cached;
      const c = classifyActivity(type, name, rules);
      memo.set(memoKey, c);
      return c;
    };
  }

  /**
   * Everything this org has actually been seen using in the window, with its
   * current category — the list the Settings screen edits. Sorted by time
   * spent, so the apps worth classifying are at the top.
   */
  async observed(orgId: string, days = 30, employeeId?: string | null) {
    const since = new Date(Date.now() - days * 86400_000);
    const [sessions, own, rules] = await Promise.all([
      this.prisma.activitySession.groupBy({
        by: ["type", "name"],
        where: { orgId, isIdle: false, startedAt: { gte: since }, ...(employeeId ? { employeeId } : {}) },
        _sum: { durationSec: true },
      }),
      this.prisma.activityCategory.findMany({
        where: { orgId, NOT: { pattern: null }, OR: [{ employeeId: null }, ...(employeeId ? [{ employeeId }] : [])] },
      }),
      this.rulesFor(orgId, employeeId),
    ]);
    const customPatterns = new Set(own.map((r) => `${r.type}:${(r.pattern ?? "").toLowerCase()}`));

    return sessions
      .map((s) => ({
        type: s.type,
        name: s.name,
        totalSec: s._sum.durationSec ?? 0,
        category: classifyActivity(s.type, s.name, rules),
        // true when this exact name was set here, rather than inherited from a
        // default or matched by a broader pattern — drives the "Custom" chip.
        custom: customPatterns.has(`${s.type}:${s.name.toLowerCase()}`),
      }))
      .sort((a, b) => b.totalSec - a.totalSec);
  }

  /** The stored overrides, for the "custom rules" list. */
  listRules(orgId: string, employeeId?: string | null) {
    return this.prisma.activityCategory.findMany({
      where: { orgId, OR: [{ employeeId: null }, ...(employeeId ? [{ employeeId }] : [])] },
      orderBy: [{ groupKey: "asc" }, { pattern: "asc" }],
    });
  }

  /** Set the verdict for a whole shipped group, org-wide or for one employee. */
  async setGroup(orgId: string, groupKey: string, category: string, employeeId?: string | null) {
    if (!GROUP_BY_KEY[groupKey]) throw new NotFoundException("Unknown category group");
    await this.assertEmployee(orgId, employeeId);
    const row = await this.upsertOverride(orgId, { groupKey, type: null, pattern: null }, category, employeeId);
    this.invalidate(orgId);
    return row;
  }

  /** Set the verdict for a single app or website. */
  async setRule(orgId: string, type: string, pattern: string, category: string, employeeId?: string | null) {
    const clean = pattern.trim();
    await this.assertEmployee(orgId, employeeId);
    const row = await this.upsertOverride(orgId, { groupKey: null, type, pattern: clean }, category, employeeId);
    this.invalidate(orgId);
    return row;
  }

  /**
   * Store one verdict for one target.
   *
   * Not a real upsert: the target columns are nullable, so there is no unique
   * key to upsert against (and a unique index over nullable columns wouldn't
   * enforce anything in Postgres anyway). Find, then update or create.
   *
   * Because that read-then-write isn't atomic, two clicks landing together can
   * both create a row. Harmless for classification — they carry the same
   * verdict and the later one wins — but it would show twice in the rules
   * list, so any extras are tidied up here rather than left to accumulate.
   */
  private async upsertOverride(
    orgId: string,
    target: { groupKey: string | null; type: string | null; pattern: string | null },
    category: string,
    employeeId?: string | null,
  ) {
    const where = { orgId, employeeId: employeeId ?? null, ...target };
    const existing = await this.prisma.activityCategory.findMany({ where, orderBy: { createdAt: "asc" } });
    if (!existing.length) {
      return this.prisma.activityCategory.create({ data: { ...where, category } });
    }
    const [keep, ...extras] = existing;
    if (extras.length) {
      await this.prisma.activityCategory.deleteMany({ where: { id: { in: extras.map((e) => e.id) } } });
    }
    return this.prisma.activityCategory.update({ where: { id: keep.id }, data: { category } });
  }

  private async assertEmployee(orgId: string, employeeId?: string | null) {
    if (!employeeId) return;
    const found = await this.prisma.employee.findFirst({ where: { id: employeeId, orgId }, select: { id: true } });
    if (!found) throw new NotFoundException("Employee not found");
  }

  async removeRule(orgId: string, id: string) {
    await this.prisma.activityCategory.deleteMany({ where: { id, orgId } });
    this.invalidate(orgId);
    return { ok: true };
  }

  /** Drop overrides and go back to the shipped defaults. Scoped to one
   *  employee when given, so resetting a person doesn't reset the company. */
  async resetToDefaults(orgId: string, employeeId?: string | null) {
    const r = await this.prisma.activityCategory.deleteMany({
      where: { orgId, employeeId: employeeId ?? null },
    });
    this.invalidate(orgId);
    return { ok: true, removed: r.count };
  }
}
