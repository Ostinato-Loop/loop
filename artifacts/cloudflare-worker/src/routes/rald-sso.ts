/**
 * Loop × RALD SSO Bridge — Phase H (Identity Axiom)
 *
 * POST /api/auth/rald-sso          { rald_token }
 *   Validates RALD JWT → upserts profile → re-signs Loop-scoped JWT →
 *   sets HttpOnly loop_session cookie → registers device.
 *
 * GET  /api/auth/rald-sso/silent
 *   Cookie-based silent session. Refreshes cookie TTL on every valid check.
 *
 * POST /api/auth/rald-sso/handoff  { app_id, redirect_to? }
 *   Issues a 5-minute cross-app handoff token. Replaces rald_master_token
 *   localStorage pattern (COOKIE-001). Safe to pass as a URL query param.
 *
 * COOKIE-001 (2026-06-09):
 *   - loop_session HttpOnly cookie set on every successful exchange.
 *   - Tokens no longer go to localStorage from the frontend.
 *   - Device registered in auth_devices on every SSO exchange.
 *
 * IDN-001 (2026-06-07): Loop token is a re-signed copy, not the raw RALD token.
 * PHD-001 (2026-06-07): jti claim included for per-token revocation.
 *
 * USN-001 (2026-06-12): Username propagation fixes
 *   - upsertProfile NO LONGER derives username from email slug.
 *     Username is taken only from the rald.username JWT claim.
 *   - issueLoopToken includes username in the re-signed Loop JWT.
 *   - Fallback remote verification: if local RALD_JWT_SECRET verify fails
 *     (possible during secret rotation or mismatch), the worker falls back
 *     to calling auth.rald.cloud/sso/verify server-side. This prevents
 *     hard login failures caused by a transient secret mismatch.
 *
 * SSO-AUD-FIX-001 (2026-06-10):
 *   verifyJwt called with null expectedAud for incoming RALD SSO tokens.
 *
 * SSO-VERIFY-FALLBACK-001 (2026-06-12):
 *   Fallback path to auth.rald.cloud/sso/verify when local verify fails.
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import { parseSessionCookie, buildSessionCookie } from "../lib/cookie.js";
import {
  signJwt,
  verifyJwt,
  JWT_ISSUER,
  JWT_AUDIENCE,
  TTL_SSO_S,
} from "../lib/jwt.js";

export const raldSso = new Hono<{ Bindings: CloudflareEnv }>();

/* ── Types ───────────────────────────────────────────────────────────── */

interface RaldPayload {
  id:        string;
  email?:    string;
  phone?:    string;
  name?:     string | null;
  username?: string | null;  // USN-001: cross-app username propagation
  role?:     string;
  appId?:    string;
  iat?:      number;
  exp?:      number;
}

/* ── Device registration (Sprint 2) ──────────────────────────────────── */

function parseUserAgent(ua: string): { deviceType: string; deviceName: string; os: string; browser: string } {
  const isIphone  = /iPhone/.test(ua);
  const isIpad    = /iPad/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isMac     = /Macintosh/.test(ua);
  const isWindows = /Windows/.test(ua);
  const deviceType = (isIphone || isAndroid) ? "mobile" : isIpad ? "tablet" : "desktop";
  const os =
    isIphone  ? `iOS ${ua.match(/OS (\d+_\d+)/)?.[1]?.replace("_", ".") ?? ""}`.trim() :
    isAndroid ? `Android ${ua.match(/Android ([\d.]+)/)?.[1] ?? ""}`.trim() :
    isMac     ? "macOS" : isWindows ? "Windows" : "Other";
  const browser =
    /Edg\//.test(ua)     ? "Edge"    :
    /Chrome\//.test(ua)  ? "Chrome"  :
    /Safari\//.test(ua)  ? "Safari"  :
    /Firefox\//.test(ua) ? "Firefox" : "Unknown";
  const deviceName =
    isIphone ? "iPhone" : isIpad ? "iPad" : isAndroid ? "Android" :
    `${browser} on ${os}`;
  return { deviceType, deviceName, os, browser };
}

/** Register/update device record on every login. Non-blocking — never throws. */
async function registerDevice(sbUrl: string, sbKey: string, userId: string, req: Request): Promise<void> {
  try {
    const ua      = req.headers.get("User-Agent") ?? "Unknown";
    const ip      = req.headers.get("CF-Connecting-IP")
                 ?? req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
                 ?? "unknown";
    const city    = req.headers.get("cf-ipcity")   ?? null;
    const country = req.headers.get("cf-ipcountry") ?? null;
    const { deviceType, deviceName, os, browser } = parseUserAgent(ua);
    const now = new Date().toISOString();

    await fetch(`${sbUrl}/rest/v1/auth_devices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${sbKey}`,
        apikey:         sbKey,
        Prefer:         "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id:      userId,
        device_name:  deviceName,
        device_type:  deviceType,
        os,
        browser,
        ip_address:   ip,
        city,
        country,
        last_seen_at: now,
        is_trusted:   false,
      }),
    });
  } catch { /* non-fatal */ }
}

/* ── Supabase helpers ────────────────────────────────────────────────── */

async function sbAdmin(
  url: string, key: string, method: string, path: string,
  body?: unknown, extra?: Record<string, string>,
) {
  return fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key, ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function provisionSupabaseAuthUser(sbUrl: string, sbKey: string, rald: RaldPayload): Promise<void> {
  if (!rald.email) return;
  try {
    const check = await sbAdmin(sbUrl, sbKey, "GET",
      `/auth/v1/admin/users?email=${encodeURIComponent(rald.email)}&per_page=1`);
    if (check.ok) {
      const d = await check.json() as { users?: { id: string }[] };
      if (d.users?.length) return;
    }
    await sbAdmin(sbUrl, sbKey, "POST", "/auth/v1/admin/users", {
      email: rald.email, email_confirm: true,
      user_metadata: { rald_id: rald.id, source: "rald-sso" },
    });
  } catch { /* non-fatal */ }
}

/**
 * USN-001: Upsert the Loop profile row for this user.
 *
 * CRITICAL FIX: username is NEVER derived from the email address.
 * Deriving a slug from the email (old behaviour) overwrote any real username
 * the user had claimed via /username/claim on every subsequent SSO login.
 *
 * Rules:
 *   • display_name — always updated from rald.name or rald.email prefix
 *   • username — set ONLY if rald.username is non-null (comes from the JWT claim
 *     that rald-auth-core now populates via USN-001 in sso/exchange).
 *     If the JWT carries no username (null), the existing profile.username is
 *     left untouched — the field is simply absent from the upsert payload so
 *     Supabase merge-duplicates does not touch it.
 */
async function upsertProfile(sbUrl: string, sbKey: string, rald: RaldPayload): Promise<void> {
  const profile: Record<string, unknown> = { id: rald.id };

  if (rald.name) {
    profile.display_name = rald.name;
  } else if (rald.email) {
    profile.display_name = rald.email.split("@")[0];
  }

  // USN-001: Only propagate username from the JWT claim — NEVER from email slug.
  // Supabase merge-duplicates only touches columns present in the payload,
  // so omitting username here means an existing profile.username is preserved.
  if (rald.username) {
    profile.username = rald.username;
  }

  // ZERO-FRICTION-001: SSO-provisioned users skip the onboarding gate.
  // A user who authenticated via RALD Identity has already verified their
  // identity — there is no registration step remaining. Setting onboarded=true
  // here (merge-duplicates) means the Loop ProtectedRoute routes them to the
  // feed immediately, not to /onboarding.
  // merge-duplicates only writes columns present in the payload, so this only
  // updates the field — it does not wipe any other profile data.
  profile.onboarded = true;

  try {
    await sbAdmin(sbUrl, sbKey, "POST", "/rest/v1/profiles", profile,
      { Prefer: "resolution=merge-duplicates,return=minimal" });
  } catch { /* non-fatal */ }
}

async function issueLoopToken(
  rald: RaldPayload, secret: string, source: "rald-sso" | "silent",
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    sub:      rald.id,
    email:    rald.email    ?? null,
    role:     rald.role     ?? "user",
    username: rald.username ?? null,  // USN-001: carry username in the Loop-scoped token
    iss:      JWT_ISSUER,
    aud:      JWT_AUDIENCE,
    iat:      now,
    exp:      now + TTL_SSO_S,
    jti:      crypto.randomUUID(),
    id:       rald.id,
    source,
  }, secret);
}


/* ── Debug token decoder (non-verifying) ─────────────────────────────── */
/**
 * Decode a JWT payload WITHOUT verifying the signature.
 * Used only for structured logging so we can see what came in regardless
 * of whether verification succeeds. Never trust the output for auth decisions.
 */
function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    const [, body] = token.split(".");
    if (!body) return {};
    return JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
  } catch { return {}; }
}

/* ── POST /api/auth/rald-sso ─────────────────────────────────────────── */

raldSso.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { rald_token?: string };
  if (!body.rald_token) return c.json({ error: "rald_token is required" }, 400);

  // SSO-AUD-FIX-001 + SSO-LOG-001: Decode claims BEFORE verification for observability.
  const incomingClaims = decodeJwtClaims(body.rald_token);
  const logCtx = {
    incoming_aud: incomingClaims.aud ?? null,
    incoming_iss: incomingClaims.iss ?? null,
    incoming_exp: incomingClaims.exp ?? null,
    incoming_sub: incomingClaims.sub ?? incomingClaims.id ?? null,
    token_age_s:  typeof incomingClaims.iat === "number"
      ? Math.floor(Date.now() / 1000) - (incomingClaims.iat as number)
      : null,
    timestamp: new Date().toISOString(),
  };

  // SSO-AUD-FIX-001: Pass null as expectedAud — incoming RALD SSO token is a
  // cross-system token from profiles.rald.cloud. Its aud claim may be "sso",
  // the app_id, or absent. Enforcing aud:"loop" here breaks SSO.
  let rald = await verifyJwt(body.rald_token, c.env.RALD_JWT_SECRET, null) as RaldPayload | null;

  // SSO-VERIFY-FALLBACK-001: If local verification fails (e.g. transient
  // RALD_JWT_SECRET mismatch between CF Workers during secret rotation),
  // fall back to server-side verification at auth.rald.cloud. This prevents
  // hard login failures caused by a secret that has not yet propagated.
  if (!rald?.id) {
    try {
      const authUrl = (c.env as unknown as Record<string, string>).RALD_AUTH_URL ?? "https://auth.rald.cloud";
      const verifyRes = await fetch(`${authUrl}/sso/verify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token: body.rald_token }),
        signal:  AbortSignal.timeout(3000),
      });
      if (verifyRes.ok) {
        const verifyData = await verifyRes.json() as { valid: boolean; user?: Record<string, unknown> };
        if (verifyData?.valid && verifyData.user?.id) {
          rald = verifyData.user as unknown as RaldPayload;
          console.log("[rald-sso] fallback verify succeeded", JSON.stringify({
            level: "info", service: "loop-api", userId: rald.id, ...logCtx,
          }));
        }
      }
    } catch { /* fallback failed — will reject below */ }
  }

  if (!rald?.id) {
    console.warn("[rald-sso] token rejected", JSON.stringify({
      level: "warn",
      reason: "invalid_or_expired_rald_token",
      service: "loop-api",
      ...logCtx,
    }));
    // IDENTITY-CONTINUITY-001: Never expose infrastructure terms to users.
    // "Invalid or expired RALD token" is internal — replaced with human language.
    return c.json({
      error:   "Your session couldn't be verified. Please sign in again.",
      code:    "session_reconnect_required",
      action:  "sign_in",
    }, 401);
  }

  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  // Provision + device registration — all non-blocking
  await Promise.allSettled([
    provisionSupabaseAuthUser(sbUrl, sbKey, rald),
    upsertProfile(sbUrl, sbKey, rald),
    registerDevice(sbUrl, sbKey, rald.id, c.req.raw),
  ]);

  const loopToken = await issueLoopToken(rald, c.env.RALD_JWT_SECRET, "rald-sso");

  // COOKIE-001: Set HttpOnly session cookie — no localStorage from browser
  c.header("Set-Cookie", buildSessionCookie(loopToken, TTL_SSO_S));

  console.log("[rald-sso] exchange ok", JSON.stringify({
    level: "info",
    service: "loop-api",
    userId: rald.id,
    has_username: !!rald.username,
    source: "rald-sso",
    ...logCtx,
  }));

  return c.json({
    access_token: loopToken,
    user: { id: rald.id, email: rald.email ?? null, phone: rald.phone ?? null, role: rald.role ?? "user" },
    has_username: !!rald.username,  // USN-001: client shows username setup if false
  });
});

/* ── GET /api/auth/rald-sso/silent ──────────────────────────────────── */

raldSso.get("/silent", async (c) => {
  const token = parseSessionCookie(c.req.header("Cookie"));
  if (!token) return c.json({ valid: false, reason: "no_session_cookie" }, 401);

  const rald = await verifyJwt(token, c.env.RALD_JWT_SECRET) as RaldPayload | null;
  if (!rald || !rald.id) return c.json({ valid: false, reason: "invalid_or_expired_token" }, 401);

  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  upsertProfile(sbUrl, c.env.SUPABASE_SERVICE_ROLE_KEY, rald).catch(() => null);

  const loopToken = await issueLoopToken(rald, c.env.RALD_JWT_SECRET, "silent");

  // COOKIE-001: Refresh cookie TTL on every valid silent check
  c.header("Set-Cookie", buildSessionCookie(loopToken, TTL_SSO_S));

  return c.json({
    valid:        true,
    user:         { id: rald.id, email: rald.email ?? null, role: rald.role ?? "user" },
    access_token: loopToken,
    has_username: !!rald.username,  // USN-001
  });
});

/* ── POST /api/auth/rald-sso/handoff ────────────────────────────────── */
/**
 * Issues a 5-minute cross-app handoff token for seamless SSO navigation.
 *
 * COOKIE-001: Replaces the rald_master_token localStorage pattern.
 * The handoff token is short-lived and safe to put in a URL query param.
 * The receiving app (Messenger, Profiles, etc.) verifies it like any RALD token.
 *
 * Authorization: Accept Bearer OR cookie so it works from any context.
 */
raldSso.post("/handoff", async (c) => {
  const authHeader = c.req.header("Authorization");
  let sessionToken: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    sessionToken = authHeader.slice(7);
  } else {
    sessionToken = parseSessionCookie(c.req.header("Cookie"));
  }
  if (!sessionToken) return c.json({ error: "Unauthorized" }, 401);

  const payload = await verifyJwt(sessionToken, c.env.RALD_JWT_SECRET) as RaldPayload | null;
  if (!payload?.id) return c.json({ error: "Unauthorized" }, 401);

  const body = (await c.req.json().catch(() => ({}))) as { app_id?: string; redirect_to?: string };
  if (!body.app_id) return c.json({ error: "app_id required" }, 400);

  // 5-minute handoff token — aud is the target app so it is scoped correctly
  const now = Math.floor(Date.now() / 1000);
  const handoffToken = await signJwt({
    sub:          payload.id,
    id:           payload.id,
    email:        payload.email    ?? null,
    role:         payload.role     ?? "user",
    username:     payload.username ?? null,  // USN-001: carry username across apps
    iss:          JWT_ISSUER,
    aud:          body.app_id,   // Target app audience
    iat:          now,
    exp:          now + 300,     // 5 minutes — safe for URL param
    jti:          crypto.randomUUID(),
    source:       "handoff",
    handoff_from: "loop",
  }, c.env.RALD_JWT_SECRET);

  return c.json({ handoff_token: handoffToken, expires_in: 300, app_id: body.app_id });
});
