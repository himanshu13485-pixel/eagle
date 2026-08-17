import { Global, Module } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";

@Global()
@Module({
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
