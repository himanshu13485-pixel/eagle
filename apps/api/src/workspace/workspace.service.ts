import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QuotaService } from "../storage/quota.service";

const ACTIVE_REQUEST_LIMIT = 5;
const MAX_DAYS_PER_REQUEST: Record<string, number> = { BASIC: 14, PROFESSIONAL: 14, BUSINESS: 31 };

interface DataReqQuery {
  search?: string;
  /** Exact employee filter, from the User dropdown. Preferred over `search`,
   *  which matches on name and so collapses two people with the same name. */
  employeeId?: string;
  status?: string;
  action?: string;
  includeAutomated?: boolean;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
  ) {}

  // ---- Shifts ----
  async listShifts(orgId: string) {
    const rows = await this.prisma.shift.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
    return rows.map((s) => ({ ...s, workingDays: s.workingDays.split(",").filter(Boolean).map(Number) }));
  }
  createShift(
    orgId: string,
    d: { name: string; timezone: string; startTime: string; endTime: string; workingDays: number[] },
  ) {
    return this.prisma.shift.create({
      data: {
        orgId,
        name: d.name,
        timezone: d.timezone,
        startTime: d.startTime,
        endTime: d.endTime,
        workingDays: (d.workingDays ?? [1, 2, 3, 4, 5]).join(","),
      },
    });
  }
  async removeShift(orgId: string, id: string) {
    const s = await this.prisma.shift.findFirst({ where: { id, orgId } });
    if (!s) throw new NotFoundException("Shift not found");
    await this.prisma.shift.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Data requests ----
  private async maxDaysFor(orgId: string): Promise<number> {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId } });
    return MAX_DAYS_PER_REQUEST[sub?.tier ?? "PROFESSIONAL"] ?? 14;
  }

  async listDataRequests(orgId: string, q: DataReqQuery = {}) {
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 25)));
    const where: any = { orgId };
    if (!q.includeAutomated) where.source = "USER";
    if (q.status && q.status !== "ALL") where.status = q.status;
    if (q.action && q.action !== "ALL") where.action = q.action;
    if (q.employeeId) {
      // Scoped to the org so an id from another tenant cannot be probed.
      const emp = await this.prisma.employee.findFirst({
        where: { id: q.employeeId, orgId },
        select: { id: true },
      });
      where.targetEmployeeId = emp?.id ?? "__none__";
    } else if (q.search?.trim()) {
      const emps = await this.prisma.employee.findMany({
        where: { orgId, name: { contains: q.search.trim() } },
        select: { id: true },
      });
      where.targetEmployeeId = { in: emps.map((e) => e.id) };
    }

    const [total, rows, activeCount] = await Promise.all([
      this.prisma.dataRequest.count({ where }),
      this.prisma.dataRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.dataRequest.count({ where: { orgId, source: "USER", status: { in: ["PENDING", "PROCESSING"] } } }),
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
      source: r.source,
      action: r.action,
      dataType: r.dataType,
      targetLabel:
        r.source === "SYSTEM"
          ? "Entire Organization"
          : r.targetTeamId
            ? teamMap.get(r.targetTeamId) ?? "Team"
            : r.targetEmployeeId
              ? empMap.get(r.targetEmployeeId) ?? "Employee"
              : "Entire Organization",
      requestedAt: r.createdAt.toISOString(),
      rangeFrom: r.rangeFrom?.toISOString() ?? null,
      rangeTo: r.rangeTo?.toISOString() ?? null,
      status: r.status,
    }));

    return { items, total, page, pageSize, activeCount, activeLimit: ACTIVE_REQUEST_LIMIT };
  }

  async createDataRequest(
    orgId: string,
    d: { action: string; dataType?: string; targetEmployeeId?: string; targetTeamId?: string; rangeFrom?: string; rangeTo?: string },
  ) {
    if (!d.rangeFrom || !d.rangeTo) throw new BadRequestException("Start and end date are required.");
    const from = new Date(d.rangeFrom);
    const to = new Date(d.rangeTo);
    if (to < from) throw new BadRequestException("End date must be after start date.");
    const days = Math.floor((to.getTime() - from.getTime()) / 86400_000) + 1;
    const maxDays = await this.maxDaysFor(orgId);
    if (days > maxDays) throw new BadRequestException(`Date range exceeds ${maxDays} days per request on your plan.`);

    const active = await this.prisma.dataRequest.count({
      where: { orgId, source: "USER", status: { in: ["PENDING", "PROCESSING"] } },
    });
    if (active >= ACTIVE_REQUEST_LIMIT) {
      throw new BadRequestException(`You have reached the active request limit (${ACTIVE_REQUEST_LIMIT}). Wait for one to complete.`);
    }

    return this.prisma.dataRequest.create({
      data: {
        orgId,
        source: "USER",
        action: d.action, // EXPORT | DELETE
        dataType: d.dataType ?? "SCREENSHOTS",
        targetEmployeeId: d.targetEmployeeId || null,
        targetTeamId: d.targetTeamId || null,
        rangeFrom: from,
        rangeTo: to,
        status: "PENDING",
      },
    });
  }

  async cancelDataRequest(orgId: string, id: string) {
    const r = await this.prisma.dataRequest.findFirst({ where: { id, orgId } });
    if (!r) throw new NotFoundException("Request not found");
    if (r.source === "SYSTEM") throw new BadRequestException("Automated jobs can't be cancelled.");
    if (!["PENDING", "PROCESSING"].includes(r.status)) throw new BadRequestException("Only pending requests can be cancelled.");
    return this.prisma.dataRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  }

  async dataOverview(orgId: string) {
    const storage = await this.quota.usage(orgId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [total, thisMonth, usage, idle] = await Promise.all([
      this.prisma.screenshot.count({ where: { orgId } }),
      this.prisma.screenshot.count({ where: { orgId, capturedAt: { gte: monthStart } } }),
      this.prisma.activitySession.aggregate({ where: { orgId, isIdle: false, startedAt: { gte: monthStart } }, _sum: { durationSec: true } }),
      this.prisma.activitySession.aggregate({ where: { orgId, isIdle: true, startedAt: { gte: monthStart } }, _sum: { durationSec: true } }),
    ]);
    const usageH = (usage._sum.durationSec ?? 0) / 3600;
    const idleH = (idle._sum.durationSec ?? 0) / 3600;
    return {
      totalScreenshots: total,
      thisMonth,
      storage,
      trackingHours: +(usageH + idleH).toFixed(2), // this month
      usageHours: +usageH.toFixed(3),
      idleHours: +idleH.toFixed(3),
    };
  }

  // ---- Support ----
  async listSupport(orgId: string) {
    const rows = await this.prisma.supportRequest.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => ({
      id: r.id,
      requestId: `SR-${r.id.slice(-6).toUpperCase()}`,
      kind: r.kind,
      subject: r.subject,
      description: r.description,
      contactName: r.contactName,
      contactPhone: r.contactPhone,
      contactEmail: r.contactEmail,
      createdBy: r.createdBy,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
  createSupport(
    orgId: string,
    createdBy: string,
    d: { kind?: string; subject: string; description: string; contactName?: string; contactPhone?: string; contactEmail?: string },
  ) {
    return this.prisma.supportRequest.create({
      data: {
        orgId,
        createdBy,
        kind: d.kind ?? "SUPPORT",
        subject: d.subject,
        description: d.description,
        contactName: d.contactName ?? null,
        contactPhone: d.contactPhone ?? null,
        contactEmail: d.contactEmail ?? null,
      },
    });
  }

  /** Ticket + reply thread (client view). */
  async supportThread(orgId: string, id: string) {
    const t = await this.prisma.supportRequest.findFirst({
      where: { id, orgId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!t) throw new NotFoundException("Request not found");
    return {
      id: t.id,
      requestId: `SR-${t.id.slice(-6).toUpperCase()}`,
      kind: t.kind,
      subject: t.subject,
      description: t.description,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      messages: t.messages.map((m) => ({ id: m.id, author: m.author, authorName: m.authorName, body: m.body, createdAt: m.createdAt.toISOString() })),
    };
  }

  /** Client posts a reply on their own ticket; re-opens a resolved/closed one. */
  async replySupport(orgId: string, id: string, authorEmail: string, body: string) {
    if (!body?.trim()) throw new BadRequestException("Message is required.");
    const t = await this.prisma.supportRequest.findFirst({ where: { id, orgId } });
    if (!t) throw new NotFoundException("Request not found");
    await this.prisma.supportMessage.create({ data: { requestId: id, author: "CLIENT", authorName: authorEmail, body: body.trim() } });
    await this.prisma.supportRequest.update({ where: { id }, data: { status: t.status === "RESOLVED" || t.status === "CLOSED" ? "OPEN" : t.status } });
    return { ok: true };
  }
}
