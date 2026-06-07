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
 *
 * LILCKY STUDIO LIMITED · 2026-06-07
 */

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

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
    // Unique violation = already following → treat as success
    if (error.code === "23505") {
      return c.json({ ok: true, following: true, message: "Already following" });
    }
    console.error("[follows] insert error:", error.code, error.message);
    return c.json({ error: "Could not follow user" }, 500);
  }

  return c.json({ ok: true, following: true }, 201);
});

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

export { follows };
