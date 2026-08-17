import { SnapshotRow, TeamSnapshotReport } from "@eagle/shared";

const BRAND = "#5459d1";
const INK = "#0f1222";

function fmtDur(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const gradeColor: Record<string, string> = { A: "#16a34a", B: "#65a30d", C: "#d97706", D: "#ea580c", E: "#dc2626" };

function rowsTable(title: string, head: string[], rows: SnapshotRow[]): string {
  const body = rows.length
    ? rows
        .map(
          (r) => `<tr>
        <td style="padding:8px 12px;border-top:1px solid #eee;font-weight:600;color:#111">${esc(r.name)}</td>
        <td style="padding:8px 12px;border-top:1px solid #eee;color:#333;white-space:nowrap">${fmtDur(r.totalSec)}</td>
        <td style="padding:8px 12px;border-top:1px solid #eee;color:#666">${r.contributors.map((c) => `${esc(c.name)} (${fmtDur(c.sec)})`).join(", ") || "—"}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" style="padding:16px;text-align:center;color:#999">No data in this window.</td></tr>`;
  return `<h3 style="margin:24px 0 8px;font-size:15px;color:#111">${title}</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #eee;border-radius:8px;overflow:hidden">
    <thead><tr style="background:#f7f7f9">${head.map((h) => `<th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#777">${h}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

/** Self-contained HTML for the Team Productivity Snapshot email (inline styles for email clients). */
export function renderTeamSnapshotHtml(r: TeamSnapshotReport): string {
  const highlights = r.highlights.length
    ? r.highlights
        .map(
          (h) => `<tr>
      <td style="padding:8px 12px;border-top:1px solid #eee;font-weight:600;color:#111">${esc(h.name)}</td>
      <td style="padding:8px 12px;border-top:1px solid #eee">${h.totalHours}</td>
      <td style="padding:8px 12px;border-top:1px solid #eee"><span style="background:${gradeColor[h.focusScore] ?? "#888"};color:#fff;border-radius:99px;padding:2px 8px;font-weight:700;font-size:11px">${h.focusScore}</span></td>
      <td style="padding:8px 12px;border-top:1px solid #eee;color:#555">${h.contextSwitches}</td>
      <td style="padding:8px 12px;border-top:1px solid #eee;color:#555">${h.peakHour}</td>
      <td style="padding:8px 12px;border-top:1px solid #eee;color:#666">${h.majorActivities.length ? h.majorActivities.map((a) => `${esc(a.name)} (${fmtDur(a.sec)})`).join(", ") : "No major activities &gt; 30 mins"}</td>
    </tr>`,
        )
        .join("")
    : `<tr><td colspan="6" style="padding:16px;text-align:center;color:#999">No employee activity in this window.</td></tr>`;

  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:760px;margin:0 auto;padding:24px 12px">
    <div style="background:${INK};color:#fff;border-radius:12px 12px 0 0;padding:20px 24px;text-align:right">
      <div style="font-size:18px;font-weight:800">Eagle<span style="color:${BRAND}">See</span></div>
      <div style="font-size:10px;color:#9aa0b4;letter-spacing:.04em">Productivity Tracking Software</div>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px">
      <div style="border-left:4px solid ${BRAND};background:#eef0fb;border-radius:10px;padding:16px 18px">
        <div style="font-size:18px;font-weight:800">Team Productivity Snapshot</div>
        <div style="color:#666;font-size:12px;margin-top:2px">${r.from.slice(0, 10)} → ${r.to.slice(0, 10)}</div>
        <div style="margin-top:12px;font-size:13px;line-height:1.9">
          Active Employees: <b>${r.activeEmployees} / ${r.totalEmployees}</b><br>
          Total Time Tracked: <b>${r.totalTrackedHours} hours</b> &nbsp;·&nbsp; Active: <b style="color:#16a34a">${r.activeHours}h</b> &nbsp;·&nbsp; Idle: <b style="color:#d97706">${r.idleHours}h</b><br>
          Team Activity Score: <b style="color:${BRAND}">${r.activityScorePct}%</b>
        </div>
      </div>

      ${rowsTable("Top Distractions", ["Domain", "Total Time", "Top Contributors"], r.topDistractions)}
      ${rowsTable("Top 5 Apps", ["App Name", "Total Time", "Top Contributors"], r.topApps)}
      ${rowsTable("Top 5 Websites", ["Website", "Total Time", "Top Contributors"], r.topWebsites)}

      <h3 style="margin:24px 0 8px;font-size:15px;color:#111">Team Performance Highlights</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #eee;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f7f7f9">
          ${["Name", "Total Hours", "Focus", "Context Switches", "Peak Hour", "Major Activities"].map((h) => `<th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#777">${h}</th>`).join("")}
        </tr></thead>
        <tbody>${highlights}</tbody>
      </table>

      <p style="margin-top:24px;color:#999;font-size:12px">You're receiving this because your email was added as a report recipient in EagleSee → Settings → Reports &amp; Notifications.</p>
    </div>
  </div>
</body></html>`;
}
