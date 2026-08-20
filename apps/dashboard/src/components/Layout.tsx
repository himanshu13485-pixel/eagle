import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { getActingAs, returnToAdmin } from "../lib/adminApi";

function ActingAsBanner() {
  const acting = getActingAs();
  if (!acting) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-6 py-2 text-sm font-semibold text-white">
      <span>👁️ Viewing <b>{acting.orgName}</b> as Super Admin — you have full access to this client's account.</span>
      <button onClick={returnToAdmin} className="rounded-lg bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30">← Return to admin console</button>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      {/* min-w-0: a flex item defaults to min-width:auto, so without this any
          wide child (a table, a long name) pushes the whole column past the
          viewport and the entire page scrolls sideways instead of the table. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ActingAsBanner />
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
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
