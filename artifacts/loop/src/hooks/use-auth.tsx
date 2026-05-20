/**
 * Loop Auth — custom JWT-based auth hook.
 *
 * Flow:
 *   1. Login page sends phone → Worker /api/auth/send-otp (Termii)
 *   2. Login page sends token → Worker /api/auth/verify-otp
 *   3. Worker returns { access_token, user }
 *   4. We store access_token in localStorage as "loop_token"
 *   5. This hook reads + decodes it, fetches profile from /api/auth/me
 *
 * Same public interface as before so all pages work unchanged.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  language: string | null;
  interests: string[] | null;
  is_creator: boolean;
  is_verified: boolean;
  onboarded: boolean;
};

export type LoopUser = {
  id: string;
  phone: string;
  role?: string;
};

export type LoopSession = {
  access_token: string;
  user: LoopUser;
};

type AuthContextValue = {
  user: LoopUser | null;
  session: LoopSession | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const TOKEN_KEY = "loop_token";
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  const p = decodeJwtPayload(token);
  if (!p) return false;
  if (p.exp && typeof p.exp === "number") {
    return p.exp > Math.floor(Date.now() / 1000);
  }
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoopSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw || !isTokenValid(raw)) {
      localStorage.removeItem(TOKEN_KEY);
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    const payload = decodeJwtPayload(raw)!;
    const user: LoopUser = {
      id: payload.sub as string,
      phone: payload.phone as string,
      role: payload.role as string | undefined,
    };
    const sess: LoopSession = { access_token: raw, user };
    setSession(sess);

    // Fetch profile from Worker
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${raw}` },
      });
      if (res.ok) {
        const data = await res.json() as { user: LoopUser; profile: Profile | null };
        setProfile(data.profile);
      }
    } catch {
      // network error — still logged in, profile unavailable
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const refreshProfile = async () => {
    if (!session) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json() as { profile: Profile | null };
        setProfile(data.profile);
      }
    } catch {}
  };

  const signOut = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        loading,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Helper — store token after login and reload session */
export async function setLoopToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
