import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsEmail, IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { EmployeesService } from "./employees.service";

const ROLES = ["EMPLOYEE", "MANAGER", "TEAM_LEAD"];

class CreateEmployeeDto {
  @IsString() name!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsIn(ROLES) role?: string;
}

class UpdateEmployeeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() department?: string | null;
  @IsOptional() @IsIn(ROLES) role?: string;
}

class EmployeeSettingsDto {
  @IsObject() config!: Record<string, unknown>;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get("employees")
  list(@CurrentUser() user: RequestUser) {
    return this.employees.list(user.orgId);
  }

  @Post("employees")
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user.orgId, dto);
  }

  @Post("employees/:id/avatar")
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: 2 * 1024 * 1024 } }))
  avatar(@CurrentUser() user: RequestUser, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    return this.employees.setAvatar(user.orgId, id, file);
  }

  @Post("employees/:id/enroll-token")
  enrollToken(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employees.createEnrollToken(user.orgId, id);
  }

  @Patch("employees/:id")
  update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(user.orgId, id, dto);
  }

  @Get("employees/:id/profile")
  profile(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employees.profile(user.orgId, id);
  }

  @Get("employees/:id/settings")
  getSettings(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employees.getSettings(user.orgId, id);
  }

  @Put("employees/:id/settings")
  setSettings(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: EmployeeSettingsDto) {
    return this.employees.setSettings(user.orgId, id, dto.config);
  }

  @Post("employees/:id/screenshot-request")
  screenshotRequest(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employees.screenshotRequest(user.orgId, id);
  }

  @Post("employees/:id/installer")
  installer(@CurrentUser() user: RequestUser, @Param("id") id: string, @Query("os") os?: string) {
    return this.employees.buildInstaller(user.orgId, id, os === "mac" ? "mac" : "win");
  }

  @Post("employees/:id/uninstaller")
  uninstaller(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employees.buildUninstaller(user.orgId, id);
  }

  @Post("employees/:id/deactivate")
  deactivate(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employees.setActive(user.orgId, id, false);
  }

  @Post("employees/:id/activate")
  activate(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employees.setActive(user.orgId, id, true);
  }

  @Delete("employees/:id")
  remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employees.remove(user.orgId, id);
  }

  @Get("dashboard/overview")
  overview(@CurrentUser() user: RequestUser) {
    return this.employees.overview(user.orgId);
  }
}
