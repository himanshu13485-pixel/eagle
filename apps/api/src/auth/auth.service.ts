import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { LoginResponse } from "@eagle/shared";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { org: true },
    });
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const ok = bcrypt.compareSync(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    const tokens = await this.issueTokens(user.id, user.orgId, user.role, user.email);
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as never,
        orgId: user.orgId,
        orgName: user.org.name,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? "change-me-refresh",
      });
      return this.issueTokens(payload.sub, payload.orgId, payload.role, payload.email);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  private async issueTokens(sub: string, orgId: string, role: string, email: string) {
    const payload = { sub, orgId, role, email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access",
      expiresIn: process.env.JWT_ACCESS_TTL ?? "15m",
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET ?? "change-me-refresh",
      expiresIn: process.env.JWT_REFRESH_TTL ?? "30d",
    });
    return { accessToken, refreshToken };
  }
}
