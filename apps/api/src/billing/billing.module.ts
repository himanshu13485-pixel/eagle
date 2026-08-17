import { Module } from "@nestjs/common";
import { BillingController, BillingWebhookController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { CashfreeService } from "./cashfree.service";

@Module({
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, CashfreeService],
})
export class BillingModule {}
