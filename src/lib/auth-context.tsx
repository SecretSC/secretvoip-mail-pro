import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, setToken, type MeUser } from "./api";

interface AuthState {
  user: MeUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<MeUser>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch (err: any) {
      // Only clear the session on real auth failures. Network blips, 5xx,
      // or transient errors during heavy campaign polling must NOT log the
      // user out — otherwise long-running bulk sends boot them.
      const status = Number(err?.status);
      if (status === 401 || status === 403) {
        setUser(null);
        setToken(null);
      } else {
        console.warn("[auth] refresh transient error — keeping session", err);
      }
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token, user: me } = await api.login(email, password);
    setToken(token);
    setUser(me);
    return me;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signOut, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
