import { useState } from "react";
import { CONTACT } from "../lib/site";
import { Accent, Container, Eyebrow } from "../components/ui";
import { PageHead } from "../components/PageHead";

type Status = "idle" | "sending" | "sent" | "error";

const REASONS = ["Book a demo", "Pricing / quote", "Technical question", "Something else"] as const;

export default function Contact() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not send");
      setStatus("sent");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not send");
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Contact"
        title={<>Talk to someone who has <Accent>actually deployed this</Accent>.</>}
        lede="Tell us the size of the team and what you are trying to see, and we will show you the product against that. Demos run about thirty minutes."
      />

      <section className="bg-paper py-16 md:py-24">
        <Container>
          <div className="grid gap-14 md:grid-cols-[1.2fr_0.8fr]">
            {/* ── Form ──────────────────────────────────────────────── */}
            <div>
              <Eyebrow index="01">Send a message</Eyebrow>

              {status === "sent" ? (
                <div className="mt-8 rounded-2xl border border-rule bg-paperAlt p-8">
                  <h2 className="font-display text-2xl">Message received.</h2>
                  <p className="mt-3 text-sm leading-relaxed text-inkSoft">
                    We reply within one business day. If it is urgent, call{" "}
                    <a href={CONTACT.phoneHref} className="font-semibold text-goldDeep hover:underline">
                      {CONTACT.phone}
                    </a>
                    .
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className="mt-6 text-sm font-semibold text-goldDeep hover:underline"
                  >
                    Send another →
                  </button>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="mt-8 space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field label="Your name" name="name" required autoComplete="name" />
                    <Field label="Work email" name="email" type="email" required autoComplete="email" />
                    <Field label="Company" name="company" autoComplete="organization" />
                    <Field label="Team size" name="teamSize" placeholder="e.g. 25" inputMode="numeric" />
                  </div>

                  <div>
                    <label htmlFor="reason" className="eyebrow">What is this about</label>
                    <select
                      id="reason"
                      name="reason"
                      className="mt-2 w-full border-b border-rule bg-transparent py-3 text-ink outline-none transition focus:border-ink"
                    >
                      {REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="message" className="eyebrow">Message</label>
                    <textarea
                      id="message"
                      name="message"
                      rows={5}
                      required
                      placeholder="What are you trying to get visibility on?"
                      className="mt-2 w-full resize-y border-b border-rule bg-transparent py-3 text-ink outline-none transition placeholder:text-inkSoft/50 focus:border-ink"
                    />
                  </div>

                  {status === "error" && (
                    <p role="alert" className="text-sm text-red-700">
                      {error}. You can also email us directly at{" "}
                      <a href={`mailto:${CONTACT.sales}`} className="font-semibold underline">
                        {CONTACT.sales}
                      </a>
                      .
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="rounded-full bg-ink px-7 py-3 text-sm font-semibold text-paper transition hover:bg-black disabled:opacity-50"
                  >
                    {status === "sending" ? "Sending…" : "Send message"}
                  </button>

                  <p className="text-xs text-inkSoft">
                    We use what you send here to reply to you, and nothing else. See our{" "}
                    <a href="/privacy" className="underline">privacy policy</a>.
                  </p>
                </form>
              )}
            </div>

            {/* ── Direct details ────────────────────────────────────── */}
            <aside className="space-y-8">
              <div>
                <Eyebrow index="02">Direct</Eyebrow>
                <dl className="mt-6 space-y-6 text-sm">
                  <Detail term="Phone" href={CONTACT.phoneHref}>{CONTACT.phone}</Detail>
                  <Detail term="Sales" href={`mailto:${CONTACT.sales}`}>{CONTACT.sales}</Detail>
                  <Detail term="General" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</Detail>
                  <Detail term="Privacy requests" href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</Detail>
                </dl>
              </div>
              <div className="hairline pt-6">
                <p className="text-sm leading-relaxed text-inkSoft">
                  Existing customer with a technical issue? Use{" "}
                  <strong className="text-ink">Help &amp; Support</strong> inside your dashboard —
                  it opens a thread we can trace against your account.
                </p>
              </div>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}

function Field({
  label,
  name,
  type = "text",
  ...rest
}: { label: string; name: string; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="eyebrow">{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        className="mt-2 w-full border-b border-rule bg-transparent py-3 text-ink outline-none transition placeholder:text-inkSoft/50 focus:border-ink"
        {...rest}
      />
    </div>
  );
}

function Detail({ term, href, children }: { term: string; href: string; children: React.ReactNode }) {
  return (
    <div className="hairline pt-4">
      <dt className="eyebrow">{term}</dt>
      <dd className="mt-1">
        <a href={href} className="text-ink transition hover:text-goldDeep">{children}</a>
      </dd>
    </div>
  );
}
