/**
 * Loop × RALD SSO Bridge
 *
 * POST /api/auth/rald-sso  { rald_token }
 *   → Validates RALD JWT via auth.rald.cloud/sso/verify (POST, no auth middleware)
 *   → Upserts user in Supabase
 *   → Returns Loop JWT  { access_token, user }
 *
 * Uses POST /sso/verify instead of GET /auth/me for reliable
 * server-to-server token validation from Cloudflare Worker context.
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";

export const raldSso = new Hono<{ Bindings: CloudflareEnv }>();

const RALD_AUTH_DEFAULT = "https://auth.rald.cloud";

/* ── helpers ──────────────────────────────────────────────────────── */
async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const enc    = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const body   = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const key    = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig    = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.${sigB64}`;
}

async function supabaseReq(url: string, key: string, method: string, body?: unknown) {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/* ── POST /api/auth/rald-sso ──────────────────────────────────────── */
raldSso.post("/", async (c) => {
  const { rald_token } = await c.req.json<{ rald_token: string }>();

  if (!rald_token) return c.json({ error: "rald_token is required" }, 400);

  const raldBase = c.env.RALD_AUTH_URL ?? RALD_AUTH_DEFAULT;

  // 1. Validate RALD token via POST /sso/verify (server-to-server, no auth middleware)
  let verifyRes: Response;
  try {
    verifyRes = await fetch(`${raldBase}/sso/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rald_token }),
    });
  } catch (err) {
    console.error("[rald-sso] sso/verify fetch error:", err);
    return c.json({ error: "Auth service unreachable" }, 502);
  }

  if (!verifyRes.ok) {
    return c.json({ error: "Invalid or expired RALD token" }, 401);
  }

  const verifyData = await verifyRes.json() as {
    valid: boolean;
    user?: {
      id: string;
      email?: string;
      phone?: string;
      name?: string | null;
      role?: string;
    };
  };

  if (!verifyData.valid || !verifyData.user) {
    return c.json({ error: "Invalid or expired RALD token" }, 401);
  }

  const raldUser = verifyData.user;
  const phone = raldUser.phone ?? raldUser.email ?? raldUser.id;

  // 2. Upsert user in Supabase
  const sbUrl = c.env.SUPABASE_URL;
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  let userId: string;

  // Find by rald_id
  const findRes = await supabaseReq(
    `${sbUrl}/rest/v1/users?rald_id=eq.${encodeURIComponent(raldUser.id)}&select=id,phone`,
    sbKey, "GET",
  );

  const existing = await findRes.json() as { id: string; phone: string }[];

  if (existing.length > 0) {
    userId = existing[0].id;
  } else {
    // Create new user
    const createRes = await supabaseReq(
      `${sbUrl}/rest/v1/users`,
      sbKey, "POST",
      {
        phone: raldUser.phone ?? null,
        email: raldUser.email ?? null,
        rald_id: raldUser.id,
        name: raldUser.name ?? null,
        role: raldUser.role ?? "user",
      },
    );
    if (!createRes.ok) {
      const err = await createRes.text();
      console.error("[rald-sso] create user error:", err);
      return c.json({ error: "Failed to provision user" }, 500);
    }
    const [created] = await createRes.json() as { id: string }[];
    if (!created?.id) {
      return c.json({ error: "Failed to provision user" }, 500);
    }
    userId = created.id;
  }

  // 3. Issue Loop JWT (7-day)
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signJwt(
    {
      sub:   userId,
      phone: phone,
      role:  raldUser.role ?? "user",
      iss:   "loop.rald.cloud",
      iat:   now,
      exp:   now + 60 * 60 * 24 * 7,
    },
    c.env.LOOP_JWT_SECRET,
  );

  return c.json({
    access_token: accessToken,
    user: {
      id:    userId,
      phone: phone,
      role:  raldUser.role ?? "user",
    },
  });
});
