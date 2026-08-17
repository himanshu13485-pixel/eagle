import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DeviceAuthGuard } from "../devices/device-auth.guard";
import { IngestService } from "./ingest.service";

@UseGuards(DeviceAuthGuard)
@Controller("ingest")
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post("screenshot")
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: 12 * 1024 * 1024 } }))
  screenshot(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() meta: Record<string, string>,
  ) {
    return this.ingest.saveScreenshot(req.device, file, meta);
  }

  @Post("activity")
  activity(@Req() req: any, @Body() body: { items: any[] }) {
    return this.ingest.saveActivityBatch(req.device, body.items ?? []);
  }
}
