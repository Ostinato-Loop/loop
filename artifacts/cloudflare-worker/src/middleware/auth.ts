import type { MiddlewareHandler } from "hono";
import type { CloudflareEnv } from "../types/env.js";

export type AuthUser = {
  id: string;
  phone?: string;
  role: string;
};

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

async function verifyLoopJwt(
  token: string,
  secret: string,
): Promise<AuthUser | null> {
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
    ) as { sub: string; phone?: string; role?: string; exp?: number };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: payload.sub, phone: payload.phone, role: payload.role ?? "authenticated" };
  } catch {
    return null;
  }
}

/**
 * requireAuth — validates our custom Loop JWT (signed with LOOP_JWT_SECRET).
 * Set the bearer token from loop_token in localStorage.
 */
export const requireAuth = (): MiddlewareHandler<{ Bindings: CloudflareEnv }> =>
  async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing authorization header" }, 401);
    }
    const token = authHeader.slice(7);
    const secret = c.env.LOOP_JWT_SECRET ?? "loop-dev-secret-change-in-prod";
    const user = await verifyLoopJwt(token, secret);
    if (!user) return c.json({ error: "Invalid or expired token" }, 401);
    c.set("user", user);
    await next();
  };
