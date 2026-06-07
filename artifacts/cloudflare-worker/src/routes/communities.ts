/**
 * Loop V2 — Communities Route
 *
 * Hono router mounted at /api/communities in src/index.ts.
 * All writes go through CF Worker via Supabase service-role REST.
 * RLS is enforced on the Supabase side; the Worker authorises via JWT.
 *
 * Sprint: V2 Community Infrastructure (2026-06-07)
 * Schema: supabase/migrations/005_communities.sql (base)
 *         supabase/migrations/007_community_v2_schema.sql (V1 enhancements)
 *
 * Routes
 * ──────
 *  Discovery (no auth required):
 *    GET  /nearby                        — CF geo-detected nearby communities
 *    GET  /interests                     — interest-tag based communities
 *    GET  /state/:stateId                — state-level communities
 *
 *  CRUD:
 *    POST /                              — create community (auth)
 *    GET  /                              — list communities
 *    GET  /:slug                         — community detail (slug or UUID)
 *    PATCH  /:id                         — update (owner/admin)
 *    DELETE /:id                         — delete (owner only)
 *
 *  Membership:
 *    GET    /:id/members                 — list members
 *    DELETE /:id/members/:userId         — remove member (owner or permitted mod)
 *    POST   /:id/join                    — join community (auth)
 *    DELETE /:id/leave                   — leave community (auth)
 *    POST   /:id/leave                   — leave community — POST alias (auth)
 *
 *  Moderators:
 *    POST   /:id/moderators              — appoint moderator (owner only)
 *    DELETE /:id/moderators/:userId      — remove moderator (owner only)
 *
 *  Rules:
 *    GET  /:id/rules                     — list rules (public)
 *    POST /:id/rules                     — create/upsert rule (owner or mod with can_edit_rules)
 *
 *  Rooms (community-scoped):
 *    GET  /:id/rooms                     — list community rooms
 *    POST /:id/rooms                     — create room in community (member)
 */

import { Hono } from "hono";
// NOTE: @supabase/supabase-js createClient is intentionally NOT used here.
// In Cloudflare Workers (nodejs_compat), the JS client accesses private
// properties (.supabaseUrl, .supabaseKey) that changed in v2.49.8, and
// also attempts browser APIs (localStorage, window.location) at init time.
// All database access uses direct REST fetch with explicit headers instead.
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import type {
  CommunityRole,
  CommunityModeratorPermissions,
  CommunityType,
} from "@workspace/loop-shared-types";

const communities = new Hono<{
  Bindings:  CloudflareEnv;
  Variables: { user: AuthUser };
}>();

// ── Utility: slug validation ───────────────────────────────────────────────────

/**
 * Valid slug: 3–48 chars, lowercase alphanumeric + hyphens.
 * Cannot start or end with a hyphen, no consecutive hyphens.
 */
export function isValidSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 48) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) && !slug.includes("--");
}

/** Convert a community name to a URL-safe slug. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\t_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const COMMUNITY_CATEGORIES = [
  "technology", "culture", "education", "sports", "faith",
  "business", "local", "news", "entertainment", "health", "general",
] as const;

export function isValidCommunityCategory(cat: string): boolean {
  return (COMMUNITY_CATEGORIES as readonly string[]).includes(cat);
}

export function isValidCommunityVisibility(vis: string): boolean {
  return ["public", "private", "invite_only"].includes(vis);
}

/** Validate a rule number (1–20) */
export function isValidRuleNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 20;
}

/** Build a region slug for geo-detection (e.g. "NG-LA" → "ng-la") */
export function buildRegionSlug(countryCode: string, stateCode?: string): string {
  const parts = [countryCode.toUpperCase()];
  if (stateCode) parts.push(stateCode.toUpperCase());
  return parts.join("-");
}

/** Extract traceId from request headers (X-Trace-Id or X-Request-Id) */
function traceId(c: { req: { header(name: string): string | undefined } }): string {
  return (
    c.req.header("X-Trace-Id") ??
    c.req.header("X-Request-Id") ??
    crypto.randomUUID()
  );
}

// ── Supabase REST helpers ──────────────────────────────────────────────────────
// All helpers accept an explicit { url, key } connection object so there is no
// dependency on the Supabase JS client or its internal private properties.

type SbConn = { url: string; key: string };

/** Build a connection object from Cloudflare env vars. */
function sbConn(url: string, key: string): SbConn {
  return { url, key };
}

function sbGet(sb: SbConn, path: string): Promise<Response> {
  return fetch(`${sb.url}${path}`, {
    method: "GET",
    headers: {
      apikey:          sb.key,
      Authorization:   `Bearer ${sb.key}`,
      "Content-Type":  "application/json",
      Accept:          "application/json",
      Prefer:          "return=representation",
    },
  });
}

function sbPost(
  sb: SbConn,
  path: string,
  body: unknown,
  prefer = "return=representation",
): Promise<Response> {
  return fetch(`${sb.url}${path}`, {
    method: "POST",
    headers: {
      apikey:          sb.key,
      Authorization:   `Bearer ${sb.key}`,
      "Content-Type":  "application/json",
      Accept:          "application/json",
      Prefer:          prefer,
    },
    body: JSON.stringify(body),
  });
}

function sbPatch(sb: SbConn, path: string, body: unknown): Promise<Response> {
  return fetch(`${sb.url}${path}`, {
    method: "PATCH",
    headers: {
      apikey:          sb.key,
      Authorization:   `Bearer ${sb.key}`,
      "Content-Type":  "application/json",
      Accept:          "application/json",
      Prefer:          "return=representation",
    },
    body: JSON.stringify(body),
  });
}

function sbDelete(sb: SbConn, path: string): Promise<Response> {
  return fetch(`${sb.url}${path}`, {
    method: "DELETE",
    headers: {
      apikey:          sb.key,
      Authorization:   `Bearer ${sb.key}`,
      "Content-Type":  "application/json",
      Accept:          "application/json",
      Prefer:          "return=minimal",
    },
  });
}


// ══════════════════════════════════════════════════════════════════════════════
// DISCOVERY ROUTES — must come before /:slug to avoid parameter capture
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/communities/nearby
 * Returns communities near the requester using CF geo headers.
 * Falls back gracefully if no region data: returns national interest communities.
 *
 * Merge levels (from most specific to most general):
 *   lcda → lga → state → national → interest
 *
 * Query params:
 *   limit   — max results (default: 20, max: 50)
 *   civic   — "true" to filter to civic communities only
 */
communities.get("/nearby", async (c) => {
  const limit   = Math.min(Number(c.req.query("limit") ?? 20), 50);
  const civicOnly = c.req.query("civic") === "true";
  const tid     = traceId(c);
  const sb      = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  // CF geo detection
  const cfCountry  = c.req.header("CF-IPCountry")  ?? "NG";
  const cfRegion   = c.req.header("CF-IPRegion")   ?? "";
  const cfCity     = c.req.header("CF-IPCity")     ?? "";

  // Determine the detected region label for the response
  const detectedRegion = cfCity || cfRegion || cfCountry;

  // Build query: try to find communities with matching region_id
  // Region IDs follow RALD convention: "NG-LA" for Lagos State, "NG" for Nigeria
  let mergeLevel: string = "interest";
  let regionFilter = "";

  if (cfRegion) {
    // Map CF region name to a 2-letter state code heuristic
    // CF-IPRegion is the full region name (e.g. "Lagos State")
    const stateSlug = cfRegion
      .replace(/\s+state$/i, "")
      .replace(/\s+/g, "-")
      .toUpperCase()
      .slice(0, 3);
    regionFilter = `${cfCountry}-${stateSlug}`;
    mergeLevel   = "state";
  } else {
    regionFilter = cfCountry;
    mergeLevel   = "national";
  }

  let path =
    `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false&is_suspended=eq.false` +
    `&select=id,name,slug,description,cover_url,category,visibility,type,region_id,country_code,is_civic,member_count,room_count,is_verified,created_at,owner:profiles!communities_owner_id_fkey(username,display_name,avatar_url,is_verified)` +
    `&order=member_count.desc` +
    `&limit=${limit}`;

  if (regionFilter) {
    path += `&region_id=eq.${encodeURIComponent(regionFilter)}`;
  }
  if (civicOnly) {
    path += `&is_civic=eq.true`;
  }

  const resp = await sbGet(sb, path);
  if (!resp.ok) {
    console.error(`[communities/nearby] supabase error ${resp.status} trace=${tid}`);
    return c.json({ error: "Failed to fetch nearby communities" }, 500);
  }

  const data = await resp.json() as unknown[];

  // If region returns no results, fall back to popular interest communities
  if (data.length === 0 && mergeLevel !== "interest") {
    mergeLevel = "interest";
    const fallbackPath =
      `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false&is_suspended=eq.false` +
      `&type=eq.interest` +
      `&select=id,name,slug,description,cover_url,category,visibility,type,region_id,country_code,is_civic,member_count,room_count,is_verified,created_at,owner:profiles!communities_owner_id_fkey(username,display_name,avatar_url,is_verified)` +
      `&order=member_count.desc&limit=${limit}`;
    const fallbackResp = await sbGet(sb, fallbackPath);
    if (fallbackResp.ok) {
      const fallbackData = await fallbackResp.json() as unknown[];
      return c.json({
        communities:     fallbackData,
        detected_region: detectedRegion,
        merge_level:     mergeLevel,
        count:           fallbackData.length,
      });
    }
  }

  return c.json({
    communities:     data,
    detected_region: detectedRegion,
    merge_level:     mergeLevel,
    count:           data.length,
  });
});


/**
 * GET /api/communities/interests
 * Returns communities matching interest tags.
 *
 * Query params:
 *   tags    — comma-separated interest tags (e.g. "music,tech,sports")
 *   limit   — max results (default: 20, max: 50)
 */
communities.get("/interests", async (c) => {
  const tagsParam = c.req.query("tags") ?? "";
  const limit     = Math.min(Number(c.req.query("limit") ?? 20), 50);
  const tid       = traceId(c);
  const sb        = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const tags = tagsParam
    .split(",")
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && t.length <= 40)
    .slice(0, 10);

  let path =
    `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false&is_suspended=eq.false` +
    `&type=eq.interest` +
    `&select=id,name,slug,description,cover_url,category,visibility,type,interest_tags,member_count,room_count,is_verified,created_at,owner:profiles!communities_owner_id_fkey(username,display_name,avatar_url,is_verified)` +
    `&order=member_count.desc&limit=${limit}`;

  if (tags.length > 0) {
    // Supabase array overlap operator: interest_tags.cs.{music,tech}
    const tagList = `{${tags.map(t => `"${t}"`).join(",")}}`;
    path += `&interest_tags=cs.${encodeURIComponent(tagList)}`;
  }

  const resp = await sbGet(sb, path);
  if (!resp.ok) {
    console.error(`[communities/interests] supabase error ${resp.status} trace=${tid}`);
    return c.json({ error: "Failed to fetch interest communities" }, 500);
  }

  const data = await resp.json() as unknown[];
  return c.json({ communities: data, tags, count: data.length });
});


/**
 * GET /api/communities/state/:stateId
 * Returns communities for a specific state code (e.g. "NG-LA" for Lagos).
 *
 * Query params:
 *   limit   — max results (default: 20, max: 50)
 *   civic   — "true" to filter civic communities only
 */
communities.get("/state/:stateId", async (c) => {
  const { stateId } = c.req.param();
  const limit       = Math.min(Number(c.req.query("limit") ?? 20), 50);
  const civicOnly   = c.req.query("civic") === "true";
  const tid         = traceId(c);
  const sb          = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  // Validate stateId format: e.g. "NG-LA", "NG-AB"
  if (!/^[A-Z]{2}-[A-Z]{2,4}$/.test(stateId.toUpperCase())) {
    return c.json({ error: "Invalid stateId format. Expected e.g. NG-LA" }, 400);
  }

  let path =
    `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false&is_suspended=eq.false` +
    `&region_id=eq.${encodeURIComponent(stateId.toUpperCase())}` +
    `&select=id,name,slug,description,cover_url,category,visibility,type,region_id,region_scope,country_code,is_civic,member_count,room_count,is_verified,created_at,owner:profiles!communities_owner_id_fkey(username,display_name,avatar_url,is_verified)` +
    `&order=member_count.desc&limit=${limit}`;

  if (civicOnly) path += `&is_civic=eq.true`;

  const resp = await sbGet(sb, path);
  if (!resp.ok) {
    console.error(`[communities/state] supabase error ${resp.status} stateId=${stateId} trace=${tid}`);
    return c.json({ error: "Failed to fetch state communities" }, 500);
  }

  const data = await resp.json() as unknown[];
  return c.json({
    communities: data,
    state_id:    stateId.toUpperCase(),
    count:       data.length,
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// CRUD
// ══════════════════════════════════════════════════════════════════════════════

/* ── POST /api/communities ───────────────────────────────────────────── */

type CreateCommunityBody = {
  name?:        string;
  slug?:        string;
  description?: string;
  cover_url?:   string;
  category?:    string;
  visibility?:  string;
  type?:        string;
  region_id?:   string;
  country_code?: string;
  interest_tags?: string[];
};

communities.post("/", requireAuth(), async (c) => {
  const user = c.get("user");
  const sb   = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid  = traceId(c);

  const body: CreateCommunityBody = await c.req
    .json<CreateCommunityBody>()
    .catch((): CreateCommunityBody => ({}));

  const name = body.name?.trim();
  if (!name || name.length < 2 || name.length > 80) {
    return c.json({ error: "name must be 2–80 characters" }, 400);
  }

  const slug = body.slug?.trim() || slugify(name);
  if (!isValidSlug(slug)) {
    return c.json({
      error: "slug must be 3–48 characters, lowercase alphanumeric and hyphens only",
    }, 400);
  }

  const category = body.category ?? "general";
  if (!isValidCommunityCategory(category)) {
    return c.json({ error: `Invalid category. Valid: ${COMMUNITY_CATEGORIES.join(", ")}` }, 400);
  }

  const visibility = body.visibility ?? "public";
  if (!isValidCommunityVisibility(visibility)) {
    return c.json({ error: "visibility must be public, private, or invite_only" }, 400);
  }

  // Check slug uniqueness
  const slugCheck = await sbGet(sb,
    `/rest/v1/communities?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`);
  if (slugCheck.ok) {
    const rows = await slugCheck.json() as unknown[];
    if (rows.length > 0) {
      return c.json({ error: "This slug is already taken. Choose a different one." }, 409);
    }
  }

  const communityType: CommunityType = (body.type as CommunityType) ?? "interest";
  const validTypes: CommunityType[] = [
    "regional_state","regional_lga","regional_lcda","regional_city",
    "interest","creator_artist","creator_dj","creator_radio",
    "creator_podcaster","creator_sports",
  ];
  if (!validTypes.includes(communityType)) {
    return c.json({ error: "Invalid community type" }, 400);
  }

  // Regional communities require region_id
  if (communityType.startsWith("regional") && !body.region_id?.trim()) {
    return c.json({ error: "Regional communities require a region_id" }, 400);
  }

  const payload: Record<string, unknown> = {
    name,
    slug,
    description:   body.description ?? null,
    cover_url:     body.cover_url   ?? null,
    category,
    visibility,
    owner_id:      user.id,
    member_count:  1,
    room_count:    0,
    type:          communityType,
    country_code:  body.country_code ?? "NG",
  };
  if (body.region_id)     payload.region_id     = body.region_id.trim();
  if (body.interest_tags) payload.interest_tags = body.interest_tags.slice(0, 10);

  const createResp = await sbPost(sb, "/rest/v1/communities", payload, "return=representation");

  if (!createResp.ok) {
    const err = await createResp.text().catch(() => "");
    console.error(`[communities/create] supabase error ${createResp.status} trace=${tid}`, err.slice(0, 200));
    return c.json({ error: "Failed to create community" }, 500);
  }

  const rows = await createResp.json() as unknown[];
  const community = rows[0];

  // Auto-enroll creator as owner in community_members
  await sbPost(sb, "/rest/v1/community_members", {
    community_id: (community as { id: string }).id,
    user_id:      user.id,
    role:         "owner" as CommunityRole,
  }, "return=minimal").catch((e: unknown) => {
    console.warn(`[communities/create] member auto-enroll failed trace=${tid}:`, e);
  });

  console.log("[communities/create]", JSON.stringify({
    communityId: (community as { id: string }).id,
    slug,
    ownerId: user.id,
    type: communityType,
    trace: tid,
    timestamp: new Date().toISOString(),
  }));

  return c.json({ community }, 201);
});


/* ── GET /api/communities ────────────────────────────────────────────── */

communities.get("/", async (c) => {
  const sb       = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const limit    = Math.min(Number(c.req.query("limit")  ?? 20), 100);
  const offset   = Math.max(Number(c.req.query("offset") ?? 0),  0);
  const category = c.req.query("category");
  const q        = c.req.query("q")?.trim();
  const type     = c.req.query("type");

  let path =
    `/rest/v1/communities?visibility=eq.public&is_deleted=eq.false` +
    `&select=id,name,slug,description,cover_url,category,visibility,type,region_id,country_code,is_civic,member_count,room_count,is_verified,created_at,owner:profiles!communities_owner_id_fkey(username,display_name,avatar_url,is_verified)` +
    `&order=member_count.desc,created_at.desc` +
    `&limit=${limit}&offset=${offset}`;

  if (category && isValidCommunityCategory(category)) {
    path += `&category=eq.${encodeURIComponent(category)}`;
  }
  if (type) {
    path += `&type=eq.${encodeURIComponent(type)}`;
  }

  const resp = await sbGet(sb, path);
  if (!resp.ok) {
    console.error("[communities/list] supabase error:", resp.status);
    return c.json({ error: "Failed to fetch communities" }, 500);
  }

  let data = await resp.json() as unknown[];

  // Client-side full-text filter when q is provided
  if (q) {
    const ql = q.toLowerCase();
    data = data.filter((row) => {
      const r = row as { name?: string; description?: string };
      return (
        r.name?.toLowerCase().includes(ql) ||
        r.description?.toLowerCase().includes(ql)
      );
    });
  }

  return c.json({ communities: data, count: data.length, offset, limit });
});


/* ── GET /api/communities/:slug ──────────────────────────────────────── */
/* Accepts either a URL slug or a UUID in the :slug parameter position   */

communities.get("/:slug", async (c) => {
  const { slug } = c.req.param();
  const sb = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  const filter = isUUID ? `id=eq.${slug}` : `slug=eq.${encodeURIComponent(slug)}`;

  const resp = await sbGet(sb,
    `/rest/v1/communities?${filter}` +
    `&select=id,name,slug,description,cover_url,category,visibility,type,region_id,region_scope,country_code,is_civic,health_score,interest_tags,member_count,room_count,active_room_count,is_verified,is_suspended,created_at,updated_at,owner:profiles!communities_owner_id_fkey(username,display_name,avatar_url,is_verified)` +
    `&limit=1`);

  if (!resp.ok) return c.json({ error: "Failed to fetch community" }, 500);
  const rows = await resp.json() as unknown[];
  if (!rows[0]) return c.json({ error: "Community not found" }, 404);

  const community = rows[0];
  const communityId = (community as { id: string }).id;

  // Membership check (best-effort — no auth required)
  const authHeader = c.req.header("Authorization");
  let is_member  = false;
  let member_role: CommunityRole | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Decode sub without full verify (detail endpoint, informational only)
    try {
      const parts  = token.split(".");
      const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
      const userId = (payload.id ?? payload.sub) as string | undefined;
      if (userId) {
        const memResp = await sbGet(sb,
          `/rest/v1/community_members?community_id=eq.${communityId}&user_id=eq.${userId}&select=role&limit=1`);
        if (memResp.ok) {
          const memRows = await memResp.json() as { role: CommunityRole }[];
          if (memRows[0]) {
            is_member   = true;
            member_role = memRows[0].role;
          }
        }
      }
    } catch {
      // Silent — informational check only
    }
  }

  return c.json({ community, is_member, member_role });
});


/* ── PATCH /api/communities/:id ──────────────────────────────────────── */

type UpdateCommunityBody = {
  name?:        string;
  description?: string;
  cover_url?:   string;
  category?:    string;
  visibility?:  string;
  interest_tags?: string[];
};

communities.patch("/:id", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const sb   = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid  = traceId(c);

  // Auth: must be owner or admin
  const memCheck = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${user.id}&select=role&limit=1`);
  if (!memCheck.ok) return c.json({ error: "Failed to verify membership" }, 500);
  const memRows = await memCheck.json() as { role: CommunityRole }[];
  const membership = memRows[0];

  if (!membership) return c.json({ error: "Community not found or you are not a member" }, 403);
  if (!["owner", "admin"].includes(membership.role)) {
    return c.json({ error: "Only the owner or admin can update this community" }, 403);
  }

  const body: UpdateCommunityBody = await c.req
    .json<UpdateCommunityBody>()
    .catch((): UpdateCommunityBody => ({}));

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 80) {
      return c.json({ error: "name must be 2–80 characters" }, 400);
    }
    updates.name = name;
  }
  if (body.description !== undefined) updates.description = body.description ?? null;
  if (body.cover_url    !== undefined) updates.cover_url   = body.cover_url   ?? null;
  if (body.category !== undefined) {
    if (!isValidCommunityCategory(body.category)) {
      return c.json({ error: "Invalid category" }, 400);
    }
    updates.category = body.category;
  }
  if (body.visibility !== undefined) {
    if (!isValidCommunityVisibility(body.visibility)) {
      return c.json({ error: "Invalid visibility" }, 400);
    }
    updates.visibility = body.visibility;
  }
  if (body.interest_tags !== undefined) {
    updates.interest_tags = body.interest_tags.slice(0, 10);
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  const patchResp = await sbPatch(sb,
    `/rest/v1/communities?id=eq.${id}`, updates);

  if (!patchResp.ok) {
    console.error(`[communities/update] supabase error ${patchResp.status} trace=${tid}`);
    return c.json({ error: "Failed to update community" }, 500);
  }

  const rows = await patchResp.json() as unknown[];
  return c.json({ community: rows[0] ?? null });
});


/* ── DELETE /api/communities/:id ─────────────────────────────────────── */

communities.delete("/:id", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const sb   = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid  = traceId(c);

  const commCheck = await sbGet(sb,
    `/rest/v1/communities?id=eq.${id}&select=id,owner_id&limit=1`);
  if (!commCheck.ok) return c.json({ error: "Failed to fetch community" }, 500);
  const commRows = await commCheck.json() as { id: string; owner_id: string }[];
  if (!commRows[0]) return c.json({ error: "Community not found" }, 404);
  if (commRows[0].owner_id !== user.id) {
    return c.json({ error: "Only the owner can delete this community" }, 403);
  }

  const delResp = await sbDelete(sb, `/rest/v1/communities?id=eq.${id}`);
  if (!delResp.ok) {
    console.error(`[communities/delete] supabase error ${delResp.status} trace=${tid}`);
    return c.json({ error: "Failed to delete community" }, 500);
  }

  console.log("[communities/delete]", JSON.stringify({
    communityId: id, ownerId: user.id, trace: tid,
    timestamp: new Date().toISOString(),
  }));

  return c.json({ ok: true });
});


// ══════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP
// ══════════════════════════════════════════════════════════════════════════════

/* ── GET /api/communities/:id/members ────────────────────────────────── */

communities.get("/:id/members", async (c) => {
  const { id }  = c.req.param();
  const limit   = Math.min(Number(c.req.query("limit")  ?? 50), 200);
  const offset  = Math.max(Number(c.req.query("offset") ?? 0),  0);
  const role    = c.req.query("role");
  const sb      = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  let path =
    `/rest/v1/community_members?community_id=eq.${id}` +
    `&select=community_id,user_id,role,joined_at,profile:profiles!community_members_user_id_fkey(username,display_name,avatar_url,is_verified)` +
    `&order=role.asc,joined_at.asc` +
    `&limit=${limit}&offset=${offset}`;

  if (role && ["owner", "admin", "moderator", "member"].includes(role)) {
    path += `&role=eq.${encodeURIComponent(role)}`;
  }

  const resp = await sbGet(sb, path);
  if (!resp.ok) return c.json({ error: "Failed to fetch members" }, 500);

  const data = await resp.json() as unknown[];
  return c.json({ members: data, count: data.length, offset, limit });
});


/* ── DELETE /api/communities/:id/members/:userId ─────────────────────── */
/* Owner or moderator with can_remove_members permission removes a member  */

communities.delete("/:id/members/:userId", requireAuth(), async (c) => {
  const { id, userId } = c.req.param();
  const actor = c.get("user");
  const sb    = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid   = traceId(c);

  if (actor.id === userId) {
    return c.json({ error: "Use the /leave endpoint to leave a community" }, 400);
  }

  // Fetch actor's role (must be owner, admin, or active moderator with permission)
  const actorMem = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${actor.id}&select=role&limit=1`);
  if (!actorMem.ok) return c.json({ error: "Failed to verify actor membership" }, 500);
  const actorRows = await actorMem.json() as { role: CommunityRole }[];
  const actorRole = actorRows[0]?.role;

  if (!actorRole || actorRole === "member") {
    // Check if actor is an active moderator with can_remove_members
    const modCheck = await sbGet(sb,
      `/rest/v1/community_moderators?community_id=eq.${id}&user_id=eq.${actor.id}&is_active=eq.true&select=permissions&limit=1`);
    if (modCheck.ok) {
      const modRows = await modCheck.json() as { permissions: CommunityModeratorPermissions }[];
      if (!modRows[0]?.permissions?.can_remove_members) {
        return c.json({ error: "You do not have permission to remove members" }, 403);
      }
    } else {
      return c.json({ error: "You do not have permission to remove members" }, 403);
    }
  }

  // Cannot remove an owner
  const targetMem = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${userId}&select=role&limit=1`);
  if (!targetMem.ok) return c.json({ error: "Failed to fetch target member" }, 500);
  const targetRows = await targetMem.json() as { role: CommunityRole }[];
  if (!targetRows[0]) return c.json({ error: "User is not a member of this community" }, 404);
  if (targetRows[0].role === "owner") {
    return c.json({ error: "Cannot remove the community owner" }, 403);
  }
  // Admin cannot remove another admin (only owner can)
  if (targetRows[0].role === "admin" && actorRole !== "owner") {
    return c.json({ error: "Only the owner can remove an admin" }, 403);
  }

  const delResp = await sbDelete(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${userId}`);
  if (!delResp.ok) {
    console.error(`[communities/remove-member] supabase error ${delResp.status} trace=${tid}`);
    return c.json({ error: "Failed to remove member" }, 500);
  }

  await sbPost(sb, "/rest/v1/rpc/decrement_community_member_count", {
    p_community_id: id,
  }).catch((e: unknown) => {
    console.warn(`[communities/remove-member] counter RPC failed trace=${tid}:`, e);
  });

  console.log("[communities/remove-member]", JSON.stringify({
    communityId: id, targetUserId: userId, actorId: actor.id,
    trace: tid, timestamp: new Date().toISOString(),
  }));

  return c.json({ ok: true });
});


/* ── POST /api/communities/:id/join ──────────────────────────────────── */

communities.post("/:id/join", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const user   = c.get("user");
  const sb     = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid    = traceId(c);

  const commResp = await sbGet(sb,
    `/rest/v1/communities?id=eq.${id}&select=id,visibility,is_suspended,is_deleted&limit=1`);
  if (!commResp.ok) return c.json({ error: "Failed to fetch community" }, 500);
  const commRows = await commResp.json() as { id: string; visibility: string; is_suspended: boolean; is_deleted: boolean }[];
  if (!commRows[0]) return c.json({ error: "Community not found" }, 404);

  const comm = commRows[0];
  if (comm.is_deleted)   return c.json({ error: "Community no longer exists" }, 410);
  if (comm.is_suspended) return c.json({ error: "Community is currently suspended" }, 403);
  if (comm.visibility === "invite_only") {
    return c.json({ error: "This community is invite-only" }, 403);
  }

  const memCheck = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${user.id}&select=role&limit=1`);
  if (memCheck.ok) {
    const existing = await memCheck.json() as { role: CommunityRole }[];
    if (existing[0]) {
      return c.json({ error: "Already a member", role: existing[0].role }, 409);
    }
  }

  const joinResp = await sbPost(sb, "/rest/v1/community_members", {
    community_id: id,
    user_id:      user.id,
    role:         "member" as CommunityRole,
  }, "return=minimal");

  if (!joinResp.ok) {
    const err = await joinResp.text().catch(() => "");
    console.error(`[communities/join] supabase error ${joinResp.status} trace=${tid}`, err.slice(0, 200));
    return c.json({ error: "Failed to join community" }, 500);
  }

  await sbPost(sb, "/rest/v1/rpc/increment_community_member_count", {
    p_community_id: id,
  }).catch((e: unknown) => {
    console.warn(`[communities/join] counter RPC failed trace=${tid}:`, e);
  });

  console.log("[communities/join]", JSON.stringify({
    communityId: id, userId: user.id, trace: tid,
    timestamp: new Date().toISOString(),
  }));

  const role: CommunityRole = "member";
  return c.json({ ok: true, role });
});


/* ── DELETE /api/communities/:id/leave ───────────────────────────────── */

async function leaveCommunity(
  id: string,
  user: AuthUser,
  sb: SbConn,
  tid: string,
) {
  const memCheck = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${user.id}&select=role&limit=1`);
  if (!memCheck.ok) return { status: 500, body: { error: "Failed to verify membership" } };
  const memRows = await memCheck.json() as { role: CommunityRole }[];
  const membership = memRows[0];

  if (!membership) return { status: 404, body: { error: "You are not a member of this community" } };
  if (membership.role === "owner") {
    return { status: 403, body: {
      error: "Owner cannot leave. Transfer ownership first or delete the community.",
    }};
  }

  const leaveResp = await sbDelete(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${user.id}`);
  if (!leaveResp.ok) {
    console.error(`[communities/leave] supabase error ${leaveResp.status} trace=${tid}`);
    return { status: 500, body: { error: "Failed to leave community" } };
  }

  await sbPost(sb, "/rest/v1/rpc/decrement_community_member_count", {
    p_community_id: id,
  }).catch((e: unknown) => {
    console.warn(`[communities/leave] counter RPC failed trace=${tid}:`, e);
  });

  console.log("[communities/leave]", JSON.stringify({
    communityId: id, userId: user.id, trace: tid,
    timestamp: new Date().toISOString(),
  }));

  return { status: 200, body: { ok: true } };
}

communities.delete("/:id/leave", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const result = await leaveCommunity(
    id, c.get("user"),
    sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY),
    traceId(c),
  );
  return c.json(result.body, result.status as 200 | 403 | 404 | 500);
});

/* ── POST /api/communities/:id/leave — POST method alias ─────────────── */

communities.post("/:id/leave", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const result = await leaveCommunity(
    id, c.get("user"),
    sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY),
    traceId(c),
  );
  return c.json(result.body, result.status as 200 | 403 | 404 | 500);
});


// ══════════════════════════════════════════════════════════════════════════════
// MODERATORS
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_MODERATOR_PERMISSIONS: CommunityModeratorPermissions = {
  can_remove_members:    false,
  can_mute_members:      false,
  can_pin_announcements: false,
  can_approve_rooms:     false,
  can_remove_rooms:      false,
  can_ban_members:       false,
  can_edit_rules:        false,
  can_manage_events:     false,
};

/* ── POST /api/communities/:id/moderators ────────────────────────────── */
/* Owner appoints a member as moderator with optional initial permissions  */

communities.post("/:id/moderators", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const actor  = c.get("user");
  const sb     = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid    = traceId(c);

  // Only owners can appoint moderators
  const actorMem = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${actor.id}&select=role&limit=1`);
  if (!actorMem.ok) return c.json({ error: "Failed to verify ownership" }, 500);
  const actorRows = await actorMem.json() as { role: CommunityRole }[];
  if (actorRows[0]?.role !== "owner") {
    return c.json({ error: "Only the community owner can appoint moderators" }, 403);
  }

  type AppointBody = { user_id?: string; permissions?: Partial<CommunityModeratorPermissions> };
  const body: AppointBody = await c.req.json<AppointBody>().catch((): AppointBody => ({}));

  const targetUserId = body.user_id?.trim();
  if (!targetUserId) return c.json({ error: "user_id is required" }, 400);
  if (targetUserId === actor.id) return c.json({ error: "Cannot appoint yourself as moderator" }, 400);

  // Target must be a member
  const targetMem = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${targetUserId}&select=role&limit=1`);
  if (!targetMem.ok) return c.json({ error: "Failed to verify target membership" }, 500);
  const targetRows = await targetMem.json() as { role: CommunityRole }[];
  if (!targetRows[0]) return c.json({ error: "User is not a member of this community" }, 404);

  const permissions: CommunityModeratorPermissions = {
    ...DEFAULT_MODERATOR_PERMISSIONS,
    ...(body.permissions ?? {}),
  };

  // Upsert: if already a moderator, reactivate + update permissions
  const upsertResp = await sbPost(sb, "/rest/v1/community_moderators", {
    community_id: id,
    user_id:      targetUserId,
    promoted_by:  actor.id,
    permissions,
    is_active:    true,
    revoked_at:   null,
  }, "return=representation,resolution=merge-duplicates");

  if (!upsertResp.ok) {
    const err = await upsertResp.text().catch(() => "");
    console.error(`[communities/moderators/appoint] supabase error ${upsertResp.status} trace=${tid}`, err.slice(0, 200));
    return c.json({ error: "Failed to appoint moderator" }, 500);
  }

  const rows = await upsertResp.json() as unknown[];

  console.log("[communities/moderators/appoint]", JSON.stringify({
    communityId: id, targetUserId, promotedBy: actor.id,
    trace: tid, timestamp: new Date().toISOString(),
  }));

  return c.json({ moderator: rows[0] ?? null }, 201);
});


/* ── DELETE /api/communities/:id/moderators/:userId ──────────────────── */
/* Owner revokes moderator status (sets is_active=false, records revoked_at) */

communities.delete("/:id/moderators/:userId", requireAuth(), async (c) => {
  const { id, userId } = c.req.param();
  const actor = c.get("user");
  const sb    = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid   = traceId(c);

  const actorMem = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${actor.id}&select=role&limit=1`);
  if (!actorMem.ok) return c.json({ error: "Failed to verify ownership" }, 500);
  const actorRows = await actorMem.json() as { role: CommunityRole }[];
  if (actorRows[0]?.role !== "owner") {
    return c.json({ error: "Only the community owner can remove moderators" }, 403);
  }

  const patchResp = await sbPatch(sb,
    `/rest/v1/community_moderators?community_id=eq.${id}&user_id=eq.${userId}&is_active=eq.true`,
    { is_active: false, revoked_at: new Date().toISOString() });

  if (!patchResp.ok) {
    const err = await patchResp.text().catch(() => "");
    console.error(`[communities/moderators/remove] supabase error ${patchResp.status} trace=${tid}`, err.slice(0, 200));
    return c.json({ error: "Failed to remove moderator" }, 500);
  }

  const rows = await patchResp.json() as unknown[];
  if (!rows || rows.length === 0) {
    return c.json({ error: "User is not an active moderator of this community" }, 404);
  }

  console.log("[communities/moderators/remove]", JSON.stringify({
    communityId: id, targetUserId: userId, revokedBy: actor.id,
    trace: tid, timestamp: new Date().toISOString(),
  }));

  return c.json({ ok: true });
});


// ══════════════════════════════════════════════════════════════════════════════
// RULES
// ══════════════════════════════════════════════════════════════════════════════

/* ── GET /api/communities/:id/rules ─────────────────────────────────── */

communities.get("/:id/rules", async (c) => {
  const { id } = c.req.param();
  const sb     = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const resp = await sbGet(sb,
    `/rest/v1/community_rules?community_id=eq.${id}` +
    `&select=id,community_id,rule_number,title,body,created_at,updated_at` +
    `&order=rule_number.asc`);

  if (!resp.ok) return c.json({ error: "Failed to fetch rules" }, 500);
  const data = await resp.json() as unknown[];
  return c.json({ rules: data, count: data.length });
});


/* ── POST /api/communities/:id/rules ─────────────────────────────────── */
/* Create or upsert a rule. Owner always allowed; moderator needs can_edit_rules */

communities.post("/:id/rules", requireAuth(), async (c) => {
  const { id }  = c.req.param();
  const actor   = c.get("user");
  const sb      = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid     = traceId(c);

  // Auth check: owner or moderator with can_edit_rules
  const actorMem = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${actor.id}&select=role&limit=1`);
  if (!actorMem.ok) return c.json({ error: "Failed to verify membership" }, 500);
  const actorRows = await actorMem.json() as { role: CommunityRole }[];
  const actorRole = actorRows[0]?.role;

  if (!actorRole) return c.json({ error: "You are not a member of this community" }, 403);

  if (actorRole === "member") {
    // Must be an active moderator with can_edit_rules
    const modCheck = await sbGet(sb,
      `/rest/v1/community_moderators?community_id=eq.${id}&user_id=eq.${actor.id}&is_active=eq.true&select=permissions&limit=1`);
    if (modCheck.ok) {
      const modRows = await modCheck.json() as { permissions: CommunityModeratorPermissions }[];
      if (!modRows[0]?.permissions?.can_edit_rules) {
        return c.json({ error: "You do not have permission to edit rules" }, 403);
      }
    } else {
      return c.json({ error: "You do not have permission to edit rules" }, 403);
    }
  }

  type RuleBody = { rule_number?: unknown; title?: string; body?: string };
  const body: RuleBody = await c.req.json<RuleBody>().catch((): RuleBody => ({}));

  if (!isValidRuleNumber(body.rule_number)) {
    return c.json({ error: "rule_number must be an integer between 1 and 20" }, 400);
  }
  const title = body.title?.trim() ?? "";
  if (title.length < 5 || title.length > 80) {
    return c.json({ error: "title must be 5–80 characters" }, 400);
  }
  const ruleBody = body.body?.trim() ?? "";
  if (ruleBody.length < 10 || ruleBody.length > 500) {
    return c.json({ error: "body must be 10–500 characters" }, 400);
  }

  const upsertResp = await sbPost(sb, "/rest/v1/community_rules", {
    community_id: id,
    rule_number:  body.rule_number,
    title,
    body:         ruleBody,
    created_by:   actor.id,
    updated_by:   actor.id,
  }, "return=representation,resolution=merge-duplicates");

  if (!upsertResp.ok) {
    const err = await upsertResp.text().catch(() => "");
    console.error(`[communities/rules/create] supabase error ${upsertResp.status} trace=${tid}`, err.slice(0, 200));
    return c.json({ error: "Failed to create rule" }, 500);
  }

  const rows = await upsertResp.json() as unknown[];
  console.log("[communities/rules/create]", JSON.stringify({
    communityId: id, ruleNumber: body.rule_number, actorId: actor.id,
    trace: tid, timestamp: new Date().toISOString(),
  }));

  return c.json({ rule: rows[0] ?? null }, 201);
});


// ══════════════════════════════════════════════════════════════════════════════
// COMMUNITY ROOMS
// ══════════════════════════════════════════════════════════════════════════════

/* ── GET /api/communities/:id/rooms ──────────────────────────────────── */

communities.get("/:id/rooms", async (c) => {
  const { id }   = c.req.param();
  const limit    = Math.min(Number(c.req.query("limit")  ?? 20), 100);
  const offset   = Math.max(Number(c.req.query("offset") ?? 0),  0);
  const liveOnly = c.req.query("live") === "true";
  const sb       = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  let path =
    `/rest/v1/rooms?community_id=eq.${id}&visibility=eq.public` +
    `&select=id,title,description,category,visibility,community_id,is_live,audience_count,cover_url,language,created_at,host:profiles!rooms_host_id_fkey(id,username,display_name,avatar_url,is_verified)` +
    `&order=is_live.desc,audience_count.desc,created_at.desc` +
    `&limit=${limit}&offset=${offset}`;

  if (liveOnly) path += "&is_live=eq.true";

  const resp = await sbGet(sb, path);
  if (!resp.ok) {
    console.error("[communities/rooms] supabase error:", resp.status);
    return c.json({ error: "Failed to fetch rooms" }, 500);
  }

  const data = await resp.json() as unknown[];
  return c.json({ rooms: data, count: data.length, offset, limit });
});


/* ── POST /api/communities/:id/rooms ─────────────────────────────────── */

type CreateRoomBody = {
  title?:       string;
  description?: string;
  category?:    string;
  visibility?:  string;
  language?:    string;
  cover_url?:   string;
};

communities.post("/:id/rooms", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const user   = c.get("user");
  const sb     = sbConn(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const tid    = traceId(c);

  const memCheck = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${user.id}&select=role&limit=1`);
  if (!memCheck.ok) return c.json({ error: "Failed to verify membership" }, 500);
  const memRows = await memCheck.json() as { role: CommunityRole }[];
  if (!memRows[0]) {
    return c.json({ error: "You must be a member of this community to create a room" }, 403);
  }

  const body: CreateRoomBody = await c.req
    .json<CreateRoomBody>()
    .catch((): CreateRoomBody => ({}));

  const title = body.title?.trim();
  if (!title || title.length < 2 || title.length > 120) {
    return c.json({ error: "title must be 2–120 characters" }, 400);
  }

  const createResp = await sbPost(sb, "/rest/v1/rooms", {
    title,
    description:    body.description ?? null,
    host_id:        user.id,
    community_id:   id,
    category:       body.category    ?? "general",
    visibility:     body.visibility  ?? "public",
    language:       body.language    ?? "en",
    cover_url:      body.cover_url   ?? null,
    is_live:        false,
    audience_count: 0,
  }, "return=representation");

  if (!createResp.ok) {
    const err = await createResp.text().catch(() => "");
    console.error(`[communities/create-room] supabase error ${createResp.status} trace=${tid}`, err.slice(0, 200));
    return c.json({ error: "Failed to create room" }, 500);
  }

  const rows = await createResp.json() as unknown[];
  const room  = rows[0];

  await sbPost(sb, "/rest/v1/rpc/increment_community_room_count", {
    p_community_id: id,
  }).catch((e: unknown) => {
    console.warn(`[communities/create-room] counter RPC failed trace=${tid}:`, e);
  });

  return c.json({ room }, 201);
});

export { communities };
