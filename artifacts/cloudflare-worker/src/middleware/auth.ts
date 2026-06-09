/**
 * requireAuth middleware — Loop Cloudflare Worker
 *
 * Validates the session against RALD_JWT_SECRET.
 * Token resolution priority (highest first):
 *   1. Authorization: Bearer <token>  — explicit header (API clients, /api/auth/me)
 *   2. loop_session HttpOnly cookie   — browser requests after COOKIE-001 migration
 *
 * COOKIE-001 (2026-06-09): Cookie fallback added. All browser API calls now work
 *   with credentials: 'include' even without a Bearer header. Existing Bearer
 *   callers (Supabase service, internal tools) continue to work unchanged.
 *
 * PHD-001 (2026-06-07): Checks KV revocation blocklist (revoked:jti:<jti>).
 * IDN-001 (2026-06-07): Uses shared verifyJwt from lib/jwt.ts (RALD_JWT_SECRET).
 */

import { createMiddleware } from "hono/factory";
import type { CloudflareEnv } from "../types/env.js";
import { verifyJwt } from "../lib/jwt.js";
import { parseSessionCookie } from "../lib/cookie.js";

export interface AuthUser {
  id:      string;
  email?:  string;
  phone?:  string;
  role:    string;
}

type AuthVariables = { user: AuthUser };

async function extractUser(
  token:  string,
  secret: string,
  cache:  KVNamespace,
): Promise<AuthUser | null> {
  const payload = await verifyJwt(token, secret);
  if (!payload) return null;

  // PHD-001: Check revocation blocklist
  const jti = payload.jti as string | undefined;
  if (jti) {
    const revoked = await cache.get(`revoked:jti:${jti}`);
    if (revoked) return null;
  }

  const id = (payload.id ?? payload.sub) as string | undefined;
  if (!id) return null;

  return {
    id,
    email: payload.email as string | undefined,
    phone: payload.phone as string | undefined,
    role:  (payload.role as string | undefined) ?? "user",
  };
}

export function requireAuth() {
  return createMiddleware<{ Bindings: CloudflareEnv; Variables: AuthVariables }>(
    async (c, next) => {
      // Priority 1: Authorization: Bearer header
      const authHeader = c.req.header("Authorization");
      let token: string | null = null;

      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.slice(7);
      } else {
        // Priority 2: loop_session HttpOnly cookie (COOKIE-001)
        token = parseSessionCookie(c.req.header("Cookie"));
      }

      if (!token) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const user = await extractUser(token, c.env.RALD_JWT_SECRET, c.env.CACHE);
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      c.set("user", user);
      await next();
    },
  );
}
