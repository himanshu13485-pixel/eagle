import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ICON, Icon, Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { getActingAs, returnToAdmin } from "../lib/adminApi";
import { useAuth } from "../lib/auth";

function ActingAsBanner() {
  const acting = getActingAs();
  if (!acting) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-white sm:px-6">
      <span>👁️ Viewing <b>{acting.orgName}</b> as Super Admin — you have full access to this client's account.</span>
      <button onClick={returnToAdmin} className="shrink-0 rounded-lg bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30">← Return to admin console</button>
    </div>
  );
}

// Phone bottom bar: the four screens a manager checks from a phone, plus the full menu.
const TABS = [
  { to: "/", label: "Home", icon: "dashboard", end: true },
  { to: "/live", label: "Live", icon: "live" },
  { to: "/screenshots", label: "Screenshots", icon: "screenshots" },
  { to: "/reports/timesheet", label: "Reports", icon: "reports", match: "/reports" },
];

function MobileTabBar({ onMore }: { onMore: () => void }) {
  const { pathname } = useLocation();
  const cls = (on: boolean) => `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold ${on ? "text-brand" : "text-gray-500"}`;
  return (
    <nav className="flex shrink-0 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cls(isActive || (!!t.match && pathname.startsWith(t.match)))}>
          <Icon d={ICON[t.icon]} className="h-6 w-6" />
          {t.label}
        </NavLink>
      ))}
      <button onClick={onMore} className={cls(false)}>
        <Icon d="M4 6h16M4 12h16M4 18h16" className="h-6 w-6" />
        More
      </button>
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar className="hidden lg:flex" />
      {/* Below lg the sidebar becomes a slide-over menu. */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* The top bar hides "Sign out" on phones, so the menu carries it. */}
            <Sidebar footer={<button onClick={logout} className="mt-2 rounded-xl px-4 py-2.5 text-left text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white">Sign out</button>} />
          </div>
        </div>
      )}
      {/* min-w-0: a flex item defaults to min-width:auto, so without this any
          wide child (a table, a long name) pushes the whole column past the
          viewport and the entire page scrolls sideways instead of the table. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ActingAsBanner />
        <Topbar onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">{children}</main>
        <MobileTabBar onMore={() => setMenuOpen(true)} />
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-black text-gray-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500 sm:text-base">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
