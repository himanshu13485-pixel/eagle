import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsString, MinLength } from "class-validator";
import { ActivityCategory, UsageType } from "@eagle/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { CategoriesService } from "./categories.service";

class RuleDto {
  @IsIn([UsageType.APP, UsageType.WEB]) type!: string;
  @IsString() @MinLength(1) pattern!: string;
  @IsIn([ActivityCategory.PRODUCTIVE, ActivityCategory.UNPRODUCTIVE, ActivityCategory.NEUTRAL]) category!: string;
}

@UseGuards(JwtAuthGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Apps/sites actually seen in the window, with their current classification. */
  @Get("observed")
  observed(@CurrentUser() u: RequestUser, @Query("days") days?: string) {
    const d = Math.min(365, Math.max(1, Number(days ?? 30) || 30));
    return this.categories.observed(u.orgId, d);
  }

  @Get("rules")
  rules(@CurrentUser() u: RequestUser) {
    return this.categories.listRules(u.orgId);
  }

  @Post("rules")
  setRule(@CurrentUser() u: RequestUser, @Body() dto: RuleDto) {
    return this.categories.setRule(u.orgId, dto.type, dto.pattern, dto.category);
  }

  @Delete("rules/:id")
  removeRule(@CurrentUser() u: RequestUser, @Param("id") id: string) {
    return this.categories.removeRule(u.orgId, id);
  }

  @Post("reset")
  reset(@CurrentUser() u: RequestUser) {
    return this.categories.resetToDefaults(u.orgId);
  }
}
