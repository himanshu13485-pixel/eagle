import { BRAND } from "@eagle/shared";
import { CONTACT, SIGNUP_URL } from "../lib/site";
import { Accent, Button, Display, Eyebrow, Section } from "../components/ui";
import { PageHead } from "../components/PageHead";

const PRINCIPLES = [
  {
    index: "01",
    title: "Disclosed, or not at all",
    body: "Every device is enrolled with a token issued from your dashboard. Nothing begins recording by accident, and nothing is installed without an administrator doing it deliberately.",
  },
  {
    index: "02",
    title: "Scope has a hard edge",
    body: "Screens, application and website usage, active and idle time. No keystroke logging, no reading of personal messages, no microphone. The boundary is a product decision, not a setting.",
  },
  {
    index: "03",
    title: "Data expires",
    body: "Retention windows are enforced by a nightly job rather than left to good intentions. Screenshots age out at 15, 30 or 60 days; activity logs at 90 or 180.",
  },
  {
    index: "04",
    title: "The record cuts both ways",
    body: "The same figures that justify a difficult conversation also protect someone who did the work. Employees can be given access to their own reports.",
  },
];

export default function About() {
  return (
    <>
      <PageHead
        eyebrow="About"
        title={<>Built for managers who would rather <Accent>check than assume</Accent>.</>}
        lede={BRAND.tagline}
      />

      <Section>
        <div className="grid gap-14 md:grid-cols-[0.75fr_1.25fr]">
          <div className="md:sticky md:top-28 md:self-start">
            <Eyebrow index="01">Why we built it</Eyebrow>
          </div>
          <div className="max-w-reading space-y-5 leading-relaxed text-inkSoft">
            <p>
              Distributed teams broke the oldest management instrument there was — walking the
              floor. What replaced it was mostly guesswork: status meetings, self-reported hours,
              and a general sense of who seemed busy.
            </p>
            <p>
              Guesswork is expensive in both directions. It lets genuine problems run for months,
              and it lets quiet, productive people go unnoticed because they are not the loudest
              in a stand-up.
            </p>
            <p>
              Workk exists to replace that guesswork with a record — one that is captured
              automatically, kept only as long as it is useful, and narrow enough that reasonable
              people can agree to it.
            </p>
            <p className="text-ink">
              We are deliberate about what we did not build. There is no keylogger. There is no
              covert install path. If a feature only works when the person being measured does not
              know about it, we consider that a reason not to ship it.
            </p>
          </div>
        </div>
      </Section>

      <Section tone="alt">
        <div className="max-w-reading">
          <Eyebrow index="02">Principles</Eyebrow>
          <Display className="mt-5">
            Four commitments we <Accent>design against</Accent>.
          </Display>
        </div>
        <div className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <article key={p.index} className="hairline pt-6">
              <span className="tnum text-sm font-semibold text-gold">{p.index}</span>
              <h3 className="mt-3 font-display text-2xl">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-inkSoft">{p.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section tone="ink">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <Eyebrow index="03"><span className="text-paper/50">Talk to us</span></Eyebrow>
            <Display size="d3" className="mt-4 text-paper">
              We answer the phone.
            </Display>
          </div>
          <div className="space-y-6 text-paper/70">
            <p className="leading-relaxed">
              Workk is run by a small team, which means you get someone who knows the product
              rather than a queue. If you are weighing this against Hubstaff or Time Doctor, say
              so — we will tell you honestly where we are behind.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button to="/contact" variant="outline" className="border-paper/30 text-paper hover:border-paper/70">
                Book a demo
              </Button>
              <Button href={SIGNUP_URL} variant="outline" className="border-paper/30 text-paper hover:border-paper/70">
                Start free trial
              </Button>
            </div>
            <p className="text-sm text-paper/50">
              Or call{" "}
              <a href={CONTACT.phoneHref} className="text-gold hover:underline">{CONTACT.phone}</a>
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
