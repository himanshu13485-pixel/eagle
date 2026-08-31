import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { PlanTier, PLANS } from "@eagle/shared";
import { QuotaService } from "../storage/quota.service";
import { BillingService } from "./billing.service";

class TierDto {
  @IsEnum(PlanTier) tier!: PlanTier;
}
class SeatsDto {
  @IsInt() @Min(1) seats!: number;
}
class CheckoutDto {
  @IsEnum(PlanTier) tier!: PlanTier;
  @IsIn(["MONTHLY", "ANNUALLY"]) cycle!: string;
  @IsInt() @Min(1) seats!: number;
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
    const plan = PLANS[sub.tier as PlanTier];
    return {
      tier: sub.tier,
      cycle: sub.cycle,
      seats: sub.seats,
      validUntil: sub.validUntil,
      activeUsers,
      availableSeats: Math.max(0, sub.seats - activeUsers),
      pricePerSeat: sub.cycle === "ANNUALLY" ? plan.annual : plan.monthly,
      storage,
      plans: PLANS,
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

  // ---- manual (super-admin comp / dev) ----
  @Post("tier")
  async setTier(@CurrentUser() u: RequestUser, @Body() dto: TierDto) {
    await this.ensure(u.orgId);
    return this.prisma.subscription.update({ where: { orgId: u.orgId }, data: { tier: dto.tier } });
  }
  @Post("seats")
  async setSeats(@CurrentUser() u: RequestUser, @Body() dto: SeatsDto) {
    await this.ensure(u.orgId);
    return this.prisma.subscription.update({ where: { orgId: u.orgId }, data: { seats: dto.seats } });
  }
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
