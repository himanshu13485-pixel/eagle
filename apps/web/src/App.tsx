import { BRAND, PLANS, NAV_FEATURES, TRUST_BADGES } from "@eagle/shared";
import type { PlanDefinition } from "@eagle/shared";

const DASHBOARD_URL = "http://localhost:5173";

const MOST_LOVED = [
  {
    title: "Automated Time Tracking",
    body: "Track active time, idle time, and app usage automatically to keep teams productive without manual input.",
  },
  {
    title: "Capture Live Screenshots",
    body: "View employee screens with periodic and app-switch screenshots for better workflow visibility.",
  },
  {
    title: "Capture Live Screencast",
    body: "Watch screens in real time — single, grid, video-wall, and patrol modes across the whole team.",
  },
  {
    title: "Track App & Website Usage",
    body: "See exactly which applications and websites time is spent on, with productivity classification.",
  },
];

const COMPARE = [
  "Offline tracking with auto-sync",
  "Ethical, transparent monitoring",
  "Real-time screenshots & screencast",
  "Visible & restricted (hidden) mode",
  "Employee access to self-reports",
  "Cross-platform (Windows, Mac, Linux)",
  "Transparent pricing",
  "GDPR compliant, AES-256 storage",
];

function Nav() {
  return (
    <header className="sticky top-0 z-40 bg-ink/95 backdrop-blur border-b border-white/5">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2 text-white">
          <Logo />
          <span className="text-xl font-extrabold">
            {BRAND.name}
            <span className="text-gold">See</span>
          </span>
        </div>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-gray-200 md:flex">
          <a className="text-gold" href="#home">Home</a>
          <a className="hover:text-white" href="#features">Features</a>
          <a className="hover:text-white" href="#pricing">Pricing</a>
          <a className="hover:text-white" href="#contact">Contact Us</a>
        </nav>
        <a
          href={DASHBOARD_URL}
          className="rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-ink shadow-lg shadow-gold/20 transition hover:brightness-105"
        >
          START 14 DAY FREE TRIAL ›
        </a>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-full bg-black ring-1 ring-white/10">
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-gold" fill="currentColor">
        <path d="M12 2 L14 13 L12 22 L10 13 Z" />
        <circle cx="13.5" cy="14.5" r="1.4" fill="#26272B" />
      </svg>
    </span>
  );
}

function Hero() {
  return (
    <section id="home" className="relative overflow-hidden bg-ink text-white">
      <div className="mx-auto max-w-5xl px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-black leading-tight md:text-7xl">
          <span className="bg-gradient-to-r from-gold via-amber-200 to-indigo-400 bg-clip-text text-transparent">
            {BRAND.headline.line1}
          </span>
          <br />
          {BRAND.headline.line2}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-xl font-semibold text-gold">{BRAND.tagline}</p>
        <p className="mx-auto mt-4 max-w-2xl text-gray-300">{BRAND.description}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href={DASHBOARD_URL}
            className="rounded-full bg-gold px-7 py-3.5 text-base font-bold text-ink shadow-xl shadow-gold/20 transition hover:brightness-105"
          >
            Start 14 Day Free Trial ➔
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-300">
          {["14-Day Free Trial", "No Credit Card", "Cancel Anytime"].map((t) => (
            <span key={t} className="flex items-center gap-2">
              <Check /> {t}
            </span>
          ))}
        </div>

        <div className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {TRUST_BADGES.map((b) => (
            <div
              key={b}
              className="grid aspect-square place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-gold p-4 text-center text-xs font-black uppercase text-ink shadow-lg"
            >
              {b}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-gold" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

function Features() {
  return (
    <section id="features" className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="text-center text-4xl font-black text-gray-900 md:text-5xl">
          Most Loved <span className="text-indigo-500">Features</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-gray-500">
          Insightful software for employee monitoring gives you a unique perspective of your team's
          productivity, daily activities, and timesheets.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {MOST_LOVED.map((f) => (
            <div key={f.title} className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-500">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">{f.title}</h3>
              <p className="mt-2 text-gray-500">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-3 rounded-2xl bg-gray-50 p-8 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_FEATURES.map((n) => (
            <div key={n} className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <span className="h-2 w-2 rounded-full bg-indigo-400" /> {n}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Compare() {
  return (
    <section className="bg-ink py-20 text-white">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <h2 className="text-4xl font-black">Why teams choose {BRAND.name}</h2>
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {COMPARE.map((c) => (
            <div key={c} className="flex items-center gap-3 rounded-xl bg-white/5 px-5 py-4 text-left">
              <Check /> <span className="font-medium text-gray-100">{c}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PriceCard({ plan }: { plan: PlanDefinition }) {
  return (
    <div
      className={`relative flex flex-col rounded-3xl border p-8 ${
        plan.recommended
          ? "border-indigo-500 bg-white shadow-2xl shadow-indigo-100 ring-2 ring-indigo-500"
          : "border-gray-200 bg-white shadow-sm"
      }`}
    >
      {plan.recommended && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-500 px-4 py-1 text-xs font-bold uppercase text-white">
          Recommended
        </span>
      )}
      <h3 className="text-xl font-black text-gray-900">{plan.name}</h3>
      <p className="mt-1 text-sm text-gray-500">{plan.blurb}</p>
      <div className="mt-6 flex items-end gap-1">
        <span className="text-4xl font-black text-gray-900">${plan.monthly}</span>
        <span className="mb-1 text-gray-500">/user/mo</span>
      </div>
      <p className="text-sm text-gray-400">or ${plan.annual}/user billed yearly</p>
      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="mt-0.5 text-green-500">✓</span> {f}
          </li>
        ))}
      </ul>
      <a
        href={DASHBOARD_URL}
        className={`mt-8 rounded-full px-6 py-3 text-center text-sm font-bold transition ${
          plan.recommended
            ? "bg-indigo-500 text-white hover:bg-indigo-600"
            : "bg-gray-900 text-white hover:bg-black"
        }`}
      >
        Purchase now
      </a>
    </div>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="bg-gray-50 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="text-center text-4xl font-black text-gray-900 md:text-5xl">Simple, transparent pricing</h2>
        <p className="mt-4 text-center text-gray-500">Pick a plan that scales with your team. Cancel anytime.</p>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {Object.values(PLANS).map((p) => (
            <PriceCard key={p.tier} plan={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="contact" className="bg-ink py-14 text-gray-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-white">
            <Logo />
            <span className="text-xl font-extrabold">
              {BRAND.name}
              <span className="text-gold">See</span>
            </span>
          </div>
          <p className="mt-4 text-sm text-gray-400">
            Real-time work visibility for modern teams. Available on Windows, Mac, and Linux.
          </p>
        </div>
        <div>
          <h4 className="mb-3 font-bold text-white">Features</h4>
          <ul className="space-y-2 text-sm">
            {NAV_FEATURES.slice(0, 5).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-bold text-white">Company</h4>
          <ul className="space-y-2 text-sm">
            <li>About</li>
            <li>Pricing</li>
            <li>Contact Us</li>
            <li>Terms & Privacy</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-bold text-white">Get started</h4>
          <a
            href={DASHBOARD_URL}
            className="inline-block rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-ink"
          >
            Start Free Trial
          </a>
          <p className="mt-4 text-sm text-gray-400">{BRAND.supportPhone}</p>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 px-6 pt-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} {BRAND.name}. Employee-owned-device monitoring, used with consent.
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Nav />
      <Hero />
      <Features />
      <Compare />
      <Pricing />
      <Footer />
    </div>
  );
}
