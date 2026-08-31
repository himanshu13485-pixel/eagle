import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { RetentionService } from "./retention.service";
import { QuotaService } from "../storage/quota.service";

@UseGuards(JwtAuthGuard)
@Controller("admin/retention")
export class RetentionController {
  constructor(
    private readonly retention: RetentionService,
    private readonly quota: QuotaService,
  ) {}

  /** Manually run the retention sweep for the caller's org (also runs daily via cron). */
  @Post("run")
  run(@CurrentUser() u: RequestUser) {
    return this.retention.prune(u.orgId);
  }

  /** Current storage use against the plan's cap (drives the dashboard meter). */
  @Get("storage")
  storage(@CurrentUser() u: RequestUser) {
    return this.quota.usage(u.orgId);
  }
}
