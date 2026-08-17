import { Module } from "@nestjs/common";
import { IngestService } from "./ingest.service";
import { IngestController } from "./ingest.controller";
import { DeviceAuthGuard } from "../devices/device-auth.guard";

@Module({
  providers: [IngestService, DeviceAuthGuard],
  controllers: [IngestController],
})
export class IngestModule {}
