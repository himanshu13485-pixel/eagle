import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { PLANS, PRICING, SELLABLE_TIERS, planFor, priceForCycle } from "@eagle/shared";
import { QuotaService } from "../storage/quota.service";
import { BillingService } from "./billing.service";

// TierDto / SeatsDto lived here for POST /billing/tier and /seats, the two
// routes that let any signed-in customer grant themselves the top plan for
// free. Both were removed; comping a plan is a platform-admin action.
class CheckoutDto {
  // Only a tier on sale can be bought; the retired ones are read-only.
  @IsIn([...SELLABLE_TIERS]) tier!: string;
  @IsIn(["MONTHLY", "ANNUALLY"]) cycle!: string;
  @IsInt() @Min(1) seats!: number;
  /** Live screen viewing, charged per seat on top of the plan. */
  @IsOptional() @IsBoolean() liveView?: boolean;
}
class OrderRefDto {
  @IsString() orderId!: string;
}

@UseGuards(JwtAuthGuard)
@Controller("billing")
export class BillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly quota: QuotaService,
  ) {}

  private async ensure(orgId: string) {
    return (
      (await this.prisma.subscription.findUnique({ where: { orgId } })) ??
      (await this.prisma.subscription.create({ data: { orgId } }))
    );
  }

  @Get()
  async get(@CurrentUser() u: RequestUser) {
    const sub = await this.ensure(u.orgId);
    // Only active (non-deactivated) employees consume a seat.
    const activeUsers = await this.prisma.employee.count({ where: { orgId: u.orgId, active: true } });
    const storage = await this.quota.usage(u.orgId);
    const plan = planFor(sub.tier);
    return {
      // The normalised tier, so a retired value doesn't reach the UI.
      tier: plan.tier,
      cycle: sub.cycle,
      seats: sub.seats,
      validUntil: sub.validUntil,
      activeUsers,
      availableSeats: Math.max(0, sub.seats - activeUsers),
      // What the plan costs, and what the add-on adds, kept apart so the page
      // can show both. Reporting one combined number made the summary card
      // disagree with the checkout total and the invoice.
      pricePerSeat: priceForCycle(sub.tier, sub.cycle),
      addOnPerSeat: sub.liveView
        ? PRICING.liveViewAddOnMonthly * (sub.cycle === "ANNUALLY" ? PRICING.annualMonthsBilled : 1)
        : 0,
      liveView: sub.liveView,
      storage,
      // Only what's on sale — the retired tiers would otherwise show up as
      // choices in the plan picker.
      plans: Object.fromEntries(SELLABLE_TIERS.map((t) => [t, PLANS[t]])),
      pricing: PRICING,
      gatewayConfigured: !!process.env.CASHFREE_APP_ID,
    };
  }

  // ---- Cashfree checkout ----
  @Post("checkout")
  checkout(@CurrentUser() u: RequestUser, @Body() dto: CheckoutDto, @Query("returnUrl") returnUrl?: string) {
    return this.billing.checkout(u.orgId, dto, returnUrl || "http://localhost:5173/billing");
  }
  @Post("verify")
  verify(@CurrentUser() u: RequestUser, @Body() dto: OrderRefDto) {
    return this.billing.verify(u.orgId, dto.orderId);
  }
  @Post("dev-confirm")
  devConfirm(@CurrentUser() u: RequestUser, @Body() dto: OrderRefDto) {
    return this.billing.devConfirm(u.orgId, dto.orderId);
  }
  @Get("orders")
  orders(@CurrentUser() u: RequestUser) {
    return this.billing.listOrders(u.orgId);
  }
  @Get("invoices")
  invoices(@CurrentUser() u: RequestUser) {
    return this.billing.listInvoices(u.orgId);
  }
  @Get("invoices/:id")
  invoice(@CurrentUser() u: RequestUser, @Param("id") id: string) {
    return this.billing.invoice(u.orgId, id);
  }

  // NOTE: there used to be POST /billing/tier and POST /billing/seats here,
  // commented "super-admin comp / dev" but guarded only by JwtAuthGuard — so any
  // signed-in customer could grant themselves the top tier and any number of
  // seats for free. Comping a plan belongs to the platform-guarded
  // PATCH /api/admin/clients/:id, which is where it now lives exclusively.
}

// Public webhook (no auth) — Cashfree calls this; we re-verify with the API before applying.
@Controller("billing")
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post("webhook")
  webhook(@Body() body: any) {
    return this.billing.webhook(body);
  }
}
