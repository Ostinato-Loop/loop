/**
 * Loop Auth Routes
 *
 * POST /api/auth/send-otp      { phone }              → send OTP via Termii
 * POST /api/auth/verify-otp    { phone, code }        → verify OTP → issue JWT + HttpOnly cookie
 * GET  /api/auth/me                                   → decode JWT → return user + profile
 * GET  /api/auth/silent                               → cookie-based silent session + refresh TTL
 * POST /api/auth/signout       {}  (requireAuth)      → revoke jti, clear cookie, fire global logout
 *
 * COOKIE-001 (2026-06-09):
 *   - verify-otp now sets loop_session HttpOnly cookie alongside the JSON access_token.
 *   - signout clears the cookie and fires a non-blocking call to auth.rald.cloud/logout.
 *   - silent refreshes cookie TTL on every valid check.
 *   - Device is registered in auth_devices on every successful OTP verify.
 *
 * Identity model (IDN-001, 2026-06-07):
 *   All tokens signed with RALD_JWT_SECRET.
 *   Standard ecosystem claims: sub, email, role, iss, aud, iat, exp, jti, id, phone, source.
 *   Token revocation (PHD-001, 2026-06-07): jti → KV blocklist on signout.
 *
 * OTP security layers:
 *   1. Phone-level rate limit:  5  attempts / hour
 *   2. IP-level send limit:    10 sends      / hour
 *   3. IP-level verify limit:  20 verify     / hour
 *   4. Global daily cap:      100 OTPs       / day
 *   5. Abuse logging to console.warn (LOOP/ABUSE)
 */

import { Hono, type Context } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthUser } from "../middleware/auth.js";
import {
  signJwt,
  verifyJwt,
  JWT_ISSUER,
  JWT_AUDIENCE,
  TTL_OTP_S,
  TTL_SSO_S,
} from "../lib/jwt.js";
import { parseSessionCookie, buildSessionCookie, clearSessionCookie } from "../lib/cookie.js";

export const auth = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { user: AuthUser };
}>();

/* ── Rate limiting constants ─────────────────────────────────────────── */

const PHONE_LIMIT          = 5;
const IP_SEND_LIMIT        = 10;
const IP_VERIFY_LIMIT      = 20;
const GLOBAL_DAILY_LIMIT   = 100;
const WINDOW_1H_MS         = 3_600_000;
const WINDOW_24H_MS        = 86_400_000;

/* ── Sliding-window rate limiter ─────────────────────────────────────── */

export async function checkSlidingWindow(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAtSec: number }> {
  const raw = await kv.get(key);
  const now = Date.now();
  const cutoff = now - windowMs;
  let timestamps: number[] = [];
  if (raw) {
    try { timestamps = JSON.parse(raw) as number[]; } catch { timestamps = []; }
  }
  timestamps = timestamps.filter((t) => t > cutoff);
  const allowed = timestamps.length < limit;
  if (allowed) {
    timestamps.push(now);
    await kv.put(key, JSON.stringify(timestamps), {
      expirationTtl: Math.ceil(windowMs / 1000) + 60,
    });
  }
  const oldest = timestamps[0] ?? now;
  return {
    allowed,
    remaining: Math.max(0, limit - timestamps.length),
    resetAtSec: Math.floor((oldest + windowMs) / 1000),
  };
}

/* ── IP extraction ───────────────────────────────────────────────────── */

export function getClientIp(req: Request): string {
  const cf  = req.headers.get("CF-Connecting-IP");
  const fwd = req.headers.get("X-Forwarded-For");
  if (cf)  return cf.trim();
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

/* ── Abuse logging ───────────────────────────────────────────────────── */

export interface AbuseEvent {
  type: string;
  ip: string;
  phoneSuffix?: string;
  remaining: number;
  resetAtSec: number;
}

export function logAbuse(event: AbuseEvent): void {
  console.warn("[LOOP/ABUSE]", JSON.stringify({
    ...event,
    service: "loop-api",
    timestamp: new Date().toISOString(),
  }));
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

async function registerDevice(sbUrl: string, sbKey: string, userId: string, req: Request): Promise<void> {
  try {
    const ua      = req.headers.get("User-Agent") ?? "Unknown";
    const ip      = req.headers.get("CF-Connecting-IP")
                 ?? req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
                 ?? "unknown";
    const city    = req.headers.get("cf-ipcity")    ?? null;
    const country = req.headers.get("cf-ipcountry") ?? null;
    const { deviceType, deviceName, os, browser } = parseUserAgent(ua);
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
        last_seen_at: new Date().toISOString(),
        is_trusted:   false,
      }),
    });
  } catch { /* non-fatal */ }
}

/* ── Supabase Admin helper ───────────────────────────────────────────── */

async function supabaseAdminRequest(
  url: string, key: string, method: string, path: string, body?: unknown,
): Promise<Response> {
  return fetch(`${url}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${key}`,
      apikey:         key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/* ── POST /api/auth/send-otp ─────────────────────────────────────────── */

const sendOtpHandler = async (c: Context<{ Bindings: CloudflareEnv; Variables: { user: AuthUser } }>) => {
  const body = (await c.req.json().catch(() => ({}))) as { phone?: string };
  const phone = body.phone?.trim();
  if (!phone || !/^\+\d{7,15}$/.test(phone)) {
    return c.json({ error: "Invalid phone number" }, 400);
  }

  const ip = getClientIp(c.req.raw);
  const phoneSuffix = phone.slice(-4);

  const [phoneCheck, ipCheck, globalCheck] = await Promise.all([
    checkSlidingWindow(c.env.CACHE, `otp:phone:${phone}`, PHONE_LIMIT, WINDOW_1H_MS),
    checkSlidingWindow(c.env.CACHE, `otp:ip:${ip}`,       IP_SEND_LIMIT, WINDOW_1H_MS),
    checkSlidingWindow(c.env.CACHE, `otp:global:${new Date().toISOString().slice(0, 10)}`, GLOBAL_DAILY_LIMIT, WINDOW_24H_MS),
  ]);

  if (!phoneCheck.allowed) {
    logAbuse({ type: "otp_send_phone_blocked", ip, phoneSuffix, remaining: 0, resetAtSec: phoneCheck.resetAtSec });
    return c.json({ error: "Too many OTP requests for this number", resetAtSec: phoneCheck.resetAtSec }, 429);
  }
  if (!ipCheck.allowed) {
    logAbuse({ type: "otp_send_ip_blocked", ip, phoneSuffix, remaining: 0, resetAtSec: ipCheck.resetAtSec });
    return c.json({ error: "Too many OTP requests from this IP", resetAtSec: ipCheck.resetAtSec }, 429);
  }
  if (!globalCheck.allowed) {
    logAbuse({ type: "otp_send_global_blocked", ip, phoneSuffix, remaining: 0, resetAtSec: globalCheck.resetAtSec });
    return c.json({ error: "Service temporarily unavailable", resetAtSec: globalCheck.resetAtSec }, 429);
  }

  const resp = await fetch("https://api.ng.termii.com/api/sms/otp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key:  c.env.TERMII_API_KEY,
      message_type: "NUMERIC",
      to:       phone,
      from:     c.env.TERMII_SENDER_ID,
      channel:  phone.startsWith("+234") ? "dnd" : "generic",
      pin_attempts: 3,
      pin_time_to_live: 10,
      pin_length: 6,
      pin_placeholder: "< 1234 >",
      message_text: "Your Loop verification code is < 1234 >",
      pin_type: "NUMERIC",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    console.error("[auth/send-otp] Termii error:", resp.status, err.slice(0, 400));
    return c.json({ error: "Failed to send OTP", _debug: { termii_status: resp.status, termii_body: err.slice(0, 400) } }, 502);
  }

  const data = (await resp.json()) as { pinId?: string };
  if (!data.pinId) {
    console.error("[auth/send-otp] missing pinId:", JSON.stringify(data).slice(0, 400));
    return c.json({ error: "Failed to send OTP", _debug: { reason: "missing_pinId", termii_response: JSON.stringify(data).slice(0, 400) } }, 502);
  }

  await c.env.CACHE.put(`otp:pin:${phone}`, data.pinId, { expirationTtl: 600 });
  return c.json({
    ok: true,
    message: "OTP sent",
    remainingPhone: phoneCheck.remaining - 1,
    remainingIp: ipCheck.remaining - 1,
  });
};

auth.post("/send-otp",    sendOtpHandler);
auth.post("/request-otp", sendOtpHandler);

/* ── POST /api/auth/verify-otp ───────────────────────────────────────── */

auth.post("/verify-otp", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { phone?: string; code?: string };
  const phone = body.phone?.trim();
  const code  = body.code?.trim();
  if (!phone || !code) return c.json({ error: "phone and code required" }, 400);

  const ip = getClientIp(c.req.raw);
  const verifyIpCheck = await checkSlidingWindow(
    c.env.CACHE, `otp:verify:ip:${ip}`, IP_VERIFY_LIMIT, WINDOW_1H_MS,
  );
  if (!verifyIpCheck.allowed) {
    logAbuse({ type: "otp_verify_ip_blocked", ip, remaining: 0, resetAtSec: verifyIpCheck.resetAtSec });
    return c.json({ error: "Too many verification attempts", resetAtSec: verifyIpCheck.resetAtSec }, 429);
  }

  const pinId = await c.env.CACHE.get(`otp:pin:${phone}`);
  if (!pinId) return c.json({ error: "No OTP pending for this phone" }, 400);

  const verifyResp = await fetch("https://api.ng.termii.com/api/sms/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: c.env.TERMII_API_KEY, pin_id: pinId, pin: code }),
  });
  if (!verifyResp.ok) return c.json({ error: "OTP verification failed" }, 401);

  const verifyData = (await verifyResp.json()) as { verified?: boolean | string; msisdn?: string };
  const verified = verifyData.verified === true || verifyData.verified === "True";
  if (!verified) return c.json({ error: "Invalid OTP code" }, 401);

  await c.env.CACHE.delete(`otp:pin:${phone}`);

  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  const listResp = await supabaseAdminRequest(sbUrl, sbKey, "GET",
    `/auth/v1/admin/users?phone=${encodeURIComponent(phone)}&per_page=1`);

  let userId: string;
  let isNewUser = false;

  if (listResp.ok) {
    const listData = (await listResp.json()) as { users?: { id: string }[] };
    const existing = listData.users?.[0];
    if (existing) {
      userId = existing.id;
    } else {
      const createResp = await supabaseAdminRequest(sbUrl, sbKey, "POST", "/auth/v1/admin/users", {
        phone, phone_confirm: true, user_metadata: { source: "otp" },
      });
      if (!createResp.ok) {
        const err = await createResp.text().catch(() => "");
        console.error("[auth/verify-otp] create user error:", createResp.status, err.slice(0, 200));
        return c.json({ error: "Failed to create account" }, 500);
      }
      const newUser = (await createResp.json()) as { id: string };
      userId = newUser.id;
      isNewUser = true;
    }
  } else {
    return c.json({ error: "Auth service unavailable" }, 503);
  }

  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(
    {
      sub: userId, email: null, role: "authenticated",
      iss: JWT_ISSUER, aud: JWT_AUDIENCE,
      iat: now, exp: now + TTL_OTP_S,
      jti: crypto.randomUUID(),
      id: userId, phone, source: "otp",
    },
    c.env.RALD_JWT_SECRET,
  );

  // COOKIE-001: Set HttpOnly session cookie (30-day TTL for phone users)
  c.header("Set-Cookie", buildSessionCookie(token, TTL_OTP_S));

  // Sprint 2: Register device (non-blocking)
  registerDevice(sbUrl, sbKey, userId, c.req.raw).catch(() => null);

  console.log("[auth/verify-otp]", JSON.stringify({
    userId, isNewUser, source: "otp", timestamp: new Date().toISOString(),
  }));

  return c.json({
    ok: true,
    access_token: token,
    is_new_user: isNewUser,
    user: { id: userId, phone, role: "authenticated" },
  });
});

/* ── GET /api/auth/me ────────────────────────────────────────────────── */

auth.get("/me", async (c) => {
  // Accept Bearer header OR loop_session cookie
  const authHeader = c.req.header("Authorization");
  let token: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = parseSessionCookie(c.req.header("Cookie"));
  }
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const payload = await verifyJwt(token, c.env.RALD_JWT_SECRET);
  if (!payload) return c.json({ error: "Unauthorized" }, 401);

  const jti = payload.jti as string | undefined;
  if (jti) {
    const revoked = await c.env.CACHE.get(`revoked:jti:${jti}`);
    if (revoked) return c.json({ error: "Token has been revoked" }, 401);
  }

  const userId = (payload.id ?? payload.sub) as string;
  const sbUrl  = c.env.SUPABASE_URL.replace(/\/$/, "");
  const sbKey  = c.env.SUPABASE_SERVICE_ROLE_KEY;

  const profileResp = await fetch(
    `${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=*&limit=1`,
    { headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey } },
  );

  let profile: Record<string, unknown> | null = null;
  if (profileResp.ok) {
    const rows = (await profileResp.json()) as Record<string, unknown>[];
    profile = rows[0] ?? null;
  }

  return c.json({
    user: {
      id:    userId,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      role:  payload.role  ?? "user",
    },
    profile,
  });
});

/* ── GET /api/auth/silent ────────────────────────────────────────────── */
/**
 * Cookie-based silent session check. Issues a fresh Loop-scoped JWT and
 * refreshes the cookie TTL on every successful check.
 *
 * COOKIE-001: Canonical path for silent refresh. Also available at
 * /api/auth/rald-sso/silent for backward compatibility.
 *
 * ROUTING-FIX-001 (2026-06-08): Canonical handler here; rald-sso/silent kept
 * for backward-compat with existing clients.
 */
auth.get("/silent", async (c) => {
  const token = parseSessionCookie(c.req.header("Cookie"));
  if (!token) return c.json({ valid: false, reason: "no_session_cookie" }, 401);

  const rald = await verifyJwt(token, c.env.RALD_JWT_SECRET) as {
    id: string; email?: string; phone?: string; name?: string | null; role?: string;
  } | null;
  if (!rald || !rald.id) return c.json({ valid: false, reason: "invalid_or_expired_token" }, 401);

  // Fire-and-forget profile upsert on cold-start
  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  const displayName = rald.name ?? (rald.email ? rald.email.split("@")[0] : null);
  fetch(`${sbUrl}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey:         c.env.SUPABASE_SERVICE_ROLE_KEY,
      Prefer:         "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ id: rald.id, ...(displayName ? { display_name: displayName } : {}) }),
  }).catch(() => null);

  const now = Math.floor(Date.now() / 1000);
  const loopToken = await signJwt(
    {
      sub: rald.id, email: rald.email ?? null, role: rald.role ?? "user",
      iss: JWT_ISSUER, aud: JWT_AUDIENCE,
      iat: now, exp: now + TTL_SSO_S,
      jti: crypto.randomUUID(),
      id:  rald.id, source: "silent",
    },
    c.env.RALD_JWT_SECRET,
  );

  // COOKIE-001: Refresh cookie TTL on every valid silent check
  c.header("Set-Cookie", buildSessionCookie(loopToken, TTL_SSO_S));

  return c.json({
    valid:        true,
    user:         { id: rald.id, email: rald.email ?? null, role: rald.role ?? "user" },
    access_token: loopToken,
  });
});

/* ── POST /api/auth/signout ──────────────────────────────────────────── */
/**
 * Revoke the current session:
 *   1. Add jti to KV blocklist (token can never be used again)
 *   2. Clear loop_session HttpOnly cookie (COOKIE-001)
 *   3. Fire non-blocking logout to auth.rald.cloud (GLOBAL-LOGOUT-001)
 *
 * PHD-001 (2026-06-07): JTI-based immediate server-side token invalidation.
 * COOKIE-001 (2026-06-09): Cookie cleared on signout.
 * GLOBAL-LOGOUT-001 (2026-06-09): auth.rald.cloud session revoked on signout.
 */
auth.post("/signout", requireAuth(), async (c) => {
  const user = c.get("user");

  // Extract token from Bearer OR cookie (mirrors requireAuth logic)
  const authHeader = c.req.header("Authorization");
  let rawToken: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    rawToken = authHeader.slice(7);
  } else {
    rawToken = parseSessionCookie(c.req.header("Cookie"));
  }

  const payload = rawToken ? await verifyJwt(rawToken, c.env.RALD_JWT_SECRET) : null;
  const jti = payload?.jti as string | undefined;
  let revoked = false;

  if (jti) {
    const exp = payload?.exp as number | undefined;
    const ttl = exp ? Math.max(exp - Math.floor(Date.now() / 1000), 1) : 86_400;
    await c.env.CACHE.put(`revoked:jti:${jti}`, "1", { expirationTtl: ttl });
    revoked = true;
  }

  // COOKIE-001: Clear session cookie
  c.header("Set-Cookie", clearSessionCookie());

  // GLOBAL-LOGOUT-001: Non-blocking ecosystem logout
  if (rawToken) {
    fetch("https://auth.rald.cloud/logout", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${rawToken}`,
      },
    }).catch(() => null);
  }

  console.log("[auth/signout]", JSON.stringify({
    userId:  user.id,
    jti:     jti ?? null,
    source:  payload?.source ?? null,
    revoked,
    timestamp: new Date().toISOString(),
  }));

  return c.json({ ok: true, revoked });
});

/* ── GET /api/auth/devices ───────────────────────────────────────────── */
/**
 * Returns all registered devices for the authenticated user.
 * Sorted by last_seen_at DESC — first entry is the most recently active device.
 *
 * REVOKE-ALL-001 (2026-06-09): Powers the Device Center security UI.
 * The client detects "current device" by comparing navigator.userAgent
 * against the browser + os fields.
 */
auth.get("/devices", requireAuth(), async (c) => {
  const user = c.get("user");
  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  const resp = await fetch(
    `${sbUrl}/rest/v1/auth_devices?user_id=eq.${user.id}&select=id,device_name,device_type,os,browser,ip_address,city,country,last_seen_at,is_trusted&order=last_seen_at.desc&limit=20`,
    { headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey } },
  );

  if (!resp.ok) {
    return c.json({ devices: [] });
  }

  const devices = (await resp.json()) as Array<{
    id: string;
    device_name: string;
    device_type: string;
    os: string;
    browser: string;
    ip_address: string | null;
    city: string | null;
    country: string | null;
    last_seen_at: string;
    is_trusted: boolean;
  }>;

  return c.json({ devices });
});

/* ── POST /api/auth/revoke-all ───────────────────────────────────────── */
/**
 * Revoke all sessions for the authenticated user except the current one.
 *
 * Mechanism (REVOKE-ALL-001, 2026-06-09):
 *   1. Set revoke_before:<userId> = now (ms) in KV with 30-day TTL.
 *      Any token with iat * 1000 ≤ this value is rejected by requireAuth().
 *   2. Issue a fresh token for the calling device (iat > revoke_before).
 *   3. Set a fresh loop_session cookie with the new token.
 *   4. Fire non-blocking POST auth.rald.cloud/session/revoke-all for ecosystem propagation.
 *   5. Write audit log.
 *
 * The calling device remains active. All other devices are immediately locked out.
 * On their next request, requireAuth() will reject their tokens and they'll get 401.
 */
auth.post("/revoke-all", requireAuth(), async (c) => {
  const user = c.get("user");
  const now = Date.now();

  // User-level timestamp revocation — invalidates all tokens issued ≤ now
  await c.env.CACHE.put(`revoke_before:${user.id}`, String(now), {
    expirationTtl: 2_592_000, // 30 days
  });

  // Extract old token to pass source claim to new token
  const authHeader = c.req.header("Authorization");
  const rawToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : parseSessionCookie(c.req.header("Cookie"));
  const oldPayload = rawToken ? await verifyJwt(rawToken, c.env.RALD_JWT_SECRET) : null;

  // Issue a fresh token for the current device (iat = now + 1s > revoke_before)
  const nowSec = Math.floor(now / 1000) + 1;
  const freshToken = await signJwt(
    {
      sub:    user.id,
      email:  user.email ?? null,
      role:   user.role,
      iss:    JWT_ISSUER,
      aud:    JWT_AUDIENCE,
      iat:    nowSec,
      exp:    nowSec + TTL_SSO_S,
      jti:    crypto.randomUUID(),
      id:     user.id,
      phone:  user.phone ?? null,
      source: oldPayload?.source ?? "revoke-all",
    },
    c.env.RALD_JWT_SECRET,
  );

  // Refresh cookie with new token
  c.header("Set-Cookie", buildSessionCookie(freshToken, TTL_SSO_S));

  // Non-blocking: propagate to RALD Auth ecosystem
  if (rawToken) {
    fetch("https://auth.rald.cloud/session/revoke-all", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${rawToken}` },
    }).catch(() => null);
  }

  console.log("[auth/revoke-all]", JSON.stringify({
    userId:    user.id,
    revokedAt: new Date(now).toISOString(),
    timestamp: new Date().toISOString(),
  }));

  return c.json({
    ok:               true,
    revoked_at:       new Date(now).toISOString(),
    access_token:     freshToken,
    message:          "All other sessions revoked. Your current session is preserved.",
  });
});

/* ── POST /api/auth/revoke-device ────────────────────────────────────── */
/**
 * Revoke a specific device by deleting its auth_devices row.
 *
 * REVOKE-ALL-001 (2026-06-09): Single-device revocation for the Device Center UI.
 * Body: { device_id: string }
 *
 * Note: This removes the device registration record. The device's tokens remain
 * valid until they expire or the user calls revoke-all. For immediate revocation,
 * the user should call POST /revoke-all instead.
 * Future: add per-device JTI blocklist if strict immediate revocation is needed.
 */
auth.post("/revoke-device", requireAuth(), async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as { device_id?: string };
  if (!body.device_id) return c.json({ error: "device_id required" }, 400);

  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  // Delete the device record (user_id guard prevents deleting other users' devices)
  const resp = await fetch(
    `${sbUrl}/rest/v1/auth_devices?id=eq.${body.device_id}&user_id=eq.${user.id}`,
    {
      method:  "DELETE",
      headers: {
        Authorization: `Bearer ${sbKey}`,
        apikey:        sbKey,
        Prefer:        "return=minimal",
      },
    },
  );

  // Non-blocking: propagate to RALD Auth ecosystem
  const rawToken = c.req.header("Authorization")?.slice(7)
    ?? parseSessionCookie(c.req.header("Cookie"));
  if (rawToken) {
    fetch("https://auth.rald.cloud/session/revoke-device", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${rawToken}` },
      body:    JSON.stringify({ device_id: body.device_id }),
    }).catch(() => null);
  }

  console.log("[auth/revoke-device]", JSON.stringify({
    userId:   user.id,
    deviceId: body.device_id,
    ok:       resp.ok,
    timestamp: new Date().toISOString(),
  }));

  return c.json({ ok: true, device_id: body.device_id, message: "Device revoked." });
});

/* ── POST /api/auth/send-email-otp ──────────────────────────────────── */
/**
 * AUTH-RECOVERY-001: Email OTP sign-in — send step.
 *
 * Proxy to auth.rald.cloud (which owns Resend delivery).
 * Rate limiting is enforced server-side by rald-auth-core.
 *
 * Body:    { email: string }
 * Returns: { sessionToken: string, message: string }
 */
auth.post("/send-email-otp", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { email?: string } | null;
  if (!body?.email?.trim()) return c.json({ error: "Email required" }, 400);

  const res = await fetch("https://auth.rald.cloud/auth/send-login-email-otp", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email: body.email.trim().toLowerCase() }),
  }).catch(() => null);

  if (!res) return c.json({ error: "Auth service unavailable. Try again." }, 503);
  const data = await res.json().catch(() => null);
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
});

/* ── POST /api/auth/verify-email-otp ────────────────────────────────── */
/**
 * AUTH-RECOVERY-001: Email OTP sign-in — verify step.
 *
 * Verifies the 6-digit code via rald-auth-core. On success for an existing
 * user, issues a Loop-scoped JWT (TTL_SSO_S) and sets the loop_session
 * HttpOnly cookie — identical outcome to a RALD SSO exchange.
 *
 * Body:    { sessionToken: string, code: string }
 * Returns: { access_token: string, user: object } + sets loop_session cookie
 *          OR { newUser: true } if the email has no account yet (sign-up required)
 */
auth.post("/verify-email-otp", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    sessionToken?: string;
    code?: string;
  } | null;
  if (!body?.sessionToken || !body?.code?.trim())
    return c.json({ error: "sessionToken and code are required" }, 400);

  const res = await fetch("https://auth.rald.cloud/auth/verify-login-email-otp", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ sessionToken: body.sessionToken, code: body.code.trim() }),
  }).catch(() => null);

  if (!res) return c.json({ error: "Auth service unavailable. Try again." }, 503);

  const data = await res.json().catch(() => null) as {
    token?:   string;
    user?:    { id: string; email: string; role?: string; name?: string | null };
    newUser?: boolean;
    error?:   string;
  } | null;

  if (!res.ok || !data) return c.json(data ?? { error: "Verification failed" }, (res.status || 400) as 400);
  if (data.newUser)      return c.json({ newUser: true });
  if (!data.token || !data.user) return c.json({ error: "Unexpected auth response" }, 502);

  // Exchange rald token for a Loop-scoped session — same pattern as /api/auth/rald-sso
  const now = Math.floor(Date.now() / 1000);
  const loopToken = await signJwt(
    {
      sub:    data.user.id,
      id:     data.user.id,
      email:  data.user.email,
      role:   data.user.role ?? "user",
      iss:    JWT_ISSUER,
      aud:    JWT_AUDIENCE,
      iat:    now,
      exp:    now + TTL_SSO_S,
      jti:    crypto.randomUUID(),
      source: "email-otp",
    },
    c.env.RALD_JWT_SECRET,
  );

  c.header("Set-Cookie", buildSessionCookie(loopToken, TTL_SSO_S));
  return c.json({ access_token: loopToken, user: data.user });
});

// ── GET /api/auth/username/check/:username — proxy to rald-auth-core ─────────
// Used by Loop onboarding to check username availability.
// Tries rald-auth-core first; falls back to Supabase profiles table.
auth.get("/username/check/:username", async (c) => {
  const username = c.req.param("username").toLowerCase();

  // Validate format locally (saves a network hop for obvious failures)
  if (username.length < 2)  return c.json({ available: false, username, reason: "Username must be at least 2 characters" });
  if (username.length > 20) return c.json({ available: false, username, reason: "Username must be 20 characters or fewer" });
  if (!/^[a-z0-9_]+$/.test(username)) return c.json({ available: false, username, reason: "Letters, numbers, and underscores only" });
  if (username.startsWith("_") || username.endsWith("_")) return c.json({ available: false, username, reason: "Cannot start or end with an underscore" });
  if (/_{2,}/.test(username)) return c.json({ available: false, username, reason: "No consecutive underscores" });

  const RESERVED = new Set(["admin","support","help","security","abuse","rald","loop","messenger","payrald","mail","api","auth","root","system","bot","null","undefined","official","staff","team","mod"]);
  if (RESERVED.has(username)) return c.json({ available: false, username, reason: "This username is reserved" });

  // Try rald-auth-core first
  const authUrl = (c.env as unknown as Record<string, string>).RALD_AUTH_URL ?? "https://auth.rald.cloud";
  try {
    const r = await fetch(`${authUrl}/username/check/${encodeURIComponent(username)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const data = await r.json() as { available: boolean; reason: string | null };
      return c.json({ available: data.available, username, reason: data.reason });
    }
  } catch { /* fallback to Supabase */ }

  // Fallback: check profiles table
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = c.env;
  const sb = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id&limit=1`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" } },
  );
  if (sb.ok) {
    const rows = await sb.json() as unknown[];
    const taken = rows.length > 0;
    return c.json({ available: !taken, username, reason: taken ? "Username is already taken" : null });
  }

  return c.json({ available: false, username, reason: "Availability check failed — please try again" }, 500);
});

// ── POST /api/auth/username/claim — proxy to rald-auth-core ──────────────────
auth.post("/username/claim", requireAuth(), async (c) => {
  const user    = c.get("user");
  const body    = await c.req.json<{ username: string }>().catch(() => ({} as { username: string }));
  const username = (body.username ?? "").toLowerCase();

  if (!username) return c.json({ error: "username is required" }, 400);

  const authUrl = (c.env as unknown as Record<string, string>).RALD_AUTH_URL ?? "https://auth.rald.cloud";
  try {
    const r = await fetch(`${authUrl}/username/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, user_id: user.id }),
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const data = await r.json();
      return c.json(data);
    }
    const err = await r.json().catch(() => ({})) as { error?: string };
    return c.json({ error: err.error ?? "Could not claim username" }, r.status as 400 | 409 | 500);
  } catch { /* non-fatal — Loop profiles is source of truth */ }

  // Fallback: update profiles directly
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = c.env;
  const upd = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ username }),
  });
  return upd.ok
    ? c.json({ ok: true, username })
    : c.json({ error: "Could not claim username — please try again" }, 500);
});

// ── GET /api/auth/messenger-status — cross-app session health ────────────────
// Checks whether the current Loop session also has a valid Messenger session.
// MESSENGER-INTEGRATION-001 (2026-06-10)
auth.get("/messenger-status", requireAuth(), async (c) => {
  const user = c.get("user");

  // Try to get a handoff token to check Messenger session health
  const authUrl = (c.env as unknown as Record<string, string>).RALD_AUTH_URL ?? "https://auth.rald.cloud";
  try {
    const r = await fetch(`${authUrl}/session/status?app_id=messenger&user_id=${encodeURIComponent(user.id)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const data = await r.json() as { active: boolean; expires_at?: string };
      return c.json({ user_id: user.id, messenger_session: data.active, expires_at: data.expires_at ?? null });
    }
  } catch { /* non-fatal */ }

  // Fallback: report unknown (client will re-auth on next Messenger open)
  return c.json({ user_id: user.id, messenger_session: null, note: "status unknown — will resolve on next Messenger open" });
});
