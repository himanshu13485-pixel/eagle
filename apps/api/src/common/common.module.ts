import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { RateLimiter } from "./rate-limit";
import { RateLimitGuard } from "./rate-limit.guard";
import { OrgAccessInterceptor } from "./org-access.interceptor";

/**
 * Shared helpers available everywhere. Global so the rate limiter and the
 * entitlement cache are each a single instance — a per-module copy would give
 * every module its own separate allowance and its own stale cache.
 *
 * OrgAccessInterceptor is registered app-wide rather than per-controller so a
 * new endpoint is covered by default; forgetting it on one route is how an
 * expired account keeps working. It is an interceptor and not a global guard
 * because global guards run before the route's JwtAuthGuard, leaving
 * request.user unset — which made the check pass everything.
 */
@Global()
@Module({
  providers: [
    RateLimiter,
    RateLimitGuard,
    OrgAccessInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: OrgAccessInterceptor },
  ],
  exports: [RateLimiter, RateLimitGuard, OrgAccessInterceptor],
})
export class CommonModule {}
