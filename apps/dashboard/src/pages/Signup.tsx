import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Signup() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = orgName.trim().length >= 2 && ownerName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length >= 6;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError("");
    try {
      await register(orgName, ownerName, email, password);
      nav("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      try { setError(JSON.parse(msg).message || "Sign up failed."); } catch { setError(msg.includes("fetch") ? "Can't reach the API on :4000. Is the backend running?" : msg || "Sign up failed."); }
    } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-center bg-gray-50 p-14 md:flex">
        <div className="text-2xl font-black text-gray-900">Workk</div>
        <h1 className="mt-6 text-4xl font-black leading-tight text-gray-900">Start your 14-day free trial</h1>
        <p className="mt-4 max-w-md text-gray-500">No credit card required. Set up your workspace in two minutes and invite your team.</p>
        <ul className="mt-6 space-y-2 text-sm text-gray-600">
          {["Live screenshots & screencast", "App, website & idle-time reports", "Works on Windows, Mac & Linux"].map((f) => (
            <li key={f} className="flex items-center gap-2"><span className="text-green-500">✓</span>{f}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col justify-center bg-ink p-14 text-white">
        <h2 className="text-4xl font-black">Create your account</h2>
        <p className="mt-2 text-gray-300">Step 1 of 1 — you'll be signed in right away</p>
        <form onSubmit={submit} className="mt-8 max-w-sm space-y-4">
          <FieldDark label="Company / workspace name"><input value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputCls} placeholder="Acme Inc." /></FieldDark>
          <FieldDark label="Your name"><input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} placeholder="Jane Doe" /></FieldDark>
          <FieldDark label="Work email"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} placeholder="jane@acme.com" /></FieldDark>
          <FieldDark label="Password (min 6)"><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className={inputCls} /></FieldDark>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button disabled={busy || !valid} className="w-full rounded-xl bg-amber-400 py-3 font-bold text-ink transition hover:brightness-105 disabled:opacity-50">{busy ? "Creating…" : "Create account →"}</button>
          <p className="text-sm text-gray-400">Already have an account? <Link to="/login" className="font-semibold text-amber-400 hover:underline">Log in</Link></p>
        </form>
      </div>
    </div>
  );
}

const inputCls = "mt-1 w-full rounded-xl border-2 border-amber-400/60 bg-amber-50/90 px-4 py-3 text-gray-900 outline-none";
function FieldDark({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className="text-sm text-gray-300">{label}</label>{children}</div>;
}
