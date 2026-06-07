/**
 * Loop V2 — Community Activation Route
 *
 * Hono router mounted at /api/activation in src/index.ts.
 * Uses Supabase service-role REST. All region data from profiles.
 *
 * Sprint: V2 Community Activation (2026-06-07)
 * Schema: supabase/migrations/008_community_activation.sql
 *
 * Routes
 * ──────
 *  POST /api/activation/auto-join          — auto-join regional communities
 *  GET  /api/activation/first-room         — first room cascade (never empty)
 *  GET  /api/activation/pulse/:communityId — daily community pulse
 *  GET  /api/activation/recommendations    — 5+ community recommendations
 *  GET  /api/activation/home-feed          — regional home feed
 *  GET  /api/activation/momentum/:userId   — creator promotion ladder
 *  POST /api/activation/badges/:communityId — award leader badge
 *  GET  /api/activation/badges/:communityId — list community badges
 *  POST /api/activation/events             — record activation event
 */

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

const activation = new Hono<{
  Bindings:  CloudflareEnv;
  Variables: { user: AuthUser };
}>();

// ── Supabase REST helpers ─────────────────────────────────────────────

function sbClient(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false } });
}

type SbClient = ReturnType<typeof sbClient>;

function sbGet(sb: SbClient, path: string): Promise<Response> {
  const base = (sb as unknown as { supabaseUrl: string }).supabaseUrl;
  return fetch(`${base}${path}`, {
    method: "GET",
    headers: {
      apikey:         (sb as unknown as { supabaseKey: string }).supabaseKey,
      Authorization:  `Bearer ${(sb as unknown as { supabaseKey: string }).supabaseKey}`,
      "Content-Type": "application/json",
      Accept:         "application/json",
    },
  });
}

function sbPost(sb: SbClient, path: string, body: unknown, prefer = "return=representation"): Promise<Response> {
  const base = (sb as unknown as { supabaseUrl: string }).supabaseUrl;
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      apikey:         (sb as unknown as { supabaseKey: string }).supabaseKey,
      Authorization:  `Bearer ${(sb as unknown as { supabaseKey: string }).supabaseKey}`,
      "Content-Type": "application/json",
      Accept:         "application/json",
      Prefer:         prefer,
    },
    body: JSON.stringify(body),
  });
}

function traceId(c: { req: { header(name: string): string | undefined } }): string {
  return (
    c.req.header("X-Trace-Id") ??
    c.req.header("X-Request-Id") ??
    crypto.randomUUID()
  );
}

const BADGE_TYPES = ["reporter", "dj", "host", "volunteer", "artist"] as const;
type BadgeType = typeof BADGE_TYPES[number];

const PROMOTION_LEVELS = ["community", "lcda", "lga", "state", "national"] as const;
type PromotionLevel = typeof PROMOTION_LEVELS[number];

/** Cascade levels for first-room experience */
const CASCADE_LEVELS: Array<{ scope: PromotionLevel; label: string }> = [
  { scope: "lcda",     label: "Your Area" },
  { scope: "lga",      label: "Your LGA" },
  { scope: "state",    label: "Your State" },
  { scope: "national", label: "Nigeria" },
];


// ══════════════════════════════════════════════════════════════════════
// POST /api/activation/auto-join
// Auto-join LCDA + LGA + State + Interest communities for a user.
// Reads the user's region from profiles. No region = interest-only join.
// ══════════════════════════════════════════════════════════════════════

activation.post("/auto-join", requireAuth(), async (c) => {
  const user = c.get("user");
  const sb   = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid  = traceId(c);

  // Fetch user's region from profile
  const profileResp = await sbGet(sb,
    `/rest/v1/profiles?id=eq.${user.id}&select=country,state_id,lga_id,lcda_id,interests&limit=1`);
  if (!profileResp.ok) return c.json({ error: "Failed to fetch profile" }, 500);
  const profileRows = await profileResp.json() as {
    country?: string; state_id?: string; lga_id?: string; lcda_id?: string; interests?: string[];
  }[];
  const profile = profileRows[0] ?? {};

  // Allow body to override region (for onboarding before profile is saved)
  type AutoJoinBody = {
    country?: string; state_id?: string; lga_id?: string; lcda_id?: string; interests?: string[];
  };
  const body: AutoJoinBody = await c.req.json<AutoJoinBody>().catch((): AutoJoinBody => ({}));

  const country  = (body.country  ?? profile.country  ?? "NG").toUpperCase();
  const stateId  = body.state_id  ?? profile.state_id  ?? null;
  const lgaId    = body.lga_id    ?? profile.lga_id    ?? null;
  const lcdaId   = body.lcda_id   ?? profile.lcda_id   ?? null;
  const interests = body.interests ?? profile.interests ?? [];

  // Call Supabase RPC for regional auto-join
  const rpcResp = await sbPost(sb, "/rest/v1/rpc/auto_join_regional_communities", {
    p_user_id:  user.id,
    p_country:  country,
    p_state_id: stateId,
    p_lga_id:   lgaId,
    p_lcda_id:  lcdaId,
  });

  if (!rpcResp.ok) {
    const err = await rpcResp.text().catch(() => "");
    console.error(`[activation/auto-join] rpc error ${rpcResp.status} trace=${tid}`, err.slice(0, 200));
    return c.json({ error: "Failed to auto-join regional communities" }, 500);
  }

  const rpcResult = await rpcResp.json() as {
    joined: string[]; skipped: string[]; total_joined: number;
  };

  // Also join interest communities if interests provided
  const interestJoined: string[] = [];
  if (interests.length > 0) {
    const tagList = `{${interests.slice(0, 5).map((t: string) => `"${t}"`).join(",")}}`;
    const interestResp = await sbGet(sb,
      `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false&is_suspended=eq.false` +
      `&type=eq.interest&interest_tags=cs.${encodeURIComponent(tagList)}` +
      `&select=id&order=member_count.desc&limit=5`);

    if (interestResp.ok) {
      const interestComms = await interestResp.json() as { id: string }[];
      for (const comm of interestComms) {
        const joinResp = await sbPost(sb, "/rest/v1/community_members", {
          community_id: comm.id,
          user_id:      user.id,
          role:         "member",
        }, "return=minimal");
        if (joinResp.ok || joinResp.status === 409) {
          if (joinResp.ok) interestJoined.push(comm.id);
        }
      }
    }
  }

  console.log("[activation/auto-join]", JSON.stringify({
    userId: user.id, country, stateId, lgaId, lcdaId,
    regionalJoined: rpcResult.total_joined,
    interestJoined: interestJoined.length,
    trace: tid, timestamp: new Date().toISOString(),
  }));

  return c.json({
    ok:               true,
    regional_joined:  rpcResult.joined,
    interest_joined:  interestJoined,
    skipped:          rpcResult.skipped,
    total_joined:     rpcResult.total_joined + interestJoined.length,
  });
});


// ══════════════════════════════════════════════════════════════════════
// GET /api/activation/first-room
// Cascade: LCDA → LGA → State → National
// Never returns empty. Always finds rooms for a new user.
// ══════════════════════════════════════════════════════════════════════

activation.get("/first-room", async (c) => {
  const sb   = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid  = traceId(c);
  const limit = Math.min(Number(c.req.query("limit") ?? 10), 30);

  // Geo detection from CF headers (no auth required)
  const cfCountry = c.req.header("CF-IPCountry") ?? "NG";
  const cfRegion  = c.req.header("CF-IPRegion")  ?? "";

  // Also check if authenticated user has profile region
  let profileRegion: { state_id?: string; lga_id?: string; lcda_id?: string } = {};
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token   = authHeader.slice(7);
      const parts   = token.split(".");
      const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
      const userId  = (payload.id ?? payload.sub) as string | undefined;
      if (userId) {
        const pResp = await sbGet(sb,
          `/rest/v1/profiles?id=eq.${userId}&select=state_id,lga_id,lcda_id&limit=1`);
        if (pResp.ok) {
          const rows = await pResp.json() as typeof profileRegion[];
          profileRegion = rows[0] ?? {};
        }
      }
    } catch { /* silent */ }
  }

  const COMMUNITY_SELECT =
    `id,title,description,category,community_id,is_live,audience_count,cover_url,visibility,language,created_at,` +
    `host:profiles!rooms_host_id_fkey(id,username,display_name,avatar_url,is_verified)`;

  let foundRooms: unknown[] = [];
  let cascadeLevel = "national";
  let cascadeLabel = "Nigeria";

  // Build region IDs for cascade
  const country  = cfCountry.toUpperCase();
  const statePart = profileRegion.state_id ?? cfRegion.replace(/\s+state$/i, "").replace(/\s+/g, "-").slice(0, 3).toUpperCase();

  const regions = [
    profileRegion.lcda_id  ? `${country}-${statePart}-${profileRegion.lcda_id.toUpperCase()}` : null,
    profileRegion.lga_id   ? `${country}-${statePart}-${profileRegion.lga_id.toUpperCase()}`  : null,
    statePart              ? `${country}-${statePart}` : null,
    null, // national fallback — no region filter
  ];

  const labels = ["Your Area", "Your LGA", "Your State", "Nigeria"];

  for (let i = 0; i < regions.length; i++) {
    const regionId = regions[i];
    cascadeLabel   = labels[i]!;

    // Build room query — filter by communities in this region
    let roomPath: string;

    if (regionId) {
      // First get community IDs in this region
      const commResp = await sbGet(sb,
        `/rest/v1/communities?region_id=eq.${encodeURIComponent(regionId)}` +
        `&visibility=eq.public&is_deleted=eq.false&select=id&limit=20`);

      if (commResp.ok) {
        const comms = await commResp.json() as { id: string }[];
        if (comms.length > 0) {
          const commIds = comms.map(c => c.id).join(",");
          roomPath =
            `/rest/v1/rooms?community_id=in.(${commIds})&visibility=eq.public` +
            `&select=${COMMUNITY_SELECT}` +
            `&order=is_live.desc,audience_count.desc,created_at.desc&limit=${limit}`;

          const roomResp = await sbGet(sb, roomPath);
          if (roomResp.ok) {
            const rooms = await roomResp.json() as unknown[];
            if (rooms.length > 0) {
              foundRooms   = rooms;
              cascadeLevel = CASCADE_LEVELS[i]?.scope ?? "national";
              break;
            }
          }
        }
      }
    } else {
      // National fallback — any popular room
      roomPath =
        `/rest/v1/rooms?visibility=eq.public` +
        `&select=${COMMUNITY_SELECT}` +
        `&order=is_live.desc,audience_count.desc,created_at.desc&limit=${limit}`;

      const roomResp = await sbGet(sb, roomPath);
      if (roomResp.ok) {
        foundRooms   = await roomResp.json() as unknown[];
        cascadeLevel = "national";
      }
      break;
    }
  }

  console.log("[activation/first-room]", JSON.stringify({
    cascadeLevel, cascadeLabel, roomCount: foundRooms.length,
    trace: tid, timestamp: new Date().toISOString(),
  }));

  return c.json({
    rooms:         foundRooms,
    cascade_level: cascadeLevel,
    cascade_label: cascadeLabel,
    count:         foundRooms.length,
  });
});


// ══════════════════════════════════════════════════════════════════════
// GET /api/activation/pulse/:communityId
// Daily community pulse — active rooms, members, badges, civic status
// ══════════════════════════════════════════════════════════════════════

activation.get("/pulse/:communityId", async (c) => {
  const { communityId } = c.req.param();
  const sb  = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid = traceId(c);

  const resp = await sbPost(sb, "/rest/v1/rpc/get_community_pulse", {
    p_community_id: communityId,
  });

  if (!resp.ok) {
    console.error(`[activation/pulse] rpc error ${resp.status} trace=${tid}`);
    return c.json({ error: "Failed to fetch community pulse" }, 500);
  }

  const pulse = await resp.json() as Record<string, unknown>;
  if (pulse.error) return c.json({ error: pulse.error }, 404);

  // Also fetch live rooms for this community
  const liveRoomsResp = await sbGet(sb,
    `/rest/v1/rooms?community_id=eq.${communityId}&is_live=eq.true&visibility=eq.public` +
    `&select=id,title,category,audience_count,is_live,created_at,host:profiles!rooms_host_id_fkey(id,username,display_name,avatar_url)` +
    `&order=audience_count.desc&limit=5`);

  const liveRooms = liveRoomsResp.ok
    ? await liveRoomsResp.json() as unknown[]
    : [];

  return c.json({ ...pulse, live_rooms: liveRooms });
});


// ══════════════════════════════════════════════════════════════════════
// GET /api/activation/recommendations
// 5+ community recommendations based on user region + interests.
// NO auto-join — user chooses.
// ══════════════════════════════════════════════════════════════════════

activation.get("/recommendations", async (c) => {
  const sb    = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid   = traceId(c);
  const limit = Math.min(Number(c.req.query("limit") ?? 10), 30);

  // CF geo + optional auth profile
  const cfCountry = c.req.header("CF-IPCountry") ?? "NG";
  const cfRegion  = c.req.header("CF-IPRegion")  ?? "";
  const stateSlug = cfRegion.replace(/\s+state$/i, "").replace(/\s+/g, "-").slice(0, 3).toUpperCase();
  const regionId  = stateSlug ? `${cfCountry}-${stateSlug}` : cfCountry;

  const SELECT =
    `id,name,slug,description,cover_url,category,visibility,type,region_id,is_civic,member_count,room_count,is_verified,interest_tags,created_at,` +
    `owner:profiles!communities_owner_id_fkey(username,display_name,avatar_url,is_verified)`;

  // Fetch regional communities
  const regionalResp = await sbGet(sb,
    `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false&is_suspended=eq.false` +
    `&region_id=eq.${encodeURIComponent(regionId)}&select=${SELECT}` +
    `&order=member_count.desc&limit=${limit}`);

  const regional = regionalResp.ok
    ? await regionalResp.json() as unknown[]
    : [];

  // Fetch interest communities (top by members)
  const interestResp = await sbGet(sb,
    `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false&is_suspended=eq.false` +
    `&type=eq.interest&select=${SELECT}` +
    `&order=member_count.desc&limit=${limit}`);

  const interest = interestResp.ok
    ? await interestResp.json() as unknown[]
    : [];

  // Merge, deduplicate by id, cap at limit*2
  const seen = new Set<string>();
  const merged: unknown[] = [];
  for (const item of [...regional, ...interest]) {
    const id = (item as { id: string }).id;
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(item);
    }
    if (merged.length >= limit * 2) break;
  }

  // Ensure minimum 5 recommendations — pad with popular communities if needed
  if (merged.length < 5) {
    const padResp = await sbGet(sb,
      `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false` +
      `&select=${SELECT}&order=member_count.desc&limit=10`);
    if (padResp.ok) {
      const pad = await padResp.json() as { id: string }[];
      for (const item of pad) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
        if (merged.length >= 5) break;
      }
    }
  }

  console.log("[activation/recommendations]", JSON.stringify({
    regionId, count: merged.length, trace: tid,
  }));

  return c.json({
    communities: merged,
    region:      regionId,
    count:       merged.length,
  });
});


// ══════════════════════════════════════════════════════════════════════
// GET /api/activation/home-feed
// Regional home feed: near_you, your_communities, live_rooms,
// popular_in_state, trending_interests
// ══════════════════════════════════════════════════════════════════════

activation.get("/home-feed", async (c) => {
  const sb        = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid       = traceId(c);
  const cfCountry = c.req.header("CF-IPCountry") ?? "NG";
  const cfRegion  = c.req.header("CF-IPRegion")  ?? "";
  const stateSlug = cfRegion.replace(/\s+state$/i, "").replace(/\s+/g, "-").slice(0, 3).toUpperCase();
  const regionId  = stateSlug ? `${cfCountry}-${stateSlug}` : cfCountry;

  const COMM_SELECT =
    `id,name,slug,description,cover_url,category,type,region_id,member_count,room_count,is_verified,interest_tags,` +
    `owner:profiles!communities_owner_id_fkey(username,display_name,avatar_url,is_verified)`;

  const ROOM_SELECT =
    `id,title,category,community_id,is_live,audience_count,cover_url,language,created_at,` +
    `host:profiles!rooms_host_id_fkey(id,username,display_name,avatar_url,is_verified)`;

  // Fetch all sections in parallel via Promise.all
  const [
    nearYouResp,
    liveRoomsResp,
    popularStateResp,
    trendingInterestResp,
  ] = await Promise.all([
    sbGet(sb,
      `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false&region_id=eq.${encodeURIComponent(regionId)}` +
      `&select=${COMM_SELECT}&order=member_count.desc&limit=6`),
    sbGet(sb,
      `/rest/v1/rooms?visibility=eq.public&is_live=eq.true` +
      `&select=${ROOM_SELECT}&order=audience_count.desc&limit=6`),
    sbGet(sb,
      `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false` +
      `&country_code=eq.${cfCountry}&select=${COMM_SELECT}&order=member_count.desc&limit=6`),
    sbGet(sb,
      `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false` +
      `&type=eq.interest&select=${COMM_SELECT}&order=member_count.desc&limit=6`),
  ]);

  const nearYou         = nearYouResp.ok         ? await nearYouResp.json()         as unknown[] : [];
  const liveRooms       = liveRoomsResp.ok        ? await liveRoomsResp.json()        as unknown[] : [];
  const popularInState  = popularStateResp.ok      ? await popularStateResp.json()      as unknown[] : [];
  const trendingInterests = trendingInterestResp.ok ? await trendingInterestResp.json() as unknown[] : [];

  // Your communities requires auth — best effort
  let yourCommunities: unknown[] = [];
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token   = authHeader.slice(7);
      const parts   = token.split(".");
      const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
      const userId  = (payload.id ?? payload.sub) as string | undefined;
      if (userId) {
        const yourResp = await sbGet(sb,
          `/rest/v1/community_members?user_id=eq.${userId}&select=community:communities!community_members_community_id_fkey(${COMM_SELECT})&limit=6`);
        if (yourResp.ok) {
          const rows = await yourResp.json() as { community: unknown }[];
          yourCommunities = rows.map(r => r.community).filter(Boolean);
        }
      }
    } catch { /* silent */ }
  }

  return c.json({
    near_you:           nearYou,
    your_communities:   yourCommunities,
    live_rooms:         liveRooms,
    popular_in_state:   popularInState,
    trending_interests: trendingInterests,
    region:             regionId,
    generated_at:       new Date().toISOString(),
  });
});


// ══════════════════════════════════════════════════════════════════════
// GET /api/activation/momentum/:userId
// Creator promotion ladder — current level + metrics
// ══════════════════════════════════════════════════════════════════════

activation.get("/momentum/:userId", async (c) => {
  const { userId } = c.req.param();
  const sb         = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const resp = await sbGet(sb,
    `/rest/v1/community_creator_momentum?user_id=eq.${userId}` +
    `&select=community_id,promotion_level,listeners_count,rooms_hosted,retention_score,momentum_score,promotion_threshold,last_promoted_at,updated_at,community:communities!community_creator_momentum_community_id_fkey(id,name,slug,cover_url)` +
    `&order=momentum_score.desc&limit=20`);

  if (!resp.ok) return c.json({ error: "Failed to fetch momentum data" }, 500);
  const data = await resp.json() as unknown[];

  // Derive highest promotion level across all communities
  const levelOrder: Record<PromotionLevel, number> = {
    community: 0, lcda: 1, lga: 2, state: 3, national: 4,
  };
  let topLevel: PromotionLevel = "community";
  for (const row of data) {
    const r = row as { promotion_level: PromotionLevel };
    if (levelOrder[r.promotion_level] > levelOrder[topLevel]) {
      topLevel = r.promotion_level;
    }
  }

  return c.json({
    user_id:        userId,
    top_level:      topLevel,
    communities:    data,
    count:          data.length,
  });
});


// ══════════════════════════════════════════════════════════════════════
// GET /api/activation/badges/:communityId
// List active badges for a community
// ══════════════════════════════════════════════════════════════════════

activation.get("/badges/:communityId", async (c) => {
  const { communityId } = c.req.param();
  const sb = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const resp = await sbGet(sb,
    `/rest/v1/community_leader_badges?community_id=eq.${communityId}&is_active=eq.true` +
    `&select=id,badge_type,awarded_at,metadata,profile:profiles!community_leader_badges_user_id_fkey(id,username,display_name,avatar_url,is_verified)` +
    `&order=awarded_at.desc`);

  if (!resp.ok) return c.json({ error: "Failed to fetch badges" }, 500);
  const data = await resp.json() as unknown[];
  return c.json({ badges: data, community_id: communityId, count: data.length });
});


// ══════════════════════════════════════════════════════════════════════
// POST /api/activation/badges/:communityId
// Award a Community Leader badge. Owner or admin only.
// ══════════════════════════════════════════════════════════════════════

activation.post("/badges/:communityId", requireAuth(), async (c) => {
  const { communityId } = c.req.param();
  const actor = c.get("user");
  const sb    = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid   = traceId(c);

  // Auth: must be owner or admin
  const memResp = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${communityId}&user_id=eq.${actor.id}&select=role&limit=1`);
  if (!memResp.ok) return c.json({ error: "Failed to verify role" }, 500);
  const memRows = await memResp.json() as { role: string }[];
  if (!["owner", "admin"].includes(memRows[0]?.role ?? "")) {
    return c.json({ error: "Only owners and admins can award badges" }, 403);
  }

  type BadgeBody = { user_id?: string; badge_type?: string; metadata?: Record<string, unknown> };
  const body: BadgeBody = await c.req.json<BadgeBody>().catch((): BadgeBody => ({}));

  if (!body.user_id?.trim()) return c.json({ error: "user_id is required" }, 400);
  if (!(BADGE_TYPES as readonly string[]).includes(body.badge_type ?? "")) {
    return c.json({
      error: `badge_type must be one of: ${BADGE_TYPES.join(", ")}`,
    }, 400);
  }

  // Target must be a member
  const targetResp = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${communityId}&user_id=eq.${body.user_id}&select=role&limit=1`);
  if (!targetResp.ok) return c.json({ error: "Failed to verify target" }, 500);
  const targetRows = await targetResp.json() as { role: string }[];
  if (!targetRows[0]) return c.json({ error: "User is not a member of this community" }, 404);

  const upsertResp = await sbPost(sb, "/rest/v1/community_leader_badges", {
    community_id: communityId,
    user_id:      body.user_id,
    badge_type:   body.badge_type as BadgeType,
    awarded_by:   actor.id,
    is_active:    true,
    revoked_at:   null,
    metadata:     body.metadata ?? {},
  }, "return=representation,resolution=merge-duplicates");

  if (!upsertResp.ok) {
    const err = await upsertResp.text().catch(() => "");
    console.error(`[activation/badges/award] supabase error ${upsertResp.status} trace=${tid}`, err.slice(0, 200));
    return c.json({ error: "Failed to award badge" }, 500);
  }

  const rows = await upsertResp.json() as unknown[];

  // Record activation event
  await sbPost(sb, "/rest/v1/community_activation_events", {
    event_type:   "badge_awarded",
    user_id:      body.user_id,
    community_id: communityId,
    session_id:   tid,
    metadata: { badge_type: body.badge_type, awarded_by: actor.id },
  }, "return=minimal").catch(() => {});

  console.log("[activation/badges/award]", JSON.stringify({
    communityId, targetUserId: body.user_id, badgeType: body.badge_type,
    awardedBy: actor.id, trace: tid, timestamp: new Date().toISOString(),
  }));

  return c.json({ badge: rows[0] ?? null }, 201);
});


// ══════════════════════════════════════════════════════════════════════
// POST /api/activation/events
// Record an activation metric event (client-side telemetry).
// Auth required — prevents anonymous event injection.
// ══════════════════════════════════════════════════════════════════════

const ALLOWED_CLIENT_EVENTS = [
  "community_join", "first_room_join", "daily_active_listener",
  "community_retention", "room_attended",
] as const;

activation.post("/events", requireAuth(), async (c) => {
  const user = c.get("user");
  const sb   = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid  = traceId(c);

  type EventBody = {
    event_type?:    string;
    community_id?:  string;
    room_id?:       string;
    metadata?:      Record<string, unknown>;
  };
  const body: EventBody = await c.req.json<EventBody>().catch((): EventBody => ({}));

  if (!(ALLOWED_CLIENT_EVENTS as readonly string[]).includes(body.event_type ?? "")) {
    return c.json({
      error: `event_type must be one of: ${ALLOWED_CLIENT_EVENTS.join(", ")}`,
    }, 400);
  }

  const insertResp = await sbPost(sb, "/rest/v1/community_activation_events", {
    event_type:   body.event_type,
    user_id:      user.id,
    community_id: body.community_id ?? null,
    room_id:      body.room_id      ?? null,
    session_id:   tid,
    metadata:     body.metadata     ?? {},
  }, "return=minimal");

  if (!insertResp.ok) {
    console.error(`[activation/events] supabase error ${insertResp.status} trace=${tid}`);
    return c.json({ error: "Failed to record event" }, 500);
  }

  return c.json({ ok: true, event_type: body.event_type });
});

export { activation };
