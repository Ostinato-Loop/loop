import type { MiddlewareHandler } from "hono";
import type { CloudflareEnv } from "../types/env.js";

/**
 * CORS middleware.
 *
 * Allowed origins are resolved from the CORS_ORIGIN env var (comma-separated
 * list) with a hard-coded production allowlist as fallback.  The request
 * Origin header is reflected when it appears in the allowed list, enabling
 * credentialed cross-app requests (e.g. sv.rald.cloud, messenger.rald.cloud).
 *
 * FIX (2026-06-07): Access-Control-Allow-Credentials must NOT be set when
 *   Access-Control-Allow-Origin is "*". Browsers reject credentialed requests
 *   with wildcard origin (CORS spec). This bug broke /api/auth/silent in
 *   wrangler dev where CORS_ORIGIN defaults to "*".
 */

const PRODUCTION_ALLOWLIST = [
  "https://loop.rald.cloud",
  "https://chat.rald.cloud",
  "https://messenger.rald.cloud",
  "https://profiles.rald.cloud",
  "https://sv.rald.cloud",
  "https://rald.cloud",
  "https://business.rald.cloud",
  "https://control.rald.cloud",
  "https://rald-control-center.pages.dev",
  "http://localhost:5173",
  "http://localhost:3000",
];

function resolveOrigin(env: CloudflareEnv, requestOrigin: string): string {
  const configured = env.CORS_ORIGIN;
  if (configured) {
    // Support comma-separated list in env var
    const list = configured.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.includes(requestOrigin)) return requestOrigin;
    return list[0] ?? "*";
  }
  // Fall back to hard-coded production allowlist
  if (PRODUCTION_ALLOWLIST.includes(requestOrigin)) return requestOrigin;
  return PRODUCTION_ALLOWLIST[0];
}

export const cors = (): MiddlewareHandler<{ Bindings: CloudflareEnv }> =>
  async (c, next) => {
    const requestOrigin = c.req.header("Origin") ?? "";
    const origin = resolveOrigin(c.env, requestOrigin);

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
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin":  origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age":       "86400",
    "Vary":                         "Origin",
  };
  // Credentials cannot be combined with wildcard origin (CORS spec §3.2.3).
  // Browsers reject "Allow-Origin: *" + "Allow-Credentials: true" outright.
  if (origin !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}
