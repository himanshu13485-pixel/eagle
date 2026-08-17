import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface InvoiceInput {
  orgId: string;
  tier: string;
  cycle: string;
  seats: number;
  amount: number;
  currency?: string;
  status?: string; // PAID | DUE | VOID
  source?: string; // CASHFREE | MANUAL | SYSTEM
  note?: string | null;
  cfOrderId?: string | null;
  createdBy?: string | null;
  number?: string; // optional custom number; auto-allocated when absent
  paidAt?: Date | null;
}

@Injectable()
export class InvoicesService {
  private readonly log = new Logger("Invoices");
  constructor(private readonly prisma: PrismaService) {}

  /** Next platform invoice number for the year: INV-YYYY-NNNN. */
  private async nextNumber(issued = new Date()): Promise<string> {
    const prefix = `INV-${issued.getFullYear()}-`;
    const count = await this.prisma.invoice.count({ where: { number: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(4, "0")}`;
  }

  /** Create an invoice, auto-allocating a number (with retry on the rare race collision). */
  async create(input: InvoiceInput) {
    const custom = input.number?.trim();
    for (let attempt = 0; attempt < 6; attempt++) {
      const number = custom || (await this.nextNumber());
      try {
        return await this.prisma.invoice.create({
          data: {
            orgId: input.orgId,
            number,
            tier: input.tier,
            cycle: input.cycle,
            seats: input.seats,
            amount: +input.amount.toFixed(2),
            currency: input.currency ?? "USD",
            status: input.status ?? "PAID",
            source: input.source ?? "SYSTEM",
            note: input.note ?? null,
            cfOrderId: input.cfOrderId ?? null,
            createdBy: input.createdBy ?? null,
            paidAt: input.paidAt ?? (input.status === "DUE" ? null : new Date()),
          },
        });
      } catch (e: any) {
        if (e?.code === "P2002" && !custom) continue; // number collision → retry with the next number
        throw e;
      }
    }
    throw new Error("Could not allocate an invoice number");
  }

  /** Idempotent invoice for a paid Cashfree order (skips if one already exists for it). */
  async fromPaidOrder(order: { orgId: string; tier: string; cycle: string; seats: number; amount: number; currency: string; cfOrderId: string; paidAt?: Date | null }) {
    const existing = await this.prisma.invoice.findFirst({ where: { cfOrderId: order.cfOrderId } });
    if (existing) return existing;
    const inv = await this.create({
      orgId: order.orgId, tier: order.tier, cycle: order.cycle, seats: order.seats,
      amount: order.amount, currency: order.currency, status: "PAID", source: "CASHFREE",
      cfOrderId: order.cfOrderId, createdBy: "system", paidAt: order.paidAt ?? new Date(),
    });
    this.log.log(`Invoice ${inv.number} issued for order ${order.cfOrderId}`);
    return inv;
  }

  private shape(r: any) {
    return {
      id: r.id, number: r.number, orgId: r.orgId, accountName: r.org?.name,
      tier: r.tier, cycle: r.cycle, seats: r.seats, amount: r.amount, currency: r.currency,
      status: r.status, source: r.source, note: r.note, createdBy: r.createdBy,
      issuedAt: r.issuedAt.toISOString(), paidAt: r.paidAt?.toISOString() ?? null,
    };
  }

  async listForOrg(orgId: string) {
    const rows = await this.prisma.invoice.findMany({ where: { orgId }, orderBy: { issuedAt: "desc" } });
    return rows.map((r) => this.shape(r));
  }

  async getForOrg(orgId: string, id: string) {
    const r = await this.prisma.invoice.findFirst({ where: { id, orgId }, include: { org: { select: { name: true } } } });
    return r ? this.shape(r) : null;
  }

  /** Admin: every invoice, optionally scoped to a set of orgs + filters. */
  async listAll(f: { orgIds?: string[] | null; clientId?: string; status?: string; from?: string; to?: string }) {
    const where: any = {};
    if (f.orgIds) where.orgId = { in: f.orgIds };
    if (f.clientId) where.orgId = f.clientId;
    if (f.status && f.status !== "ALL") where.status = f.status;
    if (f.from || f.to) {
      where.issuedAt = {};
      if (f.from) where.issuedAt.gte = new Date(f.from);
      if (f.to) where.issuedAt.lte = new Date(f.to);
    }
    const rows = await this.prisma.invoice.findMany({ where, orderBy: { issuedAt: "desc" }, take: 500, include: { org: { select: { name: true } } } });
    return rows.map((r) => this.shape(r));
  }

  async getById(id: string) {
    const r = await this.prisma.invoice.findUnique({ where: { id }, include: { org: { select: { name: true } } } });
    return r ? this.shape(r) : null;
  }
}
