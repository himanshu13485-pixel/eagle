import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthUser, LoginResponse } from "@eagle/shared";
import { api, clearTokens, getToken, setTokens } from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (orgName: string, ownerName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState>(null as never);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = localStorage.getItem("eagle.user");
    if (cached && getToken()) {
      try {
        setUser(JSON.parse(cached));
      } catch {
        /* ignore */
      }
    }
    setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const res = await api<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setTokens(res.accessToken, res.refreshToken);
    localStorage.setItem("eagle.user", JSON.stringify(res.user));
    localStorage.removeItem("eagle.actingAs"); // a real login is never an admin "act as" session
    setUser(res.user);
  }

  async function register(orgName: string, ownerName: string, email: string, password: string) {
    const res = await api<LoginResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ orgName, ownerName, email, password }),
    });
    setTokens(res.accessToken, res.refreshToken);
    localStorage.setItem("eagle.user", JSON.stringify(res.user));
    localStorage.removeItem("eagle.actingAs");
    setUser(res.user);
  }

  function logout() {
    clearTokens();
    localStorage.removeItem("eagle.user");
    localStorage.removeItem("eagle.actingAs");
    setUser(null);
    location.href = "/login";
  }

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
