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
  /**
   * One public mailbox, deliberately. sales@ and privacy@ were printed here,
   * on the contact page and in the privacy policy without ever being created,
   * so anything sent to them bounced — and a dead address in a legal clause is
   * worse than no address. Everything public routes to this one; it has to
   * stay a real, monitored mailbox.
   */
  email: "hello@workk.work",
} as const;

export const NAV_LINKS = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

/** Last review date shown on the legal pages. */
export const LEGAL_UPDATED = "19 August 2026";
