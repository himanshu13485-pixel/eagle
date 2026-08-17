import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingService } from "../messaging/messaging.service";

interface NotifRow {
  id: string; kind: string; title: string; body: string; createdBy: string | null; createdAt: string; read: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger("Notifications");
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  private async decorate(notifs: { id: string; kind: string; title: string; body: string; createdBy: string | null; createdAt: Date }[], readerId: string) {
    const reads = notifs.length
      ? await this.prisma.notificationRead.findMany({ where: { readerId, notificationId: { in: notifs.map((n) => n.id) } }, select: { notificationId: true } })
      : [];
    const readSet = new Set(reads.map((r) => r.notificationId));
    const items: NotifRow[] = notifs.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, createdBy: n.createdBy, createdAt: n.createdAt.toISOString(), read: readSet.has(n.id) }));
    return { items, unread: items.filter((i) => !i.read).length };
  }

  /** Client-facing notifications for an org user (this org + broadcasts). */
  async forOrgUser(orgId: string, userId: string) {
    const notifs = await this.prisma.notification.findMany({
      where: { audience: "ORG", OR: [{ orgId }, { orgId: null }] },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return this.decorate(notifs, userId);
  }

  /** Internal notifications for a platform admin (all-staff + their role + directed to them). */
  async forAdmin(adminId: string, role: string) {
    const notifs = await this.prisma.notification.findMany({
      where: { audience: "PLATFORM", OR: [{ role: null, adminId: null }, { role }, { adminId }] },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return this.decorate(notifs, adminId);
  }

  async markRead(readerId: string, notificationId: string) {
    await this.prisma.notificationRead.upsert({
      where: { notificationId_readerId: { notificationId, readerId } },
      create: { notificationId, readerId },
      update: {},
    });
    return { ok: true };
  }

  private async markAll(readerId: string, notifIds: string[]) {
    if (!notifIds.length) return { ok: true };
    const existing = await this.prisma.notificationRead.findMany({ where: { readerId, notificationId: { in: notifIds } }, select: { notificationId: true } });
    const have = new Set(existing.map((e) => e.notificationId));
    const toAdd = notifIds.filter((id) => !have.has(id)).map((id) => ({ notificationId: id, readerId }));
    if (toAdd.length) await this.prisma.notificationRead.createMany({ data: toAdd });
    return { ok: true };
  }

  async markAllForOrgUser(orgId: string, userId: string) {
    const ids = await this.prisma.notification.findMany({ where: { audience: "ORG", OR: [{ orgId }, { orgId: null }] }, select: { id: true } });
    return this.markAll(userId, ids.map((i) => i.id));
  }
  async markAllForAdmin(adminId: string, role: string) {
    const ids = await this.prisma.notification.findMany({ where: { audience: "PLATFORM", OR: [{ role: null, adminId: null }, { role }, { adminId }] }, select: { id: true } });
    return this.markAll(adminId, ids.map((i) => i.id));
  }

  /** Create a notification (from the admin console). */
  async create(
    d: { audience: string; orgId?: string | null; role?: string | null; adminId?: string | null; kind?: string; title: string; body: string; pushChannels?: string[] },
    createdBy: string,
  ) {
    const notif = await this.prisma.notification.create({
      data: {
        audience: d.audience,
        orgId: d.audience === "ORG" ? d.orgId || null : null,
        role: d.audience === "PLATFORM" ? d.role || null : null,
        adminId: d.audience === "PLATFORM" ? d.adminId || null : null,
        kind: d.kind ?? "INFO",
        title: d.title,
        body: d.body,
        createdBy,
      },
    });
    // Fire-and-forget fan-out to WhatsApp/Telegram — never blocks or fails the create.
    const types = (d.pushChannels ?? []).filter((t) => t === "TELEGRAM" || t === "WHATSAPP");
    if (types.length) this.fanOut(d.audience, d.orgId ?? null, types, `${d.title}\n\n${d.body}`).catch((e) => this.log.warn(`fan-out failed: ${e.message}`));
    return notif;
  }

  /** Push notification text to the matching registered WhatsApp/Telegram channels. */
  async fanOut(audience: string, orgId: string | null, types: string[], text: string) {
    const where: any = { active: true, type: { in: types } };
    if (audience === "PLATFORM") {
      where.scope = "PLATFORM";
    } else {
      where.scope = "ORG";
      if (orgId) where.orgId = orgId; // else broadcast → every org's channels
    }
    const channels = await this.prisma.notificationChannel.findMany({ where });
    let sent = 0, skipped = 0, failed = 0;
    for (const c of channels) {
      const r = await this.messaging.send(c.type, c.target, text);
      if (r.ok) sent++; else if (r.skipped) skipped++; else failed++;
    }
    this.log.log(`fan-out ${audience}: ${channels.length} channel(s) → sent ${sent}, dry ${skipped}, failed ${failed}`);
    return { channels: channels.length, sent, skipped, failed };
  }

  /** Recently sent notifications (admin console list). */
  async listSent() {
    const rows = await this.prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    const orgIds = Array.from(new Set(rows.map((r) => r.orgId).filter(Boolean))) as string[];
    const orgs = orgIds.length ? await this.prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [];
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    return rows.map((r) => ({
      id: r.id,
      audience: r.audience,
      target: r.audience === "ORG" ? (r.orgId ? orgName.get(r.orgId) ?? "Client" : "All clients") : r.role ? r.role : r.adminId ? "Specific staff" : "All staff",
      kind: r.kind,
      title: r.title,
      body: r.body,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
