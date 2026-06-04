/**
 * Loop API — Cloudflare Worker entrypoint
 *
 *   React frontend (Vite)
 *     ↓ /api/auth/*       → RALD SSO bridge (Identity Axiom)
 *     ↓ /api/auth/rald-sso → validates RALD JWT, provisions Supabase user
 *     ↓ /api/auth/silent  → cookie-based silent session check
 *     ↓ /api/*            → Business logic, AI, civic data (Worker)
 *     ↓ Supabase          → DB, Realtime (via service role from Worker)
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "./types/env.js";
import { cors } from "./middleware/cors.js";
import { health } from "./routes/health.js";
import { trending } from "./routes/trending.js";
import { rooms } from "./routes/rooms.js";
import { auth } from "./routes/auth.js";
import { raldSso } from "./routes/rald-sso.js";
import { RoomSession } from "./durable-objects/room-session.js";

export { RoomSession };

const app = new Hono<{ Bindings: CloudflareEnv }>();

app.use("*", cors());

// ── Routes ────────────────────────────────────────────────────────────
app.route("/api/health",         health);
app.route("/api/auth",           auth);
app.route("/api/auth/rald-sso",  raldSso);
app.route("/api/trending",       trending);
app.route("/api/rooms",          rooms);

// ── 404 ───────────────────────────────────────────────────────────────
app.notFound((c) =>
  c.json({ error: "Not found", path: c.req.path }, 404),
);

// ── Error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error("[loop-api]", err);
  return c.json(
    { error: c.env.ENVIRONMENT === "production" ? "Internal error" : err.message },
    500,
  );
});

// ── Queue consumer ────────────────────────────────────────────────────
async function handleQueue(
  batch: MessageBatch<{ type: string; roomId: string }>,
  env: CloudflareEnv,
): Promise<void> {
  for (const msg of batch.messages) {
    console.log("[queue]", msg.body);
    msg.ack();
  }
}

export default {
  async fetch(req: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    // ── FAIL FAST — exit with 503 if critical secrets are absent ─────────
    const missing: string[] = [];
    if (!env.RALD_JWT_SECRET)           missing.push('RALD_JWT_SECRET');
    if (!env.SUPABASE_URL)              missing.push('SUPABASE_URL');
    if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (missing.length) {
      console.error(`[FATAL] loop-api: missing required secrets: ${missing.join(', ')}`);
      return new Response(JSON.stringify({ error: 'Service misconfigured', missing, service: 'loop-api' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    return app.fetch(req, env, ctx);
  },
  queue: handleQueue,
};
