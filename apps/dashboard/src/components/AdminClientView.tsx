import { useEffect, useState, type ComponentType } from "react";
import { adminApi, getClientToken } from "../lib/adminApi";
import { setOrgTokenOverride } from "../lib/api";

interface Client { id: string; name: string }

/**
 * Renders a real org dashboard page (Reports / Data Management / Work Replay) inside the
 * Super Admin console, pointed at a selected client. The embedded page is the *exact* org
 * component — same design, same working — fed the client's org token via a scoped override,
 * so it operates at the account & employee level without touching the admin session.
 */
export function AdminClientView({ sectionLabel, component: Component }: { sectionLabel: string; component: ComponentType }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { adminApi<Client[]>("/clients").then(setClients).catch(() => setClients([])); }, []);

  useEffect(() => {
    setReady(false); setErr("");
    setOrgTokenOverride(null);
    if (!clientId) return;
    let alive = true;
    getClientToken(clientId)
      .then((tok) => { if (!alive) return; setOrgTokenOverride(tok); setReady(true); })
      .catch(() => { if (alive) setErr("Couldn't open this client."); });
    return () => { alive = false; setOrgTokenOverride(null); };
  }, [clientId]);

  // Ensure the override never leaks once the admin leaves this page.
  useEffect(() => () => setOrgTokenOverride(null), []);

  const selected = clients.find((c) => c.id === clientId);
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3 shadow-sm">
        <span className="text-sm font-semibold text-gray-500">
          {sectionLabel}
          {selected && <> · <span className="text-brand">{selected.name}</span></>}
        </span>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">Account</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="min-w-[220px] rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm">
            <option value="">Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      {err && <p className="mb-4 text-sm text-rose-500">{err}</p>}

      {!clientId ? (
        <div className="grid place-items-center rounded-2xl bg-white py-24 text-center text-gray-400">
          Select a client account to view its {sectionLabel} — at the account and employee level.
        </div>
      ) : ready ? (
        <Component key={clientId} />
      ) : (
        <div className="grid place-items-center rounded-2xl bg-white py-24 text-gray-400">Loading {selected?.name}…</div>
      )}
    </div>
  );
}
