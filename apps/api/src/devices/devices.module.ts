import { Module } from "@nestjs/common";
import { DevicesService } from "./devices.service";
import { DevicesController } from "./devices.controller";
import { DeviceAuthGuard } from "./device-auth.guard";
import { PresenceService } from "./presence.service";

@Module({
  providers: [DevicesService, DeviceAuthGuard, PresenceService],
  controllers: [DevicesController],
  exports: [DevicesService, DeviceAuthGuard],
})
export class DevicesModule {}
