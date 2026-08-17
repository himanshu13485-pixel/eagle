const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:4000";

export function getToken(): string | null {
  return localStorage.getItem("eagle.access");
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
    clearTokens();
    if (location.pathname !== "/login") location.href = "/login";
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
