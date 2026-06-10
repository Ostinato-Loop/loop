/**
 * Loop — Authenticated Fetch Utility
 *
 * COOKIE-001 (2026-06-09): localStorage → HttpOnly cookie migration.
 *   All requests include credentials: 'include' so the HttpOnly loop_session
 *   cookie is forwarded to the Loop Worker on every request.
 *
 * HARDENING-001 (2026-06-10):
 *   - Request timeout: 12s via AbortController (avoids silent hangs on mobile)
 *   - Network-error retry: 2 retries with exponential backoff for transient failures
 *   - Structured error classification: timeout vs network vs API errors
 *   - Silent refresh still fires on 401 before retry
 *
 * Wraps fetch() to automatically:
 *   1. Attach the in-memory token as Authorization: Bearer
 *   2. Apply a 12-second timeout (AbortController)
 *   3. On network error → retry up to 2x with backoff (150ms, 400ms)
 *   4. On 401 → attempt silent cookie-based token refresh via /api/auth/silent
 *   5. On refresh success → update in-memory token, retry original request once
 *   6. On refresh failure → clear in-memory token, dispatch AUTH_EXPIRED_EVENT
 *
 * LILCKY STUDIO LIMITED
 */

import { getSessionToken, setSessionToken } from "./session-store";

const API_BASE      = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES        = 2;

export const AUTH_EXPIRED_EVENT = "loop:auth:expired" as const;

/** Attempt a silent token refresh via the HttpOnly session cookie. */
async function silentRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/silent`, {
      method:      "GET",
      credentials: "include",
      signal:      AbortSignal.timeout(8_000),
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

/** Sleep for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Classify whether an error is a network-level transient failure worth retrying. */
function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    // AbortError from our own timeout — not retryable (already timed out once)
    if (err.name === "AbortError" || err.name === "TimeoutError") return false;
    // TypeError: Failed to fetch / NetworkError — retryable
    if (err instanceof TypeError) return true;
  }
  return false;
}

/**
 * fetchWithTimeout — wraps fetch() with a 12-second AbortController timeout.
 * On mobile, unresponsive connections can stall indefinitely without this.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fetchWithRetry — retries transient network errors with exponential backoff.
 * Does NOT retry on 4xx/5xx — those are application-level errors, not transient.
 */
async function fetchWithRetry(url: string, init: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  const backoff = [150, 400]; // ms before each retry
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, init);
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === retries) throw err;
      await sleep(backoff[attempt] ?? 400);
    }
  }
  throw lastError;
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
    credentials: "include",
    headers: {
      ...(init?.headers ?? {}),
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
  });

  let res: Response;
  try {
    res = await fetchWithRetry(url, withAuth(token));
  } catch (err) {
    // Network error after retries exhausted — surface a clean error object
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.");
    }
    if (err instanceof TypeError) {
      throw new Error("Network error. Check your connection and try again.");
    }
    throw err;
  }

  if (res.status !== 401) return res;

  // ── 401: attempt silent refresh via HttpOnly cookie ───────────────────
  const newToken = await silentRefresh();
  if (newToken) {
    try {
      const retryRes = await fetchWithRetry(url, withAuth(newToken));
      if (retryRes.status !== 401) return retryRes;
    } catch {
      // If the retry itself fails (network error), fall through to expired
    }
  }

  // ── Still 401 after refresh — session is truly expired ────────────────
  dispatchExpired();
  return res;
}
