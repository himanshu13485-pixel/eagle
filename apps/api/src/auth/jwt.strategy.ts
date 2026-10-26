import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { accessSecret } from "../config/secrets";

export interface JwtPayload {
  sub: string; // userId
  orgId: string;
  role: string;
  email: string;
  scope?: string; // "platform" tokens belong to the Super Admin side, not org routes
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: accessSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.scope === "platform") throw new UnauthorizedException("Platform token can't access org routes");
    return { userId: payload.sub, orgId: payload.orgId, role: payload.role, email: payload.email };
  }
}
