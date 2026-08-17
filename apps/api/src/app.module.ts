import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "path";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { AuthModule } from "./auth/auth.module";
import { EmployeesModule } from "./employees/employees.module";
import { DevicesModule } from "./devices/devices.module";
import { IngestModule } from "./ingest/ingest.module";
import { ScreenshotsModule } from "./screenshots/screenshots.module";
import { SettingsModule } from "./settings/settings.module";
import { ReportsModule } from "./reports/reports.module";
import { AgentDistModule } from "./agent-dist/agent-dist.module";
import { TeamsModule } from "./teams/teams.module";
import { BillingModule } from "./billing/billing.module";
import { WorkspaceModule } from "./workspace/workspace.module";
import { RetentionModule } from "./retention/retention.module";
import { AdminModule } from "./admin/admin.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { InvoicesModule } from "./invoices/invoices.module";

@Module({
  imports: [
    // Load apps/api/.env robustly regardless of the working directory
    // (__dirname is apps/api/dist at runtime → ../.env = apps/api/.env).
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [join(__dirname, "..", ".env"), ".env"] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    RealtimeModule,
    AuthModule,
    EmployeesModule,
    DevicesModule,
    IngestModule,
    ScreenshotsModule,
    SettingsModule,
    ReportsModule,
    AgentDistModule,
    TeamsModule,
    BillingModule,
    WorkspaceModule,
    RetentionModule,
    AdminModule,
    NotificationsModule,
    InvoicesModule,
  ],
})
export class AppModule {}
