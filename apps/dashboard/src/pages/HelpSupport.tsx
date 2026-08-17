import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "../components/Layout";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";

interface SupportRequest {
  id: string; requestId: string; kind: string; subject: string;
  createdBy: string | null; status: string; createdAt: string; updatedAt: string;
}

const KIND_META: Record<string, { label: string; style: string; icon: string }> = {
  SUPPORT: { label: "Support", style: "bg-indigo-100 text-indigo-700", icon: "❓" },
  DEMO: { label: "Demo", style: "bg-blue-100 text-blue-700", icon: "▶️" },
  FEEDBACK: { label: "Feedback", style: "bg-green-100 text-green-700", icon: "💬" },
};
const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-700", IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-green-100 text-green-700", CLOSED: "bg-gray-100 text-gray-500",
};
const cap = (s: string) => s.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

const FAQ_CATS = ["All", "Installation/Uninstallation", "Teams & Roles", "Monitoring", "Reports", "Billing & Integration"] as const;
const FAQ: { cat: string; icon: string; q: string; a: string }[] = [
  { cat: "Installation/Uninstallation", icon: "🖥️", q: "I've added employees but there's no data — why?", a: "The agent isn't installed yet. A new employee shows as \"Invited\" until their machine runs the installer. Open Employees → click the download (⬇) icon to generate that person's installer, then run it on their PC." },
  { cat: "Installation/Uninstallation", icon: "📄", q: "Installation instructions for Windows & Mac", a: "Windows: run the generated .bat as administrator — it installs hidden, auto-starts at logon, adds a Defender exclusion for its own folder, and enrolls. macOS: run the .command (right-click → Open the first time), then grant Screen Recording under System Settings › Privacy & Security." },
  { cat: "Installation/Uninstallation", icon: "🧹", q: "How do I uninstall the agent (including hidden mode)?", a: "Employees → ⋯ (More) → Uninstaller. Run the downloaded file on the PC; it stops and removes the agent and auto-deactivates that employee so the seat frees up while the data is kept." },
  { cat: "Installation/Uninstallation", icon: "🔄", q: "Offline tracking with auto-sync", a: "If the PC loses internet, the agent keeps capturing screenshots and activity to a local buffer and replays everything automatically once it reconnects — no data is lost." },
  { cat: "Monitoring", icon: "🕵️", q: "What is Restricted (invisible) tracking and how do I enable it?", a: "Employees → ⚙ Individual settings → Tracking Controls → Auto Tracking (Restricted/Hidden). It runs in the background with no window and can't be manually stopped. Use it only where it is lawful and disclosed to employees." },
  { cat: "Monitoring", icon: "📸", q: "How do I request a screenshot or screencast of an employee?", a: "On the Employees row, 📷 Screenshot request captures a fresh shot on demand and shows it to you; 📡 Screencast opens a live view. Live streaming runs only while the window is open." },
  { cat: "Monitoring", icon: "📽️", q: "How do I review an employee's whole day?", a: "Work Replay → pick the employee and date. Their day is laid out by part-of-day → hourly slots → the individual captures, with usage/idle per slot." },
  { cat: "Monitoring", icon: "⚙️", q: "How do I change a specific employee's settings?", a: "Employees → ⚙ Individual settings. You can set screenshot modes and intervals, the idle threshold, and tracking mode per person — overrides apply on the agent's next heartbeat." },
  { cat: "Teams & Roles", icon: "👥", q: "How do I create teams?", a: "Teams → type a team name → + Add Team, then add members from the dropdown. You can also set an employee's Department while adding or editing them, which places them in that team." },
  { cat: "Teams & Roles", icon: "🪪", q: "Employee roles and what they mean", a: "When adding or editing an employee you can set a role: Employee, Manager, or Team Lead. It's a designation shown across the app for organizing your workforce." },
  { cat: "Teams & Roles", icon: "🔑", q: "How do employees receive their credentials?", a: "They don't — monitored employees never log in. Only managers use the dashboard. The agent enrolls silently using a one-time token baked into its installer, so there's no employee password to distribute." },
  { cat: "Reports", icon: "📊", q: "How do I see hours worked for everyone on a given day?", a: "Reports → Timesheet → Day-wise, then pick the date. You'll get every employee's first/last activity, usage, idle, offline, and tracked time, with a totals row." },
  { cat: "Reports", icon: "📅", q: "How do I see one employee's hours over a custom range?", a: "Reports → Timesheet → User-wise. Choose the employee and a date range to get a per-day breakdown, or switch the breakdown to By App / By Website." },
  { cat: "Billing & Integration", icon: "💳", q: "How do I buy or extend my plan?", a: "Open Billing to see your tier and seats. Higher tiers raise limits like team count, data-request length, and retention windows." },
  { cat: "Billing & Integration", icon: "🗄️", q: "How long is my data kept, and can I export or delete it?", a: "Screenshots and activity are auto-pruned per your tier's retention window; the cleanups are logged under Data Management → Show automated jobs. You can also request a manual export or deletion for a user/team and date range from Data Management." },
];

export function HelpSupport() {
  const [tab, setTab] = useState<"requests" | "faq">("requests");
  const [reqs, setReqs] = useState<SupportRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<string>("All");
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: "SUPPORT", subject: "", description: "", contactName: "", contactPhone: "", contactEmail: "" });

  function load() { api<SupportRequest[]>("/support").then(setReqs).catch(() => setReqs([])); }
  useEffect(load, []);

  const canSubmit = form.subject.trim() && form.description.trim();
  async function submit() {
    if (!canSubmit) return;
    await api("/support", { method: "POST", body: JSON.stringify(form) });
    setOpen(false);
    setForm({ kind: "SUPPORT", subject: "", description: "", contactName: "", contactPhone: "", contactEmail: "" });
    load();
  }

  const faqs = FAQ.filter((f) => cat === "All" || f.cat === cat);

  return (
    <div>
      <PageHeader
        title="Help & Support"
        action={<button onClick={() => setOpen(true)} className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-dark">+ Add Request</button>}
      />

      <div className="mb-5 flex gap-2 border-b border-gray-200">
        <TabBtn active={tab === "requests"} onClick={() => setTab("requests")}>🗂 My Requests</TabBtn>
        <TabBtn active={tab === "faq"} onClick={() => setTab("faq")}>❓ FAQ's</TabBtn>
      </div>

      {tab === "requests" ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">#</th><th className="px-5 py-3">Request ID</th><th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Subject</th><th className="px-5 py-3">Created By</th><th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Created On</th><th className="px-5 py-3">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reqs.length ? reqs.map((r, i) => {
                const k = KIND_META[r.kind] ?? { label: r.kind, style: "bg-gray-100 text-gray-600", icon: "" };
                return (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-600">{r.requestId}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${k.style}`}>{k.icon} {k.label}</span></td>
                    <td className="px-5 py-3 font-medium text-gray-900">{r.subject}</td>
                    <td className="px-5 py-3 text-gray-500">{r.createdBy ?? "—"}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? "bg-gray-100 text-gray-500"}`}>{cap(r.status)}</span></td>
                    <td className="px-5 py-3 text-gray-500">{fmtDate(r.createdAt)}</td>
                    <td className="px-5 py-3 text-gray-500">{fmtDate(r.updatedAt)}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={8} className="px-5 py-16 text-center text-gray-400">List is empty.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <h3 className="mb-3 text-lg font-bold text-gray-900">Frequently Asked Questions</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            {FAQ_CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${cat === c ? "bg-brand text-white" : "bg-white text-gray-600 shadow-sm hover:bg-gray-50"}`}>{c}</button>
            ))}
          </div>
          <div className="space-y-2">
            {faqs.map((f) => {
              const isOpen = openFaq === f.q;
              return (
                <div key={f.q} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  <button onClick={() => setOpenFaq(isOpen ? null : f.q)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-base">{f.icon}</span>
                    <span className="flex-1 font-semibold text-gray-900">{f.q}</span>
                    <span className={`shrink-0 text-gray-400 transition ${isOpen ? "rotate-180" : ""}`}>▾</span>
                  </button>
                  {isOpen && <p className="border-t border-gray-100 px-5 py-4 pl-[4.25rem] text-sm leading-relaxed text-gray-600">{f.a}</p>}
                </div>
              );
            })}
            {!faqs.length && <p className="py-10 text-center text-sm text-gray-400">No FAQs in this category.</p>}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Support Request</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <div className="mt-4 flex gap-5 border-b border-gray-200">
              {(["SUPPORT", "DEMO", "FEEDBACK"] as const).map((k) => (
                <button key={k} onClick={() => setForm({ ...form, kind: k })} className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 py-2 text-sm font-semibold ${form.kind === k ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  {KIND_META[k].icon} {KIND_META[k].label}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject*" className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description*" rows={4} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Contact Name" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
                <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="Contact Phone" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
              </div>
              <input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="Contact Email" className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
              <button onClick={submit} disabled={!canSubmit} className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50">Submit Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold ${active ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{children}</button>;
}
