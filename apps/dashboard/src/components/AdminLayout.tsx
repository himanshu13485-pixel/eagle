import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { getAdmin, adminLogout, adminApi } from "../lib/adminApi";
import { NotificationBell } from "./NotificationBell";

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super Admin", SUB_ADMIN: "Sub Admin", SALESPERSON: "Salesperson" };

const NAV = [
  { to: "/admin", label: "Overview", icon: "▦", end: true },
  { to: "/admin/clients", label: "Clients", icon: "🏢", end: false },
  { to: "/admin/live", label: "Live Monitoring", icon: "📹", end: false },
  { to: "/admin/screenshots", label: "Screenshots", icon: "📸", end: false },
  { to: "/admin/replay", label: "Work Replay", icon: "⏪", end: false },
  { to: "/admin/data", label: "Data Management", icon: "🗄️", end: false },
  { to: "/admin/reports", label: "Reports", icon: "📊", end: false },
  { to: "/admin/subscriptions", label: "Subscriptions", icon: "💳", end: false },
  { to: "/admin/invoices", label: "Invoices", icon: "🧾", end: false },
  { to: "/admin/support", label: "Support Inbox", icon: "🎧", end: false },
  { to: "/admin/notifications", label: "Notifications", icon: "🔔", end: false, notSales: true },
  { to: "/admin/staff", label: "Staff", icon: "👤", end: false, superOnly: true },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const admin = getAdmin();
  const nav = NAV.filter((n) => (!n.superOnly || admin?.role === "SUPER_ADMIN") && (!n.notSales || admin?.role !== "SALESPERSON"));
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="flex w-64 shrink-0 flex-col bg-ink text-gray-300">
        <div className="flex shrink-0 items-center gap-2.5 px-6 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-black text-lg">🦅</span>
          <div className="leading-tight">
            <div className="text-lg font-bold text-white">Workk</div>
            <div className="text-[10px] uppercase tracking-widest text-amber-400">Admin Console</div>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-2">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${isActive ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
              <span>{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/10 p-4 text-xs text-gray-500">Platform administration · manages all client accounts</div>
      </aside>

      {/* min-w-0 so a wide table scrolls inside its own wrapper rather than
          widening this column and scrolling the whole page. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <span className="text-sm font-semibold text-gray-400">Super Admin</span>
          <div className="flex items-center gap-3">
            <NotificationBell
              tone="dark"
              list={() => adminApi("/notifications")}
              markRead={(id) => adminApi(`/notifications/${id}/read`, { method: "POST" })}
              markAll={() => adminApi("/notifications/read-all", { method: "POST" })}
            />
            <div className="text-right">
              <div className="text-sm font-bold text-gray-900">{admin?.name ?? "Admin"}</div>
              <div className="text-xs text-gray-400">{ROLE_LABEL[admin?.role ?? ""] ?? admin?.role}</div>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-white">{(admin?.name ?? "A").slice(0, 1).toUpperCase()}</span>
            <button onClick={adminLogout} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Sign out</button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

export function AdminHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  useLocation();
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h1 className="text-3xl font-black text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
