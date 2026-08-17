import { useEffect, useMemo, useState } from "react";
import { adminApi, adminErr } from "../../lib/adminApi";
import { AdminHeader } from "../../components/AdminLayout";

interface Ticket {
  id: string; requestId: string; accountName: string; kind: string; subject: string; description: string;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  createdBy: string | null; status: string; createdAt: string; updatedAt: string;
}
interface Resp { items: Ticket[]; counts: Record<string, number> }
interface Client { id: string; name: string }

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-700", IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-green-100 text-green-700", CLOSED: "bg-gray-100 text-gray-500",
};
const KIND_STYLE: Record<string, string> = {
  SUPPORT: "bg-rose-50 text-rose-600", DEMO: "bg-indigo-50 text-indigo-600", FEEDBACK: "bg-emerald-50 text-emerald-600",
};
const label = (s: string) => s.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

export function AdminSupport() {
  const [data, setData] = useState<Resp | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => { adminApi<Client[]>("/clients").then(setClients).catch(() => setClients([])); }, []);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (clientId) p.set("clientId", clientId);
    if (status !== "ALL") p.set("status", status);
    if (kind !== "ALL") p.set("kind", kind);
    return p.toString();
  }, [clientId, status, kind]);

  function load() { adminApi<Resp>(`/support?${qs}`).then(setData).catch(() => setData(null)); }
  useEffect(load, [qs]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2500); return () => clearTimeout(t); }, [toast]);

  async function setTicketStatus(t: Ticket, s: string) {
    try { await adminApi(`/support/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: s }) }); setToast(`${t.requestId} → ${label(s)}`); load(); }
    catch (e) { setToast(adminErr(e)); }
  }

  const c = data?.counts ?? {};
  return (
    <div>
      <AdminHeader title="Support Inbox" subtitle="Every client's support, demo and feedback tickets in one queue." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatus(status === s ? "ALL" : s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === s ? "ring-2 ring-brand " : ""}${STATUS_STYLE[s]}`}>
              {label(s)} {c[s] ?? 0}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
            <option value="">All clients</option>
            {clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
            {["ALL", "SUPPORT", "DEMO", "FEEDBACK"].map((k) => <option key={k} value={k}>{k === "ALL" ? "All kinds" : label(k)}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {data?.items.length ? data.items.map((t) => (
          <div key={t.id} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_STYLE[t.kind] ?? "bg-gray-100 text-gray-500"}`}>{t.kind}</span>
                  <span className="font-mono text-xs text-gray-400">{t.requestId}</span>
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-600">{t.accountName}</span>
                </div>
                <button onClick={() => setOpen(open === t.id ? null : t.id)} className="mt-1.5 text-left text-base font-bold text-gray-900 hover:text-brand">{t.subject}</button>
                <div className="mt-0.5 text-xs text-gray-400">
                  {t.contactName || t.contactEmail || t.createdBy || "—"}{t.contactEmail && ` · ${t.contactEmail}`}{t.contactPhone && ` · ${t.contactPhone}`} · {new Date(t.createdAt).toLocaleString()}
                </div>
                {open === t.id && <Thread id={t.id} onReplied={load} />}
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[t.status] ?? "bg-gray-100 text-gray-500"}`}>{label(t.status)}</span>
                <select value={t.status} onChange={(e) => setTicketStatus(t, e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-600">
                  {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
              </div>
            </div>
          </div>
        )) : <div className="rounded-2xl bg-white py-20 text-center text-gray-400 shadow-sm">{data ? "No tickets match." : "Loading…"}</div>}
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}

interface Msg { id: string; author: string; authorName: string | null; body: string; createdAt: string }
interface ThreadData { description: string; messages: Msg[] }

function Thread({ id, onReplied }: { id: string; onReplied: () => void }) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  function load() { adminApi<ThreadData>(`/support/${id}`).then(setData).catch(() => setData(null)); }
  useEffect(load, [id]);

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try { await adminApi(`/support/${id}/reply`, { method: "POST", body: JSON.stringify({ body: reply.trim() }) }); setReply(""); load(); onReplied(); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-xl bg-gray-50 p-3">
      <p className="whitespace-pre-wrap text-sm text-gray-700">{data?.description ?? "…"}</p>
      {data && data.messages.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
          {data.messages.map((m) => (
            <div key={m.id} className={`flex ${m.author === "ADMIN" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.author === "ADMIN" ? "bg-brand text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}>
                <div className="whitespace-pre-wrap">{m.body}</div>
                <div className={`mt-0.5 text-[10px] ${m.author === "ADMIN" ? "text-white/70" : "text-gray-400"}`}>{m.author === "ADMIN" ? "Staff" : "Client"} · {m.authorName ?? ""} · {new Date(m.createdAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-end gap-2">
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Reply to the client…" className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        <button onClick={send} disabled={busy || !reply.trim()} className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-40">{busy ? "…" : "Reply"}</button>
      </div>
    </div>
  );
}
