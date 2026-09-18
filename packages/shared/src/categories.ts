import { ActivityCategory, UsageType } from "./enums.js";

export interface CategoryRule {
  type: UsageType;
  /** Matched case-insensitively as a substring of the app name or URL. */
  pattern: string;
  category: ActivityCategory;
}

const app = (pattern: string, category: ActivityCategory): CategoryRule => ({ type: UsageType.APP, pattern, category });
const web = (pattern: string, category: ActivityCategory): CategoryRule => ({ type: UsageType.WEB, pattern, category });
const { PRODUCTIVE, UNPRODUCTIVE, NEUTRAL } = ActivityCategory;

/**
 * What a new organisation starts with, so productivity reporting means something
 * on day one. These are deliberately uncontroversial — an IDE is work, a
 * streaming site is not — and every org can override or extend them in
 * Settings → Productivity.
 *
 * Nothing here is a judgement about a person: a browser is NEUTRAL because the
 * same window can be research or shopping, and the site-level rules decide.
 */
export const DEFAULT_CATEGORY_RULES: CategoryRule[] = [
  // --- Applications ---
  app("code", PRODUCTIVE),
  app("visual studio", PRODUCTIVE),
  app("intellij", PRODUCTIVE),
  app("pycharm", PRODUCTIVE),
  app("webstorm", PRODUCTIVE),
  app("android studio", PRODUCTIVE),
  app("xcode", PRODUCTIVE),
  app("sublime", PRODUCTIVE),
  app("terminal", PRODUCTIVE),
  app("powershell", PRODUCTIVE),
  app("cmd.exe", PRODUCTIVE),
  app("excel", PRODUCTIVE),
  app("word", PRODUCTIVE),
  app("powerpoint", PRODUCTIVE),
  app("outlook", PRODUCTIVE),
  app("figma", PRODUCTIVE),
  app("photoshop", PRODUCTIVE),
  app("illustrator", PRODUCTIVE),
  app("premiere", PRODUCTIVE),
  app("autocad", PRODUCTIVE),
  app("tally", PRODUCTIVE),
  app("postman", PRODUCTIVE),
  app("dbeaver", PRODUCTIVE),
  app("notion", PRODUCTIVE),
  app("obsidian", PRODUCTIVE),
  app("slack", PRODUCTIVE),
  app("teams", PRODUCTIVE),
  app("zoom", PRODUCTIVE),
  app("anydesk", PRODUCTIVE),
  app("teamviewer", PRODUCTIVE),

  app("steam", UNPRODUCTIVE),
  app("epic games", UNPRODUCTIVE),
  app("roblox", UNPRODUCTIVE),
  app("minecraft", UNPRODUCTIVE),
  app("valorant", UNPRODUCTIVE),
  app("discord", UNPRODUCTIVE),
  app("spotify", UNPRODUCTIVE),
  app("vlc", UNPRODUCTIVE),
  app("netflix", UNPRODUCTIVE),
  app("whatsapp", UNPRODUCTIVE),
  app("telegram", UNPRODUCTIVE),

  // Browsers themselves say nothing — the site does.
  app("chrome", NEUTRAL),
  app("firefox", NEUTRAL),
  app("edge", NEUTRAL),
  app("safari", NEUTRAL),
  app("brave", NEUTRAL),
  app("opera", NEUTRAL),
  app("explorer.exe", NEUTRAL),
  app("file explorer", NEUTRAL),
  app("settings", NEUTRAL),
  app("idle", NEUTRAL),

  // --- Websites ---
  web("github.com", PRODUCTIVE),
  web("gitlab.com", PRODUCTIVE),
  web("bitbucket.org", PRODUCTIVE),
  web("stackoverflow.com", PRODUCTIVE),
  web("developer.mozilla.org", PRODUCTIVE),
  web("docs.google.com", PRODUCTIVE),
  web("drive.google.com", PRODUCTIVE),
  web("mail.google.com", PRODUCTIVE),
  web("outlook.office.com", PRODUCTIVE),
  web("office.com", PRODUCTIVE),
  web("atlassian.net", PRODUCTIVE),
  web("jira", PRODUCTIVE),
  web("trello.com", PRODUCTIVE),
  web("asana.com", PRODUCTIVE),
  web("linear.app", PRODUCTIVE),
  web("notion.so", PRODUCTIVE),
  web("figma.com", PRODUCTIVE),
  web("canva.com", PRODUCTIVE),
  web("salesforce.com", PRODUCTIVE),
  web("hubspot.com", PRODUCTIVE),
  web("zoho.com", PRODUCTIVE),
  web("aws.amazon.com", PRODUCTIVE),
  web("console.cloud.google.com", PRODUCTIVE),
  web("portal.azure.com", PRODUCTIVE),
  web("chatgpt.com", PRODUCTIVE),
  web("claude.ai", PRODUCTIVE),
  web("linkedin.com", PRODUCTIVE),

  web("youtube.com", UNPRODUCTIVE),
  web("netflix.com", UNPRODUCTIVE),
  web("primevideo.com", UNPRODUCTIVE),
  web("hotstar.com", UNPRODUCTIVE),
  web("twitch.tv", UNPRODUCTIVE),
  web("facebook.com", UNPRODUCTIVE),
  web("instagram.com", UNPRODUCTIVE),
  web("tiktok.com", UNPRODUCTIVE),
  web("reddit.com", UNPRODUCTIVE),
  web("x.com", UNPRODUCTIVE),
  web("twitter.com", UNPRODUCTIVE),
  web("pinterest.com", UNPRODUCTIVE),
  web("snapchat.com", UNPRODUCTIVE),
  web("spotify.com", UNPRODUCTIVE),
  web("amazon.in", UNPRODUCTIVE),
  web("amazon.com", UNPRODUCTIVE),
  web("flipkart.com", UNPRODUCTIVE),
  web("myntra.com", UNPRODUCTIVE),
  web("swiggy.com", UNPRODUCTIVE),
  web("zomato.com", UNPRODUCTIVE),
  web("cricbuzz.com", UNPRODUCTIVE),
  web("espncricinfo.com", UNPRODUCTIVE),
  web("dream11.com", UNPRODUCTIVE),

  web("google.com", NEUTRAL),
  web("bing.com", NEUTRAL),
  web("wikipedia.org", NEUTRAL),
  web("localhost", NEUTRAL),
];

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
