import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Page-width container. Everything on the site aligns to this measure. */
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-6 ${className}`}>{children}</div>;
}

/** Vertical rhythm block. `tone` switches the whole section to the dark palette. */
export function Section({
  children,
  tone = "paper",
  className = "",
  id,
}: {
  children: ReactNode;
  tone?: "paper" | "alt" | "ink";
  className?: string;
  id?: string;
}) {
  const tones = {
    paper: "bg-paper text-ink",
    alt: "bg-paperAlt text-ink",
    ink: "bg-ink text-paper",
  };
  return (
    <section id={id} className={`${tones[tone]} py-20 md:py-28 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

/** Small-caps label above a heading, optionally numbered like an index. */
export function Eyebrow({ children, index }: { children: ReactNode; index?: string }) {
  return (
    <p className="eyebrow flex items-center gap-3">
      {index && <span className="tnum text-gold">{index}</span>}
      <span>{children}</span>
    </p>
  );
}

export function Display({
  children,
  size = "d2",
  className = "",
}: {
  children: ReactNode;
  size?: "d1" | "d2" | "d3";
  className?: string;
}) {
  // Mapped, not interpolated: Tailwind scans source statically and would not
  // emit a class built from a template string.
  const sizes = { d1: "text-d1", d2: "text-d2", d3: "text-d3" };
  return <h2 className={`font-display ${sizes[size]} ${className}`}>{children}</h2>;
}

/** Emphasised run of words inside a display heading. */
export function Accent({ children }: { children: ReactNode }) {
  return <em className="not-italic text-goldDeep">{children}</em>;
}

type ButtonProps = {
  children: ReactNode;
  to?: string;
  href?: string;
  variant?: "solid" | "outline" | "ghost";
  className?: string;
};

export function Button({ children, to, href, variant = "solid", className = "" }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
  const variants = {
    solid: "bg-ink text-paper hover:bg-black",
    outline: "border border-ink/20 text-ink hover:border-ink/50",
    ghost: "text-ink hover:text-goldDeep",
  };
  const cls = `${base} ${variants[variant]} ${className}`;

  if (to) return <Link to={to} className={cls}>{children}</Link>;
  return <a href={href} className={cls}>{children}</a>;
}

/** Hairline-separated list item used across features and comparisons. */
export function RuleItem({ children }: { children: ReactNode }) {
  return (
    <li className="hairline flex items-baseline gap-4 py-4 first:border-t-0">
      <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
      <span className="text-inkSoft">{children}</span>
    </li>
  );
}

/** Numbered editorial card — the site's main content unit. */
export function IndexCard({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="hairline pt-6">
      <span className="tnum text-sm font-semibold text-gold">{index}</span>
      <h3 className="mt-3 font-display text-2xl leading-snug">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-inkSoft">{children}</p>
    </article>
  );
}

/** Long-form prose wrapper for the legal and about pages. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-reading space-y-6 text-[0.975rem] leading-relaxed text-inkSoft [&_h2]:pt-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
      {children}
    </div>
  );
}
