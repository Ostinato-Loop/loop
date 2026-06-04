/**
 * Loop × RALD SSO Bridge — Phase H (Identity Axiom)
 *
 * RALD owns identity. Loop does NOT issue its own JWTs.
 * The RALD JWT IS the session token for all Loop API calls.
 *
 * POST /api/auth/rald-sso   { rald_token }
 *   Validates the RALD JWT locally → provisions Supabase user if needed →
 *   returns the SAME rald_token for use as Bearer on all /api/* calls.
 *   No LOOP_JWT_SECRET. No loop-specific token. One token. One identity.
 *
 * GET  /api/auth/silent
 *   Reads the rald_session HttpOnly cookie (set by auth.rald.cloud at login).
 *   Called on app mount — returns the user without any redirect.
 *   Enables the silent SSO step-3 cascade (cookie → no login screen).
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import { parseSessionCookie } from "../lib/cookie.js";

export const raldSso = new Hono<{ Bindings: CloudflareEnv }>();

/* ── JWT verification ────────────────────────────────────────────────── */

interface RaldPayload {
  id: string;
  email?: string;
  phone?: string;
  name?: string | null;
  role?: string;
  appId?: string;
  iat?: number;
  exp?: number;
}

async function verifyRaldJwt(token: string, secret: string): Promise<RaldPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    if (header.alg !== "HS256") return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const sig = Uint8Array.from(
      atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0),
    );
    if (!(await crypto.subtle.verify("HMAC", key, sig, enc.encode(`${parts[0]}.${parts[1]}`)))) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as RaldPayload;
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

/* ── Supabase helpers ────────────────────────────────────────────────── */

async function sbAdmin(url: string, key: string, method: string, path: string, body?: unknown) {
  return fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function provisionUser(sbUrl: string, sbKey: string, rald: RaldPayload): Promise<string | null> {
  const email = rald.email ?? null;
  if (email) {
    const r = await sbAdmin(sbUrl, sbKey, "GET", `/auth/v1/admin/users?email=${encodeURIComponent(email)}&per_page=1`);
    if (r.ok) {
      const d = await r.json() as { users?: { id: string }[] };
      if (d.users?.length) return d.users[0].id;
    }
    const cr = await sbAdmin(sbUrl, sbKey, "POST", "/auth/v1/admin/users", {
      email, email_confirm: true, user_metadata: { rald_id: rald.id, source: "rald-sso" },
    });
    if (cr.ok) return ((await cr.json()) as { id: string }).id;
  }
  return null;
}

/* ── POST /api/auth/rald-sso ─────────────────────────────────────────── */
raldSso.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { rald_token?: string };
  if (!body.rald_token) return c.json({ error: "rald_token is required" }, 400);

  const rald = await verifyRaldJwt(body.rald_token, c.env.RALD_JWT_SECRET);
  if (!rald) return c.json({ error: "Invalid or expired RALD token" }, 401);

  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  // Provision Supabase user if needed (profile bridge — non-blocking on failure)
  const supabaseId = await provisionUser(sbUrl, sbKey, rald).catch(() => null);
  if (supabaseId) {
    sbAdmin(sbUrl, sbKey, "POST", "/rest/v1/profiles",
      { id: supabaseId, ...(rald.name ? { display_name: rald.name } : {}) }
    ).catch(() => null);
  }

  // The RALD JWT is the session. No separate Loop token.
  return c.json({
    access_token: body.rald_token,
    user: {
      id:    rald.id,
      email: rald.email ?? null,
      phone: rald.phone ?? null,
      role:  rald.role ?? "user",
    },
  });
});

/* ── GET /api/auth/silent — cookie-based silent session check ────────── */
raldSso.get("/silent", async (c) => {
  const cookieHeader = c.req.header("Cookie");
  const token = parseSessionCookie(cookieHeader);
  if (!token) {
    return c.json({ valid: false, reason: "no_session_cookie" }, 401);
  }
  const rald = await verifyRaldJwt(token, c.env.RALD_JWT_SECRET);
  if (!rald) {
    return c.json({ valid: false, reason: "invalid_or_expired_token" }, 401);
  }
  return c.json({
    valid: true,
    user: { id: rald.id, email: rald.email ?? null, role: rald.role ?? "user" },
    access_token: token,
  });
});
