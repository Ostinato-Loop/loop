/**
 * Loop — Civic Engine Route
 *
 * Hono router mounted at /api/civic in src/index.ts.
 * Separation principle: civic truth MUST NOT mix with creator engagement.
 * Confirmations use witness count, not follower count or engagement.
 *
 * Routes
 * ──────
 *  GET    /api/civic/feed               — CIVIC rooms sorted by confirmations (public)
 *  GET    /api/civic/:roomId/status     — verification level + confirmation count (public)
 *  POST   /api/civic/:roomId/confirm    — witness confirmation (auth required)
 *  DELETE /api/civic/:roomId/confirm    — retract confirmation (auth required)
 *
 * Verification levels (auto-computed from confirmation_count):
 *   0–4   → UNVERIFIED
 *   5–14  → WITNESSED
 *   15–49 → LOCALLY_VERIFIED
 *   50+   → OFFICIALLY_CONFIRMED
 *
 * LILCKY STUDIO LIMITED · 2026-06-11
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

export const civic = new Hono<{
  Bindings:  CloudflareEnv;
  Variables: { user: AuthUser };
}>();

type VerificationLevel = "UNVERIFIED" | "WITNESSED" | "LOCALLY_VERIFIED" | "OFFICIALLY_CONFIRMED";

function computeLevel(count: number): VerificationLevel {
  if (count >= 50) return "OFFICIALLY_CONFIRMED";
  if (count >= 15) return "LOCALLY_VERIFIED";
  if (count >= 5)  return "WITNESSED";
  return "UNVERIFIED";
}

function sbh(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" };
}

/* ── GET /api/civic/feed ────────────────────────────────────────────── */
civic.get("/feed", async (c) => {
  const sbUrl  = c.env.SUPABASE_URL;
  const sbKey  = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const limit  = Math.min(Number(c.req.query("limit")  ?? 20), 100);
  const offset = Math.max(Number(c.req.query("offset") ?? 0),   0);

  const qs = new URLSearchParams({
    select:    "*,host:profiles!rooms_host_id_fkey(username,display_name,avatar_url,is_verified)",
    room_type: "eq.CIVIC",
    order:     "confirmation_count.desc,is_live.desc,created_at.desc",
    limit:     String(limit),
    offset:    String(offset),
  });

  const resp = await fetch(`${sbUrl}/rest/v1/rooms?${qs}`, { headers: sbh(sbKey) });
  if (!resp.ok) return c.json({ rooms: [], total: 0 });
  const rows = await resp.json() as Record<string, unknown>[];
  return c.json({
    rooms: rows.map(r => ({ ...r, verification_level: computeLevel(Number(r.confirmation_count ?? 0)) })),
    total: rows.length,
  });
});

/* ── GET /api/civic/:roomId/status ───────────────────────────────────── */
civic.get("/:roomId/status", async (c) => {
  const roomId = c.req.param("roomId");
  const sbUrl  = c.env.SUPABASE_URL;
  const sbKey  = c.env.SUPABASE_SERVICE_ROLE_KEY;

  const qs = new URLSearchParams({ select: "id,room_type,confirmation_count", id: `eq.${roomId}`, limit: "1" });
  const resp = await fetch(`${sbUrl}/rest/v1/rooms?${qs}`, { headers: sbh(sbKey) });
  if (!resp.ok) return c.json({ error: "Failed to fetch room" }, 502);
  const rows = await resp.json() as Record<string, unknown>[];
  if (!rows.length) return c.json({ error: "Room not found" }, 404);

  const count = Number(rows[0].confirmation_count ?? 0);
  return c.json({
    room_id:            roomId,
    room_type:          rows[0].room_type,
    confirmation_count: count,
    verification_level: computeLevel(count),
    thresholds:         { witnessed: 5, locally_verified: 15, officially_confirmed: 50 },
  });
});

/* ── POST /api/civic/:roomId/confirm ────────────────────────────────── */
civic.post("/:roomId/confirm", requireAuth(), async (c) => {
  const roomId = c.req.param("roomId");
  const user   = c.get("user");
  const sbUrl  = c.env.SUPABASE_URL;
  const sbKey  = c.env.SUPABASE_SERVICE_ROLE_KEY;

  // Verify the room is CIVIC type
  const checkQs = new URLSearchParams({ select: "id,room_type", id: `eq.${roomId}`, limit: "1" });
  const checkResp = await fetch(`${sbUrl}/rest/v1/rooms?${checkQs}`, { headers: sbh(sbKey) });
  if (checkResp.ok) {
    const rooms = await checkResp.json() as Record<string, unknown>[];
    if (!rooms.length) return c.json({ error: "Room not found" }, 404);
    if (rooms[0].room_type !== "CIVIC") return c.json({ error: "Only CIVIC rooms can receive confirmations" }, 400);
  }

  const body   = await c.req.json().catch(() => ({})) as { region?: string };
  const insResp = await fetch(`${sbUrl}/rest/v1/civic_confirmations`, {
    method:  "POST",
    headers: { ...sbh(sbKey), Prefer: "return=representation" },
    body:    JSON.stringify({ room_id: roomId, confirmer_id: user.id, region: body.region ?? null }),
  });

  if (!insResp.ok) {
    const txt = await insResp.text().catch(() => "");
    if (txt.includes("unique") || insResp.status === 409) {
      return c.json({ ok: false, confirmed: false, message: "Already confirmed" }, 409);
    }
    return c.json({ error: "Failed to record confirmation" }, 502);
  }

  const countQs = new URLSearchParams({ select: "confirmation_count", id: `eq.${roomId}`, limit: "1" });
  const countResp = await fetch(`${sbUrl}/rest/v1/rooms?${countQs}`, { headers: sbh(sbKey) });
  let count = 0;
  if (countResp.ok) {
    const rows = await countResp.json() as Record<string, unknown>[];
    count = Number(rows[0]?.confirmation_count ?? 0);
  }

  return c.json({ ok: true, confirmed: true, confirmation_count: count, verification_level: computeLevel(count) }, 201);
});

/* ── DELETE /api/civic/:roomId/confirm ──────────────────────────────── */
civic.delete("/:roomId/confirm", requireAuth(), async (c) => {
  const roomId = c.req.param("roomId");
  const user   = c.get("user");
  const sbUrl  = c.env.SUPABASE_URL;
  const sbKey  = c.env.SUPABASE_SERVICE_ROLE_KEY;

  const qs = new URLSearchParams({ room_id: `eq.${roomId}`, confirmer_id: `eq.${user.id}` });
  const resp = await fetch(`${sbUrl}/rest/v1/civic_confirmations?${qs}`, { method: "DELETE", headers: sbh(sbKey) });
  if (!resp.ok && resp.status !== 404) return c.json({ error: "Failed to retract" }, 502);
  return c.json({ ok: true, confirmed: false });
});
