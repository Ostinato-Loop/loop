import type { MiddlewareHandler } from "hono";
import type { CloudflareEnv } from "../types/env.js";

/**
 * CORS middleware.
 * In development, allows the Vite dev server origin.
 * In production, restrict to your deployed Loop domain.
 */
export const cors = (): MiddlewareHandler<{ Bindings: CloudflareEnv }> =>
  async (c, next) => {
    const origin = c.env.CORS_ORIGIN ?? "*";

    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    await next();

    Object.entries(corsHeaders(origin)).forEach(([k, v]) =>
      c.res.headers.set(k, v),
    );
  };

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}
