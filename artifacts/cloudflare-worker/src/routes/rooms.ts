import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import type { RoomRecommendationsResponse } from "@workspace/loop-shared-types";
import { getRecommendations } from "../services/recommendations.js";

const rooms = new Hono<{ Bindings: CloudflareEnv; Variables: { user: AuthUser } }>();

/**
 * GET /api/rooms
 * Public listing of live and recent rooms. No authentication required.
 *
 * Query params:
 *   category — filter by room category
 *   limit    — max rooms to return (default: 20, max: 100)
 *   offset   — pagination offset (default: 0)
 */
rooms.get("/", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const limit  = Math.min(Number(c.req.query("limit")  ?? 20), 100);
  const offset = Math.max(Number(c.req.query("offset") ?? 0),  0);
  const category = c.req.query("category");

  let q = supabase
    .from("rooms")
    .select(
      "id, title, description, category, is_live, audience_count, cover_url, visibility, language, created_at, updated_at, " +
      "host:profiles!rooms_host_id_fkey(id, username, display_name, avatar_url, is_verified)"
    )
    .eq("visibility", "public")
    .order("is_live",        { ascending: false })
    .order("audience_count", { ascending: false })
    .order("created_at",     { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) q = q.eq("category", category as "sports" | "civic" | "music" | "entertainment" | "general" | "news");

  const { data, error } = await q;
  if (error) {
    console.error("[rooms] list error:", error.code, error.message);
    return c.json({ error: "Failed to fetch rooms" }, 500);
  }

  return c.json({
    rooms:  data ?? [],
    count:  (data ?? []).length,
    offset,
    limit,
  });
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
  const user = c.get("user");
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
    type: "ai_summary",
    roomId,
    requestedBy: user.id,
    timestamp: Date.now(),
  });

  return c.json({ ok: true, queued: true, roomId });
});

export { rooms };
