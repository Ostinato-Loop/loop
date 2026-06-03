/**
 * Loop × RALD SSO Bridge
 *
 * POST /api/auth/rald-sso  { rald_token }
 *   → Verifies RALD JWT locally using RALD_JWT_SECRET (shared with rald-auth-core)
 *   → NO outbound HTTP call — avoids CF Error 522 (Workers cannot call
 *     other CF-proxied Workers via public hostname)
 *   → Upserts user in Supabase
 *   → Returns Loop JWT  { access_token, user }
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";

export const raldSso = new Hono<{ Bindings: CloudflareEnv }>();

/* ── JWT helpers ──────────────────────────────────────────────────────── */

interface RaldJwtPayload {
  id: string;
  email?: string;
  phone?: string;
  name?: string | null;
  role?: string;
  appId?: string;
  source?: string;
  sso_v?: number;
  iat?: number;
  exp?: number;
}

async function verifyRaldJwt(
  token: string,
  secret: string,
): Promise<RaldJwtPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    if (header.alg !== "HS256") return null;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const sigInput = `${parts[0]}.${parts[1]}`;
    const sig = Uint8Array.from(
      atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(sigInput));
    if (!valid) return null;

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as RaldJwtPayload;

    // Check expiry
    if (payload.exp && payload.exp < Date.now() / 1000) return null;

    return payload;
  } catch {
    return null;
  }
}

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

/* ── POST /api/auth/rald-sso ──────────────────────────────────────────── */
raldSso.post("/", async (c) => {
  const { rald_token } = await c.req.json<{ rald_token: string }>();

  if (!rald_token) return c.json({ error: "rald_token is required" }, 400);

  // 1. Verify RALD JWT locally — no HTTP call (avoids CF 522 error)
  const raldPayload = await verifyRaldJwt(rald_token, c.env.RALD_JWT_SECRET);
  if (!raldPayload) {
    return c.json({ error: "Invalid or expired RALD token" }, 401);
  }

  // 2. Upsert user in Supabase
  const sbUrl = c.env.SUPABASE_URL;
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  let userId: string;

  const findRes = await supabaseReq(
    `${sbUrl}/rest/v1/users?rald_id=eq.${encodeURIComponent(raldPayload.id)}&select=id,phone`,
    sbKey, "GET",
  );

  const existing = await findRes.json() as { id: string; phone: string }[];

  if (existing.length > 0) {
    userId = existing[0].id;
  } else {
    const createRes = await supabaseReq(
      `${sbUrl}/rest/v1/users`,
      sbKey, "POST",
      {
        phone:   raldPayload.phone ?? null,
        email:   raldPayload.email ?? null,
        rald_id: raldPayload.id,
        name:    raldPayload.name ?? null,
        role:    raldPayload.role ?? "user",
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
      phone: raldPayload.phone ?? raldPayload.email ?? "",
      role:  raldPayload.role ?? "user",
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
      phone: raldPayload.phone ?? raldPayload.email ?? "",
      role:  raldPayload.role ?? "user",
    },
  });
});
