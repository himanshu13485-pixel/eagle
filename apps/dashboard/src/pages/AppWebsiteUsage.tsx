import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { AppWebsiteDetail, AppWebsiteUsageReport, ComparePeriod, EmployeeDto, UsageTypeFilter } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { api } from "../lib/api";
import { defaultRange, fmtHM, toCsv, downloadCsv } from "../lib/format";

const BARS = ["#4F46E5", "#2563EB", "#D97706", "#EAB308", "#9333EA", "#22C55E", "#DC2626", "#0EA5E9", "#7C3AED", "#111827"];
const COMPARE: { key: ComparePeriod; label: string }[] = [
  { key: "none", label: "None" },
  { key: "previous_period", label: "Previous period" },
  { key: "previous_week", label: "Previous week" },
  { key: "previous_month", label: "Previous month" },
];
interface Filters { type: UsageTypeFilter; from: string; to: string; compare: ComparePeriod; empIds: string[] }

export function AppWebsiteUsage() {
  const nav = useNavigate();
  const base = defaultRange(14);
  const initial: Filters = { type: "all", from: base.from, to: base.to, compare: "none", empIds: [] };
  const [applied, setApplied] = useState<Filters>(initial);
  const [draft, setDraft] = useState<Filters>(initial);
  const [panel, setPanel] = useState(false);
  const [data, setData] = useState<AppWebsiteUsageReport | null>(null);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [view, setView] = useState<"usage" | "employee">("usage");
  const [detailFor, setDetailFor] = useState<{ name: string; type: string } | null>(null);

  useEffect(() => { api<EmployeeDto[]>("/employees").then(setEmployees).catch(() => setEmployees([])); }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams({ from: applied.from, to: applied.to, type: applied.type, compare: applied.compare });
    if (applied.empIds.length) p.set("employeeIds", applied.empIds.join(","));
    return p.toString();
  }, [applied]);

  useEffect(() => {
    api<AppWebsiteUsageReport>(`/reports/app-website-usage?${query}`).then(setData).catch(() => setData(null));
  }, [query]);

  const topChart = useMemo(() => (data?.topUsage ?? []).map((u) => ({ name: u.name, hours: +(u.totalSec / 3600).toFixed(2) })), [data]);
  const trend = useMemo(() => (data?.dailyTrend ?? []).map((d) => ({ date: d.date.slice(5), Apps: +(d.appSec / 3600).toFixed(2), Websites: +(d.webSec / 3600).toFixed(2) })), [data]);

  const activeFilters = (applied.type !== "all" ? 1 : 0) + (applied.compare !== "none" ? 1 : 0) + (applied.empIds.length ? 1 : 0);

  function exportCsv() {
    if (!data) return;
    const rows = view === "usage"
      ? [["Name", "Type", "Total Time"], ...data.detailed.map((d) => [d.name, d.type, fmtHM(d.totalSec)])]
      : [["Employee", "Total Time"], ...data.byEmployee.map((e) => [e.employeeName, fmtHM(e.totalSec)])];
    downloadCsv(`app-website-usage_${applied.from}_${applied.to}.csv`, toCsv(rows));
  }

  function applyDraft() { setApplied(draft); setPanel(false); }
  function resetDraft() { setDraft(initial); }
  function toggleEmp(id: string) {
    setDraft((d) => ({ ...d, empIds: d.empIds.includes(id) ? d.empIds.filter((x) => x !== id) : [...d.empIds, id] }));
  }

  const delta = data?.compare?.deltaPct ?? null;

  return (
    <div>
      <PageHeader
        title="Apps & Websites"
        subtitle="Usage analytics dashboard"
        action={
          <button onClick={() => { setDraft(applied); setPanel(true); }} className="relative flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" /></svg>
            Filters {activeFilters > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-xs font-bold text-brand">{activeFilters}</span>}
          </button>
        }
      />

      {/* stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Tile icon="◔" tone="sky" label="Total Active Time" value={fmtHM(data?.summary.totalActiveSec ?? 0)}
          foot={delta !== null ? <span className={delta >= 0 ? "text-green-600" : "text-red-500"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs prev</span> : undefined} />
        <Tile icon="💼" tone="indigo" label="Shift Time" value={fmtHM(data?.summary.shiftSec ?? 0)} info="Needs shift config (later phase)." />
        <Tile icon="⚡" tone="amber" label="Overtime" value={fmtHM(data?.summary.overtimeSec ?? 0)} info="Needs shift config (later phase)." />
        <Tile icon="🖥" tone="violet" label="Top App" value={data?.summary.topApp?.name ?? "N/A"} foot={<span className="text-gray-400">{data?.summary.appCount ?? 0} apps tracked</span>} />
        <Tile icon="🌐" tone="teal" label="Top Website" value={data?.summary.topWebsite?.name ?? "N/A"} foot={<span className="text-gray-400">{data?.summary.siteCount ?? 0} sites tracked</span>} />
      </div>

      {/* charts */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-bold text-gray-900">Top Usage by Time</h3>
          {topChart.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topChart} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" tickFormatter={(v) => `${v}h`} fontSize={12} />
                <YAxis type="category" dataKey="name" width={110} fontSize={12} />
                <Tooltip formatter={(v) => `${v}h`} />
                <Bar dataKey="hours" radius={[0, 4, 4, 0]}>{topChart.map((_, i) => <Cell key={i} fill={BARS[i % BARS.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="grid h-72 place-items-center text-gray-400">No usage yet.</div>}
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-bold text-gray-900">Daily Usage Trend</h3>
          {trend.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis tickFormatter={(v) => `${v}h`} fontSize={12} />
                <Tooltip formatter={(v) => `${v}h`} />
                <Area type="monotone" dataKey="Apps" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.2} />
                <Area type="monotone" dataKey="Websites" stroke="#0EA5E9" fill="#0EA5E9" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="grid h-72 place-items-center text-gray-400">No trend data yet.</div>}
        </div>
      </div>

      {/* detailed */}
      <div className="rounded-2xl bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h3 className="font-bold text-gray-900">Detailed Usage</h3>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-gray-100 p-1 text-sm">
              <button onClick={() => setView("usage")} className={`rounded-md px-3 py-1 font-semibold ${view === "usage" ? "bg-white text-brand shadow" : "text-gray-500"}`}>▦ By App/Website</button>
              <button onClick={() => setView("employee")} className={`rounded-md px-3 py-1 font-semibold ${view === "employee" ? "bg-white text-brand shadow" : "text-gray-500"}`}>👤 By Employee</button>
            </div>
            <button onClick={exportCsv} disabled={!data} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">⬇ Download</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Total Time</th>
                <th className="px-5 py-3">Shift Time</th>
                <th className="px-5 py-3">Overtime</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {view === "usage" ? (
                data?.detailed.length ? data.detailed.map((d, i) => (
                  <tr key={`${d.type}-${d.name}`} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{d.name}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${d.type === "WEB" ? "bg-sky-100 text-sky-700" : "bg-indigo-100 text-indigo-700"}`}>{d.type === "WEB" ? "Web" : "App"}</span></td>
                    <td className="px-5 py-3">{fmtHM(d.totalSec)}</td>
                    <td className="px-5 py-3 text-gray-400">—</td>
                    <td className="px-5 py-3 text-gray-400">—</td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setDetailFor({ name: d.name, type: d.type })} className="text-sm font-semibold text-brand hover:underline">👁 View</button></td>
                  </tr>
                )) : <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">No usage recorded yet.</td></tr>
              ) : (
                data?.byEmployee.length ? data.byEmployee.map((e, i) => (
                  <tr key={e.employeeId} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{e.employeeName}</td>
                    <td className="px-5 py-3 text-gray-400">—</td>
                    <td className="px-5 py-3">{fmtHM(e.totalSec)}</td>
                    <td className="px-5 py-3 text-gray-400">—</td>
                    <td className="px-5 py-3 text-gray-400">—</td>
                    <td className="px-5 py-3 text-right"><button onClick={() => nav(`/employees/${e.employeeId}`)} className="text-sm font-semibold text-brand hover:underline">Visit profile →</button></td>
                  </tr>
                )) : <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">No employee usage yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* filter slide-over */}
      {panel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setPanel(false)}>
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <h3 className="text-lg font-bold text-gray-900">Filters</h3>
              <button onClick={() => setPanel(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-600">Type</p>
                <div className="flex rounded-xl bg-gray-100 p-1 text-sm">
                  {(["all", "app", "web"] as UsageTypeFilter[]).map((t) => (
                    <button key={t} onClick={() => setDraft((d) => ({ ...d, type: t }))} className={`flex-1 rounded-lg px-3 py-2 font-semibold capitalize ${draft.type === t ? "bg-brand text-white" : "text-gray-500"}`}>{t === "web" ? "Website" : t}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-600">Date range</p>
                <div className="flex items-center gap-2">
                  <input type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
                  <span className="text-gray-400">–</span>
                  <input type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-600">Compare period</p>
                <div className="grid grid-cols-2 gap-2">
                  {COMPARE.map((c) => (
                    <button key={c.key} onClick={() => setDraft((d) => ({ ...d, compare: c.key }))} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${draft.compare === c.key ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{c.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-600">Employees</p>
                  {draft.empIds.length > 0 && <button onClick={() => setDraft((d) => ({ ...d, empIds: [] }))} className="text-xs font-semibold text-brand">Clear ({draft.empIds.length})</button>}
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-gray-100 p-1">
                  {employees.map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50">
                      <input type="checkbox" checked={draft.empIds.includes(e.id)} onChange={() => toggleEmp(e.id)} className="h-4 w-4 accent-brand" />
                      <span className="text-sm text-gray-700">{e.name}</span>
                    </label>
                  ))}
                  {!employees.length && <p className="px-3 py-6 text-center text-sm text-gray-400">No employees.</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 p-5">
              <button onClick={resetDraft} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Reset Filter</button>
              <button onClick={applyDraft} className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-dark">Apply Filter</button>
            </div>
          </div>
        </div>
      )}

      {detailFor && <DetailModal row={detailFor} filters={applied} onClose={() => setDetailFor(null)} />}
    </div>
  );
}

const AV = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500", "bg-teal-500", "bg-sky-500", "bg-indigo-500", "bg-violet-500", "bg-fuchsia-500", "bg-rose-500"];
const initials = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?"; };
const avColor = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV[h % AV.length]; };
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

/** Per-app/website drill-down: totals + Usage-by-Employee / Day-wise Breakdown tabs. */
function DetailModal({ row, filters, onClose }: { row: { name: string; type: string }; filters: Filters; onClose: () => void }) {
  const [d, setD] = useState<AppWebsiteDetail | null>(null);
  const [tab, setTab] = useState<"emp" | "day">("emp");

  useEffect(() => {
    const p = new URLSearchParams({ name: row.name, type: row.type === "WEB" ? "web" : "app", from: filters.from, to: filters.to });
    if (filters.empIds.length) p.set("employeeIds", filters.empIds.join(","));
    api<AppWebsiteDetail>(`/reports/app-website-usage/detail?${p.toString()}`).then(setD).catch(() => setD(null));
  }, [row.name, row.type, filters]);

  const maxEmp = Math.max(1, ...(d?.byEmployee.map((e) => e.sec) ?? [1]));
  const maxDay = Math.max(1, ...(d?.byDay.map((x) => x.sec) ?? [1]));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h3 className="truncate text-lg font-bold text-gray-900" title={row.name}>{row.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div className="grid grid-cols-3 gap-3 p-5">
          <MiniStat label="Total Time" value={fmtHM(d?.totalSec ?? 0)} strong />
          <MiniStat label="Shift Time" value={fmtHM(d?.shiftSec ?? 0)} />
          <MiniStat label="Overtime" value={fmtHM(d?.overtimeSec ?? 0)} />
        </div>

        <div className="flex gap-2 px-5">
          <button onClick={() => setTab("emp")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "emp" ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>👤 Usage by Employee</button>
          <button onClick={() => setTab("day")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "day" ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>🗓 Day-wise Breakdown</button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {!d ? (
            <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
          ) : tab === "emp" ? (
            d.byEmployee.length ? d.byEmployee.map((e) => (
              <div key={e.employeeId} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${avColor(e.employeeName)}`}>{initials(e.employeeName)}</span>
                <span className="flex-1 truncate text-sm font-medium text-gray-800">{e.employeeName}</span>
                <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-gray-200 sm:block"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((e.sec / maxEmp) * 100)}%` }} /></div>
                <span className="w-20 shrink-0 rounded-full bg-brand/10 py-1 text-center text-xs font-bold text-brand">{fmtHM(e.sec)}</span>
              </div>
            )) : <p className="py-10 text-center text-sm text-gray-400">No employee usage for this item.</p>
          ) : (
            d.byDay.length ? d.byDay.map((x) => (
              <div key={x.date} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
                <span className="w-32 shrink-0 text-sm font-medium text-gray-700">{dayLabel(x.date)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.round((x.sec / maxDay) * 100)}%` }} /></div>
                <span className="w-20 shrink-0 text-right text-xs font-bold text-gray-700">{fmtHM(x.sec)}</span>
              </div>
            )) : <p className="py-10 text-center text-sm text-gray-400">No day-wise data for this item.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 p-4 text-center">
      <p className={`text-lg font-black ${strong ? "text-gray-900" : "text-gray-700"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{label}</p>
    </div>
  );
}

const TILE_TONES: Record<string, string> = {
  sky: "bg-sky-100 text-sky-600", indigo: "bg-indigo-100 text-indigo-600", amber: "bg-amber-100 text-amber-600",
  violet: "bg-violet-100 text-violet-600", teal: "bg-teal-100 text-teal-600",
};
function Tile({ icon, tone, label, value, foot, info }: { icon: string; tone: string; label: string; value: string; foot?: ReactNode; info?: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg ${TILE_TONES[tone]}`}>{icon}</span>
        <p className="flex items-center gap-1 text-sm text-gray-500">{label}{info && <span title={info} className="cursor-help text-gray-300">ⓘ</span>}</p>
      </div>
      <p className="mt-2 truncate text-xl font-black text-gray-900" title={value}>{value}</p>
      {foot && <p className="mt-0.5 text-xs">{foot}</p>}
    </div>
  );
}
