import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import type { LoginResponse } from "@eagle/shared";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:5173";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  /** Self-serve signup: creates an org + owner + a 14-day Professional trial. */
  async register(d: { orgName: string; ownerName: string; email: string; password: string }): Promise<LoginResponse> {
    const email = d.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new BadRequestException("An account with that email already exists.");
    }
    const org = await this.prisma.organization.create({ data: { name: d.orgName.trim() } });
    const user = await this.prisma.user.create({
      data: { orgId: org.id, email, name: d.ownerName.trim(), passwordHash: bcrypt.hashSync(d.password, 10), role: "OWNER" },
    });
    const trialEnd = new Date(Date.now() + 14 * 86400_000);
    await this.prisma.subscription.create({ data: { orgId: org.id, tier: "PROFESSIONAL", seats: 5, cycle: "ANNUALLY", validUntil: trialEnd } });
    await this.prisma.trackingSetting.create({ data: { orgId: org.id } });

    const tokens = await this.issueTokens(user.id, org.id, user.role, user.email);
    return { ...tokens, user: { id: user.id, email: user.email, name: user.name, role: user.role as never, orgId: org.id, orgName: org.name } };
  }

  /** Start a password reset — always returns ok (no account enumeration). In dry mode
   *  (no SMTP) the reset link is returned so it can be used without a mail server. */
  async forgotPassword(email: string): Promise<{ ok: true; devLink?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) return { ok: true };
    const raw = randomBytes(32).toString("hex");
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3600_000) },
    });
    const link = `${DASHBOARD_URL}/reset?token=${raw}`;
    const html = `<p>Hi ${user.name},</p><p>Reset your EagleSee password with the link below (valid for 1 hour):</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`;
    const res = await this.mail.send([user.email], "Reset your EagleSee password", html);
    return res.skipped ? { ok: true, devLink: link } : { ok: true };
  }

  async resetPassword(token: string, password: string): Promise<{ ok: true }> {
    const row = await this.prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException("This reset link is invalid or has expired.");
    }
    await this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash: bcrypt.hashSync(password, 10) } });
    await this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return { ok: true };
  }

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
