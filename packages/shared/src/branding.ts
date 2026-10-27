import { PlanTier, normalizeTier, type SellableTier } from "./enums.js";

/** Single source of truth for product identity — swap these to re-skin. */
export const BRAND = {
  name: "Workk",
  tagline: "Real-time work visibility without micromanaging.",
  headline: { line1: "How Work Actually Happens", line2: "See Across Your Team" },
  description:
    "Workk gives owners and managers real-time work visibility through screenshots, live screen view, work replay, app usage, idle time, and productivity reports — so they can manage with facts, not assumptions.",
  supportPhone: "+91 81302 46989",
  // Shown in-product on Help & Support. This mailbox must actually receive
  // mail — it is the only route to a human when the ticket API is down.
  supportEmail: "support@workk.work",
  colors: {
    // Marketing (dark charcoal + gold)
    marketingBg: "#26272B",
    marketingAccent: "#F5B301",
    // Dashboard (light + indigo)
    accent: "#6366F1",
    accentDark: "#4F46E5",
  },
} as const;

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  blurb: string;
  /** Per seat, per month, in PRICING.currency. */
  monthly: number;
  /** Per seat for a full annual term. See PRICING.annualMonthsBilled. */
  annual: number;
  /** Undiscounted per-seat monthly price, shown struck through. */
  listMonthly: number;
  recommended?: boolean;
  features: string[];
  limits: PlanLimits;
}

export const PRICING = {
  currency: "INR",
  symbol: "₹",
  /** An annual term is charged for 12 months… */
  annualMonthsBilled: 12,
  /** …and runs for 14, so a year up front carries two months on the house. */
  annualMonthsServed: 14,
  /**
   * Live screen viewing is not in either plan; it is a per-seat monthly
   * add-on. Deliberately low-key in the UI — it is offered where someone
   * reaches for the feature, not sold on the pricing cards.
   */
  liveViewAddOnMonthly: 100,
} as const;

/**
 * Hard data limits per tier — enforced by the API, not just advertised.
 * Retention days are age-based; storageGb is a whole-org cap on stored
 * screenshot bytes. Whichever bites first wins: past either one, the oldest
 * screenshots are deleted automatically (see RetentionService / QuotaService).
 */
export interface PlanLimits {
  screenshotRetentionDays: number;
  activityRetentionDays: number;
  storageGb: number; // total screenshot storage for the whole org
  /** Infinity = unlimited. Note this crosses the wire as `null` — JSON has no
   *  Infinity — which matches what GET /teams already sends for "no limit".
   *  Treat a null/non-finite value as unlimited on the client. */
  teams: number;
}

/**
 * The catalogue: two plans with the same feature set, separated only by how
 * long data is kept. Prices are per seat, per month, in PRICING.currency.
 *
 * Live screen viewing is in neither plan — it is the per-seat add-on in
 * PRICING.liveViewAddOnMonthly, so it is deliberately absent from both
 * feature lists.
 */
const SHARED_FEATURES = [
  "Automatic screenshots at your chosen interval",
  "App & website usage tracking",
  "Productive / unproductive categories you control",
  "Idle and active time tracking",
  "Shift-aware timesheets with overtime and lateness",
  "Work Replay",
  "Productivity Trends and reports",
  "Website blocking",
  "Unlimited teams",
  "Hidden or visible monitoring mode",
  "Webcam capture (optional, off by default)",
  "Data export and deletion requests",
  "Windows, macOS and Linux agents",
];

/** The two plans actually on sale. */
const SELLABLE: Record<SellableTier, PlanDefinition> = {
  [PlanTier.STANDARD]: {
    tier: PlanTier.STANDARD,
    name: "Standard",
    blurb: "Everything you need to see how the day actually went",
    monthly: 299,
    listMonthly: 499,
    annual: 299 * PRICING.annualMonthsBilled,
    features: ["30-day backup of screenshots and activity", ...SHARED_FEATURES],
    limits: { screenshotRetentionDays: 30, activityRetentionDays: 30, storageGb: 50, teams: Number.POSITIVE_INFINITY },
  },
  [PlanTier.PRO]: {
    tier: PlanTier.PRO,
    name: "Pro",
    blurb: "The same product, with a quarter of history behind it",
    monthly: 399,
    listMonthly: 599,
    annual: 399 * PRICING.annualMonthsBilled,
    recommended: true,
    features: ["90-day backup of screenshots and activity", ...SHARED_FEATURES],
    limits: { screenshotRetentionDays: 90, activityRetentionDays: 90, storageGb: 150, teams: Number.POSITIVE_INFINITY },
  },

};

/** A retired tier behaves as whatever current plan it maps to, so a
 *  subscription row written before the catalogue changed keeps working until
 *  someone moves it onto a live plan. Never offered for sale. */
function legacyPlan(tier: PlanTier, name: string): PlanDefinition {
  return { ...SELLABLE[normalizeTier(tier)], tier, name: `${name} (retired)` };
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  ...SELLABLE,
  [PlanTier.BASIC]: legacyPlan(PlanTier.BASIC, "Basic"),
  [PlanTier.PROFESSIONAL]: legacyPlan(PlanTier.PROFESSIONAL, "Professional"),
  [PlanTier.BUSINESS]: legacyPlan(PlanTier.BUSINESS, "Business"),
};

/** The plan a stored tier resolves to — always one that exists. */
export function planFor(tier: string | null | undefined): PlanDefinition {
  return PLANS[normalizeTier(tier)];
}

/** Limits for a tier. Retired and unknown values resolve via normalizeTier(). */
export function planLimits(tier: string | null | undefined): PlanLimits {
  return planFor(tier).limits;
}

/** Per-seat price for a tier and cycle. An annual term is billed for
 *  PRICING.annualMonthsBilled months and served for annualMonthsServed. */
export function priceForCycle(tier: string | null | undefined, cycle: string): number {
  const plan = planFor(tier);
  return cycle === "ANNUALLY" ? plan.annual : plan.monthly;
}

export const GB = 1024 * 1024 * 1024;

/** Storage cap for a tier, in bytes. */
export function storageLimitBytes(tier: string | null | undefined): number {
  return planLimits(tier).storageGb * GB;
}

export const NAV_FEATURES = [
  "Computer Screen Monitoring",
  "Real Time Activity Monitoring",
  "Time Tracking Management",
  "Productivity Analysis and Reporting",
  "Customizable Alerts and Notifications",
  "Remote Work Support",
  "Application Usage Analysis",
  "Internet Usage Analysis",
  "Automated Timesheet",
] as const;

export const TRUST_BADGES = [
  "Works Offline & Online",
  "GDPR Compliant",
  "AES-256 Secure Storage",
  "Cross Platform",
] as const;
