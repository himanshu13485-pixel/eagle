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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export { API_URL };
