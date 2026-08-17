import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EmployeeDto } from "@eagle/shared";
import { api } from "../lib/api";
import { fmtHM, fmtRelative, fmtDate, fmtTime } from "../lib/format";

interface ProfileResp {
  employee: EmployeeDto;
  stats: { usageSec: number; idleSec: number; screenshotCount: number; since: string };
  topApps: { name: string; sec: number }[];
  recentShots: { id: string; capturedAt: string; app: string | null; trigger: string; isIdle: boolean; imageUrl: string }[];
}

/* ---------- shared visuals (mirrors the Employees table) ---------- */
const AVATAR = ["bg-red-500","bg-orange-500","bg-amber-500","bg-emerald-500","bg-teal-500","bg-sky-500","bg-indigo-500","bg-violet-500","bg-fuchsia-500","bg-rose-500"];
const initials = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?"; };
const colorFor = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR[h % AVATAR.length]; };
function Avatar({ name, url, size = "h-16 w-16 text-lg" }: { name: string; url?: string | null; size?: string }) {
  if (url) return <img src={url} alt={name} className={`shrink-0 rounded-full object-cover ${size}`} />;
  return <span className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${size} ${colorFor(name)}`}>{initials(name)}</span>;
}
const ROLE_LABEL: Record<string, string> = { EMPLOYEE: "Employee", MANAGER: "Manager", TEAM_LEAD: "Team Lead" };
function StatusBadge({ active, status }: { active: boolean; status: string }) {
  if (!active) return <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-500">Inactive</span>;
  const map: Record<string, string> = { ACTIVE: "bg-green-100 text-green-700", IDLE: "bg-amber-100 text-amber-700", OFFLINE: "bg-red-50 text-red-500" };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-500"}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}
const TRIGGER_LABEL: Record<string, string> = { PERIODIC: "Periodic", APP_SWITCH: "App switch", WEBCAM: "Webcam", ON_DEMAND: "On demand" };

export function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<ProfileResp | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [lightbox, setLightbox] = useState<ProfileResp["recentShots"][number] | null>(null);

  function load() {
    if (!id) return;
    api<ProfileResp>(`/employees/${id}/profile`).then(setData).catch(() => setErr(true));
  }
  useEffect(load, [id]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);

  const e = data?.employee;
  const maxApp = useMemo(() => Math.max(1, ...(data?.topApps.map((a) => a.sec) ?? [1])), [data]);

  async function screenshotRequest() {
    if (!e) return;
    setBusy(true);
    try {
      const r = await api<{ reached: boolean }>(`/employees/${e.id}/screenshot-request`, { method: "POST" });
      setToast(r.reached ? "Screenshot requested — it'll appear shortly." : "Agent is offline — can't request right now.");
      setTimeout(load, 4000);
    } finally { setBusy(false); }
  }

  if (err) return (
    <div className="grid place-items-center py-24 text-center text-gray-400">
      <p>Employee not found.</p>
      <button onClick={() => nav("/employees")} className="mt-3 rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">← Back to Employees</button>
    </div>
  );
  if (!e || !data) return <div className="grid place-items-center py-24 text-gray-400">Loading…</div>;

  const a = e.agent;

  return (
    <div>
      <button onClick={() => nav("/employees")} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800">← Employees</button>

      {/* ---------- header ---------- */}
      <div className="mb-6 flex flex-wrap items-center gap-5 rounded-2xl bg-white p-6 shadow-sm">
        <Avatar name={e.name} url={e.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{e.name}</h1>
            <StatusBadge active={e.active} status={e.status} />
          </div>
          <p className="mt-0.5 text-sm text-gray-400">{e.email || "No email"} · {ROLE_LABEL[e.role] ?? e.role} · {e.teamName ?? "No department"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={screenshotRequest} disabled={busy || !e.active} className="rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-40">📷 Screenshot request</button>
          <button onClick={() => nav("/live")} disabled={!e.active} className="rounded-full border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40">📡 Live</button>
        </div>
      </div>

      {/* ---------- stat cards ---------- */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Usage (7 days)" value={fmtHM(data.stats.usageSec)} tone="text-green-600" />
        <Stat label="Idle (7 days)" value={fmtHM(data.stats.idleSec)} tone="text-amber-600" />
        <Stat label="Screenshots (total)" value={String(data.stats.screenshotCount)} tone="text-brand" />
        <Stat label="Last active" value={fmtRelative(e.lastActiveAt)} tone="text-gray-800" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------- agent info ---------- */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-bold text-gray-900">Agent</h3>
          <div className="divide-y divide-gray-100 text-sm">
            <Row k="Platform / OS" v={a?.platform ?? "Unknown"} />
            <Row k="Agent version" v={a?.version ?? "—"} />
            <Row k="Devices" v={String(e.deviceCount)} />
            <Row k="Last seen" v={fmtRelative(a?.lastSeenAt ?? null)} />
            <Row k="Last screenshot" v={fmtRelative(e.lastScreenshotAt)} />
            <Row k="Last app" v={e.lastApp ?? "—"} />
          </div>
          <button onClick={() => nav("/reports/timesheet")} className="mt-4 w-full rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200">View timesheet →</button>
        </div>

        {/* ---------- top apps ---------- */}
        <div className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-3 font-bold text-gray-900">Top apps &amp; websites <span className="text-xs font-normal text-gray-400">· last 7 days</span></h3>
          {data.topApps.length ? (
            <div className="space-y-3">
              {data.topApps.map((app) => (
                <div key={app.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate font-medium text-gray-700">{app.name}</span>
                    <span className="shrink-0 pl-3 text-gray-400">{fmtHM(app.sec)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((app.sec / maxApp) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="py-10 text-center text-sm text-gray-400">No activity recorded in the last 7 days.</p>}
        </div>
      </div>

      {/* ---------- recent screenshots ---------- */}
      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Recent screenshots</h3>
          <button onClick={() => nav("/screenshots")} className="text-sm font-semibold text-brand hover:underline">See all →</button>
        </div>
        {data.recentShots.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.recentShots.map((s) => (
              <button key={s.id} onClick={() => setLightbox(s)} className="group overflow-hidden rounded-xl border border-gray-100 text-left">
                <div className="aspect-video overflow-hidden bg-gray-100">
                  <img src={s.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="truncate text-xs text-gray-500">{s.app ?? "—"}</span>
                  <span className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${s.isIdle ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>{TRIGGER_LABEL[s.trigger] ?? s.trigger}</span>
                </div>
              </button>
            ))}
          </div>
        ) : <p className="py-10 text-center text-sm text-gray-400">No screenshots captured yet.</p>}
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}

      {lightbox && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <div className="w-full max-w-4xl" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between text-sm text-white">
              <span>{lightbox.app ?? "—"} · {fmtDate(lightbox.capturedAt)} {fmtTime(lightbox.capturedAt)}</span>
              <button onClick={() => setLightbox(null)} className="text-white/70 hover:text-white">✕ Close</button>
            </div>
            <img src={lightbox.imageUrl} alt="" className="max-h-[80vh] w-full rounded-xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between py-2.5"><span className="text-gray-500">{k}</span><span className="font-medium text-gray-900">{v}</span></div>;
}
