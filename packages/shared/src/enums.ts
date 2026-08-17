/** Manager-side roles (people who log into the dashboard). */
export enum UserRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  TEAM_LEAD = "TEAM_LEAD",
}

/** Live presence state of an enrolled device/employee.
 *  INVITED is a derived display state (never stored): an employee whose agent
 *  hasn't enrolled yet — i.e. the installer hasn't been run on their machine. */
export enum PresenceStatus {
  ACTIVE = "ACTIVE",
  IDLE = "IDLE",
  OFFLINE = "OFFLINE",
  INVITED = "INVITED",
}

/** What triggered a screenshot capture. */
export enum ScreenshotTrigger {
  PERIODIC = "PERIODIC",
  APP_SWITCH = "APP_SWITCH",
  WEBCAM = "WEBCAM",
  ON_DEMAND = "ON_DEMAND", // manager requested it from the dashboard
}

/** Foreground-activity source type. */
export enum UsageType {
  APP = "APP",
  WEB = "WEB",
}

/** Billing / product tier. Controls feature availability. */
export enum PlanTier {
  BASIC = "BASIC",
  PROFESSIONAL = "PROFESSIONAL",
  BUSINESS = "BUSINESS",
}

export enum BillingCycle {
  MONTHLY = "MONTHLY",
  ANNUALLY = "ANNUALLY",
}

export enum DevicePlatform {
  WINDOWS = "WINDOWS",
  MAC = "MAC",
  LINUX = "LINUX",
}

/** Tracking mode: visible (employee-aware) vs restricted/hidden (auto, no manual stop). */
export enum TrackingMode {
  VISIBLE = "VISIBLE",
  RESTRICTED = "RESTRICTED",
}
