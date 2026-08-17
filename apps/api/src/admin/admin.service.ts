import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PlanTier, PLANS } from "@eagle/shared";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { InvoicesService } from "../invoices/invoices.service";
import type { RequestAdmin } from "./current-admin.decorator";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly storage: StorageService,
    private readonly invoices: InvoicesService,
  ) {}

  private planAmount(tier: string, cycle: string, seats: number): number {
    const plan = PLANS[tier as PlanTier] ?? PLANS[PlanTier.BASIC];
    const perSeat = cycle === "MONTHLY" ? plan.monthly * 12 : plan.annual;
    return +(perSeat * Math.max(1, seats)).toFixed(2);
  }

  /** Org filter for the caller: salespeople see only their own clients; others see all. */
  private clientScope(a: RequestAdmin) {
    return a.role === "SALESPERSON" ? { salespersonId: a.adminId } : {};
  }
  private async scopedOrgIds(a: RequestAdmin): Promise<string[] | null> {
    if (a.role !== "SALESPERSON") return null; // null = all orgs
    const orgs = await this.prisma.organization.findMany({ where: { salespersonId: a.adminId }, select: { id: true } });
    return orgs.map((o) => o.id);
  }

  async login(email: string, password: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin || !admin.active || !bcrypt.compareSync(password, admin.passwordHash)) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, role: admin.role, email: admin.email, scope: "platform" },
      { secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access", expiresIn: process.env.JWT_ADMIN_TTL ?? "1d" },
    );
    return { accessToken, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } };
  }

  async overview(a: RequestAdmin) {
    const clientWhere = a.role === "SALESPERSON" ? { salespersonId: a.adminId } : {};
    const [clients, active, staff] = await Promise.all([
      this.prisma.organization.count({ where: clientWhere }),
      this.prisma.organization.count({ where: { ...clientWhere, status: "ACTIVE" } }),
      this.prisma.platformAdmin.groupBy({ by: ["role"], _count: true }),
    ]);
    const byRole = Object.fromEntries(staff.map((s) => [s.role, s._count]));
    return {
      clients,
      activeClients: active,
      suspendedClients: clients - active,
      superAdmins: byRole.SUPER_ADMIN ?? 0,
      subAdmins: byRole.SUB_ADMIN ?? 0,
      salespeople: byRole.SALESPERSON ?? 0,
    };
  }

  async listClients(a: RequestAdmin) {
    const where = a.role === "SALESPERSON" ? { salespersonId: a.adminId } : {};
    const orgs = await this.prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        subscription: true,
        salesperson: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
        users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } },
      },
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      status: o.status,
      employeeCount: o._count.employees,
      tier: o.subscription?.tier ?? null,
      seats: o.subscription?.seats ?? null,
      ownerName: o.users[0]?.name ?? null,
      ownerEmail: o.users[0]?.email ?? null,
      salespersonId: o.salespersonId,
      salespersonName: o.salesperson?.name ?? null,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  /** Subscriptions overview: every client's plan + seat usage + revenue, synced to the
   *  shared PLANS catalog so pricing/features match the client-facing Billing page. */
  async listSubscriptions(a: RequestAdmin) {
    const orgs = await this.prisma.organization.findMany({
      where: this.clientScope(a),
      orderBy: { createdAt: "desc" },
      include: {
        subscription: true,
        users: { where: { role: "OWNER" }, take: 1, select: { email: true } },
      },
    });

    const clients = await Promise.all(
      orgs.map(async (o) => {
        const tier = (o.subscription?.tier ?? PlanTier.BASIC) as PlanTier;
        const seats = o.subscription?.seats ?? 0;
        const cycle = o.subscription?.cycle ?? "ANNUALLY";
        const usedSeats = await this.prisma.employee.count({ where: { orgId: o.id, active: true } });
        const perSeatYear = cycle === "MONTHLY" ? PLANS[tier].monthly * 12 : PLANS[tier].annual;
        return {
          id: o.id,
          name: o.name,
          status: o.status,
          ownerEmail: o.users[0]?.email ?? null,
          tier,
          cycle,
          seats,
          usedSeats,
          perSeatYear: Number(perSeatYear.toFixed(2)),
          annualRevenue: Number((perSeatYear * seats).toFixed(2)),
          validUntil: o.subscription?.validUntil?.toISOString() ?? null,
        };
      }),
    );

    const sum = (f: (c: (typeof clients)[number]) => number) => clients.reduce((s, c) => s + f(c), 0);
    const arr = Number(sum((c) => c.annualRevenue).toFixed(2));
    return {
      clients,
      plans: PLANS,
      totals: {
        clients: clients.length,
        seatsSold: sum((c) => c.seats),
        seatsUsed: sum((c) => c.usedSeats),
        arr,
        mrr: Number((arr / 12).toFixed(2)),
        byTier: {
          BASIC: clients.filter((c) => c.tier === PlanTier.BASIC).length,
          PROFESSIONAL: clients.filter((c) => c.tier === PlanTier.PROFESSIONAL).length,
          BUSINESS: clients.filter((c) => c.tier === PlanTier.BUSINESS).length,
        },
      },
    };
  }

  /** Cross-client screenshot browser (Super/Sub see all; salespeople only their clients). */
  async listScreenshots(
    a: RequestAdmin,
    q: { clientId?: string; employeeId?: string; from?: string; to?: string; trigger?: string; page?: number; pageSize?: number },
  ) {
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(500, Math.max(1, Number(q.pageSize ?? 24))); // up to 500 so Work Replay can load a full day
    const where: any = {};
    const scope = await this.scopedOrgIds(a);
    if (scope) where.orgId = { in: scope };
    if (q.clientId) where.orgId = q.clientId;
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.trigger) where.trigger = q.trigger;
    if (q.from || q.to) {
      where.capturedAt = {};
      if (q.from) where.capturedAt.gte = new Date(q.from);
      if (q.to) where.capturedAt.lte = new Date(q.to);
    }

    const [total, rows] = await Promise.all([
      this.prisma.screenshot.count({ where }),
      this.prisma.screenshot.findMany({
        where,
        orderBy: { capturedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { employee: { select: { name: true } } },
      }),
    ]);

    // Screenshot has no org relation — resolve account names in one batch.
    const orgIds = Array.from(new Set(rows.map((r) => r.orgId)));
    const orgs = orgIds.length ? await this.prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [];
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));

    const items = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        orgId: r.orgId,
        accountName: orgName.get(r.orgId) ?? "—",
        employeeId: r.employeeId,
        employeeName: r.employee.name,
        capturedAt: r.capturedAt.toISOString(),
        trigger: r.trigger,
        app: r.app,
        url: r.url,
        isIdle: r.isIdle,
        imageUrl: await this.storage.presignGet(r.s3Key),
      })),
    );
    return { items, total, page, pageSize };
  }

  /** Watchable employees across all clients for the cross-client live wall. */
  async liveEmployees(a: RequestAdmin) {
    const scope = await this.scopedOrgIds(a);
    const where: any = { active: true, status: { in: ["ACTIVE", "IDLE"] } };
    if (scope) where.orgId = { in: scope };
    const emps = await this.prisma.employee.findMany({
      where,
      select: { id: true, name: true, orgId: true, status: true, lastApp: true, lastActiveAt: true },
      orderBy: { lastActiveAt: "desc" },
    });
    const orgIds = Array.from(new Set(emps.map((e) => e.orgId)));
    const orgs = orgIds.length ? await this.prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [];
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    return emps.map((e) => ({
      id: e.id,
      name: e.name,
      orgId: e.orgId,
      accountName: orgName.get(e.orgId) ?? "—",
      status: e.status,
      lastApp: e.lastApp,
      lastActiveAt: e.lastActiveAt?.toISOString() ?? null,
    }));
  }

  /** Platform-wide data footprint: totals + per-client breakdown (captures, tracked time). */
  async dataOverview(a: RequestAdmin) {
    const scope = await this.scopedOrgIds(a);
    const orgs = await this.prisma.organization.findMany({
      where: scope ? { id: { in: scope } } : {},
      select: { id: true, name: true, _count: { select: { employees: true } } },
    });
    const orgIds = orgs.map((o) => o.id);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [totalByOrg, monthByOrg, lastByOrg, actByOrg, drByStatus] = await Promise.all([
      this.prisma.screenshot.groupBy({ by: ["orgId"], where: { orgId: { in: orgIds } }, _count: true }),
      this.prisma.screenshot.groupBy({ by: ["orgId"], where: { orgId: { in: orgIds }, capturedAt: { gte: monthStart } }, _count: true }),
      this.prisma.screenshot.groupBy({ by: ["orgId"], where: { orgId: { in: orgIds } }, _max: { capturedAt: true } }),
      this.prisma.activitySession.groupBy({ by: ["orgId", "isIdle"], where: { orgId: { in: orgIds }, startedAt: { gte: monthStart } }, _sum: { durationSec: true } }),
      this.prisma.dataRequest.groupBy({ by: ["status"], where: { orgId: { in: orgIds }, source: "USER" }, _count: true }),
    ]);

    const totalMap = new Map(totalByOrg.map((r) => [r.orgId, r._count] as [string, number]));
    const monthMap = new Map(monthByOrg.map((r) => [r.orgId, r._count] as [string, number]));
    const lastMap = new Map(lastByOrg.map((r) => [r.orgId, r._max.capturedAt] as [string, Date | null]));
    const usageMap = new Map<string, number>();
    const idleMap = new Map<string, number>();
    for (const r of actByOrg) {
      (r.isIdle ? idleMap : usageMap).set(r.orgId, (r._sum.durationSec ?? 0) + ((r.isIdle ? idleMap : usageMap).get(r.orgId) ?? 0));
    }

    const clients = orgs
      .map((o) => {
        const usageH = (usageMap.get(o.id) ?? 0) / 3600;
        const idleH = (idleMap.get(o.id) ?? 0) / 3600;
        return {
          id: o.id,
          name: o.name,
          employees: o._count.employees,
          screenshots: totalMap.get(o.id) ?? 0,
          screenshotsThisMonth: monthMap.get(o.id) ?? 0,
          trackedHours: +(usageH + idleH).toFixed(1),
          usageHours: +usageH.toFixed(1),
          lastCapture: lastMap.get(o.id)?.toISOString() ?? null,
        };
      })
      .sort((x, y) => y.screenshots - x.screenshots);

    const drCount = (s: string) => drByStatus.filter((r) => r.status === s).reduce((n, r) => n + r._count, 0);
    return {
      totals: {
        clients: clients.length,
        screenshots: clients.reduce((s, c) => s + c.screenshots, 0),
        screenshotsThisMonth: clients.reduce((s, c) => s + c.screenshotsThisMonth, 0),
        trackedHours: +clients.reduce((s, c) => s + c.trackedHours, 0).toFixed(1),
        activeRequests: drCount("PENDING") + drCount("PROCESSING"),
        completedRequests: drCount("COMPLETED"),
      },
      clients,
    };
  }

  /** Cross-client data requests (export/delete) with account labels + filters. */
  async listDataRequests(a: RequestAdmin, q: { clientId?: string; status?: string; action?: string; includeAutomated?: boolean; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 25)));
    const where: any = {};
    const scope = await this.scopedOrgIds(a);
    if (scope) where.orgId = { in: scope };
    if (q.clientId) where.orgId = q.clientId;
    if (!q.includeAutomated) where.source = "USER";
    if (q.status && q.status !== "ALL") where.status = q.status;
    if (q.action && q.action !== "ALL") where.action = q.action;

    const [total, rows] = await Promise.all([
      this.prisma.dataRequest.count({ where }),
      this.prisma.dataRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { org: { select: { name: true } } } }),
    ]);
    const empIds = rows.map((r) => r.targetEmployeeId).filter(Boolean) as string[];
    const teamIds = rows.map((r) => r.targetTeamId).filter(Boolean) as string[];
    const [emps, teams] = await Promise.all([
      this.prisma.employee.findMany({ where: { id: { in: empIds } }, select: { id: true, name: true } }),
      this.prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
    ]);
    const empMap = new Map(emps.map((e) => [e.id, e.name]));
    const teamMap = new Map(teams.map((t) => [t.id, t.name]));

    const items = rows.map((r) => ({
      id: r.id,
      accountName: r.org.name,
      source: r.source,
      action: r.action,
      dataType: r.dataType,
      target: r.source === "SYSTEM" ? "Entire org" : r.targetTeamId ? (teamMap.get(r.targetTeamId) ?? "Team") : r.targetEmployeeId ? (empMap.get(r.targetEmployeeId) ?? "Employee") : "Entire org",
      rangeFrom: r.rangeFrom?.toISOString() ?? null,
      rangeTo: r.rangeTo?.toISOString() ?? null,
      status: r.status,
      requestedAt: r.createdAt.toISOString(),
    }));
    return { items, total, page, pageSize };
  }

  /** Aggregate reports: tracked/usage/idle time + productivity per client over a range. */
  async reportsOverview(a: RequestAdmin, q: { from?: string; to?: string }) {
    const scope = await this.scopedOrgIds(a);
    const orgs = await this.prisma.organization.findMany({ where: scope ? { id: { in: scope } } : {}, select: { id: true, name: true } });
    const orgIds = orgs.map((o) => o.id);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 7 * 86400_000);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    const rangeWhere = { orgId: { in: orgIds }, startedAt: { gte: from, lte: to } };

    const [actByOrg, empByOrg, shotsByOrg, appByOrg] = await Promise.all([
      this.prisma.activitySession.groupBy({ by: ["orgId", "isIdle"], where: rangeWhere, _sum: { durationSec: true } }),
      this.prisma.activitySession.groupBy({ by: ["orgId", "employeeId"], where: rangeWhere, _count: true }),
      this.prisma.screenshot.groupBy({ by: ["orgId"], where: { orgId: { in: orgIds }, capturedAt: { gte: from, lte: to } }, _count: true }),
      this.prisma.activitySession.groupBy({ by: ["orgId", "name"], where: { ...rangeWhere, isIdle: false }, _sum: { durationSec: true } }),
    ]);

    const usageMap = new Map<string, number>();
    const idleMap = new Map<string, number>();
    for (const r of actByOrg) (r.isIdle ? idleMap : usageMap).set(r.orgId, r._sum.durationSec ?? 0);
    const activeEmpMap = new Map<string, number>();
    for (const r of empByOrg) activeEmpMap.set(r.orgId, (activeEmpMap.get(r.orgId) ?? 0) + 1);
    const shotsMap = new Map(shotsByOrg.map((r) => [r.orgId, r._count] as [string, number]));
    const topAppMap = new Map<string, { name: string; sec: number }>();
    for (const r of appByOrg) {
      const cur = topAppMap.get(r.orgId);
      const sec = r._sum.durationSec ?? 0;
      if (!cur || sec > cur.sec) topAppMap.set(r.orgId, { name: r.name, sec });
    }

    const clients = orgs
      .map((o) => {
        const usageH = (usageMap.get(o.id) ?? 0) / 3600;
        const idleH = (idleMap.get(o.id) ?? 0) / 3600;
        const tracked = usageH + idleH;
        return {
          id: o.id,
          name: o.name,
          activeEmployees: activeEmpMap.get(o.id) ?? 0,
          trackedHours: +tracked.toFixed(1),
          usageHours: +usageH.toFixed(1),
          idleHours: +idleH.toFixed(1),
          productivity: tracked > 0 ? Math.round((usageH / tracked) * 100) : 0,
          screenshots: shotsMap.get(o.id) ?? 0,
          topApp: topAppMap.get(o.id)?.name ?? null,
        };
      })
      .sort((x, y) => y.trackedHours - x.trackedHours);

    const usageTotal = clients.reduce((s, c) => s + c.usageHours, 0);
    const trackedTotal = clients.reduce((s, c) => s + c.trackedHours, 0);
    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        activeEmployees: clients.reduce((s, c) => s + c.activeEmployees, 0),
        trackedHours: +trackedTotal.toFixed(1),
        usageHours: +usageTotal.toFixed(1),
        idleHours: +clients.reduce((s, c) => s + c.idleHours, 0).toFixed(1),
        productivity: trackedTotal > 0 ? Math.round((usageTotal / trackedTotal) * 100) : 0,
        screenshots: clients.reduce((s, c) => s + c.screenshots, 0),
      },
      clients,
    };
  }

  /** Cross-client support inbox: tickets from every client, with account labels + filters. */
  async listSupport(a: RequestAdmin, q: { clientId?: string; status?: string; kind?: string }) {
    const scope = await this.scopedOrgIds(a);
    const where: any = {};
    if (scope) where.orgId = { in: scope };
    if (q.clientId) where.orgId = q.clientId;
    if (q.status && q.status !== "ALL") where.status = q.status;
    if (q.kind && q.kind !== "ALL") where.kind = q.kind;

    const [rows, byStatus] = await Promise.all([
      this.prisma.supportRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { org: { select: { name: true } } } }),
      this.prisma.supportRequest.groupBy({ by: ["status"], where: scope ? { orgId: { in: scope } } : {}, _count: true }),
    ]);
    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count]));
    const items = rows.map((r) => ({
      id: r.id,
      requestId: `SR-${r.id.slice(-6).toUpperCase()}`,
      accountName: r.org.name,
      kind: r.kind,
      subject: r.subject,
      description: r.description,
      contactName: r.contactName,
      contactEmail: r.contactEmail,
      contactPhone: r.contactPhone,
      createdBy: r.createdBy,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    return { items, counts };
  }

  async updateSupport(a: RequestAdmin, id: string, status: string) {
    const scope = await this.scopedOrgIds(a);
    const req = await this.prisma.supportRequest.findFirst({ where: { id, ...(scope ? { orgId: { in: scope } } : {}) } });
    if (!req) throw new NotFoundException("Ticket not found");
    await this.prisma.supportRequest.update({ where: { id }, data: { status } });
    return { ok: true };
  }

  /** Full ticket + reply thread (admin view). */
  async supportThread(a: RequestAdmin, id: string) {
    const scope = await this.scopedOrgIds(a);
    const t = await this.prisma.supportRequest.findFirst({
      where: { id, ...(scope ? { orgId: { in: scope } } : {}) },
      include: { org: { select: { name: true } }, messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!t) throw new NotFoundException("Ticket not found");
    return {
      id: t.id,
      requestId: `SR-${t.id.slice(-6).toUpperCase()}`,
      accountName: t.org.name,
      kind: t.kind,
      subject: t.subject,
      description: t.description,
      status: t.status,
      contactEmail: t.contactEmail,
      createdBy: t.createdBy,
      createdAt: t.createdAt.toISOString(),
      messages: t.messages.map((m) => ({ id: m.id, author: m.author, authorName: m.authorName, body: m.body, createdAt: m.createdAt.toISOString() })),
    };
  }

  /** Post a staff reply; nudges status to In Progress and pings the client's bell. */
  async replySupport(a: RequestAdmin, id: string, body: string) {
    if (!body?.trim()) throw new BadRequestException("Message is required.");
    const scope = await this.scopedOrgIds(a);
    const t = await this.prisma.supportRequest.findFirst({ where: { id, ...(scope ? { orgId: { in: scope } } : {}) } });
    if (!t) throw new NotFoundException("Ticket not found");
    await this.prisma.supportMessage.create({ data: { requestId: id, author: "ADMIN", authorName: a.email, body: body.trim() } });
    await this.prisma.supportRequest.update({ where: { id }, data: { status: t.status === "OPEN" ? "IN_PROGRESS" : t.status } });
    await this.prisma.notification.create({
      data: { audience: "ORG", orgId: t.orgId, kind: "INFO", title: `Support reply · SR-${id.slice(-6).toUpperCase()}`, body: body.trim().slice(0, 160), createdBy: a.email },
    });
    return { ok: true };
  }

  /** Employees of one client (for the screenshot filter dropdown), scope-checked. */
  async clientEmployees(a: RequestAdmin, orgId: string) {
    const org = await this.prisma.organization.findFirst({ where: { id: orgId, ...this.clientScope(a) }, select: { id: true } });
    if (!org) throw new NotFoundException("Client not found");
    return this.prisma.employee.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  async createClient(
    a: RequestAdmin,
    d: {
      name: string; ownerName: string; ownerEmail: string; ownerPassword: string;
      tier?: string; seats?: number; salespersonId?: string;
      withInvoice?: boolean; invoiceNo?: string; invoiceStatus?: string;
    },
  ) {
    const email = d.ownerEmail.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new BadRequestException("A user with that owner email already exists.");
    }
    const tier = d.tier ?? "PROFESSIONAL";
    const seats = d.seats ?? 10;
    const org = await this.prisma.organization.create({
      data: {
        name: d.name.trim(),
        salespersonId: d.salespersonId || (a.role === "SALESPERSON" ? a.adminId : null),
      },
    });
    await this.prisma.user.create({
      data: { orgId: org.id, email, name: d.ownerName.trim(), passwordHash: bcrypt.hashSync(d.ownerPassword, 10), role: "OWNER" },
    });
    await this.prisma.subscription.create({ data: { orgId: org.id, tier, seats } });
    await this.prisma.trackingSetting.create({ data: { orgId: org.id } });

    // Optionally issue an initial invoice for the plan they're onboarding onto.
    if (d.withInvoice || d.invoiceNo?.trim()) {
      await this.invoices.create({
        orgId: org.id, tier, cycle: "ANNUALLY", seats,
        amount: this.planAmount(tier, "ANNUALLY", seats), currency: "USD",
        status: d.invoiceStatus === "PAID" ? "PAID" : "DUE",
        source: "MANUAL", number: d.invoiceNo?.trim() || undefined, createdBy: a.email,
      });
    }
    return { id: org.id };
  }

  // ---- invoices (platform-wide) ----
  async listInvoices(a: RequestAdmin, f: { clientId?: string; status?: string; from?: string; to?: string }) {
    const orgIds = await this.scopedOrgIds(a);
    return this.invoices.listAll({ orgIds, ...f });
  }
  async getInvoice(a: RequestAdmin, id: string) {
    const inv = await this.invoices.getById(id);
    if (!inv) throw new NotFoundException("Invoice not found");
    const scope = await this.scopedOrgIds(a);
    if (scope && !scope.includes(inv.orgId)) throw new ForbiddenException("Not one of your clients.");
    return inv;
  }
  async createInvoice(a: RequestAdmin, d: { orgId: string; tier: string; cycle: string; seats: number; status?: string; number?: string; note?: string; amount?: number }) {
    const scope = await this.scopedOrgIds(a);
    const org = await this.prisma.organization.findFirst({ where: { id: d.orgId, ...(scope ? { id: { in: scope } } : {}) } });
    if (!org) throw new NotFoundException("Client not found");
    const seats = Math.max(1, Math.floor(d.seats));
    return this.invoices.create({
      orgId: d.orgId, tier: d.tier, cycle: d.cycle, seats,
      amount: d.amount != null ? +Number(d.amount).toFixed(2) : this.planAmount(d.tier, d.cycle, seats),
      currency: "USD", status: d.status === "PAID" ? "PAID" : "DUE", source: "MANUAL",
      number: d.number?.trim() || undefined, note: d.note?.trim() || null, createdBy: a.email,
    });
  }

  /**
   * "Act as client": mint an ORG-scoped token for the client's owner so the admin can
   * open the full client dashboard (live view, screenshots, reports, settings, seats…).
   * The token carries no `platform` scope, so it passes the normal org guards; `actAs`
   * records which admin is impersonating for auditing.
   */
  async impersonate(a: RequestAdmin, orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { users: { where: { role: "OWNER" }, take: 1 } },
    });
    if (!org) throw new NotFoundException("Client not found");
    // Salespeople may only open their own accounts; Super/Sub admins can open any.
    if (a.role === "SALESPERSON" && org.salespersonId !== a.adminId) {
      throw new ForbiddenException("You can only open clients assigned to you.");
    }
    const owner = org.users[0];
    if (!owner) throw new BadRequestException("This client has no owner account to act as.");

    const payload = { sub: owner.id, orgId: org.id, role: owner.role, email: owner.email, actAs: a.adminId };
    const sign = (secret: string, expiresIn: string) =>
      this.jwt.signAsync(payload, { secret, expiresIn });
    const accessToken = await sign(process.env.JWT_ACCESS_SECRET ?? "change-me-access", process.env.JWT_IMPERSONATE_TTL ?? "8h");
    const refreshToken = await sign(process.env.JWT_REFRESH_SECRET ?? "change-me-refresh", "8h");
    return {
      accessToken,
      refreshToken,
      user: { id: owner.id, email: owner.email, name: owner.name, role: owner.role, orgId: org.id, orgName: org.name },
    };
  }

  async updateClient(id: string, d: { status?: string; salespersonId?: string | null; tier?: string; seats?: number; cycle?: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException("Client not found");
    await this.prisma.organization.update({
      where: { id },
      data: {
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.salespersonId !== undefined ? { salespersonId: d.salespersonId || null } : {}),
      },
    });
    if (d.tier !== undefined || d.seats !== undefined || d.cycle !== undefined) {
      const sub = { ...(d.tier ? { tier: d.tier } : {}), ...(d.seats ? { seats: d.seats } : {}), ...(d.cycle ? { cycle: d.cycle } : {}) };
      await this.prisma.subscription.upsert({ where: { orgId: id }, create: { orgId: id, ...sub }, update: sub });
    }
    return { ok: true };
  }

  // ---- platform staff (Super Admin only; enforced in controller) ----
  listStaff() {
    return this.prisma.platformAdmin.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
  }

  async createStaff(d: { name: string; email: string; password: string; role: string }) {
    const email = d.email.trim().toLowerCase();
    if (await this.prisma.platformAdmin.findUnique({ where: { email } })) {
      throw new BadRequestException("A staff member with that email already exists.");
    }
    const admin = await this.prisma.platformAdmin.create({
      data: { name: d.name.trim(), email, passwordHash: bcrypt.hashSync(d.password, 10), role: d.role },
    });
    return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
  }

  async updateStaff(id: string, d: { active?: boolean; role?: string }) {
    const s = await this.prisma.platformAdmin.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Staff not found");
    return this.prisma.platformAdmin.update({
      where: { id },
      data: { ...(d.active !== undefined ? { active: d.active } : {}), ...(d.role !== undefined ? { role: d.role } : {}) },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  }
}
