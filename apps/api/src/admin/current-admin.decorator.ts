import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface RequestAdmin {
  adminId: string;
  role: string; // SUPER_ADMIN | SUB_ADMIN | SALESPERSON
  email: string;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestAdmin => ctx.switchToHttp().getRequest().admin,
);
