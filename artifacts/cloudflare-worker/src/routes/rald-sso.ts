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
  id:     string;
  email?: string;
  phone?: string;
  name?:  string | null;
  role?:  string;
  appId?: string;
  iat?:   number;
  exp?:   number;
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

async function upsertProfile(sbUrl: string, sbKey: string, rald: RaldPayload): Promise<void> {
  const profile: Record<string, unknown> = { id: rald.id };
  if (rald.name) {
    profile.display_name = rald.name;
  } else if (rald.email) {
    profile.display_name = rald.email.split("@")[0];
  }
  if (rald.email) {
    const slug = rald.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20);
    if (slug.length >= 3) profile.username = slug;
  }
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
    sub:    rald.id,
    email:  rald.email ?? null,
    role:   rald.role  ?? "user",
    iss:    JWT_ISSUER,
    aud:    JWT_AUDIENCE,
    iat:    now,
    exp:    now + TTL_SSO_S,
    jti:    crypto.randomUUID(),
    id:     rald.id,
    source,
  }, secret);
}

/* ── POST /api/auth/rald-sso ─────────────────────────────────────────── */

raldSso.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { rald_token?: string };
  if (!body.rald_token) return c.json({ error: "rald_token is required" }, 400);

  // SSO-AUD-FIX-001: Pass null as expectedAud — incoming RALD SSO token is a
  // cross-system token from profiles.rald.cloud. Its aud claim is set by RALD
  // (e.g. "sso" or the app_id), not "loop". Enforcing aud:"loop" here breaks SSO.
  // The Loop-scoped token we re-sign below WILL have aud:"loop".
  const rald = await verifyJwt(body.rald_token, c.env.RALD_JWT_SECRET, null) as RaldPayload | null;
  if (!rald || !rald.id) return c.json({ error: "Invalid or expired RALD token" }, 401);

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

  console.log("[rald-sso]", JSON.stringify({
    userId: rald.id, source: "rald-sso", timestamp: new Date().toISOString(),
  }));

  return c.json({
    access_token: loopToken,
    user: { id: rald.id, email: rald.email ?? null, phone: rald.phone ?? null, role: rald.role ?? "user" },
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

  // 5-minute handoff token — aud is the target app so it's scoped correctly
  const now = Math.floor(Date.now() / 1000);
  const handoffToken = await signJwt({
    sub:          payload.id,
    id:           payload.id,
    email:        payload.email ?? null,
    role:         payload.role  ?? "user",
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
