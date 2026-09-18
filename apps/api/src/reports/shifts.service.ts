import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface ShiftDef {
  id: string;
  name: string;
  timezone: string;
  startTime: string; // "09:00"
  endTime: string; // "17:00", may be earlier than start for an overnight shift
  workingDays: number[]; // ISO weekday numbers, 1 = Monday … 7 = Sunday
}

/** One day's shift window, as absolute instants. */
export interface ShiftWindow {
  start: Date;
  end: Date;
}

const MIN = 60_000;

/**
 * How far the given zone is ahead of UTC at that instant, in ms. Derived by
 * formatting the instant in the zone and comparing — no timezone database of
 * our own, and it stays correct across DST because it is evaluated per instant.
 */
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
  for (const part of dtf.formatToParts(at)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  // "24" shows up at midnight in some ICU versions.
  const hour = p.hour === 24 ? 0 : p.hour;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, hour, p.minute, p.second);
  return asUtc - at.getTime();
}

/** The instant at which the given wall-clock time occurs in `timeZone`. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes: the first offset is read at the wrong instant when the guess
  // lands on the far side of a DST change, and the second settles it.
  let ts = guess - zoneOffsetMs(new Date(guess), timeZone);
  ts = guess - zoneOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

/** Calendar date and ISO weekday of an instant, as seen in `timeZone`. */
export function zonedParts(at: Date, timeZone: string): { y: number; m: number; d: number; isoDay: number; key: string } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) if (part.type !== "literal") p[part.type] = part.value;
  const y = Number(p.year), m = Number(p.month), d = Number(p.day);
  const isoDay = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday as string] ?? 1;
  return { y, m, d, isoDay, key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

const hhmm = (s: string): [number, number] => {
  const [h, m] = (s || "09:00").split(":").map((n) => Number(n) || 0);
  return [h, m];
};

/**
 * Shift-aware time accounting.
 *
 * Shifts were configurable but inert: the Shift page wrote rows nothing read,
 * and every report hardcoded `shiftSec: 0` / `overtimeSec: 0`. This turns them
 * into real numbers — hours inside the roster vs outside it, late starts, and
 * days someone was rostered but never appeared.
 *
 * Everything is computed in the shift's own timezone, so a team rostered in
 * Asia/Kolkata is measured against its local 09:00 whatever the server runs on.
 */
@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Shift per employee for this org — employees without one are simply absent
   *  from the map, and their time is reported unsplit as it was before. */
  async byEmployee(orgId: string): Promise<Map<string, ShiftDef>> {
    const employees = await this.prisma.employee.findMany({
      where: { orgId, shiftId: { not: null } },
      select: { id: true, shiftId: true },
    });
    if (!employees.length) return new Map();

    const shifts = await this.prisma.shift.findMany({
      where: { orgId, id: { in: employees.map((e) => e.shiftId!) } },
    });
    const defs = new Map<string, ShiftDef>(
      shifts.map((s) => [
        s.id,
        {
          id: s.id,
          name: s.name,
          timezone: s.timezone || "UTC",
          startTime: s.startTime,
          endTime: s.endTime,
          workingDays: s.workingDays
            .split(",")
            .map((n) => Number(n.trim()))
            .filter((n) => n >= 1 && n <= 7),
        },
      ]),
    );

    const out = new Map<string, ShiftDef>();
    for (const e of employees) {
      const def = defs.get(e.shiftId!);
      if (def) out.set(e.id, def);
    }
    return out;
  }

  /**
   * The shift window covering a local calendar date, or null when that date is
   * not a working day. An end time at or before the start means the shift runs
   * overnight and finishes on the following day.
   */
  windowFor(shift: ShiftDef, y: number, m: number, d: number, isoDay: number): ShiftWindow | null {
    if (!shift.workingDays.includes(isoDay)) return null;
    const [sh, sm] = hhmm(shift.startTime);
    const [eh, em] = hhmm(shift.endTime);
    const start = zonedToUtc(y, m, d, sh, sm, shift.timezone);
    let end = zonedToUtc(y, m, d, eh, em, shift.timezone);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * MIN); // overnight
    return { start, end };
  }

  /** Windows that could overlap an instant: the local day and the one before,
   *  since an overnight shift started yesterday still covers this morning. */
  private candidateWindows(shift: ShiftDef, at: Date): ShiftWindow[] {
    const today = zonedParts(at, shift.timezone);
    const prevAt = new Date(at.getTime() - 24 * 60 * MIN);
    const prev = zonedParts(prevAt, shift.timezone);
    return [
      this.windowFor(shift, today.y, today.m, today.d, today.isoDay),
      this.windowFor(shift, prev.y, prev.m, prev.d, prev.isoDay),
    ].filter(Boolean) as ShiftWindow[];
  }

  /**
   * Split a worked span into seconds inside the roster and seconds outside it.
   * A span that straddles the end of a shift is divided, not assigned wholesale
   * to one side.
   */
  splitSpan(shift: ShiftDef, startedAt: Date, endedAt: Date): { shiftSec: number; overtimeSec: number } {
    const totalMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
    if (!totalMs) return { shiftSec: 0, overtimeSec: 0 };

    let insideMs = 0;
    for (const w of this.candidateWindows(shift, startedAt)) {
      const from = Math.max(startedAt.getTime(), w.start.getTime());
      const to = Math.min(endedAt.getTime(), w.end.getTime());
      if (to > from) insideMs += to - from;
    }
    insideMs = Math.min(insideMs, totalMs);
    return {
      shiftSec: Math.round(insideMs / 1000),
      overtimeSec: Math.round((totalMs - insideMs) / 1000),
    };
  }

  /**
   * How late a start was against the roster, in seconds. Negative means early;
   * null when the day isn't a working day or the employee has no shift.
   */
  lateBySec(shift: ShiftDef, firstActivity: Date): number | null {
    const p = zonedParts(firstActivity, shift.timezone);
    const w = this.windowFor(shift, p.y, p.m, p.d, p.isoDay);
    if (!w) return null;
    return Math.round((firstActivity.getTime() - w.start.getTime()) / 1000);
  }

  /** Working days in a range for this shift, as local date keys — the basis for
   *  "rostered but never showed up". */
  workingDayKeys(shift: ShiftDef, from: Date, to: Date): string[] {
    const keys: string[] = [];
    // Step in hours, not days: a day step can skip or repeat a local date
    // around a DST change.
    for (let t = from.getTime(); t <= to.getTime(); t += 12 * 60 * MIN) {
      const p = zonedParts(new Date(t), shift.timezone);
      if (!shift.workingDays.includes(p.isoDay)) continue;
      if (keys[keys.length - 1] !== p.key) keys.push(p.key);
    }
    return Array.from(new Set(keys));
  }
}
