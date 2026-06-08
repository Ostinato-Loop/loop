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
import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { authFetch, AUTH_EXPIRED_EVENT } from "@/lib/api-fetch";
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
  // Regional identity (migration 006)
  country: string | null;
  lga_id: string | null;
  lcda_id: string | null;
  // Trust
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

const TOKEN_KEY       = "loop_token";
const RALD_TOKEN_KEY  = "rald_master_token";
const API_BASE        = import.meta.env.VITE_API_BASE_URL ?? "";

const RALD_AUTH_UI    = (import.meta.env.VITE_RALD_AUTH_URL as string | undefined) ?? "https://profiles.rald.cloud";
const MESSENGER_URL   = (import.meta.env.VITE_MESSENGER_URL as string | undefined) ?? "https://chat.rald.cloud";
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

export function getRaldMasterToken(): string | null {
  return localStorage.getItem(RALD_TOKEN_KEY);
}

export function redirectToRaldAuth(appUrl: string, appId: string, returnPath = "/"): void {
  const redirectTo = encodeURIComponent(`${appUrl}${returnPath}`);
  window.location.href = `${RALD_AUTH_UI}?redirect_to=${redirectTo}&app_id=${appId}`;
}

export function openMessenger(path = "/chats"): void {
  const raldToken = getRaldMasterToken();
  if (raldToken && isTokenValid(raldToken)) {
    window.location.href =
      `${MESSENGER_URL}${path}?rald_token=${encodeURIComponent(raldToken)}&app_id=messenger`;
  } else {
    redirectToRaldAuth(MESSENGER_URL, "messenger", path);
  }
}

export function openProfiles(path = "/"): void {
  const raldToken = getRaldMasterToken();
  if (raldToken && isTokenValid(raldToken)) {
    window.location.href =
      `${PROFILES_URL}${path}?rald_token=${encodeURIComponent(raldToken)}&app_id=profiles`;
  } else {
    redirectToRaldAuth(PROFILES_URL, "profiles", path);
  }
}

/** Compute a trust score from profile completeness. 0–100. */
export function computeTrustScore(profile: Profile): number {
  let score = 0;
  if (profile.username)                              score += 5;
  if (profile.display_name)                          score += 5;
  if (profile.avatar_url)                            score += 10;
  if (profile.bio)                                   score += 10;
  if (profile.interests && profile.interests.length >= 3) score += 10;
  if (profile.country)                               score += 10;
  if (profile.state_id)                              score += 5;
  if (profile.lga_id)                                score += 5;
  if (profile.lcda_id)                               score += 5;
  if (profile.onboarded)                             score += 5;
  if (profile.is_verified)                           score += 20;
  if (profile.is_creator)                            score += 10;
  return Math.min(score, 100);
}

export function getTrustLevel(score: number): { level: string; next: string; nextScore: number } {
  if (score < 20) return { level: "Member",              next: "Active Member",       nextScore: 20 };
  if (score < 40) return { level: "Active Member",       next: "Contributor",         nextScore: 40 };
  if (score < 60) return { level: "Contributor",         next: "Verified Contributor", nextScore: 60 };
  if (score < 80) return { level: "Verified Contributor", next: "Trusted Leader",     nextScore: 80 };
  return          { level: "Trusted Leader",             next: "Trusted Leader",      nextScore: 100 };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoopSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const expiredToastShown = useRef(false);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      clearSession();
      if (!expiredToastShown.current) {
        expiredToastShown.current = true;
        toast.error("Session expired — please sign in again", {
          duration: 5000,
          onDismiss: () => { expiredToastShown.current = false; },
          onAutoClose: () => { expiredToastShown.current = false; },
        });
      }
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, [clearSession]);

  const loadSession = useCallback(async () => {
    let raw = localStorage.getItem(TOKEN_KEY);
    if (!raw || !isTokenValid(raw)) {
      localStorage.removeItem(TOKEN_KEY);
      try {
        const silentRes = await fetch(`${API_BASE}/api/auth/silent`, { credentials: 'include' });
        if (silentRes.ok) {
          const silentData = await silentRes.json() as { valid: boolean; access_token?: string };
          if (silentData.valid && silentData.access_token) {
            localStorage.setItem(TOKEN_KEY, silentData.access_token);
            raw = silentData.access_token;
          }
        }
      } catch { /* no cookie session — fall through */ }
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
    trackSessionStart();
    try {
      const res = await authFetch(`${API_BASE}/api/auth/me`);
      if (res.ok) {
        const data = await res.json() as { user: LoopUser; profile: Profile | null };
        setProfile(data.profile);
      }
    } catch { /* network error — still logged in with local token */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const params    = new URLSearchParams(window.location.search);
      const raldToken = params.get("rald_token");
      const appId     = params.get("app_id");

      if (raldToken && (appId === "loop" || appId == null)) {
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
            track("login", { method: "rald_sso" });
          } else {
            const err = await res.json().catch(() => ({})) as { error?: string };
            const msg = err.error ?? `RALD SSO failed (${res.status})`;
            console.error("[rald-sso] exchange rejected:", msg);
            setSsoError(msg);
            localStorage.removeItem(RALD_TOKEN_KEY);
          }
        } catch (e) {
          console.error("[rald-sso] exchange failed:", e);
          setSsoError("Sign-in failed. Please try again.");
        }
        const clean = window.location.pathname;
        window.history.replaceState({}, "", clean);
      }

      await loadSession();
    })();
  }, [loadSession]);

  const refreshProfile = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    try {
      const res = await authFetch(`${API_BASE}/api/auth/me`);
      if (res.ok) {
        const data = await res.json() as { user: LoopUser; profile: Profile | null };
        setProfile(data.profile);
      }
    } catch { /* network error — leave profile as-is */ }
  }, []);

  const signOut = useCallback(async () => {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (raw) {
      try {
        await fetch(`${API_BASE}/api/auth/signout`, {
          method: "POST",
          credentials: "include",
          headers: { Authorization: `Bearer ${raw}` },
        });
      } catch { /* non-blocking */ }
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(RALD_TOKEN_KEY);
    setSession(null);
    setProfile(null);
    window.location.href = window.location.origin + "/";
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
