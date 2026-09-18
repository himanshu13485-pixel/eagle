import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { unlink } from "fs/promises";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { QuotaService } from "../storage/quota.service";
import { ZipWriter } from "./zip-writer";

/** Screenshots per export. Past this the archive is truncated and the request
 *  says so, rather than building a multi-gigabyte download nobody asked for. */
const MAX_EXPORT_ITEMS = 5000;
/** Completed exports are swept up after this long (the link stops working). */
const ARTIFACT_TTL_DAYS = 7;
/** Rows deleted per statement, to keep any single query short. */
const DELETE_CHUNK = 500;

/**
 * Runs the Export and Delete requests raised on Data Management.
 *
 * Before this existed the UI wrote a PENDING row and nothing ever picked it up,
 * so every request sat unresolved forever — including deletions, which is a
 * problem when the product advertises GDPR compliance and a person has asked
 * for their data to be removed.
 *
 * One request at a time, oldest first: these are rare, and a slow export should
 * not compete with live screenshot ingest for the database.
 */
@Injectable()
export class DataRequestsWorker {
  private readonly log = new Logger("DataRequests");
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly quota: QuotaService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    await this.drain();
  }

  /** Nightly: drop archives past their TTL so exports don't accumulate forever. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweepExpired() {
    const stale = await this.prisma.dataRequest.findMany({
      where: { artifactKey: { not: null }, expiresAt: { lt: new Date() } },
      select: { id: true, artifactKey: true },
    });
    for (const r of stale) {
      await this.storage.deleteImage(r.artifactKey!);
      await this.prisma.dataRequest.update({
        where: { id: r.id },
        data: { artifactKey: null, artifactSize: 0, expiresAt: null },
      });
    }
    if (stale.length) this.log.log(`Swept ${stale.length} expired export archive(s)`);
  }

  /** Process every queued request. Safe to call concurrently — only one runs. */
  async drain(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let done = 0;
    try {
      for (;;) {
        const next = await this.prisma.dataRequest.findFirst({
          where: { status: "PENDING", source: "USER" },
          orderBy: { createdAt: "asc" },
        });
        if (!next) break;
        await this.run(next.id);
        done++;
      }
    } finally {
      this.running = false;
    }
    return done;
  }

  /** Which employees a request targets: one person, a whole team, or the org. */
  private async targetEmployeeIds(req: {
    orgId: string;
    targetEmployeeId: string | null;
    targetTeamId: string | null;
  }): Promise<string[]> {
    if (req.targetEmployeeId) return [req.targetEmployeeId];
    const where = req.targetTeamId
      ? { orgId: req.orgId, teamId: req.targetTeamId }
      : { orgId: req.orgId };
    const rows = await this.prisma.employee.findMany({ where, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async run(id: string): Promise<void> {
    // Claim it first so a second caller can't pick up the same request.
    const claimed = await this.prisma.dataRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "PROCESSING", startedAt: new Date() },
    });
    if (!claimed.count) return;

    const req = await this.prisma.dataRequest.findUnique({ where: { id } });
    if (!req) return;

    try {
      const employeeIds = await this.targetEmployeeIds(req);
      const result =
        req.action === "DELETE"
          ? await this.runDelete(req, employeeIds)
          : await this.runExport(req, employeeIds);

      await this.prisma.dataRequest.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date(), ...result },
      });
      this.log.log(`${req.action} ${req.dataType} for org ${req.orgId}: ${result.itemCount} item(s)`);
    } catch (e: any) {
      this.log.error(`request ${id} failed: ${e?.message ?? e}`);
      await this.prisma.dataRequest.update({
        where: { id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error: String(e?.message ?? e).slice(0, 500),
        },
      });
    }
  }

  // ---- Delete ----

  private async runDelete(
    req: { orgId: string; dataType: string; rangeFrom: Date | null; rangeTo: Date | null },
    employeeIds: string[],
  ): Promise<{ itemCount: number }> {
    if (!employeeIds.length) return { itemCount: 0 };
    const range = this.rangeFilter(req.rangeFrom, req.rangeTo);

    if (req.dataType === "LOGS") {
      const r = await this.prisma.activitySession.deleteMany({
        where: { orgId: req.orgId, employeeId: { in: employeeIds }, startedAt: range },
      });
      return { itemCount: r.count };
    }

    // Screenshots: the image files have to go too, not just the rows — the same
    // order the retention sweep uses, so a crash mid-way leaves no orphan rows
    // pointing at deleted files.
    let removed = 0;
    let freed = 0;
    for (;;) {
      const batch = await this.prisma.screenshot.findMany({
        where: { orgId: req.orgId, employeeId: { in: employeeIds }, capturedAt: range },
        take: DELETE_CHUNK,
        select: { id: true, s3Key: true, bytes: true },
      });
      if (!batch.length) break;
      for (const s of batch) await this.storage.deleteImage(s.s3Key);
      await this.prisma.screenshot.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } });
      removed += batch.length;
      freed += batch.reduce((n, b) => n + Math.max(0, b.bytes), 0);
    }
    if (freed) this.quota.noteRemoved(req.orgId, freed);
    return { itemCount: removed };
  }

  // ---- Export ----

  private async runExport(
    req: { id: string; orgId: string; dataType: string; rangeFrom: Date | null; rangeTo: Date | null },
    employeeIds: string[],
  ): Promise<{ itemCount: number; artifactKey: string; artifactName: string; artifactSize: number; expiresAt: Date }> {
    const range = this.rangeFilter(req.rangeFrom, req.rangeTo);
    const stamp = new Date().toISOString().slice(0, 10);
    const tmp = join(tmpdir(), `workk-export-${randomBytes(6).toString("hex")}.zip`);
    const zip = new ZipWriter(tmp);
    let count = 0;

    try {
      const names = new Map(
        (await this.prisma.employee.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, name: true },
        })).map((e) => [e.id, e.name]),
      );

      if (req.dataType === "LOGS") {
        const rows = await this.prisma.activitySession.findMany({
          where: { orgId: req.orgId, employeeId: { in: employeeIds }, startedAt: range },
          orderBy: { startedAt: "asc" },
        });
        const csv = [
          ["Employee", "Type", "Name", "Started", "Ended", "Duration (sec)", "Idle"].join(","),
          ...rows.map((r) =>
            [
              names.get(r.employeeId) ?? r.employeeId,
              r.type,
              r.name,
              r.startedAt.toISOString(),
              r.endedAt.toISOString(),
              String(r.durationSec),
              r.isIdle ? "yes" : "no",
            ]
              .map(csvCell)
              .join(","),
          ),
        ].join("\n");
        await zip.add(`activity-${stamp}.csv`, Buffer.from(csv, "utf8"));
        count = rows.length;
      } else {
        const shots = await this.prisma.screenshot.findMany({
          where: { orgId: req.orgId, employeeId: { in: employeeIds }, capturedAt: range },
          orderBy: { capturedAt: "asc" },
          take: MAX_EXPORT_ITEMS,
          select: { id: true, s3Key: true, capturedAt: true, employeeId: true, app: true, trigger: true },
        });

        const index: string[] = [["File", "Employee", "Captured", "App", "Trigger"].join(",")];
        for (const s of shots) {
          const buf = await this.readAll(s.s3Key);
          // A screenshot whose file has already been swept shouldn't abort the
          // whole export — record it in the index and carry on.
          if (!buf) continue;
          const who = safeName(names.get(s.employeeId) ?? s.employeeId);
          const when = s.capturedAt.toISOString().replace(/[:.]/g, "-");
          const entry = `${who}/${when}-${s.id.slice(-6)}.jpg`;
          await zip.add(entry, buf, s.capturedAt);
          index.push([entry, names.get(s.employeeId) ?? "", s.capturedAt.toISOString(), s.app ?? "", s.trigger].map(csvCell).join(","));
          count++;
        }
        await zip.add("index.csv", Buffer.from(index.join("\n"), "utf8"));
        if (shots.length === MAX_EXPORT_ITEMS) {
          await zip.add(
            "TRUNCATED.txt",
            Buffer.from(
              `This export hit the ${MAX_EXPORT_ITEMS}-screenshot limit and contains the oldest ${MAX_EXPORT_ITEMS} captures in the range.\nNarrow the date range and request again for the rest.\n`,
              "utf8",
            ),
          );
        }
      }

      const { bytes } = await zip.close();
      const artifactName = `workk-${req.dataType.toLowerCase()}-${stamp}.zip`;
      const artifactKey = `exports/${req.orgId}/${req.id}.zip`;
      const artifactSize = await this.storage.putFile(artifactKey, tmp, "application/zip");

      return {
        itemCount: count,
        artifactKey,
        artifactName,
        artifactSize: artifactSize || bytes,
        expiresAt: new Date(Date.now() + ARTIFACT_TTL_DAYS * 86400_000),
      };
    } catch (e) {
      await zip.close().catch(() => undefined);
      await unlink(tmp).catch(() => undefined);
      throw e;
    }
  }

  private async readAll(key: string): Promise<Buffer | null> {
    const stream = await this.storage.getStream(key);
    if (!stream) return null;
    const chunks: Buffer[] = [];
    for await (const c of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  }

  /** An absent bound means "no limit on that side", not "the epoch". */
  private rangeFilter(from: Date | null, to: Date | null) {
    const f: { gte?: Date; lte?: Date } = {};
    if (from) f.gte = from;
    if (to) f.lte = to;
    return Object.keys(f).length ? f : undefined;
  }
}

function csvCell(v: string): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Folder-safe ASCII name. Export paths are generated, not user-facing
 *  identifiers, and some extractors still mangle non-ASCII entry names. */
function safeName(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "employee"
  );
}
