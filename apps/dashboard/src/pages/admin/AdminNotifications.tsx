import { useEffect, useMemo, useState, type ReactNode } from "react";
import { adminApi, adminErr, getAdmin } from "../../lib/adminApi";
import { AdminHeader } from "../../components/AdminLayout";

interface Client { id: string; name: string }
interface Sent { id: string; audience: string; target: string; kind: string; title: string; body: string; createdBy: string | null; createdAt: string }

const KINDS = ["INFO", "UPDATE", "ANNOUNCEMENT", "ALERT"];
const KIND_STYLE: Record<string, string> = { INFO: "bg-blue-100 text-blue-700", UPDATE: "bg-indigo-100 text-indigo-700", ANNOUNCEMENT: "bg-amber-100 text-amber-700", ALERT: "bg-rose-100 text-rose-600" };

export function AdminNotifications() {
  const me = getAdmin();
  const isSuper = me?.role === "SUPER_ADMIN";
  const [clients, setClients] = useState<Client[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [toast, setToast] = useState("");

  // compose state
  const [audience, setAudience] = useState<"ORG" | "PLATFORM">("ORG");
  const [orgTarget, setOrgTarget] = useState(""); // "" = all clients
  const [roleTarget, setRoleTarget] = useState(""); // "" = all staff
  const [kind, setKind] = useState("ANNOUNCEMENT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pushTelegram, setPushTelegram] = useState(false);
  const [pushWhatsapp, setPushWhatsapp] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadSent() { if (isSuper) adminApi<Sent[]>("/notifications/sent").then(setSent).catch(() => setSent([])); }
  useEffect(() => {
    adminApi<Client[]>("/clients").then(setClients).catch(() => setClients([]));
    loadSent();
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);

  const canSend = title.trim() && body.trim() && !busy;
  const summary = useMemo(() => {
    if (audience === "PLATFORM") return roleTarget ? `Staff · ${roleTarget.replace("_", " ").toLowerCase()}` : "All staff";
    return orgTarget ? clients.find((c) => c.id === orgTarget)?.name ?? "a client" : "All clients";
  }, [audience, roleTarget, orgTarget, clients]);

  async function send() {
    setBusy(true);
    try {
      const pushChannels = [pushTelegram && "TELEGRAM", pushWhatsapp && "WHATSAPP"].filter(Boolean);
      await adminApi("/notifications", {
        method: "POST",
        body: JSON.stringify({
          audience, kind, title, body,
          ...(pushChannels.length ? { pushChannels } : {}),
          ...(audience === "ORG" ? { orgId: orgTarget || undefined } : { role: roleTarget || undefined }),
        }),
      });
      setTitle(""); setBody("");
      setToast(`Sent to ${summary}.`);
      loadSent();
    } catch (e) { setToast(adminErr(e)); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <AdminHeader title="Notifications" subtitle="Send announcements and updates to clients or internal staff." />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* compose */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-gray-900">Compose</h3>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-sm font-semibold text-gray-600">Audience</p>
              <div className="flex gap-2">
                <button onClick={() => setAudience("ORG")} className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${audience === "ORG" ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600"}`}>🏢 Clients</button>
                {isSuper && <button onClick={() => setAudience("PLATFORM")} className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${audience === "PLATFORM" ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600"}`}>👤 Staff</button>}
              </div>
            </div>

            {audience === "ORG" ? (
              <Field label="Target client">
                <select value={orgTarget} onChange={(e) => setOrgTarget(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
                  <option value="">📢 All clients (broadcast)</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Target staff">
                <select value={roleTarget} onChange={(e) => setRoleTarget(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
                  <option value="">All staff</option>
                  <option value="SUPER_ADMIN">Super Admins</option>
                  <option value="SUB_ADMIN">Sub Admins</option>
                  <option value="SALESPERSON">Salespeople</option>
                </select>
              </Field>
            )}

            <Field label="Type">
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
                {KINDS.map((k) => <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>)}
              </select>
            </Field>
            <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" /></Field>
            <Field label="Message"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" /></Field>

            <div>
              <p className="mb-1.5 text-sm font-semibold text-gray-600">Also push to</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPushTelegram((v) => !v)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${pushTelegram ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600"}`}>✈️ Telegram</button>
                <button type="button" onClick={() => setPushWhatsapp((v) => !v)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${pushWhatsapp ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600"}`}>🟢 WhatsApp</button>
              </div>
              {(pushTelegram || pushWhatsapp) && <p className="mt-1.5 text-xs text-gray-400">Delivered to each recipient's registered channels{audience === "ORG" && !orgTarget ? " across all clients" : ""}. Channels without server credentials run in dry mode.</p>}
            </div>

            <p className="text-xs text-gray-400">Will be delivered to: <span className="font-semibold text-gray-600">{summary}</span></p>
            <button onClick={send} disabled={!canSend} className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-40">{busy ? "Sending…" : "Send notification"}</button>
          </div>
        </div>

        {/* sent */}
        <div className="rounded-2xl bg-white shadow-sm">
          <h3 className="p-6 pb-3 text-lg font-bold text-gray-900">Recently sent</h3>
          {!isSuper ? (
            <p className="px-6 pb-6 text-sm text-gray-400">The full sent history is visible to Super Admins.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="px-5 py-3">Type</th><th className="px-5 py-3">Target</th><th className="px-5 py-3">Title</th><th className="px-5 py-3">By</th><th className="px-5 py-3">When</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sent.length ? sent.map((s) => (
                    <tr key={s.id} className="align-top hover:bg-gray-50/60">
                      <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND_STYLE[s.kind] ?? "bg-gray-100 text-gray-500"}`}>{s.kind.charAt(0) + s.kind.slice(1).toLowerCase()}</span></td>
                      <td className="px-5 py-3 text-gray-600">{s.target}</td>
                      <td className="px-5 py-3"><div className="font-medium text-gray-900">{s.title}</div><div className="max-w-md truncate text-xs text-gray-400">{s.body}</div></td>
                      <td className="px-5 py-3 text-gray-500">{s.createdBy ?? "—"}</td>
                      <td className="px-5 py-3 text-gray-500">{new Date(s.createdAt).toLocaleString()}</td>
                    </tr>
                  )) : <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">Nothing sent yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-gray-600">{label}</span>{children}</label>;
}
