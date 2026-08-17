import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ActivitySpan,
  AppWebsiteDetail,
  AppWebsiteUsageReport,
  ComparePeriod,
  ProductivityTrendsReport,
  SnapshotHighlight,
  SnapshotRow,
  TeamSnapshotReport,
  TimesheetBreakdown,
  TimesheetMode,
  TimesheetReport,
  TimesheetRow,
  UsageType,
  UsageTypeFilter,
} from "@eagle/shared";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export interface TimesheetOpts {
  mode?: TimesheetMode;
  date?: string; // day-wise
  from?: string;
  to?: string;
  employeeId?: string; // user-wise
  teamId?: string; // period/day filter
  breakdown?: TimesheetBreakdown;
}

/** Per-bucket activity accumulator (bucket = an employee, or a day in user-wise mode). */
interface Agg {
  usage: number;
  idle: number;
  first: Date | null;
  last: Date | null;
  byName: Map<string, number>;
  activeDays: Set<string>;
}
const mkAgg = (): Agg => ({ usage: 0, idle: 0, first: null, last: null, byName: new Map(), activeDays: new Set() });

interface Session {
  employeeId: string;
  type: string;
  name: string;
  startedAt: Date;
  endedAt: Date;
  isIdle: boolean;
  durationSec: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private range(from?: string, to?: string): { from: Date; to: Date } {
    const toD = to ? new Date(to) : new Date();
    const fromD = from ? new Date(from) : new Date(toD.getTime() - 14 * 86400_000);
    return { from: fromD, to: toD };
  }

  private async sessions(orgId: string, from: Date, to: Date): Promise<Session[]> {
    return this.prisma.activitySession.findMany({
      where: { orgId, startedAt: { gte: from, lte: to } },
      select: {
        employeeId: true,
        type: true,
        name: true,
        startedAt: true,
        endedAt: true,
        isIdle: true,
        durationSec: true,
      },
    });
  }

  private addSession(a: Agg, s: Session, breakdown: TimesheetBreakdown) {
    if (s.isIdle) a.idle += s.durationSec;
    else a.usage += s.durationSec;
    if (!a.first || s.startedAt < a.first) a.first = s.startedAt;
    if (!a.last || s.endedAt > a.last) a.last = s.endedAt;
    a.activeDays.add(dayKey(s.startedAt));
    if (!s.isIdle && breakdown !== "none") {
      const want = breakdown === "app" ? UsageType.APP : UsageType.WEB;
      if (s.type === want) a.byName.set(s.name, (a.byName.get(s.name) ?? 0) + s.durationSec);
    }
  }

  private rowFromAgg(id: string, name: string, date: string | null, a: Agg | undefined, absentDays: number | null): TimesheetRow {
    const usage = a?.usage ?? 0;
    const idle = a?.idle ?? 0;
    return {
      employeeId: id,
      employeeName: name,
      date,
      firstActivity: a?.first?.toISOString() ?? null,
      lastActivity: a?.last?.toISOString() ?? null,
      usageSec: usage,
      idleSec: idle,
      offlineSec: 0, // agent offline-duration tracking is a later phase; shown separately
      trackedSec: usage + idle,
      overtimeSec: 0, // needs shift config; placeholder (matches SuperSee's unset shifts)
      absentDays,
      breakdown: a ? Object.fromEntries(a.byName) : null,
    };
  }

  /** Timesheet with SuperSee-style Day-wise / User-wise / Period-wise modes + App/Website breakdown. */
  async timesheet(orgId: string, opts: TimesheetOpts = {}): Promise<TimesheetReport> {
    const mode: TimesheetMode = opts.mode ?? "day";
    const breakdown: TimesheetBreakdown = opts.breakdown ?? "none";

    // window
    let from: Date;
    let to: Date;
    if (mode === "day") {
      const d = opts.date ? new Date(`${opts.date}T00:00:00`) : new Date();
      from = new Date(d); from.setHours(0, 0, 0, 0);
      to = new Date(d); to.setHours(23, 59, 59, 999);
    } else {
      const r = this.range(opts.from, opts.to);
      from = r.from;
      to = r.to;
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        orgId,
        ...(opts.teamId ? { teamId: opts.teamId } : {}),
        ...(mode === "user" && opts.employeeId ? { id: opts.employeeId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    const empIds = new Set(employees.map((e) => e.id));
    const sessions = (await this.sessions(orgId, from, to)).filter((s) => empIds.has(s.employeeId));

    let rows: TimesheetRow[] = [];

    if (mode === "user") {
      // one row per calendar day in the range, for the single selected employee
      const emp = employees[0];
      const byDay = new Map<string, Agg>();
      if (emp) {
        for (const s of sessions.filter((x) => x.employeeId === emp.id)) {
          const k = dayKey(s.startedAt);
          const a = byDay.get(k) ?? mkAgg();
          this.addSession(a, s, breakdown);
          byDay.set(k, a);
        }
        for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
          const k = dayKey(d);
          rows.push(this.rowFromAgg(emp.id, emp.name, k, byDay.get(k), null));
        }
      }
    } else {
      // day-wise & period-wise: one row per employee
      const byEmp = new Map<string, Agg>();
      for (const s of sessions) {
        const a = byEmp.get(s.employeeId) ?? mkAgg();
        this.addSession(a, s, breakdown);
        byEmp.set(s.employeeId, a);
      }
      const totalDays = mode === "period" ? this.daysInRange(from, to) : 0;
      rows = employees.map((e) => {
        const a = byEmp.get(e.id);
        const absent = mode === "period" ? totalDays - (a?.activeDays.size ?? 0) : null;
        return this.rowFromAgg(e.id, e.name, null, a, absent);
      });
    }

    // breakdown columns = top-12 names by total usage across all rows
    let columns: string[] = [];
    if (breakdown !== "none") {
      const totalsByName = new Map<string, number>();
      for (const row of rows) {
        if (!row.breakdown) continue;
        for (const [n, sec] of Object.entries(row.breakdown)) totalsByName.set(n, (totalsByName.get(n) ?? 0) + sec);
      }
      columns = [...totalsByName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n]) => n);
    }

    const totals = rows.reduce(
      (t, row) => ({
        usageSec: t.usageSec + row.usageSec,
        idleSec: t.idleSec + row.idleSec,
        offlineSec: t.offlineSec + row.offlineSec,
        trackedSec: t.trackedSec + row.trackedSec,
        overtimeSec: t.overtimeSec + row.overtimeSec,
      }),
      { usageSec: 0, idleSec: 0, offlineSec: 0, trackedSec: 0, overtimeSec: 0 },
    );

    const caption =
      mode === "day"
        ? `Day-wise report for ${fmtDay(from)}`
        : mode === "user"
          ? `User-wise report for ${employees[0]?.name ?? "—"} from ${fmtDay(from)} to ${fmtDay(to)}`
          : `Period-wise report from ${fmtDay(from)} to ${fmtDay(to)}`;

    return { mode, breakdown, from: from.toISOString(), to: to.toISOString(), caption, columns, totals, rows };
  }

  /** Inclusive count of calendar days spanned by [from, to]. */
  private daysInRange(from: Date, to: Date): number {
    const a = new Date(from); a.setHours(0, 0, 0, 0);
    const b = new Date(to); b.setHours(0, 0, 0, 0);
    return Math.floor((b.getTime() - a.getTime()) / 86400_000) + 1;
  }

  /** Sum of non-idle activity (optionally type/employee-filtered) in a window — for compare periods. */
  private async activeSecIn(orgId: string, from: Date, to: Date, type: UsageTypeFilter, empIds?: Set<string>): Promise<number> {
    const sessions = (await this.sessions(orgId, from, to)).filter(
      (s) => !s.isIdle && this.typeMatch(s.type, type) && (!empIds || empIds.has(s.employeeId)),
    );
    return sessions.reduce((t, s) => t + s.durationSec, 0);
  }

  private typeMatch(sessionType: string, filter: UsageTypeFilter): boolean {
    if (filter === "all") return true;
    if (filter === "app") return sessionType === UsageType.APP;
    return sessionType === UsageType.WEB;
  }

  async appWebsiteUsage(
    orgId: string,
    opts: { from?: string; to?: string; type?: UsageTypeFilter; employeeIds?: string[]; compare?: ComparePeriod } = {},
  ): Promise<AppWebsiteUsageReport> {
    const r = this.range(opts.from, opts.to);
    const type: UsageTypeFilter = opts.type ?? "all";
    const empIds = opts.employeeIds?.length ? new Set(opts.employeeIds) : undefined;

    const [employees, allSessions] = await Promise.all([
      this.prisma.employee.findMany({ where: { orgId }, select: { id: true, name: true } }),
      this.sessions(orgId, r.from, r.to),
    ]);
    const nameById = new Map(employees.map((e) => [e.id, e.name]));
    const sessions = allSessions.filter(
      (s) => !s.isIdle && this.typeMatch(s.type, type) && (!empIds || empIds.has(s.employeeId)),
    );

    const byName = new Map<string, { type: UsageType; sec: number }>();
    const byDay = new Map<string, { appSec: number; webSec: number }>();
    const byEmp = new Map<string, number>();
    let totalActive = 0;

    for (const s of sessions) {
      totalActive += s.durationSec;
      const key = `${s.type}::${s.name}`;
      const e = byName.get(key) ?? { type: s.type as UsageType, sec: 0 };
      e.sec += s.durationSec;
      byName.set(key, e);

      const day = s.startedAt.toISOString().slice(0, 10);
      const d = byDay.get(day) ?? { appSec: 0, webSec: 0 };
      if (s.type === UsageType.WEB) d.webSec += s.durationSec;
      else d.appSec += s.durationSec;
      byDay.set(day, d);

      byEmp.set(s.employeeId, (byEmp.get(s.employeeId) ?? 0) + s.durationSec);
    }

    const detailed = Array.from(byName.entries())
      .map(([key, v]) => ({ name: key.split("::")[1], type: v.type, totalSec: v.sec }))
      .sort((a, b) => b.totalSec - a.totalSec);

    const topApp = detailed.find((d) => d.type === UsageType.APP) ?? null;
    const topWeb = detailed.find((d) => d.type === UsageType.WEB) ?? null;
    const dailyTrend = Array.from(byDay.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const byEmployee = Array.from(byEmp.entries())
      .map(([employeeId, totalSec]) => ({ employeeId, employeeName: nameById.get(employeeId) ?? "—", totalSec }))
      .sort((a, b) => b.totalSec - a.totalSec);

    // compare vs a prior window of equal length
    let compare: AppWebsiteUsageReport["compare"] = null;
    const cmp = opts.compare ?? "none";
    if (cmp !== "none") {
      const span = r.to.getTime() - r.from.getTime();
      let pFrom = new Date(r.from.getTime() - span);
      let pTo = new Date(r.from.getTime());
      if (cmp === "previous_week") { pFrom = new Date(r.from.getTime() - 7 * 86400_000); pTo = new Date(r.to.getTime() - 7 * 86400_000); }
      else if (cmp === "previous_month") { pFrom = new Date(r.from.getTime() - 30 * 86400_000); pTo = new Date(r.to.getTime() - 30 * 86400_000); }
      const prev = await this.activeSecIn(orgId, pFrom, pTo, type, empIds);
      const deltaPct = prev > 0 ? Math.round(((totalActive - prev) / prev) * 1000) / 10 : (totalActive > 0 ? 100 : 0);
      compare = { prevActiveSec: prev, deltaPct };
    }

    return {
      from: r.from.toISOString(),
      to: r.to.toISOString(),
      summary: {
        totalActiveSec: totalActive,
        shiftSec: 0, // needs shift config; later phase
        overtimeSec: 0, // needs shift config; later phase
        topApp: topApp ? { name: topApp.name, sec: topApp.totalSec } : null,
        topWebsite: topWeb ? { name: topWeb.name, sec: topWeb.totalSec } : null,
        appCount: detailed.filter((d) => d.type === UsageType.APP).length,
        siteCount: detailed.filter((d) => d.type === UsageType.WEB).length,
      },
      compare,
      topUsage: detailed.slice(0, 10),
      dailyTrend,
      detailed,
      byEmployee,
    };
  }

  /** The emailed "Team Productivity Snapshot": summary + distractions + top apps/sites + per-employee highlights. */
  async teamSnapshot(orgId: string, from?: string, to?: string): Promise<TeamSnapshotReport> {
    const r = this.range(from, to);
    const [employees, sessions] = await Promise.all([
      this.prisma.employee.findMany({ where: { orgId }, select: { id: true, name: true } }),
      this.sessions(orgId, r.from, r.to),
    ]);
    const nameById = new Map(employees.map((e) => [e.id, e.name]));
    const isDistracting = (host: string) =>
      ["youtube", "linkedin", "facebook", "instagram", "twitter", "x.com", "reddit", "netflix", "spotify", "tiktok", "twitch", "primevideo", "hotstar"].some((k) => host.toLowerCase().includes(k));

    let activeSec = 0;
    let idleSec = 0;
    const activeEmp = new Set<string>();
    interface PE { active: number; idle: number; switches: number; byHour: number[]; byName: Map<string, number> }
    const perEmp = new Map<string, PE>();
    const appAgg = new Map<string, Map<string, number>>();
    const webAgg = new Map<string, Map<string, number>>();
    const distractAgg = new Map<string, Map<string, number>>();
    const bump = (agg: Map<string, Map<string, number>>, key: string, empId: string, sec: number) => {
      const m = agg.get(key) ?? new Map<string, number>();
      m.set(empId, (m.get(empId) ?? 0) + sec);
      agg.set(key, m);
    };

    for (const s of sessions) {
      const pe = perEmp.get(s.employeeId) ?? { active: 0, idle: 0, switches: 0, byHour: new Array(24).fill(0), byName: new Map() };
      if (s.isIdle) {
        idleSec += s.durationSec;
        pe.idle += s.durationSec;
      } else {
        activeSec += s.durationSec;
        activeEmp.add(s.employeeId);
        pe.active += s.durationSec;
        pe.switches += 1;
        pe.byHour[s.startedAt.getHours()] += s.durationSec;
        pe.byName.set(s.name, (pe.byName.get(s.name) ?? 0) + s.durationSec);
        if (s.type === UsageType.WEB) {
          bump(webAgg, s.name, s.employeeId, s.durationSec);
          if (isDistracting(s.name)) bump(distractAgg, s.name, s.employeeId, s.durationSec);
        } else {
          bump(appAgg, s.name, s.employeeId, s.durationSec);
        }
      }
      perEmp.set(s.employeeId, pe);
    }

    const totalTracked = activeSec + idleSec;
    const toRows = (agg: Map<string, Map<string, number>>, limit: number): SnapshotRow[] =>
      [...agg.entries()]
        .map(([name, m]) => ({
          name,
          totalSec: [...m.values()].reduce((a, b) => a + b, 0),
          contributors: [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id, sec]) => ({ name: nameById.get(id) ?? "—", sec })),
        }))
        .sort((a, b) => b.totalSec - a.totalSec)
        .slice(0, limit);

    const highlights: SnapshotHighlight[] = employees
      .map((e) => {
        const pe = perEmp.get(e.id);
        if (!pe || pe.active + pe.idle === 0) return null;
        const peakIdx = pe.byHour.reduce((mi, v, i, arr) => (v > arr[mi] ? i : mi), 0);
        const prod = pe.active + pe.idle > 0 ? pe.active / (pe.active + pe.idle) : 0;
        const focusScore = pe.active < 1800 ? "E" : prod >= 0.8 ? "A" : prod >= 0.65 ? "B" : prod >= 0.5 ? "C" : prod >= 0.35 ? "D" : "E";
        return {
          employeeId: e.id,
          name: e.name,
          totalHours: Math.round((pe.active / 3600) * 100) / 100,
          focusScore,
          contextSwitches: pe.switches,
          peakHour: `${String(peakIdx).padStart(2, "0")}:00`,
          majorActivities: [...pe.byName.entries()].filter(([, sec]) => sec >= 1800).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, sec]) => ({ name, sec })),
        };
      })
      .filter((x): x is SnapshotHighlight => x !== null)
      .sort((a, b) => b.totalHours - a.totalHours);

    return {
      from: r.from.toISOString(),
      to: r.to.toISOString(),
      activeEmployees: activeEmp.size,
      totalEmployees: employees.length,
      totalTrackedHours: Math.round((totalTracked / 3600) * 100) / 100,
      activeHours: Math.round((activeSec / 3600) * 100) / 100,
      idleHours: Math.round((idleSec / 3600) * 100) / 100,
      activityScorePct: totalTracked > 0 ? Math.round((activeSec / totalTracked) * 10000) / 100 : 0,
      topDistractions: toRows(distractAgg, 6),
      topApps: toRows(appAgg, 5),
      topWebsites: toRows(webAgg, 5),
      highlights,
    };
  }

  /** Raw foreground-activity spans for one employee in a window (Work Replay timeline). */
  async activity(orgId: string, employeeId: string, from?: string, to?: string): Promise<ActivitySpan[]> {
    const r = this.range(from, to);
    const rows = await this.prisma.activitySession.findMany({
      where: { orgId, employeeId, startedAt: { gte: r.from, lte: r.to } },
      select: { name: true, type: true, startedAt: true, endedAt: true, isIdle: true, durationSec: true },
      orderBy: { startedAt: "asc" },
    });
    return rows.map((s) => ({
      name: s.name,
      type: s.type as UsageType,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt.toISOString(),
      isIdle: s.isIdle,
      durationSec: s.durationSec,
    }));
  }

  /** Drill-down for one app/website: total + usage-by-employee + day-wise breakdown. */
  async appWebsiteDetail(
    orgId: string,
    opts: { name: string; type?: UsageTypeFilter; from?: string; to?: string; employeeIds?: string[] },
  ): Promise<AppWebsiteDetail> {
    const r = this.range(opts.from, opts.to);
    const empIds = opts.employeeIds?.length ? new Set(opts.employeeIds) : undefined;
    const wantType = opts.type === "web" ? UsageType.WEB : opts.type === "app" ? UsageType.APP : undefined;

    const [employees, sessions] = await Promise.all([
      this.prisma.employee.findMany({ where: { orgId }, select: { id: true, name: true } }),
      this.sessions(orgId, r.from, r.to),
    ]);
    const nameById = new Map(employees.map((e) => [e.id, e.name]));

    const matched = sessions.filter(
      (s) => !s.isIdle && s.name === opts.name && (!wantType || s.type === wantType) && (!empIds || empIds.has(s.employeeId)),
    );

    let totalSec = 0;
    let type: UsageType = wantType ?? UsageType.APP;
    const byEmp = new Map<string, number>();
    const byDay = new Map<string, number>();
    for (const s of matched) {
      totalSec += s.durationSec;
      type = s.type as UsageType;
      byEmp.set(s.employeeId, (byEmp.get(s.employeeId) ?? 0) + s.durationSec);
      const dk = dayKey(s.startedAt);
      byDay.set(dk, (byDay.get(dk) ?? 0) + s.durationSec);
    }

    return {
      name: opts.name,
      type,
      totalSec,
      shiftSec: 0,
      overtimeSec: 0,
      byEmployee: Array.from(byEmp.entries())
        .map(([employeeId, sec]) => ({ employeeId, employeeName: nameById.get(employeeId) ?? "—", sec }))
        .sort((a, b) => b.sec - a.sec),
      byDay: Array.from(byDay.entries())
        .map(([date, sec]) => ({ date, sec }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async productivityTrends(
    orgId: string,
    from?: string,
    to?: string,
  ): Promise<ProductivityTrendsReport> {
    const r = this.range(from, to);
    const span = r.to.getTime() - r.from.getTime();
    const prevFrom = new Date(r.from.getTime() - span);
    const prevTo = new Date(r.from.getTime());

    const [employees, sessions, prevSessions] = await Promise.all([
      this.prisma.employee.findMany({
        where: { orgId },
        select: { id: true, name: true, teamId: true, team: { select: { name: true } } },
      }),
      this.sessions(orgId, r.from, r.to),
      this.sessions(orgId, prevFrom, prevTo),
    ]);

    let usage = 0;
    let idle = 0;
    let weekendSec = 0;
    const weekday = WEEKDAY_LABELS.map((label, i) => ({ weekday: i, label, active: 0, idle: 0 }));
    const drivers = new Map<string, { type: UsageType; sec: number }>();
    const perEmp = new Map<string, { usage: number; idle: number }>();
    const byDay = new Map<string, { active: number; idle: number }>();

    for (const s of sessions) {
      if (s.isIdle) idle += s.durationSec;
      else usage += s.durationSec;
      const dow = s.startedAt.getDay();
      const wd = weekday[dow];
      if (s.isIdle) wd.idle += s.durationSec;
      else wd.active += s.durationSec;
      if (!s.isIdle && (dow === 0 || dow === 6)) weekendSec += s.durationSec;

      if (!s.isIdle) {
        const key = `${s.type}::${s.name}`;
        const d = drivers.get(key) ?? { type: s.type as UsageType, sec: 0 };
        d.sec += s.durationSec;
        drivers.set(key, d);
      }
      const pe = perEmp.get(s.employeeId) ?? { usage: 0, idle: 0 };
      if (s.isIdle) pe.idle += s.durationSec;
      else pe.usage += s.durationSec;
      perEmp.set(s.employeeId, pe);

      const dk = dayKey(s.startedAt);
      const bd = byDay.get(dk) ?? { active: 0, idle: 0 };
      if (s.isIdle) bd.idle += s.durationSec;
      else bd.active += s.durationSec;
      byDay.set(dk, bd);
    }

    // previous period per-employee active + totals (for deltas / strongest gain)
    const prevActiveByEmp = new Map<string, number>();
    let prevUsage = 0;
    let prevIdle = 0;
    for (const s of prevSessions) {
      if (s.isIdle) { prevIdle += s.durationSec; continue; }
      prevUsage += s.durationSec;
      prevActiveByEmp.set(s.employeeId, (prevActiveByEmp.get(s.employeeId) ?? 0) + s.durationSec);
    }

    const logged = usage + idle;
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    const idleBurden = { low: 0, moderate: 0, high: 0, critical: 0 };
    let scoreSum = 0;
    let activeEmployees = 0;
    let needAttention = 0;
    let strongestGain: ProductivityTrendsReport["snapshot"]["strongestGain"] = null;

    const empRows = employees.map((e) => {
      const pe = perEmp.get(e.id) ?? { usage: 0, idle: 0 };
      const total = pe.usage + pe.idle;
      const idlePct = pct(pe.idle, total);
      const prodPct = pct(pe.usage, total);
      if (total > 0) {
        activeEmployees++;
        scoreSum += prodPct;
        if (idlePct < 20) idleBurden.low++;
        else if (idlePct < 40) idleBurden.moderate++;
        else if (idlePct < 60) idleBurden.high++;
        else idleBurden.critical++;
        if (idlePct >= 40) needAttention++;
      }
      const trendDeltaSec = pe.usage - (prevActiveByEmp.get(e.id) ?? 0);
      if (trendDeltaSec > 0 && (!strongestGain || trendDeltaSec > strongestGain.deltaSec)) {
        strongestGain = { employeeId: e.id, employeeName: e.name, deltaSec: trendDeltaSec };
      }
      return {
        employeeId: e.id,
        employeeName: e.name,
        productivityPct: prodPct,
        idlePct,
        activeSec: pe.usage,
        idleSec: pe.idle,
        trendDeltaSec,
        alert: (idlePct >= 40 ? "HIGH_IDLE" : "OK") as "OK" | "HIGH_IDLE",
      };
    });

    // teams aggregation
    const teamAcc = new Map<string, { teamId: string | null; teamName: string; active: number; idle: number; emps: Set<string> }>();
    for (const e of employees) {
      const key = e.teamId ?? "__none__";
      const t = teamAcc.get(key) ?? { teamId: e.teamId, teamName: e.team?.name ?? "No team", active: 0, idle: 0, emps: new Set() };
      const pe = perEmp.get(e.id);
      if (pe) { t.active += pe.usage; t.idle += pe.idle; }
      t.emps.add(e.id);
      teamAcc.set(key, t);
    }
    const teams = Array.from(teamAcc.values())
      .map((t) => ({ teamId: t.teamId, teamName: t.teamName, employeeCount: t.emps.size, activeSec: t.active, idleSec: t.idle, productivityPct: pct(t.active, t.active + t.idle) }))
      .sort((a, b) => b.activeSec - a.activeSec);

    // daily series (fill every day in range)
    const daily: { date: string; activeSec: number; idleSec: number; productivityPct: number }[] = [];
    for (let d = new Date(r.from); d <= r.to; d.setDate(d.getDate() + 1)) {
      const k = dayKey(d);
      const bd = byDay.get(k) ?? { active: 0, idle: 0 };
      daily.push({ date: k, activeSec: bd.active, idleSec: bd.idle, productivityPct: pct(bd.active, bd.active + bd.idle) });
    }

    return {
      from: r.from.toISOString(),
      to: r.to.toISOString(),
      overview: { loggedSec: logged, activePct: pct(usage, logged), idlePct: pct(idle, logged) },
      snapshot: {
        activeEmployees,
        totalEmployees: employees.length,
        needAttention,
        weekendSec,
        strongestGain,
      },
      kpis: {
        productivityPct: pct(usage, logged),
        activeSec: usage,
        activeDeltaSec: usage - prevUsage,
        idleSec: idle,
        idleDeltaSec: idle - prevIdle,
        avgScore: activeEmployees > 0 ? Math.round((scoreSum / activeEmployees) * 10) / 10 : 0,
      },
      daily,
      weekday: weekday.map((w) => ({
        weekday: w.weekday,
        label: w.label,
        productivityPct: pct(w.active, w.active + w.idle),
        activeSec: w.active,
        idleSec: w.idle,
      })),
      topDrivers: Array.from(drivers.entries())
        .map(([key, v]) => ({ type: v.type, name: key.split("::")[1], activeSec: v.sec }))
        .sort((a, b) => b.activeSec - a.activeSec)
        .slice(0, 12),
      idleBurden,
      teams,
      employees: empRows.sort((a, b) => b.productivityPct - a.productivityPct),
    };
  }
}
