import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import type { RoomRecommendationsResponse } from "@workspace/loop-shared-types";
import { getRecommendations } from "../services/recommendations.js";

const rooms = new Hono<{ Bindings: CloudflareEnv; Variables: { user: AuthUser } }>();

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
