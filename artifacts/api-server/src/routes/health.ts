// Loop API Server — Health Routes
// GET /api/healthz  — shallow liveness (no external deps, used by load balancer)
// GET /api/health   — deep readiness probe (KV Worker + Supabase + LiveKit)
//
// All three checks run concurrently. An "unconfigured" check (missing env var)
// does NOT cause a 207 — it is expected in local dev. A real connectivity
// failure returns 207 (multi-status) with per-check detail.
// LILCKY STUDIO LIMITED

import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { RoomServiceClient } from "livekit-server-sdk";

const router: IRouter = Router();

const SUPABASE_URL          = process.env["SUPABASE_URL"]             ?? "";
const SUPABASE_SERVICE_ROLE = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const LIVEKIT_URL           = process.env["LIVEKIT_URL"]              ?? "";
const LIVEKIT_API_KEY       = process.env["LIVEKIT_API_KEY"]          ?? "";
const LIVEKIT_API_SECRET    = process.env["LIVEKIT_API_SECRET"]       ?? "";
// KV lives in the Cloudflare Worker — probe it via the Worker's own health endpoint
const WORKER_HEALTH_URL     = process.env["WORKER_HEALTH_URL"]
  ?? "https://loop-api.rald.cloud/api/health";

const VERSION     = "1.0.0";
const ENVIRONMENT = process.env["NODE_ENV"] ?? "development";
const START_MS    = Date.now();

type CheckResult = {
  ok:        boolean;
  latencyMs: number;
  error?:    string;
  detail?:   string;
};

// ── Supabase connectivity ──────────────────────────────────────────────────────
async function checkSupabase(): Promise<CheckResult> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return { ok: false, latencyMs: 0, error: "unconfigured",
      detail: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" };
  }
  const t = Date.now();
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });
    const { error } = await sb.from("profiles").select("id").limit(1).maybeSingle();
    return error
      ? { ok: false, latencyMs: Date.now() - t, error: error.message }
      : { ok: true,  latencyMs: Date.now() - t };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t, error: String(err) };
  }
}

// ── LiveKit connectivity ───────────────────────────────────────────────────────
async function checkLiveKit(): Promise<CheckResult> {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return { ok: false, latencyMs: 0, error: "unconfigured",
      detail: "LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET not set" };
  }
  const t = Date.now();
  try {
    const client = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    await Promise.race<unknown>([
      client.listRooms(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("livekit probe timeout (5 s)")), 5000),
      ),
    ]);
    return { ok: true, latencyMs: Date.now() - t };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t, error: String(err) };
  }
}

// ── KV / CF Worker probe ────────────────────────────────────────────────────────
// The CACHE KV namespace is a Cloudflare binding — not accessible from Node.js.
// We probe it indirectly by calling the Worker's health endpoint, which reports
// binding availability. A 200 + bindings.cache=true means KV is reachable.
async function checkKv(): Promise<CheckResult> {
  const t = Date.now();
  try {
    const res = await fetch(WORKER_HEALTH_URL, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "loop-api-health/1.0" },
    });
    const latencyMs = Date.now() - t;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `worker returned HTTP ${res.status}` };
    }
    const body = (await res.json()) as Record<string, unknown>;
    const bindings = body["bindings"] as Record<string, boolean> | undefined;
    const cacheOk  = bindings ? bindings["cache"] !== false : true;
    return {
      ok: cacheOk,
      latencyMs,
      detail: bindings
        ? `cache=${String(bindings["cache"])}, db=${String(bindings["db"])}`
        : "worker responded but bindings field absent",
    };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t, error: String(err) };
  }
}

// ── GET /api/healthz ──────────────────────────────────────────────────────────
router.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status:  "ok",
    service: "loop-api-server",
    uptime:  Math.floor((Date.now() - START_MS) / 1000),
  });
});

// ── GET /api/health ───────────────────────────────────────────────────────────
router.get("/health", async (req: Request, res: Response) => {
  const traceId = (req.traceId as string | undefined) ?? randomUUID();

  const [supabase, livekit, kv] = await Promise.all([
    checkSupabase(),
    checkLiveKit(),
    checkKv(),
  ]);

  const checks = { supabase, livekit, kv };

  // Real failures = not ok AND not just unconfigured
  const realFailures = Object.values(checks).filter(
    (c) => !c.ok && c.error !== "unconfigured",
  );
  const allOk = realFailures.length === 0;

  res.status(allOk ? 200 : 207).json({
    status:      allOk ? "ok" : "degraded",
    service:     "loop-api-server",
    version:     VERSION,
    environment: ENVIRONMENT,
    uptime:      Math.floor((Date.now() - START_MS) / 1000),
    traceId,
    checks,
    checkedAt:   new Date().toISOString(),
  });
});

export default router;
