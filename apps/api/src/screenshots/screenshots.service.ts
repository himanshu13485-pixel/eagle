import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { Paginated, ScreenshotDto, ScreenshotListQuery } from "@eagle/shared";

@Injectable()
export class ScreenshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(orgId: string, q: ScreenshotListQuery): Promise<Paginated<ScreenshotDto>> {
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(500, Math.max(1, Number(q.pageSize ?? 25))); // up to 500 so Work Replay can load a full day
    const where: any = { orgId };
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.from || q.to) {
      where.capturedAt = {};
      if (q.from) where.capturedAt.gte = new Date(q.from);
      if (q.to) where.capturedAt.lte = new Date(q.to);
    }

    const [total, rows] = await Promise.all([
      this.prisma.screenshot.count({ where }),
      this.prisma.screenshot.findMany({
        where,
        orderBy: { capturedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { employee: { select: { name: true } } },
      }),
    ]);

    const items: ScreenshotDto[] = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employee.name,
        capturedAt: r.capturedAt.toISOString(),
        trigger: r.trigger as never,
        app: r.app,
        url: r.url,
        isIdle: r.isIdle,
        imageUrl: await this.storage.presignGet(r.s3Key),
      })),
    );

    return { items, total, page, pageSize };
  }
}
