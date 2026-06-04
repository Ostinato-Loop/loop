// Loop Worker — Cookie utilities (mirrors rald-auth-core pattern)
// LILCKY STUDIO LIMITED

/** Extract rald_session value from a Cookie request header. */
export function parseSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k?.trim() === "rald_session") return v.join("=").trim() || null;
  }
  return null;
}
