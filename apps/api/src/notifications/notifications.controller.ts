import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { PlatformAuthGuard, assertSuperAdmin } from "../admin/platform-auth.guard";
import { CurrentAdmin, RequestAdmin } from "../admin/current-admin.decorator";
import { NotificationsService } from "./notifications.service";

class CreateNotifDto {
  @IsIn(["ORG", "PLATFORM"]) audience!: string;
  @IsOptional() @IsString() orgId?: string;
  @IsOptional() @IsIn(["SUPER_ADMIN", "SUB_ADMIN", "SALESPERSON"]) role?: string;
  @IsOptional() @IsString() adminId?: string;
  @IsOptional() @IsIn(["INFO", "UPDATE", "ANNOUNCEMENT", "ALERT"]) kind?: string;
  @IsString() title!: string;
  @IsString() body!: string;
  // Also fan out to these registered channels: ["TELEGRAM","WHATSAPP"].
  @IsOptional() @IsArray() @IsIn(["TELEGRAM", "WHATSAPP"], { each: true }) pushChannels?: string[];
}

// ---- Org users (client-facing bell) ----
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: RequestUser) {
    return this.svc.forOrgUser(u.orgId, u.userId);
  }
  @Post(":id/read")
  read(@CurrentUser() u: RequestUser, @Param("id") id: string) {
    return this.svc.markRead(u.userId, id);
  }
  @Post("read-all")
  readAll(@CurrentUser() u: RequestUser) {
    return this.svc.markAllForOrgUser(u.orgId, u.userId);
  }
}

// ---- Platform admins (internal bell + compose) ----
@UseGuards(PlatformAuthGuard)
@Controller("admin/notifications")
export class AdminNotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@CurrentAdmin() a: RequestAdmin) {
    return this.svc.forAdmin(a.adminId, a.role);
  }
  @Post(":id/read")
  read(@CurrentAdmin() a: RequestAdmin, @Param("id") id: string) {
    return this.svc.markRead(a.adminId, id);
  }
  @Post("read-all")
  readAll(@CurrentAdmin() a: RequestAdmin) {
    return this.svc.markAllForAdmin(a.adminId, a.role);
  }

  @Get("sent")
  sent(@CurrentAdmin() a: RequestAdmin) {
    assertSuperAdmin(a.role);
    return this.svc.listSent();
  }
  @Post()
  create(@CurrentAdmin() a: RequestAdmin, @Body() dto: CreateNotifDto) {
    // Super Admins can send to anyone; Sub Admins can only message clients.
    if (a.role === "SALESPERSON") assertSuperAdmin(a.role);
    if (dto.audience === "PLATFORM") assertSuperAdmin(a.role);
    return this.svc.create(dto, a.email);
  }
}
