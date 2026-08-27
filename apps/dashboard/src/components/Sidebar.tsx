import { NavLink } from "react-router-dom";
import { BRAND } from "@eagle/shared";

const ICON: Record<string, string> = {
  dashboard: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  employees: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM3 21a7 7 0 0118 0",
  live: "M15 10l4-2v8l-4-2v-4zM3 6h12v12H3z",
  screenshots: "M4 7h3l2-2h6l2 2h3v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z",
  replay: "M4 5h16v4H4zM4 11h16v8H4zM10 13l4 2-4 2z",
  teams: "M9 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6M2 20a6 6 0 0114 0M15 14a6 6 0 017 6",
  reports: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  data: "M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1L14.5 2h-4l-.3 2.9a7 7 0 00-1.7 1l-2.4-1-2 3.4L4 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.3 2.9h4l.3-2.9a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z",
  help: "M12 22a10 10 0 100-20 10 10 0 000 20zM9.5 9a2.5 2.5 0 114 2c-1 .7-1.5 1.3-1.5 2.5M12 17h.01",
  billing: "M2 7h20v10H2zM2 11h20M6 15h4",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const MAIN = [
  { to: "/", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/employees", label: "Employees", icon: "employees" },
  { to: "/live", label: "Live Monitoring", icon: "live" },
  { to: "/screenshots", label: "Screenshots", icon: "screenshots" },
  { to: "/work-replay", label: "Work Replay", icon: "replay" },
  { to: "/teams", label: "Teams", icon: "teams" },
];

const REPORTS = [
  { to: "/reports/timesheet", label: "Timesheet" },
  { to: "/reports/app-website", label: "App & Website Usage" },
  { to: "/reports/productivity", label: "Productivity Trends" },
];

const BOTTOM = [
  { to: "/data", label: "Data Management", icon: "data" },
  { to: "/billing", label: "Billing", icon: "billing" },
  { to: "/settings", label: "Settings", icon: "settings" },
  { to: "/help", label: "Help & Support", icon: "help" },
];

const base =
  "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition";
const idle = "text-gray-300 hover:bg-white/5 hover:text-white";
const active = "bg-white/10 text-white ring-1 ring-inset ring-white/10 border-l-2 border-amber-400";

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-ink px-4 py-6 text-white">
      <div className="mb-8 flex items-center gap-2 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-black ring-1 ring-white/10">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber-400" fill="currentColor">
            <path d="M12 2 L14 13 L12 22 L10 13 Z" />
          </svg>
        </span>
        <span className="text-lg font-extrabold">
          {BRAND.name}
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
        {MAIN.map((m) => (
          <NavLink key={m.to} to={m.to} end={m.end} className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
            <Icon d={ICON[m.icon]} />
            {m.label}
          </NavLink>
        ))}

        <div className="pt-2">
          <div className="flex items-center gap-3 px-4 py-2 text-sm font-semibold text-gray-400">
            <Icon d={ICON.reports} /> Reports
          </div>
          <div className="ml-4 space-y-1 border-l border-white/10 pl-2">
            {REPORTS.map((r) => (
              <NavLink key={r.to} to={r.to} className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
                {r.label}
              </NavLink>
            ))}
          </div>
        </div>

        {BOTTOM.map((b) => (
          <NavLink key={b.to} to={b.to} className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
            <Icon d={ICON[b.icon]} />
            {b.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
