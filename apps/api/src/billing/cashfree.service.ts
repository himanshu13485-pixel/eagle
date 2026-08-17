import { Injectable, Logger } from "@nestjs/common";

/**
 * Cashfree Payment Gateway client. Configured via env:
 *   CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV (sandbox|production), CASHFREE_CURRENCY (default INR)
 * With no keys it runs in DRY mode — orders are created locally with a mock session id and can be
 * "paid" via the dev-confirm endpoint, so the whole flow is demoable without real credentials.
 */
@Injectable()
export class CashfreeService {
  private readonly log = new Logger("Cashfree");
  private readonly appId = process.env.CASHFREE_APP_ID;
  private readonly secret = process.env.CASHFREE_SECRET_KEY;
  readonly currency = process.env.CASHFREE_CURRENCY || "INR";
  readonly env = process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";

  get configured() {
    return !!(this.appId && this.secret);
  }
  private get base() {
    return this.env === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  }
  private headers() {
    return {
      "content-type": "application/json",
      "x-api-version": "2023-08-01",
      "x-client-id": this.appId ?? "",
      "x-client-secret": this.secret ?? "",
    };
  }

  /** Create a Cashfree order; returns the order id + payment session id used by the JS SDK. */
  async createOrder(input: {
    orderId: string;
    amount: number;
    customerId: string;
    customerEmail: string;
    customerPhone?: string;
    returnUrl: string;
  }): Promise<{ cfOrderId: string; paymentSessionId: string; mock: boolean }> {
    if (!this.configured) {
      return { cfOrderId: input.orderId, paymentSessionId: `mock_session_${input.orderId}`, mock: true };
    }
    const res = await fetch(`${this.base}/orders`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        order_id: input.orderId,
        order_amount: input.amount,
        order_currency: this.currency,
        customer_details: {
          customer_id: input.customerId,
          customer_email: input.customerEmail,
          customer_phone: input.customerPhone || "9999999999",
        },
        order_meta: { return_url: `${input.returnUrl}?order_id={order_id}` },
      }),
    });
    const data: any = await res.json();
    if (!res.ok) {
      this.log.error(`createOrder failed: ${res.status} ${JSON.stringify(data)}`);
      throw new Error(data?.message || "Cashfree order creation failed");
    }
    return { cfOrderId: data.order_id, paymentSessionId: data.payment_session_id, mock: false };
  }

  /** Ask Cashfree for the authoritative order status ("PAID" | "ACTIVE" | "EXPIRED" | …). */
  async getOrderStatus(cfOrderId: string): Promise<string> {
    if (!this.configured) return "ACTIVE"; // dry mode: real status comes from our own dev-confirm
    const res = await fetch(`${this.base}/orders/${cfOrderId}`, { headers: this.headers() });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data?.message || "Cashfree order fetch failed");
    return data.order_status as string;
  }
}
