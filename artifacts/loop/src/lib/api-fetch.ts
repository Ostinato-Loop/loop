/**
 * Loop — Authenticated Fetch Utility
 *
 * COOKIE-001 (2026-06-09): Migrated from localStorage to HttpOnly cookie session.
 *   - Tokens are read from session-store (in-memory module), never localStorage.
 *   - All requests include credentials: 'include' so the HttpOnly loop_session
 *     cookie is forwarded to the Loop Worker on every request.
 *   - Silent refresh reads the cookie — no localStorage involved at any point.
 *   - dispatchExpired clears the in-memory token; cookie expiry is handled
 *     server-side when the /api/auth/silent check fails.
 *
 * Wraps fetch() to automatically:
 *   1. Attach the in-memory token as Authorization: Bearer
 *   2. On 401 → attempt silent cookie-based token refresh via /api/auth/silent
 *   3. On refresh success → update in-memory token, retry original request once
 *   4. On refresh failure → clear in-memory token, dispatch AUTH_EXPIRED_EVENT
 *
 * LILCKY STUDIO LIMITED
 */

import { getSessionToken, setSessionToken } from "./session-store";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export const AUTH_EXPIRED_EVENT = "loop:auth:expired" as const;

/** Attempt a silent token refresh via the HttpOnly session cookie. */
async function silentRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/silent`, {
      method:      "GET",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json() as { valid?: boolean; access_token?: string };
    if (data.valid && data.access_token) {
      setSessionToken(data.access_token);
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

/** Dispatch the auth-expired event so AuthProvider can clear state. */
function dispatchExpired(): void {
  setSessionToken(null);
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

/**
 * authFetch — drop-in replacement for fetch() for authenticated Loop API calls.
 * Always sends credentials: 'include' and attaches the in-memory Bearer token.
 *
 * Usage:
 *   const res = await authFetch(`${API_BASE}/api/auth/me`);
 *   const res = await authFetch(`${API_BASE}/api/rooms`, { method: "POST", body: ... });
 */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getSessionToken();

  const withAuth = (tok: string | null): RequestInit => ({
    ...init,
    credentials: "include",   // COOKIE-001: always send loop_session cookie
    headers: {
      ...(init?.headers ?? {}),
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
  });

  const res = await fetch(url, withAuth(token));

  if (res.status !== 401) return res;

  // ── 401: attempt silent refresh via HttpOnly cookie ───────────────────
  const newToken = await silentRefresh();
  if (newToken) {
    const retryRes = await fetch(url, withAuth(newToken));
    if (retryRes.status !== 401) return retryRes;
  }

  // ── Still 401 after refresh — session is truly expired ────────────────
  dispatchExpired();
  return res;
}
