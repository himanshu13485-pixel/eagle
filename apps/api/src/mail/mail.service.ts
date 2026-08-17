import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

/**
 * SMTP email sender. Configured via env (SMTP_HOST/PORT/USER/PASS/SECURE/FROM).
 * With no SMTP_HOST it runs in "dry" mode — it logs what it would send and reports
 * `skipped: true`, so the app works without an email provider in dev.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger("Mail");
  private readonly transporter: Transporter | null;
  private readonly from = process.env.SMTP_FROM || "EagleSee <no-reply@eaglesee.local>";

  constructor() {
    if (process.env.SMTP_HOST) {
      this.transporter = createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      this.log.log(`SMTP configured (${process.env.SMTP_HOST})`);
    } else {
      this.transporter = null;
      this.log.warn("SMTP not configured — emails run in dry mode (set SMTP_HOST to enable).");
    }
  }

  get configured() {
    return !!this.transporter;
  }

  async send(to: string[], subject: string, html: string): Promise<{ sent: number; skipped: boolean }> {
    const recipients = to.filter(Boolean);
    if (!recipients.length) return { sent: 0, skipped: true };
    if (!this.transporter) {
      this.log.warn(`[dry] would email ${recipients.length} recipient(s) — "${subject}"`);
      return { sent: 0, skipped: true };
    }
    await this.transporter.sendMail({ from: this.from, to: recipients.join(","), subject, html });
    this.log.log(`Sent "${subject}" to ${recipients.length} recipient(s)`);
    return { sent: recipients.length, skipped: false };
  }
}
