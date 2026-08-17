import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { NotificationsService } from "./notifications.service";
import { NotificationsController, AdminNotificationsController } from "./notifications.controller";
import { PlatformAuthGuard } from "../admin/platform-auth.guard";
import { MessagingModule } from "../messaging/messaging.module";

@Module({
  imports: [JwtModule.register({}), MessagingModule],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [NotificationsService, PlatformAuthGuard],
})
export class NotificationsModule {}
