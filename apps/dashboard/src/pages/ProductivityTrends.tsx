import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProductivityTrendsReport } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { RangeBar, type Range } from "../components/ReportControls";
import { api } from "../lib/api";
import { defaultRange, fmtHM } from "../lib/format";

const TABS = ["Overview", "Trends", "Attention Signals", "Teams", "Employees"] as const;
type Tab = (typeof TABS)[number];

export function ProductivityTrends() {
  const nav = useNavigate();
  const [range, setRange] = useState<Range>(defaultRange(14));
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<ProductivityTrendsReport | null>(null);

  useEffect(() => {
    api<ProductivityTrendsReport>(`/reports/productivity-trends?from=${range.from}&to=${range.to}`)
      .then(setData).catch(() => setData(null));
  }, [range.from, range.to]);

  const trend = useMemo(() => (data?.daily ?? []).map((d) => ({
    date: d.date.slice(5),
    Active: +(d.activeSec / 3600).toFixed(2),
    Idle: +(d.idleSec / 3600).toFixed(2),
    Productivity: d.productivityPct,
  })), [data]);

  const burden = data?.idleBurden ?? { low: 0, moderate: 0, high: 0, critical: 0 };
  const maxBurden = Math.max(1, burden.low, burden.moderate, burden.high, burden.critical);
  const attention = useMemo(() => (data?.employees ?? []).filter((e) => e.idlePct >= 40 || e.alert === "HIGH_IDLE").sort((a, b) => b.idlePct - a.idlePct), [data]);
  const productive = useMemo(() => (data?.employees ?? []).filter((e) => e.activeSec > 0).sort((a, b) => b.productivityPct - a.productivityPct), [data]);

  return (
    <div>
      <PageHeader title="Productivity Trends" subtitle="Active vs idle trends, focus patterns, and team changes over time." />
      <RangeBar range={range} onChange={setRange} />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === t ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>{t}</button>
        ))}
      </div>

      {/* ---------- OVERVIEW ---------- */}
      {tab === "Overview" && data && (
        <>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-400">Executive Snapshot</h3>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Signal tone="green" label="Active Employees" value={String(data.snapshot.activeEmployees)} sub={`of ${data.snapshot.totalEmployees} with tracked data`} onView={() => setTab("Employees")} />
            <Signal tone="indigo" label="Strongest Active Gain" value={data.snapshot.strongestGain?.employeeName ?? "—"} sub={data.snapshot.strongestGain ? `+${fmtHM(data.snapshot.strongestGain.deltaSec)} vs prev` : "No gain this period"} onView={() => setTab("Trends")} />
            <Signal tone={data.snapshot.needAttention ? "rose" : "gray"} label="Need Attention" value={String(data.snapshot.needAttention)} sub={data.snapshot.needAttention ? "employees over 40% idle" : "No employees crossed thresholds"} onView={() => setTab("Attention Signals")} />
            <Signal tone="amber" label="Weekend Work" value={fmtHM(data.snapshot.weekendSec)} sub="active time on Sat/Sun" onView={() => setTab("Trends")} />
          </div>

          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-400">Key Performance Indicators</h3>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Productivity Score" value={`${data.kpis.productivityPct}%`} accent="text-brand" sub="active vs logged time" />
            <Kpi label="Active Time" value={fmtHM(data.kpis.activeSec)} accent="text-green-600" delta={{ sec: data.kpis.activeDeltaSec, goodUp: true }} />
            <Kpi label="Idle Time" value={fmtHM(data.kpis.idleSec)} accent="text-amber-600" delta={{ sec: data.kpis.idleDeltaSec, goodUp: false }} />
            <Kpi label="Avg Score / Employee" value={`${data.kpis.avgScore}%`} accent="text-gray-800" sub="across active employees" />
          </div>

          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-400">Top Contributors</h3>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Top Needing Attention" hint="Highest idle share this period.">
              {attention.length ? attention.slice(0, 5).map((e) => (
                <Contributor key={e.employeeId} name={e.employeeName} pct={e.idlePct} tone="bg-rose-400" onClick={() => nav(`/employees/${e.employeeId}`)} suffix={`${e.idlePct}% idle`} />
              )) : <Empty>No employees crossed the attention thresholds.</Empty>}
            </Panel>
            <Panel title="Top Productive Employees" hint="Highest activity-based productivity scores.">
              {productive.length ? productive.slice(0, 5).map((e) => (
                <Contributor key={e.employeeId} name={e.employeeName} pct={e.productivityPct} tone="bg-green-400" onClick={() => nav(`/employees/${e.employeeId}`)} suffix={`${e.productivityPct}%`} />
              )) : <Empty>No employees found for this range.</Empty>}
            </Panel>
          </div>
        </>
      )}

      {/* ---------- TRENDS ---------- */}
      {tab === "Trends" && (
        <>
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-bold text-gray-900">Active vs Idle Over Time</h3>
            {trend.length ? (
              <ResponsiveContainer width="100%" height={340}>
                <AreaChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis yAxisId="h" tickFormatter={(v) => `${v}h`} fontSize={12} />
                  <YAxis yAxisId="p" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 100]} fontSize={12} />
                  <Tooltip />
                  <Area yAxisId="h" type="monotone" dataKey="Active" stroke="#22C55E" fill="#22C55E" fillOpacity={0.18} />
                  <Area yAxisId="h" type="monotone" dataKey="Idle" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.15} />
                  <Line yAxisId="p" type="monotone" dataKey="Productivity" stroke="#4F46E5" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="grid h-72 place-items-center text-gray-400">No trend data in this window.</div>}
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-bold text-gray-900">Weekday Productivity Pattern</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {(data?.weekday ?? []).map((w) => (
                <div key={w.weekday} className="rounded-xl border border-gray-100 p-3">
                  <p className="text-sm font-bold text-gray-700">{w.label}</p>
                  <p className="mt-1 text-2xl font-black text-gray-900">{w.productivityPct}%</p>
                  <p className="text-xs text-gray-400">A: {fmtHM(w.activeSec)}</p>
                  <p className="text-xs text-gray-400">I: {fmtHM(w.idleSec)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ---------- ATTENTION SIGNALS ---------- */}
      {tab === "Attention Signals" && (
        <>
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-1 font-bold text-gray-900">Idle Burden Categories</h3>
            <p className="mb-4 text-sm text-gray-500">Employee-level idle distribution for quick triage.</p>
            {[
              { label: "Low Idle (<20%)", v: burden.low, color: "bg-green-500" },
              { label: "Moderate Idle (20-40%)", v: burden.moderate, color: "bg-yellow-500" },
              { label: "High Idle (40-60%)", v: burden.high, color: "bg-orange-500" },
              { label: "Critical Idle (>=60%)", v: burden.critical, color: "bg-red-500" },
            ].map((b) => (
              <div key={b.label} className="mb-3 flex items-center gap-4">
                <span className="w-48 text-sm text-gray-600">{b.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-full ${b.color}`} style={{ width: `${(b.v / maxBurden) * 100}%` }} /></div>
                <span className="w-6 text-right text-sm font-bold text-gray-700">{b.v}</span>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="p-5"><h3 className="font-bold text-gray-900">Employees Needing Review</h3></div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Idle %</th><th className="px-5 py-3">Productivity %</th><th className="px-5 py-3">Trend</th><th className="px-5 py-3">Signal</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attention.length ? attention.map((e) => (
                  <tr key={e.employeeId} className="cursor-pointer hover:bg-gray-50" onClick={() => nav(`/employees/${e.employeeId}`)}>
                    <td className="px-5 py-3 font-medium text-gray-900">{e.employeeName}</td>
                    <td className="px-5 py-3 text-amber-600">{e.idlePct}%</td>
                    <td className="px-5 py-3">{e.productivityPct}%</td>
                    <td className="px-5 py-3"><Trend sec={e.trendDeltaSec} /></td>
                    <td className="px-5 py-3"><span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">High Idle</span></td>
                  </tr>
                )) : <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">No employees crossed the attention thresholds. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---------- TEAMS ---------- */}
      {tab === "Teams" && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="px-5 py-3">Team</th><th className="px-5 py-3">Employees</th><th className="px-5 py-3">Active</th><th className="px-5 py-3">Idle</th><th className="px-5 py-3 w-64">Productivity</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.teams ?? []).length ? data!.teams.map((t) => (
                <tr key={t.teamId ?? "none"} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{t.teamName}</td>
                  <td className="px-5 py-3 text-gray-500">{t.employeeCount}</td>
                  <td className="px-5 py-3 text-green-600">{fmtHM(t.activeSec)}</td>
                  <td className="px-5 py-3 text-amber-600">{fmtHM(t.idleSec)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-brand" style={{ width: `${t.productivityPct}%` }} /></div>
                      <span className="w-12 text-right font-semibold">{t.productivityPct}%</span>
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">No team data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- EMPLOYEES ---------- */}
      {tab === "Employees" && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Productivity %</th><th className="px-5 py-3">Idle %</th><th className="px-5 py-3">Active</th><th className="px-5 py-3">Trend</th><th className="px-5 py-3">Signal</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.employees ?? []).length ? data!.employees.map((e) => (
                <tr key={e.employeeId} className="cursor-pointer hover:bg-gray-50" onClick={() => nav(`/employees/${e.employeeId}`)}>
                  <td className="px-5 py-3 font-medium text-gray-900">{e.employeeName}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-brand" style={{ width: `${e.productivityPct}%` }} /></div>
                      <span className="font-semibold">{e.productivityPct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">{e.idlePct}%</td>
                  <td className="px-5 py-3">{fmtHM(e.activeSec)}</td>
                  <td className="px-5 py-3"><Trend sec={e.trendDeltaSec} /></td>
                  <td className="px-5 py-3">{e.alert === "HIGH_IDLE" ? <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">High Idle</span> : <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-600">OK</span>}</td>
                </tr>
              )) : <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">No employee data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const SIGNAL_TONES: Record<string, string> = {
  green: "bg-green-100 text-green-600", indigo: "bg-indigo-100 text-indigo-600",
  rose: "bg-rose-100 text-rose-600", amber: "bg-amber-100 text-amber-600", gray: "bg-gray-100 text-gray-500",
};
function Signal({ tone, label, value, sub, onView }: { tone: string; label: string; value: string; sub: string; onView: () => void }) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 shadow-sm">
      <span className={`mb-3 grid h-9 w-9 place-items-center rounded-lg text-sm font-bold ${SIGNAL_TONES[tone]}`}>●</span>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 truncate text-2xl font-black text-gray-900" title={value}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
      <button onClick={onView} className="mt-3 text-left text-xs font-semibold text-brand hover:underline">View →</button>
    </div>
  );
}

function Kpi({ label, value, accent, sub, delta }: { label: string; value: string; accent: string; sub?: string; delta?: { sec: number; goodUp: boolean } }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent}`}>{value}</p>
      {delta ? <p className="mt-0.5 text-xs"><DeltaChip sec={delta.sec} goodUp={delta.goodUp} /></p> : sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
function DeltaChip({ sec, goodUp }: { sec: number; goodUp: boolean }) {
  if (sec === 0) return <span className="text-gray-400">no change vs prev</span>;
  const up = sec > 0;
  const good = up === goodUp;
  return <span className={good ? "text-green-600" : "text-red-500"}>{up ? "▲" : "▼"} {fmtHM(Math.abs(sec))} vs prev</span>;
}
function Trend({ sec }: { sec: number }) {
  if (sec === 0) return <span className="text-gray-400">—</span>;
  const up = sec > 0;
  return <span className={up ? "text-green-600" : "text-red-500"}>{up ? "▲" : "▼"} {fmtHM(Math.abs(sec))}</span>;
}

function Panel({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h4 className="font-bold text-gray-900">{title}</h4>
      <p className="mb-4 text-xs text-gray-400">{hint}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Contributor({ name, pct, tone, suffix, onClick }: { name: string; pct: number; tone: string; suffix: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 text-left">
      <span className="w-36 shrink-0 truncate text-sm font-medium text-gray-800 hover:text-brand">{name}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <span className="w-16 shrink-0 text-right text-xs font-semibold text-gray-600">{suffix}</span>
    </button>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-gray-400">{children}</p>;
}
