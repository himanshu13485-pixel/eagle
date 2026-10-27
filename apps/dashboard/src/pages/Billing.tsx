import { useEffect, useState } from "react";
import { PlanTier, type PlanDefinition } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { StatCard } from "../components/ReportControls";
import { api } from "../lib/api";
import { InvoiceModal, money, type Invoice } from "../components/InvoiceModal";
import { StorageMeter, type StorageUsage } from "../components/StorageMeter";

/** Mirror of the shared PRICING object as it crosses the wire. Structural
 *  rather than `typeof PRICING` so the readonly literal types don't fight the
 *  plain JSON the API actually sends. */
interface Pricing {
  currency: string; symbol: string;
  annualMonthsBilled: number; annualMonthsServed: number;
  liveViewAddOnMonthly: number;
}
interface BillingInfo {
  tier: PlanTier; cycle: string; seats: number; validUntil: string | null;
  activeUsers: number; availableSeats: number; pricePerSeat: number;
  /** True once the org has bought the per-seat live screen viewing add-on. */
  liveView: boolean;
  storage: StorageUsage;
  /** Keyed by tier, and only the tiers on sale — never assume how many. */
  plans: Record<string, PlanDefinition>;
  pricing: Pricing;
  gatewayConfigured: boolean;
}
interface CheckoutResp { orderId: string; paymentSessionId: string; amount: number; currency: string; mode: string; env: string }
interface Order { id: string; amount: number; currency: string; tier: string; cycle: string; seats: number; status: string; createdAt: string; paidAt: string | null }

// There used to be a hardcoded [BASIC, PROFESSIONAL, BUSINESS] order here. The
// catalogue is now whatever GET /billing sends, ordered cheapest first, so a
// price or plan change on the server doesn't need a dashboard release.

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
  // The plan itself, not just its tier: the card already has the definition the
  // modal needs to price, so there is nothing to look up again.
  const [checkoutPlan, setCheckoutPlan] = useState<PlanDefinition | null>(null);
  const [loadErr, setLoadErr] = useState("");

  function load() {
    api<BillingInfo>("/billing")
      .then((d) => { setB(d); setLoadErr(""); })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : "Couldn't load your billing details."));
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
      // BASE_URL, not a bare "/billing": in production the app is served from
      // a sub-path, so this was rewriting the URL to a path that doesn't exist.
      .finally(() => { window.history.replaceState({}, "", `${import.meta.env.BASE_URL}billing`.replace(/\/{2,}/g, "/")); load(); });
  }, []);

  // "Loading billing…" used to show forever when the request failed, because
  // the catch set the same null the loading state uses.
  if (loadErr) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">{loadErr}</p>
        <button onClick={() => { setLoadErr(""); load(); }} className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Try again</button>
      </div>
    );
  }
  if (!b) return <div className="p-6 text-gray-400">Loading billing…</div>;

  const sym = b.pricing.symbol;
  // Cheapest first. The server sends an object keyed by tier, and object key
  // order isn't a contract, so sort on something that is.
  const plans = Object.values(b.plans).sort((x, y) => x.monthly - y.monthly);

  return (
    <div>
      <PageHeader title="Billing" subtitle="Both plans have the same features and differ only in how long your data is kept. Your seat count is how many people you pay for." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Paid Seats" value={String(b.seats)} accent="text-gray-900" />
        <StatCard label="Active Users" value={String(b.activeUsers)} accent="text-gray-900" />
        <StatCard label="Available" value={String(b.availableSeats)} accent={b.availableSeats > 0 ? "text-green-600" : "text-red-600"} />
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Seat subscription</p>
          <p className="mt-1 text-sm font-semibold text-gray-800">{b.cycle} · {b.seats} seats</p>
          <p className="text-xs text-gray-400">{sym}{b.pricePerSeat.toLocaleString()} / seat / {b.cycle === "ANNUALLY" ? "year" : "month"}{b.validUntil ? ` · until ${new Date(b.validUntil).toLocaleDateString()}` : ""}</p>
          {/* Modest, because the add-on isn't advertised here — it only needs to
              be visible so nobody wonders whether they're still paying for it. */}
          {b.liveView && <p className="mt-1 text-xs font-semibold text-green-600">✓ Live screen viewing active</p>}
          <button onClick={() => setCheckoutPlan(b.plans[b.tier] ?? plans[0])} className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">Add / change seats</button>
        </div>
      </div>

      {b.storage && <StorageMeter storage={b.storage} className="mb-6" />}

      {msg && <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{msg}</div>}
      {/* This used to name the gateway's environment variables and tell the
          customer to set them. Our deployment state is not something to hand
          the person trying to pay us. */}
      {!b.gatewayConfigured && <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">Online payment is being set up. To renew or change your plan in the meantime, contact Workk support and we'll sort it out for you.</div>}

      <h3 className="mb-3 text-lg font-bold text-gray-900">Plans</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-4xl">
        {plans.map((p) => {
          const current = b.tier === p.tier;
          return (
            <div key={p.tier} className={`rounded-2xl bg-white p-6 shadow-sm ${current ? "ring-2 ring-brand" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xl font-black text-gray-900">{p.name}</h4>
                {current ? <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">CURRENT</span>
                  : p.recommended ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">RECOMMENDED</span> : null}
              </div>
              <p className="mt-1 text-sm text-gray-500">{p.blurb}</p>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-gray-900">{sym}{p.monthly}</span>
                <span className="text-sm font-semibold text-gray-400 line-through">{sym}{p.listMonthly}</span>
              </p>
              <p className="text-xs text-gray-400">per user / month</p>
              {/* Two extra months of service, not a percentage off — say it that
                  way, because the per-month rate on the invoice doesn't change. */}
              <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                {sym}{p.annual.toLocaleString()} / user billed yearly — {b.pricing.annualMonthsServed} months for the price of {b.pricing.annualMonthsBilled}
              </p>
              {/* No limits badge here any more. Team count is unlimited on both
                  plans, retention is already the first feature line, and the
                  org's real storage position is the live meter further up — a
                  per-plan "GB" number on the card only invited comparison of
                  something the customer can't act on. */}
              <ul className="mt-4 space-y-1.5 text-sm text-gray-600">
                {p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-green-500">✓</span> {f}</li>)}
              </ul>
              <button onClick={() => setCheckoutPlan(p)} className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold ${current ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-brand text-white hover:bg-brand-dark"}`}>
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
                  {/* money() so a paid order reads in ₹ like the invoice row
                      above it, instead of the raw "INR 3588". */}
                  <td className="px-5 py-3">{money(o.amount, o.currency)}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${o.status === "PAID" ? "bg-green-100 text-green-700" : o.status === "FAILED" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700"}`}>{o.status}</span></td>
                  <td className="px-5 py-3 text-gray-500">{new Date(o.paidAt ?? o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* defaultLiveView: an org that already pays for the add-on shouldn't lose
          it just because it renewed without re-ticking the box. */}
      {checkoutPlan && <CheckoutModal plan={checkoutPlan} pricing={b.pricing} defaultSeats={Math.max(b.seats, b.activeUsers)} defaultLiveView={b.liveView} onClose={() => setCheckoutPlan(null)} onDone={(m) => { setCheckoutPlan(null); setMsg(m); load(); }} />}
      {viewInv && <InvoiceModal invoice={viewInv} onClose={() => setViewInv(null)} />}
    </div>
  );
}

function CheckoutModal({ plan, pricing, defaultSeats, defaultLiveView, onClose, onDone }: { plan: PlanDefinition; pricing: Pricing; defaultSeats: number; defaultLiveView: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [cycle, setCycle] = useState<"MONTHLY" | "ANNUALLY">("ANNUALLY");
  const [seats, setSeats] = useState(defaultSeats);
  const [liveView, setLiveView] = useState(defaultLiveView);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CheckoutResp | null>(null);
  const [err, setErr] = useState("");
  const sym = pricing.symbol;
  // Mirrors BillingService.priceFor(): the add-on is a per-seat *monthly*
  // charge, so it is multiplied by the billed months just like the plan price.
  // plan.annual is deliberately not used here — it has no add-on in it.
  const months = cycle === "ANNUALLY" ? pricing.annualMonthsBilled : 1;
  const perSeatMonthly = plan.monthly + (liveView ? pricing.liveViewAddOnMonthly : 0);
  const per = perSeatMonthly * months;
  const total = +(per * seats).toFixed(2);
  const fmt = (n: number) => `${sym}${n.toLocaleString()}`;

  async function pay() {
    setBusy(true); setErr("");
    try {
      const returnUrl = `${location.origin}/billing`;
      const res = await api<CheckoutResp>(`/billing/checkout?returnUrl=${encodeURIComponent(returnUrl)}`, { method: "POST", body: JSON.stringify({ tier: plan.tier, cycle, seats, liveView }) });
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
        <div className="mb-2 flex gap-2">
          {(["ANNUALLY", "MONTHLY"] as const).map((c) => (
            <button key={c} onClick={() => setCycle(c)} className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${cycle === c ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600"}`}>{c === "ANNUALLY" ? "Yearly" : "Monthly"}</button>
          ))}
        </div>
        {/* Never phrased as "x% off": the monthly rate is unchanged and the
            saving is handed over as two extra months of service. */}
        {cycle === "ANNUALLY" && (
          <p className="mb-4 text-xs text-gray-500">Billed yearly — {pricing.annualMonthsServed} months of service for the price of {pricing.annualMonthsBilled}.</p>
        )}

        <p className="mb-1.5 text-sm font-semibold text-gray-600">Seats</p>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => setSeats((s) => Math.max(1, s - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200">–</button>
          <input type="number" min={1} value={seats} onChange={(e) => setSeats(Math.max(1, Number(e.target.value)))} className="w-20 rounded-lg border border-gray-200 py-2 text-center text-sm font-semibold" />
          <button onClick={() => setSeats((s) => s + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200">+</button>
          <span className="ml-2 text-sm text-gray-400">× {fmt(per)}/seat/{cycle === "MONTHLY" ? "mo" : "yr"}</span>
        </div>

        {/* Plain checkbox on purpose — the add-on is offered here because the
            customer is already paying, not promoted on the plan cards. */}
        <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 px-3.5 py-3">
          <input type="checkbox" checked={liveView} onChange={(e) => setLiveView(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand" />
          <span className="text-sm text-gray-700">Include live screen viewing <span className="text-gray-400">(+{fmt(pricing.liveViewAddOnMonthly)} per user / month)</span></span>
        </label>

        <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{plan.name} · {seats} {seats === 1 ? "seat" : "seats"}{liveView ? " · with live screen viewing" : ""}</span>
            <span>{fmt(perSeatMonthly)} / user / month</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-600">Total{cycle === "ANNUALLY" ? ` (${pricing.annualMonthsBilled} months)` : ""}</span>
            <span className="text-xl font-black text-gray-900">{fmt(total)}</span>
          </div>
        </div>

        {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}

        {/* A "✓ Simulate successful payment" button used to appear here
            whenever the gateway had no keys — which is exactly the state a
            half-finished production deploy is in. The server now refuses
            dev-confirm outside development, so this is dev-only too. */}
        {pending && import.meta.env.DEV ? (
          <>
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Development build: order <b>{pending.orderId}</b> created with no live gateway.</div>
            <button onClick={simulate} disabled={busy} className="w-full rounded-xl bg-green-500 px-4 py-3 text-sm font-bold text-white hover:bg-green-600 disabled:opacity-50">{busy ? "Applying…" : "Simulate successful payment (dev only)"}</button>
          </>
        ) : pending ? (
          <div className="rounded-lg bg-gray-50 px-3 py-3 text-xs text-gray-600">
            Reference <b>{pending.orderId}</b>. Online payment isn't available yet — quote this reference to Workk support and we'll complete it for you.
          </div>
        ) : (
          <button onClick={pay} disabled={busy} className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50">{busy ? "Starting checkout…" : `Pay ${fmt(total)} with Cashfree`}</button>
        )}
      </div>
    </div>
  );
}
