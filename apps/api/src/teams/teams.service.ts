import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { planLimits } from "@eagle/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  private async limit(orgId: string): Promise<number> {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId } });
    return planLimits(sub?.tier).teams;
  }

  async list(orgId: string) {
    const [teams, limit] = await Promise.all([
      this.prisma.team.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
        include: {
          employees: {
            select: { id: true, name: true, status: true, lastApp: true, lastScreenshotAt: true },
          },
        },
      }),
      this.limit(orgId),
    ]);
    return {
      limit: Number.isFinite(limit) ? limit : null,
      used: teams.length,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        memberCount: t.employees.length,
        members: t.employees,
      })),
    };
  }

  async create(orgId: string, name: string) {
    const [used, limit] = await Promise.all([
      this.prisma.team.count({ where: { orgId } }),
      this.limit(orgId),
    ]);
    if (used >= limit) {
      throw new BadRequestException(`Team limit reached (${used}/${limit}). Upgrade your product tier.`);
    }
    return this.prisma.team.create({ data: { orgId, name } });
  }

  async remove(orgId: string, id: string) {
    const team = await this.prisma.team.findFirst({ where: { id, orgId } });
    if (!team) throw new NotFoundException("Team not found");
    await this.prisma.team.delete({ where: { id } });
    return { ok: true };
  }

  async setEmployeeTeam(orgId: string, employeeId: string, teamId: string | null) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, orgId } });
    if (!employee) throw new NotFoundException("Employee not found");
    if (teamId) {
      const team = await this.prisma.team.findFirst({ where: { id: teamId, orgId } });
      if (!team) throw new NotFoundException("Team not found");
    }
    return this.prisma.employee.update({ where: { id: employeeId }, data: { teamId } });
  }
}
