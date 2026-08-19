import { Injectable, Logger } from "@nestjs/common";
import { MailService } from "../mail/mail.service";
import { ContactDto } from "./contact.dto";

/** Escape user input before it goes into the HTML email body. */
function esc(value = ""): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

@Injectable()
export class ContactService {
  private readonly log = new Logger("Contact");

  constructor(private readonly mail: MailService) {}

  async submit(dto: ContactDto) {
    // Where enquiries land. Falls back to SMTP_FROM's address so a missing
    // env var doesn't silently drop leads.
    const to = (process.env.CONTACT_TO || process.env.SMTP_USER || "").split(",").filter(Boolean);

    const rows: [string, string | undefined][] = [
      ["Name", dto.name],
      ["Email", dto.email],
      ["Company", dto.company],
      ["Team size", dto.teamSize],
      ["Reason", dto.reason],
    ];

    const html = `
      <h2>New enquiry from the website</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        ${rows
          .filter(([, v]) => v)
          .map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`)
          .join("")}
      </table>
      <p style="white-space:pre-wrap">${esc(dto.message)}</p>
    `;

    const subject = `[Eagle] ${dto.reason || "Enquiry"} — ${dto.name}${dto.company ? ` (${dto.company})` : ""}`;
    const result = await this.mail.send(to, subject, html);

    // In dry mode (no SMTP configured) the enquiry would otherwise vanish, so
    // log it in full — it is the only copy.
    if (result.skipped || !to.length) {
      this.log.warn(`Contact enquiry not emailed (no SMTP/CONTACT_TO): ${JSON.stringify(dto)}`);
    }

    return { ok: true };
  }
}
