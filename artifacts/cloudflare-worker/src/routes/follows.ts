/**
 * Loop — Relationship Graph: Follows Route
 * Mounted at /api/follows in src/index.ts
 *
 * Routes
 * ──────
 *  POST   /api/follows/:userId          — follow a user (auth required)
 *  DELETE /api/follows/:userId          — unfollow a user (auth required)
 *  GET    /api/follows/me/counts        — my follower + following counts (auth required)
 *  GET    /api/follows/counts/:userId   — any user's public counts
 *  GET    /api/follows/status/:userId   — am I following this user? (auth required)
 *  GET    /api/follows/me/following     — paginated list of users I follow (auth required)
 *  GET    /api/follows/me/followers     — paginated list of my followers (auth required)
 *  GET    /api/follows/suggestions      — "who to follow" recommendations (auth required)
 *
 * FOLLOWS-001 (2026-06-09): Added GET /suggestions endpoint.
 * PUSH-001    (2026-06-10): Fire new-follower push notification via OneSignal on POST follow.
 * LILCKY STUDIO LIMITED · 2026-06-07
 */

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendOneSignalNotification } from "../lib/push-crypto.js";

const follows = new Hono<{
  Bindings:  CloudflareEnv;
  Variables: { user: AuthUser };
}>();

function sb(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ── POST /api/follows/:userId ───────────────────────────────────────── */
follows.post("/:userId", requireAuth(), async (c) => {
  const user     = c.get("user");
  const targetId = c.req.param("userId");

  if (!targetId) return c.json({ error: "userId is required" }, 400);
  if (targetId === user.id) return c.json({ error: "You cannot follow yourself" }, 400);

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("follows").insert({
    follower_id:  user.id,
    following_id: targetId,
  });

  if (error) {
    if (error.code === "23505") {
      return c.json({ ok: true, following: true, message: "Already following" });
    }
    console.error("[follows] insert error:", error.code, error.message);
    return c.json({ error: "Could not follow user" }, 500);
  }

  // ── New-follower push notification (PUSH-001) ──────────────────────
  // Non-blocking: fetch follower profile then notify the followed user.
  // We use c.executionCtx.waitUntil so the Worker doesn't terminate
  // before the notification completes, without delaying the response.
  if (c.env.ONESIGNAL_APP_ID && c.env.ONESIGNAL_REST_API_KEY) {
    c.executionCtx.waitUntil(
      notifyNewFollower({
        supabaseUrl:    c.env.SUPABASE_URL,
        supabaseKey:    c.env.SUPABASE_SERVICE_ROLE_KEY,
        appId:          c.env.ONESIGNAL_APP_ID,
        restApiKey:     c.env.ONESIGNAL_REST_API_KEY,
        followerId:     user.id,
        followedUserId: targetId,
      })
    );
  }

  return c.json({ ok: true, following: true }, 201);
});

/** Fetch follower profile name, then dispatch OneSignal notification to the followed user. */
async function notifyNewFollower(opts: {
  supabaseUrl:    string;
  supabaseKey:    string;
  appId:          string;
  restApiKey:     string;
  followerId:     string;
  followedUserId: string;
}): Promise<void> {
  try {
    const supabase = createClient(opts.supabaseUrl, opts.supabaseKey, {
      auth: { persistSession: false },
    });

    // Fetch follower's display name for the notification body
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", opts.followerId)
      .maybeSingle();

    const name = profile?.display_name || profile?.username || "Someone";

    await sendOneSignalNotification(opts.appId, opts.restApiKey, {
      externalIds: [opts.followedUserId],
      headings:    { en: "New follower" },
      contents:    { en: `${name} started following you` },
      webUrl:      `/profile/${opts.followerId}`,
      icon:        "/icons/icon-192.png",
      // collapse_id: one notification per follower, not a flood if they re-follow
      tag:         `new-follower-${opts.followerId}`,
      data:        { type: "new_follower", followerId: opts.followerId },
    });
  } catch (err) {
    console.error("[follows] new-follower notification failed:", err);
  }
}

/* ── DELETE /api/follows/:userId ─────────────────────────────────────── */
follows.delete("/:userId", requireAuth(), async (c) => {
  const user     = c.get("user");
  const targetId = c.req.param("userId");

  if (!targetId) return c.json({ error: "userId is required" }, 400);

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id",  user.id)
    .eq("following_id", targetId);

  if (error) {
    console.error("[follows] delete error:", error.code, error.message);
    return c.json({ error: "Could not unfollow user" }, 500);
  }

  return c.json({ ok: true, following: false });
});

/* ── GET /api/follows/me/counts ──────────────────────────────────────── */
follows.get("/me/counts", requireAuth(), async (c) => {
  const user     = c.get("user");
  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const [followersRes, followingRes] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id",  user.id),
  ]);

  return c.json({
    user_id:         user.id,
    followers_count: followersRes.count ?? 0,
    following_count: followingRes.count ?? 0,
  });
});

/* ── GET /api/follows/counts/:userId ─────────────────────────────────── */
follows.get("/counts/:userId", async (c) => {
  const targetId = c.req.param("userId");
  if (!targetId) return c.json({ error: "userId is required" }, 400);

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const [followersRes, followingRes] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", targetId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id",  targetId),
  ]);

  return c.json({
    user_id:         targetId,
    followers_count: followersRes.count ?? 0,
    following_count: followingRes.count ?? 0,
  });
});

/* ── GET /api/follows/status/:userId ─────────────────────────────────── */
follows.get("/status/:userId", requireAuth(), async (c) => {
  const user     = c.get("user");
  const targetId = c.req.param("userId");
  if (!targetId) return c.json({ error: "userId is required" }, 400);

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id",  user.id)
    .eq("following_id", targetId)
    .maybeSingle();

  if (error) {
    console.error("[follows] status error:", error.code, error.message);
    return c.json({ error: "Could not check follow status" }, 500);
  }

  return c.json({ following: data !== null });
});

/* ── GET /api/follows/me/following ───────────────────────────────────── */
follows.get("/me/following", requireAuth(), async (c) => {
  const user   = c.get("user");
  const limit  = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const offset = Number(c.req.query("offset") ?? 0);

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from("follows")
    .select(`
      following_id,
      created_at,
      profiles!follows_following_id_fkey(id, username, display_name, avatar_url, is_verified)
    `)
    .eq("follower_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[follows] following list error:", error.code, error.message);
    return c.json({ error: "Could not load following list" }, 500);
  }

  return c.json({ following: data ?? [], count: data?.length ?? 0 });
});

/* ── GET /api/follows/me/followers ───────────────────────────────────── */
follows.get("/me/followers", requireAuth(), async (c) => {
  const user   = c.get("user");
  const limit  = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const offset = Number(c.req.query("offset") ?? 0);

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from("follows")
    .select(`
      follower_id,
      created_at,
      profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, is_verified)
    `)
    .eq("following_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[follows] followers list error:", error.code, error.message);
    return c.json({ error: "Could not load followers list" }, 500);
  }

  return c.json({ followers: data ?? [], count: data?.length ?? 0 });
});

/* ── GET /api/follows/suggestions ────────────────────────────────────── */
/**
 * Returns up to 8 "Who to Follow" suggestions for the authenticated user.
 *
 * FOLLOWS-001 (2026-06-09)
 *
 * Algorithm:
 *   1. Fetch the IDs of users already followed by current user (max 500).
 *   2. Query profiles NOT in that set, excluding self.
 *   3. Priority order:
 *      a. Verified creators (is_verified = true)
 *      b. Same country as current user
 *      c. Most followers (follower_count DESC)
 *   4. Return max 8 results for the "Who to Follow" strip.
 *
 * Cached in KV for 5 minutes per user to avoid expensive DB queries on every feed load.
 */
follows.get("/suggestions", requireAuth(), async (c) => {
  const user     = c.get("user");
  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const cacheKey = `follows:suggestions:${user.id}`;

  // KV cache — serve fast on repeat loads
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    return c.json(JSON.parse(cached));
  }

  // Step 1: IDs already followed by current user
  const { data: alreadyFollowing } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", user.id)
    .limit(500);

  const excludeIds = new Set<string>([
    user.id,
    ...(alreadyFollowing ?? []).map((r: { following_id: string }) => r.following_id),
  ]);

  // Step 2: Fetch candidate profiles (verified creators first, then by follower count)
  const { data: candidates } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, is_verified, is_creator, follower_count, country, bio")
    .eq("onboarded", true)
    .order("is_verified",    { ascending: false })
    .order("follower_count", { ascending: false })
    .limit(50);

  // Step 3: Filter out already-followed and self, then score
  const filtered = (candidates ?? [])
    .filter((p: { id: string }) => !excludeIds.has(p.id))
    .map((p: {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      is_verified: boolean;
      is_creator: boolean;
      follower_count: number;
      country: string | null;
      bio: string | null;
    }) => ({
      id:             p.id,
      username:       p.username,
      display_name:   p.display_name,
      avatar_url:     p.avatar_url,
      is_verified:    p.is_verified,
      is_creator:     p.is_creator,
      follower_count: p.follower_count ?? 0,
      bio:            p.bio,
      _score:
        (p.is_verified    ? 100 : 0) +
        (p.is_creator     ?  50 : 0) +
        (p.country === (user as unknown as { country?: string }).country ? 30 : 0) +
        Math.min(p.follower_count ?? 0, 20),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 8)
    .map(({ _score: _, ...rest }) => rest);

  const result = { suggestions: filtered };

  await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });

  return c.json(result);
});

export { follows };
