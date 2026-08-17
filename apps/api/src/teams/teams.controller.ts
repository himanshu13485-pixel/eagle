import { Body, Controller, Delete, Param, Post, Get, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { TeamsService } from "./teams.service";

class CreateTeamDto {
  @IsString() name!: string;
}
class AssignDto {
  @IsString() employeeId!: string;
  @IsOptional() @IsString() teamId?: string | null;
}

@UseGuards(JwtAuthGuard)
@Controller("teams")
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  list(@CurrentUser() u: RequestUser) {
    return this.teams.list(u.orgId);
  }

  @Post()
  create(@CurrentUser() u: RequestUser, @Body() dto: CreateTeamDto) {
    return this.teams.create(u.orgId, dto.name);
  }

  @Delete(":id")
  remove(@CurrentUser() u: RequestUser, @Param("id") id: string) {
    return this.teams.remove(u.orgId, id);
  }

  @Post("assign")
  assign(@CurrentUser() u: RequestUser, @Body() dto: AssignDto) {
    return this.teams.setEmployeeTeam(u.orgId, dto.employeeId, dto.teamId ?? null);
  }
}
