import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { renderTeamSnapshotHtml } from "../mail/report-template";
import { ReportsService } from "./reports.service";

@Injectable()
export class ReportsScheduler {
  private readonly log = new Logger("ReportsScheduler");

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly mail: MailService,
  ) {}

  /** Daily at 08:00 server time — email the previous day's snapshot to each org's recipients. */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async daily() {
    const settings = await this.prisma.trackingSetting.findMany({ select: { orgId: true, reportRecipients: true } });
    let orgs = 0;
    for (const s of settings) {
      const recipients = (s.reportRecipients || "").split(",").filter(Boolean);
      if (!recipients.length) continue;
      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const startYesterday = new Date(startToday.getTime() - 86400_000);
      await this.sendSnapshot(s.orgId, recipients, startYesterday.toISOString(), startToday.toISOString()).catch((e) =>
        this.log.error(`org ${s.orgId}: ${e.message}`),
      );
      orgs++;
    }
    this.log.log(`Daily snapshot run: ${orgs} org(s) with recipients`);
  }

  /** Render + send a Team Productivity Snapshot for one org. Used by the cron and the "Send now" button. */
  async sendSnapshot(orgId: string, recipients: string[], from?: string, to?: string) {
    const report = await this.reports.teamSnapshot(orgId, from, to);
    const html = renderTeamSnapshotHtml(report);
    const subject = `EagleSee — Team Productivity Snapshot (${report.from.slice(0, 10)})`;
    return this.mail.send(recipients, subject, html);
  }
}
