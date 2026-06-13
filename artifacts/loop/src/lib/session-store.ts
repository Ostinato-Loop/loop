/**
 * Loop — In-memory session token store.
 *
 * COOKIE-001 (2026-06-09): Replaces localStorage[loop_token] as the
 * in-tab token source. Session persistence across page refreshes is handled
 * by the HttpOnly loop_session cookie via GET /api/auth/silent.
 *
 * This module is the single source of truth for the current access token.
 * Both use-auth.tsx (writer) and api-fetch.ts (reader) import from here to
 * avoid the circular dependency that would arise if api-fetch imported use-auth.
 *
 * Tokens held here are in-memory only — they do not survive a page refresh.
 * On refresh, AuthProvider calls /api/auth/silent which reads the HttpOnly
 * cookie and returns a fresh token to repopulate this store.
 *
 * CRASH-001 (2026-06-13): Also mirrors the token on window.__loopSessionToken
 * so supabase/client.ts can read it without a direct import (which would create
 * a circular dependency through the Supabase SDK init path).
 *
 * LILCKY STUDIO LIMITED
 */

let _token: string | null = null;

/** Get the current in-memory session token. */
export function getSessionToken(): string | null {
  return _token;
}

/** Set the current in-memory session token. */
export function setSessionToken(t: string | null): void {
  _token = t;
  // CRASH-001: Mirror on window so supabase/client.ts can read it without
  // importing this module (avoids circular dependency via the Supabase SDK).
  try {
    (window as Window & { __loopSessionToken?: string | null }).__loopSessionToken = t;
  } catch { /* SSR / non-browser env — ignore */ }
}
