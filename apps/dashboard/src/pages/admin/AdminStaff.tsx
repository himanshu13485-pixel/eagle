import { useEffect, useState, type ReactNode } from "react";
import { adminApi, adminErr, getAdmin } from "../../lib/adminApi";
import { AdminHeader } from "../../components/AdminLayout";

interface Staff { id: string; name: string; email: string; role: string; active: boolean; createdAt?: string }
const ROLES = ["SUPER_ADMIN", "SUB_ADMIN", "SALESPERSON"];
const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super Admin", SUB_ADMIN: "Sub Admin", SALESPERSON: "Salesperson" };
const ROLE_STYLE: Record<string, string> = { SUPER_ADMIN: "bg-brand/10 text-brand", SUB_ADMIN: "bg-indigo-100 text-indigo-700", SALESPERSON: "bg-amber-100 text-amber-700" };

export function AdminStaff() {
  const me = getAdmin();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [add, setAdd] = useState(false);
  const [toast, setToast] = useState("");

  function load() { adminApi<Staff[]>("/staff").then(setStaff).catch((e) => setToast(adminErr(e))); }
  useEffect(load, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);

  async function toggle(s: Staff) {
    try { await adminApi(`/staff/${s.id}`, { method: "PATCH", body: JSON.stringify({ active: !s.active }) }); load(); }
    catch (e) { setToast(adminErr(e)); }
  }

  return (
    <div>
      <AdminHeader title="Platform Staff" subtitle="Super Admins, Sub Admins and Salespeople." action={<button onClick={() => setAdd(true)} className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-dark">+ Add Staff</button>} />
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr><th className="px-5 py-3">#</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-center">Manage</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staff.length ? staff.map((s, i) => (
              <tr key={s.id} className="hover:bg-gray-50/60">
                <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                <td className="px-5 py-3 font-semibold text-gray-900">{s.name}{s.id === me?.id && <span className="ml-2 text-xs font-normal text-gray-400">(you)</span>}</td>
                <td className="px-5 py-3 text-gray-500">{s.email}</td>
                <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_STYLE[s.role] ?? "bg-gray-100 text-gray-500"}`}>{ROLE_LABEL[s.role] ?? s.role}</span></td>
                <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>{s.active ? "Active" : "Disabled"}</span></td>
                <td className="px-5 py-3 text-center">
                  {s.id !== me?.id ? <button onClick={() => toggle(s)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${s.active ? "bg-rose-50 text-rose-600 hover:bg-rose-100" : "bg-green-50 text-green-700 hover:bg-green-100"}`}>{s.active ? "Disable" : "Enable"}</button> : <span className="text-xs text-gray-400">—</span>}
                </td>
              </tr>
            )) : <tr><td colSpan={6} className="px-5 py-16 text-center text-gray-400">No staff yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {add && <StaffModal onClose={() => setAdd(false)} onSaved={() => { setAdd(false); load(); setToast("Staff added."); }} onErr={setToast} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function StaffModal({ onClose, onSaved, onErr }: { onClose: () => void; onSaved: () => void; onErr: (m: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("SALESPERSON");
  const [busy, setBusy] = useState(false);
  const canSubmit = name.trim() && email.trim() && password.length >= 6;

  async function save() {
    setBusy(true);
    try { await adminApi("/staff", { method: "POST", body: JSON.stringify({ name, email, password, role }) }); onSaved(); }
    catch (e) { onErr(adminErr(e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-gray-900">Add Staff</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button></div>
        <div className="space-y-3">
          <F label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></F>
          <F label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></F>
          <F label="Password (min 6)"><input value={password} onChange={(e) => setPassword(e.target.value)} type="text" className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></F>
          <F label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </F>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
          <button onClick={save} disabled={!canSubmit || busy} className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-40">{busy ? "Saving…" : "Add staff"}</button>
        </div>
      </div>
    </div>
  );
}
function F({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-gray-600">{label}</span>{children}</label>;
}
