import { BRAND } from "@eagle/shared";

/**
 * Where the dashboard lives. In production it is a sub-path on the same domain
 * (/app); in dev it is the separate Vite server on :5174's sibling, :5173.
 */
export const DASHBOARD_URL =
  (import.meta.env.VITE_DASHBOARD_URL as string) ?? "http://localhost:5173";

export const SIGNUP_URL = `${DASHBOARD_URL}/signup`.replace(/([^:])\/{2,}/g, "$1/");
export const LOGIN_URL = `${DASHBOARD_URL}/login`.replace(/([^:])\/{2,}/g, "$1/");

export const CONTACT = {
  phone: BRAND.supportPhone,
  /** tel: links must be digits only. */
  phoneHref: `tel:${BRAND.supportPhone.replace(/[^\d+]/g, "")}`,
  email: "hello@workk.work",
  sales: "sales@workk.work",
  privacy: "privacy@workk.work",
} as const;

export const NAV_LINKS = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

/** Last review date shown on the legal pages. */
export const LEGAL_UPDATED = "19 August 2026";
