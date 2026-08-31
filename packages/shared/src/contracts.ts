import {
  DevicePlatform,
  PresenceStatus,
  ScreenshotTrigger,
  TrackingMode,
  UsageType,
  UserRole,
} from "./enums.js";

/** ---- Auth ---- */
export interface LoginRequest {
  email: string;
  password: string;
}
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  orgId: string;
  orgName: string;
}
export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

/** ---- Employees ---- */
export interface EmployeeDto {
  id: string;
  name: string;
  email: string | null;
  role: string; // EMPLOYEE | MANAGER | TEAM_LEAD (designation)
  avatarUrl: string | null; // uploaded profile image (presigned), null = use initials
  teamId: string | null;
  teamName: string | null; // department
  status: PresenceStatus;
  active: boolean; // false = deactivated (paused, data kept)
  lastActiveAt: string | null;
  lastScreenshotAt: string | null;
  lastApp: string | null;
  deviceCount: number;
  agent: { platform: string | null; version: string | null; lastSeenAt: string | null } | null;
}

/** ---- Devices / agent enrollment ---- */
export interface EnrollDeviceRequest {
  token: string; // enrollment token generated in the dashboard
  hostname: string;
  platform: DevicePlatform;
  agentVersion: string;
}
export interface EnrollDeviceResponse {
  deviceId: string;
  deviceToken: string; // long-lived token the agent uses to authenticate
  employeeId: string;
  config: AgentConfig;
}

/** Server-driven agent behaviour (Settings → Screenshot Settings maps here). */
export interface AgentConfig {
  periodicScreenshots: boolean;
  screenshotIntervalMin: number; // e.g. 10
  appSwitchScreenshots: boolean;
  appSwitchDelayMin: number; // e.g. 1
  webcamPhotos: boolean;
  /** Downscale captures to at most this many pixels tall; 0 = native resolution.
   *  A 4K screen stored at native size costs ~4x a 1080p one, so the default
   *  caps it at full HD. Aspect ratio (and multi-monitor width) is preserved. */
  screenshotMaxHeight: number;
  idleAfterMin: number; // e.g. 5
  trackingMode: TrackingMode;
  strictTimeTracking: boolean;
  heartbeatSec: number; // presence ping cadence
  paused: boolean; // true when the employee is deactivated → agent goes dormant
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  periodicScreenshots: true,
  screenshotIntervalMin: 10,
  appSwitchScreenshots: true,
  appSwitchDelayMin: 1,
  webcamPhotos: false,
  screenshotMaxHeight: 1080,
  idleAfterMin: 5,
  trackingMode: TrackingMode.VISIBLE,
  strictTimeTracking: true,
  heartbeatSec: 20,
  paused: false,
};

export interface HeartbeatRequest {
  status: PresenceStatus;
  activeApp?: string | null;
  activeUrl?: string | null;
}

/** ---- Screenshots ---- */
export interface ScreenshotMeta {
  deviceId: string;
  capturedAt: string; // ISO
  trigger: ScreenshotTrigger;
  app: string | null;
  url: string | null;
  isIdle: boolean;
}
export interface ScreenshotDto {
  id: string;
  employeeId: string;
  employeeName: string;
  capturedAt: string;
  trigger: ScreenshotTrigger;
  app: string | null;
  url: string | null;
  isIdle: boolean;
  imageUrl: string; // presigned
}
export interface ScreenshotListQuery {
  employeeId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** ---- Activity / usage ---- */
export interface ActivityBatchItem {
  type: UsageType;
  name: string; // app name or website host
  startedAt: string;
  endedAt: string;
  isIdle: boolean;
}
export interface ActivityBatchRequest {
  items: ActivityBatchItem[];
}

/** ---- Reports ---- */
export type TimesheetMode = "day" | "user" | "period";
export type TimesheetBreakdown = "none" | "app" | "web";

export interface TimesheetRow {
  employeeId: string;
  employeeName: string;
  date: string | null; // user-wise: the calendar day (yyyy-mm-dd), else null
  firstActivity: string | null;
  lastActivity: string | null;
  usageSec: number;
  idleSec: number;
  offlineSec: number;
  trackedSec: number;
  overtimeSec: number;
  absentDays: number | null; // period-wise only
  breakdown: Record<string, number> | null; // app/website name -> usage seconds
}
export interface TimesheetReport {
  mode: TimesheetMode;
  breakdown: TimesheetBreakdown;
  from: string;
  to: string;
  caption: string; // "Day-wise report for 17 Aug 2026" etc.
  columns: string[]; // breakdown column names (apps/websites) to render
  totals: { usageSec: number; idleSec: number; offlineSec: number; trackedSec: number; overtimeSec: number };
  rows: TimesheetRow[];
}

export interface UsageEntry {
  name: string;
  type: UsageType;
  totalSec: number;
}
export type UsageTypeFilter = "all" | "app" | "web";
export type ComparePeriod = "none" | "previous_period" | "previous_week" | "previous_month";

export interface AppWebsiteUsageReport {
  from: string;
  to: string;
  summary: {
    totalActiveSec: number;
    shiftSec: number; // needs shift config; placeholder 0 for now
    overtimeSec: number; // needs shift config; placeholder 0 for now
    topApp: { name: string; sec: number } | null;
    topWebsite: { name: string; sec: number } | null;
    appCount: number; // distinct apps tracked
    siteCount: number; // distinct websites tracked
  };
  compare: { prevActiveSec: number; deltaPct: number } | null;
  topUsage: UsageEntry[];
  dailyTrend: { date: string; appSec: number; webSec: number }[];
  detailed: UsageEntry[];
  byEmployee: { employeeId: string; employeeName: string; totalSec: number }[];
}

/** A single foreground-activity span (for the Work Replay timeline). */
export interface ActivitySpan {
  name: string;
  type: UsageType;
  startedAt: string;
  endedAt: string;
  isIdle: boolean;
  durationSec: number;
}

/** ---- Team Productivity Snapshot (the emailed report) ---- */
export interface SnapshotContributor { name: string; sec: number }
export interface SnapshotRow { name: string; totalSec: number; contributors: SnapshotContributor[] }
export interface SnapshotHighlight {
  employeeId: string;
  name: string;
  totalHours: number;
  focusScore: string; // A–E
  contextSwitches: number;
  peakHour: string; // "13:00"
  majorActivities: { name: string; sec: number }[];
}
export interface TeamSnapshotReport {
  from: string;
  to: string;
  activeEmployees: number;
  totalEmployees: number;
  totalTrackedHours: number;
  activeHours: number;
  idleHours: number;
  activityScorePct: number;
  topDistractions: SnapshotRow[];
  topApps: SnapshotRow[];
  topWebsites: SnapshotRow[];
  highlights: SnapshotHighlight[];
}

/** Per-app/website drill-down (the "View" modal on a Detailed Usage row). */
export interface AppWebsiteDetail {
  name: string;
  type: UsageType;
  totalSec: number;
  shiftSec: number; // placeholder 0
  overtimeSec: number; // placeholder 0
  byEmployee: { employeeId: string; employeeName: string; sec: number }[];
  byDay: { date: string; sec: number }[];
}

export interface WeekdayStat {
  weekday: number; // 0=Sun … 6=Sat
  label: string;
  productivityPct: number;
  activeSec: number;
  idleSec: number;
}
export interface EmployeeProductivity {
  employeeId: string;
  employeeName: string;
  productivityPct: number;
  idlePct: number;
  activeSec: number;
  idleSec: number;
  trendDeltaSec: number; // active-time change vs the previous equal-length period
  alert: "OK" | "HIGH_IDLE";
}
export interface TeamProductivity {
  teamId: string | null;
  teamName: string;
  employeeCount: number;
  activeSec: number;
  idleSec: number;
  productivityPct: number;
}
export interface ProductivityTrendsReport {
  from: string;
  to: string;
  overview: { loggedSec: number; activePct: number; idlePct: number };
  snapshot: {
    activeEmployees: number;
    totalEmployees: number;
    needAttention: number;
    weekendSec: number;
    strongestGain: { employeeId: string; employeeName: string; deltaSec: number } | null;
  };
  kpis: {
    productivityPct: number;
    activeSec: number;
    activeDeltaSec: number;
    idleSec: number;
    idleDeltaSec: number;
    avgScore: number;
  };
  daily: { date: string; activeSec: number; idleSec: number; productivityPct: number }[];
  weekday: WeekdayStat[];
  topDrivers: { type: UsageType; name: string; activeSec: number }[];
  idleBurden: { low: number; moderate: number; high: number; critical: number };
  teams: TeamProductivity[];
  employees: EmployeeProductivity[];
}

/** ---- Realtime (Socket.IO) event names ---- */
export const RT_EVENTS = {
  // dashboard <- server
  presence: "presence.updated",
  screenshotCreated: "screenshot.created",
  liveFrame: "live.frame", // server -> viewer: a live JPEG frame
  liveEnded: "live.ended", // server -> viewer: the device stopped/disconnected
  // dashboard -> server
  join: "join", // viewer joins its org room
  liveWatch: "live.watch", // viewer subscribes/unsubscribes to an employee's live view
  // agent <-> server
  deviceJoin: "device.join",
  liveStart: "live.start", // server -> agent: a viewer wants your screen; start streaming
  liveStop: "live.stop", // server -> agent: no viewers left; stop streaming
  captureNow: "capture.now", // server -> agent: take a screenshot immediately (on-demand request)
  liveMonitors: "live.monitors", // agent -> server -> viewers: how many monitors this device has
  liveSetMonitor: "live.monitor", // viewer -> server -> agent: which monitor to stream (0-based)
  // dashboard -> server
  screenshotRequest: "screenshot.request", // viewer asks an employee's agent for an immediate shot
} as const;

/** Viewer asks to start/stop watching one employee's live screen. */
export interface LiveWatchPayload {
  employeeId: string;
  on: boolean;
}

/** Agent tells viewers how many monitors it has (for the live monitor picker). */
export interface LiveMonitorsPayload {
  employeeId: string;
  count: number;
}
/** Viewer picks which monitor an agent should stream. */
export interface LiveSetMonitorPayload {
  employeeId: string;
  index: number;
}

/** A single live screen frame relayed from an agent to viewers. */
export interface LiveFramePayload {
  employeeId: string;
  ts: number;
  data: string; // "data:image/jpeg;base64,…"
}
