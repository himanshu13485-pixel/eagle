import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { EmployeeDto, TimesheetReport, TimesheetBreakdown, TimesheetMode } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { api } from "../lib/api";
import { defaultRange, fmtHMS, fmtTime, toCsv, downloadCsv } from "../lib/format";

const MODES: { key: TimesheetMode; label: string }[] = [
  { key: "day", label: "Day-wise" },
  { key: "user", label: "User-wise" },
  { key: "period", label: "Period-wise" },
];
// Local calendar "today" (not UTC — avoids the arrow disabling a day early/late).
const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
// Add/subtract days on the yyyy-mm-dd string using UTC math so the result never
// drifts back to the same date in +UTC timezones (the "next arrow does nothing" bug).
const shiftDay = (iso: string, delta: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
};
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

export function Timesheet() {
  const [mode, setMode] = useState<TimesheetMode>("day");
  const [breakdown, setBreakdown] = useState<TimesheetBreakdown>("none");
  const [date, setDate] = useState(todayISO());
  const [range, setRange] = useState(defaultRange(30));
  const [employeeId, setEmployeeId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [data, setData] = useState<TimesheetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [absence, setAbsence] = useState(false);

  useEffect(() => {
    api<EmployeeDto[]>("/employees").then((es) => {
      setEmployees(es);
      if (es[0]) setEmployeeId((cur) => cur || es[0].id);
    }).catch(() => setEmployees([]));
  }, []);

  const teams = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach((e) => { if (e.teamId && e.teamName) m.set(e.teamId, e.teamName); });
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [employees]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ mode, breakdown });
    if (mode === "day") p.set("date", date);
    else { p.set("from", range.from); p.set("to", range.to); }
    if (mode === "user" && employeeId) p.set("employeeId", employeeId);
    if (mode === "period" && teamId) p.set("teamId", teamId);
    return p.toString();
  }, [mode, breakdown, date, range.from, range.to, employeeId, teamId]);

  useEffect(() => {
    setLoading(true);
    api<TimesheetReport>(`/reports/timesheet?${query}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [query]);

  function exportCsv() {
    if (!data) return;
    const head = [
      "SR NO", "Employee",
      ...(mode === "user" ? ["Date"] : []),
      ...(mode === "period" ? ["Total Usage", "Total Idle", "Total Offline", "Total Tracked", "Total Overtime", "Absent Days"] : ["First Activity", "Last Activity", "Usage", "Idle", "Offline", "Tracked"]),
      ...data.columns,
    ];
    const body = data.rows.map((r, i) => [
      i + 1, r.employeeName,
      ...(mode === "user" ? [r.date ? dayLabel(r.date) : "-"] : []),
      ...(mode === "period"
        ? [fmtHMS(r.usageSec), fmtHMS(r.idleSec), fmtHMS(r.offlineSec), fmtHMS(r.trackedSec), fmtHMS(r.overtimeSec), r.absentDays ?? "-"]
        : [r.firstActivity ? fmtTime(r.firstActivity) : "-", r.lastActivity ? fmtTime(r.lastActivity) : "-", fmtHMS(r.usageSec), fmtHMS(r.idleSec), fmtHMS(r.offlineSec), fmtHMS(r.trackedSec)]),
      ...data.columns.map((c) => (r.breakdown?.[c] ? fmtHMS(r.breakdown[c]) : "-")),
    ]);
    downloadCsv(`timesheet_${mode}_${mode === "day" ? date : `${range.from}_${range.to}`}.csv`, toCsv([head, ...body]));
  }

  const cols = data?.columns ?? [];

  return (
    <div>
      <PageHeader title="Timesheet Reports" subtitle="Tracked = Usage + Idle. Offline is shown separately. App & Website breakdown shows Usage time only." />

      {/* controls */}
      <div className="mb-6 space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        {/* filters row (mode-specific) */}
        <div className="flex flex-wrap items-center gap-3">
          {mode === "user" && (
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm">
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          {mode === "period" && (
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm">
              <option value="">All teams</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {mode === "day" ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setDate((d) => shiftDay(d, -1))} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">‹</button>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
              <button onClick={() => setDate((d) => shiftDay(d, 1))} disabled={date >= todayISO()} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">›</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
              <span className="text-gray-400">–</span>
              <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
            </div>
          )}
        </div>

        {/* mode tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <Segment options={MODES.map((m) => ({ key: m.key, label: m.label }))} value={mode} onChange={(k) => setMode(k as TimesheetMode)} />
        </div>

        {/* breakdown + export */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segment
            subtle
            options={[{ key: "none", label: "Summary" }, { key: "app", label: "By App" }, { key: "web", label: "By Website", beta: true }]}
            value={breakdown}
            onChange={(k) => setBreakdown(k as TimesheetBreakdown)}
          />
          <div className="flex items-center gap-2">
            {mode === "period" && (
              <button onClick={() => setAbsence(true)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">🗓 Absence insight</button>
            )}
            <button onClick={exportCsv} disabled={!data} className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50">⬇ Export</button>
          </div>
        </div>
      </div>

      {/* SHOWING caption + explainer */}
      <div className="mb-4 rounded-2xl bg-white px-5 py-3 text-sm shadow-sm">
        <span className="font-semibold uppercase tracking-wide text-gray-400">Showing: </span>
        <span className="font-semibold text-gray-800">{data?.caption ?? "…"}</span>
        {breakdown !== "none" && <span className="ml-2 text-gray-500">· Breakdown: {breakdown === "app" ? "By App" : "By Website"}</span>}
      </div>
      <p className="mb-5 text-xs text-gray-400">
        Timesheet: Tracked Time is Usage Time + Idle Time. Offline Time is shown separately. App &amp; Website reports show Usage Time only.
        {mode === "period" && " Absent days counts calendar days in the range with no activity logs."}
      </p>

      {/* stat tiles */}
      <div className={`mb-6 grid gap-4 sm:grid-cols-2 ${mode === "period" ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <StatTile icon="✓" tone="green" label="Usage Time" value={fmtHMS(data?.totals.usageSec ?? 0)} />
        <StatTile icon="🕒" tone="amber" label="Idle Time" value={fmtHMS(data?.totals.idleSec ?? 0)} />
        <StatTile icon="⚡" tone="gray" label="Offline Time" value={fmtHMS(data?.totals.offlineSec ?? 0)} info="Time the agent wasn't reporting (agent offline-duration tracking arrives in a later phase)." />
        <StatTile icon="◷" tone="indigo" label="Tracked Time" value={fmtHMS(data?.totals.trackedSec ?? 0)} info="Usage + Idle." />
        {mode === "period" && <StatTile icon="＋" tone="rose" label="Overtime" value={fmtHMS(data?.totals.overtimeSec ?? 0)} info="Tracked beyond shift length. Requires shift config." />}
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <Th>SR No</Th>
              <Th>Employee Name</Th>
              {mode === "user" && <Th>Date</Th>}
              {mode === "period" ? (
                <>
                  <Th>Total Usage</Th><Th>Total Idle</Th><Th>Total Offline</Th><Th>Total Tracked</Th><Th>Total Overtime</Th><Th>Absent Days</Th>
                </>
              ) : (
                <>
                  <Th>First Activity</Th><Th>Last Activity</Th><Th>Usage</Th><Th>Idle</Th><Th>Offline</Th><Th>Tracked</Th>
                </>
              )}
              {cols.map((c) => <Th key={c}>{c}</Th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={20} className="px-5 py-12 text-center text-gray-400">Loading…</td></tr>
            ) : data && data.rows.length ? (
              data.rows.map((r, i) => (
                <tr key={`${r.employeeId}-${r.date ?? i}`} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{r.employeeName}</td>
                  {mode === "user" && <td className="px-5 py-3 text-gray-600">{r.date ? dayLabel(r.date) : "—"}</td>}
                  {mode === "period" ? (
                    <>
                      <Td tone="text-green-600">{fmtHMS(r.usageSec)}</Td>
                      <Td tone="text-amber-600">{fmtHMS(r.idleSec)}</Td>
                      <Td tone="text-gray-500">{dash(r.offlineSec)}</Td>
                      <Td tone="text-brand">{fmtHMS(r.trackedSec)}</Td>
                      <Td tone="text-gray-500">{fmtHMS(r.overtimeSec)}</Td>
                      <Td tone={r.absentDays ? "text-rose-600" : "text-gray-400"}>{r.absentDays ?? "—"}</Td>
                    </>
                  ) : (
                    <>
                      <Td>{r.firstActivity ? fmtTime(r.firstActivity) : "—"}</Td>
                      <Td>{r.lastActivity ? fmtTime(r.lastActivity) : "—"}</Td>
                      <Td tone="text-green-600">{dash(r.usageSec)}</Td>
                      <Td tone="text-amber-600">{dash(r.idleSec)}</Td>
                      <Td tone="text-gray-500">{dash(r.offlineSec)}</Td>
                      <Td tone="text-brand">{dash(r.trackedSec)}</Td>
                    </>
                  )}
                  {cols.map((c) => <Td key={c} tone="text-gray-600">{r.breakdown?.[c] ? fmtHMS(r.breakdown[c]) : "—"}</Td>)}
                </tr>
              ))
            ) : (
              <tr><td colSpan={20} className="px-5 py-12 text-center text-gray-400">No activity for this selection.</td></tr>
            )}
          </tbody>
          {data && data.rows.length > 0 && (
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="px-5 py-3" colSpan={mode === "user" ? 3 : 2}>Total</td>
                {mode === "period" ? (
                  <>
                    <Td tone="text-green-600">{fmtHMS(data.totals.usageSec)}</Td>
                    <Td tone="text-amber-600">{fmtHMS(data.totals.idleSec)}</Td>
                    <Td tone="text-gray-500">{fmtHMS(data.totals.offlineSec)}</Td>
                    <Td tone="text-brand">{fmtHMS(data.totals.trackedSec)}</Td>
                    <Td tone="text-gray-500">{fmtHMS(data.totals.overtimeSec)}</Td>
                    <td className="px-5 py-3 text-gray-400">—</td>
                  </>
                ) : (
                  <>
                    <td /><td />
                    <Td tone="text-green-600">{fmtHMS(data.totals.usageSec)}</Td>
                    <Td tone="text-amber-600">{fmtHMS(data.totals.idleSec)}</Td>
                    <Td tone="text-gray-500">{fmtHMS(data.totals.offlineSec)}</Td>
                    <Td tone="text-brand">{fmtHMS(data.totals.trackedSec)}</Td>
                  </>
                )}
                {cols.map((c) => {
                  const sum = data.rows.reduce((s, r) => s + (r.breakdown?.[c] ?? 0), 0);
                  return <Td key={c} tone="text-gray-600">{fmtHMS(sum)}</Td>;
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {absence && data && <AbsenceModal rows={data.rows} onClose={() => setAbsence(false)} />}
    </div>
  );
}

function Segment({ options, value, onChange, subtle }: { options: { key: string; label: string; beta?: boolean }[]; value: string; onChange: (k: string) => void; subtle?: boolean }) {
  return (
    <div className={`inline-flex rounded-xl p-1 ${subtle ? "bg-gray-100" : "bg-gray-100"}`}>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${value === o.key ? "bg-brand text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
        >
          {o.label}
          {o.beta && <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${value === o.key ? "bg-white/20 text-white" : "bg-amber-100 text-amber-600"}`}>BETA</span>}
        </button>
      ))}
    </div>
  );
}

const TONES: Record<string, string> = {
  green: "bg-green-100 text-green-600", amber: "bg-amber-100 text-amber-600",
  gray: "bg-gray-100 text-gray-500", indigo: "bg-indigo-100 text-indigo-600", rose: "bg-rose-100 text-rose-600",
};
function StatTile({ icon, tone, label, value, info }: { icon: string; tone: string; label: string; value: string; info?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg ${TONES[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm text-gray-500">
          {label}
          {info && <span title={info} className="cursor-help text-gray-300">ⓘ</span>}
        </p>
        <p className="mt-0.5 text-xl font-black text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-5 py-3 font-semibold">{children}</th>;
}
function Td({ children, tone = "text-gray-700" }: { children: ReactNode; tone?: string }) {
  return <td className={`whitespace-nowrap px-5 py-3 ${tone}`}>{children}</td>;
}
const dash = (sec: number) => (sec > 0 ? fmtHMS(sec) : "—");

function AbsenceModal({ rows, onClose }: { rows: TimesheetReport["rows"]; onClose: () => void }) {
  const ranked = [...rows].sort((a, b) => (b.absentDays ?? 0) - (a.absentDays ?? 0));
  const max = Math.max(1, ...ranked.map((r) => r.absentDays ?? 0));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Absence insight</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <p className="mb-4 text-xs text-gray-400">Calendar days in the selected range with no activity logs.</p>
        <div className="space-y-2">
          {ranked.map((r) => (
            <div key={r.employeeId} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm font-medium text-gray-800">{r.employeeName}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.round(((r.absentDays ?? 0) / max) * 100)}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right text-sm font-semibold text-gray-700">{r.absentDays ?? 0}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Close</button></div>
      </div>
    </div>
  );
}
