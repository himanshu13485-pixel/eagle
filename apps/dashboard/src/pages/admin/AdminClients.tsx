import { useEffect, useMemo, useState, type ReactNode } from "react";
import { adminApi, adminErr, getAdmin } from "../../lib/adminApi";
import { AdminHeader } from "../../components/AdminLayout";

interface Client {
  id: string; name: string; status: string; employeeCount: number;
  tier: string | null; seats: number | null; ownerName: string | null; ownerEmail: string | null;
  salespersonId: string | null; salespersonName: string | null; createdAt: string;
}
interface Staff { id: string; name: string; email: string; role: string; active: boolean }

const TIERS = ["BASIC", "PROFESSIONAL", "BUSINESS"];
const STATUS_STYLE: Record<string, string> = { ACTIVE: "bg-green-100 text-green-700", SUSPENDED: "bg-rose-100 text-rose-600" };

export function AdminClients() {
  const me = getAdmin();
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [search, setSearch] = useState("");
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<Client | null>(null);
  const [toast, setToast] = useState("");

  function load() {
    adminApi<Client[]>("/clients").then(setClients).catch(() => setClients([]));
    // staff (for the salesperson picker) is Super-Admin only — ignore if forbidden
    adminApi<Staff[]>("/staff").then(setStaff).catch(() => setStaff([]));
  }
  useEffect(load, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);

  const sellers = useMemo(() => staff.filter((s) => s.role === "SALESPERSON" || s.role === "SUB_ADMIN"), [staff]);
  const filtered = useMemo(() => clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.ownerEmail ?? "").includes(search.toLowerCase())), [clients, search]);
  const canManage = me?.role !== "SALESPERSON";

  async function toggleStatus(c: Client) {
    try { await adminApi(`/clients/${c.id}`, { method: "PATCH", body: JSON.stringify({ status: c.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }) }); load(); }
    catch (e) { setToast(adminErr(e)); }
  }

  return (
    <div>
      <AdminHeader title="Clients" subtitle="Every account on the platform." action={<button onClick={() => setAdd(true)} className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-dark">+ Add Client</button>} />

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client or owner email…" className="mb-4 w-80 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm" />

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">#</th><th className="px-5 py-3">Client</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Tier</th>
              <th className="px-5 py-3">Seats</th><th className="px-5 py-3">Employees</th><th className="px-5 py-3">Owner</th><th className="px-5 py-3">Salesperson</th><th className="px-5 py-3 text-center">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length ? filtered.map((c, i) => (
              <tr key={c.id} className="hover:bg-gray-50/60">
                <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                <td className="px-5 py-3"><div className="font-semibold text-gray-900">{c.name}</div><div className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</div></td>
                <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[c.status] ?? "bg-gray-100 text-gray-500"}`}>{c.status}</span></td>
                <td className="px-5 py-3 font-medium text-gray-700">{c.tier ?? "—"}</td>
                <td className="px-5 py-3 text-gray-600">{c.seats ?? "—"}</td>
                <td className="px-5 py-3 text-gray-600">{c.employeeCount}</td>
                <td className="px-5 py-3 text-gray-500">{c.ownerEmail ?? "—"}</td>
                <td className="px-5 py-3 text-gray-500">{c.salespersonName ?? "—"}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-center gap-2">
                    {canManage && <button onClick={() => setEdit(c)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Edit</button>}
                    {canManage && <button onClick={() => toggleStatus(c)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${c.status === "ACTIVE" ? "bg-rose-50 text-rose-600 hover:bg-rose-100" : "bg-green-50 text-green-700 hover:bg-green-100"}`}>{c.status === "ACTIVE" ? "Suspend" : "Activate"}</button>}
                    {!canManage && <span className="text-xs text-gray-400">—</span>}
                  </div>
                </td>
              </tr>
            )) : <tr><td colSpan={9} className="px-5 py-16 text-center text-gray-400">No clients yet. Add one to get started.</td></tr>}
          </tbody>
        </table>
      </div>

      {add && <ClientModal sellers={sellers} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); load(); setToast("Client created."); }} onErr={setToast} />}
      {edit && <ClientModal client={edit} sellers={sellers} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); setToast("Client updated."); }} onErr={setToast} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function ClientModal({ client, sellers, onClose, onSaved, onErr }: { client?: Client; sellers: Staff[]; onClose: () => void; onSaved: () => void; onErr: (m: string) => void }) {
  const isEdit = !!client;
  const [name, setName] = useState(client?.name ?? "");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [tier, setTier] = useState(client?.tier ?? "PROFESSIONAL");
  const [seats, setSeats] = useState(client?.seats ?? 10);
  const [salespersonId, setSalespersonId] = useState(client?.salespersonId ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      if (isEdit) {
        await adminApi(`/clients/${client!.id}`, { method: "PATCH", body: JSON.stringify({ tier, seats: Number(seats), salespersonId: salespersonId || null }) });
      } else {
        await adminApi("/clients", { method: "POST", body: JSON.stringify({ name, ownerName, ownerEmail, ownerPassword, tier, seats: Number(seats), salespersonId: salespersonId || undefined }) });
      }
      onSaved();
    } catch (e) { onErr(adminErr(e)); setBusy(false); }
  }

  const canSubmit = isEdit ? true : name.trim() && ownerName.trim() && ownerEmail.trim() && ownerPassword.length >= 6;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{isEdit ? `Edit ${client!.name}` : "Add Client"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <div className="space-y-3">
          {!isEdit && <>
            <Field label="Company / client name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Owner name"><input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></Field>
              <Field label="Owner email"><input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} type="email" className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></Field>
            </div>
            <Field label="Owner password (min 6)"><input value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} type="text" className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></Field>
          </>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan tier">
              <select value={tier} onChange={(e) => setTier(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5">
                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Seats"><input value={seats} onChange={(e) => setSeats(Number(e.target.value))} type="number" min={1} className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></Field>
          </div>
          {sellers.length > 0 && (
            <Field label="Salesperson">
              <select value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5">
                <option value="">Unassigned</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role === "SUB_ADMIN" ? "Sub Admin" : "Sales"})</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
          <button onClick={save} disabled={!canSubmit || busy} className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-40">{busy ? "Saving…" : isEdit ? "Save" : "Create client"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-gray-600">{label}</span>{children}</label>;
}
