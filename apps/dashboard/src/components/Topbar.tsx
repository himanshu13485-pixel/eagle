import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { NotificationBell } from "./NotificationBell";

export function Topbar() {
  const { user, logout } = useAuth();
  const initials = (user?.name ?? "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex items-center gap-4 border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex-1">
        <input
          placeholder="Search Here"
          className="w-full max-w-xl rounded-full bg-gray-100 px-5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/30"
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
        <div className="text-sm">
          <div className="font-bold uppercase text-gray-800">{user?.name}</div>
          <button onClick={logout} className="text-xs text-gray-400 hover:text-brand">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
