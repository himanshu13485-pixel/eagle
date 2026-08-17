import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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
  @IsOptional() @IsBoolean() withInvoice?: boolean;
  @IsOptional() @IsString() invoiceNo?: string;
  @IsOptional() @IsIn(["PAID", "DUE"]) invoiceStatus?: string;
}
class CreateInvoiceDto {
  @IsString() orgId!: string;
  @IsIn(TIERS) tier!: string;
  @IsIn(["MONTHLY", "ANNUALLY"]) cycle!: string;
  @IsInt() @Min(1) seats!: number;
  @IsOptional() @IsIn(["PAID", "DUE"]) status?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() amount?: number;
}
class UpdateClientDto {
  @IsOptional() @IsIn(["ACTIVE", "SUSPENDED"]) status?: string;
  @IsOptional() @IsString() salespersonId?: string | null;
  @IsOptional() @IsIn(TIERS) tier?: string;
  @IsOptional() @IsInt() @Min(1) seats?: number;
  @IsOptional() @IsIn(["MONTHLY", "ANNUALLY"]) cycle?: string;
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

  /** Open the client's own dashboard as that account. */
  @UseGuards(PlatformAuthGuard)
  @Post("clients/:id/impersonate")
  impersonate(@CurrentAdmin() a: RequestAdmin, @Param("id") id: string) {
    return this.admin.impersonate(a, id);
  }

  @UseGuards(PlatformAuthGuard)
  @Get("subscriptions")
  subscriptions(@CurrentAdmin() a: RequestAdmin) {
    return this.admin.listSubscriptions(a);
  }

  @UseGuards(PlatformAuthGuard)
  @Get("invoices")
  invoices(
    @CurrentAdmin() a: RequestAdmin,
    @Query("clientId") clientId?: string,
    @Query("status") status?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.admin.listInvoices(a, { clientId, status, from, to });
  }
  @UseGuards(PlatformAuthGuard)
  @Get("invoices/:id")
  invoice(@CurrentAdmin() a: RequestAdmin, @Param("id") id: string) {
    return this.admin.getInvoice(a, id);
  }
  @UseGuards(PlatformAuthGuard)
  @Post("invoices")
  createInvoice(@CurrentAdmin() a: RequestAdmin, @Body() dto: CreateInvoiceDto) {
    return this.admin.createInvoice(a, dto);
  }

  @UseGuards(PlatformAuthGuard)
  @Get("screenshots")
  screenshots(
    @CurrentAdmin() a: RequestAdmin,
    @Query("clientId") clientId?: string,
    @Query("employeeId") employeeId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("trigger") trigger?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.admin.listScreenshots(a, {
      clientId, employeeId, from, to, trigger,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @UseGuards(PlatformAuthGuard)
  @Get("live")
  live(@CurrentAdmin() a: RequestAdmin) {
    return this.admin.liveEmployees(a);
  }

  @UseGuards(PlatformAuthGuard)
  @Get("data/overview")
  dataOverview(@CurrentAdmin() a: RequestAdmin) {
    return this.admin.dataOverview(a);
  }

  @UseGuards(PlatformAuthGuard)
  @Get("data/requests")
  dataRequests(
    @CurrentAdmin() a: RequestAdmin,
    @Query("clientId") clientId?: string,
    @Query("status") status?: string,
    @Query("action") action?: string,
    @Query("includeAutomated") includeAutomated?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.admin.listDataRequests(a, {
      clientId, status, action,
      includeAutomated: includeAutomated === "true" || includeAutomated === "1",
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @UseGuards(PlatformAuthGuard)
  @Get("reports/overview")
  reportsOverview(@CurrentAdmin() a: RequestAdmin, @Query("from") from?: string, @Query("to") to?: string) {
    return this.admin.reportsOverview(a, { from, to });
  }

  @UseGuards(PlatformAuthGuard)
  @Get("support")
  support(@CurrentAdmin() a: RequestAdmin, @Query("clientId") clientId?: string, @Query("status") status?: string, @Query("kind") kind?: string) {
    return this.admin.listSupport(a, { clientId, status, kind });
  }

  @UseGuards(PlatformAuthGuard)
  @Get("support/:id")
  supportThread(@CurrentAdmin() a: RequestAdmin, @Param("id") id: string) {
    return this.admin.supportThread(a, id);
  }

  @UseGuards(PlatformAuthGuard)
  @Patch("support/:id")
  updateSupport(@CurrentAdmin() a: RequestAdmin, @Param("id") id: string, @Body() body: { status: string }) {
    return this.admin.updateSupport(a, id, body.status);
  }

  @UseGuards(PlatformAuthGuard)
  @Post("support/:id/reply")
  replySupport(@CurrentAdmin() a: RequestAdmin, @Param("id") id: string, @Body() body: { body: string }) {
    return this.admin.replySupport(a, id, body.body);
  }

  @UseGuards(PlatformAuthGuard)
  @Get("clients/:id/employees")
  clientEmployees(@CurrentAdmin() a: RequestAdmin, @Param("id") id: string) {
    return this.admin.clientEmployees(a, id);
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
