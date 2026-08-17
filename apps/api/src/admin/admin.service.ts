import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestAdmin } from "./current-admin.decorator";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin || !admin.active || !bcrypt.compareSync(password, admin.passwordHash)) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, role: admin.role, email: admin.email, scope: "platform" },
      { secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access", expiresIn: process.env.JWT_ADMIN_TTL ?? "1d" },
    );
    return { accessToken, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } };
  }

  async overview(a: RequestAdmin) {
    const clientWhere = a.role === "SALESPERSON" ? { salespersonId: a.adminId } : {};
    const [clients, active, staff] = await Promise.all([
      this.prisma.organization.count({ where: clientWhere }),
      this.prisma.organization.count({ where: { ...clientWhere, status: "ACTIVE" } }),
      this.prisma.platformAdmin.groupBy({ by: ["role"], _count: true }),
    ]);
    const byRole = Object.fromEntries(staff.map((s) => [s.role, s._count]));
    return {
      clients,
      activeClients: active,
      suspendedClients: clients - active,
      superAdmins: byRole.SUPER_ADMIN ?? 0,
      subAdmins: byRole.SUB_ADMIN ?? 0,
      salespeople: byRole.SALESPERSON ?? 0,
    };
  }

  async listClients(a: RequestAdmin) {
    const where = a.role === "SALESPERSON" ? { salespersonId: a.adminId } : {};
    const orgs = await this.prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        subscription: true,
        salesperson: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
        users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } },
      },
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      status: o.status,
      employeeCount: o._count.employees,
      tier: o.subscription?.tier ?? null,
      seats: o.subscription?.seats ?? null,
      ownerName: o.users[0]?.name ?? null,
      ownerEmail: o.users[0]?.email ?? null,
      salespersonId: o.salespersonId,
      salespersonName: o.salesperson?.name ?? null,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async createClient(
    a: RequestAdmin,
    d: { name: string; ownerName: string; ownerEmail: string; ownerPassword: string; tier?: string; seats?: number; salespersonId?: string },
  ) {
    const email = d.ownerEmail.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new BadRequestException("A user with that owner email already exists.");
    }
    const org = await this.prisma.organization.create({
      data: {
        name: d.name.trim(),
        salespersonId: d.salespersonId || (a.role === "SALESPERSON" ? a.adminId : null),
      },
    });
    await this.prisma.user.create({
      data: { orgId: org.id, email, name: d.ownerName.trim(), passwordHash: bcrypt.hashSync(d.ownerPassword, 10), role: "OWNER" },
    });
    await this.prisma.subscription.create({ data: { orgId: org.id, tier: d.tier ?? "PROFESSIONAL", seats: d.seats ?? 10 } });
    await this.prisma.trackingSetting.create({ data: { orgId: org.id } });
    return { id: org.id };
  }

  async updateClient(id: string, d: { status?: string; salespersonId?: string | null; tier?: string; seats?: number }) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException("Client not found");
    await this.prisma.organization.update({
      where: { id },
      data: {
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.salespersonId !== undefined ? { salespersonId: d.salespersonId || null } : {}),
      },
    });
    if (d.tier !== undefined || d.seats !== undefined) {
      await this.prisma.subscription.upsert({
        where: { orgId: id },
        create: { orgId: id, ...(d.tier ? { tier: d.tier } : {}), ...(d.seats ? { seats: d.seats } : {}) },
        update: { ...(d.tier ? { tier: d.tier } : {}), ...(d.seats ? { seats: d.seats } : {}) },
      });
    }
    return { ok: true };
  }

  // ---- platform staff (Super Admin only; enforced in controller) ----
  listStaff() {
    return this.prisma.platformAdmin.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
  }

  async createStaff(d: { name: string; email: string; password: string; role: string }) {
    const email = d.email.trim().toLowerCase();
    if (await this.prisma.platformAdmin.findUnique({ where: { email } })) {
      throw new BadRequestException("A staff member with that email already exists.");
    }
    const admin = await this.prisma.platformAdmin.create({
      data: { name: d.name.trim(), email, passwordHash: bcrypt.hashSync(d.password, 10), role: d.role },
    });
    return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
  }

  async updateStaff(id: string, d: { active?: boolean; role?: string }) {
    const s = await this.prisma.platformAdmin.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Staff not found");
    return this.prisma.platformAdmin.update({
      where: { id },
      data: { ...(d.active !== undefined ? { active: d.active } : {}), ...(d.role !== undefined ? { role: d.role } : {}) },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  }
}
