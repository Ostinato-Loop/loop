import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import type { RoomCategory } from "@workspace/loop-shared-types";
import { getRecommendations } from "../services/recommendations.js";

// NOTE: @supabase/supabase-js createClient is intentionally NOT used here.
// In Cloudflare Workers (nodejs_compat), the JS client accesses private
// properties that changed in v2.49.8 and attempts browser APIs at init time.
// All DB access uses direct REST fetch with explicit headers.

const rooms = new Hono<{ Bindings: CloudflareEnv; Variables: { user: AuthUser } }>();

/**
 * GET /api/rooms
 * Public listing of live and recent rooms. No authentication required.
 *
 * Query params:
 *   category     — filter by room category
 *   community_id — filter to a specific community (V2)
 *   limit        — max rooms to return (default: 20, max: 100)
 *   offset       — pagination offset (default: 0)
 *
 * FIX (2026-06-07): Replaced Supabase JS client with direct REST fetch.
 * The JS client's private property access (.supabaseUrl, .supabaseKey) broke
 * in v2.49.8, causing all queries to fail silently with "Failed to fetch rooms".
 * Direct fetch with explicit apikey/Authorization headers resolves this.
 */
rooms.get("/", async (c) => {
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const limit   = Math.min(Number(c.req.query("limit")  ?? 20), 100);
  const offset  = Math.max(Number(c.req.query("offset") ?? 0),  0);
  const category    = c.req.query("category");
  const communityId = c.req.query("community_id");

  // FIX: use select=* to avoid "column does not exist" errors when the
  // production database is on an earlier migration than the codebase expects.
  // community_id and host_id were added in later migrations; the FK join
  // host:profiles!rooms_host_id_fkey was also removed for the same reason.
  // Tighten the select once all migrations have been applied in production.
  const select = "*";

  const qs = new URLSearchParams({
    select,
    visibility: "eq.public",
    order:      "is_live.desc,audience_count.desc,created_at.desc",
    limit:      String(limit),
    offset:     String(offset),
  });
  if (category)    qs.set("category",     `eq.${category}`);
  if (communityId) qs.set("community_id", `eq.${communityId}`);

  let resp: Response;
  try {
    resp = await fetch(`${sbUrl}/rest/v1/rooms?${qs.toString()}`, {
      method: "GET",
      headers: {
        apikey:         sbKey,
        Authorization:  `Bearer ${sbKey}`,
        "Content-Type": "application/json",
        Accept:         "application/json",
      },
    });
  } catch (err) {
    console.error("[rooms] fetch error:", err);
    return c.json({ error: "Failed to fetch rooms", _debug: String(err) }, 500);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error("[rooms] list error:", resp.status, body.slice(0, 300));
    // Include _debug so operator can diagnose table/FK issues without CF logs
    return c.json({ error: "Failed to fetch rooms", _debug: body.slice(0, 300) }, 500);
  }

  const data = await resp.json() as unknown[];
  return c.json({ rooms: data ?? [], count: (data ?? []).length, offset, limit });
});

/**
 * GET /api/rooms/recommendations
 * Personalised room recommendations for the authenticated user.
 *
 * Query params:
 *   limit   — max rooms to return (default: 10)
 *   lang    — preferred language code (e.g. "en", "ha", "yo")
 */
rooms.get("/recommendations", requireAuth(), async (c) => {
  const user  = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") ?? 10), 50);
  const lang  = c.req.query("lang") ?? "en";

  const result = await getRecommendations(c.env, { userId: user.id, limit, lang });
  return c.json(result);
});

/**
 * POST /api/rooms/:roomId/queue-summary
 * Enqueues an AI summary generation task for a completed room.
 * Called by the host or moderator when a room ends.
 */
rooms.post("/:roomId/queue-summary", requireAuth(), async (c) => {
  const { roomId } = c.req.param();
  const user = c.get("user");

  await c.env.TASK_QUEUE.send({
    type:        "ai_summary",
    roomId,
    requestedBy: user.id,
    timestamp:   Date.now(),
  });

  return c.json({ ok: true, queued: true, roomId });
});

export { rooms };
