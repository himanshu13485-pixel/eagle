import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PLANS, PlanTier } from "@eagle/shared";
import { adminApi, adminErr } from "../../lib/adminApi";
import { AdminHeader } from "../../components/AdminLayout";
import { InvoiceModal, money, type Invoice } from "../../components/InvoiceModal";

interface Client { id: string; name: string }
const TIERS: PlanTier[] = [PlanTier.BASIC, PlanTier.PROFESSIONAL, PlanTier.BUSINESS];
const STATUS_STYLE: Record<string, string> = { PAID: "bg-green-100 text-green-700", DUE: "bg-amber-100 text-amber-700", VOID: "bg-gray-100 text-gray-500" };
const fmtDate = (s: string) => new Date(s).toLocaleDateString();

export function AdminInvoices() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => { adminApi<Client[]>("/clients").then(setClients).catch(() => setClients([])); }, []);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (clientId) p.set("clientId", clientId);
    if (status !== "ALL") p.set("status", status);
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to + "T23:59:59").toISOString());
    return p.toString();
  }, [clientId, status, from, to]);

  function load() { adminApi<Invoice[]>(`/invoices?${qs}`).then(setRows).catch(() => setRows([])); }
  useEffect(load, [qs]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);

  const paid = rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.amount, 0);
  const due = rows.filter((r) => r.status === "DUE").reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <AdminHeader title="Invoices" subtitle="Plan & payment history across every client account."
        action={<button onClick={() => setCreating(true)} className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-dark">+ New Invoice</button>} />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Invoices" value={String(rows.length)} />
        <Stat label="Collected" value={money(paid)} tone="green" />
        <Stat label="Outstanding" value={money(due)} tone={due > 0 ? "amber" : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          {["ALL", "PAID", "DUE", "VOID"].map((s) => <option key={s} value={s}>{s === "ALL" ? "All statuses" : s}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        <span className="text-gray-400">→</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        {(clientId || status !== "ALL" || from || to) && <button onClick={() => { setClientId(""); setStatus("ALL"); setFrom(""); setTo(""); }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Clear</button>}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">Invoice #</th><th className="px-5 py-3">Client</th><th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3">Seats</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Issued</th><th className="px-5 py-3">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length ? rows.map((r) => (
              <tr key={r.id} onClick={() => setView(r)} className="cursor-pointer hover:bg-gray-50/60">
                <td className="px-5 py-3 font-mono text-xs font-semibold text-brand">{r.number}</td>
                <td className="px-5 py-3 font-medium text-gray-900">{r.accountName ?? "—"}</td>
                <td className="px-5 py-3 text-gray-600">{r.tier} · {r.cycle === "MONTHLY" ? "Monthly" : "Annual"}</td>
                <td className="px-5 py-3 text-gray-600">{r.seats}</td>
                <td className="px-5 py-3 font-semibold text-gray-800">{money(r.amount, r.currency)}</td>
                <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? "bg-gray-100 text-gray-500"}`}>{r.status}</span></td>
                <td className="px-5 py-3 text-gray-500">{fmtDate(r.issuedAt)}</td>
                <td className="px-5 py-3 text-xs text-gray-400">{r.source}</td>
              </tr>
            )) : <tr><td colSpan={8} className="px-5 py-16 text-center text-gray-400">No invoices match.</td></tr>}
          </tbody>
        </table>
      </div>

      {view && <InvoiceModal invoice={view} onClose={() => setView(null)} />}
      {creating && <CreateInvoiceModal clients={clients} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); setToast("Invoice created."); }} onErr={setToast} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" }) {
  const c = tone === "green" ? "text-green-600" : tone === "amber" ? "text-amber-600" : "text-gray-900";
  return <div className="rounded-2xl bg-white p-5 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div><div className={`mt-1 text-3xl font-black ${c}`}>{value}</div></div>;
}

function CreateInvoiceModal({ clients, onClose, onSaved, onErr }: { clients: Client[]; onClose: () => void; onSaved: () => void; onErr: (m: string) => void }) {
  const [orgId, setOrgId] = useState("");
  const [tier, setTier] = useState<PlanTier>(PlanTier.PROFESSIONAL);
  const [cycle, setCycle] = useState("ANNUALLY");
  const [seats, setSeats] = useState(10);
  const [status, setStatus] = useState("DUE");
  const [number, setNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const perSeat = cycle === "MONTHLY" ? PLANS[tier].monthly * 12 : PLANS[tier].annual;
  const total = perSeat * seats;

  async function save() {
    if (!orgId) return;
    setBusy(true);
    try {
      await adminApi("/invoices", { method: "POST", body: JSON.stringify({ orgId, tier, cycle, seats: Number(seats), status, number: number.trim() || undefined, note: note.trim() || undefined }) });
      onSaved();
    } catch (e) { onErr(adminErr(e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-gray-900">New Invoice</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button></div>
        <div className="space-y-3">
          <Field label="Client"><select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm"><option value="">Select client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <div className="grid grid-cols-3 gap-2">
            {TIERS.map((t) => <button key={t} onClick={() => setTier(t)} className={`rounded-xl border px-2 py-2 text-sm font-semibold ${tier === t ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600"}`}>{PLANS[t].name}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cycle"><select value={cycle} onChange={(e) => setCycle(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm"><option value="ANNUALLY">Annual</option><option value="MONTHLY">Monthly</option></select></Field>
            <Field label="Seats"><input type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm"><option value="DUE">Due</option><option value="PAID">Paid</option></select></Field>
            <Field label="Invoice no (optional)"><input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="auto" className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" /></Field>
          </div>
          <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" /></Field>
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 text-sm"><span className="text-gray-500">{money(perSeat)}/seat/yr × {seats}</span><span className="text-lg font-black text-gray-900">{money(total)}</span></div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
          <button onClick={save} disabled={busy || !orgId} className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-40">{busy ? "Saving…" : "Create invoice"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-gray-600">{label}</span>{children}</label>;
}
