import type { ReactNode } from "react";
import { Container, Eyebrow } from "./ui";

/** Standard masthead for every page below the home page. */
export function PageHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: string;
}) {
  return (
    <section className="border-b border-rule bg-paper">
      <Container className="py-16 md:py-24">
        <Eyebrow index="—">{eyebrow}</Eyebrow>
        <h1 className="mt-6 max-w-4xl font-display text-d2">{title}</h1>
        {lede && <p className="mt-6 max-w-reading text-lg leading-relaxed text-inkSoft">{lede}</p>}
      </Container>
    </section>
  );
}
