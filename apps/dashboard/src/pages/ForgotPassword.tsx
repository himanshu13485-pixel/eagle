import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      // The reset link only ever arrives by email. It used to be rendered here
      // when the server had no SMTP, which handed anyone a takeover link for any
      // address they typed in.
      await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("fetch")
          ? "We couldn't reach Workk. Check your connection and try again."
          : "Something went wrong. Please try again.",
      );
    } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink p-6 text-white">
      <div className="w-full max-w-sm">
        <div className="text-2xl font-black">Workk</div>
        <h2 className="mt-6 text-3xl font-black">Reset your password</h2>
        {sent ? (
          <div className="mt-4 space-y-4">
            <p className="text-gray-300">If an account exists for <b>{email}</b>, we've sent a reset link. Check your inbox.</p>
            <p className="text-sm text-gray-400">The link is valid for one hour. If it doesn't arrive in a few minutes, check your spam folder.</p>
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
