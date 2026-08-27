import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = password.length >= 6 && password === confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError("");
    try {
      await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
      setTimeout(() => nav("/login"), 1800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      try { setError(JSON.parse(msg).message || "Reset failed."); } catch { setError(msg || "Reset failed."); }
    } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink p-6 text-white">
      <div className="w-full max-w-sm">
        <div className="text-2xl font-black">Workk</div>
        <h2 className="mt-6 text-3xl font-black">Set a new password</h2>
        {!token ? (
          <p className="mt-4 text-rose-400">This reset link is missing its token. Request a new one from <Link to="/forgot" className="text-amber-400 underline">Forgot password</Link>.</p>
        ) : done ? (
          <p className="mt-4 text-green-400">Password updated. Redirecting you to login…</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="New password (min 6)" className="w-full rounded-xl border-2 border-amber-400/60 bg-amber-50/90 px-4 py-3 text-gray-900 outline-none" />
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" placeholder="Confirm password" className="w-full rounded-xl border-2 border-amber-400/60 bg-amber-50/90 px-4 py-3 text-gray-900 outline-none" />
            {confirm && password !== confirm && <p className="text-sm text-amber-300">Passwords don't match.</p>}
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button disabled={busy || !valid} className="w-full rounded-xl bg-amber-400 py-3 font-bold text-ink transition hover:brightness-105 disabled:opacity-50">{busy ? "Updating…" : "Update password"}</button>
            <Link to="/login" className="block text-sm text-gray-400 hover:underline">← Back to login</Link>
          </form>
        )}
      </div>
    </div>
  );
}
