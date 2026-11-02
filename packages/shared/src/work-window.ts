/**
 * When monitoring is allowed to run at all.
 *
 * A rostered shift already says when someone is expected to work; this turns
 * that into a hard gate on the agent, so a work-from-home laptop stops being
 * monitored at the end of the day instead of whenever it is shut. Outside the
 * window the agent goes fully dormant: no screenshots, no app or website
 * tracking, no live view.
 *
 * The window is resolved on the server and sent to the agent already
 * flattened, so the agent makes one cheap comparison per tick and — crucially
 * — keeps making it with no network. A laptop on hotel wi-fi still stops at
 * the right time.
 *
 * Both sides import this module rather than reimplementing the arithmetic:
 * an agent that disagrees with the server about whether it is 17:01 either
 * captures when it should not, or misses a whole shift.
 */

/** A monitoring window, with grace already folded in. */
export interface WorkWindow {
  /** IANA zone the times are read in — the employee's shift timezone, not the
   *  machine's. A laptop carried into another timezone keeps its roster. */
  timezone: string;
  /** Minutes from midnight at which the window opens, 0–1439. */
  startMin: number;
  /** How long it stays open. May run past midnight; capped at a full day. */
  durationMin: number;
  /** ISO weekdays (1 = Monday … 7 = Sunday) on which the window *opens*. A
   *  night shift opening Friday keeps running into Saturday without Saturday
   *  being listed. */
  days: number[];
}

export const MINUTES_PER_DAY = 1440;

/** Default slack either side of a shift. See resolveWorkWindow. */
export const DEFAULT_SHIFT_GRACE_MIN = 15;

export interface ShiftLike {
  timezone: string;
  /** "HH:MM", 24-hour. */
  startTime: string;
  /** "HH:MM", 24-hour. Equal to or earlier than startTime = overnight. */
  endTime: string;
  /** ISO weekday numbers, or the CSV the database stores them as. */
  workingDays: number[] | string;
  /** Minutes of monitoring before the shift starts and after it ends. */
  graceBeforeMin?: number;
  graceAfterMin?: number;
}

/**
 * Turn a roster row into a window the agent can act on.
 *
 * Grace exists for one specific reason: if monitoring began exactly on the
 * hour, nobody could ever be marked late. There would be no data before
 * 09:00 for a 09:02 arrival to be late *against*, so lateness — which the
 * timesheet already reports — would quietly always read "on time". The window
 * therefore opens a little early and closes a little late while the shift
 * itself, and every figure derived from it, stays exactly as rostered.
 *
 * Returns null when the roster can't be read as a window, which the caller
 * must treat as "no gating" rather than "monitor nothing" — a typo in a time
 * field should not silently stop monitoring an entire company.
 */
export function resolveWorkWindow(shift: ShiftLike): WorkWindow | null {
  const start = parseHhMm(shift.startTime);
  const end = parseHhMm(shift.endTime);
  if (start === null || end === null) return null;

  const days = parseWorkingDays(shift.workingDays);
  if (!days.length) return null;

  const before = clampGrace(shift.graceBeforeMin);
  const after = clampGrace(shift.graceAfterMin);

  // end === start reads as a full day rather than a zero-length shift: a
  // zero-length window would mean "never monitor", which is never what
  // somebody typing the same time twice meant.
  const shiftLength = end === start ? MINUTES_PER_DAY : mod(end - start, MINUTES_PER_DAY);

  return {
    timezone: shift.timezone || "UTC",
    startMin: mod(start - before, MINUTES_PER_DAY),
    durationMin: Math.min(shiftLength + before + after, MINUTES_PER_DAY),
    days,
  };
}

/**
 * Is `at` inside the window?
 *
 * Checks windows opening both today and yesterday, because an overnight shift
 * is still open after midnight on a day its roster never mentions.
 */
export function isWithinWorkWindow(window: WorkWindow, at: Date = new Date()): boolean {
  const now = wallClock(window.timezone, at);
  if (!now) return true; // unreadable clock → don't gate; see wallClock.

  const end = window.startMin + window.durationMin;

  // A window that opened earlier today.
  if (window.days.includes(now.weekday) && now.minuteOfDay >= window.startMin && now.minuteOfDay < end) {
    return true;
  }

  // One that opened yesterday and has not closed yet. Adding a day puts
  // "01:30 on Saturday" onto the same number line as "22:00 on Friday".
  const yesterday = now.weekday === 1 ? 7 : now.weekday - 1;
  if (window.days.includes(yesterday) && now.minuteOfDay + MINUTES_PER_DAY < end) {
    return true;
  }

  return false;
}

/** "HH:MM" → minutes from midnight. Null for anything that isn't a real time. */
function parseHhMm(value: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Accepts the stored CSV or a real array; dedupes and drops anything that
 *  isn't an ISO weekday, so one bad entry doesn't void the whole roster. */
function parseWorkingDays(days: number[] | string): number[] {
  const raw = Array.isArray(days) ? days : String(days ?? "").split(",");
  const out = new Set<number>();
  for (const d of raw) {
    const n = typeof d === "number" ? d : Number(String(d).trim());
    if (Number.isInteger(n) && n >= 1 && n <= 7) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** Grace is slack, not a second roster — half a day either side is plenty and
 *  a negative value would shrink the shift rather than pad it. */
function clampGrace(min: number | undefined): number {
  if (typeof min !== "number" || !Number.isFinite(min)) return DEFAULT_SHIFT_GRACE_MIN;
  return Math.min(Math.max(Math.round(min), 0), 720);
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * The weekday and time-of-day at `at`, as read in `timezone`.
 *
 * Returns null if the zone can't be resolved, which the caller turns into
 * "don't gate". Failing open is the deliberate choice: a bad timezone string
 * stopping every capture for a whole company is a far worse failure than a
 * window that doesn't apply, and it would be invisible until someone went
 * looking for screenshots that were never taken.
 */
function wallClock(timezone: string, at: Date): { weekday: number; minuteOfDay: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const weekday = ISO_WEEKDAY[get("weekday")];
    // Some runtimes still render midnight as "24" under h23.
    const hour = Number(get("hour")) % 24;
    const minute = Number(get("minute"));
    if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { weekday, minuteOfDay: hour * 60 + minute };
  } catch {
    return null;
  }
}

const ISO_WEEKDAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};
