import { API_URL } from "./api";

export interface PlatformAdminInfo {
  id: string;
  name: string;
  email: string;
  role: string; // SUPER_ADMIN | SUB_ADMIN | SALESPERSON
}

const TOKEN_KEY = "eagle.admin.access";
const ADMIN_KEY = "eagle.admin";

export const getAdminToken = () => localStorage.getItem(TOKEN_KEY);
export const getAdmin = (): PlatformAdminInfo | null => {
  const raw = localStorage.getItem(ADMIN_KEY);
  try { return raw ? (JSON.parse(raw) as PlatformAdminInfo) : null; } catch { return null; }
};
export function clearAdmin() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADMIN_KEY);
}

/** Authenticated fetch to the platform (Super Admin) API. Paths are relative to /api/admin. */
export async function adminApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${API_URL}/api/admin${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearAdmin();
    if (location.pathname !== "/admin/login") location.href = "/admin/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function adminLogin(email: string, password: string): Promise<PlatformAdminInfo> {
  const res = await adminApi<{ accessToken: string; admin: PlatformAdminInfo }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem(TOKEN_KEY, res.accessToken);
  localStorage.setItem(ADMIN_KEY, JSON.stringify(res.admin));
  return res.admin;
}

export function adminLogout() {
  clearAdmin();
  location.href = "/admin/login";
}

/** Turn an adminApi error (whose message may be a JSON body) into a readable string. */
export function adminErr(e: unknown, fallback = "Something went wrong."): string {
  const msg = (e as Error)?.message ?? fallback;
  try {
    const m = JSON.parse(msg).message;
    return Array.isArray(m) ? m[0] : m || fallback;
  } catch {
    return msg || fallback;
  }
}
