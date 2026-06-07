/**
 * Loop API — requireAuth middleware
 *
 * Phase H (Identity Axiom): Loop does NOT issue its own JWTs.
 * The RALD JWT (signed with RALD_JWT_SECRET) is the session token.
 * Accepts Bearer token OR rald_session cookie.
 *
 * IDN-001 (2026-06-07): JWT verification delegated to shared lib/jwt.ts.
 *                        Inline verifyRaldJwt removed.
 */
import type { MiddlewareHandler } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import { parseSessionCookie } from "../lib/cookie.js";
import { verifyJwt } from "../lib/jwt.js";

export type AuthUser = {
  id: string;
  email?: string;
  phone?: string;
  role: string;
};

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

async function extractUser(token: string, secret: string): Promise<AuthUser | null> {
  const payload = await verifyJwt(token, secret);
  if (!payload) return null;
  const id = (payload.id ?? payload.sub) as string | undefined;
  if (!id) return null;
  return {
    id,
    email: payload.email  as string | undefined,
    phone: payload.phone  as string | undefined,
    role: (payload.role   as string | undefined) ?? "user",
  };
}

/**
 * requireAuth — validates RALD JWT from:
 *   1. Authorization: Bearer <token>  (preferred — API calls)
 *   2. Cookie: rald_session=<token>   (implicit — browser requests)
 */
export const requireAuth = (): MiddlewareHandler<{ Bindings: CloudflareEnv }> =>
  async (c, next) => {
    const secret = c.env.RALD_JWT_SECRET;

    // 1. Bearer token
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const user  = await extractUser(token, secret);
      if (user) { c.set("user", user); return next(); }
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    // 2. rald_session cookie (silent SSO)
    const cookie = parseSessionCookie(c.req.header("Cookie"));
    if (cookie) {
      const user = await extractUser(cookie, secret);
      if (user) { c.set("user", user); return next(); }
    }

    return c.json({ error: "Authentication required" }, 401);
  };
