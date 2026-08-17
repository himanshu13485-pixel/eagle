import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ActivitySpan, EmployeeDto, Paginated, ScreenshotDto } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { api } from "../lib/api";

// Local calendar today / day math (timezone-safe).
const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
const shiftDay = (iso: string, d: number) => {
  const [y, m, dd] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};
const yesterday = () => shiftDay(todayISO(), -1);

const PARTS = [
  { key: "late", label: "Late Night", icon: "🌙", start: 0, end: 5 },
  { key: "morning", label: "Morning", icon: "🌅", start: 5, end: 12 },
  { key: "afternoon", label: "Afternoon", icon: "⛅", start: 12, end: 17 },
  { key: "evening", label: "Evening", icon: "🌆", start: 17, end: 22 },
  { key: "night", label: "Night", icon: "🌃", start: 22, end: 24 },
] as const;
const BUCKETS = [{ v: 30, l: "30 min" }, { v: 60, l: "1 hour" }, { v: 120, l: "2 hours" }];
const TRIGGER_LABEL: Record<string, string> = { PERIODIC: "Periodic", APP_SWITCH: "App switch", WEBCAM: "Webcam", ON_DEMAND: "On demand" };
const TRIGGER_STYLE: Record<string, string> = { PERIODIC: "bg-blue-50 text-blue-600", APP_SWITCH: "bg-amber-50 text-amber-600", WEBCAM: "bg-purple-50 text-purple-600", ON_DEMAND: "bg-emerald-50 text-emerald-600" };

const mins = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const fmtSlot = (m: number) => {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${ap}`;
};
const fmtMin = (sec: number) => `${Math.round(sec / 60)}m`;

interface Slot { start: number; shots: ScreenshotDto[]; usageSec: number; idleSec: number }
const dotColor = (sl: Slot) => (!sl.shots.length ? "bg-gray-300" : sl.usageSec > 0 ? "bg-green-500" : sl.idleSec > 0 ? "bg-amber-500" : "bg-brand");

export function WorkReplay() {
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(yesterday());
  const [shots, setShots] = useState<ScreenshotDto[]>([]);
  const [spans, setSpans] = useState<ActivitySpan[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  // filters
  const [partFilter, setPartFilter] = useState("all");
  const [appFilter, setAppFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [bucket, setBucket] = useState(60);
  const [showEmpty, setShowEmpty] = useState(false);
  const [lightbox, setLightbox] = useState<ScreenshotDto | null>(null);

  useEffect(() => { api<EmployeeDto[]>("/employees").then(setEmployees).catch(() => setEmployees([])); }, []);

  const load = useCallback(() => {
    if (!employeeId) { setShots([]); setSpans([]); return; }
    setLoading(true);
    const win = `from=${date}T00:00:00&to=${date}T23:59:59`;
    Promise.all([
      api<Paginated<ScreenshotDto>>(`/screenshots?employeeId=${employeeId}&${win}&pageSize=500`),
      api<ActivitySpan[]>(`/reports/activity?employeeId=${employeeId}&${win}`),
    ]).then(([s, a]) => {
      setShots(s.items.slice().sort((x, y) => x.capturedAt.localeCompare(y.capturedAt)));
      setSpans(a);
    }).catch(() => { setShots([]); setSpans([]); }).finally(() => setLoading(false));
  }, [employeeId, date]);
  useEffect(() => { load(); }, [load]);

  const empName = employees.find((e) => e.id === employeeId)?.name ?? "";
  const apps = useMemo(() => Array.from(new Set(shots.map((s) => s.app).filter(Boolean))) as string[], [shots]);

  // apply app/type filters to the shots that populate the timeline
  const visibleShots = useMemo(() => shots.filter((s) =>
    (appFilter === "all" || s.app === appFilter) && (typeFilter === "all" || s.trigger === typeFilter)), [shots, appFilter, typeFilter]);

  // summary (from all shots + spans for the day, not narrowed by app/type)
  const summary = useMemo(() => {
    const byApp = new Map<string, number>();
    let usage = 0, idle = 0;
    for (const sp of spans) { if (sp.isIdle) idle += sp.durationSec; else { usage += sp.durationSec; byApp.set(sp.name, (byApp.get(sp.name) ?? 0) + sp.durationSec); } }
    const topApp = [...byApp.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    const count = (t: string) => shots.filter((s) => s.trigger === t).length;
    return { screenshots: shots.length, topApp, periodic: count("PERIODIC"), appSwitch: count("APP_SWITCH"), onDemand: count("ON_DEMAND"), usageSec: usage, idleSec: idle };
  }, [shots, spans]);

  // build slots for the day, then group by part-of-day
  const grouped = useMemo(() => {
    const slotCount = Math.ceil(1440 / bucket);
    const slots: Slot[] = Array.from({ length: slotCount }, (_, i) => ({ start: i * bucket, shots: [], usageSec: 0, idleSec: 0 }));
    for (const s of visibleShots) { const idx = Math.floor(mins(s.capturedAt) / bucket); if (slots[idx]) slots[idx].shots.push(s); }
    for (const sp of spans) { const idx = Math.floor(mins(sp.startedAt) / bucket); if (slots[idx]) { if (sp.isIdle) slots[idx].idleSec += sp.durationSec; else slots[idx].usageSec += sp.durationSec; } }
    return PARTS.filter((p) => partFilter === "all" || partFilter === p.key).map((p) => {
      const partSlots = slots.filter((sl) => { const h = Math.floor(sl.start / 60); return h >= p.start && h < p.end; });
      const shotTotal = partSlots.reduce((n, sl) => n + sl.shots.length, 0);
      return { ...p, slots: partSlots, shotTotal };
    });
  }, [visibleShots, spans, bucket, partFilter]);

  return (
    <div>
      <PageHeader title="Work Replay" subtitle="Review screenshots with timeline, app usage, and activity context." />

      {/* filters */}
      <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold text-gray-900">☰ Filters {employeeId && <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">{summary.screenshots} screenshots</span>}</h3>
          <button onClick={() => setShowFilters((v) => !v)} className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">{showFilters ? "▲ Hide filters" : "▼ Show filters"}</button>
        </div>
        {showFilters && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold text-gray-500">👥 Employee</span>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm">
                <option value="">Select Employee</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold text-gray-500">📅 Date</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setDate((d) => shiftDay(d, -1))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">‹</button>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
                <button onClick={() => setDate((d) => shiftDay(d, 1))} disabled={date >= todayISO()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">›</button>
              </div>
            </label>
            <Select icon="🌓 Time of day" value={partFilter} onChange={setPartFilter}>
              <option value="all">All times</option>
              {PARTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
            <Select icon="🪟 App" value={appFilter} onChange={setAppFilter}>
              <option value="all">All apps</option>
              {apps.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
            <Select icon="🏷 Type" value={typeFilter} onChange={setTypeFilter}>
              <option value="all">All types</option>
              <option value="PERIODIC">Periodic</option>
              <option value="APP_SWITCH">App switch</option>
              <option value="ON_DEMAND">On demand</option>
            </Select>
            <Select icon="⏱ Bucket size" value={String(bucket)} onChange={(v) => setBucket(Number(v))}>
              {BUCKETS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
            </Select>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-600">
              <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} className="h-4 w-4 accent-brand" />
              Show slots with no screenshots
            </label>
          </div>
        )}
      </div>

      {!employeeId ? (
        <Empty>Select an employee to load Work Replay. Date defaults to yesterday.</Empty>
      ) : loading ? (
        <Empty>Loading…</Empty>
      ) : !shots.length ? (
        <Empty>No screenshots for {empName} on this day.</Empty>
      ) : (
        <>
          {/* summary header */}
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
            <p className="mb-4 font-bold text-gray-900">{empName} · {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Chip icon="🖼" label="Screenshots" value={String(summary.screenshots)} />
              <Chip icon="🪟" label="Top App" value={summary.topApp} />
              <Chip icon="🕒" label="Periodic" value={String(summary.periodic)} />
              <Chip icon="🔀" label="App Switch" value={String(summary.appSwitch)} />
              <Chip icon="📷" label="On Demand" value={String(summary.onDemand)} />
              <Chip icon="⚡" label="Usage" value={fmtMin(summary.usageSec)} tone="text-green-600" />
              <Chip icon="☕" label="Idle" value={fmtMin(summary.idleSec)} tone="text-amber-600" />
            </div>
          </div>

          {/* timeline (vertical rail + a dot per slot) */}
          <div className="relative space-y-8 pl-9">
            <div className="absolute left-4 top-2 bottom-2 w-px bg-gray-200" />
            {grouped.map((part) => {
              const shown = part.slots.filter((sl) => showEmpty || sl.shots.length > 0);
              if (!shown.length) return null;
              return (
                <div key={part.key} className="space-y-3">
                  <div className="relative flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500">
                    <span className="absolute -left-[1.4rem] grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border-2 border-white bg-gray-100 text-xs shadow-sm">{part.icon}</span>
                    {part.label}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">{part.shotTotal} screenshots</span>
                  </div>
                  {shown.map((sl) => (
                    <div key={sl.start} className="relative">
                      <span className={`absolute -left-5 top-4 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white ${dotColor(sl)}`} />
                      <SlotRow slot={sl} bucket={bucket} onOpen={setLightbox} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/85" onClick={() => setLightbox(null)}>
          <div className="flex items-center justify-between p-4" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm text-white">{lightbox.app ?? lightbox.url ?? "—"} · {new Date(lightbox.capturedAt).toLocaleString()}</span>
            <button onClick={() => setLightbox(null)} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-800">✕ Close</button>
          </div>
          <div className="flex flex-1 items-center justify-center px-4 pb-6" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.imageUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

function SlotRow({ slot, bucket, onOpen }: { slot: Slot; bucket: number; onOpen: (s: ScreenshotDto) => void }) {
  const [open, setOpen] = useState(slot.shots.length > 0);
  const has = slot.shots.length > 0;
  const label = has ? (slot.idleSec > 0 && slot.usageSec > 0 ? "Usage + Idle" : slot.usageSec > 0 ? "Usage" : slot.idleSec > 0 ? "Idle" : "Activity") : "No Activity";
  const appSummary = useMemo(() => {
    const byApp = new Map<string, number>();
    slot.shots.forEach((s) => byApp.set(s.app ?? "—", (byApp.get(s.app ?? "—") ?? 0) + 1));
    const top = [...byApp.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const per = slot.shots.filter((s) => s.trigger === "PERIODIC").length;
    const sw = slot.shots.filter((s) => s.trigger === "APP_SWITCH").length;
    const bits = [sw && `${sw} App Switch`, per && `${per} Periodic`].filter(Boolean).join(", ");
    return top ? `${top}${bits ? " • " + bits : ""}` : "";
  }, [slot.shots]);

  return (
    <div className={`rounded-2xl border ${has ? "border-gray-100 bg-white" : "border-gray-100 bg-gray-50/50"} shadow-sm`}>
      <button onClick={() => has && setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-3 text-left">
        <span className="w-40 shrink-0 text-sm font-semibold text-gray-800">{fmtSlot(slot.start)} – {fmtSlot(slot.start + bucket)}</span>
        <span className="flex-1">
          <span className={`text-sm font-semibold ${has ? "text-gray-800" : "text-gray-400"}`}>{label}</span>
          {has && <span className="ml-3 text-xs text-gray-400">{fmtMin(slot.usageSec)} usage • {fmtMin(slot.idleSec)} idle</span>}
          {appSummary && <span className="ml-2 block text-xs text-gray-400 sm:ml-3 sm:inline">{appSummary}</span>}
        </span>
        <span className="shrink-0 text-xs font-semibold text-gray-400">{has ? `${slot.shots.length} shot${slot.shots.length > 1 ? "s" : ""}` : "—"}</span>
        {has && <span className="shrink-0 text-gray-300">{open ? "▲" : "▼"}</span>}
      </button>
      {has && open && (
        <div className="grid grid-cols-1 gap-4 border-t border-gray-100 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {slot.shots.map((s) => (
            <button key={s.id} onClick={() => onOpen(s)} className="overflow-hidden rounded-2xl border border-gray-100 text-left transition hover:shadow-md">
              <div className="relative">
                <img src={s.imageUrl} alt="" loading="lazy" className="aspect-video w-full bg-gray-100 object-cover" />
                {s.isIdle && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">Idle</span>}
              </div>
              <div className="flex items-start gap-3 p-3">
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base ${s.url ? "bg-sky-50" : "bg-indigo-50"}`}>{s.url ? "🌐" : "🪟"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-800">{s.app ?? "—"}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TRIGGER_STYLE[s.trigger] ?? "bg-gray-100 text-gray-500"}`}>{TRIGGER_LABEL[s.trigger] ?? s.trigger}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">{new Date(s.capturedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  {s.url && <p className="mt-1 truncate text-xs text-gray-500" title={s.url}>Window: {s.url}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Select({ icon, value, onChange, children }: { icon: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">{icon}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm">{children}</select>
    </label>
  );
}
function Chip({ icon, label, value, tone = "text-gray-900" }: { icon: string; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{icon} {label}</p>
      <p className={`mt-0.5 truncate text-lg font-black ${tone}`} title={value}>{value}</p>
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="grid place-items-center rounded-2xl bg-white py-24 text-center text-gray-400">{children}</div>;
}
