import { NAV_FEATURES } from "@eagle/shared";
import { SIGNUP_URL } from "../lib/site";
import { Accent, Button, Display, Eyebrow, RuleItem, Section } from "../components/ui";
import { PageHead } from "../components/PageHead";

const GROUPS = [
  {
    index: "01",
    title: "Capture",
    lede: "What the agent records on an enrolled machine, and the controls you have over it.",
    items: [
      ["Periodic screenshots", "Captured on an interval you choose — 15, 10 or 5 minutes depending on plan. Quality and blur are configurable."],
      ["App-switch screenshots", "An extra capture the moment someone changes application, so context switches are not lost between intervals."],
      ["Live screencast", "Real-time view of a single screen, with a daily minute budget per plan rather than an always-on feed."],
      ["Webcam capture", "Available as an add-on where identity verification is a requirement. Off by default."],
      ["Offline buffering", "When the network drops, activity and screenshots queue locally and replay on the next successful heartbeat."],
    ],
  },
  {
    index: "02",
    title: "Understand",
    lede: "Turning raw capture into something a manager can act on in a few minutes.",
    items: [
      ["App & website usage", "Time per application and per domain, classified productive, unproductive or neutral — adjustable per organisation."],
      ["Active vs idle time", "Idle detection separates time at the desk from time actually working, without counting mouse-jiggling as output."],
      ["Work replay", "A day reconstructed as a sequence, so a review is a narrative rather than a folder of disconnected stills."],
      ["Productivity trends", "Movement over weeks and months at person, team and organisation level."],
      ["Automated timesheets", "Built from recorded activity, exportable, and reconcilable against what was invoiced."],
    ],
  },
  {
    index: "03",
    title: "Operate",
    lede: "The administrative surface — who sees what, how long it is kept, and who gets told.",
    items: [
      ["Teams and roles", "Managers and team leads see their own people. Up to 2, 10, or unlimited teams by plan."],
      ["Live wall", "Grid, patrol and video-wall modes for floors where several screens matter at once."],
      ["Alerts and notifications", "Configurable triggers delivered by email, Telegram or WhatsApp."],
      ["Retention controls", "Screenshots expire at 15, 30 or 60 days and activity logs at 90 or 180 — automatically, every night."],
      ["Data management", "Bulk export and deletion, so a subject-access or erasure request is a task rather than a project."],
    ],
  },
];

export default function Features() {
  return (
    <>
      <PageHead
        eyebrow="Features"
        title={<>Everything Workk sees — and <Accent>everything it does not</Accent>.</>}
        lede="Three layers: what gets captured on the machine, what that turns into, and how you run it day to day. Nothing here logs keystrokes or reads personal messages."
      />

      {GROUPS.map((g, i) => (
        <Section key={g.index} tone={i % 2 === 1 ? "alt" : "paper"}>
          <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr]">
            <div className="md:sticky md:top-28 md:self-start">
              <Eyebrow index={g.index}>{g.title}</Eyebrow>
              <Display size="d3" className="mt-4">{g.title}</Display>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-inkSoft">{g.lede}</p>
            </div>
            <dl className="space-y-0">
              {g.items.map(([term, def]) => (
                <div key={term} className="hairline py-6 first:border-t-0 first:pt-0">
                  <dt className="font-display text-xl">{term}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-inkSoft">{def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>
      ))}

      <Section tone="ink">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <Eyebrow index="04"><span className="text-paper/50">Coverage</span></Eyebrow>
            <Display size="d3" className="mt-4 text-paper">
              The full capability list
            </Display>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-paper/60">
              Every module included across the three plans. Which of them are available to you
              depends on your tier.
            </p>
            <Button href={SIGNUP_URL} variant="outline" className="mt-8 border-paper/25 text-paper hover:border-paper/60">
              Start free trial
            </Button>
          </div>
          <ul className="[&_li]:border-ruleDark [&_span:last-child]:text-paper/70">
            {NAV_FEATURES.map((f) => (
              <RuleItem key={f}>{f}</RuleItem>
            ))}
          </ul>
        </div>
      </Section>
    </>
  );
}
