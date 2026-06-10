/**
 * Loop API — Notification Routes (Cloudflare Worker / Hono)
 * Mounted at /api/notifications + /api/notify in src/index.ts
 *
 * GET  /api/notifications           — list unread notifications for current user
 * GET  /api/notifications/count     — unread count (for badge)
 * POST /api/notifications/read      — mark notifications as read (batch)
 * POST /api/notify/dm               — webhook: Messenger CF Worker posts here when DM arrives
 *
 * HARDENING-001 (2026-06-10):
 *   - Added room_live + new_follower to the notification type filter.
 *   - These types were inserted into the DB via 009_push_subscriptions.sql but
 *     were excluded from the query, making them invisible to clients.
 *
 * LILCKY STUDIO LIMITED
 */

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

const notifications = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { user: AuthUser };
}>();

/** All notification types the client should receive. */
const NOTIFICATION_TYPES = [
  "direct_message",
  "friend_request",
  "connection_accepted",
  "room_live",
  "new_follower",
] as const;

function sb(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ── GET /api/notifications ──────────────────────────────────────────── */
notifications.get("/", requireAuth(), async (c) => {
  const user        = c.get("user");
  const limit       = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const includeRead = c.req.query("include_read") === "true";
  const typeFilter  = c.req.query("type");

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  let q = supabase
    .from("notifications")
    .select(`
      id, type, resource_id, resource_type, data, read_at, created_at,
      actor:profiles!notifications_actor_id_fkey (
        id, username, display_name, avatar_url, is_verified
      )
    `)
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Type filter: accept a specific type from query param, else show all known types
  if (typeFilter && NOTIFICATION_TYPES.includes(typeFilter as typeof NOTIFICATION_TYPES[number])) {
    q = q.eq("type", typeFilter);
  } else {
    q = q.in("type", [...NOTIFICATION_TYPES]);
  }

  if (!includeRead) q = q.is("read_at", null);

  const { data, error } = await q;
  if (error) {
    console.error("[notifications] list failed:", error.message);
    return c.json({ error: "Failed to fetch notifications" }, 500);
  }
  return c.json({ notifications: data ?? [], count: (data ?? []).length });
});

/* ── GET /api/notifications/count ────────────────────────────────────── */
notifications.get("/count", requireAuth(), async (c) => {
  const user     = c.get("user");
  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .in("type", [...NOTIFICATION_TYPES])
    .is("read_at", null);

  if (error) {
    console.error("[notifications] count failed:", error.message);
    return c.json({ error: "Failed to count notifications" }, 500);
  }
  return c.json({ unread: count ?? 0 });
});

/* ── POST /api/notifications/read ────────────────────────────────────── */
type ReadBody = { ids?: string[]; all?: boolean };

notifications.post("/read", requireAuth(), async (c) => {
  const user           = c.get("user");
  const body           = (await c.req.json().catch(() => ({}))) as ReadBody;
  const { ids, all }   = body;

  if (!all && (!Array.isArray(ids) || ids.length === 0)) {
    return c.json({ error: "Provide ids[] or all:true" }, 400);
  }

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (!all && ids) q = q.in("id", ids);

  const { error } = await q;
  if (error) {
    console.error("[notifications] mark read failed:", error.message);
    return c.json({ error: "Failed to mark notifications as read" }, 500);
  }
  return c.json({ ok: true });
});

/* ── POST /api/notify/dm ─────────────────────────────────────────────── */
// Internal webhook — called by the Messenger CF Worker when a DM is sent.
// Authenticated with shared MESSENGER_WEBHOOK_KEY header (not RALD JWT).
const notifyRouter = new Hono<{ Bindings: CloudflareEnv }>();

type DmWebhookBody = {
  recipient_id?: string;
  actor_id?:     string;
  resource_id?:  string;
  data?: { preview?: string; conversation_id?: string };
};

notifyRouter.post("/dm", async (c) => {
  const webhookKey = c.req.header("x-messenger-webhook-key");
  const envKey     = c.env.MESSENGER_WEBHOOK_KEY;

  if (!envKey)                              return c.json({ error: "DM notifications not configured" }, 503);
  if (!webhookKey || webhookKey !== envKey) return c.json({ error: "Invalid webhook key" }, 401);

  const body = (await c.req.json().catch(() => ({}))) as DmWebhookBody;
  const { recipient_id, actor_id, resource_id, data } = body;

  if (!recipient_id || !actor_id || !resource_id) {
    return c.json({ error: "recipient_id, actor_id, and resource_id are required" }, 400);
  }
  if (recipient_id === actor_id) return c.json({ ok: true, skipped: "self-message" });

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("notifications").insert({
    recipient_id,
    actor_id,
    type:          "direct_message",
    resource_id,
    resource_type: "message",
    data: {
      preview:         (data?.preview ?? "").slice(0, 80),
      conversation_id: data?.conversation_id,
    },
  });

  if (error && !error.message.includes("already exists")) {
    console.error("[notifications] dm webhook failed:", error.message);
    return c.json({ error: "Failed to create DM notification" }, 500);
  }
  return c.json({ ok: true });
});

export { notifications, notifyRouter };
