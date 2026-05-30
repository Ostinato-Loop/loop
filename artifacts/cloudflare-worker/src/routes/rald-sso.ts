/**
 * Loop × RALD SSO Bridge
 *
 * POST /api/auth/rald-sso  { rald_token }
 *   → Validates RALD JWT with auth.rald.cloud/auth/me
 *   → Upserts user in Supabase
 *   → Returns Loop JWT  { access_token, user }
 *
 * Loop frontend calls this after being redirected back from
 * accounts.rald.cloud with ?rald_token=...&app_id=loop
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

  // 1. Validate with RALD auth server
  const meRes = await fetch(`${raldBase}/auth/me`, {
    headers: { Authorization: `Bearer ${rald_token}` },
  });

  if (!meRes.ok) {
    return c.json({ error: "Invalid or expired RALD token" }, 401);
  }

  const raldUser = await meRes.json() as {
    id: string;
    email?: string;
    phone?: string;
    name?: string | null;
    raldId?: string | null;
    role?: string;
  };

  const phone = raldUser.phone ?? raldUser.email ?? raldUser.id;

  // 2. Upsert user in Supabase
  const sbUrl = c.env.SUPABASE_URL;
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  let userId: string;

  // Try find by rald_id or phone
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
      return c.json({ error: "Failed to create user" }, 500);
    }
    const [created] = await createRes.json() as { id: string }[];
    userId = created.id;
  }

  // 3. Issue Loop JWT
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signJwt(
    {
      sub:   userId,
      phone: raldUser.phone ?? raldUser.email ?? "",
      role:  raldUser.role ?? "user",
      iss:   "loop.rald.cloud",
      iat:   now,
      exp:   now + 60 * 60 * 24 * 7, // 7 days
    },
    c.env.LOOP_JWT_SECRET,
  );

  return c.json({
    access_token: accessToken,
    user: { id: userId, phone: raldUser.phone ?? raldUser.email ?? "", role: raldUser.role ?? "user" },
  });
});
