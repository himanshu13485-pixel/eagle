import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

/**
 * Small in-process rate limiter for the public, unauthenticated endpoints —
 * login, signup, password reset, token refresh, admin login.
 *
 * None of these were limited at all: login was a plain bcrypt compare with no
 * attempt counter, so passwords could be ground down at full speed, signup was
 * an open org-creation faucet, and forgot-password could be used to mail-bomb
 * an address. Kept in-process rather than adding @nestjs/throttler: the API
 * runs as a single container, which is the same reasoning the contact form
 * already used.
 *
 * Deliberately not a lockout. Locking an account on failed attempts lets anyone
 * lock a competitor out by guessing wrong at them; slowing the caller down
 * doesn't.
 */

export interface RateRule {
  /** Attempts allowed inside the window. */
  limit: number;
  windowMs: number;
  /** Shown to the caller when the limit is hit. */
  message: string;
}

export const RATE_RULES = {
  login: { limit: 10, windowMs: 5 * 60_000, message: "Too many sign-in attempts. Please wait a few minutes and try again." },
  register: { limit: 5, windowMs: 60 * 60_000, message: "Too many accounts created from here. Please try again later." },
  forgotPassword: { limit: 5, windowMs: 60 * 60_000, message: "Too many reset requests. Please try again later." },
  resetPassword: { limit: 10, windowMs: 60 * 60_000, message: "Too many attempts. Please request a new reset link." },
  refresh: { limit: 60, windowMs: 5 * 60_000, message: "Too many requests. Please try again shortly." },
} satisfies Record<string, RateRule>;

@Injectable()
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly MAX_KEYS = 20_000;

  /**
   * Record an attempt against `key`, throwing 429 once the rule is exceeded.
   * Call with several keys to limit on more than one dimension — e.g. per IP
   * and per email, so one account can't be ground down from many addresses.
   */
  hit(rule: RateRule, ...keys: string[]): void {
    const now = Date.now();
    for (const key of keys) {
      if (!key) continue;
      const recent = (this.hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);
      if (recent.length >= rule.limit) {
        throw new HttpException(rule.message, HttpStatus.TOO_MANY_REQUESTS);
      }
      recent.push(now);
      this.hits.set(key, recent);
    }
    this.sweep(now);
  }

  /** Forget a key's attempts — called after a success, so one good sign-in
   *  clears the slate rather than counting toward the next lockout window. */
  clear(...keys: string[]): void {
    for (const key of keys) if (key) this.hits.delete(key);
  }

  private sweep(now: number): void {
    if (this.hits.size <= this.MAX_KEYS) return;
    for (const [k, times] of this.hits) {
      if (!times.length || now - times[times.length - 1] > 60 * 60_000) this.hits.delete(k);
    }
  }
}
