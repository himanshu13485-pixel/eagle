import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Enforces that the signed-in organization is entitled to use the app.
 *
 * Both checks existed in the schema and the admin UI but nothing read them:
 * `Subscription.validUntil` was only written and displayed, so the 14-day
 * signup trial never ended, and a SUSPENDED organization carried on logging
 * in, ingesting screenshots and streaming live screens. There was no technical
 * way to cut off a non-paying self-serve customer.
 *
 * An interceptor, not a guard: globally-registered guards run *before* the
 * route's own JwtAuthGuard, so request.user isn't populated yet and the check
 * silently passed everything. Interceptors run after all guards.
 *
 * Deliberately limited to org-user routes. Agents keep collecting while an
 * account is lapsed — losing the dashboard is the lever, losing the customer's
 * history is not — and retention/quota already bound the storage cost.
 */

/** Paths a lapsed org must still reach, or it could never pay its way back. */
const ALWAYS_ALLOWED = [/\/auth(\/|$)/, /\/billing(\/|$)/, /\/contact(\/|$)/];

/** How long an entitlement decision is reused before re-reading the database.
 *  Payments and admin status changes invalidate the entry directly, so this
 *  only bounds how stale a *direct* database edit can be. */
const CACHE_MS = Number(process.env.ORG_ENTITLEMENT_CACHE_MS || 60_000);

interface Entitlement {
  status: string;
  validUntil: Date | null;
  checkedAt: number;
}

@Injectable()
export class OrgAccessInterceptor implements NestInterceptor {
  private readonly cache = new Map<string, Entitlement>();

  constructor(private readonly prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (ctx.getType() !== "http") return next.handle();
    const req = ctx.switchToHttp().getRequest();

    // Only org-user requests: public routes have no user, agents authenticate
    // separately, and platform admins are entitled by definition.
    const user = req.user as { orgId?: string; scope?: string } | undefined;
    if (!user?.orgId || user.scope === "platform") return next.handle();

    const path: string = req.path ?? req.url ?? "";
    if (ALWAYS_ALLOWED.some((re) => re.test(path))) return next.handle();

    const ent = await this.entitlement(user.orgId);
    if (!ent) return next.handle(); // org vanished mid-request; let the handler 404

    if (ent.status === "SUSPENDED") {
      throw new ForbiddenException("This account has been suspended. Please contact Workk support.");
    }
    if (ent.validUntil && ent.validUntil.getTime() < Date.now()) {
      // 402 so the dashboard can tell "you must pay" apart from "you may not".
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: "Subscription expired",
          message: "Your Workk subscription has expired. Renew it from Billing to get back in.",
          expiredAt: ent.validUntil.toISOString(),
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return next.handle();
  }

  private async entitlement(orgId: string): Promise<Entitlement | null> {
    const hit = this.cache.get(orgId);
    if (hit && Date.now() - hit.checkedAt < CACHE_MS) return hit;

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { status: true, subscription: { select: { validUntil: true } } },
    });
    if (!org) return null;

    const ent: Entitlement = {
      status: org.status,
      validUntil: org.subscription?.validUntil ?? null,
      checkedAt: Date.now(),
    };
    if (this.cache.size > 10_000) this.cache.clear();
    this.cache.set(orgId, ent);
    return ent;
  }

  /** Drop a cached decision so a payment or an un-suspend takes effect at once. */
  invalidate(orgId: string): void {
    this.cache.delete(orgId);
  }
}
