import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Authenticates the desktop agent. The agent sends `Authorization: Bearer <deviceId>.<secret>`.
 * We verify the secret against the stored hash and attach the device to the request.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers["authorization"] ?? "";
    const raw = header.startsWith("Bearer ") ? header.slice(7) : header;
    const [deviceId, secret] = raw.split(".");
    if (!deviceId || !secret) throw new UnauthorizedException("Missing device token");

    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || !device.enrolled || !device.deviceTokenHash) {
      throw new UnauthorizedException("Unknown device");
    }
    const ok = bcrypt.compareSync(secret, device.deviceTokenHash);
    if (!ok) throw new UnauthorizedException("Invalid device token");

    req.device = device;
    return true;
  }
}
