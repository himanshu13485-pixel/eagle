import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EmployeeDto } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { StorageMeter, type StorageUsage } from "../components/StorageMeter";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";

interface Overview { totalScreenshots: number; thisMonth: number; trackingHours: number; usageHours: number; idleHours: number; storage: StorageUsage }
interface DataReq {
  id: string; source: string; action: string; dataType: string; targetLabel: string;
  requestedAt: string; rangeFrom: string | null; rangeTo: string | null; status: string;
}
interface ListResp { items: DataReq[]; total: number; page: number; pageSize: number; activeCount: number; activeLimit: number }
interface Team { id: string; name: string }

const ACTION_LABEL: Record<string, string> = {
  EXPORT: "Export", DELETE: "Delete",
  RETENTION_SCREENSHOTS: "Retention cleanup (Screenshots)", RETENTION_LOGS: "Retention cleanup (Logs)",
  RETENTION_QUOTA: "Storage cleanup (over plan quota)", PT_ROLLUP: "PT rollup refresh",
};
const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700", PROCESSING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700", FAILED: "bg-red-100 text-red-600", CANCELLED: "bg-gray-100 text-gray-500",
};
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const PAGE_SIZES = [10, 25, 50, 100];
const fmtDT = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function DataManagement() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [data, setData] = useState<ListResp | null>(null);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  // filters
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("ALL");
  const [action, setAction] = useState("ALL");
  const [automated, setAutomated] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    api<Overview>("/data-requests/overview").then(setOv).catch(() => {});
    api<EmployeeDto[]>("/employees").then(setEmployees).catch(() => {});
    api<{ teams: Team[] }>("/teams").then((d) => setTeams(d.teams)).catch(() => {});
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (employeeId) p.set("employeeId", employeeId);
    if (status !== "ALL") p.set("status", status);
    if (action !== "ALL") p.set("action", action);
    if (automated) p.set("includeAutomated", "true");
    return p.toString();
  }, [employeeId, status, action, automated, page, pageSize]);

  const load = useCallback(() => { api<ListResp>(`/data-requests?${query}`).then(setData).catch(() => setData(null)); }, [query]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [employeeId, status, action, automated, pageSize]);

  async function cancelReq(id: string) {
    if (!confirm("Cancel this request?")) return;
    try { await api(`/data-requests/${id}/cancel`, { method: "PATCH" }); load(); } catch { setToast("Could not cancel."); }
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div>
      <PageHeader
        title="Data Requests"
        subtitle="Manage and track organization wide data exports and removal."
        action={<button onClick={() => setOpen(true)} className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-dark">+ Add Request</button>}
      />

      {ov?.storage && <StorageMeter storage={ov.storage} className="mb-6" />}

      {/* screenshots overview */}
      <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-brand">📷 Screenshots Overview</h3>
        <div className="grid divide-gray-100 sm:grid-cols-3 sm:divide-x">
          <div className="px-2">
            <p className="text-sm text-gray-500">Total Screenshots</p>
            <p className="mt-1 text-3xl font-black text-gray-900">{(ov?.totalScreenshots ?? 0).toLocaleString()}</p>
          </div>
          <div className="px-2 sm:px-6">
            <p className="text-sm text-gray-500">This Month</p>
            <p className="mt-1 text-3xl font-black text-green-600">↗ +{(ov?.thisMonth ?? 0).toLocaleString()} <span className="text-base font-semibold text-gray-500">Screenshots</span></p>
          </div>
          <div className="px-2 sm:px-6">
            <p className="text-sm text-gray-500">Tracking Activity (This Month)</p>
            <p className="mt-1 text-3xl font-black text-gray-900">{ov?.trackingHours ?? 0} <span className="text-base font-semibold text-gray-500">Hours</span></p>
            <p className="mt-1 flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />Usage: {ov?.usageHours ?? 0}h</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Idle: {ov?.idleHours ?? 0}h</span>
            </p>
          </div>
        </div>
      </div>

      {/* active requests */}
      <div className="rounded-2xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h3 className="flex items-center gap-2 font-bold text-gray-900">📈 Active Requests</h3>
          <span className="text-sm font-semibold text-gray-500">Requests: {data?.activeCount ?? 0} / {data?.activeLimit ?? 5}</span>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">User</span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm">
              <option value="">All users</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm">
              <option value="ALL">All Statuses</option>
              {["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"].map((s) => <option key={s} value={s}>{cap(s)}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">Action</span>
            <select value={action} onChange={(e) => setAction(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm">
              <option value="ALL">All Actions</option>
              <option value="EXPORT">Export</option>
              <option value="DELETE">Delete</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">#</th><th className="px-5 py-3">Request</th><th className="px-5 py-3">Requested</th>
                <th className="px-5 py-3">Action</th><th className="px-5 py-3">Range</th><th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.items.length ? data.items.map((r, i) => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3 text-gray-400">{first + i}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">🗂</span>
                      <span className="font-medium text-gray-900">{r.targetLabel}</span>
                      {r.source === "SYSTEM" && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">System</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{fmtDT(r.requestedAt)}</td>
                  <td className="px-5 py-3"><span className="font-semibold text-gray-700">{ACTION_LABEL[r.action] ?? r.action}</span></td>
                  <td className="px-5 py-3 text-gray-500">{r.rangeFrom ? `${fmtDate(r.rangeFrom)} → ${fmtDate(r.rangeTo)}` : "All time"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? "bg-gray-100 text-gray-500"}`}>{cap(r.status)}</span>
                      {r.source === "USER" && ["PENDING", "PROCESSING"].includes(r.status) && <button onClick={() => cancelReq(r.id)} className="text-xs text-red-500 hover:underline">Cancel</button>}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-gray-400">List is empty.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 p-5 text-sm">
          <label className="flex items-center gap-2 text-gray-600">
            <input type="checkbox" checked={automated} onChange={(e) => setAutomated(e.target.checked)} className="h-4 w-4 accent-brand" />
            Show automated jobs
          </label>
          <div className="flex items-center gap-3">
            <span className="text-gray-500">Items per page:</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border border-gray-200 px-2 py-1.5 font-semibold">
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-gray-600">{first} – {last} of {total}</span>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 disabled:opacity-40">‹</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 disabled:opacity-40">›</button>
          </div>
        </div>
      </div>

      {open && <CreateModal employees={employees} teams={teams} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); load(); api<Overview>("/data-requests/overview").then(setOv).catch(() => {}); }} onError={setToast} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function CreateModal({ employees, teams, onClose, onCreated, onError }: { employees: EmployeeDto[]; teams: Team[]; onClose: () => void; onCreated: () => void; onError: (m: string) => void }) {
  const [selType, setSelType] = useState<"user" | "team">("user");
  const [targetId, setTargetId] = useState("");
  const [dataType, setDataType] = useState<"SCREENSHOTS" | "LOGS">("SCREENSHOTS");
  const [action, setAction] = useState<"EXPORT" | "DELETE">("EXPORT");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = targetId && from && to && !busy;

  async function submit() {
    setBusy(true);
    try {
      await api("/data-requests", {
        method: "POST",
        body: JSON.stringify({ action, dataType, rangeFrom: from, rangeTo: to, ...(selType === "user" ? { targetEmployeeId: targetId } : { targetTeamId: targetId }) }),
      });
      onCreated();
    } catch (e: any) {
      let msg = "Could not submit request.";
      try { msg = JSON.parse(e.message).message || msg; } catch { /* keep default */ }
      onError(Array.isArray(msg) ? msg[0] : msg);
      setBusy(false);
    }
  }

  const Toggle = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
    <button onClick={onClick} className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${on ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{children}</button>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Create New Data Request</h3>
            <p className="text-xs text-gray-400">User or team · up to 14 days per request</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div className="mt-4 space-y-4">
          <Field label="Selection Type">
            <div className="flex gap-2">
              <Toggle on={selType === "user"} onClick={() => { setSelType("user"); setTargetId(""); }}>👤 User Wise</Toggle>
              <Toggle on={selType === "team"} onClick={() => { setSelType("team"); setTargetId(""); }}>👥 Team Wise</Toggle>
            </div>
          </Field>

          <Field label={selType === "user" ? "Select User" : "Select Team"}>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm">
              <option value="">{selType === "user" ? "Select an employee…" : "Select a team…"}</option>
              {(selType === "user" ? employees.map((e) => ({ id: e.id, name: e.name })) : teams).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>

          <Field label="Data Type">
            <div className="flex gap-2">
              <Toggle on={dataType === "SCREENSHOTS"} onClick={() => setDataType("SCREENSHOTS")}>📷 Screenshots</Toggle>
              <Toggle on={dataType === "LOGS"} onClick={() => setDataType("LOGS")}>📄 Logs</Toggle>
            </div>
          </Field>

          <Field label="Action">
            <div className="flex gap-2">
              <Toggle on={action === "EXPORT"} onClick={() => setAction("EXPORT")}>⬇ Download</Toggle>
              <Toggle on={action === "DELETE"} onClick={() => setAction("DELETE")}>🗑 Delete</Toggle>
            </div>
          </Field>

          <Field label="Date Range (max 14 days per request)">
            <div className="flex gap-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
            </div>
          </Field>

          <p className="text-xs text-gray-400">Business allows up to 31 days per request.</p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
          <button onClick={submit} disabled={!canSubmit} className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-40">{busy ? "Submitting…" : "Submit Request"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="mb-1.5 text-sm font-semibold text-gray-600">{label}</p>{children}</div>;
}
