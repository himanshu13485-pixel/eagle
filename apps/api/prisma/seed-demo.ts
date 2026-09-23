/**
 * Seeds a self-contained demo organization for recording a product walkthrough
 * (splitbrain/ndemo). Every row this script writes hangs off one Organization
 * id (DEMO_ORG_ID) via foreign keys that cascade-delete from Organization, so
 * resetting the demo can never reach into a real client's data — it only ever
 * deletes-then-recreates that one org.
 *
 * Run with: npm run db:seed:demo   (from apps/api)
 * Safe to re-run — it resets the demo org first, so it's idempotent.
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { mkdir, writeFile, rm, readFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { ActivityCategory as Cat, type CategoryRule } from "@eagle/shared";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Fixed identity for the demo org. Namespacing the id under "demo-" is a belt
// -and-braces guard: resetDemoOrg() only ever deletes this exact id, and the
// assertion below makes it impossible to accidentally point this script at a
// real org id by editing the constant carelessly.
// ---------------------------------------------------------------------------
const DEMO_ORG_ID = "demo-org-northwind";
const DEMO_ORG_NAME = "Northwind Digital (Demo)";
const DEMO_LOGIN_EMAIL = "owner@northwind-demo.test";
const DEMO_LOGIN_PASSWORD = "NorthwindDemo!2026";

if (!DEMO_ORG_ID.startsWith("demo-")) {
  throw new Error("Refusing to run: DEMO_ORG_ID must stay namespaced under 'demo-'.");
}

const STORAGE_DRIVER = process.env.STORAGE_DRIVER || "local";
const STORAGE_DIR = process.env.STORAGE_DIR || join(process.cwd(), "storage");
const SCREENSHOT_INTERVAL_MIN = 10; // matches TrackingSetting's default screenshotIntervalMin
const HISTORY_WORKDAYS = 7; // full past working days to backfill, before "today"

// ============================================================================
// Fake app-window screenshots — pre-rendered once by
// prisma/demo-assets/generate-screenshots.ts (Playwright screenshots of hand-
// built HTML mockups of VS Code, Gmail, Figma, Slack, YouTube, Tally, etc.),
// one PNG per app/site name in the catalog below. Loaded and cached here so
// every capture of "Slack" reuses the same bytes rather than re-reading disk.
// ============================================================================
const MOCKUP_DIR = join(__dirname, "demo-assets", "screenshots");
const slugify = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const _mockupCache = new Map<string, Buffer>();
async function mockupImage(appOrSiteName: string): Promise<Buffer> {
  const hit = _mockupCache.get(appOrSiteName);
  if (hit) return hit;
  const file = join(MOCKUP_DIR, `${slugify(appOrSiteName)}.png`);
  if (!existsSync(file)) {
    throw new Error(
      `No mockup screenshot for "${appOrSiteName}" at ${file}. Run "npm run demo:screenshots" first, or add it to the SHOTS catalog in generate-screenshots.ts.`,
    );
  }
  const png = await readFile(file);
  _mockupCache.set(appOrSiteName, png);
  return png;
}

// ============================================================================
// Timezone math — a standalone copy of reports/shifts.service.ts's algorithm.
// Duplicated (rather than imported) so this script has no runtime dependency
// on a @nestjs/common-decorated module, which would drag in Nest DI and
// reflect-metadata just to reuse ~15 lines of pure date math.
// ============================================================================
function zoneOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(at)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const hour = p.hour === 24 ? 0 : p.hour;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, hour, p.minute, p.second);
  return asUtc - at.getTime();
}
function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - zoneOffsetMs(new Date(guess), timeZone);
  ts = guess - zoneOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}
function localParts(at: Date, timeZone: string): { y: number; m: number; d: number; isoDay: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) if (part.type !== "literal") p[part.type] = part.value;
  const isoDay = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday as string] ?? 1;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), isoDay };
}

// ---------------------------------------------------------------------------
// Small randomness helpers. Not seeded — a demo dataset regenerates slightly
// differently on each reset, which is fine (nothing depends on exact values).
// ---------------------------------------------------------------------------
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const chance = (p: number) => Math.random() < p;

// ============================================================================
// App/site catalog — names chosen to line up with @eagle/shared's
// DEFAULT_CATEGORY_RULES (plus this org's own overrides, below) so the
// productivity split the demo shows is computed the same way a real org's
// would be, not hand-faked.
// ============================================================================
const PRODUCTIVE_APPS = ["Visual Studio Code", "Cursor", "Slack", "Microsoft Teams", "Figma", "Postman", "Notion", "Tally"];
const PRODUCTIVE_SITES = [
  "github.com",
  "stackoverflow.com",
  "docs.google.com",
  "mail.google.com",
  "atlassian.net",
  "linear.app",
  "chatgpt.com",
  "northwind-crm.internal",
];
const UNPRODUCTIVE_APPS = ["Spotify", "Discord", "VLC"];
const UNPRODUCTIVE_SITES = ["youtube.com", "instagram.com", "reddit.com", "twitter.com", "producthunt.com"];
const NEUTRAL_APPS = ["Google Chrome", "File Explorer"];
const NEUTRAL_SITES = ["google.com", "wikipedia.org"];

// Org-specific overrides: a pattern DEFAULT_CATEGORY_RULES doesn't know about
// (Cursor, the in-house CRM) plus one deliberate override of a default
// (Product Hunt marked UNPRODUCTIVE for this org) — shows the feature working,
// not just the stock defaults.
const CATEGORY_OVERRIDES: CategoryRule[] = [
  { type: "APP" as CategoryRule["type"], pattern: "Cursor", category: Cat.PRODUCTIVE },
  { type: "WEB" as CategoryRule["type"], pattern: "northwind-crm.internal", category: Cat.PRODUCTIVE },
  { type: "WEB" as CategoryRule["type"], pattern: "producthunt.com", category: Cat.UNPRODUCTIVE },
];

// ============================================================================
// Org structure
// ============================================================================
type ShiftKey = "DAY" | "EVENING";
const SHIFT_DEFS: Record<ShiftKey, { name: string; startTime: string; endTime: string }> = {
  DAY: { name: "Day Shift (9–5 IST)", startTime: "09:00", endTime: "17:00" },
  EVENING: { name: "Evening Shift (2–10 IST)", startTime: "14:00", endTime: "22:00" },
};
const TIMEZONE = "Asia/Kolkata";

type TeamKey = "ENGINEERING" | "CS" | "DESIGN";
const TEAM_NAMES: Record<TeamKey, string> = {
  ENGINEERING: "Engineering",
  CS: "Customer Success",
  DESIGN: "Design",
};

type Presence = "ACTIVE" | "IDLE" | "OFFLINE" | "OFFLINE_ABSENT_TODAY";

interface EmployeeSeed {
  name: string;
  email: string;
  role: "EMPLOYEE" | "MANAGER" | "TEAM_LEAD";
  team: TeamKey;
  shift: ShiftKey;
  presence: Presence;
  platform: "WINDOWS" | "MAC";
  hostname: string;
  overtimeProne: boolean;
  /** Index (0 = HISTORY_WORKDAYS-1 ago .. ) of one past working day to skip entirely. */
  absentWorkdayIndex?: number;
}

const EMPLOYEES: EmployeeSeed[] = [
  { name: "Ananya Sharma", email: "ananya.sharma@northwind-demo.test", role: "TEAM_LEAD", team: "ENGINEERING", shift: "DAY", presence: "ACTIVE", platform: "WINDOWS", hostname: "ANANYA-LAPTOP", overtimeProne: true },
  { name: "Rohan Verma", email: "rohan.verma@northwind-demo.test", role: "EMPLOYEE", team: "ENGINEERING", shift: "DAY", presence: "ACTIVE", platform: "WINDOWS", hostname: "ROHAN-DESKTOP", overtimeProne: false },
  { name: "Meera Iyer", email: "meera.iyer@northwind-demo.test", role: "EMPLOYEE", team: "ENGINEERING", shift: "EVENING", presence: "ACTIVE", platform: "MAC", hostname: "Meera-MacBook-Pro", overtimeProne: false },
  { name: "Kabir Singh", email: "kabir.singh@northwind-demo.test", role: "EMPLOYEE", team: "ENGINEERING", shift: "DAY", presence: "IDLE", platform: "WINDOWS", hostname: "KABIR-LAPTOP", overtimeProne: false, absentWorkdayIndex: 3 },
  { name: "Priya Nair", email: "priya.nair@northwind-demo.test", role: "MANAGER", team: "CS", shift: "DAY", presence: "IDLE", platform: "MAC", hostname: "Priya-MacBook-Air", overtimeProne: true },
  { name: "Arjun Mehta", email: "arjun.mehta@northwind-demo.test", role: "EMPLOYEE", team: "CS", shift: "DAY", presence: "OFFLINE", platform: "WINDOWS", hostname: "ARJUN-DESKTOP", overtimeProne: false },
  { name: "Sara Khan", email: "sara.khan@northwind-demo.test", role: "EMPLOYEE", team: "CS", shift: "EVENING", presence: "OFFLINE", platform: "WINDOWS", hostname: "SARA-LAPTOP", overtimeProne: false },
  { name: "Devansh Rao", email: "devansh.rao@northwind-demo.test", role: "EMPLOYEE", team: "DESIGN", shift: "DAY", presence: "OFFLINE_ABSENT_TODAY", platform: "MAC", hostname: "Devansh-MacBook-Pro", overtimeProne: false },
];

// ============================================================================
// Workday block generation
// ============================================================================
interface Block {
  type: "APP" | "WEB";
  name: string;
  startMin: number; // minutes from the day's block-sequence start
  durationMin: number;
  isIdle: boolean;
}

/** One simulated workday as a sequence of app/site blocks, roughly 7.5–9.5h span including breaks. */
function genDayBlocks(overtimeChance: number): Block[] {
  const blocks: Omit<Block, "startMin">[] = [];
  const push = (type: "APP" | "WEB", name: string, durationMin: number, isIdle = false) =>
    blocks.push({ type, name, durationMin, isIdle });

  push("APP", pick(PRODUCTIVE_APPS), randInt(35, 65));
  push("WEB", pick(PRODUCTIVE_SITES), randInt(15, 35));
  if (chance(0.4)) push("WEB", pick(UNPRODUCTIVE_SITES), randInt(5, 15));
  push("APP", "Idle", randInt(5, 15), true);
  push("APP", pick(PRODUCTIVE_APPS), randInt(45, 90));
  push("WEB", pick(NEUTRAL_SITES), randInt(5, 15));
  push("APP", "Idle", randInt(30, 55), true); // lunch
  push("APP", pick(PRODUCTIVE_APPS), randInt(50, 90));
  push("WEB", pick(PRODUCTIVE_SITES), randInt(15, 30));
  if (chance(0.35)) push("APP", pick(UNPRODUCTIVE_APPS), randInt(5, 20));
  push("APP", pick(PRODUCTIVE_APPS), randInt(30, 60));
  if (chance(overtimeChance)) push("WEB", pick(PRODUCTIVE_SITES), randInt(20, 75)); // past shift end

  let t = 0;
  return blocks.map((b) => {
    const withStart = { ...b, startMin: t };
    t += b.durationMin;
    return withStart;
  });
}

/** A partial workday up to `capMin` minutes, for "today" when it's still in progress. */
function genPartialDayBlocks(capMin: number, endInIdle: boolean): Block[] {
  const full = genDayBlocks(0);
  const kept: Block[] = [];
  for (const b of full) {
    if (b.startMin >= capMin) break;
    const durationMin = Math.min(b.durationMin, capMin - b.startMin);
    kept.push({ ...b, durationMin });
  }
  if (!kept.length) return kept;
  if (endInIdle && !kept[kept.length - 1].isIdle) {
    const last = kept[kept.length - 1];
    const idleStart = last.startMin + last.durationMin;
    if (idleStart < capMin) kept.push({ type: "APP", name: "Idle", startMin: idleStart, durationMin: capMin - idleStart, isIdle: true });
  }
  return kept;
}

// ============================================================================
// Reset — the only destructive step, scoped to exactly one org id.
// ============================================================================
async function resetDemoOrg() {
  await prisma.organization.delete({ where: { id: DEMO_ORG_ID } }).catch((e: { code?: string }) => {
    if (e?.code !== "P2025") throw e; // P2025 = not found — fine on first run
  });
  if (STORAGE_DRIVER === "local") {
    await rm(join(STORAGE_DIR, DEMO_ORG_ID), { recursive: true, force: true });
  }
}

async function writeScreenshotFile(key: string, appOrSiteName: string): Promise<number> {
  const png = await mockupImage(appOrSiteName);
  if (STORAGE_DRIVER === "local") {
    const full = join(STORAGE_DIR, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, png);
  }
  return png.length;
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  console.log(`Resetting demo org "${DEMO_ORG_ID}" (if it exists)...`);
  await resetDemoOrg();

  const org = await prisma.organization.create({
    data: { id: DEMO_ORG_ID, name: DEMO_ORG_NAME, status: "ACTIVE" },
  });

  await prisma.user.create({
    data: {
      orgId: org.id,
      email: DEMO_LOGIN_EMAIL,
      name: "Demo Owner",
      role: "OWNER",
      passwordHash: bcrypt.hashSync(DEMO_LOGIN_PASSWORD, 10),
    },
  });

  await prisma.subscription.create({
    data: {
      orgId: org.id,
      tier: "BUSINESS",
      cycle: "ANNUALLY",
      seats: 15,
      validUntil: new Date(Date.now() + 300 * 86400_000),
    },
  });

  await prisma.trackingSetting.create({
    data: {
      orgId: org.id,
      screenshotIntervalMin: SCREENSHOT_INTERVAL_MIN,
      blockedSites: "facebook.com,youtube.com,instagram.com,twitter.com,reddit.com",
    },
  });

  await prisma.activityCategory.createMany({
    data: CATEGORY_OVERRIDES.map((r) => ({ orgId: org.id, type: r.type, pattern: r.pattern, category: r.category })),
  });

  const teams = new Map<TeamKey, string>();
  for (const [key, name] of Object.entries(TEAM_NAMES) as [TeamKey, string][]) {
    const team = await prisma.team.create({ data: { orgId: org.id, name } });
    teams.set(key, team.id);
  }

  const shifts = new Map<ShiftKey, string>();
  for (const [key, def] of Object.entries(SHIFT_DEFS) as [ShiftKey, (typeof SHIFT_DEFS)[ShiftKey]][]) {
    const shift = await prisma.shift.create({
      data: {
        orgId: org.id,
        name: def.name,
        timezone: TIMEZONE,
        startTime: def.startTime,
        endTime: def.endTime,
        workingDays: "1,2,3,4,5",
      },
    });
    shifts.set(key, shift.id);
  }

  const now = new Date();

  for (const spec of EMPLOYEES) {
    const employee = await prisma.employee.create({
      data: {
        orgId: org.id,
        teamId: teams.get(spec.team)!,
        shiftId: shifts.get(spec.shift)!,
        name: spec.name,
        email: spec.email,
        role: spec.role,
        active: true,
      },
    });

    const device = await prisma.device.create({
      data: {
        orgId: org.id,
        employeeId: employee.id,
        hostname: spec.hostname,
        platform: spec.platform,
        agentVersion: "1.4.2",
        enrolled: true,
        status: spec.presence === "ACTIVE" ? "ACTIVE" : spec.presence === "IDLE" ? "IDLE" : "OFFLINE",
      },
    });

    const shiftStart = SHIFT_DEFS[spec.shift].startTime.split(":").map(Number) as [number, number];
    const sessions: {
      orgId: string; employeeId: string; type: string; name: string;
      startedAt: Date; endedAt: Date; isIdle: boolean; durationSec: number;
    }[] = [];
    const screenshots: {
      orgId: string; employeeId: string; deviceId: string; capturedAt: Date;
      trigger: string; app: string | null; url: string | null; isIdle: boolean; s3Key: string; bytes: number;
    }[] = [];

    let lastActiveAt: Date | null = null;
    let lastApp: string | null = null;

    const addDay = async (y: number, m: number, d: number, blocks: Block[], latenessMin: number) => {
      const dayStart = zonedToUtc(y, m, d, shiftStart[0], shiftStart[1] + latenessMin, TIMEZONE);
      for (const b of blocks) {
        if (b.durationMin <= 0) continue;
        const startedAt = new Date(dayStart.getTime() + b.startMin * 60_000);
        const endedAt = new Date(startedAt.getTime() + b.durationMin * 60_000);
        sessions.push({
          orgId: org.id,
          employeeId: employee.id,
          type: b.type,
          name: b.name,
          startedAt,
          endedAt,
          isIdle: b.isIdle,
          durationSec: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
        });
        if (!b.isIdle) {
          if (!lastActiveAt || endedAt > lastActiveAt) lastActiveAt = endedAt;
          lastApp = b.type === "APP" ? b.name : lastApp;

          for (let t = 0; t < b.durationMin; t += SCREENSHOT_INTERVAL_MIN) {
            const capturedAt = new Date(startedAt.getTime() + t * 60_000);
            const key = `${org.id}/${employee.id}/${capturedAt.getFullYear()}/${capturedAt.getMonth() + 1}/${capturedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}.png`;
            const bytes = await writeScreenshotFile(key, b.name);
            screenshots.push({
              orgId: org.id,
              employeeId: employee.id,
              deviceId: device.id,
              capturedAt,
              trigger: t === 0 ? "APP_SWITCH" : "PERIODIC",
              app: b.type === "APP" ? b.name : null,
              url: b.type === "WEB" ? b.name : null,
              isIdle: false,
              s3Key: key,
              bytes,
            });
          }
        }
      }
    };

    // Past complete working days, walking back from yesterday.
    let workdaysFilled = 0;
    let workdayIndex = 0;
    for (let back = 1; workdaysFilled < HISTORY_WORKDAYS && back < 30; back++) {
      const at = new Date(now.getTime() - back * 86400_000);
      const { y, m, d, isoDay } = localParts(at, TIMEZONE);
      if (isoDay > 5) continue; // weekend
      const skip = spec.absentWorkdayIndex === workdayIndex;
      workdayIndex++;
      workdaysFilled++;
      if (skip) continue; // rostered but absent — shows up as a gap in the timesheet
      const latenessMin = randInt(-5, 20);
      await addDay(y, m, d, genDayBlocks(spec.overtimeProne ? 0.4 : 0.1), latenessMin);
    }

    // Today, if it's a working day for this shift.
    const todayParts = localParts(now, TIMEZONE);
    if (todayParts.isoDay <= 5 && spec.presence !== "OFFLINE_ABSENT_TODAY") {
      const shiftStartToday = zonedToUtc(todayParts.y, todayParts.m, todayParts.d, shiftStart[0], shiftStart[1], TIMEZONE);
      const elapsedMin = Math.min((now.getTime() - shiftStartToday.getTime()) / 60_000, 10 * 60);
      if (elapsedMin > 5) {
        const endInIdle = spec.presence === "IDLE";
        const capMin = spec.presence === "OFFLINE" ? Math.min(elapsedMin, randInt(180, 420)) : elapsedMin;
        await addDay(todayParts.y, todayParts.m, todayParts.d, genPartialDayBlocks(capMin, endInIdle), 0);
      }
    }

    if (sessions.length) await prisma.activitySession.createMany({ data: sessions });
    if (screenshots.length) await prisma.screenshot.createMany({ data: screenshots });

    const lastScreenshotAt = screenshots.length ? screenshots[screenshots.length - 1].capturedAt : null;
    const presenceStatus = spec.presence === "ACTIVE" ? "ACTIVE" : spec.presence === "IDLE" ? "IDLE" : "OFFLINE";
    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        status: presenceStatus,
        lastActiveAt: spec.presence === "ACTIVE" ? now : lastActiveAt,
        lastScreenshotAt,
        lastApp,
      },
    });
    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: spec.presence === "ACTIVE" ? now : lastActiveAt ?? now },
    });

    console.log(`  ${spec.name.padEnd(16)} ${spec.presence.padEnd(20)} sessions=${sessions.length} screenshots=${screenshots.length}`);
  }

  console.log(`\nSeeded demo org "${DEMO_ORG_NAME}" (${org.id}).`);
  console.log(`Login: ${DEMO_LOGIN_EMAIL} / ${DEMO_LOGIN_PASSWORD}`);
  if (STORAGE_DRIVER !== "local") {
    console.log(`STORAGE_DRIVER=${STORAGE_DRIVER} — screenshot rows were created but no image bytes were uploaded (this script only writes to local disk).`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
