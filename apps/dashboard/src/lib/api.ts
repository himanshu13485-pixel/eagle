const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:4000";

// When set, org api() calls use this token instead of the stored one. Used by the Super
// Admin console to embed the real org pages (Reports/Data/Work Replay) pointed at a
// selected client, without touching the admin session.
let overrideToken: string | null = null;
export function setOrgTokenOverride(t: string | null) {
  overrideToken = t;
}
export function hasOrgTokenOverride() {
  return overrideToken !== null;
}

export function getToken(): string | null {
  return overrideToken ?? localStorage.getItem("eagle.access");
}
export function setTokens(access: string, refresh: string) {
  localStorage.setItem("eagle.access", access);
  localStorage.setItem("eagle.refresh", refresh);
}
export function clearTokens() {
  localStorage.removeItem("eagle.access");
  localStorage.removeItem("eagle.refresh");
}

/**
 * Exchange the refresh token for a new access token. The access token lives
 * only 15 minutes, so without this the panel logged out on the first request
 * after that window. Shared across callers via `refreshing` so a burst of
 * simultaneous 401s triggers exactly one refresh, not one per request.
 */
let refreshing: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = localStorage.getItem("eagle.refresh");
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers still see this attempt.
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

/**
 * Turn a server response into something worth showing a customer.
 *
 * `api()` used to throw the raw response body, which pages then rendered —
 * so a 500 put `{"statusCode":500,"message":"..."}` on screen, including on
 * the login page.
 */
export function friendlyError(text: string, status: number): string {
  let message = text?.trim() ?? "";
  if (message.startsWith("{") || message.startsWith("[")) {
    try {
      const parsed = JSON.parse(message);
      const m = parsed?.message ?? parsed?.error;
      message = Array.isArray(m) ? m.join(" ") : typeof m === "string" ? m : "";
    } catch {
      message = "";
    }
  }
  // Nest's defaults for these carry no useful detail, and a 5xx body is for logs.
  if (status >= 500 || !message || /^(Internal Server Error|Bad Request|Forbidden)$/i.test(message)) {
    if (status >= 500) return "Something went wrong on our end. Please try again in a moment.";
    if (status === 403) return "You don't have permission to do that.";
    if (status === 404) return "We couldn't find that.";
    if (status === 429) return "Too many attempts. Please wait a moment and try again.";
    return message || "Something went wrong. Please try again.";
  }
  return message;
}

function sendToLogin() {
  clearTokens();
  // BASE_URL, not a bare "/login": the app is served from a sub-path in
  // production (/app), and a hard redirect skips the router's basename.
  const loginUrl = `${import.meta.env.BASE_URL}login`.replace(/\/{2,}/g, "/");
  if (location.pathname !== loginUrl) location.href = loginUrl;
}

export async function api<T>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 401) {
    // An embedded admin "act as" view has no refresh token of its own — let the
    // caller handle its lapse rather than refreshing or bouncing to /login.
    if (overrideToken) throw new Error("Unauthorized");

    // A 15-minute access token expiring is normal; refresh once and retry
    // before treating it as a real logout.
    if (!_retried && (await tryRefresh())) {
      return api<T>(path, options, true);
    }

    sendToLogin();
    throw new Error("Unauthorized");
  }
  // The subscription lapsed or the account was suspended. Every page would
  // otherwise fail its own way and read as "the app is broken"; send the user
  // to Billing once, where the reason and the way out are on screen.
  if (res.status === 402) {
    const billingUrl = `${import.meta.env.BASE_URL}billing`.replace(/\/{2,}/g, "/");
    if (location.pathname !== billingUrl) location.href = billingUrl;
    throw new Error("Your Workk subscription has expired. Renew it from Billing to get back in.");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(friendlyError(text, res.status));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Download a file from an authenticated endpoint. A plain <a href> can't carry
 * the bearer token, and the export archives are deliberately not public URLs —
 * they contain screenshots of someone's screen — so fetch it and hand the blob
 * to the browser instead.
 */
export async function authedDownload(path: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  // Prefer the filename the server chose, so exports are named consistently.
  const disposition = res.headers.get("content-disposition") ?? "";
  const named = /filename="?([^"]+)"?/.exec(disposition)?.[1];

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = named || "download.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { API_URL };
