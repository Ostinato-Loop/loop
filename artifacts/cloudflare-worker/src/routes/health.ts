import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";

const health = new Hono<{ Bindings: CloudflareEnv }>();

/**
 * GET /api/healthz
 * Ultra-fast liveness probe. Returns 200 as long as the worker is alive.
 * Used by load balancers + CI smoke tests. No external calls.
 */
health.get("/z", (c) => {
  return c.json({ ok: true, status: "live", service: "loop-api", ts: Date.now() });
});

/**
 * GET /api/health
 * Deep health check. Verifies all bindings AND Supabase connectivity.
 * Adds `supabase` field: { ok: boolean, error?: string, hint?: string }.
 * Used by monitoring, post-deploy validation, and on-call runbooks.
 */
health.get("/", async (c) => {
  // ── Supabase connectivity probe ───────────────────────────────────
  // Makes a minimal REST request to confirm the service role key is
  // valid and the database tables exist. Failure here means rooms,
  // communities, and regions endpoints will all return 500.
  let supabaseOk  = false;
  let supabaseErr = "";
  let supabaseHint = "";

  try {
    if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabaseErr  = "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured";
      supabaseHint = "Run: echo '<key>' | wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production";
    } else {
      // HEAD request to profiles table — cheapest possible probe
      const probeResp = await fetch(
        `${c.env.SUPABASE_URL}/rest/v1/profiles?limit=1&select=id`,
        {
          method: "HEAD",
          headers: {
            apikey:        c.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (probeResp.ok || probeResp.status === 416) {
        // 200 or 416 Range Not Satisfiable both indicate auth success
        supabaseOk = true;
      } else {
        const body = await probeResp.text().catch(() => "");
        supabaseErr  = `HTTP ${probeResp.status}: ${body.slice(0, 120)}`;
        supabaseHint = probeResp.status === 401
          ? "SUPABASE_SERVICE_ROLE_KEY is wrong or expired — re-push the correct key"
          : probeResp.status === 404
          ? "Table 'profiles' not found — run migrations: supabase db push --linked"
          : "Check Supabase project status at app.supabase.com";
      }
    }
  } catch (e) {
    supabaseErr  = e instanceof Error ? e.message : String(e);
    supabaseHint = "Supabase project may be paused or network unreachable from Cloudflare";
  }

  const supabase: Record<string, unknown> = { ok: supabaseOk };
  if (!supabaseOk) { supabase.error = supabaseErr; supabase.hint = supabaseHint; }

  return c.json({
    ok: true,
    service: "loop-api",
    version: "1.0.0",
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
    bindings: {
      db:           typeof c.env.DB            !== "undefined",
      cache:        typeof c.env.CACHE          !== "undefined",
      media:        typeof c.env.MEDIA          !== "undefined",
      taskQueue:    typeof c.env.TASK_QUEUE      !== "undefined",
      roomSession:  typeof c.env.ROOM_SESSION    !== "undefined",
      ai:           typeof c.env.AI              !== "undefined",
    },
    supabase,
    secrets: {
      raldJwt:           !!c.env.RALD_JWT_SECRET,
      supabaseServiceKey: !!c.env.SUPABASE_SERVICE_ROLE_KEY,
      livekit:           !!(c.env.LIVEKIT_API_KEY && c.env.LIVEKIT_API_SECRET),
      livekitUrl:        !!c.env.LIVEKIT_URL,
      termii:            !!c.env.TERMII_API_KEY,
    },
  });
});

export { health };
