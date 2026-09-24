import { BRAND } from "@eagle/shared";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Mark } from "./Mark";
import { NotificationBell } from "./NotificationBell";

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const { user, logout } = useAuth();
  const initials = (user?.name ?? "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:gap-4 sm:px-6">
      {/* Phones: menu button + logo take the place of the sidebar. */}
      {onMenu && (
        <button onClick={onMenu} aria-label="Open menu" className="-ml-1 grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100 lg:hidden">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      )}
      <div className="flex items-center gap-2 lg:hidden">
        <Mark className="h-8 w-8" />
        <span className="text-lg font-extrabold text-gray-900">{BRAND.name}</span>
      </div>
      <div className="flex-1">
        <input
          placeholder="Search Here"
          className="hidden w-full max-w-xl rounded-full bg-gray-100 px-5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/30 sm:block"
        />
      </div>
      <NotificationBell
        tone="dark"
        list={() => api("/notifications")}
        markRead={(id) => api(`/notifications/${id}/read`, { method: "POST" })}
        markAll={() => api("/notifications/read-all", { method: "POST" })}
      />
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-rose-500 text-sm font-bold text-white">
          {initials}
        </span>
        <div className="hidden text-sm sm:block">
          <div className="font-bold uppercase text-gray-800">{user?.name}</div>
          <button onClick={logout} className="text-xs text-gray-400 hover:text-brand">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
