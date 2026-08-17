import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { WorkspaceService } from "./workspace.service";

class ShiftDto {
  @IsString() name!: string;
  @IsString() timezone!: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @IsArray() workingDays?: number[];
}
class DataReqDto {
  @IsIn(["EXPORT", "DELETE"]) action!: string;
  @IsOptional() @IsIn(["SCREENSHOTS", "LOGS"]) dataType?: string;
  @IsOptional() @IsString() targetEmployeeId?: string;
  @IsOptional() @IsString() targetTeamId?: string;
  @IsOptional() @IsString() rangeFrom?: string;
  @IsOptional() @IsString() rangeTo?: string;
}
class SupportDto {
  @IsOptional() @IsIn(["SUPPORT", "DEMO", "FEEDBACK"]) kind?: string;
  @IsString() subject!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contactEmail?: string;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class WorkspaceController {
  constructor(private readonly ws: WorkspaceService) {}

  @Get("shifts")
  shifts(@CurrentUser() u: RequestUser) {
    return this.ws.listShifts(u.orgId);
  }
  @Post("shifts")
  createShift(@CurrentUser() u: RequestUser, @Body() dto: ShiftDto) {
    return this.ws.createShift(u.orgId, { ...dto, workingDays: dto.workingDays ?? [1, 2, 3, 4, 5] });
  }
  @Delete("shifts/:id")
  removeShift(@CurrentUser() u: RequestUser, @Param("id") id: string) {
    return this.ws.removeShift(u.orgId, id);
  }

  @Get("data-requests")
  dataReqs(
    @CurrentUser() u: RequestUser,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("action") action?: string,
    @Query("includeAutomated") includeAutomated?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.ws.listDataRequests(u.orgId, {
      search,
      status,
      action,
      includeAutomated: includeAutomated === "true" || includeAutomated === "1",
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
  @Post("data-requests")
  createDataReq(@CurrentUser() u: RequestUser, @Body() dto: DataReqDto) {
    return this.ws.createDataRequest(u.orgId, dto);
  }
  @Patch("data-requests/:id/cancel")
  cancelDataReq(@CurrentUser() u: RequestUser, @Param("id") id: string) {
    return this.ws.cancelDataRequest(u.orgId, id);
  }
  @Get("data-requests/overview")
  dataOverview(@CurrentUser() u: RequestUser) {
    return this.ws.dataOverview(u.orgId);
  }

  @Get("support")
  support(@CurrentUser() u: RequestUser) {
    return this.ws.listSupport(u.orgId);
  }
  @Post("support")
  createSupport(@CurrentUser() u: RequestUser, @Body() dto: SupportDto) {
    return this.ws.createSupport(u.orgId, u.email, dto);
  }
}
