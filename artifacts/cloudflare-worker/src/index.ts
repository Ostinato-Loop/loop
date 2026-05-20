/**
 * Loop API — Cloudflare Worker entrypoint
 *
 *   React frontend (Vite)
 *     ↓ /api/auth/*  → Termii OTP auth (replaces Supabase SMS)
 *     ↓ /api/*       → Business logic, AI, civic data (Worker)
 *     ↓ Supabase     → DB, Realtime (via service role from Worker)
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "./types/env.js";
import { cors } from "./middleware/cors.js";
import { health } from "./routes/health.js";
import { trending } from "./routes/trending.js";
import { rooms } from "./routes/rooms.js";
import { auth } from "./routes/auth.js";
import { RoomSession } from "./durable-objects/room-session.js";

const app = new Hono<{ Bindings: CloudflareEnv }>();

app.use("*", cors());

// ── Routes ────────────────────────────────────────────────────────────
app.route("/api/health",  health);
app.route("/api/auth",    auth);
app.route("/api/trending", trending);
app.route("/api/rooms",   rooms);

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
  batch: MessageBatch<{ type: string; roomId: string; requestedBy: string; timestamp: number }>,
  env: CloudflareEnv,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      if (msg.body.type === "ai_summary") {
        console.log("[queue] ai_summary for room", msg.body.roomId);
      }
      msg.ack();
    } catch (e) {
      console.error("[queue] failed", msg.body, e);
      msg.retry();
    }
  }
}

export default { fetch: app.fetch, queue: handleQueue };
export { RoomSession };
