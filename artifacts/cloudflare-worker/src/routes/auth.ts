/**
 * Loop Auth Routes — Termii OTP + Supabase user bridge
 *
 * POST /api/auth/send-otp    { phone }            → Termii sends code
 * POST /api/auth/verify-otp  { phone, token }     → verify + return JWT
 * POST /api/auth/signout     {}                   → (stateless, client clears token)
 * GET  /api/auth/me          (Bearer JWT)         → returns user + profile
 *
 * SEC-003 (2026-06-06): Removed hardcoded JWT fallback — hard fail if secret absent.
 * OTP-001 (2026-06-06): Added IP-level rate limiting, sliding window, abuse logging.
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";

const auth = new Hono<{ Bindings: CloudflareEnv }>();

const TERMII_BASE = "https://v3.api.termii.com/api";
const OTP_TTL_S = 600; // 10 minutes

// ── Rate limit configuration ──────────────────────────────────────────────────

const RATE = {
  /** OTP send: 5 per phone per hour */
  phoneLimit:  5,
  phoneWindow: 60 * 60 * 1000,
  /** OTP send: 10 per IP per hour */
  ipSendLimit:  10,
  ipSendWindow: 60 * 60 * 1000,
  /** OTP verify: 20 per IP per hour (higher — user may mistype) */
  ipVerifyLimit:  20,
  ipVerifyWindow: 60 * 60 * 1000,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/\s/g, "").replace(/^00/, "+");
}

/** Extract real client IP — CF-Connecting-IP is set by Cloudflare before the Worker receives the request */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Sliding-window rate limiter backed by KV timestamp arrays.
 * Exported for unit testing.
 */
export async function checkSlidingWindow(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAtSec: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;

  const raw = await kv.get(key);
  let timestamps: number[] = [];
  if (raw) {
    try { timestamps = JSON.parse(raw) as number[]; } catch { /* corrupt — treat as empty */ }
  }

  // Evict expired entries
  timestamps = timestamps.filter((t) => t > windowStart);

  const allowed = timestamps.length < limit;
  const remaining = Math.max(0, limit - timestamps.length - (allowed ? 1 : 0));
  const resetAtMs = timestamps.length > 0 ? timestamps[0]! + windowMs : now + windowMs;

  if (allowed) {
    timestamps.push(now);
    await kv.put(key, JSON.stringify(timestamps), {
      expirationTtl: Math.ceil(windowMs / 1000) + 60,
    });
  }

  return { allowed, remaining, resetAtSec: Math.floor(resetAtMs / 1000) };
}

/** Structured abuse log — never logs full phone number */
export function logAbuse(event: {
  type: "otp_send_ip_blocked" | "otp_send_phone_blocked" | "otp_verify_ip_blocked";
  ip: string;
  phoneSuffix: string;
  remaining: number;
  resetAtSec: number;
}): void {
  console.warn("[LOOP/ABUSE]", JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
    service: "loop-api",
  }));
}

async function signJwt(
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

async function verifyJwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  try {
    const [header, body, sig] = token.split(".");
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
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function supabaseAdminRequest(
  url: string,
  serviceKey: string,
  method: string,
  body?: unknown,
) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

// ── POST /api/auth/send-otp ───────────────────────────────────────────────────
auth.post("/send-otp", async (c) => {
  const ip = getClientIp(c.req.raw);
  const { phone } = await c.req.json<{ phone: string }>();

  if (!phone) return c.json({ error: "phone is required" }, 400);

  const normalized = normalizePhone(phone);
  if (!/^\+\d{7,15}$/.test(normalized)) {
    return c.json({ error: "Invalid phone number format" }, 400);
  }

  const phoneSuffix = normalized.slice(-4);

  // ── Rate limit 1: IP-level (10 OTPs/hour/IP) ────────────────────────────────
  const ipCheck = await checkSlidingWindow(
    c.env.CACHE,
    `otp:ip:${ip}`,
    RATE.ipSendLimit,
    RATE.ipSendWindow,
  );
  if (!ipCheck.allowed) {
    logAbuse({ type: "otp_send_ip_blocked", ip, phoneSuffix, remaining: 0, resetAtSec: ipCheck.resetAtSec });
    return c.json(
      { error: "Too many OTP requests from this network. Try again later." },
      429,
      { "Retry-After": String(ipCheck.resetAtSec - Math.floor(Date.now() / 1000)) },
    );
  }

  // ── Rate limit 2: Phone-level (5 OTPs/hour/phone) ───────────────────────────
  const phoneCheck = await checkSlidingWindow(
    c.env.CACHE,
    `otp:phone:${normalized}`,
    RATE.phoneLimit,
    RATE.phoneWindow,
  );
  if (!phoneCheck.allowed) {
    logAbuse({ type: "otp_send_phone_blocked", ip, phoneSuffix, remaining: 0, resetAtSec: phoneCheck.resetAtSec });
    return c.json(
      { error: "Too many OTP requests for this number. Try again later." },
      429,
      { "Retry-After": String(phoneCheck.resetAtSec - Math.floor(Date.now() / 1000)) },
    );
  }

  try {
    const termiiRes = await fetch(`${TERMII_BASE}/sms/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: c.env.TERMII_API_KEY,
        message_type: "NUMERIC",
        to: normalized,
        from: c.env.TERMII_SENDER_ID,
        channel: "generic",
        pin_attempts: 3,
        pin_time_to_live: 10,
        pin_length: 6,
        pin_placeholder: "< 1234 >",
        message_text: "Your Loop verification code is < 1234 >. Valid for 10 minutes. Do not share this code.",
        pin_type: "NUMERIC",
      }),
    });

    if (!termiiRes.ok) {
      const errBody = await termiiRes.text();
      console.error("[auth/send-otp] Termii error:", errBody);
      return c.json({ error: "Failed to send OTP. Please try again." }, 502);
    }

    const termiiData = await termiiRes.json<{ pinId: string; to: string; smsStatus: string }>();

    if (!termiiData.pinId) {
      console.error("[auth/send-otp] No pinId returned:", termiiData);
      return c.json({ error: "Failed to send OTP. Please try again." }, 502);
    }

    await c.env.CACHE.put(
      `otp:${normalized}`,
      JSON.stringify({ pinId: termiiData.pinId, phone: normalized }),
      { expirationTtl: OTP_TTL_S },
    );

    return c.json({ ok: true, message: "Code sent. Check your messages." });
  } catch (err) {
    console.error("[auth/send-otp] unexpected error:", err);
    return c.json({ error: "Failed to send OTP. Please try again." }, 500);
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────────────────────
auth.post("/verify-otp", async (c) => {
  const ip = getClientIp(c.req.raw);
  const { phone, token, displayName, mode } = await c.req.json<{
    phone: string;
    token: string;
    displayName?: string;
    mode?: "signin" | "signup" | "forgot";
  }>();

  if (!phone || !token) return c.json({ error: "phone and token are required" }, 400);

  const normalized = normalizePhone(phone);
  const phoneSuffix = normalized.slice(-4);

  // ── Rate limit: IP-level on verify (20/hour/IP — prevents brute-force of OTP codes) ──
  const ipCheck = await checkSlidingWindow(
    c.env.CACHE,
    `otp:verify:ip:${ip}`,
    RATE.ipVerifyLimit,
    RATE.ipVerifyWindow,
  );
  if (!ipCheck.allowed) {
    logAbuse({ type: "otp_verify_ip_blocked", ip, phoneSuffix, remaining: 0, resetAtSec: ipCheck.resetAtSec });
    return c.json(
      { error: "Too many verification attempts. Try again later." },
      429,
      { "Retry-After": String(ipCheck.resetAtSec - Math.floor(Date.now() / 1000)) },
    );
  }

  const otpRaw = await c.env.CACHE.get(`otp:${normalized}`);

  if (!otpRaw) {
    return c.json({ error: "OTP expired or not found. Request a new code." }, 400);
  }

  const { pinId } = JSON.parse(otpRaw) as { pinId: string };

  try {
    const verifyRes = await fetch(`${TERMII_BASE}/sms/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: c.env.TERMII_API_KEY,
        pin_id: pinId,
        pin: token,
      }),
    });

    const verifyData = await verifyRes.json<{ verified: boolean; msisdn?: string; message?: string }>();

    if (!verifyData.verified) {
      return c.json({ error: "Invalid or expired code. Try again." }, 401);
    }

    await c.env.CACHE.delete(`otp:${normalized}`);

    const supabaseUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
    const serviceKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

    let userId: string;
    let isNewUser = false;
    const listRes = await supabaseAdminRequest(
      `${supabaseUrl}/auth/v1/admin/users?phone=${encodeURIComponent(normalized)}&per_page=1`,
      serviceKey,
      "GET",
    );

    const createNewUser = async (): Promise<string> => {
      const createRes = await supabaseAdminRequest(
        `${supabaseUrl}/auth/v1/admin/users`,
        serviceKey, "POST",
        { phone: normalized, phone_confirm: true },
      );
      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error("[auth/verify-otp] create user error:", errText);
        throw new Error("Account creation failed. Please try again.");
      }
      const newUser = await createRes.json<{ id: string }>();
      isNewUser = true;
      return newUser.id;
    };

    if (listRes.ok) {
      const listData = await listRes.json<{ users: Array<{ id: string }> }>();
      userId = listData.users?.length > 0 ? listData.users[0].id : await createNewUser();
    } else {
      userId = await createNewUser();
    }

    await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        Prefer: "resolution=ignore-duplicates",
      },
      body: JSON.stringify({
        id: userId,
        ...(displayName ? { display_name: displayName.trim() } : {}),
      }),
    });

    // SEC-003: No hardcoded fallback — hard fail if secret is absent.
    const jwtSecret = c.env.LOOP_JWT_SECRET;
    if (!jwtSecret) {
      console.error("[auth/verify-otp] LOOP_JWT_SECRET is not configured — refusing to issue tokens");
      return c.json({ error: "Service configuration error. Please try again later." }, 500);
    }

    const accessToken = await signJwt(
      {
        sub: userId,
        phone: normalized,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
        role: "authenticated",
      },
      jwtSecret,
    );

    return c.json({
      ok: true,
      access_token: accessToken,
      is_new_user: isNewUser,
      user: { id: userId, phone: normalized },
    });
  } catch (err) {
    console.error("[auth/verify-otp] unexpected error:", err);
    return c.json({ error: "Verification failed. Please try again." }, 500);
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
auth.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  let payload = await verifyJwt(token, c.env.RALD_JWT_SECRET);

  if (!payload && c.env.LOOP_JWT_SECRET) {
    payload = await verifyJwt(token, c.env.LOOP_JWT_SECRET);
  }

  if (!payload) return c.json({ error: "Invalid or expired token" }, 401);

  const userId = (payload.id ?? payload.sub) as string | undefined;
  if (!userId) return c.json({ error: "Invalid token: missing user id" }, 401);

  const supabaseUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  const serviceKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    },
  );

  const profiles = profileRes.ok ? await profileRes.json<unknown[]>() : [];
  const profile = profiles[0] ?? null;

  return c.json({
    user: { id: userId, phone: payload.phone, role: payload.role },
    profile,
  });
});

export { auth, verifyJwt };
