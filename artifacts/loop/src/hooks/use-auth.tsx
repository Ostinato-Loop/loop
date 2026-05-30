/**
 * Loop Auth — custom JWT-based auth hook.
 *
 * Flow (native):
 *   1. Login page sends phone → Worker /api/auth/send-otp (Termii)
 *   2. Login page sends token → Worker /api/auth/verify-otp
 *   3. Worker returns { access_token, user }
 *   4. We store access_token in localStorage as "loop_token"
 *
 * Flow (RALD SSO):
 *   1. User redirected to rald-auth-ui.pages.dev?redirect_to=loop.rald.cloud/login&app_id=loop
 *   2. RALD Auth sends back to loop.rald.cloud/login?rald_token=TOKEN&app_id=loop
 *   3. AuthProvider detects rald_token → calls /api/auth/rald-sso → gets loop JWT
 *   4. Stores loop JWT, removes URL param, continues normally
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
const API_BASE  = import.meta.env.VITE_API_BASE_URL ?? "";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
}

function isTokenValid(token: string): boolean {
  const p = decodeJwtPayload(token);
  if (!p) return false;
  if (p.exp && typeof p.exp === "number") return p.exp > Math.floor(Date.now() / 1000);
  return true;
}

export function setLoopToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoopSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw || !isTokenValid(raw)) {
      localStorage.removeItem(TOKEN_KEY);
      setSession(null); setProfile(null); setLoading(false);
      return;
    }
    const payload = decodeJwtPayload(raw)!;
    const user: LoopUser = {
      id: payload.sub as string,
      phone: payload.phone as string,
      role: payload.role as string | undefined,
    };
    setSession({ access_token: raw, user });
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${raw}` },
      });
      if (res.ok) {
        const data = await res.json() as { user: LoopUser; profile: Profile | null };
        setProfile(data.profile);
      }
    } catch { /* network error — still logged in */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      // ── RALD SSO callback ──────────────────────────────────────────
      const params    = new URLSearchParams(window.location.search);
      const raldToken = params.get("rald_token");
      const appId     = params.get("app_id");

      if (raldToken && (appId === "loop" || appId == null)) {
        try {
          const res = await fetch(`${API_BASE}/api/auth/rald-sso`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rald_token: raldToken }),
          });
          if (res.ok) {
            const data = await res.json() as { access_token: string };
            localStorage.setItem(TOKEN_KEY, data.access_token);
            // Clean URL
            const clean = window.location.pathname;
            window.history.replaceState({}, "", clean);
          }
        } catch (e) {
          console.error("[rald-sso] exchange failed:", e);
        }
      }
      // ── Load stored session ────────────────────────────────────────
      await loadSession();
    })();
  }, [loadSession]);

  const refreshProfile = useCallback(async () => {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${raw}` },
      });
      if (res.ok) {
        const data = await res.json() as { user: LoopUser; profile: Profile | null };
        setProfile(data.profile);
      }
    } catch { /* silent */ }
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
