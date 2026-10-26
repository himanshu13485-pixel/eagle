import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RateLimiter, type RateRule } from "./rate-limit";

export const RATE_LIMIT_KEY = "rateLimit";

export interface RateLimitOptions {
  rule: RateRule;
  /** Prefix for the counter, so two routes don't share an allowance. */
  bucket: string;
  /** Body field to key on as well as the IP — "email", so one account can't be
   *  ground down from many addresses. */
  byBodyField?: string;
}

export const RateLimit = (opts: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, opts);

/**
 * Applies a rate limit as a *guard*, which matters: guards run before
 * validation pipes. Counting inside the handler instead let anyone send
 * malformed bodies forever — the request 400s in the pipe and never reaches
 * the counter, so the endpoint stays open to hammering.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const opts = this.reflector.get<RateLimitOptions | undefined>(RATE_LIMIT_KEY, ctx.getHandler());
    if (!opts) return true;

    const req = ctx.switchToHttp().getRequest();
    const ip: string = req.ip || req.socket?.remoteAddress || "unknown";
    const keys = [`${opts.bucket}:ip:${ip}`];

    if (opts.byBodyField) {
      // Unvalidated at this point — only ever used as a counter key, and
      // bounded so a huge field can't bloat the map.
      const raw = req.body?.[opts.byBodyField];
      if (typeof raw === "string" && raw.trim()) {
        keys.push(`${opts.bucket}:${opts.byBodyField}:${raw.trim().toLowerCase().slice(0, 200)}`);
      }
    }

    // Let the handler clear these after a success.
    req.rateLimitKeys = keys;
    this.limiter.hit(opts.rule, ...keys);
    return true;
  }
}
