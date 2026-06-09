/**
 * requireAuth middleware — Loop Cloudflare Worker
 *
 * Token resolution priority (highest first):
 *   1. Authorization: Bearer <token>  — explicit header
 *   2. loop_session HttpOnly cookie   — browser requests (COOKIE-001)
 *
 * Revocation checks (in order):
 *   a. Per-token JTI blocklist   — revoked:jti:<jti>  (PHD-001, signout)
 *   b. User-level revoke-all     — revoke_before:<userId> timestamp (REVOKE-ALL-001)
 *      Any token whose iat * 1000 ≤ revoke_before is invalid — the user
 *      signed out all other devices and the calling device issued a fresh token.
 *
 * COOKIE-001     (2026-06-09): Cookie fallback added.
 * REVOKE-ALL-001 (2026-06-09): User-level timestamp revocation added.
 * PHD-001        (2026-06-07): Per-token JTI blocklist check.
 * IDN-001        (2026-06-07): Shared RALD_JWT_SECRET.
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

  const id = (payload.id ?? payload.sub) as string | undefined;
  if (!id) return null;

  // (a) Per-token JTI blocklist — PHD-001
  const jti = payload.jti as string | undefined;
  if (jti) {
    const revoked = await cache.get(`revoked:jti:${jti}`);
    if (revoked) return null;
  }

  // (b) User-level revoke-all timestamp — REVOKE-ALL-001
  // Any token issued at or before the revoke_before timestamp is dead.
  // The device that called /revoke-all received a fresh token (iat > revoke_before).
  const revokeBefore = await cache.get(`revoke_before:${id}`);
  if (revokeBefore) {
    const revokeBeforeMs = parseInt(revokeBefore, 10);
    const tokenIatMs = typeof payload.iat === "number" ? payload.iat * 1000 : 0;
    if (tokenIatMs <= revokeBeforeMs) return null;
  }

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
