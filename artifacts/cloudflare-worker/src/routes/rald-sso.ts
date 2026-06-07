/**
 * Loop × RALD SSO Bridge — Phase H (Identity Axiom)
 *
 * POST /api/auth/rald-sso   { rald_token }
 *   Validates RALD JWT → upserts Loop profile (id = rald.id) →
 *   re-signs a Loop-scoped JWT with standard ecosystem claims → returns it.
 *
 * GET  /api/auth/silent
 *   Cookie-based silent session check. Upserts profile on cold-start.
 *   Re-signs a fresh Loop token on success.
 *
 * IDN-001 (2026-06-07): rald-sso now re-signs instead of passing through the
 *   raw rald_token. Loop token has: sub, email, role, iss, aud, iat, exp.
 *   sub = rald.id (RALD UUID). TTL = 7 days.
 *
 * PHD-001 (2026-06-07): jti claim added to all issued tokens for revocation.
 *
 * Identity axiom:
 *   profiles.id  = rald.id   (RALD UUID — canonical identity for SSO users)
 *   user.id      = rald.id   (returned to frontend)
 *   host_id      = rald.id   (passed to createRoom — matches profiles.id)
 *   sub          = rald.id   (populates auth.uid() once Supabase JWT secret aligned)
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import { parseSessionCookie } from "../lib/cookie.js";
import {
  signJwt,
  verifyJwt,
  JWT_ISSUER,
  JWT_AUDIENCE,
  TTL_SSO_S,
} from "../lib/jwt.js";

export const raldSso = new Hono<{ Bindings: CloudflareEnv }>();

/* ── RALD payload shape (upstream token from auth.rald.cloud) ────────── */

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

/* ── Supabase helper ─────────────────────────────────────────────────── */

async function sbAdmin(
  url: string, key: string, method: string, path: string,
  body?: unknown, extra?: Record<string, string>,
) {
  return fetch(`${url}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${key}`,
      apikey:         key,
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Provision a Supabase Auth user (for Realtime auth).
 * Non-fatal — SSO session is valid even if this fails.
 */
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
      email:          rald.email,
      email_confirm:  true,
      user_metadata:  { rald_id: rald.id, source: "rald-sso" },
    });
  } catch { /* non-fatal */ }
}

/**
 * Upsert Loop profile. id = rald.id (RALD UUID).
 */
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
    const res = await sbAdmin(sbUrl, sbKey, "POST", "/rest/v1/profiles", profile, {
      "Prefer": "resolution=merge-duplicates,return=minimal",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[rald-sso] profile upsert failed:", res.status, text.slice(0, 200));
    }
  } catch (e) {
    console.error("[rald-sso] profile upsert error:", e);
  }
}

/**
 * Issue a Loop-scoped JWT with standard RALD ecosystem claims.
 * PHD-001: includes jti for per-token revocation support.
 */
async function issueLoopToken(
  rald:   RaldPayload,
  secret: string,
  source: "rald-sso" | "silent",
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      sub:    rald.id,
      email:  rald.email ?? null,
      role:   rald.role ?? "user",
      iss:    JWT_ISSUER,
      aud:    JWT_AUDIENCE,
      iat:    now,
      exp:    now + TTL_SSO_S,
      jti:    crypto.randomUUID(),   // PHD-001: revocation key
      id:     rald.id,              // backward-compat
      source,
    },
    secret,
  );
}

/* ── POST /api/auth/rald-sso ─────────────────────────────────────────── */
raldSso.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { rald_token?: string };
  if (!body.rald_token) return c.json({ error: "rald_token is required" }, 400);

  const rald = await verifyJwt(body.rald_token, c.env.RALD_JWT_SECRET) as RaldPayload | null;
  if (!rald || !rald.id) return c.json({ error: "Invalid or expired RALD token" }, 401);

  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  await Promise.allSettled([
    provisionSupabaseAuthUser(sbUrl, sbKey, rald),
    upsertProfile(sbUrl, sbKey, rald),
  ]);

  const loopToken = await issueLoopToken(rald, c.env.RALD_JWT_SECRET, "rald-sso");

  console.log("[rald-sso]", JSON.stringify({
    userId: rald.id, source: "rald-sso", timestamp: new Date().toISOString(),
  }));

  return c.json({
    access_token: loopToken,
    user: {
      id:    rald.id,
      email: rald.email ?? null,
      phone: rald.phone ?? null,
      role:  rald.role  ?? "user",
    },
  });
});

/* ── GET /api/auth/silent ────────────────────────────────────────────── */
raldSso.get("/silent", async (c) => {
  const token = parseSessionCookie(c.req.header("Cookie"));
  if (!token) return c.json({ valid: false, reason: "no_session_cookie" }, 401);

  const rald = await verifyJwt(token, c.env.RALD_JWT_SECRET) as RaldPayload | null;
  if (!rald || !rald.id) return c.json({ valid: false, reason: "invalid_or_expired_token" }, 401);

  const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
  upsertProfile(sbUrl, c.env.SUPABASE_SERVICE_ROLE_KEY, rald).catch(() => null);

  const loopToken = await issueLoopToken(rald, c.env.RALD_JWT_SECRET, "silent");

  return c.json({
    valid: true,
    user: {
      id:    rald.id,
      email: rald.email ?? null,
      role:  rald.role  ?? "user",
    },
    access_token: loopToken,
  });
});
