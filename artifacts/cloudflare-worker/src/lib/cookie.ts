// Loop Worker — Cookie utilities (mirrors rald-auth-core pattern)
// COOKIE-001 (2026-06-09): Added buildSessionCookie + clearSessionCookie for
//   the localStorage → HttpOnly cookie migration.
// LILCKY STUDIO LIMITED

const LOOP_COOKIE = "loop_session";

/** Extract loop_session (or legacy rald_session) from a Cookie request header. */
export function parseSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    const key = k?.trim();
    if (key === LOOP_COOKIE || key === "rald_session") return v.join("=").trim() || null;
  }
  return null;
}

/**
 * Build a Set-Cookie header that sets the HttpOnly session cookie.
 * HttpOnly — inaccessible to JavaScript.
 * Secure   — HTTPS only.
 * SameSite=Lax — sent on same-site navigations and top-level cross-site GETs
 *                (safe for SSO redirect flows).
 */
export function buildSessionCookie(token: string, maxAge: number): string {
  return `${LOOP_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/** Build a Set-Cookie header that clears the session cookie immediately. */
export function clearSessionCookie(): string {
  return `${LOOP_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
