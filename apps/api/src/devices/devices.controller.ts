import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { DevicesService } from "./devices.service";
import { EnrollDto, HeartbeatDto } from "./dto";
import { DeviceAuthGuard } from "./device-auth.guard";

@Controller("devices")
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  // Public: agent exchanges an enrollment token for a device token + config.
  @Post("enroll")
  enroll(@Body() dto: EnrollDto) {
    return this.devices.enroll(dto);
  }

  @UseGuards(DeviceAuthGuard)
  @Post("heartbeat")
  heartbeat(@Req() req: any, @Body() dto: HeartbeatDto) {
    return this.devices.heartbeat(req.device, dto);
  }

  @UseGuards(DeviceAuthGuard)
  @Get("config")
  async config(@Req() req: any) {
    return this.devices.configForOrg(req.device.orgId);
  }

  // Called by the uninstaller (device-authenticated) to free the seat on removal.
  @UseGuards(DeviceAuthGuard)
  @Post("deactivate")
  deactivateSelf(@Req() req: any) {
    return this.devices.deactivateSelf(req.device);
  }
}
