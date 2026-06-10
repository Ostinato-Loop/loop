/**
 * Loop API — Health Endpoint
 * Mounted at /health and /api/health
 *
 * GET /api/health             — shallow liveness check (fast, always available)
 * GET /api/health/deep        — deep readiness check (Supabase + KV + env vars)
 * GET /api/health/coordinator — CleanupCoordinator DO status (armed? next run?)
 *
 * HARDENING-001 (2026-06-10):
 *   Added /api/health/deep — pings Supabase REST API and KV, measures latency.
 *   Shallow /health used by load balancers (fast, no external calls).
 *   Deep /health/deep used by monitoring dashboards before declaring healthy.
 * CRON-DISABLED-001 (2026-06-10):
 *   Added /api/health/coordinator — exposes CleanupCoordinator DO armed state
 *   so uptime monitors can alert if the stale-room sweep loop ever stops.
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";

const REQUIRED_SECRETS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RALD_JWT_SECRET",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "TERMII_API_KEY",
  "ONESIGNAL_APP_ID",
  "ONESIGNAL_REST_API_KEY",
] as const;

const health = new Hono<{ Bindings: CloudflareEnv }>();

/* ── GET /api/health — liveness (shallow) ────────────────────────────── */
health.get("/", async (c) => {
  // CRON-DISABLED-001: Arm the CleanupCoordinator DO so stale-room sweeps run
  // even without a cron trigger. The call is idempotent — the DO only sets its
  // alarm if one isn't already scheduled.
  try {
    const coordId   = c.env.CLEANUP_COORDINATOR.idFromName("global");
    const coordStub = c.env.CLEANUP_COORDINATOR.get(coordId);
    await coordStub.fetch(new Request("https://do/arm", { method: "POST" }));
  } catch {
    // Non-fatal — DO arm failures must never block the health response
  }

  return c.json({
    ok:          true,
    service:     "loop-api",
    version:     "1.0.0",
    environment: c.env.ENVIRONMENT,
    sha:         (c.env as unknown as Record<string, string>).COMMIT_SHA ?? "unknown",
    timestamp:   new Date().toISOString(),
    bindings: {
      db:          typeof c.env.DB           !== "undefined",
      cache:       typeof c.env.CACHE        !== "undefined",
      media:       typeof c.env.MEDIA        !== "undefined",
      taskQueue:   typeof c.env.TASK_QUEUE   !== "undefined",
      roomSession: typeof c.env.ROOM_SESSION !== "undefined",
      ai:          typeof c.env.AI           !== "undefined",
    },
  });
});

/* ── GET /api/health/deep — readiness (deep) ──────────────────────────── */
// Runs actual connectivity probes. Slower — only called by monitoring.
health.get("/deep", async (c) => {
  const t0 = Date.now();
  const results: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

  // 1. Supabase REST ping
  try {
    const sbStart = Date.now();
    const sbResp  = await fetch(
      `${c.env.SUPABASE_URL}/rest/v1/`,
      {
        headers: {
          apikey:        c.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    results.supabase = {
      ok: sbResp.status < 500,
      ms: Date.now() - sbStart,
    };
  } catch (err) {
    results.supabase = { ok: false, error: String(err).slice(0, 100) };
  }

  // 2. KV connectivity
  try {
    const kvStart = Date.now();
    const testKey = `health:ping:${Date.now()}`;
    await c.env.CACHE.put(testKey, "1", { expirationTtl: 60 });
    const val = await c.env.CACHE.get(testKey);
    results.kv = {
      ok: val === "1",
      ms: Date.now() - kvStart,
    };
    await c.env.CACHE.delete(testKey).catch(() => {});
  } catch (err) {
    results.kv = { ok: false, error: String(err).slice(0, 100) };
  }

  // 3. Required secrets presence
  const env = c.env as unknown as Record<string, string>;
  const missingSecrets = REQUIRED_SECRETS.filter((s) => !env[s]);
  results.secrets = {
    ok:    missingSecrets.length === 0,
    error: missingSecrets.length > 0 ? `Missing: ${missingSecrets.join(", ")}` : undefined,
  };

  // 4. Bindings
  results.bindings = {
    ok: typeof c.env.DB !== "undefined" && typeof c.env.CACHE !== "undefined",
  };

  const allOk   = Object.values(results).every((r) => r.ok);
  const totalMs = Date.now() - t0;

  return c.json(
    {
      ok:          allOk,
      service:     "loop-api",
      environment: c.env.ENVIRONMENT,
      timestamp:   new Date().toISOString(),
      totalMs,
      checks:      results,
    },
    allOk ? 200 : 503,
  );
});


/* ── GET /api/health/coordinator — CleanupCoordinator DO status ──────── */
// Returns whether the singleton DO is armed and when its next sweep fires.
// Returns 200 when armed (loop is running), 503 when not armed (needs /arm call).
// CRON-DISABLED-001: use this with an uptime monitor to alert if the loop dies.
health.get("/coordinator", async (c) => {
  const t0 = Date.now();

  try {
    const coordId   = c.env.CLEANUP_COORDINATOR.idFromName("global");
    const coordStub = c.env.CLEANUP_COORDINATOR.get(coordId);
    const resp      = await coordStub.fetch(
      new Request("https://do/status", { method: "GET" }),
    );
    const status = await resp.json<{ ok: boolean; nextRun: string | null }>();
    const armed  = status.nextRun !== null;
    const msUntilNextRun = armed
      ? Math.max(0, new Date(status.nextRun!).getTime() - Date.now())
      : null;

    return c.json(
      {
        ok:             armed,
        armed,
        nextRun:        status.nextRun ?? null,
        msUntilNextRun,
        intervalMs:     10 * 60 * 1000,
        probeMs:        Date.now() - t0,
        service:        "cleanup-coordinator-do",
        timestamp:      new Date().toISOString(),
      },
      armed ? 200 : 503,
    );
  } catch (err) {
    return c.json(
      {
        ok:        false,
        armed:     false,
        error:     String(err).slice(0, 200),
        probeMs:   Date.now() - t0,
        service:   "cleanup-coordinator-do",
        timestamp: new Date().toISOString(),
      },
      503,
    );
  }
});

export { health };
