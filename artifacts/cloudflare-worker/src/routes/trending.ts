import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import type { TrendingResponse } from "@workspace/loop-shared-types";

const trending = new Hono<{ Bindings: CloudflareEnv; Variables: { user: AuthUser } }>();

/**
 * GET /api/trending
 * Returns trending topics, rooms, and creators.
 *
 * Business logic phases:
 *  Phase 1 (now)    — static placeholder, unblocks frontend integration
 *  Phase 2 (later)  — score from D1 room_participants + reactions counts
 *  Phase 3 (later)  — enrich with civic + sports APIs via service layer
 */
trending.get("/", requireAuth(), async (c) => {
  const cacheKey = "trending:v1";

  // ── KV cache (5 min TTL) ───────────────────────────────────────────
  const cached = await c.env.CACHE.get(cacheKey, "json") as TrendingResponse | null;
  if (cached) {
    return c.json(cached, 200, { "X-Cache": "HIT" });
  }

  // ── TODO Phase 2: query D1 for real scores ─────────────────────────
  // const stmt = c.env.DB.prepare(
  //   `SELECT r.id, r.title, r.category, r.audience_count
  //    FROM rooms r
  //    WHERE r.is_live = 1
  //    ORDER BY r.audience_count DESC
  //    LIMIT 10`
  // );
  // const rooms = await stmt.all();

  const payload: TrendingResponse = {
    rooms: [],
    topics: [
      { label: "AfroTech",     count: 0, category: "tech" },
      { label: "Civic Watch",  count: 0, category: "civic" },
      { label: "Beats & Bars", count: 0, category: "music" },
    ],
    creators: [],
    generatedAt: new Date().toISOString(),
  };

  // Cache for 5 minutes
  await c.env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 300 });

  return c.json(payload, 200, { "X-Cache": "MISS" });
});

export { trending };
