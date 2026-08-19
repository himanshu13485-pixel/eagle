import { Body, Controller, HttpException, HttpStatus, Ip, Post } from "@nestjs/common";
import { ContactDto } from "./contact.dto";
import { ContactService } from "./contact.service";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

/**
 * Public endpoint — no auth guard, so it is internet-facing and needs its own
 * rate limit. Kept in-process rather than pulling in @nestjs/throttler for one
 * route; a single API container makes a shared store unnecessary.
 */
@Controller("contact")
export class ContactController {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly contact: ContactService) {}

  @Post()
  submit(@Body() dto: ContactDto, @Ip() ip: string) {
    this.rateLimit(ip || "unknown");
    return this.contact.submit(dto);
  }

  private rateLimit(key: string) {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

    if (recent.length >= MAX_PER_WINDOW) {
      throw new HttpException(
        "Too many messages — please try again in a minute.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.hits.set(key, recent);

    // Drop stale keys so the map can't grow without bound under scanning.
    if (this.hits.size > 5000) {
      for (const [k, times] of this.hits) {
        if (!times.some((t) => now - t < WINDOW_MS)) this.hits.delete(k);
      }
    }
  }
}
