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

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    // Don't bounce the admin to /login when an embedded org view's token lapses.
    if (!overrideToken) {
      clearTokens();
      // BASE_URL, not a bare "/login": the app is served from a sub-path in
      // production (/app), and a hard redirect skips the router's basename.
      const loginUrl = `${import.meta.env.BASE_URL}login`.replace(/\/{2,}/g, "/");
      if (location.pathname !== loginUrl) location.href = loginUrl;
    }
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
