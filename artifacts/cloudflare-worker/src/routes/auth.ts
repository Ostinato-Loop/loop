/**
 * Loop Auth Routes
 *
 * POST /api/auth/send-otp     { phone }              → send OTP via Termii
 * POST /api/auth/verify-otp   { phone, code }        → verify OTP → issue JWT
 * GET  /api/auth/me                                  → decode JWT → return user + profile
 * POST /api/auth/signout      {}  (requireAuth)      → revoke token jti in KV blocklist
 *
 * Identity model (IDN-001, 2026-06-07):
 *   All tokens signed with RALD_JWT_SECRET (LOOP_JWT_SECRET fully removed).
 *   Standard ecosystem claims: sub, email, role, iss, aud, iat, exp, jti, id, phone, source.
 *   Token revocation (PHD-001, 2026-06-07): jti → KV blocklist on signout.
 *   See AUDIT/jwt-claim-standard.md for full specification.
 *
 * OTP security layers:
 *   1. Phone-level rate limit:  5  attempts / hour
 *   2. IP-level send limit:    10 sends      / hour
 *   3. IP-level verify limit:  20 verify     / hour
 *   4. Global daily cap:      100 OTPs       / day
 *   5. Abuse logging to console.warn (LOOP/ABUSE)
 */

import { Hono } from "hono";
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
import { parseSessionCookie } from "../lib/cookie.js";

export const auth = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { user: AuthUser };
}>();

/* ── Rate limiting constants ─────────────────────────────────────────── */

const PHONE_LIMIT          = 5;    // OTP sends per phone per hour
const IP_SEND_LIMIT        = 10;   // OTP sends per IP per hour
const IP_VERIFY_LIMIT      = 20;   // OTP verifies per IP per hour
const GLOBAL_DAILY_LIMIT   = 100;  // All OTPs per day
const WINDOW_1H_MS         = 3_600_000;
const WINDOW_24H_MS        = 86_400_000;

/* ── Sliding-window rate limiter (exported for tests) ────────────────── */

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

/* ── IP extraction (exported for tests) ─────────────────────────────── */

export function getClientIp(req: Request): string {
  const cf   = req.headers.get("CF-Connecting-IP");
  const fwd  = req.headers.get("X-Forwarded-For");
  if (cf)  return cf.trim();
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

/* ── Abuse logging (exported for tests) ─────────────────────────────── */

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

/* ── Supabase Admin helper ───────────────────────────────────────────── */

async function supabaseAdminRequest(
  url: string,
  key: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${url}${path}`, {
    method,
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${key}`,
      apikey:          key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/* ── POST /api/auth/send-otp ─────────────────────────────────────────── */

auth.post("/send-otp", async (c) => {
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
      channel:  "generic",
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
    console.error("[auth/send-otp] Termii error:", resp.status, err.slice(0, 200));
    return c.json({ error: "Failed to send OTP" }, 502);
  }

  const data = (await resp.json()) as { pinId?: string };
  if (!data.pinId) {
    return c.json({ error: "Failed to send OTP" }, 502);
  }

  await c.env.CACHE.put(`otp:pin:${phone}`, data.pinId, { expirationTtl: 600 });

  return c.json({
    ok: true,
    message: "OTP sent",
    remainingPhone: phoneCheck.remaining - 1,
    remainingIp: ipCheck.remaining - 1,
  });
});

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

  if (!verifyResp.ok) {
    return c.json({ error: "OTP verification failed" }, 401);
  }

  const verifyData = (await verifyResp.json()) as { verified?: boolean | string; msisdn?: string };
  const verified = verifyData.verified === true || verifyData.verified === "True";
  if (!verified) return c.json({ error: "Invalid OTP code" }, 401);

  await c.env.CACHE.delete(`otp:pin:${phone}`);

  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  // Check if user exists
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
        phone,
        phone_confirm: true,
        user_metadata: { source: "otp" },
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
      sub:    userId,
      email:  null,
      role:   "authenticated",
      iss:    JWT_ISSUER,
      aud:    JWT_AUDIENCE,
      iat:    now,
      exp:    now + TTL_OTP_S,
      jti:    crypto.randomUUID(),     // PHD-001: revocation key
      id:     userId,                  // backward-compat: payload.id ?? payload.sub
      phone,
      source: "otp",
    },
    c.env.RALD_JWT_SECRET,
  );

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
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);

  // PHD-001: LOOP_JWT_SECRET fallback removed — all sessions use RALD_JWT_SECRET.
  // Any LOOP_JWT_SECRET sessions issued before IDN-001 (2026-06-07) have now expired
  // (30-day TTL elapsed). New OTP sessions sign with RALD_JWT_SECRET.
  const payload = await verifyJwt(token, c.env.RALD_JWT_SECRET);
  if (!payload) return c.json({ error: "Unauthorized" }, 401);

  // Check revocation blocklist
  const jti = payload.jti as string | undefined;
  if (jti) {
    const revoked = await c.env.CACHE.get(`revoked:jti:${jti}`);
    if (revoked) return c.json({ error: "Token has been revoked" }, 401);
  }

  const userId = (payload.id ?? payload.sub) as string;

  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  const profileResp = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=*&limit=1`, {
    headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey },
  });

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

/* ── POST /api/auth/signout ──────────────────────────────────────────── */

/**
 * Revoke the current session by adding its jti to the KV blocklist.
 * TTL = remaining token lifetime (exp - now seconds).
 *
 * After signout, all subsequent requests with this token return 401.
 * Client must clear localStorage["loop_token"].
 *
 * PHD-001 (2026-06-07): Implements immediate server-side token invalidation.
 * Tokens without a jti (issued before PHD-001) cannot be revoked server-side —
 * they expire naturally within 30 days (OTP) or 7 days (SSO).
 */
/* ── GET /api/auth/silent ────────────────────────────────────────────── */
/**
 * Cookie-based silent session check. Issues a fresh Loop-scoped JWT on success.
 *
 * ROUTING-FIX-001 (2026-06-08): The equivalent handler in rald-sso.ts is mounted
 * at app.route("/api/auth/rald-sso", raldSso) → resolves to /api/auth/rald-sso/silent,
 * NOT /api/auth/silent. The client (use-auth.tsx, api-fetch.ts) calls GET /api/auth/silent.
 * This handler is added here (auth router → /api/auth/*) so the route resolves correctly.
 *
 * Both handlers are kept — rald-sso/silent remains for backward-compat;
 * this is the canonical path going forward.
 */
auth.get("/silent", async (c) => {
  const token = parseSessionCookie(c.req.header("Cookie"));
  if (!token) return c.json({ valid: false, reason: "no_session_cookie" }, 401);

  const rald = await verifyJwt(token, c.env.RALD_JWT_SECRET) as {
    id: string; email?: string; phone?: string; name?: string | null; role?: string;
  } | null;
  if (!rald || !rald.id) return c.json({ valid: false, reason: "invalid_or_expired_token" }, 401);

  // Fire-and-forget profile upsert on cold-start (mirrors rald-sso.ts behaviour)
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
      sub:    rald.id,
      email:  rald.email ?? null,
      role:   rald.role  ?? "user",
      iss:    JWT_ISSUER,
      aud:    JWT_AUDIENCE,
      iat:    now,
      exp:    now + TTL_SSO_S,
      jti:    crypto.randomUUID(),
      id:     rald.id,
      source: "silent",
    },
    c.env.RALD_JWT_SECRET,
  );

  return c.json({
    valid:        true,
    user:         { id: rald.id, email: rald.email ?? null, role: rald.role ?? "user" },
    access_token: loopToken,
  });
});

/* ── POST /api/auth/signout ──────────────────────────────────────────── */

auth.post("/signout", requireAuth(), async (c) => {
  const user = c.get("user");

  const authHeader = c.req.header("Authorization")!;
  const token = authHeader.slice(7);
  const payload = await verifyJwt(token, c.env.RALD_JWT_SECRET);

  const jti = payload?.jti as string | undefined;
  let revoked = false;

  if (jti) {
    const exp = payload?.exp as number | undefined;
    const ttl = exp ? Math.max(exp - Math.floor(Date.now() / 1000), 1) : 86_400;
    await c.env.CACHE.put(`revoked:jti:${jti}`, "1", { expirationTtl: ttl });
    revoked = true;
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
