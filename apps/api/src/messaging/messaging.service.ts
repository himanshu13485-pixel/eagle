import { Injectable, Logger } from "@nestjs/common";

/**
 * Outbound Telegram + WhatsApp messaging. Configured via env:
 *   TELEGRAM_BOT_TOKEN
 *   WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (WhatsApp Cloud API)
 * With no creds a channel runs in DRY mode — it logs what it would send and returns
 * skipped:true, so channel setup + notification fan-out are demoable without providers.
 */
@Injectable()
export class MessagingService {
  private readonly log = new Logger("Messaging");
  private readonly tgToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly waToken = process.env.WHATSAPP_TOKEN;
  private readonly waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  get telegramConfigured() { return !!this.tgToken; }
  get whatsappConfigured() { return !!(this.waToken && this.waPhoneId); }

  async sendTelegram(chatId: string, text: string): Promise<{ ok: boolean; skipped: boolean; error?: string }> {
    if (!this.telegramConfigured) {
      this.log.warn(`[dry] Telegram → ${chatId}: ${text.slice(0, 60)}`);
      return { ok: false, skipped: true };
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.tgToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      });
      const data: any = await res.json();
      if (!data.ok) return { ok: false, skipped: false, error: data.description || "telegram error" };
      return { ok: true, skipped: false };
    } catch (e: any) {
      return { ok: false, skipped: false, error: e.message };
    }
  }

  async sendWhatsApp(to: string, text: string): Promise<{ ok: boolean; skipped: boolean; error?: string }> {
    if (!this.whatsappConfigured) {
      this.log.warn(`[dry] WhatsApp → ${to}: ${text.slice(0, 60)}`);
      return { ok: false, skipped: true };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${this.waPhoneId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.waToken}`, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
      });
      const data: any = await res.json();
      if (!res.ok) return { ok: false, skipped: false, error: data?.error?.message || "whatsapp error" };
      return { ok: true, skipped: false };
    } catch (e: any) {
      return { ok: false, skipped: false, error: e.message };
    }
  }

  /** Dispatch to one channel by type. */
  send(type: string, target: string, text: string) {
    return type === "TELEGRAM" ? this.sendTelegram(target, text) : this.sendWhatsApp(target, text);
  }

  status() {
    return { telegram: this.telegramConfigured, whatsapp: this.whatsappConfigured };
  }
}
