/**
 * Renders realistic-looking fake "captured screenshot" images for the demo
 * seed (seed-demo.ts) — one PNG per app/site name in its catalog. Each is a
 * small hand-built HTML mockup (not the real app) rendered through Playwright,
 * wrapped in a window/browser chrome so it reads as a genuine screen capture
 * rather than a solid color block.
 *
 * Run with: npm run demo:screenshots   (from apps/api)
 * Output:   prisma/demo-assets/screenshots/<slug>.png
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const OUT_DIR = join(__dirname, "screenshots");
const WIDTH = 1440;
const HEIGHT = 900;

// ============================================================================
// Shared chrome — a maximized "window" filling the whole capture, exactly how
// a real periodic screenshot looks when a full-screen app or browser has focus.
// ============================================================================
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  .window { width: 100%; height: 100%; display: flex; flex-direction: column; background: #fff; }
  .titlebar { height: 34px; flex: 0 0 34px; display: flex; align-items: center; padding: 0 12px; background: #e8e8ea; border-bottom: 1px solid #d0d0d3; }
  .titlebar.dark { background: #232326; border-bottom: 1px solid #000; }
  .dots { display: flex; gap: 7px; margin-right: 14px; }
  .dots span { width: 11px; height: 11px; border-radius: 50%; display: block; }
  .dots .r { background: #ff5f57; } .dots .y { background: #febc2e; } .dots .g { background: #28c840; }
  .wintitle { font-size: 12.5px; color: #55555a; font-weight: 600; flex: 1; text-align: center; margin-right: 60px; }
  .titlebar.dark .wintitle { color: #cfcfd2; }
  .urlbar { flex: 1; background: #fff; border-radius: 14px; padding: 5px 14px; font-size: 12.5px; color: #3c4043; display: flex; align-items: center; gap: 6px; max-width: 640px; margin: 0 auto; border: 1px solid #d5d5d8; }
  .titlebar.dark .urlbar { background: #3c3c40; color: #ddd; border-color: #000; }
  .content { flex: 1; min-height: 0; display: flex; overflow: hidden; position: relative; background: #fff; }
  .content.dark { background: #1e1e1e; color: #ddd; }
  .row { display: flex; } .col { display: flex; flex-direction: column; }
  .avatar { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex: 0 0 30px; }
  .pill { padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .btn { padding: 7px 16px; border-radius: 7px; font-size: 12.5px; font-weight: 600; display: inline-block; }
  .scroll { overflow: hidden; }
  ::-webkit-scrollbar { display: none; }
`;

function shell(titleOrUrl: string, isWeb: boolean, dark: boolean, innerHtml: string, extraCss = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_CSS}${extraCss}</style></head>
  <body>
    <div class="window">
      <div class="titlebar ${dark ? "dark" : ""}">
        <div class="dots"><span class="r"></span><span class="y"></span><span class="g"></span></div>
        ${isWeb ? `<div class="urlbar">🔒 ${titleOrUrl}</div>` : `<div class="wintitle">${titleOrUrl}</div>`}
      </div>
      <div class="content ${dark ? "dark" : ""}">${innerHtml}</div>
    </div>
  </body></html>`;
}

const initials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899"];
const avatar = (name: string, i = 0) => `<div class="avatar" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]}">${initials(name)}</div>`;

// ============================================================================
// Per-app content builders
// ============================================================================

function vscode(accent = "#569cd6", brand = "Visual Studio Code", withChat = false): string {
  const files = ["employees.service.ts", "screenshots.controller.ts", "reports.service.ts", "schema.prisma", "seed-demo.ts", "Timesheet.tsx", "Sidebar.tsx"];
  const code = `<div style="color:#6a9955">// compute overtime split against the rostered shift</div>
<div><span style="color:#569cd6">export</span> <span style="color:#569cd6">function</span> <span style="color:#dcdcaa">splitSpan</span>(shift, startedAt, endedAt) {</div>
<div>&nbsp;&nbsp;<span style="color:#569cd6">const</span> totalMs = endedAt.getTime() - startedAt.getTime();</div>
<div>&nbsp;&nbsp;<span style="color:#569cd6">let</span> insideMs = <span style="color:#b5cea8">0</span>;</div>
<div>&nbsp;&nbsp;<span style="color:#569cd6">for</span> (<span style="color:#569cd6">const</span> w <span style="color:#569cd6">of</span> windows) {</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;insideMs += overlap(w, startedAt, endedAt);</div>
<div>&nbsp;&nbsp;}</div>
<div>&nbsp;&nbsp;<span style="color:#c586c0">return</span> { shiftSec: insideMs / <span style="color:#b5cea8">1000</span>, overtimeSec: (totalMs - insideMs) / <span style="color:#b5cea8">1000</span> };</div>
<div>}</div>`;
  return `
  <div class="row" style="width:100%;height:100%">
    <div class="col" style="width:48px;background:#333333;align-items:center;padding-top:10px;gap:22px;color:#858585;font-size:20px">
      <div style="color:#fff">▤</div><div>🔍</div><div>⎇</div><div>▶</div><div>🧩</div>
    </div>
    <div class="col" style="width:220px;background:#252526;color:#cccccc;font-size:12.5px;padding:10px 0">
      <div style="padding:0 16px;color:#bbbbbb;font-weight:700;letter-spacing:.5px;margin-bottom:8px">WORKK.WORK</div>
      ${files.map((f, i) => `<div style="padding:4px 16px;${i === 4 ? `background:#37373d;color:${accent}` : ""}">${f}</div>`).join("")}
    </div>
    <div class="col" style="flex:1;background:#1e1e1e">
      <div class="row" style="background:#2d2d2d;font-size:12px;color:#969696">
        <div style="padding:8px 16px;background:#1e1e1e;color:#fff;border-top:2px solid ${accent}">seed-demo.ts</div>
        <div style="padding:8px 16px">shifts.service.ts</div>
      </div>
      <div style="padding:16px 22px;font-family:Consolas,monospace;font-size:13px;line-height:1.7">${code}</div>
    </div>
    ${withChat ? `<div class="col" style="width:280px;background:#252526;border-left:1px solid #000;color:#ddd;font-size:12.5px;padding:12px">
      <div style="font-weight:700;color:${accent};margin-bottom:10px">✦ Cursor — Chat</div>
      <div style="background:#2d2d2d;border-radius:8px;padding:10px;margin-bottom:8px">Split the worked span into rostered vs overtime seconds, timezone-aware.</div>
      <div style="background:#37373d;border-radius:8px;padding:10px">Done — <b>splitSpan()</b> now walks the shift windows and divides the span at the boundary.</div>
    </div>` : ""}
  </div>`;
}

function slack(): string {
  const channels = ["# general", "# engineering", "# customer-success", "# design", "# random"];
  const msgs = [
    ["Ananya Sharma", "Deploy for the timesheet fix is out — overtime numbers look right now 🎉"],
    ["Rohan Verma", "Nice! Re-ran the report for last week, matches manual counts."],
    ["Priya Nair", "Can we get the blocked-sites list updated for the CS team too?"],
  ];
  return `
  <div class="col" style="width:230px;background:#3f0e40;color:#eee;font-size:13px;padding:14px 0">
    <div style="padding:0 16px;font-weight:800;margin-bottom:14px">Northwind Digital ▾</div>
    <div style="padding:0 16px;color:#b892b8;font-size:11px;font-weight:700;margin-bottom:4px">CHANNELS</div>
    ${channels.map((c, i) => `<div style="padding:5px 16px;${i === 1 ? "background:#1164a3;color:#fff" : ""}">${c}</div>`).join("")}
  </div>
  <div class="col" style="flex:1">
    <div style="padding:12px 20px;border-bottom:1px solid #eee;font-weight:700"># engineering</div>
    <div class="col" style="flex:1;padding:16px 20px;gap:16px">
      ${msgs.map(([name, text], i) => `<div class="row" style="gap:10px">${avatar(name, i)}<div><div style="font-weight:700;font-size:13px">${name} <span style="color:#999;font-weight:400;font-size:11px">10:${20 + i * 7} AM</span></div><div style="font-size:13.5px;margin-top:2px">${text}</div></div></div>`).join("")}
    </div>
    <div style="margin:0 20px 20px;border:1px solid #ddd;border-radius:8px;padding:10px 14px;color:#999;font-size:13px">Message #engineering</div>
  </div>`;
}

function teams(): string {
  return `
  <div class="col" style="width:64px;background:#464775;align-items:center;gap:22px;padding-top:16px;color:#fff;font-size:20px">
    <div>💬</div><div style="opacity:.6">👥</div><div style="opacity:.6">📅</div><div style="opacity:.6">📞</div>
  </div>
  <div class="col" style="width:260px;background:#f5f5f8;border-right:1px solid #e1e1e6">
    <div style="padding:14px 16px;font-weight:800">Chat</div>
    ${["Customer Success", "Ananya Sharma", "Priya Nair · Manager"].map((n, i) => `<div class="row" style="gap:10px;padding:9px 16px;align-items:center;${i === 1 ? "background:#e9e9f5" : ""}">${avatar(n, i)}<div style="font-size:13px;font-weight:600">${n}</div></div>`).join("")}
  </div>
  <div class="col" style="flex:1">
    <div style="padding:14px 20px;border-bottom:1px solid #eee;font-weight:700">Ananya Sharma</div>
    <div class="col" style="flex:1;padding:18px 22px;gap:14px">
      <div style="background:#f0f0f7;border-radius:10px;padding:10px 14px;max-width:360px;font-size:13.5px">Sprint review moved to 4 PM, calendar invite updated.</div>
      <div style="background:#5b5fc7;color:#fff;border-radius:10px;padding:10px 14px;max-width:360px;font-size:13.5px;align-self:flex-end">Got it, I'll be there 👍</div>
    </div>
  </div>`;
}

function figma(): string {
  const frames = [
    { x: 40, y: 40, w: 220, h: 140, c: "#f4f4f6" },
    { x: 300, y: 40, w: 220, h: 140, c: "#eef2ff" },
    { x: 560, y: 40, w: 220, h: 140, c: "#fff7ed" },
  ];
  return `
  <div class="col" style="width:210px;background:#2c2c2c;color:#ddd;font-size:12.5px;padding:12px">
    <div style="font-weight:700;margin-bottom:10px">Layers</div>
    ${["Dashboard / Overview", "Nav / Sidebar", "Card / Stat", "Chart / FocusSplit", "Button / Primary"].map((l) => `<div style="padding:5px 6px;border-radius:4px">▸ ${l}</div>`).join("")}
  </div>
  <div style="flex:1;background:#e5e5e5;position:relative">
    <div style="position:absolute;top:14px;left:20px;right:20px;height:34px;background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.15);display:flex;align-items:center;padding:0 14px;font-size:12px;color:#444;gap:16px">
      <span>▶ Cursor</span><span>▭ Frame</span><span>⬭ Ellipse</span><span style="margin-left:auto;color:#8b5cf6;font-weight:700">Share</span>
    </div>
    ${frames.map((f) => `<div style="position:absolute;left:${f.x}px;top:${f.y + 60}px;width:${f.w}px;height:${f.h}px;background:${f.c};border:1px solid #d8d8d8;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.08)"></div>`).join("")}
  </div>
  <div class="col" style="width:230px;background:#2c2c2c;color:#ddd;font-size:12px;padding:14px">
    <div style="font-weight:700;margin-bottom:10px">Design</div>
    <div style="margin-bottom:6px">Fill <span style="float:right;color:#8b5cf6">#EEF2FF</span></div>
    <div style="margin-bottom:6px">Corner radius <span style="float:right">8</span></div>
    <div>Opacity <span style="float:right">100%</span></div>
  </div>`;
}

function postman(): string {
  return `
  <div class="col" style="width:220px;background:#f7f7f7;border-right:1px solid #e2e2e2;font-size:12.5px;padding:12px">
    <div style="font-weight:700;margin-bottom:10px">Northwind API</div>
    ${["GET  /employees", "GET  /screenshots", "POST /timesheet", "GET  /reports/productivity"].map((r) => `<div style="padding:5px 4px;color:#555">${r}</div>`).join("")}
  </div>
  <div class="col" style="flex:1;padding:16px 20px">
    <div class="row" style="gap:10px;align-items:center">
      <div class="pill" style="background:#fecaca;color:#991b1b">GET</div>
      <div style="flex:1;border:1px solid #e2e2e2;border-radius:6px;padding:8px 12px;font-size:13px;color:#333">https://api.northwind-demo.test/api/reports/timesheet</div>
      <div class="btn" style="background:#ff6c37;color:#fff">Send</div>
    </div>
    <div class="row" style="gap:18px;margin-top:16px;font-size:12.5px;color:#666;border-bottom:1px solid #eee;padding-bottom:8px">
      <div style="color:#ff6c37;border-bottom:2px solid #ff6c37;padding-bottom:8px">Params</div><div>Headers</div><div>Body</div>
    </div>
    <div style="margin-top:14px;background:#1e1e1e;color:#9cdcfe;border-radius:6px;padding:14px;font-family:Consolas,monospace;font-size:12.5px;line-height:1.6">
{ <span style="color:#ce9178">"mode"</span>: <span style="color:#ce9178">"period"</span>,<br/>&nbsp;&nbsp;<span style="color:#ce9178">"rows"</span>: [ { <span style="color:#ce9178">"employeeName"</span>: <span style="color:#ce9178">"Ananya Sharma"</span>, <span style="color:#ce9178">"overtimeSec"</span>: 5400 } ] }
    </div>
  </div>`;
}

function notion(): string {
  return `
  <div class="col" style="width:230px;background:#fbfbfa;border-right:1px solid #eee;font-size:13px;padding:14px;color:#555">
    <div style="font-weight:700;margin-bottom:12px">Northwind Digital</div>
    ${["📋 Onboarding", "🗓 Sprint Planning", "📈 OKRs — Q3", "🚀 Launch Checklist"].map((p, i) => `<div style="padding:6px 4px;${i === 2 ? "background:#efefee;border-radius:4px" : ""}">${p}</div>`).join("")}
  </div>
  <div class="col" style="flex:1;padding:40px 60px">
    <div style="font-size:30px;margin-bottom:4px">📈</div>
    <div style="font-size:28px;font-weight:800;margin-bottom:18px">OKRs — Q3</div>
    <div style="font-size:14.5px;color:#333;line-height:1.9">
      <div>☑ Ship timesheet overtime reporting</div>
      <div>☑ Roll out website blocking to all teams</div>
      <div>☐ Reduce screenshot storage cost per seat by 20%</div>
      <div>☐ Customer NPS survey — Q3 results</div>
    </div>
  </div>`;
}

function github(): string {
  return `
  <div class="col" style="flex:1;padding:0">
    <div style="padding:14px 40px;border-bottom:1px solid #eee;font-size:14px;color:#57606a">northwind-digital / <b style="color:#111">platform-api</b></div>
    <div class="row" style="padding:10px 40px;gap:22px;font-size:13px;color:#57606a;border-bottom:1px solid #eee">
      <div style="color:#111;border-bottom:2px solid #fd8c73;padding-bottom:8px">Code</div><div>Issues 12</div><div>Pull requests 4</div><div>Actions</div>
    </div>
    <div style="margin:20px 40px;border:1px solid #d8dee4;border-radius:8px">
      <div style="padding:10px 16px;background:#f6f8fa;border-bottom:1px solid #d8dee4;font-size:12.5px;color:#57606a">main · 214 commits</div>
      ${["src/reports/shifts.service.ts", "src/employees/employees.service.ts", "prisma/schema.prisma", "README.md"].map((f) => `<div class="row" style="padding:9px 16px;font-size:13px;justify-content:space-between;border-bottom:1px solid #eee;color:#111"><span>📄 ${f}</span><span style="color:#57606a">2 days ago</span></div>`).join("")}
    </div>
  </div>`;
}

function stackoverflow(): string {
  return `<div class="col" style="flex:1;padding:30px 60px">
    <div style="font-size:20px;font-weight:700;color:#111;margin-bottom:6px">How to split a worked interval across a shift boundary, timezone-aware?</div>
    <div style="font-size:12px;color:#888;margin-bottom:20px">Asked 3 days ago · Viewed 1.2k times</div>
    <div class="row" style="gap:16px">
      <div class="col" style="align-items:center;gap:4px;color:#666">
        <div style="font-size:20px">▲</div><div style="font-weight:700;color:#111">18</div><div style="font-size:20px">▽</div>
      </div>
      <div style="font-size:13.5px;color:#222;line-height:1.7;max-width:640px">I compute a shift window per calendar day in the employee's timezone, then intersect each worked session with the window(s) that could overlap it. Handles overnight shifts by checking the previous day's window too...</div>
    </div>
    <div style="margin-top:26px;padding-top:16px;border-top:1px solid #eee;font-size:13px;color:#3b4045;font-weight:700">3 Answers</div>
  </div>`;
}

function googleDocs(): string {
  return `<div class="col" style="flex:1;align-items:center;background:#f8f9fa">
    <div style="width:100%;padding:10px 40px;background:#fff;border-bottom:1px solid #e5e5e5;font-size:14px;color:#333">📄 Q3 Retro Notes — Engineering</div>
    <div style="width:680px;margin-top:24px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12);padding:50px 60px;font-size:14px;line-height:1.9;color:#222">
      <div style="font-size:22px;font-weight:700;margin-bottom:14px">Q3 Retro — Engineering</div>
      <div>• Shipped shift-aware timesheets, overtime now tracked automatically</div>
      <div>• Screenshot storage quota enforcement landed, no more surprise overages</div>
      <div>• Next up: website blocking rollout to Customer Success<span style="display:inline-block;width:2px;height:14px;background:#4285f4;vertical-align:middle;margin-left:2px"></span></div>
    </div>
  </div>`;
}

function gmail(): string {
  const rows = [
    ["Cashfree", "Payment received — Invoice INV-2026-0091", "9:14 AM"],
    ["Priya Nair", "Re: CS team blocked-sites rollout", "8:47 AM"],
    ["GitHub", "[platform-api] 3 new pull requests", "8:02 AM"],
    ["Ananya Sharma", "Sprint review notes attached", "Yesterday"],
  ];
  return `
  <div class="col" style="width:220px;padding:16px 10px;background:#fff">
    <div class="btn" style="background:#c2e7ff;color:#001d35;margin:0 6px 18px;text-align:center">✏ Compose</div>
    ${["Inbox 24", "Starred", "Sent", "Drafts"].map((l, i) => `<div style="padding:8px 16px;border-radius:0 16px 16px 0;font-size:13.5px;${i === 0 ? "background:#d3e3fd;font-weight:700" : "color:#444"}">${l}</div>`).join("")}
  </div>
  <div class="col" style="flex:1;border-left:1px solid #eee">
    ${rows.map(([name, subj, time], i) => `<div class="row" style="padding:11px 24px;border-bottom:1px solid #f1f1f1;gap:14px;align-items:center;${i === 0 ? "background:#f2f6fc" : ""}">${avatar(name, i)}<div style="width:150px;font-size:13px;font-weight:${i < 2 ? 700 : 400}">${name}</div><div style="flex:1;font-size:13px;color:#333">${subj}</div><div style="font-size:12px;color:#888">${time}</div></div>`).join("")}
  </div>`;
}

function jira(): string {
  const cols: [string, string[]][] = [
    ["To Do", ["Add shift-conflict warning", "Export timesheet to CSV"]],
    ["In Progress", ["Overtime rounding fix", "Blocked-sites org rollout"]],
    ["Done", ["Storage quota eviction job", "Screenshot lightbox nav"]],
  ];
  return `<div class="col" style="flex:1;padding:20px 30px">
    <div style="font-weight:700;font-size:15px;margin-bottom:14px;color:#172b4d">Northwind Platform — Sprint 24</div>
    <div class="row" style="gap:16px">
      ${cols.map(([name, cards]) => `<div class="col" style="width:220px;background:#f4f5f7;border-radius:6px;padding:10px;gap:10px">
        <div style="font-size:11px;font-weight:700;color:#5e6c84;letter-spacing:.4px">${name.toUpperCase()}</div>
        ${cards.map((c) => `<div style="background:#fff;border-radius:4px;padding:10px;font-size:12.5px;box-shadow:0 1px 2px rgba(9,30,66,.15);color:#172b4d">${c}</div>`).join("")}
      </div>`).join("")}
    </div>
  </div>`;
}

function linear(): string {
  return `<div class="col" style="width:210px;background:#fbfbfb;border-right:1px solid #eee;padding:14px;font-size:13px;color:#444">
    <div style="font-weight:700;margin-bottom:14px">Northwind</div>
    ${["Issues", "Projects", "Cycles", "Views"].map((l, i) => `<div style="padding:6px 4px;${i === 0 ? "font-weight:700;color:#111" : ""}">${l}</div>`).join("")}
  </div>
  <div class="col" style="flex:1;padding:16px 24px">
    <div style="font-weight:700;margin-bottom:12px">My Issues</div>
    ${["NW-142  Overtime split off-by-one near midnight", "NW-139  Add CSV export for period-wise timesheet", "NW-135  Blocked-sites pill input a11y pass"].map((t) => `<div class="row" style="padding:9px 0;border-top:1px solid #f0f0f0;font-size:13px;gap:10px;align-items:center"><span style="width:8px;height:8px;border-radius:50%;background:#f2994a;display:inline-block"></span>${t}</div>`).join("")}
  </div>`;
}

function chatgpt(): string {
  return `<div class="col" style="width:230px;background:#171717;color:#ddd;font-size:12.5px;padding:12px">
    <div class="btn" style="border:1px solid #444;color:#fff;text-align:center;margin-bottom:14px">+ New chat</div>
    ${["Overtime calc timezone edge cases", "Draft Q3 release notes", "SQL for storage backfill"].map((t, i) => `<div style="padding:7px 6px;border-radius:6px;${i === 0 ? "background:#2a2a2a" : ""}">${t}</div>`).join("")}
  </div>
  <div class="col" style="flex:1;background:#212121;color:#ececec;padding:24px 60px;gap:16px">
    <div class="row" style="gap:12px"><div class="avatar" style="background:#10a37f">You</div><div style="font-size:13.5px;padding-top:4px">Why would splitSpan double-count minutes right at a shift's end boundary?</div></div>
    <div class="row" style="gap:12px"><div class="avatar" style="background:#8b5cf6">AI</div><div style="font-size:13.5px;padding-top:4px;line-height:1.7">Likely an inclusive comparison on both window edges — use <code>to &gt; from</code> strictly, and clamp the summed overlap to the span's total duration as a safety net.</div></div>
  </div>`;
}

function crm(): string {
  const rows = [
    ["Meridian Freight Co.", "$48,200", "Negotiation"],
    ["Solstice Retail Group", "$19,500", "Proposal Sent"],
    ["Harbor & Vine", "$7,800", "Won"],
  ];
  return `<div class="col" style="flex:1;padding:0">
    <div style="padding:14px 30px;background:#0f172a;color:#fff;font-weight:700">Northwind CRM</div>
    <div class="row" style="padding:16px 30px;gap:14px">
      ${[["Open Leads", "38"], ["Pipeline", "$212k"], ["Closed (MTD)", "$64.3k"]].map(([l, v]) => `<div class="col" style="flex:1;background:#f1f5f9;border-radius:8px;padding:14px"><div style="font-size:12px;color:#64748b">${l}</div><div style="font-size:20px;font-weight:800;color:#0f172a">${v}</div></div>`).join("")}
    </div>
    <div style="margin:6px 30px;border:1px solid #e2e8f0;border-radius:8px">
      ${rows.map(([n, amt, stage]) => `<div class="row" style="padding:10px 16px;justify-content:space-between;border-bottom:1px solid #eee;font-size:13px;color:#0f172a"><span>${n}</span><span style="color:#64748b">${amt}</span><span class="pill" style="background:#dbeafe;color:#1e3a8a">${stage}</span></div>`).join("")}
    </div>
  </div>`;
}

function spotify(): string {
  return `<div class="col" style="width:220px;background:#000;color:#b3b3b3;font-size:13px;padding:16px">
    <div style="color:#fff;font-weight:800;margin-bottom:16px">◉ Spotify</div>
    ${["Home", "Search", "Your Library"].map((l) => `<div style="padding:6px 4px">${l}</div>`).join("")}
    <div style="margin-top:16px;color:#777;font-size:11px;font-weight:700">PLAYLISTS</div>
    ${["Deep Focus", "Lo-fi Beats", "Evening Chill"].map((l) => `<div style="padding:6px 4px">${l}</div>`).join("")}
  </div>
  <div class="col" style="flex:1;background:linear-gradient(#3a3a3a,#121212);padding:24px;color:#fff">
    <div style="font-size:26px;font-weight:800;margin-bottom:16px">Deep Focus</div>
    <div class="col" style="gap:10px">
      ${["Weightless — Marconi Union", "Nuvole Bianche — Ludovico Einaudi", "Resonance — Home"].map((t, i) => `<div class="row" style="justify-content:space-between;font-size:13.5px;padding:6px 0;color:${i === 0 ? "#1db954" : "#eee"}"><span>${t}</span><span style="color:#999">3:5${i}</span></div>`).join("")}
    </div>
  </div>`;
}

function discord(): string {
  return `<div class="col" style="width:60px;background:#1e1f22;align-items:center;gap:12px;padding-top:12px">
    ${["N", "🎮", "🎨"].map((c) => `<div class="avatar" style="background:#5865f2;border-radius:16px">${c}</div>`).join("")}
  </div>
  <div class="col" style="width:200px;background:#2b2d31;color:#96989d;font-size:13px;padding:14px 8px">
    <div style="color:#fff;font-weight:700;padding:4px 8px;margin-bottom:10px">Off Topic</div>
    ${["# general", "# gaming", "# memes"].map((c, i) => `<div style="padding:6px 8px;${i === 1 ? "background:#3f4147;color:#fff;border-radius:4px" : ""}">${c}</div>`).join("")}
  </div>
  <div class="col" style="flex:1;background:#313338;color:#dbdee1;padding:20px">
    <div class="row" style="gap:10px"><div class="avatar" style="background:#5865f2">RV</div><div><div style="font-weight:700;font-size:13.5px">Rohan Verma</div><div style="font-size:13.5px">anyone up for a match tonight?</div></div></div>
  </div>`;
}

function vlc(): string {
  return `<div class="col" style="flex:1;background:#111;color:#ddd">
    <div style="flex:1;background:radial-gradient(circle at 50% 40%, #333, #000);display:flex;align-items:center;justify-content:center;font-size:70px;color:#555">▶</div>
    <div class="col" style="padding:14px 22px;gap:8px;background:#1a1a1a">
      <div style="height:3px;background:#444;border-radius:2px"><div style="width:38%;height:100%;background:#ff8800;border-radius:2px"></div></div>
      <div class="row" style="justify-content:space-between;font-size:12px;color:#999"><span>14:32</span><span>⏮ ⏯ ⏭ 🔊</span><span>38:07</span></div>
    </div>
  </div>`;
}

function youtube(): string {
  const vids = [
    ["10 VS Code shortcuts that save hours", "DevTips", "412K views"],
    ["Lo-fi beats to focus / relax to", "ChillHop Music", "2.1M views"],
    ["Building a timesheet report from scratch", "Code with Nora", "88K views"],
    ["Office chair review — is it worth it?", "DeskSetups", "310K views"],
  ];
  return `<div class="col" style="flex:1;background:#fff">
    <div class="row" style="padding:10px 24px;align-items:center;gap:14px;border-bottom:1px solid #eee">
      <div style="font-weight:800;color:#ff0000;font-size:16px">▶ YouTube</div>
      <div style="flex:1;border:1px solid #ddd;border-radius:20px;padding:7px 16px;font-size:13px;color:#555;max-width:420px">timesheet report tutorial</div>
    </div>
    <div class="row" style="padding:20px 24px;gap:18px;flex-wrap:wrap">
      ${vids.map(([t, c, v], i) => `<div class="col" style="width:280px;gap:6px"><div style="height:150px;border-radius:8px;background:${["#fde68a", "#a7f3d0", "#bfdbfe", "#fecaca"][i]}"></div><div style="font-size:13px;font-weight:600;color:#0f0f0f">${t}</div><div style="font-size:12px;color:#606060">${c} · ${v}</div></div>`).join("")}
    </div>
  </div>`;
}

function instagram(): string {
  return `<div class="col" style="flex:1;align-items:center;background:#fafafa">
    <div class="row" style="padding:14px 20px;gap:14px">
      ${["Priya", "Sara", "Devansh", "Meera"].map((n, i) => `<div class="col" style="align-items:center;gap:4px"><div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(45deg,#f58529,#dd2a7b,#8134af);padding:2px"><div class="avatar" style="background:#fff;color:#333;width:100%;height:100%">${initials(n)}</div></div><div style="font-size:10px">${n}</div></div>`).join("")}
    </div>
    <div style="width:380px;background:#fff;border:1px solid #eee;border-radius:6px;margin-top:6px">
      <div class="row" style="padding:10px;gap:10px;align-items:center">${avatar("Northwind Digital")}<div style="font-size:13px;font-weight:700">northwind.digital</div></div>
      <div style="height:220px;background:#e5e5e5"></div>
      <div style="padding:10px;font-size:16px">♡ ⤳ ✈</div>
    </div>
  </div>`;
}

function reddit(): string {
  const posts = [
    ["r/programming", "TIL: SQLite unique constraints treat NULL as distinct", "1.2k"],
    ["r/sysadmin", "Storage quota eviction saved us 40% this month", "890"],
  ];
  return `<div class="col" style="flex:1;background:#dae0e6;padding:20px 60px">
    ${posts.map(([sub, title, up]) => `<div class="row" style="background:#fff;border-radius:6px;margin-bottom:12px;padding:12px 16px;gap:14px"><div class="col" style="align-items:center;color:#ff4500;font-weight:700"><div>▲</div><div style="font-size:12px;color:#333">${up}</div><div>▽</div></div><div><div style="font-size:11px;color:#787c7e">${sub}</div><div style="font-size:14px;font-weight:600;color:#222">${title}</div></div></div>`).join("")}
  </div>`;
}

function twitter(): string {
  return `<div class="col" style="flex:1;align-items:center;background:#fff;padding-top:16px">
    <div style="width:420px">
      <div class="row" style="gap:12px;padding:14px 0;border-bottom:1px solid #eee">${avatar("Northwind Digital")}<div><div style="font-size:14px"><b>Northwind Digital</b> <span style="color:#71767b">@northwind_hq · 2h</span></div><div style="font-size:14px;margin-top:4px">Shift-aware timesheets are live — overtime now computed automatically against each employee's roster.</div></div></div>
    </div>
  </div>`;
}

function producthunt(): string {
  const items = [["Focusly", "Ambient sound for deep work", 412], ["Ratio", "Async standups for remote teams", 356]];
  return `<div class="col" style="flex:1;padding:24px 60px;background:#fff">
    <div style="font-weight:800;font-size:16px;margin-bottom:14px">Today's Products</div>
    ${items.map(([n, d, v], i) => `<div class="row" style="gap:14px;padding:12px 0;border-bottom:1px solid #eee;align-items:center"><div style="width:40px;height:40px;border-radius:8px;background:${["#fb923c", "#60a5fa"][i]}"></div><div style="flex:1"><div style="font-weight:700;font-size:14px">${n}</div><div style="font-size:12.5px;color:#666">${d}</div></div><div class="pill" style="background:#fef2f2;color:#b91c1c">▲ ${v}</div></div>`).join("")}
  </div>`;
}

function chromeNewTab(): string {
  return `<div class="col" style="flex:1;align-items:center;padding-top:120px;background:#fff">
    <div style="font-size:52px;font-weight:400;color:#4285f4;margin-bottom:26px">Google</div>
    <div style="width:520px;border:1px solid #ddd;border-radius:24px;padding:12px 20px;color:#999;font-size:14px">🔍 Search Google or type a URL</div>
    <div class="row" style="gap:26px;margin-top:40px">
      ${["Gmail", "GitHub", "Notion", "Figma"].map((s) => `<div class="col" style="align-items:center;gap:6px"><div style="width:46px;height:46px;border-radius:50%;background:#f1f3f4"></div><div style="font-size:11.5px;color:#555">${s}</div></div>`).join("")}
    </div>
  </div>`;
}

function fileExplorer(): string {
  const items = ["Documents", "Downloads", "Northwind Reports", "Screenshots", "Q3 Retro Notes.docx", "timesheet-export.csv"];
  return `<div class="col" style="width:180px;background:#f7f7f7;border-right:1px solid #e2e2e2;padding:14px;font-size:13px;color:#333">
    ${["This PC", "Desktop", "Documents", "Downloads"].map((l) => `<div style="padding:6px 4px">🖥 ${l}</div>`).join("")}
  </div>
  <div style="flex:1;padding:18px 22px">
    <div class="row" style="flex-wrap:wrap;gap:22px">
      ${items.map((i) => `<div class="col" style="align-items:center;gap:6px;width:80px"><div style="font-size:34px">${i.includes(".") ? "📄" : "📁"}</div><div style="font-size:11.5px;text-align:center;color:#222">${i}</div></div>`).join("")}
    </div>
  </div>`;
}

function googleSearch(): string {
  return `<div class="col" style="flex:1;padding:20px 60px;background:#fff">
    <div class="row" style="align-items:center;gap:20px;margin-bottom:20px"><div style="font-size:22px;color:#4285f4;font-weight:700">Google</div><div style="flex:1;border:1px solid #ddd;border-radius:20px;padding:8px 16px;font-size:13px;color:#333;max-width:460px">shift overtime calculation timezone dst</div></div>
    ${[["Handling DST in shift scheduling systems — Stack Overflow", "stackoverflow.com › questions"], ["Timezone-safe overtime rules — engineering blog", "eng.northwind-demo.test › blog"]].map(([t, u]) => `<div style="margin-bottom:18px"><div style="font-size:12px;color:#006621">${u}</div><div style="font-size:17px;color:#1a0dab">${t}</div></div>`).join("")}
  </div>`;
}

function wikipedia(): string {
  return `<div class="col" style="flex:1;padding:26px 70px;background:#fff">
    <div style="font-size:11px;color:#54595d;border-bottom:1px solid #a7d7f9;padding-bottom:8px;margin-bottom:14px">From Wikipedia, the free encyclopedia</div>
    <div style="font-size:26px;font-family:Georgia,serif;margin-bottom:12px">Shift work</div>
    <div style="font-size:13.5px;color:#202122;line-height:1.8;max-width:560px">Shift work is an employment practice designed to make use of the 24 hours of the clock each day, rather than a standard working day. The practice typically sees the day divided into shifts, set periods of time during which different groups of workers perform their duties...</div>
  </div>`;
}

function tally(): string {
  const gateway = ["Accounts Info.", "Inventory Info.", "Vouchers", "Balance Sheet", "Profit & Loss A/c", "Stock Summary", "Ratio Analysis", "Display More Reports"];
  const rows = [
    ["01-Sep-26", "Sales — Meridian Freight Co.", "Sales", "", "48,200.00"],
    ["03-Sep-26", "Purchase — Office Supplies", "Purchase", "3,400.00", ""],
    ["07-Sep-26", "Receipt — Solstice Retail Group", "Receipt", "", "19,500.00"],
  ];
  return `<div class="col" style="flex:1;background:#0a2f4e;color:#e5e5e5;font-family:Consolas,monospace">
    <div style="background:#08243d;padding:8px 16px;font-size:13px;border-bottom:1px solid #14507f">TallyPrime — Northwind Digital (Demo)   Gateway of Tally &gt; Day Book</div>
    <div class="row" style="flex:1">
      <div class="col" style="width:200px;padding:14px;gap:2px;font-size:12.5px;border-right:1px solid #14507f">
        ${gateway.map((g) => `<div style="padding:4px 6px">${g}</div>`).join("")}
      </div>
      <div class="col" style="flex:1;padding:14px">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;text-align:center;text-decoration:underline">Day Book  1-Sep-2026 to 7-Sep-2026</div>
        <div class="row" style="font-size:12px;font-weight:700;border-bottom:1px solid #14507f;padding-bottom:6px">
          <div style="width:100px">Date</div><div style="flex:1">Particulars</div><div style="width:100px">Vch Type</div><div style="width:110px;text-align:right">Debit</div><div style="width:110px;text-align:right">Credit</div>
        </div>
        ${rows.map((r) => `<div class="row" style="font-size:12.5px;padding:6px 0;border-bottom:1px solid #123a5e"><div style="width:100px">${r[0]}</div><div style="flex:1">${r[1]}</div><div style="width:100px">${r[2]}</div><div style="width:110px;text-align:right">${r[3]}</div><div style="width:110px;text-align:right">${r[4]}</div></div>`).join("")}
      </div>
    </div>
    <div style="background:#08243d;padding:6px 16px;font-size:11px;border-top:1px solid #14507f">F1: Help  F2: Date  F3: Company  F4: Contra  F5: Payment  F6: Receipt  F11: Features  F12: Configure</div>
  </div>`;
}

// ============================================================================
// Catalog — key MUST match the app/site names used in seed-demo.ts's
// PRODUCTIVE_APPS / PRODUCTIVE_SITES / UNPRODUCTIVE_APPS / UNPRODUCTIVE_SITES /
// NEUTRAL_APPS / NEUTRAL_SITES arrays.
// ============================================================================
interface Shot { key: string; isWeb: boolean; dark: boolean; label: string; html: string }

const SHOTS: Shot[] = [
  { key: "Visual Studio Code", isWeb: false, dark: true, label: "Visual Studio Code", html: vscode("#569cd6", "Visual Studio Code") },
  { key: "Cursor", isWeb: false, dark: true, label: "Cursor — seed-demo.ts", html: vscode("#a78bfa", "Cursor", true) },
  { key: "Slack", isWeb: false, dark: false, label: "Slack | Northwind Digital", html: slack() },
  { key: "Microsoft Teams", isWeb: false, dark: false, label: "Microsoft Teams", html: teams() },
  { key: "Figma", isWeb: false, dark: false, label: "Figma — Dashboard Overview", html: figma() },
  { key: "Postman", isWeb: false, dark: false, label: "Postman — Northwind API", html: postman() },
  { key: "Notion", isWeb: false, dark: false, label: "Notion — OKRs Q3", html: notion() },
  { key: "Tally", isWeb: false, dark: true, label: "TallyPrime", html: tally() },

  { key: "github.com", isWeb: true, dark: false, label: "github.com/northwind-digital/platform-api", html: github() },
  { key: "stackoverflow.com", isWeb: true, dark: false, label: "stackoverflow.com", html: stackoverflow() },
  { key: "docs.google.com", isWeb: true, dark: false, label: "docs.google.com/document/d/…", html: googleDocs() },
  { key: "mail.google.com", isWeb: true, dark: false, label: "mail.google.com/mail/u/0/#inbox", html: gmail() },
  { key: "atlassian.net", isWeb: true, dark: false, label: "northwind.atlassian.net/jira/board", html: jira() },
  { key: "linear.app", isWeb: true, dark: false, label: "linear.app/northwind/my-issues", html: linear() },
  { key: "chatgpt.com", isWeb: true, dark: true, label: "chatgpt.com", html: chatgpt() },
  { key: "northwind-crm.internal", isWeb: true, dark: false, label: "northwind-crm.internal/pipeline", html: crm() },

  { key: "Spotify", isWeb: false, dark: true, label: "Spotify", html: spotify() },
  { key: "Discord", isWeb: false, dark: true, label: "Discord", html: discord() },
  { key: "VLC", isWeb: false, dark: true, label: "VLC media player", html: vlc() },

  { key: "youtube.com", isWeb: true, dark: false, label: "youtube.com", html: youtube() },
  { key: "instagram.com", isWeb: true, dark: false, label: "instagram.com", html: instagram() },
  { key: "reddit.com", isWeb: true, dark: false, label: "reddit.com", html: reddit() },
  { key: "twitter.com", isWeb: true, dark: false, label: "twitter.com", html: twitter() },
  { key: "producthunt.com", isWeb: true, dark: false, label: "producthunt.com", html: producthunt() },

  { key: "Google Chrome", isWeb: false, dark: false, label: "Google Chrome", html: chromeNewTab() },
  { key: "File Explorer", isWeb: false, dark: false, label: "File Explorer", html: fileExplorer() },
  { key: "google.com", isWeb: true, dark: false, label: "google.com/search?q=…", html: googleSearch() },
  { key: "wikipedia.org", isWeb: true, dark: false, label: "en.wikipedia.org/wiki/Shift_work", html: wikipedia() },
];

function slugify(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  for (const shot of SHOTS) {
    const html = shell(shot.label, shot.isWeb, shot.dark, shot.html);
    await page.setContent(html, { waitUntil: "load" });
    const buf = await page.screenshot({ type: "png" });
    await writeFile(join(OUT_DIR, `${slugify(shot.key)}.png`), buf);
    console.log(`  ${slugify(shot.key)}.png`);
  }

  await browser.close();
  console.log(`\nWrote ${SHOTS.length} placeholder screenshots to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
