/**
 * Loop API — requireAuth middleware
 *
 * Phase H (Identity Axiom): Loop does NOT issue its own JWTs.
 * The RALD JWT (signed with RALD_JWT_SECRET) is the session token.
 * Accepts Bearer token (RALD JWT) OR rald_session cookie.
 */
import type { MiddlewareHandler } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import { parseSessionCookie } from "../lib/cookie.js";

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

async function verifyRaldJwt(token: string, secret: string): Promise<AuthUser | null> {
  try {
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, sigBytes, enc.encode(`${header}.${body}`),
    );
    if (!valid) return null;
    const payload = JSON.parse(
      atob(body.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { id?: string; sub?: string; email?: string; phone?: string; role?: string; exp?: number };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    const id = payload.id ?? payload.sub;
    if (!id) return null;
    return { id, email: payload.email, phone: payload.phone, role: payload.role ?? "user" };
  } catch {
    return null;
  }
}

/**
 * requireAuth — validates RALD JWT from:
 *   1. Authorization: Bearer <token>  (explicit — API calls)
 *   2. Cookie: rald_session=<token>   (implicit — browser requests)
 */
export const requireAuth = (): MiddlewareHandler<{ Bindings: CloudflareEnv }> =>
  async (c, next) => {
    const secret = c.env.RALD_JWT_SECRET;

    // 1. Bearer token (preferred)
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const user  = await verifyRaldJwt(token, secret);
      if (user) { c.set("user", user); return next(); }
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    // 2. rald_session cookie (silent SSO)
    const cookie = parseSessionCookie(c.req.header("Cookie"));
    if (cookie) {
      const user = await verifyRaldJwt(cookie, secret);
      if (user) { c.set("user", user); return next(); }
    }

    return c.json({ error: "Authentication required" }, 401);
  };
