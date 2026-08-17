import { BadRequestException, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "./reports.service";
import { ReportsScheduler } from "./reports.scheduler";

@UseGuards(JwtAuthGuard)
@Controller("reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly scheduler: ReportsScheduler,
    private readonly prisma: PrismaService,
  ) {}

  /** Email the current Team Productivity Snapshot to the org's saved recipients right now. */
  @Post("send-snapshot")
  async sendSnapshot(@CurrentUser() u: RequestUser, @Query("from") from?: string, @Query("to") to?: string) {
    const s = await this.prisma.trackingSetting.findUnique({ where: { orgId: u.orgId }, select: { reportRecipients: true } });
    const recipients = (s?.reportRecipients || "").split(",").filter(Boolean);
    if (!recipients.length) throw new BadRequestException("No report recipients saved. Add at least one email under Reports & Notifications.");
    const res = await this.scheduler.sendSnapshot(u.orgId, recipients, from, to);
    // res.skipped === true here (recipients present) means SMTP isn't configured → dry run.
    return { ...res, recipients };
  }

  @Get("timesheet")
  timesheet(
    @CurrentUser() u: RequestUser,
    @Query("mode") mode?: "day" | "user" | "period",
    @Query("date") date?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("employeeId") employeeId?: string,
    @Query("teamId") teamId?: string,
    @Query("breakdown") breakdown?: "none" | "app" | "web",
  ) {
    return this.reports.timesheet(u.orgId, { mode, date, from, to, employeeId, teamId, breakdown });
  }

  @Get("app-website-usage")
  appWebsite(
    @CurrentUser() u: RequestUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("type") type?: "all" | "app" | "web",
    @Query("employeeIds") employeeIds?: string,
    @Query("compare") compare?: "none" | "previous_period" | "previous_week" | "previous_month",
  ) {
    return this.reports.appWebsiteUsage(u.orgId, {
      from,
      to,
      type,
      employeeIds: employeeIds ? employeeIds.split(",").filter(Boolean) : undefined,
      compare,
    });
  }

  @Get("team-snapshot")
  teamSnapshot(@CurrentUser() u: RequestUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.teamSnapshot(u.orgId, from, to);
  }

  @Get("activity")
  activity(
    @CurrentUser() u: RequestUser,
    @Query("employeeId") employeeId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.activity(u.orgId, employeeId, from, to);
  }

  @Get("app-website-usage/detail")
  appWebsiteDetail(
    @CurrentUser() u: RequestUser,
    @Query("name") name: string,
    @Query("type") type?: "all" | "app" | "web",
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("employeeIds") employeeIds?: string,
  ) {
    return this.reports.appWebsiteDetail(u.orgId, {
      name,
      type,
      from,
      to,
      employeeIds: employeeIds ? employeeIds.split(",").filter(Boolean) : undefined,
    });
  }

  @Get("productivity-trends")
  productivity(
    @CurrentUser() u: RequestUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.productivityTrends(u.orgId, from, to);
  }
}
