import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { ActivityCategory, CATEGORY_GROUPS, UsageType } from "@eagle/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { CategoriesService } from "./categories.service";

const CATEGORIES = [ActivityCategory.PRODUCTIVE, ActivityCategory.UNPRODUCTIVE, ActivityCategory.NEUTRAL];

/** Every rule can be scoped to one person; omitting it means the whole org. */
class ScopeDto {
  @IsOptional() @IsString() employeeId?: string;
}

class RuleDto extends ScopeDto {
  @IsIn([UsageType.APP, UsageType.WEB]) type!: string;
  @IsString() @MinLength(1) pattern!: string;
  @IsIn(CATEGORIES) category!: string;
}

class GroupDto extends ScopeDto {
  @IsIn(CATEGORY_GROUPS.map((g) => g.key)) groupKey!: string;
  @IsIn(CATEGORIES) category!: string;
}

@UseGuards(JwtAuthGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /**
   * The named groups — "Social media", "Personal messaging & texting", and so
   * on — with the verdict that currently applies and where it came from.
   * Pass ?employeeId= to see and edit one person's view of them.
   */
  @Get("groups")
  groups(@CurrentUser() u: RequestUser, @Query("employeeId") employeeId?: string) {
    return this.categories.groupsFor(u.orgId, employeeId || null);
  }

  @Post("groups")
  setGroup(@CurrentUser() u: RequestUser, @Body() dto: GroupDto) {
    return this.categories.setGroup(u.orgId, dto.groupKey, dto.category, dto.employeeId || null);
  }

  /** Apps/sites actually seen in the window, with their current classification. */
  @Get("observed")
  observed(@CurrentUser() u: RequestUser, @Query("days") days?: string, @Query("employeeId") employeeId?: string) {
    const d = Math.min(365, Math.max(1, Number(days ?? 30) || 30));
    return this.categories.observed(u.orgId, d, employeeId || null);
  }

  @Get("rules")
  rules(@CurrentUser() u: RequestUser, @Query("employeeId") employeeId?: string) {
    return this.categories.listRules(u.orgId, employeeId || null);
  }

  @Post("rules")
  setRule(@CurrentUser() u: RequestUser, @Body() dto: RuleDto) {
    return this.categories.setRule(u.orgId, dto.type, dto.pattern, dto.category, dto.employeeId || null);
  }

  @Delete("rules/:id")
  removeRule(@CurrentUser() u: RequestUser, @Param("id") id: string) {
    return this.categories.removeRule(u.orgId, id);
  }

  /** Clears overrides. With ?employeeId= it resets just that person, so
   *  undoing one employee's tweaks doesn't reset the whole company. */
  @Post("reset")
  reset(@CurrentUser() u: RequestUser, @Query("employeeId") employeeId?: string) {
    return this.categories.resetToDefaults(u.orgId, employeeId || null);
  }
}
