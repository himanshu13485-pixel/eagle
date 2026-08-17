import { Module } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { ReportsController } from "./reports.controller";
import { ReportsScheduler } from "./reports.scheduler";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [MailModule],
  providers: [ReportsService, ReportsScheduler],
  controllers: [ReportsController],
})
export class ReportsModule {}
