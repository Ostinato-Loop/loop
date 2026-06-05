/**
   * Loop × RALD SSO Bridge — Phase H (Identity Axiom)
   *
   * POST /api/auth/rald-sso   { rald_token }
   *   Validates RALD JWT → upserts Loop profile with id = rald.id →
   *   returns same rald_token as Bearer for all /api/* calls.
   *
   * GET  /api/auth/silent
   *   Cookie-based silent session check. Also upserts profile on cold-start.
   *
   * ── Identity axiom ────────────────────────────────────────────────────────
   *   profiles.id  = rald.id   (RALD UUID from auth_users.id)
   *   user.id      = rald.id   (returned to frontend)
   *   host_id      = rald.id   (passed to createRoom, matches profiles.id)
   *   No mismatch. No FK violation.
   *
   * Previous bug: profile was created with supabaseId (Supabase Auth UUID),
   * but frontend used rald.id for all Supabase operations — guaranteed FK
   * violation on every createRoom call. Fixed by using rald.id as profile id.
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

  /* ── Supabase helper ─────────────────────────────────────────────────── */

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

  /**
   * Provision a Supabase Auth user (needed for Realtime auth).
   * Non-fatal — session is valid even if this fails.
   */
  async function provisionSupabaseAuthUser(sbUrl: string, sbKey: string, rald: RaldPayload): Promise<void> {
    if (!rald.email) return;
    try {
      const check = await sbAdmin(sbUrl, sbKey, "GET",
        `/auth/v1/admin/users?email=${encodeURIComponent(rald.email)}&per_page=1`);
      if (check.ok) {
        const d = await check.json() as { users?: { id: string }[] };
        if (d.users?.length) return; // already exists
      }
      await sbAdmin(sbUrl, sbKey, "POST", "/auth/v1/admin/users", {
        email: rald.email, email_confirm: true,
        user_metadata: { rald_id: rald.id, source: "rald-sso" },
      });
    } catch { /* non-fatal */ }
  }

  /**
   * Upsert Loop profile. id = rald.id (RALD UUID).
   * Uses merge-duplicates so repeat logins are idempotent.
   * Errors are logged, not thrown — SSO session is never blocked by a profile failure.
   */
  async function upsertProfile(sbUrl: string, sbKey: string, rald: RaldPayload): Promise<void> {
    const profile: Record<string, unknown> = { id: rald.id };

    // display_name: use RALD name, fall back to email local-part
    if (rald.name) {
      profile.display_name = rald.name;
    } else if (rald.email) {
      profile.display_name = rald.email.split("@")[0];
    }

    // username: derived from email local-part (slug-safe, 3-20 chars)
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

  /* ── POST /api/auth/rald-sso ─────────────────────────────────────────── */
  raldSso.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { rald_token?: string };
    if (!body.rald_token) return c.json({ error: "rald_token is required" }, 400);

    const rald = await verifyRaldJwt(body.rald_token, c.env.RALD_JWT_SECRET);
    if (!rald) return c.json({ error: "Invalid or expired RALD token" }, 401);

    const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
    const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

    // Both are non-blocking — SSO response is never delayed by DB ops
    await Promise.allSettled([
      provisionSupabaseAuthUser(sbUrl, sbKey, rald),
      upsertProfile(sbUrl, sbKey, rald),
    ]);

    return c.json({
      access_token: body.rald_token,
      user: { id: rald.id, email: rald.email ?? null, phone: rald.phone ?? null, role: rald.role ?? "user" },
    });
  });

  /* ── GET /api/auth/silent ────────────────────────────────────────────── */
  raldSso.get("/silent", async (c) => {
    const token = parseSessionCookie(c.req.header("Cookie"));
    if (!token) return c.json({ valid: false, reason: "no_session_cookie" }, 401);

    const rald = await verifyRaldJwt(token, c.env.RALD_JWT_SECRET);
    if (!rald) return c.json({ valid: false, reason: "invalid_or_expired_token" }, 401);

    // Upsert profile on silent login — ensures cold-start always has a profile row
    const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
    upsertProfile(sbUrl, c.env.SUPABASE_SERVICE_ROLE_KEY, rald).catch(() => null);

    return c.json({
      valid: true,
      user: { id: rald.id, email: rald.email ?? null, role: rald.role ?? "user" },
      access_token: token,
    });
  });
  