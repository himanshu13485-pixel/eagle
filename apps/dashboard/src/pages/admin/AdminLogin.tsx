import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin, adminErr } from "../../lib/adminApi";

export function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await adminLogin(email, password); nav("/admin"); }
    catch (e) { setErr(adminErr(e, "Invalid credentials.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black text-lg">🦅</span>
          <div className="leading-tight">
            <div className="text-xl font-bold text-gray-900">Eagle<span className="text-brand">See</span></div>
            <div className="text-[10px] uppercase tracking-widest text-amber-500">Admin Console</div>
          </div>
        </div>
        <h1 className="text-lg font-bold text-gray-900">Platform sign in</h1>
        <p className="mb-4 text-sm text-gray-500">Super Admin, Sub Admin & Salesperson access.</p>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-medium text-gray-600">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="superadmin@eagle.test" className="w-full rounded-xl border border-gray-200 px-4 py-2.5" />
        </label>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-medium text-gray-600">Password</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className="w-full rounded-xl border border-gray-200 px-4 py-2.5" />
        </label>
        {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-brand px-4 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
