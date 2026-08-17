import { useEffect, useMemo, useState, type ReactNode } from "react";
import { adminApi, adminErr } from "../../lib/adminApi";
import { AdminHeader } from "../../components/AdminLayout";

interface Shot {
  id: string; orgId: string; accountName: string; employeeId: string; employeeName: string;
  capturedAt: string; trigger: string; app: string | null; url: string | null; isIdle: boolean; imageUrl: string;
}
interface Paged { items: Shot[]; total: number; page: number; pageSize: number }
interface Client { id: string; name: string }
interface Emp { id: string; name: string }

const TRIGGERS = ["", "PERIODIC", "APP_SWITCH", "ON_DEMAND", "WEBCAM"];
const TRIGGER_LABEL: Record<string, string> = { PERIODIC: "Periodic", APP_SWITCH: "App switch", ON_DEMAND: "On demand", WEBCAM: "Webcam" };
const TRIGGER_STYLE: Record<string, string> = {
  PERIODIC: "bg-blue-100 text-blue-700", APP_SWITCH: "bg-violet-100 text-violet-700",
  ON_DEMAND: "bg-emerald-100 text-emerald-700", WEBCAM: "bg-amber-100 text-amber-700",
};
const fmt = (s: string) => new Date(s).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function AdminScreenshots() {
  const [clients, setClients] = useState<Client[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [clientId, setClientId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [trigger, setTrigger] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged | null>(null);
  const [zoom, setZoom] = useState<Shot | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { adminApi<Client[]>("/clients").then(setClients).catch(() => setClients([])); }, []);

  // load the employee dropdown for the selected client
  useEffect(() => {
    setEmployeeId("");
    if (!clientId) { setEmps([]); return; }
    adminApi<Emp[]>(`/clients/${clientId}/employees`).then(setEmps).catch(() => setEmps([]));
  }, [clientId]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (clientId) p.set("clientId", clientId);
    if (employeeId) p.set("employeeId", employeeId);
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to).toISOString());
    if (trigger) p.set("trigger", trigger);
    p.set("page", String(page));
    p.set("pageSize", "24");
    return p.toString();
  }, [clientId, employeeId, from, to, trigger, page]);

  useEffect(() => {
    setErr("");
    adminApi<Paged>(`/screenshots?${qs}`).then(setData).catch((e) => { setData({ items: [], total: 0, page: 1, pageSize: 24 }); setErr(adminErr(e)); });
  }, [qs]);

  useEffect(() => { setPage(1); }, [clientId, employeeId, from, to, trigger]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset = () => { setClientId(""); setEmployeeId(""); setFrom(""); setTo(""); setTrigger(""); };

  return (
    <div>
      <AdminHeader title="Screenshots" subtitle="Every capture across all client accounts, with account and employee labels." />

      {/* filters */}
      <div className="mb-5 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-2 lg:grid-cols-6">
        <Filter label="Client">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Filter>
        <Filter label="Employee">
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!clientId} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400">
            <option value="">{clientId ? "All employees" : "Pick a client first"}</option>
            {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Filter>
        <Filter label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" /></Filter>
        <Filter label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" /></Filter>
        <Filter label="Trigger">
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
            {TRIGGERS.map((t) => <option key={t} value={t}>{t ? TRIGGER_LABEL[t] : "All types"}</option>)}
          </select>
        </Filter>
        <div className="flex items-end"><button onClick={reset} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Clear</button></div>
      </div>

      <div className="mb-3 flex items-center justify-between text-sm text-gray-500">
        <span>{data ? `${data.total.toLocaleString()} screenshot${data.total === 1 ? "" : "s"}` : "Loading…"}</span>
        {err && <span className="text-rose-500">{err}</span>}
      </div>

      {/* gallery */}
      {data && data.items.length === 0 ? (
        <div className="rounded-2xl bg-white py-20 text-center text-gray-400 shadow-sm">No screenshots match these filters.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data?.items.map((s) => (
            <button key={s.id} onClick={() => setZoom(s)} className="group overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-transparent hover:ring-brand">
              <div className="aspect-video overflow-hidden bg-gray-100">
                <img src={s.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-gray-900">{s.employeeName}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TRIGGER_STYLE[s.trigger] ?? "bg-gray-100 text-gray-500"}`}>{TRIGGER_LABEL[s.trigger] ?? s.trigger}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-600">{s.accountName}</span>
                  <span className="truncate text-gray-400">{s.app ?? "—"}</span>
                </div>
                <div className="mt-1 text-xs text-gray-400">{fmt(s.capturedAt)}{s.isIdle && <span className="ml-1 text-amber-500">· idle</span>}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* pagination */}
      {data && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 disabled:opacity-40">Prev</button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 disabled:opacity-40">Next</button>
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setZoom(null)}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3">
              <div>
                <span className="font-bold text-gray-900">{zoom.employeeName}</span>
                <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-600">{zoom.accountName}</span>
              </div>
              <button onClick={() => setZoom(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <img src={zoom.imageUrl} alt="" className="max-h-[75vh] w-full object-contain bg-gray-900" />
            <div className="px-5 py-3 text-xs text-gray-500">{TRIGGER_LABEL[zoom.trigger] ?? zoom.trigger} · {zoom.app ?? "—"} · {fmt(zoom.capturedAt)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>{children}</label>;
}
