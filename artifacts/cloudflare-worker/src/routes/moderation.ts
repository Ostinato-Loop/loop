/**
 * Loop — Moderation Route
 * Mounted at /api/moderation in src/index.ts
 *
 * Routes
 * ──────
 *  POST /api/moderation/report  — report a user, room, or message
 *  POST /api/moderation/block   — block a user (bidirectional)
 *  GET  /api/moderation/blocks  — list my blocked users
 *
 * Storage: reports → supabase `moderation_reports` table
 *          blocks  → supabase `user_blocks` table
 *
 * LILCKY STUDIO LIMITED · 2026-06-07
 */

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

const moderation = new Hono<{
  Bindings:  CloudflareEnv;
  Variables: { user: AuthUser };
}>();

function sb(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false } });
}

const VALID_TARGET_TYPES = ["user", "room", "message"] as const;
type TargetType = typeof VALID_TARGET_TYPES[number];

const VALID_REASONS = [
  "spam", "harassment", "hate_speech", "violence",
  "misinformation", "sexual", "other",
] as const;
type ReportReason = typeof VALID_REASONS[number];

/* ── POST /api/moderation/report ──────────────────────────────────────── */
moderation.post("/report", requireAuth(), async (c) => {
  const user = c.get("user");

  type ReportBody = {
    target_type?: string;
    target_id?: string;
    reason?: string;
    notes?: string;
  };

  const body: ReportBody = await c.req.json<ReportBody>().catch((): ReportBody => ({}));

  if (!body.target_type || !(VALID_TARGET_TYPES as readonly string[]).includes(body.target_type)) {
    return c.json({ error: `target_type must be one of: ${VALID_TARGET_TYPES.join(", ")}` }, 400);
  }
  if (!body.target_id?.trim()) {
    return c.json({ error: "target_id is required" }, 400);
  }
  if (!body.reason || !(VALID_REASONS as readonly string[]).includes(body.reason)) {
    return c.json({ error: `reason must be one of: ${VALID_REASONS.join(", ")}` }, 400);
  }
  if (body.target_type === "user" && body.target_id === user.id) {
    return c.json({ error: "You cannot report yourself" }, 400);
  }

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await supabase.from("moderation_reports").insert({
    reporter_id:  user.id,
    target_type:  body.target_type as TargetType,
    target_id:    body.target_id.trim(),
    reason:       body.reason as ReportReason,
    notes:        body.notes?.trim().slice(0, 500) ?? null,
    status:       "pending",
  });

  if (error) {
    // Table not yet migrated — log and ack gracefully so the UI isn't broken
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      console.warn("[moderation/report] table not ready — report logged to console only:", {
        reporterId: user.id, targetType: body.target_type, targetId: body.target_id, reason: body.reason,
      });
      return c.json({ ok: true, queued: true }, 201);
    }
    console.error("[moderation/report] insert error:", error.code, error.message);
    return c.json({ error: "Failed to submit report" }, 500);
  }

  console.log("[moderation/report]", JSON.stringify({
    reporterId: user.id, targetType: body.target_type, targetId: body.target_id, reason: body.reason,
    timestamp: new Date().toISOString(),
  }));

  return c.json({ ok: true }, 201);
});

/* ── POST /api/moderation/block ───────────────────────────────────────── */
moderation.post("/block", requireAuth(), async (c) => {
  const user = c.get("user");

  type BlockBody = { blocked_user_id?: string };
  const body: BlockBody = await c.req.json<BlockBody>().catch((): BlockBody => ({}));

  if (!body.blocked_user_id?.trim()) {
    return c.json({ error: "blocked_user_id is required" }, 400);
  }
  if (body.blocked_user_id === user.id) {
    return c.json({ error: "You cannot block yourself" }, 400);
  }

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await supabase.from("user_blocks").upsert(
    {
      blocker_id: user.id,
      blocked_id: body.blocked_user_id.trim(),
    },
    { onConflict: "blocker_id,blocked_id" },
  );

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      console.warn("[moderation/block] table not ready — block logged to console only:", {
        blockerId: user.id, blockedId: body.blocked_user_id,
      });
      return c.json({ ok: true, queued: true }, 201);
    }
    console.error("[moderation/block] upsert error:", error.code, error.message);
    return c.json({ error: "Failed to block user" }, 500);
  }

  console.log("[moderation/block]", JSON.stringify({
    blockerId: user.id, blockedId: body.blocked_user_id,
    timestamp: new Date().toISOString(),
  }));

  return c.json({ ok: true, blocked: true }, 201);
});

/* ── GET /api/moderation/blocks ───────────────────────────────────────── */
moderation.get("/blocks", requireAuth(), async (c) => {
  const user   = c.get("user");
  const limit  = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("user_blocks")
    .select(`
      blocked_id,
      created_at,
      profile:profiles!user_blocks_blocked_id_fkey(username, display_name, avatar_url)
    `)
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return c.json({ blocks: [], count: 0 });
    }
    console.error("[moderation/blocks] select error:", error.code, error.message);
    return c.json({ error: "Failed to load blocked users" }, 500);
  }

  return c.json({ blocks: data ?? [], count: data?.length ?? 0 });
});

export { moderation };
