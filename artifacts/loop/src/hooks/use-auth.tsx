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
 *   1. User redirected to profiles.rald.cloud?redirect_to=loop.rald.cloud/login&app_id=loop
 *   2. RALD Auth sends back to loop.rald.cloud/login?rald_token=TOKEN&app_id=loop
 *   3. AuthProvider detects rald_token → stores it for cross-app use →
 *      calls /api/auth/rald-sso → gets loop JWT
 *   4. Stores loop JWT, removes URL param, continues normally
 *
 * Cross-app SSO:
 *   - rald_master_token in localStorage is the original RALD JWT from auth.rald.cloud
 *   - Use getRaldMasterToken() + openMessenger() / openProfiles() to navigate
 *     cross-app without requiring the user to sign in again (WS1-F2 / WS3-F1 fix)
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
  ssoError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const TOKEN_KEY       = "loop_token";
const RALD_TOKEN_KEY  = "rald_master_token";
const API_BASE        = import.meta.env.VITE_API_BASE_URL ?? "";

const RALD_AUTH_UI    = (import.meta.env.VITE_RALD_AUTH_URL as string | undefined) ?? "https://profiles.rald.cloud";
const MESSENGER_URL   = "https://messenger.rald.cloud";
const PROFILES_URL    = "https://profiles.rald.cloud";

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

/** Returns the stored RALD master token (original rald.cloud JWT) for cross-app SSO. */
export function getRaldMasterToken(): string | null {
  return localStorage.getItem(RALD_TOKEN_KEY);
}

/**
 * Redirect the user to RALD sign-in/sign-up, returning them to `returnPath`
 * on `appUrl` after auth. Used when no rald_master_token is available.
 */
export function redirectToRaldAuth(appUrl: string, appId: string, returnPath = "/"): void {
  const redirectTo = encodeURIComponent(`${appUrl}${returnPath}`);
  window.location.href = `${RALD_AUTH_UI}?redirect_to=${redirectTo}&app_id=${appId}`;
}

/**
 * Open Messenger with cross-app SSO.
 * If a RALD master token exists, passes it as ?rald_token so the user lands
 * directly on `path` without re-authenticating (resolves WS1-F2 / WS3-F1).
 * If no token exists, routes through RALD SSO sign-in.
 */
export function openMessenger(path = "/chats"): void {
  const raldToken = getRaldMasterToken();
  if (raldToken && isTokenValid(raldToken)) {
    window.location.href =
      `${MESSENGER_URL}${path}?rald_token=${encodeURIComponent(raldToken)}&app_id=messenger`;
  } else {
    redirectToRaldAuth(MESSENGER_URL, "messenger", path);
  }
}

/**
 * Open Profiles with cross-app SSO.
 */
export function openProfiles(path = "/"): void {
  const raldToken = getRaldMasterToken();
  if (raldToken && isTokenValid(raldToken)) {
    window.location.href =
      `${PROFILES_URL}${path}?rald_token=${encodeURIComponent(raldToken)}&app_id=profiles`;
  } else {
    redirectToRaldAuth(PROFILES_URL, "profiles", path);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoopSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ssoError, setSsoError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw || !isTokenValid(raw)) {
      localStorage.removeItem(TOKEN_KEY);
      setSession(null); setProfile(null); setLoading(false);
      return;
    }
    const payload = decodeJwtPayload(raw)!;
    const user: LoopUser = {
      id:    payload.sub as string,
      phone: payload.phone as string,
      role:  payload.role as string | undefined,
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
      const params    = new URLSearchParams(window.location.search);
      const raldToken = params.get("rald_token");
      const appId     = params.get("app_id");

      if (raldToken && (appId === "loop" || appId == null)) {
        // ── Store the master RALD token for cross-app SSO (WS1-F2 / WS3-F1) ──
        localStorage.setItem(RALD_TOKEN_KEY, raldToken);

        try {
          const res = await fetch(`${API_BASE}/api/auth/rald-sso`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ rald_token: raldToken }),
          });
          if (res.ok) {
            const data = await res.json() as { access_token: string };
            localStorage.setItem(TOKEN_KEY, data.access_token);
            setSsoError(null);
          } else {
            const err = await res.json().catch(() => ({})) as { error?: string };
            const msg = err.error ?? `RALD SSO failed (${res.status})`;
            console.error("[rald-sso] exchange rejected:", msg);
            setSsoError(msg);
            // Remove invalid token so user is prompted to sign in again
            localStorage.removeItem(RALD_TOKEN_KEY);
          }
        } catch (e) {
          console.error("[rald-sso] exchange failed:", e);
          setSsoError("Sign-in failed. Please try again.");
        }

        // Clean URL — remove SSO params
        const clean = window.location.pathname;
        window.history.replaceState({}, "", clean);
      }

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
    localStorage.removeItem(RALD_TOKEN_KEY);
    setSession(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, profile, loading, ssoError, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
