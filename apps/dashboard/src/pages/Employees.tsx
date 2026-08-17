import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { EmployeeDto, Paginated, ScreenshotDto } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { api, API_URL, getToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLiveFrames } from "../lib/live";
import { getSocket } from "../lib/socket";
import { fmtRelative, fmtTime } from "../lib/format";

const ROLE_LABEL: Record<string, string> = { EMPLOYEE: "Employee", MANAGER: "Manager", TEAM_LEAD: "Team Lead" };
const splitName = (n: string) => { const p = n.trim().split(/\s+/); return { first: p[0] ?? "", last: p.slice(1).join(" ") }; };

/* ---------- avatars / status ---------- */
const AVATAR = ["bg-red-500","bg-orange-500","bg-amber-500","bg-emerald-500","bg-teal-500","bg-sky-500","bg-indigo-500","bg-violet-500","bg-fuchsia-500","bg-rose-500"];
const initials = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?"; };
const colorFor = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR[h % AVATAR.length]; };
function Avatar({ name, url, size = "h-10 w-10 text-xs" }: { name: string; url?: string | null; size?: string }) {
  if (url) return <img src={url} alt={name} className={`shrink-0 rounded-full object-cover ${size}`} />;
  return <span className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${size} ${colorFor(name)}`}>{initials(name)}</span>;
}
function StatusBadge({ active, status }: { active: boolean; status: string }) {
  if (!active) return <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-500">Inactive</span>;
  const map: Record<string, string> = { ACTIVE: "bg-green-100 text-green-700", IDLE: "bg-amber-100 text-amber-700", OFFLINE: "bg-red-50 text-red-500", INVITED: "bg-indigo-100 text-indigo-600" };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-500"}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

/* ---------- icons ---------- */
const ICONS: Record<string, string> = {
  camera: "M4 8h3l1.5-2h7L17 8h3v11H4zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  cast: "M2 8V6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2h-5M2 15a5 5 0 015 5M2 19a1 1 0 011 1M2 11a9 9 0 019 9",
  download: "M12 3v12m0 0l-4-4m4 4l4-4M4 20h16",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.5 7.5 0 000-2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 00-1.7-1L14.9 3H9.1l-.4 2.6a7.5 7.5 0 00-1.7 1l-2.3-1-2 3.4L4.6 11a7.5 7.5 0 000 2l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 001.7 1l.4 2.6h5.8l.4-2.6a7.5 7.5 0 001.7-1l2.3 1 2-3.4z",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z",
  doc: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h6",
  info: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 11v6M12 7h.01",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15",
  power: "M12 3v9M6.5 6.5a8 8 0 1011 0",
};
function I({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
function IconBtn({ icon, title, onClick, tone = "text-gray-500", disabled }: { icon: string; title: string; onClick: () => void; tone?: string; disabled?: boolean }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled} className={`grid h-9 w-9 place-items-center rounded-lg transition hover:bg-gray-100 disabled:opacity-40 ${tone}`}>
      <I d={ICONS[icon]} />
    </button>
  );
}

/* ---------- toggle / stepper for the per-employee settings modal ---------- */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition ${on ? "bg-brand" : "bg-gray-300"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${on ? "left-6" : "left-1"}`} /></button>;
}
function Stepper({ value, onChange, min = 1, max = 60 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200">–</button>
      <div className="w-16 rounded-lg border border-gray-200 py-1.5 text-center text-sm font-semibold">{value}<span className="text-gray-400"> m</span></div>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200">+</button>
    </div>
  );
}

interface Installer { id: string; name: string; os: "win" | "mac"; filename: string; content: string; enrollToken: string; server: string }
interface EmpSettings { periodicScreenshots: boolean; screenshotIntervalMin: number; appSwitchScreenshots: boolean; appSwitchDelayMin: number; webcamPhotos: boolean; idleAfterMin: number; trackingMode: string; strictTimeTracking: boolean }

const FILTERS = ["ALL", "ACTIVE", "IDLE", "OFFLINE", "INVITED", "INACTIVE"] as const;
type Filter = (typeof FILTERS)[number];

export function Employees() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<EmployeeDto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [toast, setToast] = useState("");

  // modals
  const [inst, setInst] = useState<Installer | null>(null);
  const [live, setLive] = useState<EmployeeDto | null>(null);
  const [settingsFor, setSettingsFor] = useState<EmployeeDto | null>(null);
  const [editFor, setEditFor] = useState<EmployeeDto | null>(null);
  const [infoFor, setInfoFor] = useState<EmployeeDto | null>(null);
  const [shotFor, setShotFor] = useState<EmployeeDto | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Row action menu, positioned with fixed coords so it's never clipped by the table.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; up: boolean } | null>(null);

  function openMenu(ev: ReactMouseEvent, id: string) {
    if (menu?.id === id) { setMenu(null); return; }
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const MENU_H = 320;
    const up = r.bottom + MENU_H > window.innerHeight;
    setMenu({ id, x: r.right, y: up ? r.top : r.bottom, up });
  }

  function load() { api<EmployeeDto[]>("/employees").then(setRows).catch(() => setRows([])); }
  useEffect(load, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);

  const filtered = useMemo(() => rows.filter((e) => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "ALL") return true;
    if (filter === "INACTIVE") return !e.active;
    return e.active && e.status === filter;
  }), [rows, search, filter]);

  function downloadFile(filename: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "application/octet-stream" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }
  async function getInstaller(id: string, name: string, os: "win" | "mac" = "win") {
    setBusy(id);
    try { const res = await api<Omit<Installer, "id" | "name" | "os">>(`/employees/${id}/installer?os=${os}`, { method: "POST" }); setInst({ id, name, os, ...res }); }
    finally { setBusy(null); }
  }
  async function toggleActive(e: EmployeeDto) {
    setBusy(e.id);
    try { await api(`/employees/${e.id}/${e.active ? "deactivate" : "activate"}`, { method: "POST" }); load(); }
    catch (err: any) { let m = "Couldn't update."; try { m = JSON.parse(err.message).message || m; } catch { /* keep */ } setToast(Array.isArray(m) ? m[0] : m); }
    finally { setBusy(null); }
  }
  async function getUninstaller(e: EmployeeDto) {
    setBusy(e.id);
    try { const res = await api<{ filename: string; content: string }>(`/employees/${e.id}/uninstaller`, { method: "POST" }); downloadFile(res.filename, res.content); }
    finally { setBusy(null); }
  }
  async function removeEmployee(e: EmployeeDto) {
    if (!confirm(`Remove ${e.name}?\n\nPermanently deletes the employee, device(s), and ALL data. Cannot be undone.\n(To keep data + free the seat, use Deactivate.)`)) return;
    setBusy(e.id);
    try { await api(`/employees/${e.id}`, { method: "DELETE" }); load(); } finally { setBusy(null); }
  }

  return (
    <div>
      <PageHeader title="Employees" subtitle="People and devices you monitor"
        action={<button onClick={() => setAddOpen(true)} className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-dark">+ Add Employee</button>} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="w-72 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm" />
        <div className="flex items-center gap-1 rounded-xl bg-white p-1 text-sm shadow-sm">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 font-semibold capitalize ${filter === f ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-100"}`}>{f.toLowerCase()}</button>
          ))}
        </div>
      </div>

      <div className="overflow-visible rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-4 font-semibold">#</th>
              <th className="px-5 py-4 font-semibold">Employee</th>
              <th className="px-5 py-4 font-semibold">Status</th>
              <th className="px-5 py-4 font-semibold">Last screenshot</th>
              <th className="px-5 py-4 font-semibold">Last app</th>
              <th className="px-5 py-4 font-semibold">Team</th>
              <th className="px-5 py-4 text-center font-semibold">Actions</th>
              <th className="px-5 py-4 text-center font-semibold">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((e, i) => (
              <tr key={e.id} className={`transition hover:bg-gray-50/60 ${e.active ? "" : "opacity-60"}`}>
                <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={e.name} url={e.avatarUrl} />
                    <div><div className="font-semibold text-gray-900">{e.name}</div><div className="text-xs text-gray-400">{e.email || ROLE_LABEL[e.role] || "Employee"}</div></div>
                  </div>
                </td>
                <td className="px-5 py-3"><StatusBadge active={e.active} status={e.status} /></td>
                <td className="px-5 py-3 text-gray-500">{fmtRelative(e.lastScreenshotAt)}</td>
                <td className="px-5 py-3 text-gray-500">{e.lastApp ?? "—"}</td>
                <td className="px-5 py-3 text-gray-500">{e.teamName ?? "—"}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-center">
                    <IconBtn icon="camera" title="Screenshot request" onClick={() => setShotFor(e)} disabled={!e.active} />
                    <IconBtn icon="cast" title="Screencast (live)" onClick={() => setLive(e)} disabled={!e.active} />
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-center">
                    <IconBtn icon="download" title="Download agent installer" tone="text-brand" onClick={() => getInstaller(e.id, e.name)} disabled={busy === e.id} />
                    <IconBtn icon="gear" title="Individual settings" tone="text-indigo-500" onClick={() => setSettingsFor(e)} />
                    <IconBtn icon="power" title={e.active ? "Deactivate" : "Activate"} tone={e.active ? "text-red-500" : "text-green-600"} onClick={() => toggleActive(e)} disabled={busy === e.id} />
                    <button title="More" onClick={(ev) => openMenu(ev, e.id)} className={`grid h-9 w-9 place-items-center rounded-lg transition hover:bg-gray-100 ${menu?.id === e.id ? "bg-gray-100 text-gray-700" : "text-gray-500"}`}>
                      <I d={ICONS.dots} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={8} className="px-6 py-16 text-center text-gray-400">{rows.length ? "No employees match this filter." : "No employees yet. Add one, then generate an installer."}</td></tr>}
          </tbody>
        </table>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}

      {inst && <InstallerModal inst={inst} onOs={(os) => getInstaller(inst.id, inst.name, os)} busy={busy === inst.id} onDownload={() => downloadFile(inst.filename, inst.content)} onClose={() => setInst(null)} />}
      {live && <ScreencastModal orgId={user?.orgId} employee={live} onClose={() => setLive(null)} />}
      {settingsFor && <SettingsModal employee={settingsFor} onClose={() => setSettingsFor(null)} onSaved={() => setToast("Settings saved — agent applies on next heartbeat.")} />}
      {addOpen && <EmployeeFormModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />}
      {editFor && <EmployeeFormModal employee={editFor} onClose={() => setEditFor(null)} onSaved={() => { setEditFor(null); load(); }} />}
      {infoFor && <AgentInfoModal employee={infoFor} onClose={() => setInfoFor(null)} />}
      {shotFor && <ShotRequestModal orgId={user?.orgId} employee={shotFor} onClose={() => setShotFor(null)} />}

      {menu && (() => {
        const e = rows.find((r) => r.id === menu.id);
        if (!e) return null;
        const close = () => setMenu(null);
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div
              className="fixed z-50 w-52 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 text-left text-sm shadow-2xl"
              style={{ left: menu.x - 208, top: menu.up ? undefined : menu.y + 6, bottom: menu.up ? window.innerHeight - menu.y + 6 : undefined }}
            >
              <MenuItem icon="info" label="Visit profile" onClick={() => { close(); nav(`/employees/${e.id}`); }} />
              <MenuItem icon="edit" label="Edit" onClick={() => { close(); setEditFor(e); }} />
              <MenuItem icon="doc" label="Timesheet" onClick={() => { close(); nav("/reports/timesheet"); }} />
              <MenuItem icon="gear" label="Settings" onClick={() => { close(); setSettingsFor(e); }} />
              <MenuItem icon="info" label="Agent info" onClick={() => { close(); setInfoFor(e); }} />
              <MenuItem icon="download" label="Uninstaller" onClick={() => { close(); getUninstaller(e); }} />
              <div className="my-1 border-t border-gray-100" />
              <MenuItem icon="trash" label="Delete" tone="text-red-500" onClick={() => { close(); removeEmployee(e); }} />
            </div>
          </>
        );
      })()}
    </div>
  );
}

function MenuItem({ icon, label, onClick, tone = "text-gray-700" }: { icon: string; label: string; onClick: () => void; tone?: string }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${tone}`}><I d={ICONS[icon]} className="h-4 w-4" /> {label}</button>;
}

/* ---------- modals ---------- */
function Shell({ children, onClose, maxW = "max-w-lg" }: { children: ReactNode; onClose: () => void; maxW?: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className={`w-full ${maxW} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function InstallerModal({ inst, onOs, busy, onDownload, onClose }: { inst: Installer; onOs: (os: "win" | "mac") => void; busy: boolean; onDownload: () => void; onClose: () => void }) {
  return (
    <Shell onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-900">Install the agent for {inst.name}</h3>
      <div className="mt-3 flex gap-2">
        {(["win", "mac"] as const).map((o) => (
          <button key={o} onClick={() => onOs(o)} disabled={busy} className={`rounded-lg px-4 py-2 text-sm font-semibold ${inst.os === o ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{o === "win" ? "🪟 Windows" : "🍎 macOS"}</button>
        ))}
      </div>
      <p className="mt-3 text-sm text-gray-500">{inst.os === "win" ? "Run the .bat as administrator on the Windows PC — it installs hidden, auto-starts, adds the Defender exclusion, and enrolls." : "Run the .command on the Mac (right-click → Open first time). Installs via launchd + enrolls. Grant Screen Recording afterward."}</p>
      <button onClick={onDownload} className="mt-4 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-dark">⬇ Download installer ({inst.filename})</button>
      {inst.server.includes("localhost") && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Points at <code>{inst.server}</code>. For another machine set <code>AGENT_PUBLIC_URL</code> to the LAN IP/hostname (or public domain).</p>}
      <div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Done</button></div>
    </Shell>
  );
}

function ScreencastModal({ orgId, employee, onClose }: { orgId?: string; employee: EmployeeDto; onClose: () => void }) {
  const ids = useMemo(() => [employee.id], [employee.id]);
  const { frames, monitors, setMonitor } = useLiveFrames(orgId, ids);
  const frame = frames[employee.id];
  const monitorCount = monitors[employee.id] ?? 1;
  return (
    <Shell onClose={onClose} maxW="max-w-3xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-gray-900">Live — {employee.name}</h3>
        <div className="flex items-center gap-2">
          {monitorCount > 1 && (
            <select onChange={(e) => setMonitor(employee.id, Number(e.target.value))} defaultValue="0" className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold">
              {Array.from({ length: monitorCount }, (_, i) => <option key={i} value={i}>Monitor {i + 1}</option>)}
            </select>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
      </div>
      <div className="grid aspect-video place-items-center overflow-hidden rounded-xl bg-black">
        {frame ? <img src={frame.data} alt="" className="h-full w-full object-contain" /> : <span className="text-sm text-gray-400">{employee.status === "OFFLINE" ? "Offline — no agent connected" : "Connecting… waiting for frames"}</span>}
      </div>
      <p className="mt-2 text-xs text-gray-400">Streams only while this window is open (~1 fps). WebRTC upgrade planned.</p>
    </Shell>
  );
}

function SettingsModal({ employee, onClose, onSaved }: { employee: EmployeeDto; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<EmpSettings | null>(null);
  const [tab, setTab] = useState<"shot" | "track">("shot");
  useEffect(() => { api<EmpSettings>(`/employees/${employee.id}/settings`).then(setS).catch(() => setS(null)); }, [employee.id]);
  const patch = (p: Partial<EmpSettings>) => setS((c) => (c ? { ...c, ...p } : c));
  async function save() { if (!s) return; await api(`/employees/${employee.id}/settings`, { method: "PUT", body: JSON.stringify({ config: s }) }); onSaved(); onClose(); }

  return (
    <Shell onClose={onClose} maxW="max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={employee.name} />
        <div>
          <h3 className="text-lg font-bold text-gray-900">{employee.name}'s settings</h3>
          <p className="text-xs text-gray-400">Per-employee overrides · agents apply on the next heartbeat</p>
        </div>
      </div>

      <div className="mb-5 flex gap-5 border-b border-gray-200">
        <TabBtn active={tab === "shot"} onClick={() => setTab("shot")}>🖥️ Screenshot Settings</TabBtn>
        <TabBtn active={tab === "track"} onClick={() => setTab("track")}>🕒 Tracking Controls</TabBtn>
      </div>

      {!s ? (
        <p className="py-12 text-center text-sm text-gray-400">Loading…</p>
      ) : tab === "shot" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 p-5">
            <h4 className="font-bold text-gray-900">Screenshot Modes</h4>
            <p className="mb-3 text-sm text-gray-500">Choose how Eagle captures this employee's screen activity.</p>
            <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Screenshots &amp; activity are auto-pruned per your plan's retention window.</div>
            <div className="space-y-3">
              <ModeCard icon="🕒" title="Periodic screenshots" desc="Automatically captures at a fixed interval." on={s.periodicScreenshots} onChange={(v) => patch({ periodicScreenshots: v })} />
              <ModeCard icon="🔀" title="Switched app screenshots" desc="Captures when the user switches applications." on={s.appSwitchScreenshots} onChange={(v) => patch({ appSwitchScreenshots: v })} />
              <ModeCard icon="📷" title="Webcam photos" desc="Optional webcam snapshots (Windows, opt-in)." on={s.webcamPhotos} onChange={(v) => patch({ webcamPhotos: v })} />
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 p-5">
            <h4 className="font-bold text-gray-900">Interval settings</h4>
            <p className="mb-3 text-sm text-gray-500">Capture frequency and idle timeout.</p>
            <div className="space-y-3">
              <IntervalCard title="Screenshot interval" badge="Core: 10–60 min" hint="Recommended: every 30 min" value={s.screenshotIntervalMin} onChange={(v) => patch({ screenshotIntervalMin: v })} min={1} max={60} />
              <IntervalCard title="App switch capture delay" hint="Delay after an app switch" value={s.appSwitchDelayMin} onChange={(v) => patch({ appSwitchDelayMin: v })} min={1} max={30} />
              <IntervalCard title="System idle after" hint="Mark idle after no input" value={s.idleAfterMin} onChange={(v) => patch({ idleAfterMin: v })} min={1} max={60} />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <TrackCard title="Strict Time Tracking" desc="Logs the user out if the system time or timezone is changed." on={s.strictTimeTracking} onChange={(v) => patch({ strictTimeTracking: v })} />
          <TrackCard title="Silent / Hidden Mode (Restricted)" desc="ON = Silent: the agent runs fully in the background — no tray icon, employee can't pause or stop it (tamper-proof). OFF = Regular: the employee gets a system-tray icon with Clock In / Pause / Clock Out." on={s.trackingMode === "RESTRICTED"} onChange={(v) => patch({ trackingMode: v ? "RESTRICTED" : "VISIBLE" })} />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
        <button onClick={save} disabled={!s} className="rounded-lg bg-green-500 px-6 py-2 text-sm font-bold text-white hover:bg-green-600 disabled:opacity-50">Save Changes</button>
      </div>
    </Shell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`-mb-px border-b-2 px-2 py-2.5 text-sm font-semibold ${active ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{children}</button>;
}
function ModeCard({ icon, title, desc, on, onChange }: { icon: string; title: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-indigo-50/60 p-4">
      <div><div className="text-sm font-bold text-gray-900">{icon} {title}</div><div className="mt-0.5 text-xs text-gray-500">{desc}</div></div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}
function IntervalCard({ title, hint, badge, value, onChange, min, max }: { title: string; hint: string; badge?: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="rounded-xl bg-indigo-50/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
        {title} {badge && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500">{badge}</span>}
      </div>
      <div className="flex items-center justify-between">
        <Stepper value={value} onChange={onChange} min={min} max={max} />
        <span className="text-xs text-gray-400">{hint}</span>
      </div>
    </div>
  );
}
function TrackCard({ title, desc, on, onChange }: { title: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 p-5">
      <div><div className="font-bold text-gray-900">{title}</div><div className="mt-1 text-sm text-gray-500">{desc}</div></div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

/** Add + Edit employee: profile image, email, first/last name, role, department. */
function EmployeeFormModal({ employee, onClose, onSaved }: { employee?: EmployeeDto; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!employee;
  const init = employee ? splitName(employee.name) : { first: "", last: "" };
  const [first, setFirst] = useState(init.first);
  const [last, setLast] = useState(init.last);
  const [email, setEmail] = useState(employee?.email ?? "");
  const [role, setRole] = useState(employee?.role ?? "EMPLOYEE");
  const [dept, setDept] = useState(employee?.teamName ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(employee?.avatarUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const name = `${first} ${last}`.trim();

  function pick(f?: File) {
    if (!f) return;
    if (f.size > 300 * 1024) { setErr("Image too large — max 300KB."); return; }
    setErr(""); setFile(f); setPreview(URL.createObjectURL(f));
  }
  async function save() {
    if (!first.trim()) { setErr("First name is required."); return; }
    setBusy(true); setErr("");
    try {
      const body = JSON.stringify({ name, email: email.trim() || null, role, department: dept.trim() || null });
      let id = employee?.id;
      if (isEdit) await api(`/employees/${id}`, { method: "PATCH", body });
      else id = (await api<{ id: string }>("/employees", { method: "POST", body })).id;
      if (file && id) {
        const fd = new FormData(); fd.append("image", file);
        const res = await fetch(`${API_URL}/api/employees/${id}/avatar`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
        if (!res.ok) throw new Error("avatar upload failed");
      }
      onSaved();
    } catch (e: any) { let m = "Couldn't save — please try again."; try { m = JSON.parse(e.message).message || m; } catch { /* keep */ } setErr(Array.isArray(m) ? m[0] : m); }
    finally { setBusy(false); }
  }

  return (
    <Shell onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">{isEdit ? "Edit Employee" : "Add Employee"}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
      </div>

      <div className="mb-5 flex flex-col items-center gap-3 rounded-2xl bg-gray-50 py-5">
        <Avatar name={name || "?"} url={preview} size="h-20 w-20 text-2xl" />
        <button onClick={() => fileInput.current?.click()} className="rounded-lg border border-brand/40 px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5">⬆ Upload Image</button>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <p className="rounded-lg bg-white px-3 py-1.5 text-xs text-gray-400">ⓘ JPEG, PNG, WEBP · max 300KB</p>
      </div>

      <div className="space-y-3">
        <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name *"><input value={first} onChange={(e) => setFirst(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></Field>
          <Field label="Last name"><input value={last} onChange={(e) => setLast(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department"><input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g. Sales" className="w-full rounded-xl border border-gray-200 px-4 py-2.5" /></Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5">
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              <option value="TEAM_LEAD">Team Lead</option>
            </select>
          </Field>
        </div>
        <p className="text-xs text-brand">Manager: full ops admin without billing. Team Lead: monitoring &amp; reports only.</p>
      </div>

      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
        <button onClick={save} disabled={busy || !first.trim()} className="rounded-lg bg-brand px-6 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-gray-600">{label}</span>{children}</label>;
}

/** On-demand screenshot: fire the request, then show the captured image as soon as the agent uploads it. */
function ShotRequestModal({ orgId, employee, onClose }: { orgId?: string; employee: EmployeeDto; onClose: () => void }) {
  const [phase, setPhase] = useState<"waiting" | "done" | "offline" | "timeout" | "error">("waiting");
  const [shot, setShot] = useState<ScreenshotDto | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const openedAt = Date.now();
    const socket = orgId ? getSocket(orgId) : null;
    const show = (s: ScreenshotDto) => { done.current = true; setShot(s); setPhase("done"); };
    // Fetch the latest shot; accept it only if it was captured after we asked.
    const pollLatest = async (): Promise<boolean> => {
      try {
        const res = await api<Paginated<ScreenshotDto>>(`/screenshots?employeeId=${employee.id}&pageSize=1`);
        const s = res.items[0];
        if (s && new Date(s.capturedAt).getTime() >= openedAt - 3000 && !done.current) { show(s); return true; }
      } catch { /* keep waiting */ }
      return false;
    };
    const onCreated = (p: { employeeId: string }) => { if (p.employeeId === employee.id && !done.current) pollLatest(); };
    socket?.on("screenshot.created", onCreated);
    (async () => {
      try {
        const r = await api<{ reached: boolean }>(`/employees/${employee.id}/screenshot-request`, { method: "POST" });
        if (done.current) return;
        if (!r.reached) { setPhase("offline"); return; }
        // On-demand is a fast plain grab; if the socket event is missed, poll once at the deadline.
        timer = setTimeout(async () => { if (!done.current && !(await pollLatest())) setPhase("timeout"); }, 15000);
      } catch { if (!done.current) setPhase("error"); }
    })();
    return () => { done.current = true; socket?.off("screenshot.created", onCreated); if (timer) clearTimeout(timer); };
  }, [employee.id, orgId]);

  return (
    <Shell onClose={onClose} maxW="max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Screenshot request — {employee.name}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
      </div>
      {phase === "done" && shot ? (
        <>
          <img src={shot.imageUrl} alt="" className="w-full rounded-xl border border-gray-100" />
          <p className="mt-2 text-xs text-gray-400">{shot.app ?? "—"} · captured {fmtTime(shot.capturedAt)}</p>
        </>
      ) : (
        <div className="grid aspect-video place-items-center rounded-xl bg-gray-50 text-center">
          {phase === "waiting" && (
            <div className="flex flex-col items-center gap-3 text-gray-500">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand" />
              <p className="text-sm font-medium">Requesting a fresh screenshot from {employee.name}…</p>
            </div>
          )}
          {phase === "offline" && <p className="px-6 text-sm text-gray-500">{employee.name}'s agent is offline — nothing to capture right now.</p>}
          {phase === "timeout" && <p className="px-8 text-sm text-gray-500">The agent didn't respond in time — the PC may have just gone to sleep or dropped off the network. Try again in a moment; live streaming will still work.</p>}
          {phase === "error" && <p className="px-6 text-sm text-red-500">Couldn't send the request. Please try again.</p>}
        </div>
      )}
      <div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Close</button></div>
    </Shell>
  );
}

function AgentInfoModal({ employee, onClose }: { employee: EmployeeDto; onClose: () => void }) {
  const a = employee.agent;
  const rows: [string, string][] = [
    ["Status", employee.active ? employee.status : "Inactive"],
    ["Devices", String(employee.deviceCount)],
    ["Platform / OS", a?.platform ?? "Unknown"],
    ["Agent version", a?.version ?? "—"],
    ["Last seen", fmtRelative(a?.lastSeenAt ?? null)],
    ["Last screenshot", fmtRelative(employee.lastScreenshotAt)],
    ["Last app", employee.lastApp ?? "—"],
  ];
  return (
    <Shell onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-900">Agent info — {employee.name}</h3>
      <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100">
        {rows.map(([k, v]) => <div key={k} className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="text-gray-500">{k}</span><span className="font-medium text-gray-900">{v}</span></div>)}
      </div>
      <div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Close</button></div>
    </Shell>
  );
}
