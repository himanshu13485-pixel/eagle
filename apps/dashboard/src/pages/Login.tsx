import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BRAND } from "@eagle/shared";
import { useAuth } from "../lib/auth";

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("owner@eagle.test");
  const [password, setPassword] = useState("eagle1234");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      nav("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch")) {
        setError("Can't reach the API on :4000. Is the backend running? (npm run dev:api)");
      } else if (msg.includes("Unauthorized") || msg.includes("Invalid credentials")) {
        setError("Invalid email or password. (Did you run npm run db:seed?)");
      } else {
        setError(msg || "Login failed.");
      }
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
          <p className="text-xs text-gray-400">Demo: owner@eagle.test / eagle1234</p>
        </form>
      </div>
    </div>
  );
}
