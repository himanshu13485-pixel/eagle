import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BRAND } from "@eagle/shared";
import { useAuth } from "../lib/auth";
import { adminLogin } from "../lib/adminApi";

/** A wrong-credentials rejection, as opposed to a network or server fault. */
function isCredentialError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /unauthorized|invalid credentials|401/i.test(msg);
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      // One sign-in for both account types. Customer accounts are the common
      // case, so try those first and fall back to a platform admin. The error
      // is deliberately identical either way, so this cannot be used to probe
      // which addresses are admins.
      try {
        await login(email, password);
        nav("/");
      } catch (orgErr) {
        if (!isCredentialError(orgErr)) throw orgErr;
        await adminLogin(email, password);
        nav("/admin");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        isCredentialError(err)
          ? "Invalid email or password."
          : msg.toLowerCase().includes("fetch")
            ? "Can't reach the server. Check your connection and try again."
            : msg || "Sign in failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-center bg-gray-50 p-14 md:flex">
        <h1 className="text-5xl font-black leading-tight text-gray-900">
          Real time monitoring for higher visibility, higher productivity
        </h1>
        <p className="mt-6 max-w-md text-gray-500">{BRAND.description}</p>
      </div>
      <div className="flex flex-col justify-center bg-ink p-14 text-white">
        <h2 className="text-4xl font-black">Welcome Back!</h2>
        <p className="mt-2 text-gray-300">Let's log in to your account</p>
        <form onSubmit={submit} className="mt-8 max-w-sm space-y-4">
          <div>
            <label className="text-sm text-gray-300">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="mt-1 w-full rounded-xl border-2 border-amber-400/60 bg-amber-50/90 px-4 py-3 text-gray-900 outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-gray-300">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="mt-1 w-full rounded-xl border-2 border-amber-400/60 bg-amber-50/90 px-4 py-3 text-gray-900 outline-none"
            />
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-amber-400 py-3 font-bold text-ink transition hover:brightness-105 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Login"}
          </button>
          <div className="flex items-center justify-between text-sm">
            <Link to="/forgot" className="text-amber-400 hover:underline">Forgot password?</Link>
            <span className="text-gray-400">New here? <Link to="/signup" className="font-semibold text-amber-400 hover:underline">Start free trial</Link></span>
          </div>
        </form>
      </div>
    </div>
  );
}
