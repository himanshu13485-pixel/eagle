import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { BRAND } from "@eagle/shared";
import { CONTACT, LOGIN_URL, NAV_LINKS, SIGNUP_URL } from "../lib/site";
import { Container } from "./ui";

/** Workk mark: a geometric W monogram in gold on a rounded ink tile. */
export function Mark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`grid ${className} shrink-0 place-items-center rounded-[30%] bg-ink`}>
      <svg
        viewBox="0 0 24 24"
        className="h-[56%] w-[56%] text-gold"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 6.5 L7.5 17.5 L12 9.5 L16.5 17.5 L20 6.5" />
      </svg>
    </span>
  );
}

export function Wordmark({ tone = "ink" }: { tone?: "ink" | "paper" }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <Mark />
      <span className={`font-display text-2xl ${tone === "ink" ? "text-ink" : "text-paper"}`}>
        {BRAND.name}
      </span>
    </Link>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile sheet on navigation, otherwise it covers the new page.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/90 backdrop-blur">
      <Container className="flex items-center justify-between py-4">
        <Wordmark />

        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `transition hover:text-goldDeep ${isActive ? "text-goldDeep" : "text-inkSoft"}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-5 md:flex">
          <a href={LOGIN_URL} className="text-sm font-medium text-inkSoft hover:text-ink">
            Log in
          </a>
          <a
            href={SIGNUP_URL}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-black"
          >
            Start free trial
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Toggle menu"
          className="md:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </Container>

      {open && (
        <div className="border-t border-rule bg-paper md:hidden">
          <Container className="flex flex-col py-4">
            {NAV_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className="border-b border-rule py-3 text-inkSoft">
                {l.label}
              </NavLink>
            ))}
            <a href={LOGIN_URL} className="border-b border-rule py-3 text-inkSoft">
              Log in
            </a>
            <a href={SIGNUP_URL} className="py-4 font-semibold text-goldDeep">
              Start free trial →
            </a>
          </Container>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-ink py-16 text-paper">
      <Container>
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Wordmark tone="paper" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-paper/60">{BRAND.tagline}</p>
          </div>

          <FooterCol title="Product">
            <FooterLink to="/features">Features</FooterLink>
            <FooterLink to="/pricing">Pricing</FooterLink>
            <FooterLink to="/uninstall">Uninstall agent</FooterLink>
            <FooterExternal href={SIGNUP_URL}>Start free trial</FooterExternal>
            <FooterExternal href={LOGIN_URL}>Log in</FooterExternal>
          </FooterCol>

          <FooterCol title="Company">
            <FooterLink to="/about">About</FooterLink>
            <FooterLink to="/contact">Contact</FooterLink>
            <FooterExternal href={CONTACT.phoneHref}>{CONTACT.phone}</FooterExternal>
          </FooterCol>

          <FooterCol title="Legal">
            <FooterLink to="/privacy">Privacy policy</FooterLink>
            <FooterLink to="/terms">Terms of service</FooterLink>
            <FooterLink to="/responsible-use">Responsible use</FooterLink>
          </FooterCol>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-ruleDark pt-6 text-xs text-paper/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {BRAND.name}. All rights reserved.</p>
          <p>Employer-owned-device monitoring. No keylogging.</p>
        </div>
      </Container>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow text-paper/40">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="text-paper/70 transition hover:text-gold">
        {children}
      </Link>
    </li>
  );
}

function FooterExternal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a href={href} className="text-paper/70 transition hover:text-gold">
        {children}
      </a>
    </li>
  );
}
