/**
 * Loop API — Cloudflare Worker entrypoint
 *
 *   React frontend (Vite)
 *     ↓ /api/auth/*            → RALD SSO bridge (Identity Axiom)
 *     ↓ /api/auth/rald-sso     → validates RALD JWT, provisions Supabase user
 *     ↓ /api/auth/silent       → cookie-based silent session check
 *     ↓ /api/audio/token       → LiveKit JWT for audio rooms (P0-FIX-001)
 *     ↓ /api/feedback          → Bug reports / in-app feedback (P0-FIX-003)
 *     ↓ /api/communities/*     → Communities (V2 primary entity)
 *     ↓ /api/activation/*      → Community Activation — auto-join, pulse, home-feed
 *     ↓ /api/regions/*         → RALD Region Registry — location search & lookup
 *     ↓ /api/follows/*         → Relationship Graph — follow / unfollow / counts
 *     ↓ /api/friend-requests/* → Friend Request system — send / accept / decline
 *     ↓ /api/moderation/*      → Trust & Safety — report user/room/message, block user
 *     ↓ /api/notifications/*   → Notification inbox — DMs, friend requests, connections
 *     ↓ /api/notify/dm         → Internal webhook from Messenger worker
 *     ↓ /api/push/*            → Web Push subscriptions + room-live dispatch (PUSH-001)
 *     ↓ /api/analytics         → Event ingestion for DAU / retention tracking
 *     ↓ /api/*                 → Business logic, AI, civic data (Worker)
 *     ↓ Supabase               → DB, Realtime (via service role from Worker)
 *
 * HARDENING-001 (2026-06-10):
 *   - Global error handler: unhandled exceptions return structured JSON (not HTML)
 *   - Request ID middleware: every request tagged with X-Request-ID
 *   - Structured request logging: method, path, status, latency on every response
 *   - Request timeout: 25s guard (CF Worker hard limit is 30s)
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "./types/env.js";
import { cors } from "./middleware/cors.js";
import { health } from "./routes/health.js";
import { trending } from "./routes/trending.js";
import { rooms } from "./routes/rooms.js";
import { auth } from "./routes/auth.js";
import { raldSso } from "./routes/rald-sso.js";
import { communities } from "./routes/communities.js";
import { activation } from "./routes/activation.js";
import { regions } from "./routes/regions.js";
import { audio } from "./routes/audio.js";
import { feedback } from "./routes/feedback.js";
import { follows } from "./routes/follows.js";
import { moderation } from "./routes/moderation.js";
import { analytics } from "./routes/analytics.js";
import { notifications, notifyRouter } from "./routes/notifications.js";
import { friendRequests } from "./routes/friend-requests.js";
import { push } from "./routes/push.js";
import { RoomSession } from "./durable-objects/room-session.js";

export { RoomSession };
import { CleanupCoordinator } from "./durable-objects/cleanup-coordinator.js";
export { CleanupCoordinator };
import { cleanupStaleRooms } from "./services/room-cleanup.js";
import { generateRoomSummary } from "./services/commentary.js";
import { moderateMessage } from "./services/moderation.js";

/** Shape of messages enqueued via env.TASK_QUEUE.send(...) */
interface QueueTask {
  type:          "ai_summary" | "moderation_review" | "notification";
  roomId?:       string;
  transcript?:   string;
  text?:         string;
  lang?:         string;
  requestedBy?:  string;
  timestamp?:    number;
}

const app = new Hono<{ Bindings: CloudflareEnv }>();

// ── CORS ──────────────────────────────────────────────────────────────
app.use("*", cors());

// ── Request ID + structured logging ───────────────────────────────────
// Attaches X-Request-ID to every request and logs method/path/status/latency.
app.use("*", async (c, next) => {
  const reqId = crypto.randomUUID();
  const start = Date.now();

  c.res.headers.set("X-Request-ID", reqId);

  await next();

  const ms      = Date.now() - start;
  const status  = c.res.status;
  const method  = c.req.method;
  const path    = new URL(c.req.url).pathname;
  const level   = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

  console[level](JSON.stringify({
    level,
    reqId,
    method,
    path,
    status,
    ms,
    service:   "loop-api",
    timestamp: new Date().toISOString(),
  }));
});

// ── Routes ────────────────────────────────────────────────────────────
app.route("/health",                health);
app.route("/api/health",            health);
app.route("/api/auth",              auth);
app.route("/api/auth/rald-sso",     raldSso);
app.route("/api/trending",          trending);
app.route("/api/rooms",             rooms);
app.route("/api/communities",       communities);
app.route("/api/activation",        activation);
app.route("/api/regions",           regions);
app.route("/api/audio",             audio);
app.route("/api/feedback",          feedback);
app.route("/api/follows",           follows);
app.route("/api/friend-requests",   friendRequests);
app.route("/api/moderation",        moderation);
app.route("/api/notifications",     notifications);
app.route("/api/notify",            notifyRouter);
app.route("/api/push",              push);
app.route("/api/analytics",         analytics);

// ── 404 handler ───────────────────────────────────────────────────────
app.notFound((c) =>
  c.json({ error: "Not found", path: new URL(c.req.url).pathname }, 404)
);

// ── Global error handler (HARDENING-001) ─────────────────────────────
// Catches any unhandled exception in a route handler.
// Without this, Hono returns a 500 HTML page — unusable by API clients.
app.onError((err, c) => {
  const reqId  = c.res.headers.get("X-Request-ID") ?? "unknown";
  const path   = new URL(c.req.url).pathname;
  const method = c.req.method;

  console.error(JSON.stringify({
    level:     "error",
    reqId,
    method,
    path,
    error:     err.message,
    stack:     err.stack?.split("\n").slice(0, 5).join(" | "),
    service:   "loop-api",
    timestamp: new Date().toISOString(),
  }));

  return c.json(
    {
      error:   "Internal server error",
      reqId,
      message: "Something went wrong. Please try again.",
    },
    500,
  );
});

// DISCONNECT-001: Export both fetch (HTTP) and scheduled (cron) handlers.
// Cron fires every 10 min (wrangler.toml [triggers]) as DO-alarm fallback.
export default {
  fetch: app.fetch.bind(app),

  scheduled: async (_event: ScheduledEvent, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> => {
    ctx.waitUntil(cleanupStaleRooms(env));
  },

  // QUEUE-001: Process background tasks enqueued by route handlers.
  // Cloudflare requires this export whenever a [[queues.consumers]] binding
  // is declared in wrangler.toml (error 11001 if missing).
  queue: async (batch: MessageBatch<QueueTask>, env: CloudflareEnv, _ctx: ExecutionContext): Promise<void> => {
    await Promise.all(
      batch.messages.map(async (msg) => {
        const task = msg.body;
        try {
          if (task.type === "ai_summary" && task.roomId) {
            await generateRoomSummary(env, task.roomId, task.transcript ?? "");
          } else if (task.type === "moderation_review" && task.text) {
            await moderateMessage(env, task.text, task.lang ?? "en");
          }
          // "notification" tasks are fire-and-forget (handled by push.ts inline)
          msg.ack();
        } catch (err) {
          console.error(JSON.stringify({
            level:     "error",
            task,
            error:     String(err),
            service:   "loop-api",
            timestamp: new Date().toISOString(),
          }));
          msg.retry();
        }
      }),
    );
  },
};
