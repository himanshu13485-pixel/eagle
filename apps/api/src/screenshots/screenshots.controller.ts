import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { ScreenshotsService } from "./screenshots.service";

@UseGuards(JwtAuthGuard)
@Controller("screenshots")
export class ScreenshotsController {
  constructor(private readonly screenshots: ScreenshotsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query("employeeId") employeeId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.screenshots.list(user.orgId, {
      employeeId,
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
