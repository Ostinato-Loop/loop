import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { TrendingResponse } from "@workspace/loop-shared-types";

const trending = new Hono<{ Bindings: CloudflareEnv }>();

/**
 * GET /api/trending
 * Returns trending topics, rooms, and creators.
 *
 * Business logic phases:
 *  Phase 1 (now)    — empty arrays. No fake topics, rooms, or creators.
 *                     Honest response: if there is nothing real, nothing is returned.
 *  Phase 2 (later)  — score from D1 room_participants + reactions counts
 *  Phase 3 (later)  — enrich with civic + sports APIs via service layer
 *
 * Trust rule: hardcoded topic labels (e.g. "AfroTech", "Civic Watch") are
 * fake data. They inflate perceived activity. Phase 1 returns empty arrays.
 *
 * FIX (2026-06-07): requireAuth() removed. Trending is public feed data.
 * Requiring auth blocked the feed page for logged-out previews and caused
 * "Unauthorized" on every unauthenticated feed load.
 */
trending.get("/", async (c) => {
  const cacheKey = "trending:v2";

  // ── KV cache (5 min TTL) ───────────────────────────────────────────
  const cached = await c.env.CACHE.get(cacheKey, "json") as TrendingResponse | null;
  if (cached) {
    return c.json(cached, 200, { "X-Cache": "HIT" });
  }

  // ── Phase 1: honest empty response ────────────────────────────────
  // Phase 2 will query D1 for real room scores:
  // const stmt = c.env.DB.prepare(
  //   `SELECT r.id, r.title, r.category, r.audience_count
  //    FROM rooms r WHERE r.is_live = 1
  //    ORDER BY r.audience_count DESC LIMIT 10`
  // );
  // const rooms = await stmt.all();

  const payload: TrendingResponse = {
    rooms:       [],
    topics:      [],
    creators:    [],
    generatedAt: new Date().toISOString(),
  };

  await c.env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 300 });

  return c.json(payload, 200, { "X-Cache": "MISS" });
});

export { trending };
