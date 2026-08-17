import { useEffect, useMemo, useState } from "react";
import type { EmployeeDto } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLiveFrames, type LiveFrame } from "../lib/live";
import { fmtRelative } from "../lib/format";

const LIST_FILTERS = ["ALL", "ACTIVE", "IDLE", "OFFLINE"] as const;
type ListFilter = (typeof LIST_FILTERS)[number];
// Provisional daily live-view budget (placeholder until subscription/metering lands).
const DAILY_LIVE_MIN = 90;

type Mode = "single" | "grid" | "wall" | "patrol";
const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "single", label: "Single", hint: "Watch one employee" },
  { key: "grid", label: "Grid", hint: "Watch everyone online" },
  { key: "wall", label: "Video Wall", hint: "Big tiles, full width" },
  { key: "patrol", label: "Patrol", hint: "Auto-rotate one at a time" },
];

const DOT: Record<string, string> = {
  ACTIVE: "bg-green-500",
  IDLE: "bg-amber-500",
  OFFLINE: "bg-gray-400",
  INVITED: "bg-indigo-500",
};
const cap = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);

function Tile({ emp, frame, fill, monitorCount = 1, onMonitor }: { emp: EmployeeDto; frame?: LiveFrame; fill?: boolean; monitorCount?: number; onMonitor?: (i: number) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-ink shadow-sm">
      <div className={`relative w-full bg-black ${fill ? "h-[calc(100vh-9rem)]" : "aspect-video"}`}>
        {frame ? (
          <img src={frame.data} alt={emp.name} className="h-full w-full object-contain" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-gray-400">
            {emp.status === "OFFLINE" ? "Offline — no agent connected" : "Waiting for live frames…"}
          </div>
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
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${DOT[emp.status]}`} /> {emp.name}
        </span>
        <span className="text-xs text-gray-400">{emp.lastApp ?? ""}</span>
      </div>
    </div>
  );
}

export function LiveMonitoring() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("single");
  const [selectedId, setSelectedId] = useState<string>("");
  const [patrolIndex, setPatrolIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [listFilter, setListFilter] = useState<ListFilter>("ALL");

  useEffect(() => {
    api<EmployeeDto[]>("/employees").then(setEmployees).catch(() => setEmployees([]));
    const t = setInterval(() => {
      api<EmployeeDto[]>("/employees").then(setEmployees).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, []);

  const online = useMemo(() => employees.filter((e) => e.status === "ACTIVE" || e.status === "IDLE"), [employees]);
  const filtered = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) &&
          (listFilter === "ALL" || e.status === listFilter),
      ),
    [employees, search, listFilter],
  );

  // Patrol rotation.
  useEffect(() => {
    if (mode !== "patrol" || online.length === 0) return;
    const t = setInterval(() => setPatrolIndex((i) => i + 1), 6000);
    return () => clearInterval(t);
  }, [mode, online.length]);

  const selectedIds = useMemo(() => {
    if (mode === "single") return selectedId ? [selectedId] : [];
    if (mode === "patrol") return online.length ? [online[patrolIndex % online.length].id] : [];
    return online.map((e) => e.id); // grid + wall
  }, [mode, selectedId, online, patrolIndex]);

  const { frames, monitors, setMonitor } = useLiveFrames(user?.orgId, selectedIds);
  const liveNow = Object.keys(frames).length;
  const byId = (id: string) => employees.find((e) => e.id === id)!;

  const counts = {
    active: employees.filter((e) => e.status === "ACTIVE").length,
    idle: employees.filter((e) => e.status === "IDLE").length,
    offline: employees.filter((e) => e.status === "OFFLINE").length,
  };

  const viewArea = (
    <div className={fullscreen ? "fixed inset-0 z-50 overflow-auto bg-gray-900 p-6" : ""}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              title={m.hint}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                mode === m.key ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFullscreen((f) => !f)}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600"
        >
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>

      {mode === "single" && !selectedId ? (
        <div className="grid place-items-center rounded-2xl bg-white py-24 text-center text-gray-400">
          Select an employee from the list to start live monitoring.
        </div>
      ) : selectedIds.length === 0 ? (
        <div className="grid place-items-center rounded-2xl bg-white py-24 text-center text-gray-400">
          No employees online right now.
        </div>
      ) : (
        <div
          className={
            mode === "single" || mode === "patrol"
              ? fullscreen
                ? "mx-auto w-full"
                : "mx-auto max-w-5xl"
              : mode === "wall"
                ? "grid gap-4 md:grid-cols-2"
                : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          }
        >
          {selectedIds.map((id) => (
            <Tile key={id} emp={byId(id)} frame={frames[id]} fill={fullscreen && (mode === "single" || mode === "patrol")} monitorCount={monitors[id] ?? 1} onMonitor={(i) => setMonitor(id, i)} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Live Monitoring"
        subtitle="Real-time screen viewing — streams only while you watch"
        action={
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500" title="Provisional live-view budget — subscription metering coming soon">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" /></svg>
              {DAILY_LIVE_MIN}m remaining of {DAILY_LIVE_MIN}m daily · Resets 12:00 am
            </span>
            <span className="text-green-600">Active {counts.active}</span>
            <span className="text-amber-600">Idle {counts.idle}</span>
            <span className="text-gray-400">Offline {counts.offline}</span>
            <span className="font-semibold text-brand">Live now {liveNow}</span>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="mb-3 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
          />
          <div className="mb-3 flex items-center gap-1 rounded-xl bg-gray-50 p-1 text-xs">
            {LIST_FILTERS.map((f) => {
              const n = f === "ALL" ? employees.length : employees.filter((e) => e.status === f).length;
              return (
                <button
                  key={f}
                  onClick={() => setListFilter(f)}
                  className={`flex-1 rounded-lg px-2 py-1.5 font-semibold capitalize transition ${listFilter === f ? "bg-white text-brand shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {f.toLowerCase()} {n}
                </button>
              );
            })}
          </div>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {filtered.map((e) => {
              const watchable = e.status === "ACTIVE" || e.status === "IDLE";
              return (
                <button
                  key={e.id}
                  onClick={() => { setMode("single"); setSelectedId(e.id); }}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                    selectedId === e.id && mode === "single" ? "bg-brand/10" : "hover:bg-gray-50"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${DOT[e.status]}`}>
                      {watchable && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${DOT[e.status]}`} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-800">{e.name}</span>
                      <span className="block truncate text-xs text-gray-400">{e.lastApp ? `${cap(e.status)} · ${e.lastApp}` : cap(e.status)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] text-gray-400">{fmtRelative(e.lastActiveAt)}</span>
                </button>
              );
            })}
            {!filtered.length && <p className="py-8 text-center text-sm text-gray-400">No employees.</p>}
          </div>
        </div>

        {viewArea}
      </div>
    </div>
  );
}
