/**
 * Loop Auth — custom JWT-based auth hook.
 *
 * COOKIE-001 (2026-06-09): localStorage → HttpOnly cookie migration.
 *   - loop_token is no longer stored in localStorage. Token lives in:
 *       • In-memory: session-store module (survives React re-renders, lost on refresh)
 *       • HttpOnly cookie: set by the Loop Worker, invisible to JavaScript
 *   - rald_master_token is no longer stored anywhere in the browser.
 *     Cross-app navigation uses POST /api/auth/rald-sso/handoff to get a
 *     5-minute URL-safe handoff token. No master token in URLs or localStorage.
 *   - signOut() calls the Loop Worker signout (which clears the cookie and
 *     fires auth.rald.cloud/logout) — global logout from one place.
 *   - Proactive refresh: token is refreshed at 75% of TTL remaining, before
 *     expiry. Users who open the app daily will never see a session expiry.
 *
 * GLOBAL-LOGOUT-001 (2026-06-09): Logout from Loop revokes the ecosystem session.
 *   Loop Worker POST /api/auth/signout → clears cookie → fires auth.rald.cloud/logout.
 *
 * Sprint 2 (2026-06-09): Device registered automatically on every login.
 *
 * Flow (OTP):
 *   1. Login page → POST /api/auth/send-otp → POST /api/auth/verify-otp
 *   2. Worker returns { access_token, user } + sets loop_session cookie
 *   3. Frontend stores token in session-store (memory only)
 *
 * Flow (RALD SSO):
 *   1. /login redirects to profiles.rald.cloud?redirect_to=...&app_id=loop
 *   2. profiles.rald.cloud sends back to /auth/callback?rald_token=TOKEN
 *   3. AuthProvider detects rald_token → calls /api/auth/rald-sso
 *   4. Worker sets loop_session cookie + returns access_token
 *   5. Frontend stores token in session-store (memory only)
 *
 * Cross-app SSO:
 *   openMessenger() → POST /api/auth/rald-sso/handoff { app_id: "messenger" }
 *   → gets 5-minute handoff_token → navigate with ?rald_token=<handoff>&app_id=messenger
 */
import {
  createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode,
} from "react";
import { toast } from "sonner";
import { authFetch, AUTH_EXPIRED_EVENT } from "@/lib/api-fetch";
import { getSessionToken, setSessionToken } from "@/lib/session-store";
import { track, trackSessionStart } from "@/lib/analytics";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  language: string | null;
  interests: string[] | null;
  state_id: string | null;
  is_creator: boolean;
  is_verified: boolean;
  onboarded: boolean;
  country: string | null;
  lga_id: string | null;
  lcda_id: string | null;
  trust_score: number | null;
  trust_level: string | null;
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

const API_BASE      = import.meta.env.VITE_API_BASE_URL ?? "";
const RALD_AUTH_UI  = (import.meta.env.VITE_RALD_AUTH_URL as string | undefined) ?? "https://profiles.rald.cloud";
const MESSENGER_URL = (import.meta.env.VITE_MESSENGER_URL as string | undefined) ?? "https://chat.rald.cloud";
const PROFILES_URL  = "https://profiles.rald.cloud";

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

/** Seconds until the token expires. Returns 0 if already expired or invalid. */
function tokenSecondsRemaining(token: string): number {
  const p = decodeJwtPayload(token);
  if (!p || typeof p.exp !== "number") return 0;
  return Math.max(0, p.exp - Math.floor(Date.now() / 1000));
}

/** @deprecated Use session-store directly. Kept for backward compat. */
export function setLoopToken(token: string) {
  setSessionToken(token);
}

/** @deprecated rald_master_token removed — returns null. Cross-app uses handoff. */
export function getRaldMasterToken(): string | null {
  return null;
}

export function redirectToRaldAuth(appUrl: string, appId: string, returnPath = "/"): void {
  const redirectTo = encodeURIComponent(`${appUrl}${returnPath}`);
  window.location.href = `${RALD_AUTH_UI}?redirect_to=${redirectTo}&app_id=${appId}`;
}

/**
 * Open Messenger with seamless SSO.
 * COOKIE-001: Uses a 5-minute handoff token from the Loop Worker instead of
 * passing the rald_master_token. The handoff token is safe in a URL query param.
 */
export async function openMessenger(path = "/chats"): Promise<void> {
  const token = getSessionToken();
  if (!token) {
    redirectToRaldAuth(MESSENGER_URL, "messenger", path);
    return;
  }
  try {
    const res = await authFetch(`${API_BASE}/api/auth/rald-sso/handoff`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ app_id: "messenger", redirect_to: path }),
    });
    if (res.ok) {
      const data = await res.json() as { handoff_token?: string };
      if (data.handoff_token) {
        window.location.href =
          `${MESSENGER_URL}${path}?rald_token=${encodeURIComponent(data.handoff_token)}&app_id=messenger`;
        return;
      }
    }
  } catch { /* fall through to redirect */ }
  redirectToRaldAuth(MESSENGER_URL, "messenger", path);
}

/**
 * Open Profiles with seamless SSO.
 */
export async function openProfiles(path = "/"): Promise<void> {
  const token = getSessionToken();
  if (!token) {
    redirectToRaldAuth(PROFILES_URL, "profiles", path);
    return;
  }
  try {
    const res = await authFetch(`${API_BASE}/api/auth/rald-sso/handoff`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ app_id: "profiles", redirect_to: path }),
    });
    if (res.ok) {
      const data = await res.json() as { handoff_token?: string };
      if (data.handoff_token) {
        window.location.href =
          `${PROFILES_URL}${path}?rald_token=${encodeURIComponent(data.handoff_token)}&app_id=profiles`;
        return;
      }
    }
  } catch { /* fall through */ }
  redirectToRaldAuth(PROFILES_URL, "profiles", path);
}

export function computeTrustScore(profile: Profile): number {
  let score = 0;
  if (profile.username)                                    score += 5;
  if (profile.display_name)                               score += 5;
  if (profile.avatar_url)                                 score += 10;
  if (profile.bio)                                        score += 10;
  if (profile.interests && profile.interests.length >= 3) score += 10;
  if (profile.country)                                    score += 10;
  if (profile.state_id)                                   score += 5;
  if (profile.lga_id)                                     score += 5;
  if (profile.lcda_id)                                    score += 5;
  if (profile.onboarded)                                  score += 5;
  if (profile.is_verified)                                score += 20;
  if (profile.is_creator)                                 score += 10;
  return Math.min(score, 100);
}

export function getTrustLevel(score: number): { level: string; next: string; nextScore: number } {
  if (score < 20) return { level: "Member",               next: "Active Member",        nextScore: 20 };
  if (score < 40) return { level: "Active Member",        next: "Contributor",          nextScore: 40 };
  if (score < 60) return { level: "Contributor",          next: "Verified Contributor", nextScore: 60 };
  if (score < 80) return { level: "Verified Contributor", next: "Trusted Leader",       nextScore: 80 };
  return           { level: "Trusted Leader",             next: "Trusted Leader",       nextScore: 100 };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoopSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const expiredToastShown = useRef(false);
  const refreshTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSession = useCallback(() => {
    setSessionToken(null);
    setSession(null);
    setProfile(null);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  /** Schedule a proactive token refresh at 75% of remaining TTL. */
  const scheduleProactiveRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const secsLeft = tokenSecondsRemaining(token);
    if (secsLeft <= 0) return;
    // Refresh when 75% of time has elapsed (25% remaining)
    const refreshInMs = Math.max((secsLeft * 0.25) * 1000, 30_000);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/silent`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json() as { valid: boolean; access_token?: string };
          if (data.valid && data.access_token) {
            setSessionToken(data.access_token);
            setSession(prev => prev ? { ...prev, access_token: data.access_token! } : prev);
            scheduleProactiveRefresh(data.access_token!);
          }
        }
      } catch { /* network error — do nothing, next 401 will trigger inline refresh */ }
    }, refreshInMs);
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      clearSession();
      if (!expiredToastShown.current) {
        expiredToastShown.current = true;
        toast.error("Session expired — please sign in again", {
          duration: 5000,
          onDismiss:   () => { expiredToastShown.current = false; },
          onAutoClose: () => { expiredToastShown.current = false; },
        });
      }
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, [clearSession]);

  const loadSession = useCallback(async () => {
    // COOKIE-001: Try in-memory token first (exists if SSO just happened in this tab)
    let raw = getSessionToken();

    if (!raw || !isTokenValid(raw)) {
      setSessionToken(null);
      // Attempt cookie-based silent restore
      try {
        const silentCtl = new AbortController();
        const silentTid = setTimeout(() => silentCtl.abort(), 5000);
        const silentRes = await fetch(`${API_BASE}/api/auth/silent`, {
          credentials: "include",
          signal:      silentCtl.signal,
        });
        clearTimeout(silentTid);
        if (silentRes.ok) {
          const silentData = await silentRes.json() as { valid: boolean; access_token?: string };
          if (silentData.valid && silentData.access_token) {
            setSessionToken(silentData.access_token);
            raw = silentData.access_token;
          }
        }
      } catch { /* no cookie session */ }

      if (!raw) {
        setSession(null); setProfile(null); setLoading(false);
        return;
      }
    }

    const payload = decodeJwtPayload(raw)!;
    const user: LoopUser = {
      id:    (payload.id ?? payload.sub) as string,
      phone: (payload.phone ?? payload.email ?? "") as string,
      role:  (payload.role ?? "user") as string | undefined,
    };
    setSession({ access_token: raw, user });
    scheduleProactiveRefresh(raw);
    trackSessionStart();

    try {
      const res = await authFetch(`${API_BASE}/api/auth/me`);
      if (res.ok) {
        const data = await res.json() as { user: LoopUser; profile: Profile | null };
        setProfile(data.profile);
      }
    } catch { /* network error — stay logged in with local token */ }
    setLoading(false);
  }, [scheduleProactiveRefresh]);

  useEffect(() => {
    (async () => {
      const params    = new URLSearchParams(window.location.search);
      const raldToken = params.get("rald_token");
      const appId     = params.get("app_id");

      if (raldToken && (appId === "loop" || appId == null)) {
        // COOKIE-001: Do NOT store raldToken in localStorage.
        // Pass it to the worker which verifies, sets the cookie, and returns a session.
        try {
          const res = await fetch(`${API_BASE}/api/auth/rald-sso`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",  // Receive the cookie the worker sets
            body:    JSON.stringify({ rald_token: raldToken }),
          });
          if (res.ok) {
            const data = await res.json() as { access_token: string };
            // Store in memory only — cookie is already set server-side
            setSessionToken(data.access_token);
            setSsoError(null);
            track("login", { method: "rald_sso" });
          } else {
            const err = await res.json().catch(() => ({})) as { error?: string };
            const msg = err.error ?? `RALD SSO failed (${res.status})`;
            console.error("[rald-sso] exchange rejected:", msg);
            setSsoError(msg);
          }
        } catch (e) {
          console.error("[rald-sso] exchange failed:", e);
          setSsoError("Sign-in failed. Please try again.");
        }

        // Strip rald_token and app_id from URL
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("rald_token");
        cleanUrl.searchParams.delete("app_id");
        const cleanSearch = cleanUrl.search !== "?" ? cleanUrl.search : "";
        window.history.replaceState({}, "", cleanUrl.pathname + cleanSearch);
      }

      await loadSession();
    })();
  }, [loadSession]);

  // Cleanup proactive refresh timer on unmount
  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!getSessionToken()) return;
    try {
      const res = await authFetch(`${API_BASE}/api/auth/me`);
      if (res.ok) {
        const data = await res.json() as { user: LoopUser; profile: Profile | null };
        setProfile(data.profile);
      }
    } catch { /* network error */ }
  }, []);

  const signOut = useCallback(async () => {
    // GLOBAL-LOGOUT-001: Worker clears cookie + fires auth.rald.cloud/logout
    try {
      await authFetch(`${API_BASE}/api/auth/signout`, {
        method:      "POST",
        credentials: "include",
      });
    } catch { /* non-blocking */ }
    clearSession();
    window.location.href = window.location.origin + "/";
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{
      user: session?.user ?? null,
      session,
      profile,
      loading,
      ssoError,
      refreshProfile,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
