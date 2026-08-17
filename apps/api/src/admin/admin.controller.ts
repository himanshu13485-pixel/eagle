import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { AdminService } from "./admin.service";
import { CurrentAdmin, RequestAdmin } from "./current-admin.decorator";
import { PlatformAuthGuard, assertSuperAdmin } from "./platform-auth.guard";

const ROLES = ["SUPER_ADMIN", "SUB_ADMIN", "SALESPERSON"];
const TIERS = ["BASIC", "PROFESSIONAL", "BUSINESS"];

class AdminLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
class CreateClientDto {
  @IsString() name!: string;
  @IsString() ownerName!: string;
  @IsEmail() ownerEmail!: string;
  @MinLength(6) ownerPassword!: string;
  @IsOptional() @IsIn(TIERS) tier?: string;
  @IsOptional() @IsInt() @Min(1) seats?: number;
  @IsOptional() @IsString() salespersonId?: string;
}
class UpdateClientDto {
  @IsOptional() @IsIn(["ACTIVE", "SUSPENDED"]) status?: string;
  @IsOptional() @IsString() salespersonId?: string | null;
  @IsOptional() @IsIn(TIERS) tier?: string;
  @IsOptional() @IsInt() @Min(1) seats?: number;
}
class CreateStaffDto {
  @IsString() name!: string;
  @IsEmail() email!: string;
  @MinLength(6) password!: string;
  @IsIn(ROLES) role!: string;
}
class UpdateStaffDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsIn(ROLES) role?: string;
}

@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post("auth/login")
  login(@Body() dto: AdminLoginDto) {
    return this.admin.login(dto.email, dto.password);
  }

  @UseGuards(PlatformAuthGuard)
  @Get("overview")
  overview(@CurrentAdmin() a: RequestAdmin) {
    return this.admin.overview(a);
  }

  @UseGuards(PlatformAuthGuard)
  @Get("clients")
  clients(@CurrentAdmin() a: RequestAdmin) {
    return this.admin.listClients(a);
  }

  @UseGuards(PlatformAuthGuard)
  @Post("clients")
  createClient(@CurrentAdmin() a: RequestAdmin, @Body() dto: CreateClientDto) {
    return this.admin.createClient(a, dto);
  }

  @UseGuards(PlatformAuthGuard)
  @Patch("clients/:id")
  updateClient(@CurrentAdmin() a: RequestAdmin, @Param("id") id: string, @Body() dto: UpdateClientDto) {
    if (a.role === "SALESPERSON") assertSuperAdmin(a.role); // salespeople can't change status/tier
    return this.admin.updateClient(id, dto);
  }

  @UseGuards(PlatformAuthGuard)
  @Get("staff")
  staff(@CurrentAdmin() a: RequestAdmin) {
    assertSuperAdmin(a.role);
    return this.admin.listStaff();
  }

  @UseGuards(PlatformAuthGuard)
  @Post("staff")
  createStaff(@CurrentAdmin() a: RequestAdmin, @Body() dto: CreateStaffDto) {
    assertSuperAdmin(a.role);
    return this.admin.createStaff(dto);
  }

  @UseGuards(PlatformAuthGuard)
  @Patch("staff/:id")
  updateStaff(@CurrentAdmin() a: RequestAdmin, @Param("id") id: string, @Body() dto: UpdateStaffDto) {
    assertSuperAdmin(a.role);
    return this.admin.updateStaff(id, dto);
  }
}
