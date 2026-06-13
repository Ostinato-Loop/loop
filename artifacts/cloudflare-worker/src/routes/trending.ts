import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { TrendingResponse, Room } from "@workspace/loop-shared-types";

const trending = new Hono<{ Bindings: CloudflareEnv }>();

/**
 * GET /api/trending
 * Returns trending topics, rooms, and creators.
 *
 * Phase 2 (2026-06-13): Real live rooms queried from Supabase, ordered by
 * audience_count DESC. Only public, is_live=true rooms are returned.
 * Topics and creators remain empty until Phase 3 enrichment.
 *
 * FIX (2026-06-07): requireAuth() removed. Trending is public feed data.
 * Requiring auth blocked the feed page for logged-out previews.
 */
trending.get("/", async (c) => {
  const cacheKey = "trending:v3";

  const cached = await c.env.CACHE.get(cacheKey, "json") as TrendingResponse | null;
  if (cached) {
    return c.json(cached, 200, { "X-Cache": "HIT" });
  }

  let rooms: Room[] = [];
  try {
    const sbUrl = c.env.SUPABASE_URL.replace(/\/$/, "");
    const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;
    const qs = new URLSearchParams({
      select:     "*,host:profiles!rooms_host_id_fkey(username,display_name,avatar_url,is_verified)",
      is_live:    "eq.true",
      visibility: "eq.public",
      order:      "audience_count.desc",
      limit:      "20",
    });
    const res = await fetch(`${sbUrl}/rest/v1/rooms?${qs}`, {
      headers: {
        apikey:        sbKey,
        Authorization: `Bearer ${sbKey}`,
        Accept:        "application/json",
      },
    });
    if (res.ok) {
      rooms = (await res.json() as unknown[]) as Room[];
    }
  } catch {
    // Non-fatal — return empty rooms rather than 500
  }

  const payload: TrendingResponse = {
    rooms,
    topics:      [],
    creators:    [],
    generatedAt: new Date().toISOString(),
  };

  await c.env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 300 });

  return c.json(payload, 200, { "X-Cache": "MISS" });
});

export { trending };
