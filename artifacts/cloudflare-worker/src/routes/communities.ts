/**
 * Loop V2 — Communities Routes
 *
 * Communities are the PRIMARY entity. Rooms, discovery, and membership
 * all revolve around communities.
 *
 * POST   /api/communities                  create community (requireAuth)
 * GET    /api/communities                  list communities (public)
 * GET    /api/communities/:slug            get community by slug
 * PATCH  /api/communities/:id              update community (owner/admin)
 * DELETE /api/communities/:id              delete community (owner only)
 * GET    /api/communities/:id/members      list members
 * POST   /api/communities/:id/join         join community (requireAuth)
 * DELETE /api/communities/:id/leave        leave community (requireAuth)
 * GET    /api/communities/:id/rooms        list rooms in community
 * POST   /api/communities/:id/rooms        create room in community (requireAuth + member)
 *
 * Slug rules (exported for unit tests):
 *   - 3–48 characters
 *   - lowercase letters, digits, hyphens only
 *   - must start and end with a letter or digit
 *   - no consecutive hyphens
 *   - auto-generated from name if not provided
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { verifyJwt } from "../lib/jwt.js";
import type {
  CommunityCategory,
  CommunityVisibility,
  CommunityRole,
} from "@workspace/loop-shared-types";

export const communities = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { user: AuthUser };
}>();

/* ── Slug utilities (exported for unit tests) ────────────────────────── */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes("--");
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

const VALID_CATEGORIES = new Set<string>([
  "technology", "culture", "education", "sports", "faith",
  "business", "local", "news", "entertainment", "health", "general",
]);

export function isValidCommunityCategory(cat: string): cat is CommunityCategory {
  return VALID_CATEGORIES.has(cat);
}

const VALID_VISIBILITIES = new Set<string>([
  "public", "private", "invite_only",
]);

export function isValidCommunityVisibility(v: string): v is CommunityVisibility {
  return VALID_VISIBILITIES.has(v);
}

/* ── Supabase REST helpers ───────────────────────────────────────────── */

interface SbClient {
  url:     string;
  headers: Record<string, string>;
}

function sbClient(supabaseUrl: string, serviceKey: string): SbClient {
  return {
    url: supabaseUrl.replace(/\/$/, ""),
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${serviceKey}`,
      apikey:         serviceKey,
    },
  };
}

async function sbGet(client: SbClient, path: string): Promise<Response> {
  return fetch(`${client.url}${path}`, { headers: client.headers });
}

async function sbPost(client: SbClient, path: string, body: unknown, prefer?: string): Promise<Response> {
  return fetch(`${client.url}${path}`, {
    method:  "POST",
    headers: prefer
      ? { ...client.headers, Prefer: prefer }
      : client.headers,
    body:    JSON.stringify(body),
  });
}

async function sbPatch(client: SbClient, path: string, body: unknown): Promise<Response> {
  return fetch(`${client.url}${path}`, {
    method:  "PATCH",
    headers: { ...client.headers, Prefer: "return=representation" },
    body:    JSON.stringify(body),
  });
}

async function sbDelete(client: SbClient, path: string): Promise<Response> {
  return fetch(`${client.url}${path}`, {
    method:  "DELETE",
    headers: { ...client.headers, Prefer: "return=minimal" },
  });
}

/* ── POST /api/communities ───────────────────────────────────────────── */

communities.post("/", requireAuth(), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    name?:        string;
    slug?:        string;
    description?: string;
    cover_url?:   string;
    category?:    string;
    visibility?:  string;
  }>().catch(() => ({}));

  const name = body.name?.trim();
  if (!name || name.length < 2 || name.length > 100) {
    return c.json({ error: "name must be 2–100 characters" }, 400);
  }

  const category = body.category ?? "general";
  if (!isValidCommunityCategory(category)) {
    return c.json({ error: `invalid category: ${category}` }, 400);
  }

  const visibility: CommunityVisibility = (
    body.visibility && isValidCommunityVisibility(body.visibility)
      ? body.visibility
      : "public"
  );

  const slug = body.slug
    ? body.slug.toLowerCase().trim()
    : slugify(name);

  if (!isValidSlug(slug)) {
    return c.json({
      error: "slug must be 3–48 chars, lowercase letters/digits/hyphens only, no consecutive hyphens",
    }, 400);
  }

  const sb = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  // Check slug uniqueness
  const slugCheck = await sbGet(sb,
    `/rest/v1/communities?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`);
  if (slugCheck.ok) {
    const existing = await slugCheck.json() as { id: string }[];
    if (existing.length > 0) {
      return c.json({ error: "slug is already taken" }, 409);
    }
  }

  const createResp = await sbPost(sb, "/rest/v1/communities", {
    name,
    slug,
    description:  body.description ?? null,
    cover_url:    body.cover_url   ?? null,
    category:     category         as CommunityCategory,
    visibility,
    owner_id:     user.id,
    member_count: 1,
    room_count:   0,
  }, "return=representation");

  if (!createResp.ok) {
    const err = await createResp.text().catch(() => "");
    console.error("[communities/create] supabase error:", createResp.status, err.slice(0, 200));
    return c.json({ error: "Failed to create community" }, 500);
  }

  const rows = await createResp.json() as { id: string; slug: string }[];
  const community = rows[0];
  if (!community) return c.json({ error: "Failed to create community" }, 500);

  // Add owner as first member
  await sbPost(sb, "/rest/v1/community_members", {
    community_id: community.id,
    user_id:      user.id,
    role:         "owner" as CommunityRole,
  }, "return=minimal");

  console.log("[communities/create]", JSON.stringify({
    communityId: community.id,
    slug:        community.slug,
    ownerId:     user.id,
    timestamp:   new Date().toISOString(),
  }));

  return c.json({ community }, 201);
});

/* ── GET /api/communities ────────────────────────────────────────────── */

communities.get("/", async (c) => {
  const limit    = Math.min(Number(c.req.query("limit")  ?? 20), 100);
  const offset   = Math.max(Number(c.req.query("offset") ?? 0),  0);
  const category = c.req.query("category");
  const search   = c.req.query("search");

  const sb = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  let path =
    `/rest/v1/communities` +
    `?visibility=eq.public` +
    `&select=id,name,slug,description,cover_url,category,visibility,member_count,room_count,is_verified,created_at,updated_at,owner:profiles!communities_owner_id_fkey(id,username,display_name,avatar_url,is_verified)` +
    `&order=member_count.desc,created_at.desc` +
    `&limit=${limit}&offset=${offset}`;

  if (category && isValidCommunityCategory(category)) {
    path += `&category=eq.${encodeURIComponent(category)}`;
  }

  if (search) {
    const term = encodeURIComponent(search.slice(0, 50));
    path += `&name=ilike.*${term}*`;
  }

  const resp = await sbGet(sb, path);
  if (!resp.ok) {
    console.error("[communities/list] supabase error:", resp.status);
    return c.json({ error: "Failed to fetch communities" }, 500);
  }

  const data = await resp.json() as unknown[];

  return c.json({ communities: data, count: data.length, offset, limit });
});

/* ── GET /api/communities/:slug ──────────────────────────────────────── */

communities.get("/:slug", async (c) => {
  const { slug } = c.req.param();
  const sb = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const resp = await sbGet(sb,
    `/rest/v1/communities?slug=eq.${encodeURIComponent(slug)}` +
    `&select=id,name,slug,description,cover_url,category,visibility,owner_id,member_count,room_count,is_verified,created_at,updated_at,owner:profiles!communities_owner_id_fkey(id,username,display_name,avatar_url,is_verified)` +
    `&limit=1`);

  if (!resp.ok) return c.json({ error: "Failed to fetch community" }, 500);

  const rows = await resp.json() as { id: string; visibility: string; owner_id: string }[];
  const community = rows[0];
  if (!community) return c.json({ error: "Community not found" }, 404);

  // Resolve membership from optional auth header
  let isMember   = false;
  let memberRole: CommunityRole | null = null;

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const payload = await verifyJwt(authHeader.slice(7), c.env.RALD_JWT_SECRET);
    const userId  = payload
      ? (payload.id ?? payload.sub) as string | undefined
      : undefined;

    if (userId) {
      const memResp = await sbGet(sb,
        `/rest/v1/community_members?community_id=eq.${community.id}&user_id=eq.${userId}&select=role&limit=1`);
      if (memResp.ok) {
        const memRows = await memResp.json() as { role: CommunityRole }[];
        if (memRows[0]) {
          isMember   = true;
          memberRole = memRows[0].role;
        }
      }
    }
  }

  if (community.visibility !== "public" && !isMember) {
    return c.json({ error: "Community not found" }, 404);
  }

  return c.json({ community, is_member: isMember, member_role: memberRole });
});

/* ── PATCH /api/communities/:id ──────────────────────────────────────── */

communities.patch("/:id", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const sb = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const memResp = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${user.id}&select=role&limit=1`);
  if (!memResp.ok) return c.json({ error: "Failed to verify permissions" }, 500);

  const memRows = await memResp.json() as { role: CommunityRole }[];
  const membership = memRows[0];
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return c.json({ error: "Forbidden — owner or admin required" }, 403);
  }

  const body = await c.req.json<{
    name?:        string;
    description?: string;
    cover_url?:   string;
    category?:    string;
    visibility?:  string;
  }>().catch(() => ({}));

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      return c.json({ error: "name must be 2–100 characters" }, 400);
    }
    patch.name = trimmed;
  }

  if (body.description !== undefined) patch.description = body.description;
  if (body.cover_url    !== undefined) patch.cover_url   = body.cover_url;

  if (body.category !== undefined) {
    if (!isValidCommunityCategory(body.category)) {
      return c.json({ error: `invalid category: ${body.category}` }, 400);
    }
    patch.category = body.category;
  }

  if (body.visibility !== undefined) {
    if (membership.role !== "owner") {
      return c.json({ error: "Forbidden — only owner can change visibility" }, 403);
    }
    if (!isValidCommunityVisibility(body.visibility)) {
      return c.json({ error: `invalid visibility: ${body.visibility}` }, 400);
    }
    patch.visibility = body.visibility;
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const updateResp = await sbPatch(sb, `/rest/v1/communities?id=eq.${id}`, patch);
  if (!updateResp.ok) {
    console.error("[communities/update] supabase error:", updateResp.status);
    return c.json({ error: "Failed to update community" }, 500);
  }

  const updated = await updateResp.json() as unknown[];
  return c.json({ community: updated[0] });
});

/* ── DELETE /api/communities/:id ─────────────────────────────────────── */

communities.delete("/:id", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const sb = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const ownerCheck = await sbGet(sb,
    `/rest/v1/communities?id=eq.${id}&owner_id=eq.${user.id}&select=id&limit=1`);
  if (!ownerCheck.ok) return c.json({ error: "Failed to verify ownership" }, 500);

  const owned = await ownerCheck.json() as { id: string }[];
  if (!owned[0]) {
    return c.json({ error: "Community not found or you are not the owner" }, 403);
  }

  const deleteResp = await sbDelete(sb, `/rest/v1/communities?id=eq.${id}`);
  if (!deleteResp.ok) {
    console.error("[communities/delete] supabase error:", deleteResp.status);
    return c.json({ error: "Failed to delete community" }, 500);
  }

  console.log("[communities/delete]", JSON.stringify({
    communityId: id, ownerId: user.id, timestamp: new Date().toISOString(),
  }));

  return c.json({ ok: true });
});

/* ── GET /api/communities/:id/members ────────────────────────────────── */

communities.get("/:id/members", async (c) => {
  const { id } = c.req.param();
  const limit  = Math.min(Number(c.req.query("limit")  ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0),  0);
  const role   = c.req.query("role");
  const sb     = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  // Verify community exists
  const commResp = await sbGet(sb,
    `/rest/v1/communities?id=eq.${id}&select=id,visibility&limit=1`);
  if (!commResp.ok) return c.json({ error: "Failed to fetch community" }, 500);
  const commRows = await commResp.json() as { id: string; visibility: string }[];
  if (!commRows[0]) return c.json({ error: "Community not found" }, 404);

  let path =
    `/rest/v1/community_members?community_id=eq.${id}` +
    `&select=community_id,user_id,role,joined_at,profile:profiles!community_members_user_id_fkey(username,display_name,avatar_url,is_verified)` +
    `&order=role.asc,joined_at.asc` +
    `&limit=${limit}&offset=${offset}`;

  if (role && ["owner", "admin", "member"].includes(role)) {
    path += `&role=eq.${encodeURIComponent(role)}`;
  }

  const resp = await sbGet(sb, path);
  if (!resp.ok) return c.json({ error: "Failed to fetch members" }, 500);

  const data = await resp.json() as unknown[];
  return c.json({ members: data, count: data.length, offset, limit });
});

/* ── POST /api/communities/:id/join ─────────────────────────────────── */

communities.post("/:id/join", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const sb = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const commResp = await sbGet(sb,
    `/rest/v1/communities?id=eq.${id}&select=id,visibility&limit=1`);
  if (!commResp.ok) return c.json({ error: "Failed to fetch community" }, 500);
  const commRows = await commResp.json() as { id: string; visibility: string }[];
  if (!commRows[0]) return c.json({ error: "Community not found" }, 404);

  if (commRows[0].visibility === "invite_only") {
    return c.json({ error: "This community is invite-only" }, 403);
  }

  // Check not already a member
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
    console.error("[communities/join] supabase error:", joinResp.status, err.slice(0, 200));
    return c.json({ error: "Failed to join community" }, 500);
  }

  // Non-fatal counter increment via RPC
  await sbPost(sb, "/rest/v1/rpc/increment_community_member_count", {
    p_community_id: id,
  }).catch((e: unknown) => {
    console.warn("[communities/join] counter RPC failed:", e);
  });

  console.log("[communities/join]", JSON.stringify({
    communityId: id, userId: user.id, timestamp: new Date().toISOString(),
  }));

  const role: CommunityRole = "member";
  return c.json({ ok: true, role });
});

/* ── DELETE /api/communities/:id/leave ───────────────────────────────── */

communities.delete("/:id/leave", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const sb = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const memCheck = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${user.id}&select=role&limit=1`);
  if (!memCheck.ok) return c.json({ error: "Failed to verify membership" }, 500);
  const memRows = await memCheck.json() as { role: CommunityRole }[];
  const membership = memRows[0];

  if (!membership) {
    return c.json({ error: "You are not a member of this community" }, 404);
  }
  if (membership.role === "owner") {
    return c.json({
      error: "Owner cannot leave. Transfer ownership first or delete the community.",
    }, 403);
  }

  const leaveResp = await sbDelete(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${user.id}`);

  if (!leaveResp.ok) {
    console.error("[communities/leave] supabase error:", leaveResp.status);
    return c.json({ error: "Failed to leave community" }, 500);
  }

  // Non-fatal counter decrement
  await sbPost(sb, "/rest/v1/rpc/decrement_community_member_count", {
    p_community_id: id,
  }).catch((e: unknown) => {
    console.warn("[communities/leave] counter RPC failed:", e);
  });

  return c.json({ ok: true });
});

/* ── GET /api/communities/:id/rooms ──────────────────────────────────── */

communities.get("/:id/rooms", async (c) => {
  const { id }   = c.req.param();
  const limit    = Math.min(Number(c.req.query("limit")  ?? 20), 100);
  const offset   = Math.max(Number(c.req.query("offset") ?? 0),  0);
  const liveOnly = c.req.query("live") === "true";
  const sb       = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

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

communities.post("/:id/rooms", requireAuth(), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const sb = sbClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  // Must be a member (any role) to create a room in this community
  const memCheck = await sbGet(sb,
    `/rest/v1/community_members?community_id=eq.${id}&user_id=eq.${user.id}&select=role&limit=1`);
  if (!memCheck.ok) return c.json({ error: "Failed to verify membership" }, 500);
  const memRows = await memCheck.json() as { role: CommunityRole }[];
  if (!memRows[0]) {
    return c.json({
      error: "You must be a member of this community to create a room",
    }, 403);
  }

  const body = await c.req.json<{
    title?:       string;
    description?: string;
    category?:    string;
    visibility?:  string;
    language?:    string;
    cover_url?:   string;
  }>().catch(() => ({}));

  const title = body.title?.trim();
  if (!title || title.length < 2 || title.length > 120) {
    return c.json({ error: "title must be 2–120 characters" }, 400);
  }

  const createResp = await sbPost(sb, "/rest/v1/rooms", {
    title,
    description:   body.description ?? null,
    host_id:       user.id,
    community_id:  id,
    category:      body.category   ?? "general",
    visibility:    body.visibility ?? "public",
    language:      body.language   ?? "en",
    cover_url:     body.cover_url  ?? null,
    is_live:       false,
    audience_count: 0,
  }, "return=representation");

  if (!createResp.ok) {
    const err = await createResp.text().catch(() => "");
    console.error("[communities/create-room] supabase error:", createResp.status, err.slice(0, 200));
    return c.json({ error: "Failed to create room" }, 500);
  }

  const rows = await createResp.json() as unknown[];
  const room  = rows[0];

  // Non-fatal room counter increment
  await sbPost(sb, "/rest/v1/rpc/increment_community_room_count", {
    p_community_id: id,
  }).catch((e: unknown) => {
    console.warn("[communities/create-room] counter RPC failed:", e);
  });

  return c.json({ room }, 201);
});
