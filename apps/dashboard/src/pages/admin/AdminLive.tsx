import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { AdminHeader } from "../../components/AdminLayout";
import { useAdminLiveFrames } from "../../lib/adminLive";
import type { LiveFrame } from "../../lib/live";

interface LiveEmp {
  id: string; name: string; orgId: string; accountName: string;
  status: string; lastApp: string | null; lastActiveAt: string | null;
}

type Mode = "single" | "grid" | "wall" | "patrol";
const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "single", label: "Single", hint: "Watch one employee" },
  { key: "grid", label: "Grid", hint: "Watch everyone online" },
  { key: "wall", label: "Video Wall", hint: "Big tiles" },
  { key: "patrol", label: "Patrol", hint: "Auto-rotate" },
];
const DOT: Record<string, string> = { ACTIVE: "bg-green-500", IDLE: "bg-amber-500", OFFLINE: "bg-gray-400" };
const cap = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);

function Tile({ emp, frame, fill, monitorCount = 1, onMonitor }: { emp: LiveEmp; frame?: LiveFrame; fill?: boolean; monitorCount?: number; onMonitor?: (i: number) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-ink shadow-sm">
      <div className={`relative w-full bg-black ${fill ? "h-[calc(100vh-11rem)]" : "aspect-video"}`}>
        {frame ? (
          <img src={frame.data} alt={emp.name} className="h-full w-full object-contain" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-gray-400">Waiting for live frames…</div>
        )}
        {frame && (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> LIVE
          </span>
        )}
        {frame && monitorCount > 1 && onMonitor && (
          <select onChange={(e) => onMonitor(Number(e.target.value))} defaultValue="0" className="absolute right-3 top-3 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white outline-none">
            {Array.from({ length: monitorCount }, (_, i) => <option key={i} value={i} className="text-black">Monitor {i + 1}</option>)}
          </select>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 text-white">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[emp.status]}`} />
          <span className="truncate">{emp.name}</span>
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-200">{emp.accountName}</span>
        </span>
        <span className="shrink-0 text-xs text-gray-400">{emp.lastApp ?? ""}</span>
      </div>
    </div>
  );
}

export function AdminLive() {
  const [emps, setEmps] = useState<LiveEmp[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [mode, setMode] = useState<Mode>("single");
  const [selectedId, setSelectedId] = useState("");
  const [patrolIndex, setPatrolIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const load = () => adminApi<LiveEmp[]>("/live").then(setEmps).catch(() => setEmps([]));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    emps.forEach((e) => m.set(e.orgId, e.accountName));
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [emps]);

  const visible = useMemo(
    () => emps.filter((e) => (!clientFilter || e.orgId === clientFilter) && e.name.toLowerCase().includes(search.toLowerCase())),
    [emps, clientFilter, search],
  );
  // Everyone here is online (server returns only ACTIVE/IDLE).
  const online = visible;

  useEffect(() => {
    if (mode !== "patrol" || online.length === 0) return;
    const t = setInterval(() => setPatrolIndex((i) => i + 1), 6000);
    return () => clearInterval(t);
  }, [mode, online.length]);

  const selectedIds = useMemo(() => {
    if (mode === "single") return selectedId ? [selectedId] : [];
    if (mode === "patrol") return online.length ? [online[patrolIndex % online.length].id] : [];
    return online.map((e) => e.id);
  }, [mode, selectedId, online, patrolIndex]);

  const { frames, monitors, setMonitor } = useAdminLiveFrames(selectedIds);
  const byId = (id: string) => emps.find((e) => e.id === id);
  const liveNow = Object.keys(frames).length;
  const accountsOnline = new Set(online.map((e) => e.orgId)).size;

  const viewArea = (
    <div className={fullscreen ? "fixed inset-0 z-50 overflow-auto bg-gray-900 p-6" : ""}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button key={m.key} onClick={() => setMode(m.key)} title={m.hint}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${mode === m.key ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <button onClick={() => setFullscreen((f) => !f)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600">
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>

      {mode === "single" && !selectedId ? (
        <div className="grid place-items-center rounded-2xl bg-white py-24 text-center text-gray-400">Select an employee from the list to start watching.</div>
      ) : selectedIds.length === 0 ? (
        <div className="grid place-items-center rounded-2xl bg-white py-24 text-center text-gray-400">No employees online right now.</div>
      ) : (
        <div className={
          mode === "single" || mode === "patrol"
            ? (fullscreen ? "mx-auto w-full" : "mx-auto max-w-5xl")
            : mode === "wall" ? "grid gap-4 md:grid-cols-2" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        }>
          {selectedIds.map((id) => {
            const e = byId(id);
            return e ? <Tile key={id} emp={e} frame={frames[id]} fill={fullscreen && (mode === "single" || mode === "patrol")} monitorCount={monitors[id] ?? 1} onMonitor={(i) => setMonitor(id, i)} /> : null;
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <AdminHeader
        title="Live Monitoring"
        subtitle="Watch any employee across every client account — streams only while you watch."
        action={
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-gray-500">{accountsOnline} account{accountsOnline === 1 ? "" : "s"} online</span>
            <span className="text-green-600">Online {online.length}</span>
            <span className="font-semibold text-brand">Live now {liveNow}</span>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="mb-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
            <option value="">All clients ({clients.length})</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees…" className="mb-3 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
          <div className="max-h-[62vh] space-y-1 overflow-y-auto">
            {online.map((e) => (
              <button key={e.id} onClick={() => { setMode("single"); setSelectedId(e.id); }}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${selectedId === e.id && mode === "single" ? "bg-brand/10" : "hover:bg-gray-50"}`}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${DOT[e.status]}`}>
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${DOT[e.status]}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-800">{e.name}</span>
                    <span className="block truncate text-xs text-gray-400"><span className="font-medium text-indigo-500">{e.accountName}</span> · {e.lastApp ? `${cap(e.status)} · ${e.lastApp}` : cap(e.status)}</span>
                  </span>
                </span>
              </button>
            ))}
            {!online.length && <p className="py-8 text-center text-sm text-gray-400">No employees online.</p>}
          </div>
        </div>

        {viewArea}
      </div>
    </div>
  );
}
