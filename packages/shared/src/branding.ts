import { PlanTier } from "./enums.js";

/** Single source of truth for product identity — swap these to re-skin. */
export const BRAND = {
  name: "Eagle",
  tagline: "Real-time work visibility without micromanaging.",
  headline: { line1: "How Work Actually Happens", line2: "See Across Your Team" },
  description:
    "Eagle gives owners and managers real-time work visibility through screenshots, live screen view, work replay, app usage, idle time, and productivity reports — so they can manage with facts, not assumptions.",
  supportPhone: "+91 9016310001",
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
  monthly: number; // USD per seat / month
  annual: number; // USD per seat / year
  recommended?: boolean;
  features: string[];
}

/** Pricing + feature matrix, mirroring the reference product's three tiers. */
export const PLANS: Record<PlanTier, PlanDefinition> = {
  [PlanTier.BASIC]: {
    tier: PlanTier.BASIC,
    name: "Basic",
    blurb: "Employee-controlled monitoring essentials",
    monthly: 2.99,
    annual: 33.99,
    features: [
      "App & Website Usage reports",
      "Live screencast, 45 min/day",
      "Periodic screenshots, 15 min interval",
      "15-day screenshot retention",
      "90-day activity logs",
      "Up to 2 teams",
      "Visible monitoring mode only",
      "Webcam capture available as add-on",
    ],
  },
  [PlanTier.PROFESSIONAL]: {
    tier: PlanTier.PROFESSIONAL,
    name: "Professional",
    blurb: "Operational visibility for growing teams",
    monthly: 4.99,
    annual: 56.99,
    recommended: true,
    features: [
      "Live wall: grid, patrol, and video wall",
      "Up to 10 teams",
      "Productivity Trends",
      "Work Replay",
      "Live screencast, 90 min/day",
      "10 min screenshot interval",
      "30-day screenshot retention",
      "Hidden mode + app-switch screenshots",
      "Manager and team lead roles",
    ],
  },
  [PlanTier.BUSINESS]: {
    tier: PlanTier.BUSINESS,
    name: "Business",
    blurb: "Compliance, retention, and executive reporting",
    monthly: 8.99,
    annual: 102.99,
    features: [
      "Unlimited teams",
      "Live screencast, 180 min/day",
      "5 min screenshot interval",
      "60-day screenshot retention",
      "180-day activity logs",
      "Executive reports",
      "Priority onboarding support",
      "Advanced productivity patterns",
    ],
  },
};

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
