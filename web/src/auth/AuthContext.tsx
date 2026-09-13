import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, tokenStore } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import type { User } from "../lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

// React context = a value any component below the provider can read, without
// passing it down through props at every level.
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On page load, a saved token might exist. Ask the API who it belongs to;
  // if the token is expired or invalid, forget it.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api<{ user: User }>("GET", "/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ user: User; token: string }>("POST", "/auth/login", { email, password });
    tokenStore.set(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await api<{ user: User; token: string }>("POST", "/auth/register", { name, email, password });
    tokenStore.set(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    disconnectSocket();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
