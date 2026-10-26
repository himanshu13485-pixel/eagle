import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { QuotaService } from "./quota.service";
import { FilesController } from "./files.controller";

@Global()
@Module({
  controllers: [FilesController],
  providers: [StorageService, QuotaService],
  exports: [StorageService, QuotaService],
})
export class StorageModule {}
