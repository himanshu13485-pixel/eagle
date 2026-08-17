import { useCallback, useEffect, useRef, useState } from "react";
import { fmtRelative } from "../lib/format";

export interface Notif { id: string; kind: string; title: string; body: string; createdBy: string | null; createdAt: string; read: boolean }
interface NotifResp { items: Notif[]; unread: number }

const KIND: Record<string, { icon: string; ring: string }> = {
  INFO: { icon: "ℹ️", ring: "bg-blue-100 text-blue-600" },
  UPDATE: { icon: "🔄", ring: "bg-indigo-100 text-indigo-600" },
  ANNOUNCEMENT: { icon: "📢", ring: "bg-amber-100 text-amber-600" },
  ALERT: { icon: "⚠️", ring: "bg-rose-100 text-rose-600" },
};

export function NotificationBell({ list, markRead, markAll, tone = "dark" }: {
  list: () => Promise<NotifResp>;
  markRead: (id: string) => Promise<unknown>;
  markAll: () => Promise<unknown>;
  tone?: "dark" | "light";
}) {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => { list().then((r) => { setItems(r.items); setUnread(r.unread); }).catch(() => {}); }, [list]);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function openOne(n: Notif) {
    if (!n.read) {
      setItems((c) => c.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      await markRead(n.id).catch(() => {});
    }
  }
  async function allRead() {
    setItems((c) => c.map((x) => ({ ...x, read: true })));
    setUnread(0);
    await markAll().catch(() => {});
  }

  const bellColor = tone === "dark" ? "text-gray-500 hover:bg-gray-100" : "text-gray-300 hover:bg-white/10";

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={`relative grid h-9 w-9 place-items-center rounded-lg ${bellColor}`} title="Notifications">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-gray-100 bg-white text-gray-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="font-bold">Notifications</span>
            {unread > 0 && <button onClick={allRead} className="text-xs font-semibold text-brand hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length ? items.map((n) => {
              const k = KIND[n.kind] ?? KIND.INFO;
              return (
                <button key={n.id} onClick={() => openOne(n)} className={`flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50 ${n.read ? "" : "bg-brand/5"}`}>
                  <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm ${k.ring}`}>{k.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{n.title}</span>{!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{n.body}</span>
                    <span className="mt-1 block text-[11px] text-gray-400">{fmtRelative(n.createdAt)}</span>
                  </span>
                </button>
              );
            }) : <p className="px-4 py-10 text-center text-sm text-gray-400">No notifications yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
