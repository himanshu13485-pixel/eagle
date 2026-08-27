import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PLANS, PlanTier } from "@eagle/shared";
import { CashfreeService } from "./cashfree.service";
import { InvoicesService } from "../invoices/invoices.service";

@Injectable()
export class BillingService {
  private readonly log = new Logger("Billing");
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashfree: CashfreeService,
    private readonly invoices: InvoicesService,
  ) {}

  private priceFor(tier: string, cycle: string): number {
    const plan = PLANS[tier as PlanTier];
    if (!plan) throw new BadRequestException("Unknown tier");
    return cycle === "MONTHLY" ? plan.monthly : plan.annual;
  }

  /** Start a checkout: creates a PaymentOrder + a Cashfree order, returns the session for the SDK. */
  async checkout(orgId: string, d: { tier: string; cycle: string; seats: number }, returnUrl: string) {
    const cycle = d.cycle === "MONTHLY" ? "MONTHLY" : "ANNUALLY";
    const seats = Math.max(1, Math.floor(d.seats));
    const amount = +(this.priceFor(d.tier, cycle) * seats).toFixed(2);

    const owner = await this.prisma.user.findFirst({ where: { orgId, role: "OWNER" }, select: { id: true, email: true } });
    const cfOrderId = `eag_${orgId.slice(-6)}_${randomBytes(4).toString("hex")}`;

    const cf = await this.cashfree.createOrder({
      orderId: cfOrderId,
      amount,
      customerId: orgId,
      customerEmail: owner?.email ?? "owner@workk.work",
      returnUrl,
    });

    await this.prisma.paymentOrder.create({
      data: { orgId, cfOrderId: cf.cfOrderId, amount, currency: this.cashfree.currency, tier: d.tier, cycle, seats, paymentSessionId: cf.paymentSessionId },
    });

    return {
      orderId: cf.cfOrderId,
      paymentSessionId: cf.paymentSessionId,
      amount,
      currency: this.cashfree.currency,
      mode: this.cashfree.configured ? this.cashfree.env : "dry",
      env: this.cashfree.env,
    };
  }

  /** Confirm a checkout by asking Cashfree for the real status; apply the plan if PAID. */
  async verify(orgId: string, orderId: string) {
    const order = await this.prisma.paymentOrder.findFirst({ where: { cfOrderId: orderId, orgId } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status === "PAID") return { status: "PAID", applied: true };
    const status = await this.cashfree.getOrderStatus(orderId);
    if (status === "PAID") {
      await this.applyPaid(order.id);
      return { status: "PAID", applied: true };
    }
    return { status, applied: false };
  }

  /** DRY mode only: simulate a successful payment (no real gateway configured). */
  async devConfirm(orgId: string, orderId: string) {
    if (this.cashfree.configured) throw new BadRequestException("Live gateway configured — use the real checkout.");
    const order = await this.prisma.paymentOrder.findFirst({ where: { cfOrderId: orderId, orgId } });
    if (!order) throw new NotFoundException("Order not found");
    await this.applyPaid(order.id);
    return { status: "PAID", applied: true };
  }

  /** Cashfree webhook — we re-verify with the API rather than trusting the payload. */
  async webhook(body: any) {
    const cfOrderId = body?.data?.order?.order_id ?? body?.order_id;
    if (!cfOrderId) return { ok: true, ignored: true };
    const order = await this.prisma.paymentOrder.findUnique({ where: { cfOrderId } });
    if (!order || order.status === "PAID") return { ok: true };
    const status = await this.cashfree.getOrderStatus(cfOrderId).catch(() => "UNKNOWN");
    if (status === "PAID") await this.applyPaid(order.id);
    return { ok: true, status };
  }

  /** Mark the order paid and extend/upgrade the org's subscription. */
  private async applyPaid(orderId: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status === "PAID") return;
    const now = new Date();
    const sub = await this.prisma.subscription.findUnique({ where: { orgId: order.orgId } });
    const base = sub?.validUntil && sub.validUntil > now ? new Date(sub.validUntil) : new Date(now);
    if (order.cycle === "MONTHLY") base.setMonth(base.getMonth() + 1);
    else base.setFullYear(base.getFullYear() + 1);

    await this.prisma.subscription.upsert({
      where: { orgId: order.orgId },
      create: { orgId: order.orgId, tier: order.tier, cycle: order.cycle, seats: order.seats, validUntil: base },
      update: { tier: order.tier, cycle: order.cycle, seats: order.seats, validUntil: base },
    });
    await this.prisma.paymentOrder.update({ where: { id: order.id }, data: { status: "PAID", paidAt: now } });
    // Issue the invoice for this payment (idempotent per order).
    await this.invoices.fromPaidOrder({
      orgId: order.orgId, tier: order.tier, cycle: order.cycle, seats: order.seats,
      amount: order.amount, currency: order.currency, cfOrderId: order.cfOrderId, paidAt: now,
    }).catch((e) => this.log.warn(`invoice generation failed for ${order.cfOrderId}: ${e.message}`));
    this.log.log(`Order ${order.cfOrderId} PAID → org ${order.orgId} ${order.tier}/${order.seats} seats until ${base.toISOString().slice(0, 10)}`);
  }

  listInvoices(orgId: string) {
    return this.invoices.listForOrg(orgId);
  }
  invoice(orgId: string, id: string) {
    return this.invoices.getForOrg(orgId, id);
  }

  async listOrders(orgId: string) {
    const rows = await this.prisma.paymentOrder.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 20 });
    return rows.map((o) => ({ id: o.cfOrderId, amount: o.amount, currency: o.currency, tier: o.tier, cycle: o.cycle, seats: o.seats, status: o.status, createdAt: o.createdAt.toISOString(), paidAt: o.paidAt?.toISOString() ?? null }));
  }
}
