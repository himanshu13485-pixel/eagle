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

// ---- Act as a client (open their dashboard from the admin console) ----
const IMPERSONATE_KEY = "eagle.actingAs";

export interface ActingAs { orgId: string; orgName: string }

export function getActingAs(): ActingAs | null {
  const raw = localStorage.getItem(IMPERSONATE_KEY);
  try { return raw ? (JSON.parse(raw) as ActingAs) : null; } catch { return null; }
}

/** Fetch an org-scoped token for a client and drop into their dashboard. */
export async function openClientDashboard(orgId: string, orgName: string) {
  const res = await adminApi<{ accessToken: string; refreshToken: string; user: { orgName?: string } }>(
    `/clients/${orgId}/impersonate`,
    { method: "POST" },
  );
  localStorage.setItem("eagle.access", res.accessToken);
  localStorage.setItem("eagle.refresh", res.refreshToken);
  localStorage.setItem("eagle.user", JSON.stringify(res.user));
  localStorage.setItem(IMPERSONATE_KEY, JSON.stringify({ orgId, orgName: res.user.orgName ?? orgName }));
  location.href = "/";
}

/** Fetch a client's org token without navigating — used to embed org pages in the admin console. */
export async function getClientToken(orgId: string): Promise<string> {
  const res = await adminApi<{ accessToken: string }>(`/clients/${orgId}/impersonate`, { method: "POST" });
  return res.accessToken;
}

/** Leave the client dashboard and return to the admin console (admin token is untouched). */
export function returnToAdmin() {
  localStorage.removeItem("eagle.access");
  localStorage.removeItem("eagle.refresh");
  localStorage.removeItem("eagle.user");
  localStorage.removeItem(IMPERSONATE_KEY);
  location.href = "/admin/clients";
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
