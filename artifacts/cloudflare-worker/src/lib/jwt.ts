/**
 * Loop API — Shared JWT Utilities
 *
 * Identity Standard v1.0 (2026-06-07):
 *   - All Loop JWTs are signed with RALD_JWT_SECRET.
 *   - Required claims: sub, email, role, iss, aud, iat, exp
 *   - Audience validated: token aud must equal JWT_AUDIENCE ("loop")
 *   - Issuer: https://loop-api.rald.cloud
 *   - Audience: "loop"
 *
 * SSO-AUD-FIX-001 (2026-06-10):
 *   verifyJwt now accepts an optional `expectedAud` parameter.
 *   Pass null to skip the audience check — required for verifying
 *   incoming RALD SSO tokens, which are cross-system tokens that
 *   may carry aud: "sso", aud: undefined, or aud: <app_id> set by
 *   profiles.rald.cloud. Enforcing aud: "loop" on a token being
 *   PRESENTED to Loop is incorrect — the aud check only makes sense
 *   for Loop-internal tokens (requireAuth middleware path).
 *   Default is still JWT_AUDIENCE for all internal usage.
 *
 * FIX (2026-06-07): signJwt now uses TextEncoder-based base64url encoding
 *   to correctly handle Unicode payloads (African names, Arabic, etc.).
 *   btoa(JSON.stringify(payload)) throws DOMException for any non-Latin-1
 *   character. TextEncoder encodes to UTF-8 bytes first, then base64url.
 */

/** Canonical issuer for all Loop-scoped tokens. */
export const JWT_ISSUER   = "https://loop-api.rald.cloud" as const;

/** Canonical audience for all Loop-scoped tokens. */
export const JWT_AUDIENCE = "loop" as const;

/** OTP session TTL — 30 days (phone users re-auth infrequently). */
export const TTL_OTP_S = 60 * 60 * 24 * 30; // 2_592_000

/** SSO + silent session TTL — 7 days (aligned with RALD session lifecycle). */
export const TTL_SSO_S = 60 * 60 * 24 * 7;  // 604_800

/**
 * Unicode-safe base64url encoding.
 * Encodes a string as UTF-8 bytes first, then base64url-encodes the result.
 * This correctly handles all Unicode — including African scripts, Arabic,
 * and emoji — unlike plain btoa() which only accepts Latin-1 (0x00–0xFF).
 */
function base64urlEncode(str: string): string {
  const bytes  = new TextEncoder().encode(str);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Sign a JWT with HMAC-SHA256.
 * Caller is responsible for supplying a well-formed, standards-compliant payload.
 */
export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = base64urlEncode(JSON.stringify(payload));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.${sigB64}`;
}

/**
 * Verify a JWT with HMAC-SHA256.
 * Returns the decoded payload on success; null on invalid signature,
 * expiry, or any parse failure.
 *
 * @param expectedAud - Expected audience claim. Pass null to skip the
 *   audience check entirely (required for incoming cross-system SSO tokens
 *   from profiles.rald.cloud — see SSO-AUD-FIX-001). Defaults to
 *   JWT_AUDIENCE ("loop") for all internal token verification.
 */
export async function verifyJwt(
  token: string,
  secret: string,
  expectedAud: string | null = JWT_AUDIENCE,
): Promise<Record<string, unknown> | null> {
  try {
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, sigBytes, enc.encode(`${header}.${body}`),
    );
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return null;
    // Audience check — skipped when expectedAud is null (cross-system SSO exchange)
    if (expectedAud !== null && payload.aud !== expectedAud) return null;
    return payload;
  } catch {
    return null;
  }
}
