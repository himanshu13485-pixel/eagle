import { useState } from "react";
import { PLANS } from "@eagle/shared";
import type { PlanDefinition } from "@eagle/shared";
import { SIGNUP_URL } from "../lib/site";
import { Accent, Button, Display, Eyebrow, Section } from "../components/ui";
import { PageHead } from "../components/PageHead";

const FAQ = [
  [
    "How does the free trial work?",
    "Fourteen days of the full Professional feature set, no card required. At the end you pick a plan or the account pauses — nothing is charged automatically.",
  ],
  [
    "Is pricing per employee?",
    "Yes — per monitored seat, per month. A seat is one enrolled device user. Deactivating an employee frees their seat at the next billing cycle.",
  ],
  [
    "What happens to screenshots when I downgrade?",
    "Retention follows your new plan from that day. Existing captures older than the new window are removed by the nightly retention job, so downgrade after you have exported anything you need.",
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
  const plans = Object.values(PLANS) as PlanDefinition[];

  return (
    <>
      <PageHead
        eyebrow="Pricing"
        title={<>Per seat, per month. <Accent>No surprises.</Accent></>}
        lede="Three plans separated by how often you capture, how long you keep it, and how many teams you run. Every plan includes the full reporting suite."
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
            Annually <span className="text-goldDeep">· save ~5%</span>
          </span>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-3">
          {plans.map((p) => (
            <PlanCard key={p.tier} plan={p} annual={annual} />
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-inkSoft">
          Prices in USD. Volume and multi-year terms are available —{" "}
          <a href="/contact" className="font-semibold text-goldDeep hover:underline">
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
  // Annual is quoted per year in the plan data; show it per month so the two
  // billing periods are comparable at a glance.
  const perMonth = annual ? plan.annual / 12 : plan.monthly;
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

      <p className="mt-8 flex items-baseline gap-1.5">
        <span className="tnum font-display text-5xl">${perMonth.toFixed(2)}</span>
        <span className={`text-sm ${featured ? "text-paper/60" : "text-inkSoft"}`}>/seat/mo</span>
      </p>
      <p className={`mt-1 text-xs ${featured ? "text-paper/50" : "text-inkSoft"}`}>
        {annual ? `billed annually — $${plan.annual.toFixed(2)}/seat/yr` : "billed monthly"}
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
