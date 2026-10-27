import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import type { LoginResponse } from "@eagle/shared";
import { accessSecret, refreshSecret } from "../config/secrets";
import { PlanTier } from "@eagle/shared";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

@Injectable()
export class AuthService {
  private readonly log = new Logger("Auth");

  // Read as class fields, not module-level consts: ConfigModule loads .env
  // while the module graph is built, which is after this file's imports are
  // evaluated — a top-level read gets undefined and silently takes the
  // fallback, which here would put localhost into real reset emails.
  private readonly dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:5173";

  /** Local-dev escape hatch for working without a mail server. Requires an
   *  explicit opt-in AND a non-production build: either alone is not enough. */
  private readonly allowDevResetLink =
    process.env.ALLOW_DEV_RESET_LINK === "true" && process.env.NODE_ENV !== "production";

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
    await this.prisma.subscription.create({ data: { orgId: org.id, tier: PlanTier.PRO, seats: 5, cycle: "MONTHLY", validUntil: trialEnd } });
    await this.prisma.trackingSetting.create({ data: { orgId: org.id } });

    const tokens = await this.issueTokens(user.id, org.id, user.role, user.email);
    return { ...tokens, user: { id: user.id, email: user.email, name: user.name, role: user.role as never, orgId: org.id, orgName: org.name } };
  }

  /**
   * Start a password reset — always returns ok, so the response can't be used to
   * discover which email addresses have accounts.
   *
   * The reset link is NEVER returned to the caller in production. It used to come
   * back as `devLink` whenever SMTP was unconfigured, which made
   * `POST /auth/forgot-password {email}` a one-request account takeover for any
   * user on the platform — and an account-existence oracle besides, since the
   * field was only present for real accounts. The local-dev convenience now needs
   * an explicit opt-in that cannot be switched on by accident in production.
   */
  async forgotPassword(email: string): Promise<{ ok: true; devLink?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) return { ok: true };
    const raw = randomBytes(32).toString("hex");
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3600_000) },
    });
    const link = `${this.dashboardUrl}/reset?token=${raw}`;
    const html = `<p>Hi ${user.name},</p><p>Reset your Workk password with the link below (valid for 1 hour):</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`;
    const res = await this.mail.send([user.email], "Reset your Workk password", html);
    if (res.skipped) {
      this.log.error(
        `Password reset requested for ${user.email} but no email was sent (SMTP not configured). ` +
          "Set SMTP_HOST so users can actually reset their own passwords.",
      );
    }
    return res.skipped && this.allowDevResetLink ? { ok: true, devLink: link } : { ok: true };
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
        secret: refreshSecret(),
      });
      return this.issueTokens(payload.sub, payload.orgId, payload.role, payload.email);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  private async issueTokens(sub: string, orgId: string, role: string, email: string) {
    const payload = { sub, orgId, role, email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: accessSecret(),
      expiresIn: process.env.JWT_ACCESS_TTL ?? "15m",
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: refreshSecret(),
      expiresIn: process.env.JWT_REFRESH_TTL ?? "30d",
    });
    return { accessToken, refreshToken };
  }
}
