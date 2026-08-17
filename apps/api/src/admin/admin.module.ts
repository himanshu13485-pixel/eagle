import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PlatformAuthGuard } from "./platform-auth.guard";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminController],
  providers: [AdminService, PlatformAuthGuard],
})
export class AdminModule {}
