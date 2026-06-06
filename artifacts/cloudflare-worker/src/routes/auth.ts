/**
 * Loop Auth Routes — Termii OTP + Supabase user bridge
 *
 * POST /api/auth/send-otp    { phone }            → Termii sends code
 * POST /api/auth/verify-otp  { phone, token }     → verify + return JWT
 * POST /api/auth/signout     {}                   → (stateless, client clears token)
 * GET  /api/auth/me          (Bearer JWT)         → returns user + profile
 *
 * SEC-003 FIX (2026-06-06): Removed hardcoded JWT fallback secret.
 * LOOP_JWT_SECRET must be set in Cloudflare Worker secrets — service will
 * refuse token issuance with a 500 if the env var is absent.
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";

const auth = new Hono<{ Bindings: CloudflareEnv }>();

const TERMII_BASE = "https://v3.api.termii.com/api";
const OTP_TTL_S = 600; // 10 minutes

/* ── helpers ─────────────────────────────────────────────────────────── */

function normalizePhone(raw: string): string {
  return raw.replace(/\s/g, "").replace(/^00/, "+");
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

/* ── POST /api/auth/send-otp ─────────────────────────────────────────── */
auth.post("/send-otp", async (c) => {
  const { phone } = await c.req.json<{ phone: string }>();

  if (!phone) return c.json({ error: "phone is required" }, 400);

  const normalized = normalizePhone(phone);
  if (!/^\+\d{7,15}$/.test(normalized)) {
    return c.json({ error: "Invalid phone number format" }, 400);
  }

  // Rate-limit: max 5 OTPs per phone per hour stored in KV
  const rateKey = `rate:${normalized}`;
  const rateRaw = await c.env.CACHE.get(rateKey);
  const sends: number[] = rateRaw ? JSON.parse(rateRaw) : [];
  const now = Date.now();
  const recentSends = sends.filter((t) => now - t < 3_600_000);
  if (recentSends.length >= 5) {
    return c.json({ error: "Too many OTP requests. Try again later." }, 429);
  }

  try {
    // Call Termii Token API
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

    // Store pinId in KV
    await c.env.CACHE.put(
      `otp:${normalized}`,
      JSON.stringify({ pinId: termiiData.pinId, phone: normalized }),
      { expirationTtl: OTP_TTL_S },
    );

    // Update rate limit
    recentSends.push(now);
    await c.env.CACHE.put(rateKey, JSON.stringify(recentSends), { expirationTtl: 3600 });

    return c.json({ ok: true, message: "Code sent. Check your messages." });
  } catch (err) {
    console.error("[auth/send-otp] unexpected error:", err);
    return c.json({ error: "Failed to send OTP. Please try again." }, 500);
  }
});

/* ── POST /api/auth/verify-otp ───────────────────────────────────────── */
auth.post("/verify-otp", async (c) => {
  const { phone, token, displayName, mode } = await c.req.json<{
    phone: string;
    token: string;
    displayName?: string;
    mode?: "signin" | "signup" | "forgot";
  }>();

  if (!phone || !token) return c.json({ error: "phone and token are required" }, 400);

  const normalized = normalizePhone(phone);
  const otpRaw = await c.env.CACHE.get(`otp:${normalized}`);

  if (!otpRaw) {
    return c.json({ error: "OTP expired or not found. Request a new code." }, 400);
  }

  const { pinId } = JSON.parse(otpRaw) as { pinId: string };

  try {
    // Verify with Termii
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

    // Clean up OTP from KV
    await c.env.CACHE.delete(`otp:${normalized}`);

    // Upsert user in Supabase
    const supabaseUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
    const serviceKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

    // Check if user exists by phone
    let userId: string;
    let isNewUser = false;
    const listRes = await supabaseAdminRequest(
      `${supabaseUrl}/auth/v1/admin/users?phone=${encodeURIComponent(normalized)}&per_page=1`,
      serviceKey,
      "GET",
    );

    // Helper to create new Supabase auth user
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

    // Upsert profile row — sets display_name only on first create (ignore-duplicates)
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

    // SEC-003: LOOP_JWT_SECRET must be set — no hardcoded fallback.
    // If absent, refuse token issuance rather than sign with a known-public secret.
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
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
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

/* ── GET /api/auth/me ────────────────────────────────────────────────── */
// Accepts both RALD JWTs (SSO — signed with RALD_JWT_SECRET, preferred) and
// legacy Loop OTP JWTs (signed with LOOP_JWT_SECRET, for backward compat).
// RALD JWTs carry `id`; legacy OTP JWTs carry `sub`.  Both paths look up the
// same Supabase profiles row by the resolved user id.
auth.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  // Try RALD_JWT_SECRET first — all SSO users (Identity Axiom, Phase H)
  let payload = await verifyJwt(token, c.env.RALD_JWT_SECRET);

  // Fall back to LOOP_JWT_SECRET for legacy OTP-issued tokens only
  if (!payload && c.env.LOOP_JWT_SECRET) {
    payload = await verifyJwt(token, c.env.LOOP_JWT_SECRET);
  }

  if (!payload) return c.json({ error: "Invalid or expired token" }, 401);

  // RALD JWTs use `id`; legacy Loop OTP JWTs use `sub`
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
