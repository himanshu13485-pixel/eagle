import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api<{ ok: true; devLink?: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setDevLink(r.devLink ?? null);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error && err.message.includes("fetch") ? "Can't reach the API on :4000." : "Something went wrong.");
    } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink p-6 text-white">
      <div className="w-full max-w-sm">
        <div className="text-2xl font-black">Eagle<span className="text-brand">See</span></div>
        <h2 className="mt-6 text-3xl font-black">Reset your password</h2>
        {sent ? (
          <div className="mt-4 space-y-4">
            <p className="text-gray-300">If an account exists for <b>{email}</b>, we've sent a reset link. Check your inbox.</p>
            {devLink && (
              <div className="rounded-xl bg-amber-400/10 p-3 text-sm">
                <p className="mb-1 font-semibold text-amber-300">Dev mode (no SMTP): use this link</p>
                <Link to={devLink.replace(/^https?:\/\/[^/]+/, "")} className="break-all text-amber-300 underline">{devLink}</Link>
              </div>
            )}
            <Link to="/login" className="inline-block text-sm font-semibold text-amber-400 hover:underline">← Back to login</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <p className="text-gray-300">Enter your work email and we'll send you a link to reset it.</p>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" className="w-full rounded-xl border-2 border-amber-400/60 bg-amber-50/90 px-4 py-3 text-gray-900 outline-none" />
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)} className="w-full rounded-xl bg-amber-400 py-3 font-bold text-ink transition hover:brightness-105 disabled:opacity-50">{busy ? "Sending…" : "Send reset link"}</button>
            <Link to="/login" className="block text-sm text-gray-400 hover:underline">← Back to login</Link>
          </form>
        )}
      </div>
    </div>
  );
}
