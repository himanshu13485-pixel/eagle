import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

/** Guards platform (Super Admin) routes: requires a token minted with scope "platform". */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException("Missing token");
    try {
      const p = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access" });
      if (p.scope !== "platform") throw new Error("not a platform token");
      req.admin = { adminId: p.sub, role: p.role, email: p.email };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid platform token");
    }
  }
}

/** Throws unless the current admin is a SUPER_ADMIN. Use inside a handler after PlatformAuthGuard. */
export function assertSuperAdmin(role: string) {
  if (role !== "SUPER_ADMIN") throw new ForbiddenException("Super Admin only.");
}
