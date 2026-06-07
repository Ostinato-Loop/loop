/**
 * requireAuth middleware — Loop Cloudflare Worker
 *
 * Validates the Bearer token in Authorization header against RALD_JWT_SECRET.
 * Checks the KV revocation blocklist (jti) before passing to the route handler.
 *
 * Usage:
 *   router.get("/protected", requireAuth(), async (c) => {
 *     const user = c.get("user");  // AuthUser
 *   });
 *
 * IDN-001 (2026-06-07): Uses shared verifyJwt from lib/jwt.ts (RALD_JWT_SECRET).
 * PHD-001 (2026-06-07): Checks KV revocation blocklist (revoked:jti:<jti>).
 */

import { createMiddleware } from "hono/factory";
import type { CloudflareEnv } from "../types/env.js";
import { verifyJwt } from "../lib/jwt.js";

export interface AuthUser {
  id:      string;
  email?:  string;
  phone?:  string;
  role:    string;
}

type AuthVariables = { user: AuthUser };

/**
 * Extract and validate a Loop JWT from a Bearer token string.
 * Returns null if the token is invalid, expired, or revoked.
 *
 * @param token  - Raw JWT string (without "Bearer " prefix)
 * @param secret - RALD_JWT_SECRET value
 * @param cache  - KV namespace for revocation blocklist lookup
 */
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
    email: payload.email   as string | undefined,
    phone: payload.phone   as string | undefined,
    role:  (payload.role   as string | undefined) ?? "user",
  };
}

/**
 * Hono middleware that enforces JWT authentication.
 * Sets c.var.user on success. Returns 401 on failure.
 */
export function requireAuth() {
  return createMiddleware<{ Bindings: CloudflareEnv; Variables: AuthVariables }>(
    async (c, next) => {
      const authHeader = c.req.header("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const token = authHeader.slice(7);
      const user = await extractUser(token, c.env.RALD_JWT_SECRET, c.env.CACHE);

      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      c.set("user", user);
      await next();
    },
  );
}
