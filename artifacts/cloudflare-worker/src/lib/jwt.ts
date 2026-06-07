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
 * See AUDIT/jwt-claim-standard.md for the full specification.
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
 * Sign a JWT with HMAC-SHA256.
 * Caller is responsible for supplying a well-formed, standards-compliant payload.
 */
export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
 */
export async function verifyJwt(
  token: string,
  secret: string,
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
    // B4 — validate audience claim to prevent cross-service token reuse
    if (payload.aud !== JWT_AUDIENCE) return null;
    return payload;
  } catch {
    return null;
  }
}
