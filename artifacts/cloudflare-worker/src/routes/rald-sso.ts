/**
 * Loop × RALD SSO Bridge
 *
 * POST /api/auth/rald-sso  { rald_token }
 *   1. Verifies RALD JWT locally using RALD_JWT_SECRET (no HTTP call — avoids CF 522)
 *   2. Upserts Supabase auth user (by email) + loop profile row
 *   3. Issues Loop JWT  → { access_token, user }
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";

export const raldSso = new Hono<{ Bindings: CloudflareEnv }>();

/* ── Local JWT helpers ────────────────────────────────────────────────── */

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
    const sigInput = `${parts[0]}.${parts[1]}`;
    const sig = Uint8Array.from(
      atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0),
    );
    if (!(await crypto.subtle.verify("HMAC", key, sig, enc.encode(sigInput)))) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as RaldPayload;
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

async function signLoopJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
  const body   = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
  const key    = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig    = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
  return `${header}.${body}.${sigB64}`;
}

/* ── Supabase admin helpers ───────────────────────────────────────────── */

async function sbAdmin(supabaseUrl: string, serviceKey: string, method: string, path: string, body?: unknown) {
  return fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/* ── POST /api/auth/rald-sso ──────────────────────────────────────────── */
raldSso.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { rald_token?: string };
  if (!body.rald_token) return c.json({ error: "rald_token is required" }, 400);

  // 1. Verify RALD JWT locally (no HTTP call → no CF 522)
  const rald = await verifyRaldJwt(body.rald_token, c.env.RALD_JWT_SECRET);
  if (!rald) return c.json({ error: "Invalid or expired RALD token" }, 401);

  const sbUrl    = c.env.SUPABASE_URL.replace(/\/$/, "");
  const sbKey    = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const email    = rald.email ?? null;

  let supabaseUserId: string;
  let phone: string | null = null;

  // 2. Find or create Supabase auth user (match by email if available)
  if (email) {
    const searchRes = await sbAdmin(sbUrl, sbKey, "GET",
      `/auth/v1/admin/users?email=${encodeURIComponent(email)}&per_page=1`);
    if (searchRes.ok) {
      const data = await searchRes.json() as { users?: { id: string; phone?: string }[] };
      if (data.users && data.users.length > 0) {
        supabaseUserId = data.users[0].id;
        phone = data.users[0].phone ?? null;
      } else {
        // Create new Supabase auth user
        const createRes = await sbAdmin(sbUrl, sbKey, "POST", "/auth/v1/admin/users", {
          email,
          email_confirm: true,
          user_metadata: { rald_id: rald.id, source: "rald-sso" },
        });
        if (!createRes.ok) {
          const err = await createRes.text();
          console.error("[rald-sso] create auth user:", err);
          return c.json({ error: "Failed to provision user" }, 500);
        }
        const created = await createRes.json() as { id: string };
        supabaseUserId = created.id;
      }
    } else {
      // Search failed — create as fallback
      const createRes = await sbAdmin(sbUrl, sbKey, "POST", "/auth/v1/admin/users", {
        email,
        email_confirm: true,
        user_metadata: { rald_id: rald.id, source: "rald-sso" },
      });
      if (!createRes.ok) {
        const err = await createRes.text();
        console.error("[rald-sso] create auth user (fallback):", err);
        return c.json({ error: "Failed to provision user" }, 500);
      }
      const created = await createRes.json() as { id: string };
      supabaseUserId = created.id;
    }
  } else {
    // No email — create a placeholder Supabase user keyed by RALD id
    // Check if user with this RALD id already exists via user_metadata
    const createRes = await sbAdmin(sbUrl, sbKey, "POST", "/auth/v1/admin/users", {
      user_metadata: { rald_id: rald.id, source: "rald-sso" },
      email_confirm: true,
    });
    if (!createRes.ok) {
      const errBody = await createRes.json() as { msg?: string; message?: string };
      // If "already exists" error, try to look up by metadata (not possible via API)
      // Fall through — return an error
      console.error("[rald-sso] create anon auth user:", errBody);
      return c.json({ error: "Failed to provision user" }, 500);
    }
    const created = await createRes.json() as { id: string };
    supabaseUserId = created.id;
  }

  // 3. Upsert profile row (id = supabaseUserId)
  await sbAdmin(sbUrl, sbKey, "POST", "/rest/v1/profiles", {
    id: supabaseUserId,
    ...(rald.name ? { display_name: rald.name } : {}),
  }).then((r) => {
    if (!r.ok && r.status !== 409) {
      r.text().then((t) => console.warn("[rald-sso] profile upsert:", r.status, t));
    }
  });

  // 4. Issue Loop JWT (30 days)
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signLoopJwt({
    sub:   supabaseUserId,
    phone: phone ?? email ?? rald.email ?? "",
    role:  "authenticated",
    iss:   "loop.rald.cloud",
    iat:   now,
    exp:   now + 60 * 60 * 24 * 30,
  }, c.env.LOOP_JWT_SECRET);

  return c.json({
    access_token: accessToken,
    user: {
      id:    supabaseUserId,
      phone: phone ?? null,
      email: email,
      role:  rald.role ?? "user",
    },
  });
});
