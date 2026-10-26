/**
 * Writes a real HTML file for every route after `vite build`.
 *
 * The marketing site is a single-page app: without this, every URL served the
 * same index.html with an empty <div id="root">, one shared <title> and one
 * shared description. Google can execute JavaScript, but it renders on a delay
 * and competitors' pages don't make it wait — and the crawlers that matter for
 * sharing (Facebook, LinkedIn, WhatsApp, Slack, X) don't execute JS at all, so
 * every shared link previewed as the home page.
 *
 * Each route is rendered with react-dom/server into dist/<route>/index.html
 * with its own title, description, canonical, Open Graph and structured data.
 * The client still hydrates normally; this only changes the first paint a
 * crawler (or a visitor on a slow connection) sees.
 *
 * Also emits sitemap.xml and robots.txt from the same page list, so they can't
 * drift away from the routes that actually exist.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
// Imported directly rather than through ssrLoadModule: these are CommonJS, and
// pushing them through Vite's SSR transform fails on `require`. Vite leaves
// node_modules external during SSR, so the app's own imports resolve to these
// same instances — one React, so hooks work.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
// react-router-dom@6 ships the server entry as a file, not an exports subpath.
import { StaticRouter } from "react-router-dom/server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = join(root, "dist");

// Load the app through Vite's SSR pipeline so TS, JSX and the workspace
// package all resolve exactly as they do in the real build.
const vite = await createServer({ root, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });

try {
  const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
  const { PAGES, SITE_URL, OG_IMAGE, organizationJsonLd, softwareJsonLd } = await vite.ssrLoadModule("/src/lib/seo.ts");

  const template = readFileSync(join(dist, "index.html"), "utf8");
  const hasOgImage = existsSync(join(root, "public", "og.png"));
  const jsonLd = [organizationJsonLd(), softwareJsonLd()];

  for (const page of PAGES) {
    const canonical = `${SITE_URL}${page.path === "/" ? "" : page.path}`;
    let html;
    try {
      html = renderToString(createElement(StaticRouter, { location: page.path }, createElement(App)));
    } catch (e) {
      // A route that can't render on the server still works in the browser —
      // fall back to the empty shell rather than failing the whole build.
      console.warn(`  ! ${page.path} could not be prerendered (${e.message}); shipping the SPA shell`);
      html = "";
    }

    const head = [
      `<title>${esc(page.title)}</title>`,
      meta("name", "description", page.description),
      meta("name", "robots", page.noindex ? "noindex, follow" : "index, follow"),
      `<link rel="canonical" href="${esc(canonical)}" />`,
      meta("property", "og:type", "website"),
      meta("property", "og:site_name", "Workk"),
      meta("property", "og:title", page.title),
      meta("property", "og:description", page.description),
      meta("property", "og:url", canonical),
      meta("name", "twitter:card", "summary_large_image"),
      meta("name", "twitter:title", page.title),
      meta("name", "twitter:description", page.description),
      // Only claim a share image when one is actually there: pointing every
      // preview at a 404 looks worse than letting the platform fall back.
      // Drop a 1200x630 og.png into public/ and it appears on the next build
      // (scripts/og-card.html is a starting point for designing one).
      ...(hasOgImage ? [meta("property", "og:image", OG_IMAGE), meta("name", "twitter:image", OG_IMAGE)] : []),
      // data-seo-jsonld matches what <Seo> looks for: on hydration it clears
      // these and writes its own, so the page ends up with one copy rather
      // than the prerendered pair plus a client-added pair.
      ...(page.noindex
        ? []
        : jsonLd.map((b) => `<script type="application/ld+json" data-seo-jsonld>${jsonSafe(b)}</script>`)),
    ].join("\n    ");

    const out = template
      // Replace the build's static title/description rather than adding a second one.
      .replace(/<title>.*?<\/title>\s*/s, "")
      .replace(/<meta\s+name="description"[\s\S]*?\/>\s*/, "")
      .replace("</head>", `  ${head}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">${html}</div>`);

    const dir = page.path === "/" ? dist : join(dist, page.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), out);
    console.log(`  ✓ ${page.path}`);
  }

  const indexable = PAGES.filter((p) => !p.noindex);
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable
      .map(
        (p) =>
          `  <url>\n    <loc>${SITE_URL}${p.path === "/" ? "/" : p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${p.priority ?? 0.5}</priority>\n  </url>`,
      )
      .join("\n")}\n</urlset>\n`,
  );

  writeFileSync(
    join(dist, "robots.txt"),
    [
      "User-agent: *",
      "Allow: /",
      // The dashboard is behind a login; crawling it wastes budget and can
      // surface nothing useful.
      "Disallow: /app/",
      "Disallow: /api/",
      "",
      `Sitemap: ${SITE_URL}/sitemap.xml`,
      "",
    ].join("\n"),
  );

  console.log(`  ✓ sitemap.xml (${indexable.length} urls) + robots.txt`);
} finally {
  await vite.close();
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function meta(attr, key, content) {
  return `<meta ${attr}="${key}" content="${esc(content)}" />`;
}
/** JSON inside a <script> must not be able to close the tag early. */
function jsonSafe(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
