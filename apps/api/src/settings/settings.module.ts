import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { MessagingModule } from "../messaging/messaging.module";

@Module({
  imports: [MessagingModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
