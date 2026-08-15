import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";
import type { ApiUser } from "./types";

interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, refresh: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await api.me();
      setUser(data.user);
    } catch (err) {
      // A 401 means the session is genuinely invalid — clear it. Anything
      // else (API restarting, brief network blip) must NOT log the user
      // out: that cascaded into every page gating on `user` silently
      // stopping its fetches ("everything is not fetch anymore").
      const status = (err as { status?: number })?.status;
      if (status === 401) setUser(null);
      // otherwise keep the previous user
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
