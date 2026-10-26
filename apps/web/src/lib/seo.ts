import { BRAND, PLANS, PlanTier } from "@eagle/shared";

/**
 * Per-route page metadata.
 *
 * Every route previously shared the one <title> and description baked into
 * index.html, so search engines saw nine identical pages and social shares all
 * previewed as the home page. Titles lead with the search term and end with the
 * brand; descriptions are written to be read in a result, not stuffed.
 */

export const SITE_URL = "https://workk.work";
export const OG_IMAGE = `${SITE_URL}/og.png`;

export interface PageSeo {
  path: string;
  title: string;
  description: string;
  /** Left out of the sitemap and marked noindex — thin or utility pages. */
  noindex?: boolean;
  /** Sitemap priority; the pages that should rank come first. */
  priority?: number;
}

export const PAGES: PageSeo[] = [
  {
    path: "/",
    title: "Workk — Employee Monitoring & Productivity Tracking Software",
    description:
      "See how work actually happens across your team: automatic screenshots, live screen view, app and website usage, idle time and timesheets. 14-day free trial, no card required.",
    priority: 1,
  },
  {
    path: "/features",
    title: "Features — Screenshots, Live View, App Usage & Timesheets | Workk",
    description:
      "Everything Workk captures and everything it does not. Periodic screenshots, live screen view, work replay, app and website tracking, idle detection, shift-aware timesheets and website blocking. No keystroke logging, no reading personal messages.",
    priority: 0.9,
  },
  {
    path: "/pricing",
    title: "Pricing — Plans from $2.99 per User per Month | Workk",
    description:
      "Simple per-seat pricing with no surprises. Three plans separated by screenshot frequency, data retention and team limits. Every plan includes the full reporting suite and a 14-day free trial.",
    priority: 0.9,
  },
  {
    path: "/about",
    title: "About Workk — Monitoring Built on Disclosure, Not Secrecy",
    description:
      "Workk is employee monitoring for managers who would rather check than assume. Every device is enrolled deliberately with a token from your dashboard — nothing records by accident.",
    priority: 0.6,
  },
  {
    path: "/contact",
    title: "Contact Workk — Book a 30-Minute Demo",
    description:
      "Talk to someone who has actually deployed this. Tell us your team size and what you need to see, and we will show you the product against it. Demos run about thirty minutes.",
    priority: 0.7,
  },
  {
    path: "/responsible-use",
    title: "Responsible Use — How Workk Should Be Deployed",
    description:
      "How to deploy employee monitoring fairly and lawfully: disclose it, scope it to work devices and working hours, and tell your team what is captured.",
    priority: 0.5,
  },
  {
    path: "/privacy",
    title: "Privacy Policy | Workk",
    description: "How Workk collects, stores, retains and deletes monitoring data, and the rights your team has over it.",
    priority: 0.3,
  },
  {
    path: "/terms",
    title: "Terms of Service | Workk",
    description: "The terms that govern use of Workk, including acceptable use, billing and termination.",
    priority: 0.3,
  },
  {
    path: "/uninstall",
    title: "Uninstall the Workk Agent | Workk",
    description: "Remove the Workk monitoring agent from a Windows PC or a Mac and release its seat. It takes a few seconds.",
    // A utility page for people removing the product — no reason to compete
    // with the marketing pages for the brand term.
    noindex: true,
  },
];

export const seoFor = (path: string): PageSeo =>
  PAGES.find((p) => p.path === path) ?? {
    path,
    title: `Page not found | ${BRAND.name}`,
    description: "",
    noindex: true,
  };

/**
 * Structured data. Tells search engines what this is, what it costs and who
 * publishes it — which is what earns a rich result rather than a plain link.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.svg`,
    description: BRAND.description,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: BRAND.supportPhone,
      email: BRAND.supportEmail,
      contactType: "customer support",
    },
  };
}

export function softwareJsonLd() {
  const tiers = [PlanTier.BASIC, PlanTier.PROFESSIONAL, PlanTier.BUSINESS];
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Windows, macOS, Linux",
    description: BRAND.description,
    url: SITE_URL,
    offers: tiers.map((t) => ({
      "@type": "Offer",
      name: PLANS[t].name,
      price: PLANS[t].monthly,
      priceCurrency: "USD",
      category: "per seat per month",
    })),
  };
}

/** Serialise structured data for a <script> tag. The escape matters: a "<" in
 *  any answer could otherwise close the tag early. */
export function jsonLdScript(block: unknown): string {
  return JSON.stringify(block).replace(/</g, "\\u003c");
}

export function faqJsonLd(qa: readonly (readonly [string, string])[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}
