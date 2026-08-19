import type { ReactNode } from "react";
import { LEGAL_UPDATED } from "../lib/site";
import { Container } from "./ui";

/**
 * Shared shell for the legal pages.
 *
 * The banner is deliberate: these documents were drafted to be accurate about
 * what the product does, but they are not legal advice and have not been
 * reviewed by a lawyer. Remove the banner once counsel has signed them off and
 * the [SQUARE BRACKET] placeholders are filled in.
 */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-paper">
      <Container className="py-16 md:py-24">
        <div className="max-w-reading">
          <p className="eyebrow">Legal</p>
          <h1 className="mt-5 font-display text-d2">{title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-inkSoft">{summary}</p>
          <p className="mt-6 text-sm text-inkSoft">Last updated {LEGAL_UPDATED}</p>

          <div className="mt-8 rounded-xl border border-gold/40 bg-gold/10 p-5 text-sm leading-relaxed text-ink">
            <strong>Draft — pending legal review.</strong> This document describes how the product
            actually behaves, but it has not been reviewed by a lawyer and the bracketed
            placeholders still need your company details. Do not rely on it as legal advice or
            present it to an enterprise buyer until counsel has approved it.
          </div>
        </div>

        <div className="mt-14 max-w-reading space-y-8 text-[0.975rem] leading-relaxed text-inkSoft">
          {children}
        </div>
      </Container>
    </section>
  );
}

export function Clause({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="hairline pt-8">
      <p className="tnum text-sm font-semibold text-gold">{n}</p>
      <h2 className="mt-2 font-display text-2xl text-ink">{title}</h2>
      <div className="mt-3 space-y-3 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">{children}</div>
    </section>
  );
}
