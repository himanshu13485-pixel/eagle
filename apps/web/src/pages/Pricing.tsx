import { useState } from "react";
import { PLANS, PRICING, SELLABLE_TIERS } from "@eagle/shared";
import type { PlanDefinition } from "@eagle/shared";
import { SIGNUP_URL } from "../lib/site";
import { Accent, Button, Display, Eyebrow, Section } from "../components/ui";
import { PageHead } from "../components/PageHead";
import { faqJsonLd, jsonLdScript } from "../lib/seo";

/** Only the two tiers on sale, in catalogue order. PLANS also carries the
 *  retired tiers so old subscription rows still resolve — those must never
 *  reach the pricing page. */
const PLAN_LIST: PlanDefinition[] = SELLABLE_TIERS.map((t) => PLANS[t]);

/** Prices are whole rupees, so group them Indian-style and drop the decimals. */
const money = (n: number) => `${PRICING.symbol}${n.toLocaleString("en-IN")}`;

const [STANDARD, PRO] = PLAN_LIST;

const FAQ: [string, string][] = [
  [
    "How does the free trial work?",
    "Fourteen days of the full feature set, no card required. Both plans carry the same features, so nothing is held back during the trial. At the end you pick a plan or the account pauses — nothing is charged automatically.",
  ],
  [
    `What is the difference between ${STANDARD.name} and ${PRO.name}?`,
    `Only how far back your history goes. ${STANDARD.name} keeps ${STANDARD.limits.screenshotRetentionDays} days of screenshots and activity, ${PRO.name} keeps ${PRO.limits.screenshotRetentionDays}. Every feature — screenshots, app and website usage, Work Replay, timesheets, reports, blocking, unlimited teams — is in both.`,
  ],
  [
    "Is pricing per employee?",
    `Yes — per monitored user, per month: ${money(STANDARD.monthly)} on ${STANDARD.name}, ${money(PRO.monthly)} on ${PRO.name}. A seat is one enrolled device user. Deactivating an employee frees their seat at the next billing cycle.`,
  ],
  [
    "What does an annual term cost?",
    // Deliberately stated as months, not a percentage: the saving is two free
    // months of service, which is not the same number as a % off the rate.
    `The same monthly rate, charged once for ${PRICING.annualMonthsBilled} months — ${money(STANDARD.annual)} per user on ${STANDARD.name}, ${money(PRO.annual)} per user on ${PRO.name} — and the term then runs for ${PRICING.annualMonthsServed} months. You pay for ${PRICING.annualMonthsBilled} and are served ${PRICING.annualMonthsServed}.`,
  ],
  [
    "What happens to screenshots when I downgrade?",
    `Retention follows your new plan from that day. Moving from ${PRO.name} to ${STANDARD.name} shortens the window from ${PRO.limits.screenshotRetentionDays} days to ${STANDARD.limits.screenshotRetentionDays}, and captures older than the new window are removed by the nightly retention job — so downgrade after you have exported anything you need.`,
  ],
  [
    "What happens when I reach my storage limit?",
    // No per-plan GB figures here any more: the two plans are separated by
    // retention alone, and quoting a number per plan reads as a feature gate.
    "Screenshot storage is generous and the oldest captures are deleted automatically when you reach the cap, so capturing never stops and you always keep the most recent history. Screenshots are stored at 1080p by default, so a 4K monitor doesn't burn through the allowance; you can change that in Settings.",
  ],
  [
    "Do you need a card to start?",
    "No. You only enter payment details when you choose a paid plan at the end of the trial.",
  ],
  [
    "Can employees see their own data?",
    "Yes. Self-reporting access can be enabled per organisation so your team sees the same activity figures you do.",
  ],
  [
    "Which platforms does the agent support?",
    "Windows is fully supported today. macOS and Linux agents are in progress — talk to us if that is a requirement before you commit.",
  ],
];

export default function Pricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <>
      {/* These questions are already on the page; marking them up as an
          FAQPage is what lets them show as expandable answers in a search
          result rather than being invisible to the crawler. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(FAQ)) }}
      />
      <PageHead
        eyebrow="Pricing"
        title={<>Per user, per month. <Accent>No surprises.</Accent></>}
        lede={`Two plans with the same full product. The only difference is how far back your history goes — ${STANDARD.limits.screenshotRetentionDays} days or ${PRO.limits.screenshotRetentionDays}.`}
      />

      <Section>
        {/* Billing period toggle */}
        <div className="flex items-center justify-center gap-4">
          <span className={`text-sm font-medium ${!annual ? "text-ink" : "text-inkSoft"}`}>Monthly</span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Bill annually"
            onClick={() => setAnnual((v) => !v)}
            className={`relative h-7 w-13 shrink-0 rounded-full transition ${annual ? "bg-ink" : "bg-rule"}`}
            style={{ width: "3.25rem" }}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-paper transition-all ${
                annual ? "left-[1.75rem]" : "left-1"
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${annual ? "text-ink" : "text-inkSoft"}`}>
            Annually{" "}
            <span className="text-goldDeep">
              · {PRICING.annualMonthsServed} months for the price of {PRICING.annualMonthsBilled}
            </span>
          </span>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl gap-8 md:grid-cols-2">
          {PLAN_LIST.map((p) => (
            <PlanCard key={p.tier} plan={p} annual={annual} />
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-inkSoft">
          Prices in {PRICING.currency}, per user per month. Volume and multi-year terms are available —{" "}
          <a href="/contact" className="font-semibold text-goldDeep hover:underline">
            talk to us
          </a>
          .
        </p>
        {/* Live screen viewing is not in either plan, and is deliberately not
            sold here: one quiet line, no card and no badge, so it reads as an
            answer to a question rather than an upsell. */}
        <p className="mt-2 text-center text-xs text-inkSoft">
          Live screen viewing is available as an add-on at {money(PRICING.liveViewAddOnMonthly)} per user per month —{" "}
          <a href="/contact" className="hover:underline">
            talk to us
          </a>
          .
        </p>
      </Section>

      <Section tone="alt">
        <div className="grid gap-12 md:grid-cols-[0.7fr_1.3fr]">
          <div className="md:sticky md:top-28 md:self-start">
            <Eyebrow index="02">Questions</Eyebrow>
            <Display size="d3" className="mt-4">
              Before you commit
            </Display>
          </div>
          <dl>
            {FAQ.map(([q, a]) => (
              <div key={q} className="hairline py-6 first:border-t-0 first:pt-0">
                <dt className="font-display text-xl">{q}</dt>
                <dd className="mt-2 max-w-reading text-sm leading-relaxed text-inkSoft">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>
    </>
  );
}

function PlanCard({ plan, annual }: { plan: PlanDefinition; annual: boolean }) {
  // The headline rate is the same either way — an annual term is the monthly
  // rate charged for annualMonthsBilled months, so dividing the annual figure
  // back out keeps the two billing periods directly comparable (and keeps the
  // number coming from the plan data rather than being written twice here).
  const perMonth = annual ? plan.annual / PRICING.annualMonthsBilled : plan.monthly;
  const featured = plan.recommended;

  return (
    <article
      className={`flex flex-col rounded-2xl p-8 ${
        featured ? "bg-ink text-paper" : "border border-rule bg-paper"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-2xl">{plan.name}</h3>
        {featured && (
          <span className="rounded-full bg-gold px-3 py-1 text-[0.65rem] font-bold uppercase tracking-eyebrow text-ink">
            Popular
          </span>
        )}
      </div>
      <p className={`mt-2 text-sm ${featured ? "text-paper/60" : "text-inkSoft"}`}>{plan.blurb}</p>

      <p className="mt-8 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="tnum font-display text-5xl">{money(perMonth)}</span>
        {/* The list price is struck through next to the real one. The sr-only
            word carries the strike to a screen reader, which otherwise reads
            two prices side by side with no relationship between them. */}
        <span className={`tnum text-lg line-through ${featured ? "text-paper/50" : "text-inkSoft"}`}>
          <span className="sr-only">normally </span>
          {money(plan.listMonthly)}
        </span>
        <span className={`text-sm ${featured ? "text-paper/60" : "text-inkSoft"}`}>/user/mo</span>
      </p>
      <p className={`mt-1 text-xs ${featured ? "text-paper/50" : "text-inkSoft"}`}>
        {annual
          ? `billed yearly — ${money(plan.annual)}/user, ${PRICING.annualMonthsServed} months for the price of ${PRICING.annualMonthsBilled}`
          : "billed monthly"}
      </p>

      <Button
        href={SIGNUP_URL}
        variant={featured ? "outline" : "solid"}
        className={`mt-8 w-full ${featured ? "border-paper/30 text-paper hover:border-paper/70" : ""}`}
      >
        Start free trial
      </Button>

      <ul className={`mt-8 space-y-3 text-sm ${featured ? "text-paper/70" : "text-inkSoft"}`}>
        {plan.features.map((f) => (
          <li key={f} className="flex gap-3">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
