/**
 * Renders realistic-looking fake "captured screenshot" images for the demo
 * seed (seed-demo.ts) — one PNG per app/site name in its catalog. Each is a
 * hand-built HTML mockup (not the real app) rendered through Playwright, and
 * every one fills the whole 1440×900 frame with believable content: an editor
 * with a full file of highlighted code and a terminal, Slack with a busy
 * channel, YouTube mid-video with illustrated thumbnails, and so on. Artwork
 * (thumbnails, photos, album covers) is inline SVG, so nothing is downloaded.
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
// Shared chrome
// ============================================================================
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; font-family: "Segoe UI", -apple-system, Helvetica, Arial, sans-serif; color: #1f2328; }
  .window { width: 100%; height: 100%; display: flex; flex-direction: column; background: #fff; }
  .titlebar { height: 32px; flex: 0 0 32px; display: flex; align-items: center; padding: 0 12px; background: #e8e8ea; border-bottom: 1px solid #d0d0d3; }
  .titlebar.dark { background: #1f1f1f; border-bottom: 1px solid #000; }
  .dots { display: flex; gap: 7px; margin-right: 14px; }
  .dots span { width: 12px; height: 12px; border-radius: 50%; display: block; }
  .dots .r { background: #ff5f57; } .dots .y { background: #febc2e; } .dots .g { background: #28c840; }
  .wintitle { font-size: 12.5px; color: #55555a; font-weight: 600; flex: 1; text-align: center; margin-right: 60px; }
  .titlebar.dark .wintitle { color: #cfcfd2; }
  .tabs { height: 38px; flex: 0 0 38px; display: flex; align-items: flex-end; padding: 0 10px; background: #dee1e6; gap: 2px; }
  .tabs .dots { align-self: center; margin-right: 18px; }
  .tab { height: 32px; width: 220px; display: flex; align-items: center; gap: 8px; padding: 0 12px; font-size: 12px; color: #3c4043; border-radius: 8px 8px 0 0; white-space: nowrap; overflow: hidden; }
  .tab.on { background: #fff; }
  .tab .fav { width: 16px; height: 16px; border-radius: 4px; flex: 0 0 16px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: 800; }
  .toolbar { height: 40px; flex: 0 0 40px; display: flex; align-items: center; gap: 14px; padding: 0 12px; background: #fff; border-bottom: 1px solid #e3e3e3; color: #5f6368; font-size: 15px; }
  .omni { flex: 1; height: 30px; border-radius: 15px; background: #f1f3f4; display: flex; align-items: center; gap: 8px; padding: 0 14px; font-size: 13.5px; color: #202124; }
  .omni .host { color: #202124; } .omni .path { color: #70757a; }
  .content { flex: 1; min-height: 0; display: flex; overflow: hidden; position: relative; background: #fff; }
  .row { display: flex; } .col { display: flex; flex-direction: column; }
  .avatar { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; flex: 0 0 36px; }
  .round { border-radius: 50%; }
  .pill { padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 600; display: inline-block; }
  .btn { padding: 7px 16px; border-radius: 7px; font-size: 13px; font-weight: 600; display: inline-block; }
  .mono { font-family: Consolas, "Cascadia Code", Menlo, monospace; }
  .ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  ::-webkit-scrollbar { display: none; }
`;

function appWindow(title: string, dark: boolean, inner: string): string {
  return `<div class="titlebar ${dark ? "dark" : ""}">
      <div class="dots"><span class="r"></span><span class="y"></span><span class="g"></span></div>
      <div class="wintitle">${title}</div>
    </div>
    <div class="content">${inner}</div>`;
}

interface BrowserTab { title: string; fav: string; favBg: string }
function browserWindow(url: string, tabs: BrowserTab[], inner: string): string {
  const [host, ...rest] = url.split("/");
  const path = rest.length ? "/" + rest.join("/") : "";
  return `<div class="tabs">
      <div class="dots"><span class="r"></span><span class="y"></span><span class="g"></span></div>
      ${tabs.map((t, i) => `<div class="tab ${i === 0 ? "on" : ""}"><div class="fav" style="background:${t.favBg}">${t.fav}</div><span class="ell">${t.title}</span></div>`).join("")}
      <div style="align-self:center;margin-left:8px;color:#5f6368;font-size:18px">+</div>
    </div>
    <div class="toolbar">
      <span>←</span><span>→</span><span>↻</span>
      <div class="omni"><span style="font-size:12px">🔒</span><span class="host">${host}</span><span class="path">${path}</span></div>
      <span>☆</span><div class="avatar round" style="width:26px;height:26px;flex-basis:26px;font-size:11px;background:#1a73e8">NA</div>
    </div>
    <div class="content">${inner}</div>`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const initials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const PALETTE = ["#6366f1", "#0ea5e9", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const avatar = (name: string, i = 0, size = 36, round = false) =>
  `<div class="avatar ${round ? "round" : ""}" style="background:${PALETTE[i % PALETTE.length]};width:${size}px;height:${size}px;flex-basis:${size}px;font-size:${Math.round(size * 0.36)}px">${initials(name)}</div>`;

// ============================================================================
// Artwork — inline SVG so thumbnails/photos look like real imagery, not blocks
// ============================================================================

/** A YouTube-style thumbnail: bold backdrop, an illustrated subject, big stroked headline, duration badge. */
function thumb(o: { w: number; h: number; bg: [string, string]; text: string; sub?: string; subject: "face" | "laptop" | "chair" | "headphones" | "chart" | "code" | "desk"; accent: string; dur: string; textColor?: string }): string {
  const { w, h } = o;
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  const subjects: Record<string, string> = {
    face: `<circle cx="${w * 0.76}" cy="${h * 0.42}" r="${h * 0.2}" fill="#f2c7a5"/><path d="M${w * 0.6} ${h} Q${w * 0.76} ${h * 0.52} ${w * 0.92} ${h}Z" fill="${o.accent}"/><circle cx="${w * 0.72}" cy="${h * 0.4}" r="${h * 0.025}" fill="#222"/><circle cx="${w * 0.8}" cy="${h * 0.4}" r="${h * 0.025}" fill="#222"/><ellipse cx="${w * 0.76}" cy="${h * 0.5}" rx="${h * 0.06}" ry="${h * 0.045}" fill="#8a2a2a"/><path d="M${w * 0.6} ${h * 0.34} Q${w * 0.76} ${h * 0.1} ${w * 0.92} ${h * 0.34} Q${w * 0.86} ${h * 0.22} ${w * 0.76} ${h * 0.23} Q${w * 0.66} ${h * 0.22} ${w * 0.6} ${h * 0.34}Z" fill="#3b2a20"/>`,
    laptop: `<rect x="${w * 0.56}" y="${h * 0.28}" width="${w * 0.36}" height="${h * 0.42}" rx="${h * 0.03}" fill="#1e1e1e" stroke="#555" stroke-width="3"/><rect x="${w * 0.59}" y="${h * 0.33}" width="${w * 0.12}" height="${h * 0.035}" fill="#569cd6"/><rect x="${w * 0.59}" y="${h * 0.4}" width="${w * 0.22}" height="${h * 0.035}" fill="#ce9178"/><rect x="${w * 0.62}" y="${h * 0.47}" width="${w * 0.18}" height="${h * 0.035}" fill="#dcdcaa"/><rect x="${w * 0.62}" y="${h * 0.54}" width="${w * 0.1}" height="${h * 0.035}" fill="#4ec9b0"/><path d="M${w * 0.52} ${h * 0.72} L${w * 0.96} ${h * 0.72} L${w * 0.92} ${h * 0.78} L${w * 0.56} ${h * 0.78}Z" fill="#9aa0a6"/>`,
    chair: `<rect x="${w * 0.66}" y="${h * 0.14}" width="${w * 0.18}" height="${h * 0.42}" rx="${h * 0.08}" fill="#222"/><rect x="${w * 0.62}" y="${h * 0.55}" width="${w * 0.26}" height="${h * 0.1}" rx="${h * 0.04}" fill="#333"/><rect x="${w * 0.745}" y="${h * 0.65}" width="${w * 0.01}" height="${h * 0.16}" fill="#666"/><path d="M${w * 0.65} ${h * 0.86} L${w * 0.85} ${h * 0.86}" stroke="#666" stroke-width="6" stroke-linecap="round"/>`,
    headphones: `<path d="M${w * 0.6} ${h * 0.6} Q${w * 0.6} ${h * 0.12} ${w * 0.77} ${h * 0.12} Q${w * 0.94} ${h * 0.12} ${w * 0.94} ${h * 0.6}" stroke="#fff" stroke-width="${h * 0.05}" fill="none"/><rect x="${w * 0.56}" y="${h * 0.5}" width="${w * 0.08}" height="${h * 0.28}" rx="${h * 0.04}" fill="#fff"/><rect x="${w * 0.9}" y="${h * 0.5}" width="${w * 0.08}" height="${h * 0.28}" rx="${h * 0.04}" fill="#fff"/><circle cx="${w * 0.3}" cy="${h * 0.3}" r="${h * 0.06}" fill="#fff" opacity=".35"/><circle cx="${w * 0.45}" cy="${h * 0.7}" r="${h * 0.04}" fill="#fff" opacity=".35"/>`,
    chart: `<rect x="${w * 0.58}" y="${h * 0.55}" width="${w * 0.06}" height="${h * 0.3}" fill="#fff"/><rect x="${w * 0.67}" y="${h * 0.42}" width="${w * 0.06}" height="${h * 0.43}" fill="#fff"/><rect x="${w * 0.76}" y="${h * 0.3}" width="${w * 0.06}" height="${h * 0.55}" fill="#fff"/><rect x="${w * 0.85}" y="${h * 0.16}" width="${w * 0.06}" height="${h * 0.69}" fill="${o.accent}"/><path d="M${w * 0.56} ${h * 0.5} L${w * 0.7} ${h * 0.36} L${w * 0.79} ${h * 0.26} L${w * 0.93} ${h * 0.1}" stroke="${o.accent}" stroke-width="5" fill="none"/>`,
    code: `<text x="${w * 0.56}" y="${h * 0.62}" font-family="Consolas,monospace" font-size="${h * 0.42}" font-weight="700" fill="${o.accent}">{ }</text>`,
    desk: `<rect x="${w * 0.52}" y="${h * 0.62}" width="${w * 0.46}" height="${h * 0.05}" fill="#8b5a2b"/><rect x="${w * 0.62}" y="${h * 0.22}" width="${w * 0.26}" height="${h * 0.3}" rx="6" fill="#111" stroke="#444" stroke-width="3"/><rect x="${w * 0.645}" y="${h * 0.25}" width="${w * 0.21}" height="${h * 0.24}" fill="url(#${id}s)"/><rect x="${w * 0.74}" y="${h * 0.52}" width="${w * 0.02}" height="${h * 0.1}" fill="#444"/><circle cx="${w * 0.57}" cy="${h * 0.56}" r="${h * 0.05}" fill="#2e7d32"/><rect x="${w * 0.555}" y="${h * 0.56}" width="${w * 0.03}" height="${h * 0.06}" fill="#a1887f"/>`,
  };
  const fs = Math.round(h * (o.text.length > 12 ? 0.17 : 0.22));
  const lines = o.text.split("\n");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;border-radius:10px">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.bg[0]}"/><stop offset="1" stop-color="${o.bg[1]}"/></linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#${id})"/>
    ${subjects[o.subject]}
    ${lines.map((l, i) => `<text x="${w * 0.05}" y="${h * 0.3 + i * fs * 1.08}" font-family="Impact, 'Arial Black', sans-serif" font-size="${fs}" fill="${o.textColor || "#fff"}" stroke="#000" stroke-width="${Math.max(2, fs / 12)}" paint-order="stroke" letter-spacing="0.5">${esc(l)}</text>`).join("")}
    ${o.sub ? `<rect x="${w * 0.05}" y="${h * 0.72}" width="${o.sub.length * fs * 0.3 + 16}" height="${fs * 0.62}" rx="4" fill="${o.accent}"/><text x="${w * 0.05 + 8}" y="${h * 0.72 + fs * 0.46}" font-family="'Arial Black', sans-serif" font-size="${fs * 0.42}" fill="#fff">${esc(o.sub)}</text>` : ""}
    <rect x="${w - 58}" y="${h - 30}" width="50" height="22" rx="4" fill="rgba(0,0,0,.82)"/><text x="${w - 33}" y="${h - 14}" font-family="Segoe UI, sans-serif" font-size="12.5" font-weight="600" fill="#fff" text-anchor="middle">${o.dur}</text>
  </svg>`;
}

/** A landscape "photo" — sky gradient, sun, layered hills or city — for Instagram/VLC/Reddit imagery. */
function photo(w: number, h: number, kind: "mountains" | "beach" | "city" | "food" | "forest", radius = 0): string {
  const id = `p${Math.random().toString(36).slice(2, 8)}`;
  const scenes: Record<string, string> = {
    mountains: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a6b"/><stop offset=".55" stop-color="#ffd3a5"/><stop offset="1" stop-color="#8fb3d9"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#${id})"/><circle cx="${w * 0.68}" cy="${h * 0.42}" r="${h * 0.12}" fill="#fff4d6"/>
      <path d="M0 ${h * 0.7} L${w * 0.2} ${h * 0.38} L${w * 0.36} ${h * 0.6} L${w * 0.55} ${h * 0.3} L${w * 0.78} ${h * 0.62} L${w} ${h * 0.44} L${w} ${h} L0 ${h}Z" fill="#5b6c8f"/>
      <path d="M${w * 0.47} ${h * 0.4} L${w * 0.55} ${h * 0.3} L${w * 0.62} ${h * 0.4} L${w * 0.57} ${h * 0.37} L${w * 0.53} ${h * 0.41}Z" fill="#fff"/>
      <path d="M0 ${h * 0.82} Q${w * 0.3} ${h * 0.64} ${w * 0.6} ${h * 0.8} T${w} ${h * 0.74} L${w} ${h} L0 ${h}Z" fill="#2f4a3a"/>`,
    beach: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fc3f7"/><stop offset="1" stop-color="#b3e5fc"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#${id})"/><circle cx="${w * 0.8}" cy="${h * 0.2}" r="${h * 0.08}" fill="#fff9c4"/>
      <rect y="${h * 0.5}" width="${w}" height="${h * 0.22}" fill="#0288d1"/><path d="M0 ${h * 0.56} Q${w * 0.25} ${h * 0.53} ${w * 0.5} ${h * 0.57} T${w} ${h * 0.55}" stroke="#e1f5fe" stroke-width="3" fill="none"/>
      <path d="M0 ${h * 0.72} Q${w * 0.5} ${h * 0.64} ${w} ${h * 0.7} L${w} ${h} L0 ${h}Z" fill="#f5d9a8"/>
      <path d="M${w * 0.18} ${h} Q${w * 0.2} ${h * 0.6} ${w * 0.14} ${h * 0.3}" stroke="#6d4c41" stroke-width="${w * 0.018}" fill="none"/>
      <path d="M${w * 0.14} ${h * 0.3} q${w * 0.1} -${h * 0.05} ${w * 0.16} ${h * 0.06} M${w * 0.14} ${h * 0.3} q-${w * 0.1} -${h * 0.04} -${w * 0.14} ${h * 0.08} M${w * 0.14} ${h * 0.3} q${w * 0.03} -${h * 0.1} ${w * 0.12} -${h * 0.1}" stroke="#2e7d32" stroke-width="${w * 0.02}" fill="none" stroke-linecap="round"/>`,
    city: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1446"/><stop offset=".7" stop-color="#6a3f8f"/><stop offset="1" stop-color="#f28b66"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#${id})"/>
      ${Array.from({ length: 14 }, (_, i) => { const bw = w / 14; const bh = h * (0.25 + ((i * 37) % 50) / 100); return `<rect x="${i * bw}" y="${h - bh}" width="${bw - 3}" height="${bh}" fill="#191530"/>` + Array.from({ length: 8 }, (_, j) => `<rect x="${i * bw + 6 + (j % 2) * (bw / 2 - 4)}" y="${h - bh + 10 + Math.floor(j / 2) * 18}" width="6" height="8" fill="${(i + j) % 3 ? "#ffd166" : "#3a3360"}"/>`).join(""); }).join("")}`,
    food: `<rect width="${w}" height="${h}" fill="#8d6e63"/><rect width="${w}" height="${h}" fill="url(#${id})" opacity=".3"/>
      <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.4}" fill="#fafafa"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.32}" fill="#f4e1c1"/>
      <circle cx="${w * 0.44}" cy="${h * 0.44}" r="${Math.min(w, h) * 0.08}" fill="#e53935"/><circle cx="${w * 0.57}" cy="${h * 0.47}" r="${Math.min(w, h) * 0.07}" fill="#e53935"/><circle cx="${w * 0.5}" cy="${h * 0.6}" r="${Math.min(w, h) * 0.075}" fill="#e53935"/>
      <circle cx="${w * 0.46}" cy="${h * 0.55}" r="${Math.min(w, h) * 0.03}" fill="#43a047"/><circle cx="${w * 0.58}" cy="${h * 0.58}" r="${Math.min(w, h) * 0.03}" fill="#43a047"/><circle cx="${w * 0.53}" cy="${h * 0.39}" r="${Math.min(w, h) * 0.03}" fill="#43a047"/>`,
    forest: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8e6c9"/><stop offset="1" stop-color="#81c784"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#${id})"/>
      ${Array.from({ length: 9 }, (_, i) => `<path d="M${(i / 8) * w} ${h * 0.25 + (i % 3) * h * 0.08} l${w * 0.07} ${h * 0.5} l-${w * 0.14} 0Z" fill="${i % 2 ? "#2e7d32" : "#1b5e20"}"/>`).join("")}
      <rect y="${h * 0.8}" width="${w}" height="${h * 0.2}" fill="#33691e"/>`,
  };
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;border-radius:${radius}px">${scenes[kind]}</svg>`;
}

/** Square album art: gradient + geometric motif + title. */
function cover(size: number, a: string, b: string, title: string, motif = 0): string {
  const id = `c${Math.random().toString(36).slice(2, 8)}`;
  const s = size;
  const motifs = [
    `<circle cx="${s * 0.5}" cy="${s * 0.45}" r="${s * 0.26}" fill="none" stroke="#fff" stroke-width="${s * 0.03}" opacity=".7"/><circle cx="${s * 0.5}" cy="${s * 0.45}" r="${s * 0.12}" fill="#fff" opacity=".8"/>`,
    `<path d="M0 ${s * 0.7} Q${s * 0.25} ${s * 0.4} ${s * 0.5} ${s * 0.6} T${s} ${s * 0.45} L${s} ${s} L0 ${s}Z" fill="#000" opacity=".25"/>`,
    `${[0, 1, 2, 3].map((i) => `<rect x="${s * 0.15 + i * s * 0.18}" y="${s * (0.6 - i * 0.1)}" width="${s * 0.12}" height="${s * (0.2 + i * 0.1)}" fill="#fff" opacity=".6"/>`).join("")}`,
    `<polygon points="${s * 0.5},${s * 0.15} ${s * 0.82},${s * 0.7} ${s * 0.18},${s * 0.7}" fill="#fff" opacity=".35"/>`,
  ];
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" style="display:block;border-radius:6px;flex:0 0 ${s}px"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="${s}" height="${s}" fill="url(#${id})"/>${motifs[motif % motifs.length]}
    <text x="${s * 0.08}" y="${s * 0.92}" font-family="Segoe UI, sans-serif" font-weight="800" font-size="${s * 0.11}" fill="#fff">${esc(title)}</text></svg>`;
}

// ============================================================================
// Tiny syntax highlighter for the editor mockups (VS Code dark+ palette)
// ============================================================================
const KW = new Set("import export from const let var function return if else for of in await async new class extends interface type private public readonly throw try catch while break continue default as typeof".split(" "));
function highlight(line: string): string {
  if (/^\s*\/\//.test(line)) return `<span style="color:#6a9955">${esc(line)}</span>`;
  let out = "";
  const re = /(\/\/.*$)|('[^']*'|"[^"]*"|`[^`]*`)|(\b\d+(?:_\d+)*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const [tok, cmt, str, num, ident] = m;
    if (cmt) out += `<span style="color:#6a9955">${esc(cmt)}</span>`;
    else if (str) out += `<span style="color:#ce9178">${esc(str)}</span>`;
    else if (num) out += `<span style="color:#b5cea8">${num}</span>`;
    else if (ident) {
      const next = line.slice(re.lastIndex).trimStart()[0];
      if (KW.has(ident)) out += `<span style="color:${["return", "if", "else", "for", "await", "throw", "try", "catch", "import", "export", "from", "while"].includes(ident) ? "#c586c0" : "#569cd6"}">${ident}</span>`;
      else if (ident === "true" || ident === "false" || ident === "null" || ident === "undefined" || ident === "this") out += `<span style="color:#569cd6">${ident}</span>`;
      else if (next === "(") out += `<span style="color:#dcdcaa">${ident}</span>`;
      else if (/^[A-Z]/.test(ident)) out += `<span style="color:#4ec9b0">${ident}</span>`;
      else out += `<span style="color:#9cdcfe">${ident}</span>`;
    } else out += esc(tok);
  }
  return out;
}

const REPORTS_TS = `import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ShiftsService, type ShiftWindow } from "./shifts.service";

export interface DaySummary {
  date: string;
  activeSec: number;
  idleSec: number;
  overtimeSec: number;
  productivity: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shifts: ShiftsService,
  ) {}

  /** Roll up one employee's activity into per-day totals for the timesheet. */
  async timesheet(orgId: string, employeeId: string, from: Date, to: Date) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, orgId },
      include: { shift: true },
    });
    if (!employee) throw new NotFoundException("Employee not found");

    const spans = await this.prisma.activitySpan.findMany({
      where: { employeeId, startedAt: { gte: from, lt: to } },
      orderBy: { startedAt: "asc" },
    });

    const days = new Map<string, DaySummary>();
    for (const span of spans) {
      const key = span.startedAt.toISOString().slice(0, 10);
      const day = days.get(key) ?? this.emptyDay(key);
      const seconds = (span.endedAt.getTime() - span.startedAt.getTime()) / 1000;
      if (span.isIdle) day.idleSec += seconds;
      else day.activeSec += seconds;
      const window: ShiftWindow = this.shifts.windowFor(employee.shift, span.startedAt);
      day.overtimeSec += this.shifts.outsideSeconds(window, span);
      days.set(key, day);
    }

    return [...days.values()].map((d) => ({
      ...d,
      productivity: Math.round((d.activeSec / Math.max(1, d.activeSec + d.idleSec)) * 100),
    }));
  }

  private emptyDay(date: string): DaySummary {
    return { date, activeSec: 0, idleSec: 0, overtimeSec: 0, productivity: 0 };
  }
}`;

// ============================================================================
// Per-app content builders
// ============================================================================

function editor(brand: "vscode" | "cursor"): string {
  const isCursor = brand === "cursor";
  const accent = isCursor ? "#a78bfa" : "#0078d4";
  const files: [string, string, number][] = [
    ["src", "", 0], ["auth", "", 1], ["devices", "", 1], ["reports", "", 1],
    ["reports.controller.ts", "#3178c6", 2], ["reports.service.ts", "#3178c6", 2], ["shifts.service.ts", "#3178c6", 2], ["reports.module.ts", "#3178c6", 2],
    ["screenshots", "", 1], ["screenshots.controller.ts", "#3178c6", 2], ["storage.service.ts", "#3178c6", 2],
    ["main.ts", "#3178c6", 1], ["app.module.ts", "#3178c6", 1],
    ["prisma", "", 0], ["schema.prisma", "#5a67d8", 1], ["seed.ts", "#3178c6", 1],
    [".env.example", "#e0c34f", 0], ["package.json", "#8bc34a", 0], ["tsconfig.json", "#3178c6", 0], ["README.md", "#519aba", 0],
  ];
  const lines = REPORTS_TS.split("\n");
  const activeLine = 37;
  const code = lines.map((l, i) => `<div class="row" style="height:20px;${i + 1 === activeLine ? "background:#2a2d2e" : ""}"><div style="width:52px;text-align:right;padding-right:18px;color:${i + 1 === activeLine ? "#c6c6c6" : "#6e7681"}">${i + 1}</div><div style="white-space:pre">${highlight(l)}${i + 1 === activeLine ? `<span style="border-left:2px solid #aeafad;margin-left:1px"></span>` : ""}</div></div>`).join("");
  const minimap = lines.map((l) => `<div style="height:3px;margin:1px 0;width:${Math.min(100, l.length * 1.3)}%;background:${/^\s*\/\//.test(l) ? "#6a9955" : /import|export|return|const/.test(l) ? "#569cd6" : "#7a7a7a"};opacity:.55;margin-left:${(l.length - l.trimStart().length) * 1.2}px"></div>`).join("");
  const terminal = [
    `<span style="color:#4ec9b0">PS C:\\work\\northwind\\platform-api&gt;</span> npm run test -- reports`,
    ``,
    `<span style="color:#0dbc79"> PASS </span> src/reports/reports.service.spec.ts (4.12 s)`,
    `  ReportsService.timesheet`,
    `    <span style="color:#0dbc79">✓</span> splits a span that crosses the shift end into overtime (38 ms)`,
    `    <span style="color:#0dbc79">✓</span> counts idle spans separately from active time (6 ms)`,
    `    <span style="color:#0dbc79">✓</span> keeps the final day of a date range (5 ms)`,
    ``,
    `Tests:       <span style="color:#0dbc79">3 passed</span>, 3 total`,
    `Time:        4.87 s`,
  ];
  const chat = isCursor
    ? `<div class="col" style="width:360px;background:#181818;border-left:1px solid #2b2b2b;font-size:13px;color:#ccc">
        <div class="row" style="padding:10px 14px;border-bottom:1px solid #2b2b2b;gap:14px;font-size:12px"><b style="color:#fff">Chat</b><span style="color:#888">Composer</span><span style="color:#888">History</span></div>
        <div class="col" style="padding:14px;gap:14px;flex:1">
          <div style="background:#2a2a2a;border-radius:8px;padding:10px 12px;color:#e5e5e5">Why does the timesheet undercount overtime when a span crosses midnight?</div>
          <div style="line-height:1.55">The span is keyed by <code style="color:#ce9178">startedAt</code>'s UTC date, so anything after midnight IST lands on the previous day. Split the span at the local-day boundary before bucketing:</div>
          <div class="mono" style="background:#1e1e1e;border:1px solid #333;border-radius:6px;padding:10px;font-size:12px;line-height:1.6;white-space:pre">${highlight("const parts = splitAtLocalMidnight(span, tz);")}<br>${highlight("for (const part of parts) {")}<br>${highlight("  const key = localDate(part.startedAt, tz);")}<br>${highlight("  // ...accumulate as before")}<br>}</div>
          <div class="row" style="gap:8px"><span class="btn" style="background:${accent};color:#fff;padding:5px 12px;font-size:12px">Apply</span><span class="btn" style="background:#2a2a2a;color:#ccc;padding:5px 12px;font-size:12px">Copy</span></div>
          <div style="line-height:1.55;color:#aaa">I also added a test case for a 23:30 → 01:15 span in <span style="color:#4ec9b0">reports.service.spec.ts</span>.</div>
        </div>
        <div style="margin:12px;border:1px solid #3a3a3a;border-radius:8px;padding:10px 12px;color:#777">Ask anything (Ctrl+L) · claude-sonnet</div>
      </div>`
    : "";
  return `<div class="col" style="width:48px;background:#181818;align-items:center;gap:22px;padding-top:14px;color:#858585;font-size:20px;border-right:1px solid #2b2b2b">
      <div style="color:#d7d7d7;border-left:2px solid ${accent};padding-left:10px;margin-left:-12px">⧉</div><div>⌕</div><div>⑂</div><div>▷</div><div>⊞</div>
    </div>
    <div class="col" style="width:250px;background:#181818;color:#ccc;font-size:13px;border-right:1px solid #2b2b2b">
      <div style="padding:10px 18px;font-size:11px;letter-spacing:.8px;color:#bbb">EXPLORER</div>
      <div style="padding:4px 10px;font-size:11.5px;font-weight:700;color:#ddd">⌄ PLATFORM-API</div>
      ${files.map(([n, c, d]) => `<div class="row ell" style="padding:3px 0 3px ${12 + d * 14}px;gap:6px;align-items:center;${n === "reports.service.ts" ? "background:#37373d;color:#fff" : ""}">${c ? `<span style="color:${c};font-size:10px;font-weight:800;width:16px">TS</span>` : `<span style="color:#c5c5c5">⌄</span>`}${n}</div>`).join("")}
      <div style="margin-top:auto;padding:6px 10px;font-size:11.5px;font-weight:700;color:#ccc;border-top:1px solid #2b2b2b">› OUTLINE</div>
      <div style="padding:6px 10px;font-size:11.5px;font-weight:700;color:#ccc;border-top:1px solid #2b2b2b">› TIMELINE</div>
    </div>
    <div class="col" style="flex:1;min-width:0;background:#1f1f1f">
      <div class="row" style="height:35px;background:#181818;font-size:13px;color:#9d9d9d">
        <div class="row" style="padding:0 16px;align-items:center;gap:8px;background:#1f1f1f;color:#fff;border-top:1px solid ${accent}"><span style="color:#3178c6;font-size:10px;font-weight:800">TS</span>reports.service.ts <span style="color:#aaa">×</span></div>
        <div class="row" style="padding:0 16px;align-items:center;gap:8px;border-right:1px solid #2b2b2b"><span style="color:#3178c6;font-size:10px;font-weight:800">TS</span>shifts.service.ts</div>
        <div class="row" style="padding:0 16px;align-items:center;gap:8px;border-right:1px solid #2b2b2b"><span style="color:#5a67d8;font-size:10px;font-weight:800">◆</span>schema.prisma</div>
      </div>
      <div style="padding:4px 18px;font-size:12.5px;color:#a9a9a9">src › reports › <span style="color:#4ec9b0">ReportsService</span> › <span style="color:#dcdcaa">timesheet</span></div>
      <div class="row" style="flex:1;min-height:0">
        <div class="mono" style="flex:1;font-size:14px;color:#d4d4d4;overflow:hidden;padding-top:2px">${code}</div>
        <div style="width:80px;padding:4px 8px;border-left:1px solid #2b2b2b">${minimap}</div>
      </div>
      <div class="col" style="height:215px;flex:0 0 215px;border-top:1px solid #2b2b2b;background:#181818">
        <div class="row" style="gap:22px;padding:8px 18px;font-size:11.5px;color:#9d9d9d;letter-spacing:.4px"><span>PROBLEMS</span><span>OUTPUT</span><span>DEBUG CONSOLE</span><span style="color:#e7e7e7;border-bottom:1px solid ${accent};padding-bottom:3px">TERMINAL</span><span>PORTS</span></div>
        <div class="mono" style="padding:4px 18px;font-size:13px;line-height:1.5;color:#cccccc;white-space:pre">${terminal.join("\n")}</div>
      </div>
    </div>
    ${chat}
    <div class="row" style="position:absolute;left:0;right:0;bottom:0;height:22px;background:${isCursor ? "#181818" : "#0078d4"};color:#fff;font-size:12px;align-items:center;gap:16px;padding:0 12px;${isCursor ? "border-top:1px solid #2b2b2b;color:#ccc" : ""}">
      <span>⑂ feature/overtime-split*</span><span>⟳</span><span>⊗ 0  ⚠ 2</span><span style="margin-left:auto">Ln ${activeLine}, Col 48</span><span>Spaces: 2</span><span>UTF-8</span><span>LF</span><span>{ } TypeScript</span><span>Prettier ✓</span>
    </div>`;
}

function slack(): string {
  const channels = ["announcements", "cs-escalations", "design-crit", "engineering", "general", "random", "release-train", "standup"];
  const dms = ["Ananya Sharma", "Priya Nair", "Kabir Singh", "Meera Iyer", "Arjun Mehta"];
  const msgs: [string, number, string, string, string?][] = [
    ["Ananya Sharma", 0, "10:02 AM", `Morning all ☀️ standup notes are in <span style="color:#1264a3">#standup</span>. Big one today: the overtime split fix is ready for review.`, "👀 3   🙌 2"],
    ["Rohan Verma", 1, "10:05 AM", `I'll take it. Is <span class="mono" style="background:#f6f6f6;border:1px solid #e0e0e0;color:#c01343;padding:1px 4px;border-radius:3px;font-size:13px">splitAtLocalMidnight</span> covered for the IST → UTC edge?`],
    ["Ananya Sharma", 0, "10:06 AM", `Yep, added a 23:30 → 01:15 case. CI is green ✅`],
    ["Meera Iyer", 2, "10:14 AM", `Heads up: the staging deploy at 11:00 will restart the API for ~30s. Agents buffer and retry, so nothing is lost.`, "👍 5"],
    ["Priya Nair", 4, "10:21 AM", `CS here. Meridian Freight asked if they can export last month's timesheets as CSV. Can someone confirm the date range includes the final day now?`],
    ["Kabir Singh", 3, "10:24 AM", `Confirmed, shipped in 2.14. Range is inclusive now.`, "🎉 4   ❤️ 1"],
    ["Rohan Verma", 1, "10:31 AM", `PR approved. Merging after lunch unless anyone objects 🚀`],
  ];
  return `<div class="col" style="width:70px;background:#3f0e40;align-items:center;padding-top:14px;gap:16px">
      <div class="avatar" style="background:#fff;color:#3f0e40;width:40px;height:40px;flex-basis:40px;font-size:15px">ND</div>
      ${["⌂", "💬", "🔔", "⋯"].map((i) => `<div style="color:#e9d5ea;font-size:18px">${i}</div>`).join("")}
    </div>
    <div class="col" style="width:270px;background:#4a154b;color:#cfc3cf;font-size:14.5px">
      <div style="padding:14px 18px;font-weight:800;color:#fff;font-size:17px;border-bottom:1px solid #5d2c5d">Northwind Digital ⌄</div>
      <div class="col" style="padding:10px 0;gap:1px">
        <div style="padding:4px 18px">🧵 Threads</div><div style="padding:4px 18px">@ Mentions &amp; reactions</div><div style="padding:4px 18px">📝 Drafts &amp; sent</div>
      </div>
      <div style="padding:8px 18px 4px;font-size:13.5px">⌄ Channels</div>
      ${channels.map((c) => `<div style="padding:4px 18px 4px 26px;${c === "engineering" ? "background:#1164a3;color:#fff;font-weight:700" : c === "release-train" || c === "cs-escalations" ? "color:#fff;font-weight:700" : ""}"># ${c}</div>`).join("")}
      <div style="padding:10px 18px 4px;font-size:13.5px">⌄ Direct messages</div>
      ${dms.map((d, i) => `<div class="row" style="padding:4px 18px 4px 26px;gap:8px;align-items:center">${avatar(d, i, 20)}<span>${d}</span>${i < 3 ? `<span style="width:8px;height:8px;border-radius:50%;background:#2bac76;margin-left:auto"></span>` : ""}</div>`).join("")}
    </div>
    <div class="col" style="flex:1;min-width:0">
      <div class="row" style="padding:12px 20px;border-bottom:1px solid #e2e2e2;align-items:center;gap:12px">
        <b style="font-size:17px"># engineering</b><span style="color:#616061;font-size:13px">Platform API, agents &amp; releases</span>
        <div class="row" style="margin-left:auto;gap:-6px">${["Ananya Sharma", "Rohan Verma", "Meera Iyer"].map((n, i) => avatar(n, i, 24)).join("")}</div><span style="color:#616061;font-size:13px">24</span>
      </div>
      <div class="row" style="padding:6px 20px;gap:18px;font-size:13px;color:#616061;border-bottom:1px solid #eee"><span>📌 Pinned: Release checklist</span><span>🔗 CI dashboard</span><span>📄 On-call rota</span></div>
      <div class="col" style="flex:1;padding:8px 0;overflow:hidden;justify-content:flex-end">
        <div class="row" style="align-items:center;gap:10px;padding:6px 20px;color:#616061;font-size:13px"><div style="flex:1;height:1px;background:#e2e2e2"></div><span style="border:1px solid #e2e2e2;border-radius:12px;padding:2px 12px;font-weight:700;color:#1d1c1d">Today</span><div style="flex:1;height:1px;background:#e2e2e2"></div></div>
        ${msgs.map(([n, i, t, body, react]) => `<div class="row" style="gap:10px;padding:8px 20px">
          ${avatar(n, i)}
          <div class="col" style="gap:3px;min-width:0"><div><b style="font-size:15px">${n}</b> <span style="color:#616061;font-size:12px;margin-left:4px">${t}</span></div>
          <div style="font-size:15px;line-height:1.46;color:#1d1c1d">${body}</div>
          ${react ? `<div class="row" style="gap:6px;margin-top:4px">${react.split("   ").map((r) => `<span style="border:1px solid #d6e7f5;background:#f1f8ff;border-radius:12px;padding:1px 8px;font-size:12.5px;color:#1264a3">${r}</span>`).join("")}</div>` : ""}</div>
        </div>`).join("")}
        <div class="row" style="gap:10px;padding:8px 20px">${avatar("Meera Iyer", 2)}<div class="col" style="gap:4px"><div><b style="font-size:15px">Meera Iyer</b> <span style="color:#616061;font-size:12px">10:33 AM</span></div>
          <div class="row" style="gap:10px;border:1px solid #e2e2e2;border-radius:8px;padding:10px 12px;align-items:center;width:460px"><div style="width:40px;height:40px;border-radius:6px;background:#2eb67d;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800">CI</div><div class="col"><b style="font-size:14px">platform-api #1482 passed</b><span style="color:#616061;font-size:13px">feature/overtime-split · 212 tests · 3m 41s</span></div></div></div></div>
      </div>
      <div style="margin:0 20px 16px;border:1px solid #bbb;border-radius:8px">
        <div class="row" style="gap:14px;padding:6px 12px;color:#777;font-size:14px;border-bottom:1px solid #eee"><b>B</b><i>I</i><s>S</s><span>🔗</span><span>≡</span><span class="mono">&lt;/&gt;</span></div>
        <div style="padding:10px 12px;color:#1d1c1d;font-size:15px">Sounds good, I'll update the release notes<span style="border-left:2px solid #1d1c1d;margin-left:1px"></span></div>
        <div class="row" style="padding:6px 12px;color:#777;gap:14px;font-size:15px"><span>＋</span><span>Aa</span><span>☺</span><span>@</span><span style="margin-left:auto;background:#007a5a;color:#fff;border-radius:4px;padding:2px 10px">➤</span></div>
      </div>
    </div>`;
}

function teams(): string {
  const chats = [["Customer Success", "Priya: Renewal call moved to Thu"], ["Ananya Sharma", "Got it, I'll be there 👍"], ["Priya Nair", "Can you share the Q3 deck?"], ["Release Train", "Meera: 2.14 is live"], ["Kabir Singh", "Pushed the fix"], ["Design Crit", "Devansh: new dashboard frames"], ["Arjun Mehta", "Thanks!"], ["Sara Khan", "Joining in 2 min"]];
  const convo: [string, boolean, string][] = [
    ["Ananya Sharma", false, "Hey! Sprint review moved to 4 PM, calendar invite is updated."],
    ["You", true, "Thanks. Should I demo the new timesheet export?"],
    ["Ananya Sharma", false, "Yes please, and show the overtime column. Priya's customers keep asking about it."],
    ["Ananya Sharma", false, "Also bring the numbers from last week: 38.5 h average, 4 late logins."],
    ["You", true, "On it. I'll pull them from the Reports page 📊"],
    ["Ananya Sharma", false, "Perfect 🙌"],
  ];
  return `<div class="col" style="width:68px;background:#ebebeb;align-items:center;gap:20px;padding-top:16px;color:#5b5fc7;font-size:12px;border-right:1px solid #ddd">
      ${["🔔<br>Activity", "💬<br>Chat", "👥<br>Teams", "📅<br>Calendar", "📞<br>Calls", "📁<br>Files"].map((x, i) => `<div style="text-align:center;${i === 1 ? "color:#5b5fc7;font-weight:700" : "color:#616161"}">${x}</div>`).join("")}
    </div>
    <div class="col" style="width:320px;background:#f5f5f5;border-right:1px solid #e1e1e1">
      <div class="row" style="padding:16px;align-items:center"><b style="font-size:18px">Chat</b><span style="margin-left:auto;color:#616161">⌕ ✎</span></div>
      ${chats.map(([n, last], i) => `<div class="row" style="gap:12px;padding:10px 16px;align-items:center;${i === 1 ? "background:#fff;border-left:3px solid #5b5fc7" : ""}">${avatar(n, i, 38, true)}<div class="col" style="min-width:0"><div style="font-size:14px;font-weight:600">${n}</div><div class="ell" style="font-size:13px;color:#616161">${last}</div></div><span style="margin-left:auto;font-size:11.5px;color:#888">${["9:12", "4:02", "3:40", "Tue", "Tue", "Mon", "Mon", "Fri"][i]}</span></div>`).join("")}
    </div>
    <div class="col" style="flex:1;background:#fafafa">
      <div class="row" style="padding:12px 22px;border-bottom:1px solid #e1e1e1;background:#fff;align-items:center;gap:12px">${avatar("Ananya Sharma", 1, 34, true)}<b style="font-size:16px">Ananya Sharma</b><span style="color:#5b5fc7;font-size:14px;margin-left:16px;border-bottom:2px solid #5b5fc7;padding-bottom:4px">Chat</span><span style="color:#616161;font-size:14px">Files</span><span style="color:#616161;font-size:14px">Photos</span><span style="margin-left:auto" class="btn" >📹 ⌄</span></div>
      <div class="col" style="flex:1;padding:24px 40px;gap:14px;justify-content:flex-end">
        ${convo.map(([n, me, t]) => `<div class="col" style="align-self:${me ? "flex-end" : "flex-start"};max-width:560px;gap:3px">${me ? "" : `<span style="font-size:12px;color:#616161">${n}  3:5${convo.indexOf([n, me, t] as never) + 2} PM</span>`}<div style="background:${me ? "#e8ebfa" : "#fff"};border-radius:6px;padding:10px 14px;font-size:15px;line-height:1.45;box-shadow:0 1px 2px rgba(0,0,0,.08)">${t}</div></div>`).join("")}
      </div>
      <div style="margin:0 40px 20px;background:#fff;border-radius:6px;border-bottom:2px solid #5b5fc7;padding:12px 16px;color:#888;font-size:15px;box-shadow:0 1px 3px rgba(0,0,0,.1)">Type a message</div>
    </div>`;
}

function figma(): string {
  const miniDash = (x: number, y: number, w: number, h: number, name: string, accent: string) => `
    <div style="position:absolute;left:${x}px;top:${y - 20}px;font-size:12px;color:#8a8a8a">${name}</div>
    <div class="col" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.12);overflow:hidden">
      <div class="row" style="height:100%">
        <div style="width:${w * 0.18}px;background:#0f172a"></div>
        <div class="col" style="flex:1;padding:12px;gap:10px">
          <div style="height:10px;width:40%;background:#1f2937;border-radius:3px"></div>
          <div class="row" style="gap:8px">${[accent, "#10b981", "#f59e0b", "#ef4444"].map((c) => `<div style="flex:1;height:${h * 0.16}px;border-radius:6px;background:${c}1f;border:1px solid ${c}55;padding:6px"><div style="height:6px;width:50%;background:${c};border-radius:2px"></div><div style="height:12px;width:40%;background:#111;margin-top:6px;border-radius:2px"></div></div>`).join("")}</div>
          <div class="row" style="gap:8px;flex:1">
            <div style="flex:2;border:1px solid #e5e7eb;border-radius:6px;display:flex;align-items:flex-end;gap:5px;padding:8px">${[40, 62, 55, 80, 70, 92, 66, 74].map((v) => `<div style="flex:1;height:${v}%;background:${accent};border-radius:2px 2px 0 0"></div>`).join("")}</div>
            <div style="flex:1;border:1px solid #e5e7eb;border-radius:6px;display:flex;align-items:center;justify-content:center"><div style="width:${h * 0.28}px;height:${h * 0.28}px;border-radius:50%;background:conic-gradient(${accent} 0 62%,#10b981 0 84%,#e5e7eb 0)"></div></div>
          </div>
        </div>
      </div>
    </div>`;
  const layers = ["Dashboard / Overview", "  Sidebar", "  Header", "  Stat cards", "    Card / Active", "    Card / Idle", "    Card / Offline", "  Chart / Weekly hours", "  Donut / Productivity", "Dashboard / Live", "Dashboard / Timesheets", "Components", "  Button / Primary", "  Badge / Status"];
  return `<div class="col" style="flex:1">
      <div class="row" style="height:44px;background:#2c2c2c;align-items:center;padding:0 14px;gap:16px;color:#fff;font-size:13px">
        <b style="font-size:16px">❖</b><span>▸</span><span>▭</span><span>◯</span><span>✎</span><span>T</span><span>✋</span><span>💬</span>
        <span style="margin-left:auto;margin-right:auto;color:#ccc">Northwind / <b style="color:#fff">Workk Dashboard v3</b> ⌄</span>
        <div class="row" style="gap:-4px">${["Devansh Rao", "Priya Nair"].map((n, i) => avatar(n, i + 5, 26, true)).join("")}</div>
        <span class="btn" style="background:#0d99ff;color:#fff;padding:6px 14px">Share</span><span>▷</span><span>100%</span>
      </div>
      <div class="row" style="flex:1;min-height:0">
        <div class="col" style="width:240px;background:#fff;border-right:1px solid #e5e5e5;font-size:12.5px">
          <div class="row" style="padding:10px 14px;gap:16px;border-bottom:1px solid #eee"><b>Layers</b><span style="color:#999">Assets</span></div>
          <div style="padding:8px 14px;color:#999;font-size:11.5px">Pages</div>
          ${["● Overview", "Live monitoring", "Reports", "Archive"].map((p, i) => `<div style="padding:4px 14px;${i === 0 ? "font-weight:600" : "color:#555"}">${p}</div>`).join("")}
          <div style="height:1px;background:#eee;margin:8px 0"></div>
          ${layers.map((l, i) => `<div class="ell" style="padding:4px 14px;${i === 3 ? "background:#e5f4ff" : ""};white-space:pre;color:#333">${l.startsWith("  ") ? "" : "#  "}${l}</div>`).join("")}
        </div>
        <div style="flex:1;background:#e5e5e5;position:relative;overflow:hidden">
          ${miniDash(40, 50, 560, 360, "Dashboard / Overview", "#6366f1")}
          ${miniDash(640, 50, 440, 290, "Dashboard / Live", "#0ea5e9")}
          ${miniDash(40, 460, 440, 260, "Dashboard / Timesheets", "#8b5cf6")}
          ${miniDash(520, 400, 560, 330, "Dashboard / Reports", "#10b981")}
          <div style="position:absolute;left:52px;top:128px;width:536px;height:66px;border:2px solid #0d99ff"></div>
          <div style="position:absolute;left:52px;top:196px;background:#0d99ff;color:#fff;font-size:11px;padding:1px 6px;border-radius:3px">536 × 66</div>
          <div style="position:absolute;left:760px;top:460px"><svg width="22" height="22"><path d="M2 2 L18 10 L10 12 L7 20Z" fill="#f24e1e" stroke="#fff" stroke-width="1.5"/></svg><span style="background:#f24e1e;color:#fff;font-size:11px;padding:2px 6px;border-radius:4px">Devansh</span></div>
        </div>
        <div class="col" style="width:250px;background:#fff;border-left:1px solid #e5e5e5;font-size:12px;padding:12px 14px;gap:12px">
          <div class="row" style="gap:16px"><b>Design</b><span style="color:#999">Prototype</span><span style="color:#999">Inspect</span></div>
          <div style="color:#999">Frame</div>
          <div class="row" style="gap:8px">${["X 12", "Y 78", "W 536", "H 66"].map((v) => `<div style="flex:1;background:#f5f5f5;padding:5px 6px;border-radius:3px">${v}</div>`).join("")}</div>
          <div style="color:#999">Auto layout</div>
          <div class="row" style="gap:8px"><div style="flex:1;background:#f5f5f5;padding:5px 6px;border-radius:3px">↔ 12</div><div style="flex:1;background:#f5f5f5;padding:5px 6px;border-radius:3px">⊡ 16</div></div>
          <div style="color:#999">Fill</div>
          <div class="row" style="gap:8px;align-items:center"><div style="width:18px;height:18px;border-radius:3px;background:#ffffff;border:1px solid #ddd"></div>FFFFFF <span style="margin-left:auto">100%</span></div>
          <div style="color:#999">Stroke</div>
          <div class="row" style="gap:8px;align-items:center"><div style="width:18px;height:18px;border-radius:3px;background:#e5e7eb"></div>E5E7EB <span style="margin-left:auto">1 px</span></div>
          <div style="color:#999">Effects</div>
          <div>Drop shadow · 0 2 10 12%</div>
          <div style="color:#999">Typography</div>
          <div>Inter · Semi Bold · 14/20</div>
        </div>
      </div>
    </div>`;
}

function postman(): string {
  const json = `{
  "employeeId": "emp_7f3a21",
  "name": "Ananya Sharma",
  "range": { "from": "2026-09-14", "to": "2026-09-20" },
  "days": [
    { "date": "2026-09-14", "activeHours": 7.8, "idleHours": 0.6, "overtimeHours": 1.2 },
    { "date": "2026-09-15", "activeHours": 8.1, "idleHours": 0.4, "overtimeHours": 0.9 },
    { "date": "2026-09-16", "activeHours": 7.4, "idleHours": 0.9, "overtimeHours": 0.0 },
    { "date": "2026-09-17", "activeHours": 8.6, "idleHours": 0.3, "overtimeHours": 1.6 },
    { "date": "2026-09-18", "activeHours": 7.9, "idleHours": 0.5, "overtimeHours": 0.4 }
  ],
  "totals": { "activeHours": 39.8, "overtimeHours": 4.1, "productivity": 91 }
}`;
  const jsonHtml = json.split("\n").map((l, i) => `<div class="row"><span style="width:36px;color:#999;text-align:right;padding-right:14px">${i + 1}</span><span style="white-space:pre">${esc(l).replace(/(&quot;|")([^"]+)"(?=:)/g, '<span style="color:#a31515">"$2"</span>').replace(/: "([^"]+)"/g, ': <span style="color:#0451a5">"$1"</span>').replace(/: ([\d.]+)/g, ': <span style="color:#098658">$1</span>')}</span></div>`).join("");
  const tree = ["Auth", "  POST Login", "  POST Refresh", "Employees", "  GET List employees", "  PATCH Update employee", "Reports", "  GET Timesheet", "  GET Productivity", "  GET Apps & sites", "Screenshots", "  GET List screenshots", "  DEL Delete screenshot", "Agent", "  POST Heartbeat", "  POST Upload batch"];
  const mColor = (s: string) => (s.includes("GET") ? "#0cbb52" : s.includes("POST") ? "#ffb400" : s.includes("PATCH") ? "#9012fe" : s.includes("DEL") ? "#eb2013" : "#333");
  return `<div class="col" style="flex:1">
    <div class="row" style="height:46px;background:#fff;border-bottom:1px solid #e6e6e6;align-items:center;padding:0 16px;gap:18px;font-size:13.5px;color:#555"><b style="color:#ff6c37;font-size:18px">◉</b><span>Home</span><span>Workspaces ⌄</span><span>API Network</span><div style="flex:1;max-width:420px;margin:0 auto;background:#f2f2f2;border-radius:6px;padding:6px 12px;color:#888">⌕ Search Postman</div><span class="btn" style="background:#ff6c37;color:#fff">Invite</span></div>
    <div class="row" style="flex:1;min-height:0">
      <div class="col" style="width:280px;border-right:1px solid #e6e6e6;font-size:13.5px">
        <div class="row" style="padding:12px 14px;gap:10px;border-bottom:1px solid #eee"><b>Northwind API</b><span style="margin-left:auto;color:#888">＋ ⋯</span></div>
        ${tree.map((t) => { const leaf = t.startsWith("  "); const [m, ...rest] = t.trim().split(" "); return `<div class="row ell" style="padding:5px 14px 5px ${leaf ? 34 : 14}px;gap:8px;${t.includes("Timesheet") ? "background:#f2f2f2" : ""}">${leaf ? `<span style="color:${mColor(m)};font-size:10.5px;font-weight:800;width:36px">${m}</span>${rest.join(" ")}` : `📁 ${t}`}</div>`; }).join("")}
      </div>
      <div class="col" style="flex:1;min-width:0">
        <div class="row" style="background:#f9f9f9;border-bottom:1px solid #e6e6e6;font-size:13px">${["GET Timesheet", "POST Login", "GET Productivity"].map((t, i) => `<div style="padding:10px 16px;${i === 0 ? "background:#fff;border-top:2px solid #ff6c37" : "color:#666"}"><span style="color:${mColor(t)};font-weight:700;font-size:11px">${t.split(" ")[0]}</span> ${t.split(" ")[1]}</div>`).join("")}</div>
        <div class="row" style="padding:14px 16px;gap:10px">
          <div class="row" style="flex:1;border:1px solid #ddd;border-radius:6px;font-size:14px;overflow:hidden"><div style="padding:9px 14px;color:#0cbb52;font-weight:800;border-right:1px solid #ddd">GET ⌄</div><div class="mono" style="padding:9px 14px"><span style="color:#e97b00">{{baseUrl}}</span>/api/reports/timesheet?employeeId=emp_7f3a21&amp;from=2026-09-14&amp;to=2026-09-20</div></div>
          <span class="btn" style="background:#0265d2;color:#fff;padding:9px 24px">Send</span>
        </div>
        <div class="row" style="padding:0 16px;gap:22px;font-size:13.5px;color:#666;border-bottom:1px solid #eee"><span>Params <sup style="color:#0cbb52">●</sup></span><span style="color:#212121;border-bottom:2px solid #ff6c37;padding-bottom:8px">Authorization</span><span>Headers (8)</span><span>Body</span><span>Scripts</span><span>Tests</span><span>Settings</span></div>
        <div class="row" style="padding:14px 16px;gap:30px;font-size:13.5px"><div class="col" style="gap:6px;width:260px"><span style="color:#666">Auth Type</span><div style="border:1px solid #ddd;border-radius:6px;padding:7px 10px">Bearer Token ⌄</div></div><div class="col" style="gap:6px;flex:1"><span style="color:#666">Token</span><div class="mono" style="border:1px solid #ddd;border-radius:6px;padding:7px 10px;color:#e97b00">{{accessToken}}</div></div></div>
        <div class="row" style="padding:10px 16px;gap:22px;font-size:13.5px;border-top:1px solid #eee;border-bottom:1px solid #eee;align-items:center"><b>Body</b><span style="color:#666">Cookies</span><span style="color:#666">Headers (11)</span><span style="color:#666">Test Results (3/3)</span><span style="margin-left:auto;color:#0cbb52;font-weight:700">200 OK</span><span style="color:#666">142 ms</span><span style="color:#666">1.8 KB</span></div>
        <div class="row" style="padding:8px 16px;gap:14px;font-size:12.5px;color:#666"><span style="background:#f2f2f2;padding:3px 10px;border-radius:4px;color:#212121">Pretty</span><span>Raw</span><span>Preview</span><span>Visualize</span><span style="background:#f2f2f2;padding:3px 10px;border-radius:4px">JSON ⌄</span></div>
        <div class="mono" style="padding:6px 16px;font-size:13.5px;line-height:1.6;color:#212121">${jsonHtml}</div>
      </div>
    </div>
  </div>`;
}

function notion(): string {
  const table = [["Ship shift-aware timesheets", "Ananya Sharma", "Done", "#dbeddb", "Sep 12"], ["Per-plan storage quotas", "Rohan Verma", "Done", "#dbeddb", "Sep 15"], ["Linux agent (X11)", "Meera Iyer", "In review", "#fdecc8", "Sep 24"], ["Webcam consent flow", "Kabir Singh", "In progress", "#d3e5ef", "Sep 30"], ["Data export worker", "Priya Nair", "Not started", "#e3e2e0", "Oct 06"]];
  const pages = ["🏠 Home", "🎯 OKRs Q3 2026", "📅 Sprint board", "🧭 Roadmap", "📚 Engineering wiki", "🤝 Customer notes", "🗓 Meeting notes", "🧪 Experiments"];
  return `<div class="col" style="width:250px;background:#f7f7f5;font-size:14px;color:#5f5e5b;padding:10px 6px">
      <div class="row" style="padding:6px 10px;gap:8px;align-items:center;color:#37352f;font-weight:600">${avatar("Northwind Digital", 4, 22)}Northwind Digital ⌄</div>
      <div style="padding:5px 10px">⌕ Search</div><div style="padding:5px 10px">✦ Notion AI</div><div style="padding:5px 10px">⌂ Home</div><div style="padding:5px 10px">✉ Inbox</div>
      <div style="padding:14px 10px 4px;font-size:12px;font-weight:600">Workspace</div>
      ${pages.map((p) => `<div style="padding:5px 10px;border-radius:4px;${p.includes("OKRs") ? "background:#ebebea;color:#37352f;font-weight:600" : ""}">${p}</div>`).join("")}
    </div>
    <div class="col" style="flex:1;min-width:0">
      <div class="row" style="padding:10px 16px;font-size:13.5px;color:#37352f;gap:8px"><span>Engineering</span>/<span>🎯 OKRs Q3 2026</span><span style="margin-left:auto;color:#999">Edited 2h ago</span><span>Share</span><span>☆</span></div>
      <div style="height:130px;background:linear-gradient(120deg,#a18cd1,#fbc2eb)"></div>
      <div class="col" style="padding:0 110px;margin-top:-34px;gap:12px;color:#37352f">
        <div style="font-size:60px;line-height:1">🎯</div>
        <div style="font-size:38px;font-weight:700">OKRs Q3 2026</div>
        <div class="row" style="gap:40px;font-size:14px;color:#787774"><span>👤 Owner&nbsp;&nbsp;<b style="color:#37352f">Ananya Sharma</b></span><span>📅 Quarter&nbsp;&nbsp;<b style="color:#37352f">Jul – Sep</b></span><span>✅ Progress&nbsp;&nbsp;<b style="color:#37352f">72%</b></span></div>
        <div style="font-size:23px;font-weight:600;margin-top:8px">Objective: Make every hour visible</div>
        <div style="font-size:16px;line-height:1.6">Customers should be able to answer "who worked when, on what" without exporting a spreadsheet.</div>
        ${["KR1 — 95% of timesheets reconcile with payroll without edits", "KR2 — Overtime & late-login flags on every report", "KR3 — p95 report load under 800 ms for 500-seat orgs"].map((k, i) => `<div class="row" style="gap:10px;font-size:16px;align-items:center"><span style="width:18px;height:18px;border:1.5px solid ${i < 2 ? "#2383e2" : "#999"};background:${i < 2 ? "#2383e2" : "#fff"};border-radius:3px;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center">${i < 2 ? "✓" : ""}</span><span style="${i < 2 ? "color:#9b9a97;text-decoration:line-through" : ""}">${k}</span></div>`).join("")}
        <div style="font-size:18px;font-weight:600;margin-top:8px">Initiatives</div>
        <div style="border-top:1px solid #e9e9e7;font-size:14px">
          <div class="row" style="color:#787774;border-bottom:1px solid #e9e9e7;padding:7px 0"><div style="flex:2">Aa Name</div><div style="flex:1">Owner</div><div style="flex:1">Status</div><div style="width:90px">Due</div></div>
          ${table.map(([n, o, s, c, d], i) => `<div class="row" style="border-bottom:1px solid #e9e9e7;padding:7px 0;align-items:center"><div style="flex:2;font-weight:500">📄 ${n}</div><div class="row" style="flex:1;gap:6px;align-items:center">${avatar(o, i, 20, true)}${o}</div><div style="flex:1"><span style="background:${c};padding:2px 8px;border-radius:4px">${s}</span></div><div style="width:90px;color:#787774">${d}</div></div>`).join("")}
        </div>
      </div>
    </div>`;
}

function github(): string {
  const files = [["📁", ".github/workflows", "ci: cache prisma engines between jobs", "2 days ago"], ["📁", "apps/api", "reports: split overtime at local midnight", "3 hours ago"], ["📁", "apps/agent", "agent: bound the reconnect backoff", "yesterday"], ["📁", "apps/dashboard", "timesheets: add overtime column", "3 hours ago"], ["📁", "packages/shared", "shared: export ActivityCategory", "last week"], ["📁", "infra", "compose: pin postgres 16.4", "2 weeks ago"], ["📄", ".gitignore", "chore: ignore release keys", "last week"], ["📄", "README.md", "docs: local dev quickstart", "last week"], ["📄", "package.json", "chore(deps): bump prisma to 5.20", "5 days ago"], ["📄", "tsconfig.base.json", "build: strict null checks everywhere", "last month"]];
  return `<div class="col" style="flex:1;background:#fff">
    <div class="row" style="background:#f6f8fa;border-bottom:1px solid #d0d7de;padding:14px 32px;align-items:center;gap:14px;font-size:14px">
      <svg width="30" height="30" viewBox="0 0 16 16"><path fill="#1f2328" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <span style="font-size:16px">northwind-digital / <b>platform-api</b></span><span class="pill" style="border:1px solid #d0d7de;color:#59636e;font-weight:500">Private</span>
      <div style="margin-left:auto;border:1px solid #d0d7de;border-radius:6px;padding:5px 12px;color:#59636e;width:280px">⌕ Type / to search</div>
    </div>
    <div class="row" style="padding:0 32px;gap:22px;font-size:14px;border-bottom:1px solid #d0d7de;background:#f6f8fa">${["‹› Code", "⊙ Issues 14", "⇅ Pull requests 6", "▶ Actions", "▦ Projects", "⚐ Security", "↗ Insights"].map((t, i) => `<div style="padding:10px 2px;${i === 0 ? "border-bottom:2px solid #fd8c73;font-weight:600" : "color:#59636e"}">${t}</div>`).join("")}</div>
    <div class="row" style="padding:22px 32px;gap:26px;flex:1;min-height:0">
      <div class="col" style="flex:1;gap:14px;min-width:0">
        <div class="row" style="gap:10px;font-size:14px"><span class="btn" style="border:1px solid #d0d7de;background:#f6f8fa">⑂ main ⌄</span><span style="color:#59636e;align-self:center">⑂ 12 branches  ◇ 38 tags</span><span class="btn" style="margin-left:auto;background:#1f883d;color:#fff">‹› Code ⌄</span></div>
        <div style="border:1px solid #d0d7de;border-radius:6px;overflow:hidden;font-size:14px">
          <div class="row" style="background:#f6f8fa;padding:12px 16px;gap:10px;align-items:center;border-bottom:1px solid #d0d7de">${avatar("Ananya Sharma", 0, 22, true)}<b>ananya-sharma</b><span style="color:#59636e">reports: split overtime at local midnight (#482)</span><span style="margin-left:auto;color:#59636e">✓ 3f9c2e1 · 3 hours ago · 🕒 1,284 commits</span></div>
          ${files.map(([ic, n, m, t]) => `<div class="row" style="padding:9px 16px;border-bottom:1px solid #eaeef2;gap:10px"><span style="width:18px;color:${ic === "📁" ? "#54aeff" : "#59636e"}">${ic}</span><span style="width:220px">${n}</span><span style="flex:1;color:#59636e" class="ell">${m}</span><span style="color:#59636e">${t}</span></div>`).join("")}
        </div>
        <div style="border:1px solid #d0d7de;border-radius:6px;padding:16px 22px;font-size:15px;line-height:1.6">
          <div style="font-size:12.5px;font-weight:600;margin-bottom:10px">📖 README</div>
          <div style="font-size:26px;font-weight:600;border-bottom:1px solid #d0d7de;padding-bottom:6px;margin-bottom:10px">Northwind Platform API</div>
          NestJS service behind the Northwind dashboard and agents. Local dev runs on SQLite with no Docker: <code class="mono" style="background:#eff1f3;padding:2px 6px;border-radius:4px;font-size:13px">npm install &amp;&amp; npm run dev:api</code>
        </div>
      </div>
      <div class="col" style="width:290px;gap:14px;font-size:14px;color:#1f2328">
        <b style="font-size:16px">About</b><div style="color:#59636e">Employee activity, timesheets and reporting API.</div>
        <div class="row" style="gap:6px;flex-wrap:wrap">${["nestjs", "prisma", "typescript", "postgres"].map((t) => `<span class="pill" style="background:#ddf4ff;color:#0969da">${t}</span>`).join("")}</div>
        <div style="color:#59636e;line-height:1.9">📖 Readme<br>⚖ MIT license<br>☆ 48 stars<br>👁 9 watching<br>⑂ 6 forks</div>
        <b style="font-size:16px;border-top:1px solid #d0d7de;padding-top:14px">Languages</b>
        <div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#3178c6 0 82%,#f1e05a 0 91%,#384d54 0 96%,#89e051 0)"></div>
        <div style="color:#59636e;font-size:13px">● TypeScript 82.1%  ● JavaScript 9.4%  ● Dockerfile 4.6%  ● Shell 3.9%</div>
      </div>
    </div>
  </div>`;
}

function stackoverflow(): string {
  const code1 = `const spans = await prisma.activitySpan.findMany({\n  where: { startedAt: { gte: from, lte: to } },\n});\n// spans on the last day are missing?`;
  const code2 = `// Treat "to" as a calendar day, not an instant:\nconst end = new Date(to);\nend.setDate(end.getDate() + 1);\nwhere: { startedAt: { gte: from, lt: end } }`;
  const block = (c: string) => `<div class="mono" style="background:#f6f6f6;border-radius:6px;padding:12px 14px;font-size:13.5px;line-height:1.55;white-space:pre;color:#0c0d0e">${esc(c)}</div>`;
  return `<div class="col" style="flex:1">
    <div class="row" style="height:52px;border-top:3px solid #f48225;box-shadow:0 1px 2px rgba(0,0,0,.1);align-items:center;padding:0 40px;gap:18px;font-size:14px"><b style="font-size:19px">stack<span style="font-weight:800">overflow</span></b><span style="color:#525960">Products</span><div style="flex:1;border:1px solid #babfc4;border-radius:5px;padding:7px 10px;color:#838c95">⌕ Search…</div><span class="btn" style="border:1px solid #7aa7c7;background:#e1ecf4;color:#39739d">Log in</span></div>
    <div class="row" style="flex:1;min-height:0;padding:0 40px">
      <div class="col" style="width:170px;padding-top:24px;gap:12px;font-size:13.5px;color:#525960"><span>Home</span><span style="background:#f1f2f3;color:#0c0d0e;font-weight:700;padding:6px 8px;border-right:3px solid #f48225">🌐 Questions</span><span>Tags</span><span>Users</span><span>Companies</span><span>Collectives</span></div>
      <div class="col" style="flex:1;padding:24px;gap:12px;min-width:0;border-left:1px solid #d6d9dc">
        <div style="font-size:26px;color:#3b4045">Prisma date filter drops the last day of a date range</div>
        <div class="row" style="gap:18px;font-size:13px;color:#6a737c;border-bottom:1px solid #e3e6e8;padding-bottom:10px"><span>Asked 2 years ago</span><span>Modified 3 months ago</span><span>Viewed 41k times</span></div>
        <div class="row" style="gap:18px">
          <div class="col" style="align-items:center;gap:6px;color:#6a737c;width:40px"><span style="font-size:22px">▲</span><b style="font-size:21px;color:#232629">128</b><span style="font-size:22px">▼</span><span>🔖</span></div>
          <div class="col" style="gap:10px;flex:1;font-size:15px;line-height:1.55"><div>My report query uses <code class="mono" style="background:#e3e6e8;padding:1px 4px">lte: to</code> where <code class="mono" style="background:#e3e6e8;padding:1px 4px">to</code> is <code class="mono" style="background:#e3e6e8;padding:1px 4px">2026-09-20</code>, but nothing logged on the 20th comes back:</div>${block(code1)}
            <div class="row" style="gap:6px">${["javascript", "prisma", "date", "timezone"].map((t) => `<span style="background:#e1ecf4;color:#39739d;font-size:12px;padding:3px 7px;border-radius:4px">${t}</span>`).join("")}</div></div>
        </div>
        <div style="font-size:19px;margin-top:6px">3 Answers</div>
        <div class="row" style="gap:18px;border-top:1px solid #e3e6e8;padding-top:14px">
          <div class="col" style="align-items:center;gap:6px;color:#6a737c;width:40px"><span style="font-size:22px">▲</span><b style="font-size:21px;color:#232629">214</b><span style="font-size:22px">▼</span><span style="color:#2f6f44;font-size:24px">✔</span></div>
          <div class="col" style="gap:10px;flex:1;font-size:15px;line-height:1.55"><span><code class="mono" style="background:#e3e6e8;padding:1px 4px">new Date("2026-09-20")</code> is midnight at the <i>start</i> of that day, so <code class="mono" style="background:#e3e6e8;padding:1px 4px">lte</code> excludes every event later that day. Use an exclusive upper bound one day later:</span>${block(code2)}</div>
        </div>
      </div>
      <div class="col" style="width:300px;padding:24px 0 0 24px;gap:14px">
        <div style="background:#fdf7e2;border:1px solid #f1e5bc;border-radius:5px;font-size:13px"><div style="background:#fbf3d5;padding:10px 14px;font-weight:700;border-bottom:1px solid #f1e5bc">The Overflow Blog</div><div style="padding:10px 14px;line-height:1.7">✎ Timezones are hard, dates are harder<br>✎ How we cut p95 latency by 60%</div></div>
        <div style="font-size:17px;color:#232629">Linked</div>
        <div style="font-size:13px;line-height:2;color:#0074cc">${["Compare dates without time in JS", "Prisma: filter by day in a timezone", "Inclusive date range in SQL", "Why is my Date off by one day?"].map((t, i) => `<div><span style="background:${i % 2 ? "#5eba7d" : "#e3e6e8"};color:${i % 2 ? "#fff" : "#232629"};padding:1px 6px;border-radius:3px;margin-right:8px">${[42, 17, 88, 305][i]}</span>${t}</div>`).join("")}</div>
      </div>
    </div>
  </div>`;
}

function googleDocs(): string {
  const para = (t: string) => `<p style="font-size:15px;line-height:1.7;margin-bottom:12px;color:#202124">${t}</p>`;
  return `<div class="col" style="flex:1;background:#f9fbfd">
    <div class="row" style="padding:8px 16px;align-items:center;gap:12px;background:#f9fbfd"><div style="width:28px;height:36px;background:#4285f4;border-radius:3px"></div><div class="col"><span style="font-size:18px">Q3 Customer Review — Meridian Freight</span><span style="font-size:13px;color:#444;word-spacing:10px">File Edit View Insert Format Tools Extensions Help</span></div><div class="row" style="margin-left:auto;gap:-4px">${["Priya Nair", "Arjun Mehta"].map((n, i) => avatar(n, i + 3, 28, true)).join("")}</div><span class="btn" style="background:#c2e7ff;border-radius:18px;padding:9px 22px">🔒 Share</span></div>
    <div class="row" style="margin:0 16px;padding:6px 14px;gap:14px;background:#edf2fa;border-radius:20px;font-size:13.5px;color:#444"><span>↶ ↷ 🖨</span><span>100% ⌄</span><span>Normal text ⌄</span><span>Arial ⌄</span><span>— 11 +</span><b>B</b><i>I</i><u>U</u><span>A</span><span>🔗 💬 🖼</span><span>≡ ≣</span></div>
    <div class="row" style="flex:1;min-height:0;justify-content:center;padding-top:18px;gap:24px">
      <div class="col" style="width:210px;gap:8px;font-size:13px;color:#444;padding-top:10px"><b style="font-size:13px">Document tabs</b><span style="color:#1a73e8;padding-left:10px">Summary</span><span style="padding-left:20px">Usage this quarter</span><span style="padding-left:20px">Open issues</span><span style="padding-left:20px">Renewal</span></div>
      <div style="width:816px;background:#fff;box-shadow:0 1px 3px rgba(60,64,67,.3);padding:64px 90px;overflow:hidden">
        <div style="font-size:30px;margin-bottom:6px">Q3 Customer Review</div>
        <div style="font-size:16px;color:#5f6368;margin-bottom:22px">Meridian Freight Co. · prepared by Priya Nair · 18 Sep 2026</div>
        <div style="font-size:20px;margin-bottom:10px;color:#1f1f1f">Summary</div>
        ${para("Meridian rolled Workk out to all 142 seats across two warehouses in July. Adoption is strong: 96% of devices reported daily, and supervisors now approve timesheets in the dashboard instead of the old spreadsheet.")}
        ${para("Their main ask is overtime visibility for the evening shift. Since shift-aware timesheets shipped in 2.14, overtime is flagged automatically, and last month's payroll reconciled with <b>zero manual edits</b>.")}
        <div style="font-size:20px;margin:6px 0 10px;color:#1f1f1f">Usage this quarter</div>
        <div style="border:1px solid #dadce0;font-size:14px">${[["Metric", "July", "August", "September"], ["Active seats", "128", "139", "142"], ["Avg. productive hours / day", "6.4", "6.9", "7.1"], ["Late logins flagged", "61", "38", "22"]].map((r, i) => `<div class="row" style="${i === 0 ? "background:#f1f3f4;font-weight:700" : ""};border-bottom:1px solid #dadce0">${r.map((c, j) => `<div style="flex:${j ? 1 : 2};padding:7px 10px;border-right:1px solid #dadce0">${c}</div>`).join("")}</div>`).join("")}</div>
      </div>
      <div class="col" style="width:230px;padding-top:120px"><div style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(60,64,67,.3);padding:12px;font-size:13px;line-height:1.5"><div class="row" style="gap:8px;align-items:center;margin-bottom:6px">${avatar("Arjun Mehta", 4, 24, true)}<b>Arjun Mehta</b></div>Can we add the warehouse split here? They asked on the call.<div style="color:#1a73e8;margin-top:6px">Reply</div></div></div>
    </div>
  </div>`;
}

function gmail(): string {
  const mails: [string, string, string, string, boolean][] = [
    ["Meridian Freight", "Timesheet export for August", "Hi Priya, could you send the August timesheets as CSV? Our payroll team closes on the…", "10:42 AM", true],
    ["GitHub", "[northwind/platform-api] PR #482 approved", "rohan-verma approved these changes: reports: split overtime at local midnight…", "10:31 AM", true],
    ["Google Calendar", "Invitation: Sprint review @ Thu 4pm", "Ananya Sharma has invited you to Sprint review. Join with Google Meet…", "10:02 AM", false],
    ["Solstice Retail Group", "Re: Onboarding 40 new seats", "Thanks for the quick setup! The install tokens worked on all the new laptops…", "9:48 AM", true],
    ["Linear", "3 issues assigned to you", "NW-214 Add overtime column to CSV export · NW-219 Late-login threshold…", "9:15 AM", false],
    ["Notion", "Ananya mentioned you in OKRs Q3 2026", "@Priya can you confirm KR2 numbers before Friday's review?", "8:57 AM", false],
    ["Razorpay", "Payment received ₹48,200", "Invoice INV-2026-0917 from Meridian Freight Co. has been paid in full…", "Yesterday", false],
    ["AWS", "Your September bill is available", "Your AWS bill for the period September 1 – 30 is now available to view…", "Yesterday", false],
    ["Kabir Singh", "Release notes draft 2.15", "Here's the first pass. I kept it short: overtime split, Linux agent beta…", "Sep 21", false],
    ["Figma", "Devansh shared \"Workk Dashboard v3\"", "Devansh Rao invited you to edit a file. Open in Figma →", "Sep 21", false],
    ["Slack", "You have 4 unread mentions", "#cs-escalations: Priya, any update on Meridian's export request?", "Sep 20", false],
    ["Zoom", "Cloud recording available", "Your cloud recording \"Meridian QBR\" is now available. 52 min…", "Sep 20", false],
    ["Canva", "Your design is ready to download", "\"Q3 review slides\" was exported as PDF. Download link expires in 7 days…", "Sep 19", false],
  ];
  return `<div class="col" style="flex:1;background:#f6f8fc">
    <div class="row" style="padding:10px 18px;align-items:center;gap:18px"><span style="font-size:20px;color:#5f6368">☰</span><span style="font-size:22px;color:#5f6368"><b style="color:#ea4335">M</b> Gmail</span><div style="flex:1;max-width:720px;background:#e9eef6;border-radius:24px;padding:12px 20px;color:#5f6368;font-size:15px">⌕ Search mail</div><span style="margin-left:auto;color:#5f6368;font-size:18px">? ⚙ ⋮⋮⋮</span>${avatar("Priya Nair", 4, 32, true)}</div>
    <div class="row" style="flex:1;min-height:0">
      <div class="col" style="width:250px;padding:6px 8px;gap:2px;font-size:14px;color:#202124">
        <div style="background:#c2e7ff;border-radius:16px;padding:16px 22px;font-weight:600;width:140px;margin-bottom:10px">✎ Compose</div>
        ${[["📥 Inbox", "4"], ["☆ Starred", ""], ["🕒 Snoozed", ""], ["➤ Sent", ""], ["📄 Drafts", "2"], ["🏷 Customers", ""], ["🏷 Billing", ""], ["⌄ More", ""]].map(([l, c], i) => `<div class="row" style="padding:7px 22px;border-radius:0 16px 16px 0;${i === 0 ? "background:#d3e3fd;font-weight:700" : ""}"><span>${l}</span><span style="margin-left:auto">${c}</span></div>`).join("")}
      </div>
      <div class="col" style="flex:1;min-width:0;background:#fff;border-radius:16px;margin:0 16px 16px 0;overflow:hidden">
        <div class="row" style="padding:10px 16px;gap:20px;color:#5f6368;font-size:15px"><span>☐ ⌄</span><span>↻</span><span>⋮</span><span style="margin-left:auto;font-size:13px">1–50 of 2,184  ‹ ›</span></div>
        <div class="row" style="font-size:14px;border-bottom:1px solid #eee">${[["📥 Primary", "#0b57d0"], ["🏷 Promotions", ""], ["👥 Social", ""], ["ⓘ Updates", ""]].map(([t, c]) => `<div style="flex:1;padding:12px 18px;${c ? `color:${c};border-bottom:3px solid ${c};font-weight:600` : "color:#5f6368"}">${t}</div>`).join("")}</div>
        ${mails.map(([f, s, p, t, unread]) => `<div class="row" style="padding:0 16px;height:40px;align-items:center;gap:14px;border-bottom:1px solid #f1f1f1;font-size:14px;${unread ? "background:#fff" : "background:#f2f6fc"}"><span style="color:#aaa">☐ ☆</span><span class="ell" style="width:190px;${unread ? "font-weight:700" : ""}">${f}</span><span class="ell" style="flex:1"><span style="${unread ? "font-weight:700" : ""}">${s}</span> <span style="color:#5f6368">– ${p}</span></span><span style="width:74px;text-align:right;${unread ? "font-weight:700" : "color:#5f6368"};font-size:12.5px">${t}</span></div>`).join("")}
      </div>
    </div>
  </div>`;
}

function jira(): string {
  const cols: [string, [string, string, string, string][]][] = [
    ["TO DO 4", [["NW-221", "Late-login threshold per shift", "Story", "Kabir Singh"], ["NW-224", "Bulk update: webcam toggle copy", "Task", "Meera Iyer"], ["NW-226", "Retention: purge screenshots after 90 days", "Story", "Rohan Verma"], ["NW-229", "Agent: pause tracking on lock screen", "Bug", "Kabir Singh"], ["NW-231", "Show device OS on employee card", "Task", "Meera Iyer"], ["NW-233", "Weekly digest email for managers", "Story", "Priya Nair"]]],
    ["IN PROGRESS 3", [["NW-214", "Overtime column in CSV export", "Story", "Ananya Sharma"], ["NW-217", "Linux agent: Wayland idle fallback", "Task", "Meera Iyer"], ["NW-219", "Timesheet approvals for managers", "Story", "Priya Nair"], ["NW-222", "Screenshot blur for sensitive apps", "Story", "Rohan Verma"], ["NW-225", "Idle threshold per team", "Task", "Kabir Singh"]]],
    ["IN REVIEW 2", [["NW-482", "Split overtime at local midnight", "Bug", "Ananya Sharma"], ["NW-208", "Storage quota warning banner", "Task", "Rohan Verma"], ["NW-212", "Live view: reconnect after sleep", "Bug", "Meera Iyer"], ["NW-215", "Website blocklist import (CSV)", "Story", "Kabir Singh"]]],
    ["DONE 5", [["NW-201", "Shift-aware timesheets", "Story", "Ananya Sharma"], ["NW-198", "Date range drops final day", "Bug", "Rohan Verma"], ["NW-195", "Per-plan storage quotas", "Story", "Rohan Verma"], ["NW-190", "Webcam confirm-before-enable", "Story", "Kabir Singh"], ["NW-186", "Agent auto-update (Windows)", "Story", "Ananya Sharma"]]],
  ];
  const typeIcon = (t: string) => (t === "Bug" ? `<span style="background:#e5493a;color:#fff;border-radius:3px;font-size:10px;padding:0 4px">●</span>` : t === "Story" ? `<span style="background:#63ba3c;color:#fff;border-radius:3px;font-size:10px;padding:0 4px">▮</span>` : `<span style="background:#4bade8;color:#fff;border-radius:3px;font-size:10px;padding:0 4px">✓</span>`);
  return `<div class="col" style="width:240px;background:#f7f8f9;border-right:1px solid #dfe1e6;font-size:14px;color:#44546f;padding:14px 8px;gap:4px">
      <div class="row" style="gap:10px;align-items:center;padding:6px 10px;color:#172b4d"><div class="avatar" style="width:30px;height:30px;flex-basis:30px;background:#6554c0">P</div><div class="col"><b style="font-size:14px">Platform</b><span style="font-size:12px;color:#626f86">Software project</span></div></div>
      <div style="padding:14px 10px 4px;font-size:11.5px;font-weight:700">PLANNING</div>
      ${["⎍ Timeline", "▦ Board", "☰ Backlog", "⚑ Releases", "⊙ Issues", "▤ Reports", "⚙ Components"].map((l, i) => `<div style="padding:7px 10px;border-radius:3px;${i === 1 ? "background:#e9f2ff;color:#0c66e4;font-weight:600" : ""}">${l}</div>`).join("")}
    </div>
    <div class="col" style="flex:1;min-width:0;padding:18px 26px;gap:14px">
      <div style="font-size:13px;color:#626f86">Projects / Platform</div>
      <div class="row" style="align-items:center"><b style="font-size:24px;color:#172b4d">NW Sprint 38</b><span style="margin-left:auto;font-size:13px;color:#626f86">🕒 4 days remaining</span><span class="btn" style="background:#f1f2f4;margin-left:10px">Complete sprint</span></div>
      <div class="row" style="gap:10px;align-items:center"><div style="border:2px solid #dfe1e6;border-radius:3px;padding:5px 10px;width:200px;color:#626f86;font-size:14px">⌕ Search board</div><div class="row">${["Ananya Sharma", "Rohan Verma", "Meera Iyer", "Kabir Singh", "Priya Nair"].map((n, i) => avatar(n, i, 32, true)).join("")}</div><span style="color:#44546f;font-size:14px;margin-left:10px">Epic ⌄  Type ⌄  Quick filters ⌄</span></div>
      <div class="row" style="gap:12px;flex:1;min-height:0">
        ${cols.map(([name, cards]) => `<div class="col" style="flex:1;background:#f7f8f9;border-radius:6px;padding:10px;gap:8px"><div style="font-size:12.5px;font-weight:700;color:#626f86;padding:4px">${name}</div>${cards.map(([k, t, ty, who], i) => `<div class="col" style="background:#fff;border-radius:4px;box-shadow:0 1px 1px rgba(9,30,66,.25);padding:12px;gap:14px;font-size:14px;color:#172b4d"><span style="line-height:1.4;${name.startsWith("DONE") ? "text-decoration:line-through;color:#626f86" : ""}">${t}</span><div class="row" style="align-items:center;gap:8px">${typeIcon(ty)}<span style="font-size:12.5px;color:#626f86;${name.startsWith("DONE") ? "text-decoration:line-through" : ""}">${k}</span><span style="margin-left:auto;background:#dfe1e6;border-radius:8px;font-size:11.5px;padding:0 6px">${[3, 5, 2, 8][i % 4]}</span>${avatar(who, ["Ananya Sharma", "Rohan Verma", "Meera Iyer", "Kabir Singh", "Priya Nair"].indexOf(who), 24, true)}</div></div>`).join("")}</div>`).join("")}
      </div>
    </div>`;
}

function linear(): string {
  const groups: [string, string, [string, string, string, string, string][]][] = [
    ["In Progress", "#f2c94c", [["NW-214", "Overtime column in CSV export", "Reports", "Sep 26", "▲▲▲"], ["NW-217", "Linux agent: Wayland idle fallback", "Agent", "Sep 30", "▲▲"], ["NW-219", "Timesheet approvals for managers", "Dashboard", "Oct 02", "▲▲"]]],
    ["Todo", "#bdbdbd", [["NW-221", "Late-login threshold per shift", "Reports", "Oct 04", "▲▲"], ["NW-224", "Bulk update: webcam toggle copy", "Dashboard", "Oct 04", "▲"], ["NW-226", "Purge screenshots after retention window", "API", "Oct 08", "▲▲▲"], ["NW-229", "Pause tracking on lock screen", "Agent", "Oct 10", "▲▲"], ["NW-231", "Show device OS on employee card", "Dashboard", "Oct 11", "▲"]]],
    ["Backlog", "#8a8f98", [["NW-233", "Weekly digest email for managers", "API", "—", "▲"], ["NW-235", "Dark mode for dashboard", "Dashboard", "—", "▲"], ["NW-238", "SAML SSO for enterprise plan", "Auth", "—", "▲▲"], ["NW-240", "Export productivity report as PDF", "Reports", "—", "▲"], ["NW-241", "Keyboard shortcuts in screenshot viewer", "Dashboard", "—", "▲"], ["NW-243", "Rate-limit agent uploads per device", "API", "—", "▲▲"], ["NW-244", "Per-team website blocking rules", "Agent", "—", "▲▲▲"], ["NW-246", "Holiday calendar for absence reports", "Reports", "—", "▲"], ["NW-248", "Audit log for admin actions", "Auth", "—", "▲▲"]]],
  ];
  return `<div class="col" style="width:240px;background:#f5f5f5;border-right:1px solid #e6e6e6;font-size:14px;color:#3c3c43;padding:12px 10px;gap:3px">
      <div class="row" style="gap:8px;align-items:center;padding:4px 8px;font-weight:600;color:#1b1b1f">${avatar("Northwind", 5, 22)}Northwind ⌄</div>
      ${["✉ Inbox", "◎ My issues", "⋯ Views"].map((l, i) => `<div style="padding:6px 8px;border-radius:5px;${i === 1 ? "background:#e6e6ea;font-weight:600" : ""}">${l}</div>`).join("")}
      <div style="padding:14px 8px 4px;font-size:12px;color:#8a8f98">Your teams</div>
      ${["⬡ Platform", "    Issues", "    Cycles", "    Projects", "⬡ Customer Success", "⬡ Design"].map((l) => `<div style="padding:6px 8px;white-space:pre">${l}</div>`).join("")}
    </div>
    <div class="col" style="flex:1;min-width:0">
      <div class="row" style="padding:14px 24px;align-items:center;gap:14px;border-bottom:1px solid #eee;font-size:14px"><b style="font-size:15px">My issues</b>${["Assigned", "Created", "Subscribed", "Activity"].map((t, i) => `<span style="padding:3px 10px;border-radius:5px;${i === 0 ? "background:#eeeef0;font-weight:600" : "color:#6b6f76"}">${t}</span>`).join("")}<span style="margin-left:auto;color:#6b6f76">⚲ Filter   ☰ Display</span></div>
      ${groups.map(([g, c, items]) => `<div class="row" style="background:#f7f7f8;padding:8px 24px;font-size:13.5px;align-items:center;gap:8px"><span style="width:12px;height:12px;border-radius:50%;border:2px solid ${c};${g === "In Progress" ? `background:linear-gradient(90deg,${c} 50%,transparent 50%)` : ""}"></span><b>${g}</b><span style="color:#8a8f98">${items.length}</span></div>
        ${items.map(([id, t, label, d, pr]) => `<div class="row" style="padding:0 24px;height:40px;align-items:center;gap:14px;font-size:14px;border-bottom:1px solid #f1f1f1"><span style="color:#8a8f98;letter-spacing:-2px;width:34px;font-size:10px">${pr}</span><span style="color:#8a8f98;width:62px">${id}</span><span style="width:12px;height:12px;border-radius:50%;border:2px solid ${c}"></span><span class="ell" style="flex:1">${t}</span><span class="pill" style="border:1px solid #e6e6e6;color:#3c3c43;font-weight:500">● ${label}</span><span style="color:#8a8f98;width:56px;font-size:13px">${d}</span>${avatar("Ananya Sharma", 0, 20, true)}</div>`).join("")}`).join("")}
    </div>`;
}

function chatgpt(): string {
  const code = `SELECT e.name,\n       SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) / 3600 AS hours\nFROM activity_span s\nJOIN employee e ON e.id = s.employee_id\nWHERE s.started_at >= date_trunc('week', now())\n  AND NOT s.is_idle\nGROUP BY e.name\nORDER BY hours DESC;`;
  return `<div class="col" style="width:260px;background:#171717;color:#ececec;font-size:14px;padding:12px 10px;gap:2px">
      <div style="padding:8px 10px;font-weight:600">✎ New chat</div><div style="padding:8px 10px">⌕ Search chats</div><div style="padding:8px 10px">▦ Library</div>
      <div style="padding:16px 10px 6px;font-size:12px;color:#8e8e8e">Today</div>
      ${["SQL weekly hours per employee", "Explain ISO week numbers", "Regex for Indian phone numbers"].map((t, i) => `<div class="ell" style="padding:8px 10px;border-radius:8px;${i === 0 ? "background:#2f2f2f" : ""}">${t}</div>`).join("")}
      <div style="padding:16px 10px 6px;font-size:12px;color:#8e8e8e">Previous 7 days</div>
      ${["Nest guard for org-scoped routes", "Prisma cascade deletes", "Write release notes 2.14", "CSV export with BOM for Excel", "Tailwind grid for gallery"].map((t) => `<div class="ell" style="padding:8px 10px">${t}</div>`).join("")}
    </div>
    <div class="col" style="flex:1;min-width:0;background:#212121;color:#ececec">
      <div class="row" style="padding:14px 20px;font-size:17px;font-weight:600">ChatGPT ⌄<span style="margin-left:auto;font-size:14px;font-weight:400;color:#b4b4b4">⇪ Share</span></div>
      <div class="col" style="width:760px;align-self:center;flex:1;gap:22px;padding-top:10px;font-size:16px;line-height:1.65">
        <div style="align-self:flex-end;background:#303030;border-radius:22px;padding:10px 18px;max-width:520px">Write a Postgres query for total non-idle hours per employee this week, highest first.</div>
        <div>Here's a query that sums each employee's active (non-idle) time since Monday and sorts it descending:</div>
        <div style="border-radius:10px;overflow:hidden;background:#0d0d0d"><div class="row" style="background:#2f2f2f;padding:7px 14px;font-size:12.5px;color:#b4b4b4">sql<span style="margin-left:auto">⧉ Copy</span></div><div class="mono" style="padding:14px 16px;font-size:14px;line-height:1.6;white-space:pre">${esc(code).replace(/\b(SELECT|FROM|JOIN|ON|WHERE|AND|NOT|GROUP BY|ORDER BY|AS|DESC|SUM|EXTRACT|EPOCH)\b/g, '<span style="color:#c792ea">$1</span>').replace(/'week'/g, '<span style="color:#c3e88d">\'week\'</span>').replace(/\b(3600)\b/g, '<span style="color:#f78c6c">$1</span>')}</div></div>
        <div><b>Notes</b><br>• <code style="background:#424242;padding:1px 5px;border-radius:4px;font-size:14px">date_trunc('week', …)</code> starts weeks on Monday.<br>• If your spans can cross midnight, split them first so each day's hours land on the right date.</div>
      </div>
      <div style="width:760px;align-self:center;margin-bottom:22px;background:#303030;border-radius:26px;padding:14px 20px;color:#9b9b9b;font-size:16px">＋  Ask anything<span style="float:right">🎙</span></div>
    </div>`;
}

function crm(): string {
  const stages: [string, string, [string, string, string][]][] = [
    ["Lead", "#94a3b8", [["Harbor Logistics", "₹2.4L", "12 seats"], ["Kestrel Pharma", "₹6.1L", "40 seats"], ["Bluewave Studios", "₹1.2L", "8 seats"]]],
    ["Qualified", "#0ea5e9", [["Solstice Retail Group", "₹9.8L", "60 seats"], ["Atlas Buildcorp", "₹4.5L", "30 seats"]]],
    ["Demo booked", "#8b5cf6", [["Nimbus Health", "₹12.0L", "85 seats"], ["Orchid Hotels", "₹3.6L", "25 seats"], ["Crescent Motors", "₹5.2L", "34 seats"]]],
    ["Proposal", "#f59e0b", [["Meridian Freight Co.", "₹18.4L", "142 seats"], ["Vertex Labs", "₹2.9L", "18 seats"]]],
    ["Won", "#10b981", [["Tidewater Foods", "₹7.7L", "50 seats"], ["Pinecrest Schools", "₹4.1L", "28 seats"]]],
  ];
  return `<div class="col" style="width:220px;background:#0f172a;color:#cbd5e1;font-size:14px;padding:16px 12px;gap:4px"><b style="color:#fff;font-size:17px;padding:0 8px 14px">◆ Northwind CRM</b>${["Dashboard", "Pipeline", "Accounts", "Contacts", "Invoices", "Reports", "Settings"].map((l, i) => `<div style="padding:8px 10px;border-radius:6px;${i === 1 ? "background:#1e293b;color:#fff;font-weight:600" : ""}">${l}</div>`).join("")}</div>
    <div class="col" style="flex:1;min-width:0;background:#f8fafc;padding:22px 26px;gap:16px">
      <div class="row" style="align-items:center;gap:12px"><b style="font-size:24px;color:#0f172a">Sales pipeline</b><span class="pill" style="background:#e0f2fe;color:#0369a1">Q3 FY27</span><span style="margin-left:auto;color:#64748b;font-size:14px">Owner: Arjun Mehta ⌄</span><span class="btn" style="background:#0f172a;color:#fff">＋ New deal</span></div>
      <div class="row" style="gap:14px">${[["Open pipeline", "₹76.9L"], ["Weighted", "₹31.2L"], ["Won this quarter", "₹11.8L"], ["Win rate", "34%"]].map(([k, v]) => `<div class="col" style="flex:1;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;gap:4px"><span style="font-size:13px;color:#64748b">${k}</span><b style="font-size:24px;color:#0f172a">${v}</b></div>`).join("")}</div>
      <div class="row" style="gap:12px;flex:1;min-height:0">${stages.map(([s, c, deals]) => `<div class="col" style="flex:1;gap:10px"><div class="row" style="align-items:center;gap:8px;font-size:14px;font-weight:700;color:#334155;border-top:3px solid ${c};padding-top:8px">${s}<span style="color:#94a3b8;font-weight:500">${deals.length}</span></div>${deals.map(([n, v, seats], i) => `<div class="col" style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;gap:8px"><b style="font-size:14px;color:#0f172a">${n}</b><div class="row" style="font-size:13px;color:#64748b"><span>${seats}</span><b style="margin-left:auto;color:#0f172a">${v}</b></div><div class="row" style="align-items:center;gap:6px;font-size:12px;color:#94a3b8">${avatar(["Arjun Mehta", "Sara Khan", "Priya Nair"][i % 3], i + 2, 20, true)}${["2d ago", "today", "5d ago"][i % 3]}</div></div>`).join("")}</div>`).join("")}</div>
    </div>`;
}

function spotify(): string {
  const albums: [string, string, string, string][] = [["Deep Focus", "#1e3c72", "#2a5298", "Instrumental calm"], ["Lo-Fi Beats", "#8e2de2", "#4a00e0", "Chill beats to code to"], ["Peaceful Piano", "#11998e", "#38ef7d", "Relax and indulge"], ["Brain Food", "#fc4a1a", "#f7b733", "Hypnotic electronic"], ["Jazz Vibes", "#c31432", "#240b36", "Smooth late-night jazz"], ["Coding Mode", "#0f2027", "#2c5364", "Music for deep work"]];
  const tracks = [["Weightless", "Marconi Union", "8:09"], ["Sunset Lover", "Petit Biscuit", "3:57"], ["Intro", "The xx", "2:07"], ["Midnight City", "M83", "4:03"], ["Holocene", "Bon Iver", "5:37"]];
  return `<div class="col" style="flex:1;background:#000;color:#fff;padding:8px;gap:8px">
    <div class="row" style="flex:1;min-height:0;gap:8px">
      <div class="col" style="width:300px;background:#121212;border-radius:8px;padding:16px;gap:14px;font-size:14px;color:#b3b3b3">
        <b style="color:#fff;font-size:16px">▥ Your Library</b>
        <div class="row" style="gap:8px">${["Playlists", "Artists", "Albums"].map((t) => `<span class="pill" style="background:#2a2a2a;color:#fff;font-weight:500;padding:5px 12px">${t}</span>`).join("")}</div>
        ${albums.map(([n, a, b, d], i) => `<div class="row" style="gap:12px;align-items:center">${cover(48, a, b, "", i)}<div class="col"><span style="color:${i === 1 ? "#1ed760" : "#fff"}">${n}</span><span style="font-size:13px">Playlist · Spotify</span></div></div>`).join("")}
      </div>
      <div class="col" style="flex:1;min-width:0;border-radius:8px;background:linear-gradient(180deg,#4a2a8a 0,#121212 360px);padding:22px 26px;gap:18px;overflow:hidden">
        <div class="row" style="gap:24px;align-items:flex-end">${cover(220, "#8e2de2", "#4a00e0", "Lo-Fi Beats", 1)}<div class="col" style="gap:10px"><span style="font-size:13px">Public Playlist</span><b style="font-size:72px;line-height:1;letter-spacing:-2px">Lo-Fi Beats</b><span style="color:#ddd;font-size:14px">Beats to relax, study and focus to. · <b style="color:#fff">Spotify</b> · 6,241,882 saves · 250 songs</span></div></div>
        <div class="row" style="gap:22px;align-items:center"><div style="width:56px;height:56px;border-radius:50%;background:#1ed760;color:#000;display:flex;align-items:center;justify-content:center;font-size:22px">❚❚</div><span style="font-size:26px;color:#b3b3b3">⇄ ⊕ ⋯</span></div>
        <div class="col" style="font-size:15px">
          <div class="row" style="color:#b3b3b3;font-size:13px;border-bottom:1px solid #333;padding:6px 10px"><span style="width:30px">#</span><span style="flex:1">Title</span><span style="width:240px">Album</span><span>🕒</span></div>
          ${tracks.map(([t, a, d], i) => `<div class="row" style="padding:8px 10px;align-items:center;border-radius:4px;${i === 1 ? "background:#ffffff1a" : ""}"><span style="width:30px;color:${i === 1 ? "#1ed760" : "#b3b3b3"}">${i === 1 ? "♫" : i + 1}</span><div class="row" style="flex:1;gap:12px;align-items:center">${cover(40, albums[i][1], albums[i][2], "", i)}<div class="col"><span style="color:${i === 1 ? "#1ed760" : "#fff"}">${t}</span><span style="font-size:13px;color:#b3b3b3">${a}</span></div></div><span style="width:240px;color:#b3b3b3;font-size:14px">${t}</span><span style="color:#b3b3b3;font-size:14px">${d}</span></div>`).join("")}
        </div>
      </div>
    </div>
    <div class="row" style="height:72px;align-items:center;padding:0 12px;gap:14px">
      ${cover(56, "#8e2de2", "#4a00e0", "", 1)}<div class="col" style="width:260px"><span style="font-size:14px">Sunset Lover</span><span style="font-size:12.5px;color:#b3b3b3">Petit Biscuit</span></div>
      <div class="col" style="flex:1;align-items:center;gap:8px"><div style="font-size:18px;color:#b3b3b3">⇄  ⏮  <span style="background:#fff;color:#000;border-radius:50%;padding:4px 10px">❚❚</span>  ⏭  ↻</div><div class="row" style="width:560px;align-items:center;gap:8px;font-size:12px;color:#b3b3b3">1:42<div style="flex:1;height:4px;background:#4d4d4d;border-radius:2px"><div style="width:43%;height:100%;background:#fff;border-radius:2px"></div></div>3:57</div></div>
      <div class="row" style="width:260px;justify-content:flex-end;gap:10px;align-items:center;color:#b3b3b3">🔈<div style="width:100px;height:4px;background:#4d4d4d;border-radius:2px"><div style="width:70%;height:100%;background:#fff;border-radius:2px"></div></div></div>
    </div>
  </div>`;
}

function discord(): string {
  const msgs: [string, number, string, string][] = [
    ["pixelpanda", 0, "Today at 1:02 PM", "anyone else's ranked queue taking forever tonight?"],
    ["nightowl_dev", 1, "Today at 1:03 PM", "yeah 6 min for me. servers are cooked 💀"],
    ["kabir.s", 3, "Today at 1:04 PM", "lol I'm \"working\" rn, just checking patch notes"],
    ["pixelpanda", 0, "Today at 1:04 PM", "the new map is actually good though. rotate B early and it's free"],
    ["mod · Rhea", 5, "Today at 1:06 PM", "📌 Reminder: tournament sign-ups close Friday 9 PM IST. Teams of 5, subs allowed."],
    ["nightowl_dev", 1, "Today at 1:07 PM", "we need one more for the squad, @kabir.s you in?"],
  ];
  return `<div class="col" style="width:72px;background:#1e1f22;align-items:center;padding-top:12px;gap:10px">${["D", "GS", "LF", "VN", "+"].map((s, i) => `<div style="width:48px;height:48px;border-radius:${i === 1 ? "16px" : "50%"};background:${["#5865f2", "#eb459e", "#3ba55d", "#faa61a", "#313338"][i]};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${s}</div>`).join("")}</div>
    <div class="col" style="width:240px;background:#2b2d31;color:#949ba4;font-size:15px">
      <div style="padding:14px 16px;color:#f2f3f5;font-weight:700;border-bottom:1px solid #1f2023;box-shadow:0 1px 0 rgba(0,0,0,.2)">Gaming Squad ⌄</div>
      <div style="padding:16px 16px 4px;font-size:12px;font-weight:700">⌄ TEXT CHANNELS</div>
      ${["general", "ranked-queue", "patch-notes", "clips", "memes", "tournament"].map((c) => `<div style="padding:5px 12px;margin:1px 8px;border-radius:4px;${c === "ranked-queue" ? "background:#404249;color:#f2f3f5" : ""}"># ${c}</div>`).join("")}
      <div style="padding:16px 16px 4px;font-size:12px;font-weight:700">⌄ VOICE CHANNELS</div>
      <div style="padding:5px 20px">🔊 Squad VC</div>${["pixelpanda", "nightowl_dev"].map((n, i) => `<div class="row" style="padding:3px 44px;gap:8px;align-items:center;font-size:13.5px">${avatar(n, i, 22, true)}${n}</div>`).join("")}
      <div class="row" style="margin-top:auto;background:#232428;padding:10px;gap:8px;align-items:center">${avatar("kabir.s", 3, 32, true)}<div class="col"><span style="color:#f2f3f5;font-size:14px">kabir.s</span><span style="font-size:12px">Online</span></div><span style="margin-left:auto">🎙 🎧 ⚙</span></div>
    </div>
    <div class="col" style="flex:1;min-width:0;background:#313338;color:#dbdee1">
      <div class="row" style="padding:12px 18px;border-bottom:1px solid #26272b;gap:10px;align-items:center"><b style="color:#f2f3f5"># ranked-queue</b><span style="color:#949ba4;font-size:14px">| LFG, queue times, match chat</span></div>
      <div class="col" style="flex:1;padding:14px 0;gap:4px;justify-content:flex-end">
        ${msgs.map(([n, i, t, m]) => `<div class="row" style="gap:14px;padding:6px 18px">${avatar(n, i, 40, true)}<div class="col" style="gap:3px"><div><b style="color:${PALETTE[i % PALETTE.length]};font-size:15px">${n}</b> <span style="font-size:12px;color:#949ba4">${t}</span></div><div style="font-size:15.5px;line-height:1.4">${m}</div></div></div>`).join("")}
        <div class="row" style="gap:14px;padding:6px 18px">${avatar("pixelpanda", 0, 40, true)}<div class="col" style="gap:6px"><div><b style="color:${PALETTE[0]}">pixelpanda</b> <span style="font-size:12px;color:#949ba4">Today at 1:08 PM</span></div>${photo(400, 200, "city", 8)}</div></div>
      </div>
      <div style="margin:0 18px 22px;background:#383a40;border-radius:8px;padding:12px 16px;color:#6d6f78;font-size:15px">⊕  Message #ranked-queue</div>
    </div>
    <div class="col" style="width:230px;background:#2b2d31;padding:16px;gap:8px;font-size:14px;color:#949ba4"><div style="font-size:12px;font-weight:700">ONLINE — 5</div>${["pixelpanda", "nightowl_dev", "kabir.s", "Rhea", "zed"].map((n, i) => `<div class="row" style="gap:10px;align-items:center">${avatar(n, i, 32, true)}<span style="color:#dbdee1">${n}</span></div>`).join("")}</div>`;
}

function vlc(): string {
  return `<div class="col" style="flex:1;background:#000">
    <div class="row" style="background:#f0f0f0;padding:4px 10px;gap:18px;font-size:13px;color:#222">${["Media", "Playback", "Audio", "Video", "Subtitle", "Tools", "View", "Help"].map((m) => `<span>${m}</span>`).join("")}</div>
    <div style="flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;background:#000">
      ${photo(1440, 760, "beach")}
      <div style="position:absolute;bottom:44px;left:0;right:0;text-align:center;font-size:30px;color:#fff;text-shadow:0 2px 4px #000,0 0 2px #000">We should've taken the boat out yesterday.</div>
    </div>
    <div class="col" style="background:#f0f0f0;padding:6px 10px;gap:6px;font-size:12px;color:#222">
      <div class="row" style="align-items:center;gap:10px">48:12<div style="flex:1;height:6px;background:#ccc;border-radius:3px"><div style="width:39%;height:100%;background:#ff8800;border-radius:3px"></div></div>2:04:37</div>
      <div class="row" style="align-items:center;gap:14px;font-size:16px">❚❚ ⏮ ■ ⏭ <span style="font-size:14px">⛶ ☰ ⟲ ⇄</span><span style="margin-left:auto;font-size:13px">🔊 ▮▮▮▮▮▯▯ 72%</span></div>
    </div>
  </div>`;
}

function youtube(): string {
  const recs = [
    { t: "Lo-fi beats to focus / relax to 🎧", c: "ChillHop Music", v: "2.1M views · 2 years ago", th: { bg: ["#ff7eb3", "#7afcff"] as [string, string], text: "LO-FI\nFOCUS", subject: "headphones" as const, accent: "#ff4e8a", dur: "3:02:11" } },
    { t: "Office chair review — is it worth ₹40,000?", c: "DeskSetups", v: "310K views · 8 months ago", th: { bg: ["#f7971e", "#ffd200"] as [string, string], text: "WORTH\nIT?", subject: "chair" as const, accent: "#e53935", dur: "14:08" } },
    { t: "I tracked every hour for 30 days. Here's what happened", c: "Ali Talks Work", v: "1.4M views · 1 year ago", th: { bg: ["#2193b0", "#6dd5ed"] as [string, string], text: "30 DAYS\nTRACKED", subject: "chart" as const, accent: "#ffeb3b", dur: "18:44" } },
    { t: "My minimal desk setup 2026", c: "Minimal Mode", v: "624K views · 3 weeks ago", th: { bg: ["#434343", "#000000"] as [string, string], text: "DESK\nSETUP", subject: "desk" as const, accent: "#00e676", dur: "9:31" } },
    { t: "TypeScript in 100 seconds", c: "Code Cast", v: "3.2M views · 2 years ago", th: { bg: ["#1565c0", "#0d47a1"] as [string, string], text: "TS IN\n100s", subject: "code" as const, accent: "#ffeb3b", dur: "2:24" } },
    { t: "Cricket highlights: last-over thriller 🏏", c: "Cricket Daily", v: "4.8M views · 1 day ago", th: { bg: ["#11998e", "#38ef7d"] as [string, string], text: "LAST\nOVER!", subject: "face" as const, accent: "#1565c0", dur: "11:52" } },
    { t: "Reacting to the WORST coding interviews", c: "DevDrama", v: "892K views · 5 days ago", th: { bg: ["#e52d27", "#b31217"] as [string, string], text: "WORST\nINTERVIEW", subject: "face" as const, accent: "#ffffff", dur: "22:15" } },
  ];
  return `<div class="col" style="flex:1;background:#fff">
    <div class="row" style="height:56px;align-items:center;padding:0 18px;gap:18px"><span style="font-size:20px">☰</span><svg width="112" height="22" viewBox="0 0 112 22"><rect width="28" height="20" rx="5" fill="#ff0000"/><path d="M11 5 L19 10 L11 15Z" fill="#fff"/><text x="32" y="16" font-family="Arial Black, Arial" font-size="17" font-weight="900" fill="#0f0f0f" letter-spacing="-1">YouTube</text></svg>
      <div class="row" style="flex:1;max-width:620px;margin:0 auto"><div style="flex:1;border:1px solid #ccc;border-radius:20px 0 0 20px;padding:9px 18px;font-size:15px;color:#0f0f0f">10 vs code shortcuts</div><div style="background:#f8f8f8;border:1px solid #ccc;border-left:0;border-radius:0 20px 20px 0;padding:8px 20px">⌕</div></div>
      <span style="font-size:18px">🎙  ⊕  🔔</span>${avatar("Kabir Singh", 3, 32, true)}</div>
    <div class="row" style="flex:1;min-height:0;padding:10px 24px 0;gap:24px">
      <div class="col" style="flex:1;min-width:0;gap:12px">
        <div style="position:relative;border-radius:12px;overflow:hidden;background:#000">
          ${thumb({ w: 960, h: 540, bg: ["#0f2027", "#2c5364"], text: "10 VS CODE\nSHORTCUTS", sub: "SAVE HOURS", subject: "laptop", accent: "#e53935", dur: "" }).replace(/<rect x="\d+" y="\d+" width="50" height="22"[^>]*\/><text[^>]*><\/text>/, "")}
          <div class="col" style="position:absolute;left:0;right:0;bottom:0;padding:0 14px 8px;background:linear-gradient(transparent,rgba(0,0,0,.7));gap:8px">
            <div style="height:4px;background:rgba(255,255,255,.3);border-radius:2px"><div style="width:34%;height:100%;background:#f00;border-radius:2px;position:relative"><div style="position:absolute;right:-6px;top:-4px;width:12px;height:12px;border-radius:50%;background:#f00"></div></div></div>
            <div class="row" style="color:#fff;font-size:15px;gap:18px;align-items:center">❚❚ ⏭ 🔊 <span style="font-size:13.5px">4:12 / 12:26 · Shortcut #4: multi-cursor</span><span style="margin-left:auto">CC ⚙ ▭ ⛶</span></div>
          </div>
        </div>
        <div style="font-size:21px;font-weight:700;color:#0f0f0f">10 VS Code shortcuts that save me HOURS every week</div>
        <div class="row" style="align-items:center;gap:12px">${avatar("Dev Tips", 1, 40, true)}<div class="col"><b style="font-size:15px">DevTips</b><span style="font-size:12.5px;color:#606060">1.24M subscribers</span></div><span class="btn" style="background:#0f0f0f;color:#fff;border-radius:18px;padding:9px 16px">Subscribe</span>
          <div class="row" style="margin-left:auto;gap:8px;font-size:14px;font-weight:600">${["👍 18K | 👎", "↗ Share", "⤓ Download", "⋯"].map((b) => `<span style="background:#f2f2f2;border-radius:18px;padding:8px 16px">${b}</span>`).join("")}</div></div>
        <div style="background:#f2f2f2;border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.5"><b>412K views  2 weeks ago</b>  #vscode #productivity<br>Multi-cursor, go-to-symbol, the command palette tricks nobody told you about, and my favourite refactor shortcut…</div>
      </div>
      <div class="col" style="width:402px;gap:10px">
        <div class="row" style="gap:8px;font-size:13.5px;font-weight:600">${["All", "From DevTips", "Related", "Recently uploaded"].map((c, i) => `<span style="padding:6px 12px;border-radius:8px;${i === 0 ? "background:#0f0f0f;color:#fff" : "background:#f2f2f2"}">${c}</span>`).join("")}</div>
        ${recs.map((r) => `<div class="row" style="gap:10px"><div style="flex:0 0 168px">${thumb({ w: 168, h: 94, ...r.th, text: r.th.text })}</div><div class="col" style="gap:3px;min-width:0"><div style="font-size:14px;font-weight:600;line-height:1.3;color:#0f0f0f;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${r.t}</div><span style="font-size:12.5px;color:#606060">${r.c}</span><span style="font-size:12.5px;color:#606060">${r.v}</span></div></div>`).join("")}
      </div>
    </div>
  </div>`;
}

function instagram(): string {
  const stories = ["your story", "travelwithria", "foodie.mum", "arjun_m", "bengaluru.eats", "desk.goals", "sunset.chaser"];
  return `<div class="col" style="width:240px;border-right:1px solid #dbdbdb;padding:26px 16px;gap:8px;font-size:16px;color:#000"><div style="font-family:'Brush Script MT',cursive;font-size:30px;padding:0 10px 18px">Instagram</div>${["⌂ Home", "⌕ Search", "◎ Explore", "▶ Reels", "✉ Messages", "♡ Notifications", "⊕ Create", "● Profile"].map((l, i) => `<div style="padding:10px;${i === 0 ? "font-weight:700" : ""}">${l}</div>`).join("")}</div>
    <div class="col" style="flex:1;min-width:0;align-items:center;padding-top:18px;gap:18px;overflow:hidden">
      <div class="row" style="gap:16px">${stories.map((s, i) => `<div class="col" style="align-items:center;gap:5px;font-size:12px;width:72px"><div style="padding:3px;border-radius:50%;background:${i ? "linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)" : "#dbdbdb"}"><div style="border:3px solid #fff;border-radius:50%">${avatar(s, i, 56, true)}</div></div><span class="ell" style="width:72px;text-align:center">${s}</span></div>`).join("")}</div>
      <div class="col" style="width:470px;gap:10px">
        <div class="row" style="align-items:center;gap:10px;font-size:14px">${avatar("travelwithria", 1, 34, true)}<b>travelwithria</b><span style="color:#737373">· 2h</span><span style="margin-left:auto">⋯</span></div>
        ${photo(470, 470, "mountains", 4)}
        <div class="row" style="font-size:24px;gap:16px">♡ 💬 ➤<span style="margin-left:auto">🔖</span></div>
        <b style="font-size:14px">12,408 likes</b>
        <div style="font-size:14px"><b>travelwithria</b> Golden hour in Spiti never gets old 🏔✨ #himachal #travel</div>
      </div>
    </div>
    <div class="col" style="width:330px;padding:36px 20px;gap:16px;font-size:14px">
      <div class="row" style="gap:12px;align-items:center">${avatar("kabir.singh", 3, 44, true)}<div class="col"><b>kabir.singh</b><span style="color:#737373">Kabir Singh</span></div><span style="margin-left:auto;color:#0095f6;font-size:12px;font-weight:600">Switch</span></div>
      <div class="row" style="color:#737373;font-weight:600"><span>Suggested for you</span><span style="margin-left:auto;color:#000;font-size:12px">See all</span></div>
      ${["desk.goals", "bengaluru.eats", "codewithnora", "sunset.chaser", "minimal.mode"].map((n, i) => `<div class="row" style="gap:12px;align-items:center">${avatar(n, i + 2, 36, true)}<div class="col"><b style="font-size:13.5px">${n}</b><span style="color:#737373;font-size:12px">Suggested for you</span></div><span style="margin-left:auto;color:#0095f6;font-size:12px;font-weight:600">Follow</span></div>`).join("")}
      <div style="margin-top:6px">${photo(290, 150, "food", 6)}</div>
    </div>`;
}

function reddit(): string {
  const posts: [string, string, string, string, string, "mountains" | "city" | "forest" | null][] = [
    ["r/mechanicalkeyboards", "u/clacky_boi · 5h", "Finally finished my first custom build — 65% with lubed tactiles", "4.2k", "318", "city"],
    ["r/india", "u/chai_and_code · 3h", "Bengaluru traffic update: it took me 1h 40m to travel 9 km today", "12.8k", "1.4k", null],
    ["r/EarthPorn", "u/ria_travels · 7h", "Morning light over Spiti Valley, Himachal [OC] [4032×3024]", "21.3k", "402", "mountains"],
  ];
  return `<div class="col" style="flex:1;background:#fff">
    <div class="row" style="height:56px;align-items:center;padding:0 20px;gap:16px;border-bottom:1px solid #e5ebee"><span style="width:32px;height:32px;border-radius:50%;background:#ff4500;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800">r</span><b style="font-size:22px;color:#ff4500;letter-spacing:-1px">reddit</b><div style="flex:1;max-width:560px;margin:0 auto;background:#e5ebee;border-radius:20px;padding:10px 18px;color:#576f76;font-size:14px">⌕ Search Reddit</div><span style="font-size:14px">＋ Create  🔔</span>${avatar("kabir", 3, 32, true)}</div>
    <div class="row" style="flex:1;min-height:0">
      <div class="col" style="width:250px;padding:14px 16px;gap:4px;font-size:14px;color:#333;border-right:1px solid #e5ebee">${["⌂ Home", "↗ Popular", "◎ Explore", "☰ All"].map((l, i) => `<div style="padding:9px 12px;border-radius:8px;${i === 0 ? "background:#e5ebee" : ""}">${l}</div>`).join("")}<div style="padding:14px 12px 6px;font-size:12px;color:#576f76;letter-spacing:.5px">COMMUNITIES</div>${["r/india", "r/bangalore", "r/mechanicalkeyboards", "r/EarthPorn", "r/webdev", "r/cricket"].map((c, i) => `<div class="row" style="padding:7px 12px;gap:8px;align-items:center">${avatar(c.slice(2), i, 22, true)}${c}</div>`).join("")}</div>
      <div class="col" style="flex:1;min-width:0;padding:12px 26px;gap:8px;overflow:hidden">
        ${posts.map(([sub, meta, title, up, cm, img]) => `<div class="col" style="gap:8px;padding:12px;border-bottom:1px solid #e5ebee">
          <div class="row" style="gap:8px;align-items:center;font-size:12.5px">${avatar(sub.slice(2), sub.length, 22, true)}<b>${sub}</b><span style="color:#576f76">${meta}</span><span class="btn" style="margin-left:auto;background:#0a449b;color:#fff;border-radius:16px;padding:4px 12px;font-size:12px">Join</span></div>
          <div style="font-size:18px;font-weight:600;color:#0f1a1c">${title}</div>
          ${img ? photo(img === "mountains" ? 640 : 520, img === "mountains" ? 300 : 230, img, 14) : `<div style="font-size:14px;color:#2a3c42;line-height:1.5">Left home at 8:10, reached Koramangala at 9:50. Outer Ring Road was a parking lot from Marathahalli onwards. Anyone else just giving up and working from cafés?</div>`}
          <div class="row" style="gap:10px;font-size:13px;font-weight:600">${[`⇧ ${up} ⇩`, `💬 ${cm}`, "🏆", "↗ Share"].map((b) => `<span style="background:#e5ebee;border-radius:16px;padding:6px 12px">${b}</span>`).join("")}</div>
        </div>`).join("")}
      </div>
      <div class="col" style="width:320px;padding:16px 20px 0 0;gap:12px"><div style="background:#f6f8f9;border-radius:12px;padding:14px;font-size:13.5px"><div style="font-size:11.5px;font-weight:700;color:#576f76;margin-bottom:10px">RECENT POSTS</div>${["Is 1440p worth it for coding?", "Best filter coffee in Indiranagar?", "Show off your desk setup (Sep 2026)", "Anyone tried the new metro line?"].map((t, i) => `<div class="row" style="gap:10px;padding:8px 0;border-bottom:1px solid #e5ebee"><div class="col" style="flex:1"><span style="font-size:12px;color:#576f76">r/${["buildapc", "bangalore", "battlestations", "bangalore"][i]}</span><b style="font-size:13.5px;line-height:1.3">${t}</b></div>${photo(60, 60, (["city", "food", "forest", "city"] as const)[i], 8)}</div>`).join("")}</div></div>
    </div>
  </div>`;
}

function twitter(): string {
  const tweets: [string, string, string, string, string?][] = [
    ["Nora Codes", "@codewithnora", "2h", "Hot take: the best productivity tool is closing 37 browser tabs.\n\nThe second best is actually looking at where your hours went.", "1.2K · 8.4K · 91K"],
    ["Cricket Daily", "@cricketdaily", "4h", "WHAT A FINISH 🏏🔥 Needed 14 off the last over and they did it with a ball to spare. Scenes at Chinnaswamy!", "3.4K · 22K · 310K"],
    ["Startup Memes", "@startupmemes", "5h", "Standup: \"yesterday I worked on the thing, today I'll keep working on the thing, no blockers\"", "842 · 12K · 140K"],
  ];
  return `<div class="col" style="flex:1;background:#fff">
    <div class="row" style="flex:1;min-height:0;justify-content:center">
      <div class="col" style="width:270px;padding:10px 20px;gap:4px;font-size:19px;color:#0f1419"><b style="font-size:28px;padding:8px 12px">𝕏</b>${["⌂ Home", "⌕ Explore", "🔔 Notifications", "✉ Messages", "⊞ Grok", "▤ Lists", "🔖 Bookmarks", "● Profile", "⋯ More"].map((l, i) => `<div style="padding:10px 12px;${i === 0 ? "font-weight:700" : ""}">${l}</div>`).join("")}<div style="background:#0f1419;color:#fff;border-radius:24px;padding:14px;text-align:center;font-weight:700;font-size:16px;margin-top:10px">Post</div></div>
      <div class="col" style="width:600px;border-left:1px solid #eff3f4;border-right:1px solid #eff3f4;overflow:hidden">
        <div class="row" style="border-bottom:1px solid #eff3f4;font-size:15px">${["For you", "Following"].map((t, i) => `<div style="flex:1;text-align:center;padding:16px 0;${i === 0 ? "font-weight:700" : "color:#536471"}"><span style="${i === 0 ? "border-bottom:4px solid #1d9bf0;padding-bottom:13px" : ""}">${t}</span></div>`).join("")}</div>
        ${tweets.map(([n, h, t, body, stats], i) => `<div class="row" style="gap:12px;padding:12px 16px;border-bottom:1px solid #eff3f4">${avatar(n, i + 1, 40, true)}<div class="col" style="gap:4px;min-width:0;flex:1"><div style="font-size:15px"><b>${n}</b> <span style="color:#536471">${h} · ${t}</span></div><div style="font-size:15px;line-height:1.4;white-space:pre-line;color:#0f1419">${body}</div>${i === 1 ? `<div style="margin-top:6px">${photo(520, 250, "city", 16)}</div>` : ""}<div class="row" style="gap:60px;color:#536471;font-size:13.5px;margin-top:6px"><span>💬 ${stats!.split(" · ")[0]}</span><span>⟲ ${stats!.split(" · ")[1]}</span><span>♡ ${stats!.split(" · ")[2]}</span><span>📊</span></div></div></div>`).join("")}
      </div>
      <div class="col" style="width:350px;padding:10px 20px;gap:14px"><div style="background:#eff3f4;border-radius:24px;padding:12px 18px;color:#536471;font-size:15px">⌕ Search</div><div style="border:1px solid #eff3f4;border-radius:16px;padding:12px 16px"><b style="font-size:20px">What's happening</b>${[["Sports · Trending", "#INDvAUS", "84.2K posts"], ["Technology · Trending", "VS Code", "12.1K posts"], ["Trending in India", "Bengaluru rains", "31K posts"], ["Business · Trending", "#StartupIndia", "9,420 posts"]].map(([c, t, p]) => `<div class="col" style="padding:10px 0;gap:2px"><span style="font-size:13px;color:#536471">${c}</span><b style="font-size:15px">${t}</b><span style="font-size:13px;color:#536471">${p}</span></div>`).join("")}</div></div>
    </div>
  </div>`;
}

function producthunt(): string {
  const items: [string, string, string, string, string][] = [
    ["Tidy Tabs", "Auto-group 100 browser tabs into sessions", "Productivity · Chrome Extensions", "#ff6154", "842"],
    ["Pocket Standup", "Async standups that write themselves from git", "Developer Tools · Slack", "#6366f1", "731"],
    ["Focusly", "A timer that blocks distracting sites while it runs", "Productivity · Mac", "#10b981", "655"],
    ["ShipNotes", "Changelogs your customers actually read", "SaaS · Marketing", "#f59e0b", "590"],
    ["Deskmate AI", "Ask questions about your team's docs", "Artificial Intelligence", "#0ea5e9", "512"],
    ["Palette Pal", "Generate accessible color palettes in one click", "Design Tools", "#ec4899", "468"],
    ["Invoicely", "GST-ready invoices from a spreadsheet", "Fintech · India", "#8b5cf6", "401"],
  ];
  return `<div class="col" style="flex:1;background:#fff">
    <div class="row" style="height:64px;align-items:center;padding:0 60px;gap:20px;border-bottom:1px solid #eee;font-size:15px;color:#4b587c"><div style="width:40px;height:40px;border-radius:50%;background:#ff6154;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px">P</div><div style="background:#f5f8ff;border-radius:20px;padding:10px 16px;width:260px">⌕ Search (⌘ + k)</div><span>Launches</span><span>Products</span><span>News</span><span>Forums</span><span>Advertise</span><span class="btn" style="margin-left:auto;background:#ff6154;color:#fff">Sign up</span></div>
    <div class="row" style="flex:1;min-height:0;padding:26px 60px;gap:40px">
      <div class="col" style="flex:1;gap:6px"><b style="font-size:24px;color:#21293c;margin-bottom:10px">Top Products Launching Today</b>
        ${items.map(([n, t, c, col, up], i) => `<div class="row" style="gap:16px;align-items:center;padding:12px;border-radius:10px;${i === 2 ? "background:#f5f8ff" : ""}"><div style="width:62px;height:62px;border-radius:12px;background:${col};color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800">${n[0]}</div><div class="col" style="flex:1;gap:3px"><b style="font-size:16px;color:#21293c">${i + 1}. ${n}</b><span style="font-size:15px;color:#4b587c">${t}</span><span style="font-size:12.5px;color:#6f7d9c">💬 ${40 + i * 7} · ${c}</span></div><div class="col" style="border:1px solid #d9e1ec;border-radius:8px;width:62px;height:62px;align-items:center;justify-content:center;font-weight:700;color:#21293c;font-size:14px">▲<span>${up}</span></div></div>`).join("")}
      </div>
      <div class="col" style="width:340px;gap:14px"><b style="font-size:18px;color:#21293c">Trending forum threads</b>${["What's your go-to tool for tracking time?", "How do you avoid context switching?", "Launch day checklist that actually works", "Remote team rituals you'd recommend?"].map((t, i) => `<div class="col" style="gap:4px;padding:10px 0;border-bottom:1px solid #eee"><span style="font-size:12.5px;color:#6f7d9c">p/general · ${["2h", "5h", "8h", "1d"][i]}</span><b style="font-size:15px;color:#21293c">${t}</b><span style="font-size:13px;color:#6f7d9c">▲ ${[58, 44, 39, 21][i]} · 💬 ${[31, 19, 12, 9][i]}</span></div>`).join("")}</div>
    </div>
  </div>`;
}

function chromeNewTab(): string {
  const shortcuts: [string, string][] = [["Gmail", "#ea4335"], ["Workk", "#4f46e5"], ["GitHub", "#24292f"], ["Slack", "#4a154b"], ["Drive", "#1fa463"], ["Calendar", "#4285f4"], ["Jira", "#0052cc"], ["Figma", "#f24e1e"]];
  return `<div class="col" style="flex:1;align-items:center;background:linear-gradient(180deg,#e8f0fe,#fff 60%);position:relative">
    <div class="row" style="align-self:flex-end;padding:14px 20px;gap:16px;font-size:14px;color:#202124;align-items:center"><span>Gmail</span><span>Images</span><span>⋮⋮⋮</span>${avatar("Kabir Singh", 3, 32, true)}</div>
    <div style="margin-top:110px;font-size:92px;font-weight:500;letter-spacing:-4px;font-family:'Product Sans',Arial"><span style="color:#4285f4">G</span><span style="color:#ea4335">o</span><span style="color:#fbbc05">o</span><span style="color:#4285f4">g</span><span style="color:#34a853">l</span><span style="color:#ea4335">e</span></div>
    <div class="row" style="margin-top:30px;width:620px;background:#fff;border-radius:26px;box-shadow:0 1px 6px rgba(32,33,36,.28);padding:14px 22px;font-size:16px;color:#70757a;gap:12px">⌕ <span style="flex:1">Search Google or type a URL</span>🎙 📷</div>
    <div class="row" style="margin-top:36px;gap:16px;flex-wrap:wrap;width:620px;justify-content:center">${shortcuts.map(([n, c]) => `<div class="col" style="align-items:center;gap:10px;width:112px;padding:14px 0;border-radius:8px"><div style="width:52px;height:52px;border-radius:50%;background:#f1f3f4;display:flex;align-items:center;justify-content:center"><div style="width:28px;height:28px;border-radius:6px;background:${c};color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center">${n[0]}</div></div><span style="font-size:13px;color:#202124">${n}</span></div>`).join("")}</div>
    <div class="row" style="position:absolute;bottom:26px;gap:18px">${["Weather · Bengaluru 27°C ⛅", "Cricket · IND 284/6 (48.2)", "Markets · SENSEX ▲ 0.8%"].map((c) => `<div style="background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.15);padding:14px 20px;font-size:14px;color:#202124">${c}</div>`).join("")}</div>
  </div>`;
}

function fileExplorer(): string {
  const files: [string, string, string, string, string][] = [
    ["📁", "Client decks", "22-09-2026 18:04", "File folder", ""], ["📁", "Invoices FY27", "21-09-2026 11:20", "File folder", ""], ["📁", "Screenshots", "23-09-2026 09:47", "File folder", ""],
    ["📊", "Q3 usage report.xlsx", "22-09-2026 17:31", "Microsoft Excel Worksheet", "184 KB"], ["📄", "Meridian QBR notes.docx", "20-09-2026 16:02", "Microsoft Word Document", "42 KB"], ["📕", "Workk onboarding guide.pdf", "18-09-2026 10:15", "PDF Document", "2.4 MB"],
    ["🖼", "dashboard-v3-final.png", "17-09-2026 14:40", "PNG File", "1.1 MB"], ["📊", "Timesheets Aug 2026.csv", "05-09-2026 09:12", "CSV File", "96 KB"], ["🗜", "brand-assets.zip", "02-09-2026 12:00", "Compressed (zipped) Folder", "18.7 MB"],
    ["📄", "Release notes 2.14.md", "01-09-2026 19:22", "Markdown File", "6 KB"], ["🎞", "product-walkthrough.mp4", "30-08-2026 15:55", "MP4 Video", "84.2 MB"], ["📊", "Headcount plan 2027.xlsx", "28-08-2026 11:03", "Microsoft Excel Worksheet", "58 KB"],
  ];
  return `<div class="col" style="flex:1;background:#fff;font-size:13.5px">
    <div class="row" style="padding:8px 14px;gap:18px;background:#f3f3f3;border-bottom:1px solid #e5e5e5;align-items:center"><span>⊕ New ⌄</span><span>✂ ⧉ 📋 ✎ ↗ 🗑</span><span>⇅ Sort ⌄</span><span>☰ View ⌄</span><span>⋯</span></div>
    <div class="row" style="padding:8px 14px;gap:12px;align-items:center;border-bottom:1px solid #e5e5e5"><span style="color:#666">← → ↑ ↻</span><div style="flex:1;border:1px solid #d9d9d9;padding:5px 10px">🖥 › This PC › Documents › <b>Northwind</b></div><div style="width:260px;border:1px solid #d9d9d9;padding:5px 10px;color:#888">⌕ Search Northwind</div></div>
    <div class="row" style="flex:1;min-height:0">
      <div class="col" style="width:230px;padding:10px 8px;gap:2px;border-right:1px solid #eee">${["⌂ Home", "🖼 Gallery", "☁ OneDrive - Northwind", "", "🖥 Desktop", "⤓ Downloads", "📄 Documents", "🖼 Pictures", "🎵 Music", "🎞 Videos", "", "💻 This PC", "💽 Local Disk (C:)", "💽 Data (D:)", "🌐 Network"].map((l) => (l ? `<div style="padding:5px 12px;border-radius:4px;${l.includes("Documents") ? "background:#cce8ff" : ""}">${l}</div>` : `<div style="height:1px;background:#eee;margin:6px 0"></div>`)).join("")}</div>
      <div class="col" style="flex:1">
        <div class="row" style="padding:8px 16px;color:#666;border-bottom:1px solid #eee"><span style="flex:3">Name</span><span style="flex:2">Date modified</span><span style="flex:2">Type</span><span style="flex:1;text-align:right">Size</span></div>
        ${files.map(([ic, n, d, t, s], i) => `<div class="row" style="padding:7px 16px;${i === 3 ? "background:#cce8ff" : ""}"><span style="flex:3">${ic}  ${n}</span><span style="flex:2;color:#666">${d}</span><span style="flex:2;color:#666">${t}</span><span style="flex:1;text-align:right;color:#666">${s}</span></div>`).join("")}
      </div>
    </div>
    <div style="padding:4px 14px;border-top:1px solid #eee;color:#666;font-size:12.5px">12 items   1 item selected  184 KB</div>
  </div>`;
}

function googleSearch(): string {
  const results: [string, string, string, string][] = [
    ["Wikipedia", "https://en.wikipedia.org › wiki › Shift_work", "Shift work - Wikipedia", "Shift work is an employment practice designed to make use of, or provide service across, all 24 hours of the clock each day of the week. The practice typically sees the day divided into shifts…"],
    ["India Code", "https://www.indiacode.nic.in › factories-act", "The Factories Act, 1948 — Section 59: Extra wages for overtime", "Where a worker works in a factory for more than nine hours in any day or for more than forty-eight hours in any week, he shall, in respect of overtime work, be entitled to wages at the rate of twice…"],
    ["Harvard Business Review", "https://hbr.org › 2024 › 03 › overtime", "The Hidden Costs of Overtime", "Long hours don't translate into more output. Research shows productivity per hour falls sharply after 50 hours a week, and teams that track time honestly plan better…"],
    ["Investopedia", "https://www.investopedia.com › terms › overtime", "Overtime: Definition, Rules, and How It's Calculated", "Overtime is the amount of time someone works beyond normal working hours. Here's how overtime pay is calculated, with examples for hourly and salaried workers…"],
  ];
  return `<div class="col" style="flex:1;background:#fff">
    <div class="row" style="padding:22px 30px 0;align-items:center;gap:40px"><span style="font-size:30px;font-weight:500;letter-spacing:-1px"><span style="color:#4285f4">G</span><span style="color:#ea4335">o</span><span style="color:#fbbc05">o</span><span style="color:#4285f4">g</span><span style="color:#34a853">l</span><span style="color:#ea4335">e</span></span><div class="row" style="width:690px;border-radius:24px;box-shadow:0 1px 6px rgba(32,33,36,.28);padding:12px 22px;font-size:16px;gap:12px"><span style="flex:1">overtime rules for shift workers india</span>✕ 🎙 ⌕</div><span style="margin-left:auto">⚙ ⋮⋮⋮</span>${avatar("Priya Nair", 4, 32, true)}</div>
    <div class="row" style="padding:14px 0 0 180px;gap:24px;font-size:14px;color:#5f6368;border-bottom:1px solid #ebebeb">${["All", "News", "Images", "Videos", "Shopping", "More", "Tools"].map((t, i) => `<span style="padding-bottom:10px;${i === 0 ? "color:#1a73e8;border-bottom:3px solid #1a73e8" : ""}">${t}</span>`).join("")}</div>
    <div class="row" style="padding:18px 0 0 180px;gap:60px;flex:1;min-height:0">
      <div class="col" style="width:652px;gap:26px">
        <span style="font-size:14px;color:#70757a">About 1,84,00,000 results (0.41 seconds)</span>
        ${results.slice(0, 2).map(([site, url, title, snip], i) => `<div class="col" style="gap:4px"><div class="row" style="gap:10px;align-items:center">${avatar(site, i, 28, true)}<div class="col"><span style="font-size:14px;color:#202124">${site}</span><span style="font-size:12px;color:#4d5156">${url}</span></div></div><span style="font-size:20px;color:#1a0dab">${title}</span><span style="font-size:14px;color:#4d5156;line-height:1.58">${snip}</span></div>`).join("")}
        <div class="col"><b style="font-size:20px;color:#202124;margin-bottom:6px">People also ask</b>${["Is overtime mandatory for shift workers in India?", "How many hours can a shift worker work per week?", "How is overtime pay calculated for night shifts?", "Do salaried employees get overtime?"].map((q) => `<div class="row" style="border-bottom:1px solid #dadce0;padding:13px 0;font-size:16px;color:#202124">${q}<span style="margin-left:auto">⌄</span></div>`).join("")}</div>
        ${results.slice(2).map(([site, url, title, snip], i) => `<div class="col" style="gap:4px"><div class="row" style="gap:10px;align-items:center">${avatar(site, i, 28, true)}<div class="col"><span style="font-size:14px;color:#202124">${site}</span><span style="font-size:12px;color:#4d5156">${url}</span></div></div><span style="font-size:20px;color:#1a0dab">${title}</span><span style="font-size:14px;color:#4d5156;line-height:1.58">${snip}</span></div>`).join("")}
      </div>
      <div class="col" style="width:370px;border:1px solid #dadce0;border-radius:8px;padding:16px;gap:10px;align-self:flex-start;font-size:14px;line-height:1.55;color:#4d5156">${photo(336, 150, "city", 8)}<b style="font-size:22px;color:#202124">Shift work</b><span>Employment practice</span><span>Shift work is an employment practice designed to provide service across all 24 hours of the clock each day of the week.</span></div>
    </div>
  </div>`;
}

function wikipedia(): string {
  return `<div class="col" style="flex:1;background:#fff;font-family:'Linux Libertine','Georgia',serif">
    <div class="row" style="padding:10px 30px;align-items:center;gap:20px;font-family:'Segoe UI',sans-serif;border-bottom:1px solid #eaecf0"><span style="font-size:18px">☰</span><div class="col" style="align-items:center"><b style="font-family:Georgia;font-size:22px;letter-spacing:1px">W<span style="font-size:17px">IKIPEDIA</span></b><span style="font-size:11px;color:#54595d">The Free Encyclopedia</span></div><div style="flex:1;max-width:520px;border:1px solid #a2a9b1;border-radius:2px;padding:7px 10px;color:#72777d;font-size:14px">⌕ Search Wikipedia</div><span style="margin-left:auto;font-size:13.5px;color:#36c">Donate  Create account  Log in</span></div>
    <div class="row" style="flex:1;min-height:0;padding:0 30px;gap:30px">
      <div class="col" style="width:210px;padding-top:30px;gap:8px;font-family:'Segoe UI',sans-serif;font-size:13.5px;color:#36c"><b style="color:#202122">Contents</b>${["(Top)", "History", "Health effects", "Shift systems", "  Two-shift system", "  Three-shift system", "  Rotating shifts", "Regulation", "Overtime", "See also", "References"].map((c) => `<span style="white-space:pre;${c === "(Top)" ? "color:#202122;font-weight:600" : ""}">${c}</span>`).join("")}</div>
      <div class="col" style="flex:1;min-width:0;padding-top:22px;gap:10px;color:#202122">
        <div style="font-size:32px;border-bottom:1px solid #a2a9b1;padding-bottom:4px">Shift work</div>
        <div class="row" style="gap:18px;font-family:'Segoe UI',sans-serif;font-size:13.5px;color:#36c;border-bottom:1px solid #eaecf0;padding-bottom:6px"><span style="color:#202122;border-bottom:2px solid #202122">Article</span><span>Talk</span><span style="margin-left:auto;color:#202122">Read</span><span>Edit</span><span>View history</span></div>
        <div style="font-size:13px;font-family:'Segoe UI',sans-serif;color:#54595d">From Wikipedia, the free encyclopedia</div>
        <div class="row" style="gap:24px;align-items:flex-start">
          <div class="col" style="flex:1;gap:12px;font-size:15.5px;line-height:1.65">
            <p><b>Shift work</b> is an employment practice designed to make use of, or provide service across, all 24 hours of the clock each day of the week (often abbreviated as <i>24/7</i>). The practice typically sees the day divided into <span style="color:#36c">shifts</span>, set periods of time during which different groups of workers perform their duties.</p>
            <p>The term "shift work" includes both long-term night shifts and work schedules in which employees change or rotate shifts. In medicine and <span style="color:#36c">epidemiology</span>, shift work is considered a risk factor for some health problems in some individuals, as disruption to <span style="color:#36c">circadian rhythms</span> may increase the probability of developing cardiovascular disease.</p>
            <div style="font-size:24px;border-bottom:1px solid #a2a9b1;padding-bottom:4px;margin-top:6px">History</div>
            <p>Shift systems were introduced in the textile mills of the <span style="color:#36c">Industrial Revolution</span>, where expensive machinery was kept running around the clock. By the early 20th century, the three-shift system (morning, afternoon and night) had become standard in steel, chemical and power industries.</p>
          </div>
          <div class="col" style="width:290px;border:1px solid #a2a9b1;background:#f8f9fa;padding:6px;gap:6px;font-family:'Segoe UI',sans-serif;font-size:13px">${photo(276, 180, "city")}<span style="line-height:1.4">A factory running a night shift. Many industries operate continuously to keep expensive equipment in use.</span></div>
        </div>
      </div>
    </div>
  </div>`;
}

function tally(): string {
  const gateway = ["MASTERS", "Create", "Alter", "Chart of Accounts", "TRANSACTIONS", "Vouchers", "Day Book", "UTILITIES", "Banking", "REPORTS", "Balance Sheet", "Profit & Loss A/c", "Stock Summary", "Ratio Analysis", "Display More Reports", "Dashboard", "Quit"];
  const rows = [
    ["1-Sep-26", "Meridian Freight Co.", "Sales", "1", "", "48,200.00"], ["1-Sep-26", "HDFC Bank", "Payment", "14", "12,500.00", ""], ["3-Sep-26", "Office Supplies Co.", "Purchase", "7", "3,400.00", ""],
    ["4-Sep-26", "Solstice Retail Group", "Sales", "2", "", "19,500.00"], ["5-Sep-26", "Salary Payable", "Journal", "3", "4,12,000.00", ""], ["7-Sep-26", "Solstice Retail Group", "Receipt", "9", "", "19,500.00"],
    ["8-Sep-26", "AWS India Pvt Ltd", "Purchase", "8", "18,732.00", ""], ["10-Sep-26", "Nimbus Health", "Sales", "3", "", "72,000.00"], ["11-Sep-26", "Petty Cash", "Contra", "2", "5,000.00", ""],
    ["12-Sep-26", "GST Payable", "Journal", "4", "21,690.00", ""], ["14-Sep-26", "Tidewater Foods", "Receipt", "10", "", "38,500.00"], ["15-Sep-26", "Rent — Koramangala", "Payment", "15", "85,000.00", ""],
    ["17-Sep-26", "Meridian Freight Co.", "Receipt", "11", "", "48,200.00"], ["18-Sep-26", "Pinecrest Schools", "Sales", "4", "", "41,000.00"],
  ];
  return `<div class="col" style="flex:1;background:#fdfdf6;color:#1b1b1b;font-size:14px">
    <div class="row" style="background:#1f4e79;color:#fff;padding:6px 14px;gap:24px;font-size:13px"><b>TallyPrime</b><span>K: Company</span><span>Y: Data</span><span>Z: Exchange</span><span>G: Go To</span><span>O: Import</span><span>E: Export</span><span>M: Share</span><span>P: Print</span><span style="margin-left:auto">F1: Help</span></div>
    <div class="row" style="background:#dbe7f3;padding:5px 14px;font-size:13px;border-bottom:1px solid #9fb8d0"><b>Day Book</b><span style="margin-left:auto">Northwind Digital (Demo)</span><span style="margin-left:40px">1-Sep-26 to 18-Sep-26</span></div>
    <div class="row" style="flex:1;min-height:0">
      <div class="col" style="flex:1;padding:10px 16px">
        <div class="row" style="font-weight:700;border-bottom:1px solid #444;border-top:1px solid #444;padding:5px 0;font-size:13.5px"><div style="width:100px">Date</div><div style="flex:1">Particulars</div><div style="width:110px">Vch Type</div><div style="width:70px">Vch No.</div><div style="width:140px;text-align:right">Debit Amount</div><div style="width:140px;text-align:right">Credit Amount</div></div>
        ${rows.map((r, i) => `<div class="row" style="padding:5px 0;${i === 6 ? "background:#ffe8a3" : ""}"><div style="width:100px">${r[0]}</div><div style="flex:1">${r[1]}</div><div style="width:110px">${r[2]}</div><div style="width:70px">${r[3]}</div><div style="width:140px;text-align:right">${r[4]}</div><div style="width:140px;text-align:right">${r[5]}</div></div>`).join("")}
        <div class="row" style="margin-top:auto;font-weight:700;border-top:1px solid #444;padding:6px 0"><div style="flex:1;text-align:right;padding-right:20px">Total:</div><div style="width:140px;text-align:right">5,62,322.00</div><div style="width:140px;text-align:right">2,86,900.00</div></div>
      </div>
      <div class="col" style="width:200px;background:#eef3f8;border-left:1px solid #9fb8d0;font-size:13px">${["F2: Period", "F3: Company", "F4: Voucher Type", "F5: Ledger-wise", "F6: Stock Item-wise", "F7: Monthly", "F8: Columnar", "B: Basis of Values", "H: Change View", "J: Exception Reports", "L: Save View", "E: Apply Filter", "C: New Column", "A: Alter Column", "F12: Configure"].map((f) => `<div style="padding:6px 12px;border-bottom:1px solid #dbe4ee">${f}</div>`).join("")}</div>
    </div>
    <div class="row" style="background:#dbe7f3;padding:4px 14px;font-size:12px;gap:18px;border-top:1px solid #9fb8d0">${gateway.slice(0, 9).map((g) => `<span>${g}</span>`).join("")}</div>
  </div>`;
}

// ============================================================================
// Catalog — key MUST match the app/site names used in seed-demo.ts's
// PRODUCTIVE_APPS / PRODUCTIVE_SITES / UNPRODUCTIVE_APPS / UNPRODUCTIVE_SITES /
// NEUTRAL_APPS / NEUTRAL_SITES arrays.
// ============================================================================
type Shot = { key: string; dark?: boolean } & ({ kind: "app"; title: string; html: string } | { kind: "web"; url: string; tabs: BrowserTab[]; html: string });

const tab = (title: string, fav: string, favBg: string): BrowserTab => ({ title, fav, favBg });
const OTHER_TABS = [tab("Workk — Dashboard", "W", "#4f46e5"), tab("Inbox (4) - Gmail", "M", "#ea4335")];

const SHOTS: Shot[] = [
  { key: "Visual Studio Code", kind: "app", dark: true, title: "reports.service.ts — platform-api — Visual Studio Code", html: editor("vscode") },
  { key: "Cursor", kind: "app", dark: true, title: "reports.service.ts — platform-api — Cursor", html: editor("cursor") },
  { key: "Slack", kind: "app", title: "Slack — #engineering — Northwind Digital", html: slack() },
  { key: "Microsoft Teams", kind: "app", title: "Chat | Ananya Sharma | Microsoft Teams", html: teams() },
  { key: "Figma", kind: "app", dark: true, title: "Workk Dashboard v3 – Figma", html: figma() },
  { key: "Postman", kind: "app", title: "Northwind API — Postman", html: postman() },
  { key: "Notion", kind: "app", title: "OKRs Q3 2026 — Notion", html: notion() },
  { key: "Tally", kind: "app", title: "TallyPrime — Northwind Digital (Demo)", html: tally() },

  { key: "github.com", kind: "web", url: "github.com/northwind-digital/platform-api", tabs: [tab("northwind-digital/platform-api", "◉", "#24292f"), ...OTHER_TABS], html: github() },
  { key: "stackoverflow.com", kind: "web", url: "stackoverflow.com/questions/78123456/prisma-date-filter-drops-last-day", tabs: [tab("Prisma date filter drops the last…", "S", "#f48225"), ...OTHER_TABS], html: stackoverflow() },
  { key: "docs.google.com", kind: "web", url: "docs.google.com/document/d/1Qx9…/edit", tabs: [tab("Q3 Customer Review — Google Docs", "D", "#4285f4"), ...OTHER_TABS], html: googleDocs() },
  { key: "mail.google.com", kind: "web", url: "mail.google.com/mail/u/0/#inbox", tabs: [tab("Inbox (4) - priya@northwind", "M", "#ea4335"), tab("Workk — Dashboard", "W", "#4f46e5")], html: gmail() },
  { key: "atlassian.net", kind: "web", url: "northwind.atlassian.net/jira/software/projects/NW/boards/3", tabs: [tab("NW Sprint 38 - Jira", "J", "#0052cc"), ...OTHER_TABS], html: jira() },
  { key: "linear.app", kind: "web", url: "linear.app/northwind/my-issues/assigned", tabs: [tab("My issues · Linear", "L", "#5e6ad2"), ...OTHER_TABS], html: linear() },
  { key: "chatgpt.com", kind: "web", url: "chatgpt.com/c/6720f1c2", tabs: [tab("SQL weekly hours per employee", "✺", "#10a37f"), ...OTHER_TABS], html: chatgpt() },
  { key: "northwind-crm.internal", kind: "web", url: "northwind-crm.internal/pipeline", tabs: [tab("Pipeline · Northwind CRM", "◆", "#0f172a"), ...OTHER_TABS], html: crm() },

  { key: "Spotify", kind: "app", dark: true, title: "Spotify Premium", html: spotify() },
  { key: "Discord", kind: "app", dark: true, title: "#ranked-queue | Gaming Squad - Discord", html: discord() },
  { key: "VLC", kind: "app", title: "Weekend.at.the.Coast.2024.1080p.mkv - VLC media player", html: vlc() },

  { key: "youtube.com", kind: "web", url: "youtube.com/watch?v=q8fZ2mR7x1k", tabs: [tab("10 VS Code shortcuts that save me…", "▶", "#ff0000"), ...OTHER_TABS], html: youtube() },
  { key: "instagram.com", kind: "web", url: "instagram.com", tabs: [tab("Instagram", "◎", "#e1306c"), ...OTHER_TABS], html: instagram() },
  { key: "reddit.com", kind: "web", url: "reddit.com", tabs: [tab("Reddit - Dive into anything", "r", "#ff4500"), ...OTHER_TABS], html: reddit() },
  { key: "twitter.com", kind: "web", url: "x.com/home", tabs: [tab("Home / X", "𝕏", "#000"), ...OTHER_TABS], html: twitter() },
  { key: "producthunt.com", kind: "web", url: "producthunt.com", tabs: [tab("Product Hunt – The best new products", "P", "#ff6154"), ...OTHER_TABS], html: producthunt() },

  { key: "Google Chrome", kind: "web", url: "chrome://newtab", tabs: [tab("New Tab", "◌", "#9aa0a6"), ...OTHER_TABS], html: chromeNewTab() },
  { key: "File Explorer", kind: "app", title: "Northwind - File Explorer", html: fileExplorer() },
  { key: "google.com", kind: "web", url: "google.com/search?q=overtime+rules+for+shift+workers+india", tabs: [tab("overtime rules for shift workers…", "G", "#4285f4"), ...OTHER_TABS], html: googleSearch() },
  { key: "wikipedia.org", kind: "web", url: "en.wikipedia.org/wiki/Shift_work", tabs: [tab("Shift work - Wikipedia", "W", "#54595d"), ...OTHER_TABS], html: wikipedia() },
];

function render(shot: Shot): string {
  const body = shot.kind === "app" ? appWindow(shot.title, !!shot.dark, shot.html) : browserWindow(shot.url, shot.tabs, shot.html);
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_CSS}</style></head><body><div class="window">${body}</div></body></html>`;
}

function slugify(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const only = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  for (const shot of SHOTS) {
    if (only.length && !only.includes(slugify(shot.key))) continue;
    await page.setContent(render(shot), { waitUntil: "load" });
    const buf = await page.screenshot({ type: "png" });
    await writeFile(join(OUT_DIR, `${slugify(shot.key)}.png`), buf);
    console.log(`  ${slugify(shot.key)}.png`);
  }

  await browser.close();
  console.log(`\nWrote screenshots to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
