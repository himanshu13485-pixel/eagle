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

/**
 * Billing / product tier. Controls feature availability.
 *
 * The catalogue is two plans that differ only in how long data is kept.
 * BASIC / PROFESSIONAL / BUSINESS are the previous three-tier catalogue, kept
 * only so rows already in the database still resolve — nothing new is written
 * with them. Put any stored value through `normalizeTier()` before using it.
 */
export enum PlanTier {
  STANDARD = "STANDARD",
  PRO = "PRO",

  /** @deprecated retired tier — read-only, resolved via normalizeTier(). */
  BASIC = "BASIC",
  /** @deprecated retired tier. */
  PROFESSIONAL = "PROFESSIONAL",
  /** @deprecated retired tier. */
  BUSINESS = "BUSINESS",
}

/** The tiers actually on sale, in display order. */
export const SELLABLE_TIERS = [PlanTier.STANDARD, PlanTier.PRO] as const;
export type SellableTier = (typeof SELLABLE_TIERS)[number];

/** Resolve any stored tier — including a retired one — to a tier on sale. */
export function normalizeTier(tier: string | null | undefined): SellableTier {
  switch (tier) {
    case PlanTier.STANDARD:
    case PlanTier.PRO:
      return tier;
    // Retired tiers map by what the customer was actually getting: Business
    // kept data longest, so it lands on the longer-retention plan.
    case PlanTier.BUSINESS:
      return PlanTier.PRO;
    default:
      return PlanTier.STANDARD;
  }
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

/** How an app or website counts toward productivity. */
export enum ActivityCategory {
  PRODUCTIVE = "PRODUCTIVE",
  UNPRODUCTIVE = "UNPRODUCTIVE",
  NEUTRAL = "NEUTRAL",
}
