/**
 * Loop — Creator Engine Route
 *
 * Hono router mounted at /api/creator in src/index.ts.
 * Separation principle: Creator Engine ranks by local velocity, not global totals.
 * 500 listeners in Lagos in 10 min outranks 5,000 listeners globally in 2 h.
 *
 * Routes
 * ──────
 *  GET /api/creator/feed      — CREATOR rooms sorted by audience + live status
 *  GET /api/creator/trending  — CREATOR rooms ranked by local velocity (acceleration)
 *  GET /api/creator/rankings  — top creator profiles aggregated by live audience
 *
 * Creator Categories: radio, dj-session, commentary, education, business, community
 *
 * LILCKY STUDIO LIMITED · 2026-06-11
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";

export const creator = new Hono<{
  Bindings:  CloudflareEnv;
  Variables: { user: AuthUser };
}>();

function sbh(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" };
}

type RoomRow = Record<string, unknown> & {
  id: string;
  audience_count: number;
  created_at: string;
  host_id: string;
  category: string;
};

/** Velocity = audience_count / max(1, age_minutes) — local acceleration metric */
function velocity(room: RoomRow): number {
  const ageMs = Date.now() - new Date(room.created_at).getTime();
  const ageMins = Math.max(1, ageMs / 60_000);
  return (room.audience_count as number) / ageMins;
}

/* ── GET /api/creator/feed ──────────────────────────────────────────── */
creator.get("/feed", async (c) => {
  const sbUrl    = c.env.SUPABASE_URL;
  const sbKey    = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const limit    = Math.min(Number(c.req.query("limit")  ?? 20), 100);
  const offset   = Math.max(Number(c.req.query("offset") ?? 0),   0);
  const category = c.req.query("category");

  const qs = new URLSearchParams({
    select:    "*,host:profiles!rooms_host_id_fkey(username,display_name,avatar_url,is_verified)",
    room_type: "eq.CREATOR",
    order:     "is_live.desc,audience_count.desc,created_at.desc",
    limit:     String(limit),
    offset:    String(offset),
  });
  if (category) qs.set("category", `eq.${category}`);

  const resp = await fetch(`${sbUrl}/rest/v1/rooms?${qs}`, { headers: sbh(sbKey) });
  if (!resp.ok) return c.json({ rooms: [], total: 0 });
  const rooms = await resp.json() as RoomRow[];
  return c.json({ rooms, total: rooms.length });
});

/* ── GET /api/creator/trending ──────────────────────────────────────── */
creator.get("/trending", async (c) => {
  const sbUrl  = c.env.SUPABASE_URL;
  const sbKey  = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const limit  = Math.min(Number(c.req.query("limit") ?? 20), 50);
  const region = c.req.query("region");

  const qs = new URLSearchParams({
    select:    "*,host:profiles!rooms_host_id_fkey(username,display_name,avatar_url,is_verified)",
    room_type: "eq.CREATOR",
    is_live:   "eq.true",
    order:     "audience_count.desc",
    limit:     "100",
  });

  const resp = await fetch(`${sbUrl}/rest/v1/rooms?${qs}`, { headers: sbh(sbKey) });
  if (!resp.ok) return c.json({ rooms: [], region: region ?? null });
  const all = await resp.json() as RoomRow[];

  const ranked = all
    .map(r => ({ ...r, _velocity: velocity(r) }))
    .sort((a, b) => (b._velocity as number) - (a._velocity as number))
    .slice(0, limit)
    .map(({ _velocity, ...r }) => ({ ...r, velocity: Math.round(_velocity * 100) / 100 }));

  return c.json({ rooms: ranked, region: region ?? null, count: ranked.length, algorithm: "local_velocity" });
});

/* ── GET /api/creator/rankings ──────────────────────────────────────── */
creator.get("/rankings", async (c) => {
  const sbUrl = c.env.SUPABASE_URL;
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const limit = Math.min(Number(c.req.query("limit") ?? 10), 50);

  const qs = new URLSearchParams({
    select:    "host_id,audience_count,category",
    room_type: "eq.CREATOR",
    is_live:   "eq.true",
    order:     "audience_count.desc",
    limit:     String(limit * 3),
  });

  const resp = await fetch(`${sbUrl}/rest/v1/rooms?${qs}`, { headers: sbh(sbKey) });
  if (!resp.ok) return c.json({ rankings: [] });
  const rows = await resp.json() as { host_id: string; audience_count: number; category: string }[];

  const byHost = new Map<string, { host_id: string; total: number; categories: Set<string> }>();
  for (const row of rows) {
    const e = byHost.get(row.host_id);
    if (e) { e.total += row.audience_count; e.categories.add(row.category); }
    else byHost.set(row.host_id, { host_id: row.host_id, total: row.audience_count, categories: new Set([row.category]) });
  }

  const rankings = Array.from(byHost.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, host_id: r.host_id, live_audience: r.total, categories: [...r.categories] }));

  return c.json({ rankings, algorithm: "live_audience_aggregated" });
});
