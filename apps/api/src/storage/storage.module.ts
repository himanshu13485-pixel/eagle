import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { QuotaService } from "./quota.service";

@Global()
@Module({
  providers: [StorageService, QuotaService],
  exports: [StorageService, QuotaService],
})
export class StorageModule {}
