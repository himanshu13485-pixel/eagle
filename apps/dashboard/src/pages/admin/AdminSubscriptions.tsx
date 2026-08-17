import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PLANS, PlanTier, type PlanDefinition } from "@eagle/shared";
import { adminApi, adminErr } from "../../lib/adminApi";
import { AdminHeader } from "../../components/AdminLayout";

interface SubClient {
  id: string; name: string; status: string; ownerEmail: string | null;
  tier: string; cycle: string; seats: number; usedSeats: number;
  perSeatYear: number; annualRevenue: number; validUntil: string | null;
}
interface Totals {
  clients: number; seatsSold: number; seatsUsed: number; arr: number; mrr: number;
  byTier: Record<string, number>;
}
interface Resp { clients: SubClient[]; totals: Totals; plans: Record<string, PlanDefinition> }

const TIERS: PlanTier[] = [PlanTier.BASIC, PlanTier.PROFESSIONAL, PlanTier.BUSINESS];
const TIER_STYLE: Record<string, string> = {
  BASIC: "bg-slate-100 text-slate-700", PROFESSIONAL: "bg-indigo-100 text-indigo-700", BUSINESS: "bg-amber-100 text-amber-700",
};
const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => "$" + Math.round(n).toLocaleString();

export function AdminSubscriptions() {
  const [data, setData] = useState<Resp | null>(null);
  const [edit, setEdit] = useState<SubClient | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  function load() { adminApi<Resp>("/subscriptions").then(setData).catch((e) => setToast(adminErr(e))); }
  useEffect(load, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);

  const t = data?.totals;
  const clients = useMemo(
    () => (data?.clients ?? []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [data, search],
  );

  return (
    <div>
      <AdminHeader title="Subscriptions" subtitle="Plans, seats and revenue across every client — synced with the client billing catalog." />

      {/* revenue summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Annual recurring revenue" value={t ? money0(t.arr) : "—"} sub={t ? `${money0(t.mrr)} MRR` : ""} tone="indigo" />
        <Stat label="Clients" value={t ? String(t.clients) : "—"} sub={t ? `${t.byTier.BASIC}·${t.byTier.PROFESSIONAL}·${t.byTier.BUSINESS} by tier` : ""} />
        <Stat label="Seats sold" value={t ? String(t.seatsSold) : "—"} sub={t ? `${t.seatsUsed} in use` : ""} />
        <Stat label="Seat utilisation" value={t && t.seatsSold ? Math.round((t.seatsUsed / t.seatsSold) * 100) + "%" : "—"} sub="active / sold" tone="green" />
      </div>

      {/* plan catalog (single source of truth = shared PLANS) */}
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-400">Plan catalog</h3>
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        {TIERS.map((tier) => {
          const p = PLANS[tier];
          return (
            <div key={tier} className={`rounded-2xl border bg-white p-5 shadow-sm ${p.recommended ? "border-brand" : "border-gray-100"}`}>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">{p.name}</span>
                {p.recommended && <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">POPULAR</span>}
              </div>
              <p className="mt-1 text-sm text-gray-500">{p.blurb}</p>
              <div className="mt-3"><span className="text-3xl font-black text-gray-900">{money(p.annual)}</span><span className="text-sm text-gray-400"> /seat/yr</span></div>
              <div className="mt-1 text-xs text-gray-400">or {money(p.monthly)}/seat/mo</div>
              <ul className="mt-4 space-y-1.5 text-sm text-gray-600">
                {p.features.slice(0, 5).map((f) => <li key={f} className="flex gap-2"><span className="text-green-500">✓</span>{f}</li>)}
                {p.features.length > 5 && <li className="text-xs text-gray-400">+{p.features.length - 5} more</li>}
              </ul>
              <div className="mt-4 text-xs font-semibold text-gray-500">{t?.byTier[tier] ?? 0} client{(t?.byTier[tier] ?? 0) === 1 ? "" : "s"} on this plan</div>
            </div>
          );
        })}
      </div>

      {/* per-client table */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Client subscriptions</h3>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client…" className="w-64 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm" />
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">Client</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Billing</th>
              <th className="px-5 py-3">Seats</th><th className="px-5 py-3">Revenue/yr</th><th className="px-5 py-3">Renews</th>
              <th className="px-5 py-3">Status</th><th className="px-5 py-3 text-center">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.length ? clients.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50/60">
                <td className="px-5 py-3"><div className="font-semibold text-gray-900">{c.name}</div><div className="text-xs text-gray-400">{c.ownerEmail ?? "—"}</div></td>
                <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TIER_STYLE[c.tier] ?? "bg-gray-100 text-gray-500"}`}>{c.tier}</span></td>
                <td className="px-5 py-3 text-gray-600">{c.cycle === "MONTHLY" ? "Monthly" : "Annual"}</td>
                <td className="px-5 py-3"><SeatBar used={c.usedSeats} total={c.seats} /></td>
                <td className="px-5 py-3 font-semibold text-gray-800">{money0(c.annualRevenue)}</td>
                <td className="px-5 py-3 text-gray-500">{c.validUntil ? new Date(c.validUntil).toLocaleDateString() : "—"}</td>
                <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-600"}`}>{c.status}</span></td>
                <td className="px-5 py-3 text-center"><button onClick={() => setEdit(c)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Change plan</button></td>
              </tr>
            )) : <tr><td colSpan={8} className="px-5 py-16 text-center text-gray-400">{data ? "No clients match." : "Loading…"}</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && <ChangePlanModal client={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); setToast("Subscription updated."); }} onErr={setToast} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "indigo" | "green" }) {
  const ring = tone === "indigo" ? "text-brand" : tone === "green" ? "text-green-600" : "text-gray-900";
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-3xl font-black ${ring}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function SeatBar({ used, total }: { used: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const over = used > total;
  return (
    <div className="w-32">
      <div className="flex justify-between text-xs"><span className="font-semibold text-gray-700">{used}/{total}</span><span className="text-gray-400">{pct}%</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full ${over ? "bg-rose-500" : pct > 85 ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function ChangePlanModal({ client, onClose, onSaved, onErr }: { client: SubClient; onClose: () => void; onSaved: () => void; onErr: (m: string) => void }) {
  const [tier, setTier] = useState<PlanTier>(client.tier as PlanTier);
  const [cycle, setCycle] = useState(client.cycle);
  const [seats, setSeats] = useState(client.seats);
  const [busy, setBusy] = useState(false);

  const perSeat = cycle === "MONTHLY" ? PLANS[tier].monthly * 12 : PLANS[tier].annual;
  const total = perSeat * seats;

  async function save() {
    setBusy(true);
    try {
      await adminApi(`/clients/${client.id}`, { method: "PATCH", body: JSON.stringify({ tier, seats: Number(seats), cycle }) });
      onSaved();
    } catch (e) { onErr(adminErr(e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Change plan · {client.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <Field label="Plan tier">
          <div className="grid grid-cols-3 gap-2">
            {TIERS.map((tr) => (
              <button key={tr} onClick={() => setTier(tr)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${tier === tr ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600"}`}>{PLANS[tr].name}</button>
            ))}
          </div>
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Billing cycle">
            <select value={cycle} onChange={(e) => setCycle(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
              <option value="ANNUALLY">Annual</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </Field>
          <Field label="Seats"><input type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" /></Field>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
          <span className="text-sm text-gray-500">{money(perSeat)}/seat/yr × {seats}</span>
          <span className="text-lg font-black text-gray-900">{money(total)}<span className="text-xs font-medium text-gray-400"> /yr</span></span>
        </div>
        <p className="mt-2 text-xs text-gray-400">Used seats: {client.usedSeats}. Setting fewer seats than in use blocks new activations but won't remove anyone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
          <button onClick={save} disabled={busy || seats < 1} className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-40">{busy ? "Saving…" : "Save subscription"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-gray-600">{label}</span>{children}</label>;
}
