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

const app = new Hono<{ Bindings: CloudflareEnv }>();

app.use("*", cors());

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

export default app;
