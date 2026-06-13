// Loop Worker — Cookie utilities (mirrors rald-auth-core pattern)
// COOKIE-001 (2026-06-09): Added buildSessionCookie + clearSessionCookie for
//   the localStorage → HttpOnly cookie migration.
// SESSION-P1-001 (2026-06-13): Added Domain=.rald.cloud so loop_session
//   is visible across all RALD subdomains (loop.rald.cloud, chat.rald.cloud,
//   profiles.rald.cloud, etc.) and upgraded to SameSite=None for
//   credentialed cross-origin cookie propagation during SSO redirects.
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
 *
 * Attributes:
 *   HttpOnly     — inaccessible to JavaScript (XSS protection).
 *   Secure       — HTTPS only; never sent over plain HTTP.
 *   SameSite=None — required for credentialed cross-origin requests
 *                   (SSO redirects between rald.cloud subdomains).
 *                   Requires Secure=true (enforced above).
 *   Domain=.rald.cloud — sent on all *.rald.cloud subdomains, enabling
 *                        silent session propagation across the ecosystem.
 *   Path=/       — full-origin scope.
 *   Max-Age      — caller-supplied TTL in seconds.
 */
export function buildSessionCookie(token: string, maxAge: number): string {
  return (
    `${LOOP_COOKIE}=${token}` +
    `; HttpOnly` +
    `; Secure` +
    `; SameSite=None` +
    `; Domain=.rald.cloud` +
    `; Path=/` +
    `; Max-Age=${maxAge}`
  );
}

/** Build a Set-Cookie header that clears the session cookie immediately. */
export function clearSessionCookie(): string {
  return (
    `${LOOP_COOKIE}=` +
    `; HttpOnly` +
    `; Secure` +
    `; SameSite=None` +
    `; Domain=.rald.cloud` +
    `; Path=/` +
    `; Max-Age=0` +
    `; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}
