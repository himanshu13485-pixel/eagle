import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { ForgotDto, LoginDto, RefreshDto, RegisterDto, ResetDto } from "./dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser, RequestUser } from "./current-user.decorator";
import { RateLimiter, RATE_RULES } from "../common/rate-limit";
import { RateLimit, RateLimitGuard } from "../common/rate-limit.guard";

/**
 * Every route here but /me is unauthenticated and internet-facing, so each one
 * is rate limited. Login and password reset are limited per email as well as
 * per IP, so one account can't be ground down from a spread of addresses.
 *
 * The limit is a guard so it runs before the validation pipe — counting inside
 * the handler let a flood of malformed bodies through untouched.
 */
@UseGuards(RateLimitGuard)
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly rate: RateLimiter,
  ) {}

  @Post("login")
  @RateLimit({ rule: RATE_RULES.login, bucket: "login", byBodyField: "email" })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const res = await this.auth.login(dto.email, dto.password);
    this.clear(req); // a good sign-in shouldn't count toward the next window
    return res;
  }

  @Post("register")
  @RateLimit({ rule: RATE_RULES.register, bucket: "register" })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("forgot-password")
  @RateLimit({ rule: RATE_RULES.forgotPassword, bucket: "forgot", byBodyField: "email" })
  forgot(@Body() dto: ForgotDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post("reset-password")
  @RateLimit({ rule: RATE_RULES.resetPassword, bucket: "reset" })
  async reset(@Body() dto: ResetDto, @Req() req: Request) {
    const res = await this.auth.resetPassword(dto.token, dto.password);
    this.clear(req);
    return res;
  }

  @Post("refresh")
  @RateLimit({ rule: RATE_RULES.refresh, bucket: "refresh" })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return user;
  }

  private clear(req: Request) {
    this.rate.clear(...(((req as unknown as { rateLimitKeys?: string[] }).rateLimitKeys) ?? []));
  }
}
