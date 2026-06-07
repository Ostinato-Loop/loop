/**
 * Loop — Authenticated Fetch Utility
 *
 * Wraps `fetch()` to automatically:
 *   1. Attach the stored loop_token as Authorization: Bearer
 *   2. On 401 → attempt a silent cookie-based token refresh via /api/auth/silent
 *   3. On refresh success → store new token, retry original request once
 *   4. On refresh failure → clear local token, dispatch AUTH_EXPIRED_EVENT
 *
 * All components/hooks that call authenticated Loop API Worker endpoints
 * should use authFetch() instead of raw fetch().
 *
 * Supabase calls are handled separately through authedSupabase().
 * RALD people graph calls use the rald_master_token and are independent.
 *
 * LILCKY STUDIO LIMITED
 */

const TOKEN_KEY = "loop_token";
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export const AUTH_EXPIRED_EVENT = "loop:auth:expired" as const;

/** Attempt a silent token refresh via the session cookie.
 *  Returns the new access_token string if successful, null otherwise. */
async function silentRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/silent`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json() as { valid?: boolean; access_token?: string };
    if (data.valid && data.access_token) {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

/** Dispatch the auth-expired event so AuthProvider can clear state and show a toast. */
function dispatchExpired(): void {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

/**
 * authFetch — drop-in replacement for fetch() for authenticated Loop API calls.
 *
 * Usage:
 *   const res = await authFetch(`${API_BASE}/api/auth/me`);
 *   const res = await authFetch(`${API_BASE}/api/rooms`, { method: "POST", body: ... });
 */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);

  const withAuth = (tok: string | null): RequestInit => ({
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
  });

  const res = await fetch(url, withAuth(token));

  if (res.status !== 401) return res;

  // ── 401: attempt silent refresh ───────────────────────────────────────
  const newToken = await silentRefresh();
  if (newToken) {
    const retryRes = await fetch(url, withAuth(newToken));
    if (retryRes.status !== 401) return retryRes;
  }

  // ── Still 401 after refresh attempt — session is truly expired ────────
  dispatchExpired();
  return res;
}
