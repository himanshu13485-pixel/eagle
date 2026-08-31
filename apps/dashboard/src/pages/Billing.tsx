import { useEffect, useState } from "react";
import { PlanTier, type PlanDefinition } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { StatCard } from "../components/ReportControls";
import { api } from "../lib/api";
import { InvoiceModal, money, type Invoice } from "../components/InvoiceModal";
import { StorageMeter, type StorageUsage } from "../components/StorageMeter";

interface BillingInfo {
  tier: PlanTier; cycle: string; seats: number; validUntil: string | null;
  activeUsers: number; availableSeats: number; pricePerSeat: number;
  storage: StorageUsage;
  plans: Record<PlanTier, PlanDefinition>; gatewayConfigured: boolean;
}
interface CheckoutResp { orderId: string; paymentSessionId: string; amount: number; currency: string; mode: string; env: string }
interface Order { id: string; amount: number; currency: string; tier: string; cycle: string; seats: number; status: string; createdAt: string; paidAt: string | null }

const ORDER: PlanTier[] = [PlanTier.BASIC, PlanTier.PROFESSIONAL, PlanTier.BUSINESS];

function loadCashfree(): Promise<any> {
  const w = window as any;
  if (w.Cashfree) return Promise.resolve(w.Cashfree);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => resolve(w.Cashfree);
    s.onerror = () => reject(new Error("Failed to load Cashfree SDK"));
    document.head.appendChild(s);
  });
}

export function Billing() {
  const [b, setB] = useState<BillingInfo | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [viewInv, setViewInv] = useState<Invoice | null>(null);
  const [msg, setMsg] = useState("");
  const [checkoutTier, setCheckoutTier] = useState<PlanTier | null>(null);

  function load() {
    api<BillingInfo>("/billing").then(setB).catch(() => setB(null));
    api<Order[]>("/billing/orders").then(setOrders).catch(() => setOrders([]));
    api<Invoice[]>("/billing/invoices").then(setInvoices).catch(() => setInvoices([]));
  }
  useEffect(load, []);

  // Returned from Cashfree hosted checkout → verify the order.
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const orderId = p.get("order_id");
    if (!orderId) return;
    api<{ status: string; applied: boolean }>("/billing/verify", { method: "POST", body: JSON.stringify({ orderId }) })
      .then((r) => setMsg(r.applied ? "Payment successful — subscription updated." : `Payment status: ${r.status}.`))
      .catch(() => setMsg("Couldn't verify the payment."))
      .finally(() => { window.history.replaceState({}, "", "/billing"); load(); });
  }, []);

  if (!b) return <div className="p-6 text-gray-400">Loading billing…</div>;

  return (
    <div>
      <PageHeader title="Billing" subtitle="Product tier controls features. Seat subscription controls how many users you pay for." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Paid Seats" value={String(b.seats)} accent="text-gray-900" />
        <StatCard label="Active Users" value={String(b.activeUsers)} accent="text-gray-900" />
        <StatCard label="Available" value={String(b.availableSeats)} accent={b.availableSeats > 0 ? "text-green-600" : "text-red-600"} />
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Seat subscription</p>
          <p className="mt-1 text-sm font-semibold text-gray-800">{b.cycle} · {b.seats} seats</p>
          <p className="text-xs text-gray-400">${b.pricePerSeat} / seat / {b.cycle === "ANNUALLY" ? "year" : "month"}{b.validUntil ? ` · until ${new Date(b.validUntil).toLocaleDateString()}` : ""}</p>
          <button onClick={() => setCheckoutTier(b.tier)} className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">Add / change seats</button>
        </div>
      </div>

      {b.storage && <StorageMeter storage={b.storage} className="mb-6" />}

      {msg && <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{msg}</div>}
      {!b.gatewayConfigured && <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">⚠ Cashfree isn't configured — checkout runs in <b>sandbox/dry mode</b> (you can simulate payment). Set <code>CASHFREE_APP_ID</code> / <code>CASHFREE_SECRET_KEY</code> to go live.</div>}

      <h3 className="mb-3 text-lg font-bold text-gray-900">Product tier</h3>
      <div className="grid gap-4 lg:grid-cols-3">
        {ORDER.map((tier) => {
          const p = b.plans[tier];
          const current = b.tier === tier;
          return (
            <div key={tier} className={`rounded-2xl bg-white p-6 shadow-sm ${current ? "ring-2 ring-brand" : ""}`}>
              <div className="flex items-center justify-between">
                <h4 className="text-xl font-black text-gray-900">{p.name}</h4>
                {current && <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">CURRENT</span>}
              </div>
              <p className="mt-1 text-sm text-gray-500">{p.blurb}</p>
              <p className="mt-3 text-2xl font-black text-gray-900">${p.annual}<span className="text-sm font-normal text-gray-400"> /seat/yr</span></p>
              <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                {p.limits.storageGb} GB storage · {p.limits.screenshotRetentionDays}-day screenshots · {p.limits.activityRetentionDays}-day logs
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-gray-600">
                {p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-green-500">✓</span> {f}</li>)}
              </ul>
              <button onClick={() => setCheckoutTier(tier)} className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold ${current ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-brand text-white hover:bg-brand-dark"}`}>
                {current ? "Renew / add seats" : `Buy ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {invoices.length > 0 && (
        <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
          <h3 className="p-5 pb-3 text-lg font-bold text-gray-900">Invoices</h3>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Invoice #</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Issued</th><th className="px-5 py-3"></th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-brand">{inv.number}</td>
                  <td className="px-5 py-3 text-gray-700">{inv.tier} · {inv.seats} seats · {inv.cycle === "MONTHLY" ? "monthly" : "yearly"}</td>
                  <td className="px-5 py-3 font-semibold text-gray-800">{money(inv.amount, inv.currency)}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${inv.status === "PAID" ? "bg-green-100 text-green-700" : inv.status === "VOID" ? "bg-gray-100 text-gray-500" : "bg-amber-100 text-amber-700"}`}>{inv.status}</span></td>
                  <td className="px-5 py-3 text-gray-500">{new Date(inv.issuedAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right"><button onClick={() => setViewInv(inv)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
          <h3 className="p-5 pb-3 text-lg font-bold text-gray-900">Payment history</h3>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Date</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{o.id}</td>
                  <td className="px-5 py-3 text-gray-700">{o.tier} · {o.seats} seats · {o.cycle === "MONTHLY" ? "monthly" : "yearly"}</td>
                  <td className="px-5 py-3">{o.currency} {o.amount}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${o.status === "PAID" ? "bg-green-100 text-green-700" : o.status === "FAILED" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700"}`}>{o.status}</span></td>
                  <td className="px-5 py-3 text-gray-500">{new Date(o.paidAt ?? o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {checkoutTier && <CheckoutModal tier={checkoutTier} plan={b.plans[checkoutTier]} defaultSeats={Math.max(b.seats, b.activeUsers)} onClose={() => setCheckoutTier(null)} onDone={(m) => { setCheckoutTier(null); setMsg(m); load(); }} />}
      {viewInv && <InvoiceModal invoice={viewInv} onClose={() => setViewInv(null)} />}
    </div>
  );
}

function CheckoutModal({ tier, plan, defaultSeats, onClose, onDone }: { tier: PlanTier; plan: PlanDefinition; defaultSeats: number; onClose: () => void; onDone: (msg: string) => void }) {
  const [cycle, setCycle] = useState<"MONTHLY" | "ANNUALLY">("ANNUALLY");
  const [seats, setSeats] = useState(defaultSeats);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CheckoutResp | null>(null);
  const [err, setErr] = useState("");
  const per = cycle === "MONTHLY" ? plan.monthly : plan.annual;
  const total = +(per * seats).toFixed(2);

  async function pay() {
    setBusy(true); setErr("");
    try {
      const returnUrl = `${location.origin}/billing`;
      const res = await api<CheckoutResp>(`/billing/checkout?returnUrl=${encodeURIComponent(returnUrl)}`, { method: "POST", body: JSON.stringify({ tier, cycle, seats }) });
      if (res.mode === "dry") { setPending(res); setBusy(false); return; } // show simulate button
      const Cashfree = await loadCashfree();
      const cashfree = Cashfree({ mode: res.env === "production" ? "production" : "sandbox" });
      await cashfree.checkout({ paymentSessionId: res.paymentSessionId, redirectTarget: "_self" });
      // redirects to Cashfree → returns to /billing?order_id=… → verified on load
    } catch (e: any) {
      let m = "Checkout failed."; try { m = JSON.parse(e.message).message || m; } catch { /* keep */ }
      setErr(Array.isArray(m) ? m[0] : m); setBusy(false);
    }
  }
  async function simulate() {
    if (!pending) return;
    setBusy(true);
    try { await api("/billing/dev-confirm", { method: "POST", body: JSON.stringify({ orderId: pending.orderId }) }); onDone("Sandbox payment simulated — subscription updated."); }
    catch (e: any) { setErr("Could not simulate payment."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-gray-900">Checkout — {plan.name}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button></div>

        <p className="mb-1.5 text-sm font-semibold text-gray-600">Billing cycle</p>
        <div className="mb-4 flex gap-2">
          {(["ANNUALLY", "MONTHLY"] as const).map((c) => (
            <button key={c} onClick={() => setCycle(c)} className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${cycle === c ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600"}`}>{c === "ANNUALLY" ? "Yearly" : "Monthly"}</button>
          ))}
        </div>

        <p className="mb-1.5 text-sm font-semibold text-gray-600">Seats</p>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => setSeats((s) => Math.max(1, s - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200">–</button>
          <input type="number" min={1} value={seats} onChange={(e) => setSeats(Math.max(1, Number(e.target.value)))} className="w-20 rounded-lg border border-gray-200 py-2 text-center text-sm font-semibold" />
          <button onClick={() => setSeats((s) => s + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200">+</button>
          <span className="ml-2 text-sm text-gray-400">× ${per}/seat/{cycle === "MONTHLY" ? "mo" : "yr"}</span>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
          <span className="text-sm font-semibold text-gray-600">Total</span>
          <span className="text-xl font-black text-gray-900">${total}</span>
        </div>

        {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}

        {pending ? (
          <>
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Sandbox order <b>{pending.orderId}</b> created (no live gateway). Simulate a successful payment:</div>
            <button onClick={simulate} disabled={busy} className="w-full rounded-xl bg-green-500 px-4 py-3 text-sm font-bold text-white hover:bg-green-600 disabled:opacity-50">{busy ? "Applying…" : "✓ Simulate successful payment"}</button>
          </>
        ) : (
          <button onClick={pay} disabled={busy} className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50">{busy ? "Starting checkout…" : `Pay $${total} with Cashfree`}</button>
        )}
      </div>
    </div>
  );
}
