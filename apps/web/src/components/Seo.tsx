import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SITE_URL, seoFor } from "../lib/seo";

/**
 * Keeps the document head in step with the current route.
 *
 * index.html carries one static title and description, so every route looked
 * identical to a crawler and every social share previewed as the home page.
 * The prerender step writes the correct tags into each route's HTML; this
 * keeps them right during client-side navigation too.
 *
 * Deliberately not react-helmet: one effect and a handful of tags doesn't
 * justify a dependency on a package that is no longer maintained.
 */
export function Seo({ jsonLd }: { jsonLd?: unknown[] }) {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = seoFor(pathname);
    const canonical = `${SITE_URL}${seo.path === "/" ? "" : seo.path}`;

    document.title = seo.title;
    setMeta("name", "description", seo.description);
    setMeta("name", "robots", seo.noindex ? "noindex, follow" : "index, follow");
    setLink("canonical", canonical);

    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "Workk");
    setMeta("property", "og:title", seo.title);
    setMeta("property", "og:description", seo.description);
    setMeta("property", "og:url", canonical);

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", seo.title);
    setMeta("name", "twitter:description", seo.description);

    // og:image / twitter:image are owned by the prerender step, which emits
    // them only when public/og.png actually exists. Creating them here would
    // point every share at a 404, which previews worse than no image at all.

    // Replace rather than append, so a client-side navigation doesn't leave
    // the previous page's structured data behind.
    document.querySelectorAll("script[data-seo-jsonld]").forEach((n) => n.remove());
    for (const block of jsonLd ?? []) {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.dataset.seoJsonld = "";
      s.textContent = JSON.stringify(block);
      document.head.appendChild(s);
    }
  }, [pathname, jsonLd]);

  return null;
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}
