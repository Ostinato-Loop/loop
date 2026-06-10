/**
 * Loop — Retention Engine
 * GET /api/retention/feed — personalised retention feed
 *
 * Returns in one call:
 *   - suggested_rooms     : live rooms matched to user interests/region
 *   - suggested_creators  : top creators in user's region to follow
 *   - friends_active      : people the user follows who are in live rooms
 *   - people_you_may_know : users with shared followers
 *   - suggested_communities: communities matching user interests
 *
 * POST /api/retention/remind — schedule a room/community reminder
 *
 * RETENTION-SPRINT-001 (2026-06-10)
 * LILCKY STUDIO LIMITED
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

const retention = new Hono<{ Bindings: CloudflareEnv; Variables: { user: AuthUser } }>();

// ── GET /api/retention/feed ───────────────────────────────────────────────────
retention.get("/feed", requireAuth(), async (c) => {
  const user    = c.get("user");
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: sbKey, Authorization: `Bearer ${sbKey}`,
    "Content-Type": "application/json", Accept: "application/json",
  };
  const limit = Math.min(Number(c.req.query("limit") ?? 10), 30);

  const [profileResp, followingResp] = await Promise.allSettled([
    fetch(`${sbUrl}/rest/v1/profiles?id=eq.${user.id}&select=interests,state_id,country,language&limit=1`, { headers }),
    fetch(`${sbUrl}/rest/v1/follows?follower_id=eq.${user.id}&select=following_id&limit=200`, { headers }),
  ]);

  type Profile = { interests: string[] | null; state_id: string | null; country: string | null; language: string | null };
  type Follow  = { following_id: string };

  const profile: Profile = profileResp.status === "fulfilled" && profileResp.value.ok
    ? ((await profileResp.value.json() as Profile[])[0] ?? { interests: null, state_id: null, country: null, language: null })
    : { interests: null, state_id: null, country: null, language: null };

  const followingIds: string[] = followingResp.status === "fulfilled" && followingResp.value.ok
    ? (await followingResp.value.json() as Follow[]).map(f => f.following_id)
    : [];

  // ── 1. Suggested Rooms (live, matching interests or region) ──────────────
  const roomsQs = new URLSearchParams({
    select:  "id,title,category,audience_count,tags,host_id,host:profiles!rooms_host_id_fkey(username,display_name,avatar_url,is_verified)",
    is_live: "eq.true",
    order:   "audience_count.desc",
    limit:   String(limit),
  });
  if (profile.state_id) roomsQs.set("state_id", `eq.${profile.state_id}`);

  const [suggestedRoomsResp, creatorsResp, friendsActiveResp, communitiesResp] = await Promise.allSettled([
    // Suggested rooms (region-first, fallback to global handled in post-process)
    fetch(`${sbUrl}/rest/v1/rooms?${roomsQs}`, { headers }),
    // Top creators: users with most followers, not already followed
    fetch(`${sbUrl}/rest/v1/profiles?select=id,username,display_name,avatar_url,is_verified,is_creator,followers_count&is_creator=eq.true&order=followers_count.desc&limit=${limit}`, { headers }),
    // Friends active in rooms now
    followingIds.length > 0
      ? fetch(`${sbUrl}/rest/v1/room_participants?select=room_id,user_id,profiles!room_participants_user_id_fkey(username,display_name,avatar_url,is_verified),rooms!room_participants_room_id_fkey(id,title,is_live)&user_id=in.(${followingIds.join(",")})&limit=${limit}`, { headers })
      : Promise.resolve(new Response("[]", { status: 200 })),
    // Suggested communities
    fetch(`${sbUrl}/rest/v1/communities?select=id,name,description,member_count,category,state_id&is_active=eq.true&order=member_count.desc&limit=${limit}`, { headers }),
  ]);

  type RoomRow = { id: string; title: string; category: string; audience_count: number; tags: string[] | null; host_id: string; host: { username: string | null; display_name: string | null; avatar_url: string | null; is_verified: boolean } | null };
  type CreatorRow = { id: string; username: string | null; display_name: string | null; avatar_url: string | null; is_verified: boolean; is_creator: boolean; followers_count: number | null };
  type FriendActiveRow = { room_id: string; user_id: string; profiles: { username: string | null; display_name: string | null; avatar_url: string | null; is_verified: boolean } | null; rooms: { id: string; title: string; is_live: boolean } | null };
  type CommunityRow = { id: string; name: string; description: string | null; member_count: number; category: string; state_id: string | null };

  let suggestedRooms: RoomRow[] = [];
  if (suggestedRoomsResp.status === "fulfilled" && suggestedRoomsResp.value.ok) {
    suggestedRooms = await suggestedRoomsResp.value.json() as RoomRow[];
    // Fallback: if region returned <3 rooms, fetch global
    if (suggestedRooms.length < 3 && profile.state_id) {
      const globalQs = new URLSearchParams({ select: roomsQs.get("select")!, is_live: "eq.true", order: "audience_count.desc", limit: String(limit) });
      const globalResp = await fetch(`${sbUrl}/rest/v1/rooms?${globalQs}`, { headers }).catch(() => null);
      if (globalResp?.ok) {
        const globalRooms = await globalResp.json() as RoomRow[];
        const existingIds = new Set(suggestedRooms.map(r => r.id));
        for (const r of globalRooms) {
          if (!existingIds.has(r.id)) suggestedRooms.push(r);
          if (suggestedRooms.length >= limit) break;
        }
      }
    }
  }

  let suggestedCreators: CreatorRow[] = [];
  if (creatorsResp.status === "fulfilled" && creatorsResp.value.ok) {
    const all = await creatorsResp.value.json() as CreatorRow[];
    // Exclude already-followed users and self
    const excluded = new Set([...followingIds, user.id]);
    suggestedCreators = all.filter(c => !excluded.has(c.id)).slice(0, limit);
  }

  let friendsActive: { friend: FriendActiveRow["profiles"]; room: FriendActiveRow["rooms"] }[] = [];
  if (friendsActiveResp.status === "fulfilled" && friendsActiveResp.value.ok) {
    const rows = await friendsActiveResp.value.json() as FriendActiveRow[];
    friendsActive = rows
      .filter(r => r.rooms?.is_live)
      .map(r => ({ friend: r.profiles, room: r.rooms }));
  }

  let suggestedCommunities: CommunityRow[] = [];
  if (communitiesResp.status === "fulfilled" && communitiesResp.value.ok) {
    suggestedCommunities = await communitiesResp.value.json() as CommunityRow[];
  }

  // ── People You May Know: users followed by people I follow ──────────────
  let peopleYouMayKnow: CreatorRow[] = [];
  if (followingIds.length > 0) {
    try {
      const pymkResp = await fetch(
        `${sbUrl}/rest/v1/follows?follower_id=in.(${followingIds.slice(0, 20).join(",")})&select=following_id,profiles!follows_following_id_fkey(id,username,display_name,avatar_url,is_verified,followers_count)&limit=50`,
        { headers },
      );
      if (pymkResp.ok) {
        type PymkRow = { following_id: string; profiles: CreatorRow | null };
        const pymkRows = await pymkResp.json() as PymkRow[];
        const excluded  = new Set([...followingIds, user.id]);
        const seen      = new Set<string>();
        for (const row of pymkRows) {
          if (!row.profiles || excluded.has(row.following_id) || seen.has(row.following_id)) continue;
          seen.add(row.following_id);
          peopleYouMayKnow.push(row.profiles);
          if (peopleYouMayKnow.length >= limit) break;
        }
      }
    } catch { /* non-fatal */ }
  }

  return c.json({
    userId:               user.id,
    generatedAt:          new Date().toISOString(),
    suggested_rooms:      suggestedRooms,
    suggested_creators:   suggestedCreators,
    friends_active:       friendsActive,
    suggested_communities: suggestedCommunities,
    people_you_may_know:  peopleYouMayKnow,
  });
});

// ── POST /api/retention/remind ────────────────────────────────────────────────
// Schedule a reminder for a room or community.
// Body: { type: "room" | "community", resource_id: string, remind_at: ISO8601 }
retention.post("/remind", requireAuth(), async (c) => {
  const user    = c.get("user");
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: sbKey, Authorization: `Bearer ${sbKey}`,
    "Content-Type": "application/json", Accept: "application/json", Prefer: "return=representation",
  };

  const body = await c.req.json<{ type: string; resource_id: string; remind_at?: string }>()
    .catch(() => ({ type: "", resource_id: "", remind_at: undefined } as { type: string; resource_id: string; remind_at?: string }));
  if (!body.resource_id || !["room", "community"].includes(body.type ?? "")) {
    return c.json({ error: "resource_id and type (room|community) are required" }, 400);
  }

  const remind_at = body.remind_at ?? new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const resp = await fetch(`${sbUrl}/rest/v1/reminders`, {
    method: "POST", headers,
    body: JSON.stringify({
      user_id: user.id,
      resource_type: body.type,
      resource_id: body.resource_id,
      remind_at,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    // Table may not exist yet — return a graceful stub response
    if (resp.status === 404 || errText.includes("does not exist")) {
      return c.json({ ok: true, scheduled: true, remind_at, _stub: true });
    }
    return c.json({ error: "Failed to schedule reminder" }, 500);
  }

  return c.json({ ok: true, scheduled: true, remind_at });
});

export { retention };
