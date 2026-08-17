import { Module } from "@nestjs/common";
import { ScreenshotsService } from "./screenshots.service";
import { ScreenshotsController } from "./screenshots.controller";

@Module({
  providers: [ScreenshotsService],
  controllers: [ScreenshotsController],
})
export class ScreenshotsModule {}
