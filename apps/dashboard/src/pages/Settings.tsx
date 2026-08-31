import { useEffect, useMemo, useState } from "react";
import { Mark } from "../components/Mark";
import type { ReactNode } from "react";
import { TrackingMode, type EmployeeDto, type TeamSnapshotReport } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { api } from "../lib/api";

interface TrackingSettings {
  periodicScreenshots: boolean;
  screenshotIntervalMin: number;
  appSwitchScreenshots: boolean;
  appSwitchDelayMin: number;
  webcamPhotos: boolean;
  screenshotMaxHeight: number;
  idleAfterMin: number;
  trackingMode: TrackingMode;
  strictTimeTracking: boolean;
  reportRecipients: string;
}

const TABS = ["Reports & Notifications", "Screenshot Settings", "Tracking Controls", "Shift", "Bulk Update", "Integrations"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = {
  "Reports & Notifications": "✉️", "Screenshot Settings": "🖥️", "Tracking Controls": "🕒",
  "Shift": "📅", "Bulk Update": "👥", "Integrations": "🔗",
};

export function Settings() {
  const [tab, setTab] = useState<Tab>("Reports & Notifications");
  return (
    <div>
      <PageHeader title="Settings" subtitle="Reports, tracking config, shifts, and integrations — these drive every agent." />
      <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {TAB_ICON[t]} {t}
          </button>
        ))}
      </div>
      {tab === "Reports & Notifications" && <ReportsTab />}
      {tab === "Screenshot Settings" && <ScreenshotTab />}
      {tab === "Tracking Controls" && <TrackingControlsTab />}
      {tab === "Shift" && <ShiftTab />}
      {tab === "Bulk Update" && <BulkTab />}
      {tab === "Integrations" && <IntegrationsTab />}
    </div>
  );
}

/* ---------------- Reports & Notifications ---------------- */
function ReportsTab() {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [emps, setEmps] = useState<EmployeeDto[]>([]);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [sendMsg, setSendMsg] = useState("");

  useEffect(() => {
    api<TrackingSettings>("/settings").then((s) => setRecipients(s.reportRecipients ? s.reportRecipients.split(",").filter(Boolean) : [])).catch(() => {});
    api<EmployeeDto[]>("/employees").then(setEmps).catch(() => {});
  }, []);

  const active = useMemo(() => emps.filter((e) => e.status === "ACTIVE" || e.status === "IDLE").length, [emps]);
  const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function add() {
    const v = email.trim().toLowerCase();
    if (!validEmail(v)) { setErr("Enter a valid email address."); return; }
    if (recipients.includes(v)) { setErr("Already added."); return; }
    if (recipients.length >= 5) { setErr("Up to 5 recipients."); return; }
    setRecipients([...recipients, v]); setEmail(""); setErr(""); setSaved(false);
  }
  async function save() {
    const res = await api<{ recipients: string[] }>("/settings/report-recipients", { method: "PUT", body: JSON.stringify({ recipients }) });
    setRecipients(res.recipients); setSaved(true);
  }
  async function sendNow() {
    setSendMsg("Sending…");
    try {
      const res = await api<{ sent: number; skipped: boolean; recipients: string[] }>("/reports/send-snapshot", { method: "POST" });
      setSendMsg(res.skipped
        ? `Report generated for ${res.recipients.length} recipient(s), but email isn't configured yet — set SMTP_* env vars to deliver it.`
        : `✓ Report emailed to ${res.sent} recipient(s).`);
    } catch (e: any) {
      let m = "Couldn't send the report."; try { m = JSON.parse(e.message).message || m; } catch { /* keep */ }
      setSendMsg(Array.isArray(m) ? m[0] : m);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
    <div className="grid gap-6 lg:grid-cols-2">
      {/* recipients */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">Report Recipients <span title="Daily/periodic reports are emailed to these addresses." className="cursor-help text-gray-300">ⓘ</span></h3>
        <label className="mt-4 block text-sm font-semibold text-gray-600">Add recipient email</label>
        <div className="mt-1 flex gap-2">
          <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Enter email address." className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
          <button onClick={add} className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark">Add</button>
        </div>
        {err ? <p className="mt-1 text-xs text-red-500">{err}</p> : <p className="mt-1 text-xs italic text-gray-400">Add up to 5 recipients who should receive these reports.</p>}

        <p className="mt-5 text-sm font-semibold text-gray-700">Recipients ({recipients.length}/5)</p>
        {recipients.length ? (
          <div className="mt-2 space-y-2">
            {recipients.map((r) => (
              <div key={r} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
                <span className="text-gray-700">{r}</span>
                <button onClick={() => { setRecipients(recipients.filter((x) => x !== r)); setSaved(false); }} className="text-xs font-semibold text-red-500 hover:underline">Remove</button>
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-gray-400">No recipients added</p>}

        <button onClick={save} className="mt-4 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-dark">Save Recipients</button>
        {saved && <p className="mt-2 text-center text-sm font-medium text-green-600">Saved.</p>}
        <button onClick={sendNow} disabled={!recipients.length} className="mt-2 w-full rounded-xl border border-brand/40 px-4 py-2.5 text-sm font-bold text-brand hover:bg-brand/5 disabled:opacity-50">✉️ Send test report now</button>
        {sendMsg && <p className="mt-2 text-center text-xs text-gray-500">{sendMsg}</p>}

        <div className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-sm">
          <p className="font-semibold text-sky-700">ⓘ Didn't receive reports?</p>
          <p className="text-sky-600">Please check your spam folder and mark Workk as safe.</p>
        </div>
      </div>

      {/* demo report preview */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Demo Report</h3>
          <button onClick={() => setShowReport(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark">View full report →</button>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-100 shadow-sm">
          {/* dark header — logo + wordmark right-aligned, like the emailed report */}
          <div className="flex items-center justify-end gap-2.5 bg-ink px-6 py-5 text-white">
            <Mark className="h-9 w-9" />
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-bold">Workk</span>
              <span className="text-[10px] tracking-wide text-gray-400">Productivity Tracking Software</span>
            </span>
          </div>
          {/* light snapshot body */}
          <div className="border-l-4 border-brand bg-indigo-50/50 px-6 py-6">
            <p className="text-lg font-black text-gray-900">Workk</p>
            <p className="mt-2 text-base font-bold text-gray-800">Team Productivity Snapshot</p>
            <p className="mt-1 text-sm text-gray-500">{today}</p>
            <p className="mt-4 text-sm text-gray-700">Active Employees: <span className="font-bold text-brand">{active} / {emps.length}</span></p>
          </div>
          <div className="bg-white px-6 py-3 text-xs text-gray-400">A full snapshot (usage, idle, top apps, attention signals) is emailed to your recipients on schedule.</div>
        </div>
      </div>
    </div>
    {showReport && <SnapshotModal onClose={() => setShowReport(false)} />}
    </>
  );
}

/* ---------------- Team Productivity Snapshot (full emailed report) ---------------- */
function fmtDur(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
const GRADE_STYLE: Record<string, string> = { A: "bg-green-100 text-green-700", B: "bg-lime-100 text-lime-700", C: "bg-amber-100 text-amber-700", D: "bg-orange-100 text-orange-700", E: "bg-red-100 text-red-600" };

function SnapshotModal({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<TeamSnapshotReport | null>(null);
  useEffect(() => { api<TeamSnapshotReport>("/reports/team-snapshot").then(setD).catch(() => setD(null)); }, []);
  const range = d ? `${d.from.slice(0, 10)} → ${d.to.slice(0, 10)}` : "";

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between bg-ink px-6 py-5 text-white">
          <span className="text-sm text-gray-400">Team Productivity Snapshot · {range}</span>
          <div className="flex items-center gap-2.5">
            <span className="flex flex-col items-end leading-tight">
              <span className="text-lg font-bold">Workk</span>
              <span className="text-[10px] tracking-wide text-gray-400">Productivity Tracking Software</span>
            </span>
            <Mark className="h-9 w-9" />
          </div>
        </div>

        {!d ? (
          <p className="py-20 text-center text-gray-400">Generating report…</p>
        ) : (
          <div className="max-h-[75vh] overflow-y-auto px-6 py-6">
            {/* summary */}
            <div className="rounded-2xl border-l-4 border-brand bg-indigo-50/50 p-5">
              <p className="text-lg font-black text-gray-900">Team Productivity Snapshot</p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p>Active Employees: <b>{d.activeEmployees} / {d.totalEmployees}</b></p>
                <p>Team Activity Score: <b className="text-brand">{d.activityScorePct}%</b></p>
                <p>Total Time Tracked: <b>{d.totalTrackedHours} hours</b></p>
                <p className="text-gray-500">Active: <b className="text-green-600">{d.activeHours}h</b> · Idle: <b className="text-amber-600">{d.idleHours}h</b></p>
              </div>
            </div>

            <Section title="Top Distractions">
              <SnapTable head={["Domain", "Total Time", "Top Contributors"]} rows={d.topDistractions} empty="No distracting-site activity in this window. 🎉" />
            </Section>
            <Section title="Top 5 Apps">
              <SnapTable head={["App Name", "Total Time", "Top Contributors"]} rows={d.topApps} empty="No app activity yet." />
            </Section>
            <Section title="Top 5 Websites">
              <SnapTable head={["Website", "Total Time", "Top Contributors"]} rows={d.topWebsites} empty="No website activity yet." />
            </Section>

            <Section title="Team Performance Highlights">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Total Hours</th><th className="px-4 py-2.5">Focus</th><th className="px-4 py-2.5">Context Switches</th><th className="px-4 py-2.5">Peak Hour</th><th className="px-4 py-2.5">Major Activities</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {d.highlights.length ? d.highlights.map((h) => (
                      <tr key={h.employeeId} className="align-top hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{h.name}</td>
                        <td className="px-4 py-2.5">{h.totalHours}</td>
                        <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_STYLE[h.focusScore] ?? "bg-gray-100 text-gray-500"}`}>{h.focusScore}</span></td>
                        <td className="px-4 py-2.5 text-gray-600">{h.contextSwitches}</td>
                        <td className="px-4 py-2.5 text-gray-600">{h.peakHour}</td>
                        <td className="px-4 py-2.5 text-gray-500">{h.majorActivities.length ? h.majorActivities.map((a) => `${a.name} (${fmtDur(a.sec)})`).join(", ") : "No major activities > 30 mins"}</td>
                      </tr>
                    )) : <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No employee activity in this window.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}
        <div className="flex justify-end border-t border-gray-100 px-6 py-4"><button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Close</button></div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mt-6"><h4 className="mb-2 font-bold text-gray-900">{title}</h4>{children}</div>;
}
function SnapTable({ head, rows, empty }: { head: string[]; rows: { name: string; totalSec: number; contributors: { name: string; sec: number }[] }[]; empty: string }) {
  if (!rows.length) return <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>{head.map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.name} className="hover:bg-gray-50/60">
              <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
              <td className="px-4 py-2.5 text-gray-700">{fmtDur(r.totalSec)}</td>
              <td className="px-4 py-2.5 text-gray-500">{r.contributors.map((c) => `${c.name} (${fmtDur(c.sec)})`).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Screenshot Settings ---------------- */
// Stored screenshots are downscaled to this height. Native looks best but a 4K
// screen costs roughly four times a 1080p one against the plan's storage quota.
const RESOLUTIONS = [
  { value: 720, label: "720p (smallest)" },
  { value: 1080, label: "1080p — Full HD (recommended)" },
  { value: 1440, label: "1440p" },
  { value: 2160, label: "2160p — 4K" },
  { value: 0, label: "Native screen resolution" },
];

function useSettings() {
  const [s, setS] = useState<TrackingSettings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api<TrackingSettings>("/settings").then(setS).catch(() => setS(null)); }, []);
  const patch = (p: Partial<TrackingSettings>) => { setS((c) => (c ? { ...c, ...p } : c)); setSaved(false); };
  async function save(fields: Partial<TrackingSettings>) { await api("/settings", { method: "PUT", body: JSON.stringify(fields) }); setSaved(true); }
  return { s, patch, save, saved };
}

function ScreenshotTab() {
  const { s, patch, save, saved } = useSettings();
  if (!s) return <div className="text-gray-400">Loading settings…</div>;
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Screenshot Modes" desc="Choose how Workk captures screen activity.">
          <Row title="Periodic Screenshots" desc="Captures at a fixed interval."><Toggle on={s.periodicScreenshots} onChange={(v) => patch({ periodicScreenshots: v })} /></Row>
          <Row title="Switched App Screenshots" desc="Captures on app switch."><Toggle on={s.appSwitchScreenshots} onChange={(v) => patch({ appSwitchScreenshots: v })} /></Row>
          <Row title="Webcam Photos" desc="Optional webcam snapshots (opt-in)."><Toggle on={s.webcamPhotos} onChange={(v) => patch({ webcamPhotos: v })} /></Row>
        </Card>
        <Card title="Interval Settings" desc="Capture frequency and idle timeout.">
          <Field label="Screenshot interval"><Stepper value={s.screenshotIntervalMin} onChange={(v) => patch({ screenshotIntervalMin: v })} min={1} max={60} /></Field>
          <Field label="App switch capture delay"><Stepper value={s.appSwitchDelayMin} onChange={(v) => patch({ appSwitchDelayMin: v })} min={1} max={30} /></Field>
          <Field label="Mark user idle after"><Stepper value={s.idleAfterMin} onChange={(v) => patch({ idleAfterMin: v })} min={1} max={60} /></Field>
        </Card>
        <Card title="Image Quality" desc="Capture resolution — the main lever on how fast you use your plan's storage.">
          <Field label="Screenshot resolution">
            <select
              value={s.screenshotMaxHeight}
              onChange={(e) => patch({ screenshotMaxHeight: Number(e.target.value) })}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
            >
              {RESOLUTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          <p className="text-xs text-gray-400">
            Taller screens are scaled down to this height; anything already shorter is left alone,
            and multi-monitor width is preserved. Agents pick the change up on their next heartbeat.
          </p>
        </Card>
      </div>
      <SaveBar saved={saved} onSave={() => save({ periodicScreenshots: s.periodicScreenshots, appSwitchScreenshots: s.appSwitchScreenshots, webcamPhotos: s.webcamPhotos, screenshotIntervalMin: s.screenshotIntervalMin, appSwitchDelayMin: s.appSwitchDelayMin, idleAfterMin: s.idleAfterMin, screenshotMaxHeight: s.screenshotMaxHeight })} />
    </>
  );
}

/* ---------------- Tracking Controls ---------------- */
function TrackingControlsTab() {
  const { s, patch, save, saved } = useSettings();
  if (!s) return <div className="text-gray-400">Loading settings…</div>;
  const silent = s.trackingMode === TrackingMode.RESTRICTED;
  return (
    <>
      <div className="max-w-2xl space-y-4">
        <TrackCard title="Strict Time Tracking" desc="Logs the session out if the system clock or timezone is changed — prevents time fudging." on={s.strictTimeTracking} onChange={(v) => patch({ strictTimeTracking: v })} />
        <TrackCard
          title="Silent / Hidden Mode (Restricted)"
          desc={silent
            ? "ON — Silent: the agent runs fully in the background. No tray icon; the employee can't pause or stop it (tamper-proof)."
            : "OFF — Regular: the employee gets a system-tray icon with Clock In / Pause / Clock Out. Turn ON for silent, tamper-proof tracking."}
          on={silent}
          onChange={(v) => patch({ trackingMode: v ? TrackingMode.RESTRICTED : TrackingMode.VISIBLE })}
        />
      </div>
      <SaveBar saved={saved} onSave={() => save({ strictTimeTracking: s.strictTimeTracking, trackingMode: s.trackingMode })} />
    </>
  );
}

/* ---------------- Integrations ---------------- */
interface Channel { id: string; type: "TELEGRAM" | "WHATSAPP"; target: string; label: string | null; active: boolean }
interface ChannelsResp { channels: Channel[]; providers: { telegram: boolean; whatsapp: boolean } }

function IntegrationsTab() {
  const [data, setData] = useState<ChannelsResp | null>(null);
  const [note, setNote] = useState("");
  function load() { api<ChannelsResp>("/settings/channels").then(setData).catch(() => setData({ channels: [], providers: { telegram: false, whatsapp: false } })); }
  useEffect(load, []);

  async function remove(id: string) { await api(`/settings/channels/${id}`, { method: "DELETE" }); load(); }
  async function test(id: string) {
    setNote("");
    try {
      const r = await api<{ dry: boolean; message: string }>(`/settings/channels/${id}/test`, { method: "POST" });
      setNote(r.message);
    } catch (e) { setNote(e instanceof Error ? e.message : "Test failed"); }
  }

  const providers = data?.providers ?? { telegram: false, whatsapp: false };
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-600">Fan out client notifications to <b>Telegram</b> and <b>WhatsApp</b>. Register recipients below; when your account manager sends you an announcement they can also push it to these channels. Scheduled reports continue to go to your email <span className="font-medium">Report Recipients</span> (under Reports &amp; Notifications).</p>
      </div>

      <ChannelCard
        icon="✈️" name="Telegram" live={providers.telegram}
        placeholder="Chat ID (e.g. 123456789 or -1001234567890 for a group)"
        hint="Start a chat with your bot (or add it to a group), then paste the chat ID. Find it via @userinfobot."
        type="TELEGRAM" channels={(data?.channels ?? []).filter((c) => c.type === "TELEGRAM")}
        onChange={load} onRemove={remove} onTest={test}
      />
      <ChannelCard
        icon="🟢" name="WhatsApp" live={providers.whatsapp}
        placeholder="Phone in E.164 (e.g. +15551234567)"
        hint="Uses the WhatsApp Cloud API. Numbers must have opted in to receive messages from your business number."
        type="WHATSAPP" channels={(data?.channels ?? []).filter((c) => c.type === "WHATSAPP")}
        onChange={load} onRemove={remove} onTest={test}
      />
      {note && <p className="text-sm font-medium text-brand">{note}</p>}
    </div>
  );
}

function ChannelCard({ icon, name, live, placeholder, hint, type, channels, onChange, onRemove, onTest }: {
  icon: string; name: string; live: boolean; placeholder: string; hint: string; type: "TELEGRAM" | "WHATSAPP";
  channels: Channel[]; onChange: () => void; onRemove: (id: string) => void; onTest: (id: string) => void;
}) {
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");
  async function add() {
    setErr("");
    if (!target.trim()) return;
    try {
      await api("/settings/channels", { method: "POST", body: JSON.stringify({ type, target: target.trim(), label: label.trim() || undefined }) });
      setTarget(""); setLabel(""); onChange();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to add"); }
  }
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gray-100 text-lg">{icon}</span><span className="font-bold text-gray-900">{name}</span></span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${live ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{live ? "Live" : "Dry mode"}</span>
      </div>
      <p className="mt-2 text-xs text-gray-500">{hint}</p>
      {!live && <p className="mt-1 text-xs text-amber-600">No provider credentials on the server yet — test sends are logged, not delivered.</p>}

      {channels.length > 0 && (
        <div className="mt-4 space-y-2">
          {channels.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
              <div><p className="font-mono text-sm text-gray-900">{c.target}</p>{c.label && <p className="text-xs text-gray-500">{c.label}</p>}</div>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => onTest(c.id)} className="font-semibold text-brand hover:underline">Send test</button>
                <button onClick={() => onRemove(c.id)} className="text-red-500 hover:underline">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={placeholder} className="min-w-[220px] flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className="w-40 rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
        <button onClick={add} className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">Add</button>
      </div>
      {err && <p className="mt-2 text-sm text-red-500">{err}</p>}
    </div>
  );
}

function SaveBar({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-3">
      {saved && <span className="text-sm font-medium text-green-600">Saved — agents pick this up on next heartbeat.</span>}
      <button onClick={onSave} className="rounded-xl bg-green-500 px-6 py-3 font-bold text-white hover:bg-green-600">Save Changes</button>
    </div>
  );
}

/* ---------------- Shift ---------------- */
interface Shift { id: string; name: string; timezone: string; startTime: string; endTime: string; workingDays: number[] }
const DAYS = [{ n: 1, l: "Mon" }, { n: 2, l: "Tue" }, { n: 3, l: "Wed" }, { n: 4, l: "Thu" }, { n: 5, l: "Fri" }, { n: 6, l: "Sat" }, { n: 7, l: "Sun" }];

function ShiftTab() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [f, setF] = useState({ name: "", timezone: "UTC", startTime: "09:00", endTime: "17:00", workingDays: [1, 2, 3, 4, 5] });
  function load() { api<Shift[]>("/shifts").then(setShifts).catch(() => setShifts([])); }
  useEffect(load, []);
  const toggleDay = (n: number) => setF((c) => ({ ...c, workingDays: c.workingDays.includes(n) ? c.workingDays.filter((d) => d !== n) : [...c.workingDays, n].sort() }));
  async function create() { if (!f.name.trim()) return; await api("/shifts", { method: "POST", body: JSON.stringify(f) }); setF({ name: "", timezone: "UTC", startTime: "09:00", endTime: "17:00", workingDays: [1, 2, 3, 4, 5] }); load(); }
  async function remove(id: string) { await api(`/shifts/${id}`, { method: "DELETE" }); load(); }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 font-bold text-gray-900">Shift Management</h3>
        {shifts.length ? (
          <div className="space-y-2">
            {shifts.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
                <div><p className="font-semibold text-gray-900">{s.name}</p><p className="text-xs text-gray-500">{s.startTime}–{s.endTime} · {s.timezone} · {s.workingDays.map((d) => DAYS.find((x) => x.n === d)?.l).join(" ")}</p></div>
                <button onClick={() => remove(s.id)} className="text-xs text-red-500 hover:underline">Delete</button>
              </div>
            ))}
          </div>
        ) : <p className="py-12 text-center text-sm text-gray-400">No shifts created yet.</p>}
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 font-bold text-gray-900">Create Shift</h3>
        <div className="space-y-3">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Shift name (e.g. Morning Shift)" className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
          <input value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} placeholder="Timezone (e.g. Asia/Kolkata)" className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
          <div className="flex gap-2">
            <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => <button key={d.n} onClick={() => toggleDay(d.n)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${f.workingDays.includes(d.n) ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}>{d.l}</button>)}
          </div>
          <button onClick={create} className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark">+ Create Shift</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Bulk Update ---------------- */
function BulkTab() {
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cfg, setCfg] = useState({ periodicScreenshots: true, screenshotIntervalMin: 10, appSwitchScreenshots: true, idleAfterMin: 5, trackingMode: TrackingMode.VISIBLE });
  const [msg, setMsg] = useState("");
  useEffect(() => { api<EmployeeDto[]>("/employees").then(setEmployees).catch(() => {}); }, []);
  const toggle = (id: string) => setSel((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const all = () => setSel((c) => (c.size === employees.length ? new Set() : new Set(employees.map((e) => e.id))));
  async function apply() { if (!sel.size) return; const res = await api<{ updated: number }>("/settings/bulk", { method: "POST", body: JSON.stringify({ employeeIds: [...sel], config: cfg }) }); setMsg(`Applied to ${res.updated} employee(s). Agents update on next heartbeat.`); }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Select employees <span className="text-xs font-normal text-gray-400">({sel.size}/{employees.length})</span></h3>
          <button onClick={all} className="text-sm font-semibold text-brand">{sel.size === employees.length ? "Clear" : "Select all"}</button>
        </div>
        <div className="max-h-[55vh] space-y-1 overflow-y-auto">
          {employees.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-gray-50">
              <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-indigo-600" />{e.name}
            </label>
          ))}
          {!employees.length && <p className="py-8 text-center text-sm text-gray-400">No employees.</p>}
        </div>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 font-bold text-gray-900">Configuration to apply</h3>
        <div className="space-y-4">
          <Row title="Periodic Screenshots" desc="Captures at a fixed interval."><Toggle on={cfg.periodicScreenshots} onChange={(v) => setCfg({ ...cfg, periodicScreenshots: v })} /></Row>
          <Row title="App-switch Screenshots" desc="Capture on app switch."><Toggle on={cfg.appSwitchScreenshots} onChange={(v) => setCfg({ ...cfg, appSwitchScreenshots: v })} /></Row>
          <Field label="Screenshot interval"><Stepper value={cfg.screenshotIntervalMin} onChange={(v) => setCfg({ ...cfg, screenshotIntervalMin: v })} min={1} max={60} /></Field>
          <Field label="Mark idle after"><Stepper value={cfg.idleAfterMin} onChange={(v) => setCfg({ ...cfg, idleAfterMin: v })} min={1} max={60} /></Field>
          <Row title="Silent / Hidden Mode" desc="Background, no tray, no manual stop."><Toggle on={cfg.trackingMode === TrackingMode.RESTRICTED} onChange={(v) => setCfg({ ...cfg, trackingMode: v ? TrackingMode.RESTRICTED : TrackingMode.VISIBLE })} /></Row>
        </div>
        {msg && <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}
        <button onClick={apply} disabled={!sel.size} className="mt-4 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50">Apply to {sel.size} employee{sel.size === 1 ? "" : "s"}</button>
      </div>
    </div>
  );
}

/* ---------------- shared UI ---------------- */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button onClick={() => onChange(!on)} className={`relative h-7 w-12 rounded-full transition ${on ? "bg-brand" : "bg-gray-300"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${on ? "left-6" : "left-1"}`} /></button>;
}
function Stepper({ value, onChange, min = 1, max = 60, unit = "min" }: { value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600">–</button>
      <div className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-center text-sm font-semibold">{value} <span className="text-gray-400">{unit}</span></div>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600">+</button>
    </div>
  );
}
function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return <div className="flex items-start justify-between gap-4 rounded-xl bg-gray-50 p-4"><div><div className="text-sm font-semibold text-gray-800">{title}</div><div className="text-xs text-gray-500">{desc}</div></div>{children}</div>;
}
function TrackCard({ title, desc, on, onChange }: { title: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div><div className="font-bold text-gray-900">{title}</div><div className="mt-1 text-sm text-gray-500">{desc}</div></div><Toggle on={on} onChange={onChange} /></div>;
}
function Card({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return <div className="rounded-2xl bg-white p-6 shadow-sm"><h3 className="text-lg font-bold text-gray-900">{title}</h3><p className="mt-1 text-sm text-gray-500">{desc}</p><div className="mt-5 space-y-5">{children}</div></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="text-sm font-semibold text-gray-700">{label}</div><div className="mt-2">{children}</div></div>;
}
