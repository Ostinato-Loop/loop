/**
 * Loop API — Cloudflare Worker entrypoint
 *
 *   React frontend (Vite)
 *     ↓ /api/auth/*       → Termii OTP auth + RALD SSO bridge
 *     ↓ /api/auth/rald-sso → RALD token exchange → Loop JWT
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

// ── Debug: test auth.rald.cloud reachability from Worker ──────────────
// GET /api/debug/sso-verify?token=<rald_sso_token>
// Returns exact status + body from auth.rald.cloud/sso/verify
// Used to diagnose CF-Worker-to-auth-server connectivity issues.
app.get("/api/debug/sso-verify", async (c) => {
  const token = c.req.query("token") ?? "";
  const raldBase = c.env.RALD_AUTH_URL ?? "https://auth.rald.cloud";
  try {
    const res = await fetch(`${raldBase}/sso/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = await res.text();
    return c.json({
      status: res.status,
      ok: res.ok,
      rald_auth_url_used: raldBase,
      response_body: body,
      cf_ray: res.headers.get("cf-ray"),
    });
  } catch (err) {
    return c.json({ error: String(err), rald_auth_url_used: raldBase }, 502);
  }
});

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
  fetch: app.fetch,
  queue: handleQueue,
};
