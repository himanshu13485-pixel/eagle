import { ActivityCategory, UsageType } from "./enums.js";

export interface CategoryRule {
  type: UsageType;
  /** Matched case-insensitively as a substring of the app name or URL. */
  pattern: string;
  category: ActivityCategory;
  /** The group this pattern ships in. Absent on a rule the customer added. */
  group?: string;
}

const { PRODUCTIVE, UNPRODUCTIVE, NEUTRAL } = ActivityCategory;

/**
 * A named bucket of apps and sites that are judged together — "Social media",
 * "Personal messaging & texting", "Design & creative", and so on.
 *
 * Groups exist so a manager makes one decision instead of forty: switching
 * "Social media" to productive for whoever runs the company's Instagram is one
 * click, not a rule per site. A single pattern can still be overridden on its
 * own, and either kind of override can apply to the whole organisation or to
 * one employee.
 */
export interface CategoryGroup {
  key: string;
  label: string;
  /** Shown under the label in Settings, so the grouping isn't a guess. */
  description: string;
  defaultCategory: ActivityCategory;
  apps: string[];
  sites: string[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    key: "development",
    label: "Development & engineering",
    description: "Editors, terminals, source control and developer documentation.",
    defaultCategory: PRODUCTIVE,
    apps: ["code", "visual studio", "intellij", "pycharm", "webstorm", "android studio", "xcode", "sublime", "cursor", "terminal", "powershell", "cmd.exe", "iterm", "postman", "dbeaver", "docker"],
    sites: ["github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com", "developer.mozilla.org", "npmjs.com", "pypi.org"],
  },
  {
    key: "office",
    label: "Documents & spreadsheets",
    description: "Word processing, spreadsheets, slides and work email.",
    defaultCategory: PRODUCTIVE,
    apps: ["excel", "word", "powerpoint", "outlook", "onenote", "acrobat", "libreoffice", "wps office"],
    sites: ["docs.google.com", "sheets.google.com", "slides.google.com", "drive.google.com", "mail.google.com", "outlook.office.com", "office.com", "onedrive.live.com", "dropbox.com"],
  },
  {
    key: "work-communication",
    label: "Work communication",
    description: "Team chat and meetings. Kept separate from personal messaging on purpose.",
    defaultCategory: PRODUCTIVE,
    apps: ["slack", "teams", "zoom", "google meet", "webex", "skype"],
    sites: ["slack.com", "teams.microsoft.com", "meet.google.com", "zoom.us"],
  },
  {
    key: "personal-messaging",
    label: "Personal messaging & texting",
    description: "Chat apps used for personal conversations during the day.",
    defaultCategory: UNPRODUCTIVE,
    apps: ["whatsapp", "telegram", "signal", "discord", "messenger", "imessage"],
    sites: ["web.whatsapp.com", "web.telegram.org", "messenger.com", "discord.com"],
  },
  {
    key: "creative",
    label: "Design & creative",
    description: "Design, photo, video and audio tools.",
    defaultCategory: PRODUCTIVE,
    apps: ["figma", "photoshop", "illustrator", "indesign", "premiere", "after effects", "lightroom", "coreldraw", "autocad", "blender", "sketch", "affinity", "davinci resolve", "audacity"],
    sites: ["figma.com", "canva.com", "behance.net", "dribbble.com", "unsplash.com", "adobe.com"],
  },
  {
    key: "in-house",
    label: "In-house & business apps",
    description: "Accounting, ERP, CRM and internal tools. Add your own here.",
    defaultCategory: PRODUCTIVE,
    apps: ["tally", "busy", "marg", "sap", "quickbooks", "zoho books", "anydesk", "teamviewer"],
    sites: ["salesforce.com", "hubspot.com", "zoho.com", "freshworks.com", "odoo.com", "erpnext.com", "intranet", "localhost"],
  },
  {
    key: "project-management",
    label: "Project & knowledge management",
    description: "Task boards, wikis and planning tools.",
    defaultCategory: PRODUCTIVE,
    apps: ["notion", "obsidian", "jira", "clickup"],
    sites: ["atlassian.net", "jira", "trello.com", "asana.com", "linear.app", "notion.so", "clickup.com", "monday.com", "basecamp.com"],
  },
  {
    key: "ai-tools",
    label: "AI assistants",
    description: "Chat and coding assistants used as part of the work.",
    defaultCategory: PRODUCTIVE,
    apps: ["chatgpt", "claude", "copilot"],
    sites: ["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com", "perplexity.ai", "copilot.microsoft.com"],
  },
  {
    key: "cloud-admin",
    label: "Cloud & admin consoles",
    description: "Infrastructure dashboards and hosting control panels.",
    defaultCategory: PRODUCTIVE,
    apps: [],
    sites: ["aws.amazon.com", "console.cloud.google.com", "portal.azure.com", "cloudflare.com", "vercel.com", "netlify.com", "digitalocean.com", "cpanel"],
  },
  {
    key: "learning",
    label: "Learning & training",
    description: "Courses and tutorials. Productive by default — change it if it isn't.",
    defaultCategory: PRODUCTIVE,
    apps: [],
    sites: ["udemy.com", "coursera.org", "pluralsight.com", "w3schools.com", "geeksforgeeks.org", "khanacademy.org"],
  },
  {
    key: "social",
    label: "Social media",
    description: "Social networks and feeds.",
    defaultCategory: UNPRODUCTIVE,
    apps: ["instagram", "facebook", "tiktok", "snapchat"],
    sites: ["facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "reddit.com", "pinterest.com", "snapchat.com", "threads.net", "quora.com"],
  },
  {
    key: "professional-network",
    label: "Professional networking & job sites",
    description: "Neutral by default: the same site is recruiting for one person and job-hunting for another.",
    defaultCategory: NEUTRAL,
    apps: [],
    sites: ["linkedin.com", "naukri.com", "indeed.com", "glassdoor.com", "shine.com", "monster.com", "wellfound.com"],
  },
  {
    key: "entertainment",
    label: "Entertainment & streaming",
    description: "Video, music and streaming services.",
    defaultCategory: UNPRODUCTIVE,
    apps: ["spotify", "vlc", "netflix", "prime video", "itunes"],
    sites: ["youtube.com", "netflix.com", "primevideo.com", "hotstar.com", "jiocinema.com", "sonyliv.com", "zee5.com", "twitch.tv", "spotify.com", "gaana.com", "wynk.in"],
  },
  {
    key: "gaming",
    label: "Gaming",
    description: "Games and game stores.",
    defaultCategory: UNPRODUCTIVE,
    apps: ["steam", "epic games", "roblox", "minecraft", "valorant", "league of legends", "battle.net", "riot client", "bgmi", "free fire"],
    sites: ["steampowered.com", "epicgames.com", "roblox.com", "ign.com", "miniclip.com", "poki.com"],
  },
  {
    key: "shopping",
    label: "Shopping & food delivery",
    description: "Retail, marketplaces and food ordering.",
    defaultCategory: UNPRODUCTIVE,
    apps: [],
    sites: ["amazon.in", "amazon.com", "flipkart.com", "myntra.com", "ajio.com", "meesho.com", "nykaa.com", "swiggy.com", "zomato.com", "blinkit.com", "bigbasket.com"],
  },
  {
    key: "news-sport",
    label: "News & sport",
    description: "News sites, scores and fantasy sport.",
    defaultCategory: UNPRODUCTIVE,
    apps: [],
    sites: ["cricbuzz.com", "espncricinfo.com", "dream11.com", "timesofindia.com", "ndtv.com", "indiatoday.in", "hindustantimes.com"],
  },
  {
    key: "finance",
    label: "Banking & finance",
    description: "Banking and tax portals. Neutral: necessary, but not the job for most roles.",
    defaultCategory: NEUTRAL,
    apps: [],
    sites: ["netbanking", "onlinesbi", "icicibank.com", "hdfcbank.com", "axisbank.com", "paytm.com", "phonepe.com", "incometax.gov.in", "gst.gov.in"],
  },
  {
    key: "system",
    label: "Browsers, search & system",
    description: "A browser window says nothing on its own — the site inside it decides.",
    defaultCategory: NEUTRAL,
    apps: ["chrome", "firefox", "edge", "safari", "brave", "opera", "explorer.exe", "file explorer", "finder", "settings", "system preferences", "idle"],
    sites: ["google.com", "bing.com", "duckduckgo.com", "wikipedia.org", "translate.google.com"],
  },
];

const ruleFrom = (g: CategoryGroup, type: UsageType, pattern: string): CategoryRule => ({
  type,
  pattern,
  category: g.defaultCategory,
  group: g.key,
});

/**
 * What a new organisation starts with, so productivity reporting means
 * something on day one. Flattened from CATEGORY_GROUPS — the groups are the
 * source of truth; this is the shape the classifier wants.
 */
export const DEFAULT_CATEGORY_RULES: CategoryRule[] = CATEGORY_GROUPS.flatMap((g) => [
  ...g.apps.map((p) => ruleFrom(g, UsageType.APP, p)),
  ...g.sites.map((p) => ruleFrom(g, UsageType.WEB, p)),
]);

export const GROUP_BY_KEY: Record<string, CategoryGroup> = Object.fromEntries(
  CATEGORY_GROUPS.map((g) => [g.key, g]),
);

/** A stored override: either a whole group, or one app/site pattern. */
export interface CategoryOverride {
  /** Set for a whole-group override; null/absent for a single pattern. */
  groupKey?: string | null;
  type?: string | null;
  pattern?: string | null;
  category: ActivityCategory;
  /** null = applies to the whole organisation. */
  employeeId?: string | null;
}

/**
 * Build the rule set that applies to one employee.
 *
 * Precedence, widest first so the narrowest wins: what the group ships with,
 * then an org-wide group override, then that employee's group override, then
 * an org-wide pattern override, then that employee's pattern override. So
 * "YouTube is productive for Priya" survives "Entertainment is unproductive
 * for everyone".
 */
export function rulesForEmployee(
  overrides: CategoryOverride[],
  employeeId?: string | null,
): CategoryRule[] {
  const isMine = (o: CategoryOverride) => !!o.employeeId && o.employeeId === employeeId;
  const isOrgWide = (o: CategoryOverride) => !o.employeeId;
  const relevant = overrides.filter((o) => isMine(o) || isOrgWide(o));

  const groupVerdict = new Map<string, ActivityCategory>();
  for (const o of relevant) if (o.groupKey && isOrgWide(o)) groupVerdict.set(o.groupKey, o.category);
  for (const o of relevant) if (o.groupKey && isMine(o)) groupVerdict.set(o.groupKey, o.category);

  const rules: CategoryRule[] = DEFAULT_CATEGORY_RULES.map((r) =>
    r.group && groupVerdict.has(r.group) ? { ...r, category: groupVerdict.get(r.group)! } : { ...r },
  );

  const byKey = new Map<string, CategoryRule>(rules.map((r) => [`${r.type}:${r.pattern.toLowerCase()}`, r]));
  const applyPattern = (o: CategoryOverride) => {
    if (!o.pattern || !o.type) return;
    const key = `${o.type}:${o.pattern.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.category = o.category;
      return;
    }
    // A pattern the customer added themselves, with no shipped group behind it.
    const added: CategoryRule = { type: o.type as UsageType, pattern: o.pattern, category: o.category };
    rules.push(added);
    byKey.set(key, added);
  };
  for (const o of relevant) if (!o.groupKey && isOrgWide(o)) applyPattern(o);
  for (const o of relevant) if (!o.groupKey && isMine(o)) applyPattern(o);

  return rules;
}

/**
 * Classify one app/site name against a rule set. The longest matching pattern
 * wins, so a specific rule ("mail.google.com") beats a general one
 * ("google.com") no matter what order they arrive in. Unmatched = NEUTRAL,
 * which counts as neither productive nor wasted.
 */
export function classifyActivity(
  type: string,
  name: string,
  rules: CategoryRule[],
): ActivityCategory {
  const hay = (name ?? "").toLowerCase();
  if (!hay) return ActivityCategory.NEUTRAL;
  let best: CategoryRule | null = null;
  for (const r of rules) {
    if (r.type !== type) continue;
    if (!hay.includes(r.pattern.toLowerCase())) continue;
    if (!best || r.pattern.length > best.pattern.length) best = r;
  }
  return best?.category ?? ActivityCategory.NEUTRAL;
}
