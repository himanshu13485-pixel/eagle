import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { WorkspaceService } from "./workspace.service";
import { DataRequestsWorker } from "./data-requests.worker";
import { StorageService } from "../storage/storage.service";

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
  constructor(
    private readonly ws: WorkspaceService,
    private readonly worker: DataRequestsWorker,
    private readonly storage: StorageService,
  ) {}

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
    @Query("employeeId") employeeId?: string,
    @Query("status") status?: string,
    @Query("action") action?: string,
    @Query("includeAutomated") includeAutomated?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.ws.listDataRequests(u.orgId, {
      search,
      employeeId,
      status,
      action,
      includeAutomated: includeAutomated === "true" || includeAutomated === "1",
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
  @Post("data-requests")
  async createDataReq(@CurrentUser() u: RequestUser, @Body() dto: DataReqDto) {
    const req = await this.ws.createDataRequest(u.orgId, dto);
    // Start immediately rather than waiting for the next minute's tick — a small
    // export finishes while the user is still looking at the page.
    this.worker.drain().catch(() => undefined);
    return req;
  }

  /** Download a completed export. Streamed through the API so the archive is
   *  never a public URL — it holds screenshots of someone's screen. */
  @Get("data-requests/:id/download")
  async downloadDataReq(@CurrentUser() u: RequestUser, @Param("id") id: string, @Res() res: Response) {
    const req = await this.ws.getDataRequest(u.orgId, id);
    if (!req.artifactKey) throw new NotFoundException("This request has no download.");
    if (req.expiresAt && req.expiresAt < new Date()) throw new NotFoundException("This download has expired.");
    const stream = await this.storage.getStream(req.artifactKey);
    if (!stream) throw new NotFoundException("The archive is no longer available.");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${req.artifactName ?? "export.zip"}"`);
    if (req.artifactSize) res.setHeader("Content-Length", String(req.artifactSize));
    (stream as NodeJS.ReadableStream).pipe(res);
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
  @Get("support/:id")
  supportThread(@CurrentUser() u: RequestUser, @Param("id") id: string) {
    return this.ws.supportThread(u.orgId, id);
  }
  @Post("support/:id/reply")
  supportReply(@CurrentUser() u: RequestUser, @Param("id") id: string, @Body() body: { body: string }) {
    return this.ws.replySupport(u.orgId, id, u.email, body.body);
  }
}
