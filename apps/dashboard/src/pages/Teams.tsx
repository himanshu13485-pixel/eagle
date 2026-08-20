import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { EmployeeDto } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLiveFrames } from "../lib/live";
import { fmtRelative } from "../lib/format";

interface Team { id: string; name: string; memberCount: number }
interface TeamsResponse { limit: number | null; used: number; teams: Team[] }

/* ---------- shared visuals (mirror Employees) ---------- */
const AVATAR = ["bg-red-500","bg-orange-500","bg-amber-500","bg-emerald-500","bg-teal-500","bg-sky-500","bg-indigo-500","bg-violet-500","bg-fuchsia-500","bg-rose-500"];
const initials = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?"; };
const colorFor = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR[h % AVATAR.length]; };
function Avatar({ name, url }: { name: string; url?: string | null }) {
  if (url) return <img src={url} alt={name} className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${colorFor(name)}`}>{initials(name)}</span>;
}
function StatusBadge({ active, status }: { active: boolean; status: string }) {
  if (!active) return <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500">Inactive</span>;
  const map: Record<string, string> = { ACTIVE: "bg-green-100 text-green-700", IDLE: "bg-amber-100 text-amber-700", OFFLINE: "bg-red-50 text-red-500", INVITED: "bg-indigo-100 text-indigo-600" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-500"}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}
function IconBtn({ label, onClick, disabled, tone = "text-gray-500", children }: { label: string; onClick: () => void; disabled?: boolean; tone?: string; children: ReactNode }) {
  return <button title={label} onClick={onClick} disabled={disabled} className={`grid h-8 w-8 place-items-center rounded-lg transition hover:bg-gray-100 disabled:opacity-40 ${tone}`}>{children}</button>;
}

export function Teams() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState<TeamsResponse | null>(null);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [live, setLive] = useState<EmployeeDto | null>(null);

  function load() {
    api<TeamsResponse>("/teams").then((d) => { setData(d); setSelected((cur) => cur ?? d.teams[0]?.id ?? null); });
    api<EmployeeDto[]>("/employees").then(setEmployees).catch(() => {});
  }
  useEffect(load, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);

  const team = data?.teams.find((t) => t.id === selected) ?? null;
  const members = useMemo(() => employees.filter((e) => e.teamId === selected), [employees, selected]);
  const unassigned = useMemo(() => employees.filter((e) => e.teamId !== selected), [employees, selected]);
  const filteredTeams = useMemo(() => (data?.teams ?? []).filter((t) => t.name.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const limitReached = data?.limit != null && data.used >= data.limit;

  async function addTeam() {
    if (!addName.trim() || limitReached) return;
    await api("/teams", { method: "POST", body: JSON.stringify({ name: addName.trim() }) });
    setAddName(""); load();
  }
  async function removeTeam(id: string) {
    if (!confirm("Delete this team? Members will be unassigned.")) return;
    await api(`/teams/${id}`, { method: "DELETE" });
    if (selected === id) setSelected(null);
    load();
  }
  async function assign(employeeId: string, teamId: string | null) {
    await api("/teams/assign", { method: "POST", body: JSON.stringify({ employeeId, teamId }) });
    load();
  }
  async function screenshotRequest(e: EmployeeDto) {
    const r = await api<{ reached: boolean }>(`/employees/${e.id}/screenshot-request`, { method: "POST" });
    setToast(r.reached ? `Screenshot requested from ${e.name}.` : `${e.name}'s agent is offline.`);
  }

  return (
    <div>
      <PageHeader
        title="Team Info"
        subtitle="Group employees into teams"
        action={
          <div className="flex items-center gap-2">
            <input value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTeam()} placeholder="New team name" disabled={limitReached} className="rounded-xl border border-gray-200 px-4 py-2 text-sm disabled:opacity-50" />
            <button onClick={addTeam} disabled={limitReached || !addName.trim()} className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50">+ Add Team</button>
          </div>
        }
      />

      {data?.limit != null && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${limitReached ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-500"}`}>
          {limitReached ? "Team limit reached" : "Teams"} ({data.used} of {data.limit}).{limitReached && " Upgrade your product tier to add more teams."}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* teams list */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search Team" className="mb-3 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
          {filteredTeams.length ? (
            <div className="space-y-1">
              {filteredTeams.map((t) => (
                <div key={t.id} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${selected === t.id ? "bg-brand/10" : "hover:bg-gray-50"}`}>
                  <button onClick={() => setSelected(t.id)} className="flex-1 text-left font-medium text-gray-800">
                    {t.name} <span className="text-gray-400">· {t.memberCount}</span>
                  </button>
                  <button onClick={() => removeTeam(t.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">{data?.teams.length ? "No team matches." : "List is empty."}</p>
          )}
        </div>

        {/* members */}
        <div className="rounded-2xl bg-white shadow-sm">
          {team ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                <h3 className="font-bold text-gray-900">{team.name} <span className="text-sm font-normal text-gray-400">· {members.length} member{members.length !== 1 ? "s" : ""}</span></h3>
                <select value="" onChange={(e) => e.target.value && assign(e.target.value, team.id)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                  <option value="">+ Add member…</option>
                  {unassigned.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="hidden px-5 py-3 sm:table-cell">#</th>
                      <th className="px-5 py-3">Employee name</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="hidden px-5 py-3 lg:table-cell">Last screenshot</th>
                      <th className="hidden px-5 py-3 xl:table-cell">Last app used</th>
                      <th className="px-5 py-3 text-center">Actions</th>
                      <th className="px-5 py-3 text-center">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {members.length ? members.map((m, i) => (
                      <tr key={m.id} className={`hover:bg-gray-50/60 ${m.active ? "" : "opacity-60"}`}>
                        <td className="hidden px-5 py-3 text-gray-400 sm:table-cell">{i + 1}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={m.name} url={m.avatarUrl} />
                            <div className="min-w-0"><div className="truncate font-semibold text-gray-900">{m.name}</div><div className="truncate text-xs text-gray-400">{m.email || "Employee"}</div></div>
                          </div>
                        </td>
                        <td className="px-5 py-3"><StatusBadge active={m.active} status={m.status} /></td>
                        <td className="hidden px-5 py-3 text-gray-500 lg:table-cell">{fmtRelative(m.lastScreenshotAt)}</td>
                        <td className="hidden px-5 py-3 text-gray-500 xl:table-cell">{m.lastApp ?? "—"}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-center">
                            <IconBtn label="Screenshot request" onClick={() => screenshotRequest(m)} disabled={!m.active}>📷</IconBtn>
                            <IconBtn label="Screencast (live)" onClick={() => setLive(m)} disabled={!m.active}>📡</IconBtn>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-center">
                            <IconBtn label="Visit profile" tone="text-indigo-500" onClick={() => nav(`/employees/${m.id}`)}>👤</IconBtn>
                            <IconBtn label="Remove from team" tone="text-red-500" onClick={() => assign(m.id, null)}>✕</IconBtn>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">No members yet. Add one from the dropdown above.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="py-16 text-center text-sm text-gray-400">Select or create a team.</p>
          )}
        </div>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
      {live && <LiveModal orgId={user?.orgId} emp={live} onClose={() => setLive(null)} />}
    </div>
  );
}

function LiveModal({ orgId, emp, onClose }: { orgId?: string; emp: EmployeeDto; onClose: () => void }) {
  const ids = useMemo(() => [emp.id], [emp.id]);
  const { frames, monitors, setMonitor } = useLiveFrames(orgId, ids);
  const frame = frames[emp.id];
  const monitorCount = monitors[emp.id] ?? 1;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-gray-900">Live — {emp.name}</h3>
          <div className="flex items-center gap-2">
            {monitorCount > 1 && (
              <select onChange={(e) => setMonitor(emp.id, Number(e.target.value))} defaultValue="0" className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold">
                {Array.from({ length: monitorCount }, (_, i) => <option key={i} value={i}>Monitor {i + 1}</option>)}
              </select>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
          </div>
        </div>
        <div className="grid aspect-video place-items-center overflow-hidden rounded-xl bg-black">
          {frame ? <img src={frame.data} alt="" className="h-full w-full object-contain" /> : <span className="text-sm text-gray-400">{emp.status === "OFFLINE" ? "Offline — no agent connected" : "Connecting… waiting for frames"}</span>}
        </div>
        <p className="mt-2 text-xs text-gray-400">Streams only while this window is open (~1 fps).</p>
      </div>
    </div>
  );
}
