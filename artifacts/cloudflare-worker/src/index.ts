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
