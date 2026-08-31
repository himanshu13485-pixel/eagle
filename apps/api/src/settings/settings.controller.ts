import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingService } from "../messaging/messaging.service";
import { TrackingMode } from "@eagle/shared";

class UpdateSettingsDto {
  @IsOptional() @IsBoolean() periodicScreenshots?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(60) screenshotIntervalMin?: number;
  @IsOptional() @IsBoolean() appSwitchScreenshots?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(30) appSwitchDelayMin?: number;
  @IsOptional() @IsBoolean() webcamPhotos?: boolean;
  // 0 = native resolution; the rest are the standard heights offered in Settings.
  @IsOptional() @IsIn([0, 720, 1080, 1440, 2160]) screenshotMaxHeight?: number;
  @IsOptional() @IsInt() @Min(1) @Max(60) idleAfterMin?: number;
  @IsOptional() @IsEnum(TrackingMode) trackingMode?: TrackingMode;
  @IsOptional() @IsBoolean() strictTimeTracking?: boolean;
}

class BulkDto {
  @IsArray() @IsString({ each: true }) employeeIds!: string[];
  @IsObject() config!: Record<string, unknown>;
}
class RecipientsDto {
  @IsArray() @IsString({ each: true }) recipients!: string[];
}
class ChannelDto {
  @IsIn(["TELEGRAM", "WHATSAPP"]) type!: string;
  @IsString() target!: string;
  @IsOptional() @IsString() label?: string;
}

@UseGuards(JwtAuthGuard)
@Controller("settings")
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  @Get()
  async get(@CurrentUser() user: RequestUser) {
    const existing = await this.prisma.trackingSetting.findUnique({ where: { orgId: user.orgId } });
    if (existing) return existing;
    return this.prisma.trackingSetting.create({ data: { orgId: user.orgId } });
  }

  @Put()
  async update(@CurrentUser() user: RequestUser, @Body() dto: UpdateSettingsDto) {
    return this.prisma.trackingSetting.upsert({
      where: { orgId: user.orgId },
      create: { orgId: user.orgId, ...dto },
      update: { ...dto },
    });
  }

  /** Reports & Notifications: who receives scheduled reports (max 5 valid emails). */
  @Put("report-recipients")
  async setRecipients(@CurrentUser() user: RequestUser, @Body() dto: RecipientsDto) {
    const clean = Array.from(
      new Set((dto.recipients ?? []).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))),
    ).slice(0, 5);
    await this.prisma.trackingSetting.upsert({
      where: { orgId: user.orgId },
      create: { orgId: user.orgId, reportRecipients: clean.join(",") },
      update: { reportRecipients: clean.join(",") },
    });
    return { recipients: clean };
  }

  /** Bulk Update: apply a per-employee tracking override (agents pick it up on heartbeat). */
  @Post("bulk")
  async bulk(@CurrentUser() user: RequestUser, @Body() dto: BulkDto) {
    await this.prisma.employee.updateMany({
      where: { id: { in: dto.employeeIds }, orgId: user.orgId },
      data: { settingsJson: JSON.stringify(dto.config ?? {}) },
    });
    return { ok: true, updated: dto.employeeIds.length };
  }

  // ---- Integrations: WhatsApp / Telegram notification channels ----

  /** List this org's channels + whether each provider is live (creds present) or dry. */
  @Get("channels")
  async listChannels(@CurrentUser() user: RequestUser) {
    const channels = await this.prisma.notificationChannel.findMany({
      where: { scope: "ORG", orgId: user.orgId },
      orderBy: { createdAt: "asc" },
    });
    return { channels, providers: this.messaging.status() };
  }

  @Post("channels")
  async addChannel(@CurrentUser() user: RequestUser, @Body() dto: ChannelDto) {
    const target = dto.target.trim();
    if (!target) throw new BadRequestException("Target is required");
    if (dto.type === "WHATSAPP" && !/^\+?[0-9]{7,15}$/.test(target))
      throw new BadRequestException("WhatsApp target must be a phone number in E.164 form, e.g. +15551234567");
    return this.prisma.notificationChannel.create({
      data: { scope: "ORG", orgId: user.orgId, type: dto.type, target, label: dto.label?.trim() || null },
    });
  }

  @Delete("channels/:id")
  async removeChannel(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const ch = await this.prisma.notificationChannel.findFirst({ where: { id, orgId: user.orgId } });
    if (!ch) throw new NotFoundException("Channel not found");
    await this.prisma.notificationChannel.delete({ where: { id } });
    return { ok: true };
  }

  /** Send a test message to one channel; reports live-sent vs dry-run. */
  @Post("channels/:id/test")
  async testChannel(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const ch = await this.prisma.notificationChannel.findFirst({ where: { id, orgId: user.orgId } });
    if (!ch) throw new NotFoundException("Channel not found");
    const r = await this.messaging.send(ch.type, ch.target, "✅ Workk test message — your notification channel is connected.");
    if (r.skipped) return { ok: true, dry: true, message: `${ch.type} is in dry mode (no provider credentials). The message was logged, not sent.` };
    if (!r.ok) throw new BadRequestException(r.error || "Send failed");
    return { ok: true, dry: false, message: "Test message sent." };
  }
}
