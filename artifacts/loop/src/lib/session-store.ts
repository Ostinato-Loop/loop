/**
 * Loop — In-memory session token store.
 *
 * COOKIE-001 (2026-06-09): Replaces localStorage["loop_token"] as the
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
}
