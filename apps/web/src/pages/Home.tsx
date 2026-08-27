import { BRAND, TRUST_BADGES } from "@eagle/shared";
import { Link } from "react-router-dom";
import { SIGNUP_URL } from "../lib/site";
import { Accent, Button, Container, Display, Eyebrow, IndexCard, Section } from "../components/ui";

const PILLARS = [
  {
    index: "01",
    title: "Automated time tracking",
    body: "Active time, idle time and app usage are recorded as work happens — no timers to start, no timesheets to chase.",
  },
  {
    index: "02",
    title: "Screenshots on your terms",
    body: "Periodic and app-switch captures at an interval you set, with retention that expires on schedule rather than accumulating forever.",
  },
  {
    index: "03",
    title: "Live screen view",
    body: "Watch a single screen or the whole floor — grid, patrol and video-wall modes for when something needs looking at now.",
  },
  {
    index: "04",
    title: "App & website analysis",
    body: "Where the hours actually went, classified as productive or not, per person and per team.",
  },
  {
    index: "05",
    title: "Work replay",
    body: "Step back through a day as a sequence rather than a folder of stills — useful for reviews and for disputes.",
  },
  {
    index: "06",
    title: "Reports that stand up",
    body: "Timesheets, productivity trends and executive summaries built from recorded activity, not self-reported estimates.",
  },
];

const STATS = [
  { figure: "5 min", label: "Fastest screenshot interval" },
  { figure: "180", label: "Minutes of live screencast per day" },
  { figure: "60d", label: "Screenshot retention on Business" },
  { figure: "0", label: "Keystrokes logged, ever" },
];

export default function Home() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-rule bg-paper">
        <Container className="py-20 md:py-32">
          <div className="grid items-end gap-12 md:grid-cols-[1.15fr_0.85fr]">
            <div>
              <Eyebrow index="—">Workforce visibility</Eyebrow>
              <h1 className="mt-6 font-display text-d1">
                {BRAND.headline.line1},
                <br />
                <Accent>{BRAND.headline.line2.toLowerCase()}</Accent>
              </h1>
              <p className="mt-8 max-w-reading text-lg leading-relaxed text-inkSoft">
                {BRAND.description}
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Button href={SIGNUP_URL}>Start 14-day free trial</Button>
                <Button to="/features" variant="outline">
                  See how it works
                </Button>
              </div>
              <p className="mt-5 text-sm text-inkSoft">
                No credit card · Cancel anytime · Set up in under an hour
              </p>
            </div>

            {/* Stat rail — the "instrument" note the rest of the page picks up. */}
            <dl className="grid grid-cols-2 gap-x-8 gap-y-8">
              {STATS.map((s) => (
                <div key={s.label} className="hairline pt-4">
                  <dt className="tnum font-display text-3xl">{s.figure}</dt>
                  <dd className="mt-1 text-xs leading-snug text-inkSoft">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </section>

      {/* ── Trust strip ──────────────────────────────────────────────── */}
      <div className="border-b border-rule bg-paperAlt py-5">
        <Container className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-center">
          {TRUST_BADGES.map((b) => (
            <span key={b} className="eyebrow text-inkSoft">
              {b}
            </span>
          ))}
        </Container>
      </div>

      {/* ── Pillars ──────────────────────────────────────────────────── */}
      <Section>
        <div className="max-w-reading">
          <Eyebrow index="01">What Workk does</Eyebrow>
          <Display className="mt-5">
            Six instruments, one <Accent>honest picture</Accent> of the working day.
          </Display>
        </div>
        <div className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <IndexCard key={p.index} index={p.index} title={p.title}>
              {p.body}
            </IndexCard>
          ))}
        </div>
        <div className="mt-14">
          <Button to="/features" variant="outline">
            Every feature in detail
          </Button>
        </div>
      </Section>

      {/* ── Position ─────────────────────────────────────────────────── */}
      <Section tone="ink">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <Eyebrow index="02">
              <span className="text-paper/50">Where we stand</span>
            </Eyebrow>
            <Display className="mt-5 text-paper">
              Monitoring earns its place when <em className="not-italic text-gold">everyone knows the rules</em>.
            </Display>
          </div>
          <div className="space-y-5 text-paper/70">
            <p className="leading-relaxed">
              Workk is built for employer-owned devices and disclosed monitoring — the same
              category as Hubstaff or Time Doctor. Every device is enrolled with a token issued
              from your dashboard, so nothing starts recording by accident.
            </p>
            <p className="leading-relaxed">
              We do not log keystrokes. We do not read personal messages. Retention expires on a
              schedule rather than growing without limit, and employees can be given access to
              their own reports.
            </p>
            <p className="leading-relaxed">
              Disclosure to your team is your responsibility, and local law may require it. We
              built the product so that meeting that bar is straightforward.
            </p>
            <Link to="/responsible-use" className="inline-block font-semibold text-gold hover:underline">
              Read our responsible-use policy →
            </Link>
          </div>
        </div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <Section tone="alt" className="text-center">
        <Display size="d2" className="mx-auto max-w-3xl">
          Manage with <Accent>facts</Accent>, not assumptions.
        </Display>
        <p className="mx-auto mt-5 max-w-xl text-inkSoft">
          Fourteen days, the full product, no card. Install the agent on a handful of machines and
          see what the week actually looked like.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Button href={SIGNUP_URL}>Start free trial</Button>
          <Button to="/contact" variant="outline">
            Book a demo
          </Button>
        </div>
      </Section>
    </>
  );
}
