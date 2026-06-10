// Loop API — Notification Routes
// Trust & Retention Sprint — Phase N
//
// GET  /api/notifications           — list unread notifications for current user
// GET  /api/notifications/count     — unread count (for badge)
// POST /api/notifications/read      — mark notifications as read (batch)
// POST /api/notify/dm               — webhook: Messenger CF Worker posts here when DM arrives
//
// ENABLED types: direct_message | friend_request | connection_accepted
// Everything else is blocked at the database constraint level.
// LILCKY STUDIO LIMITED

import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { verifyJwt } from "../lib/jwt";

const router = Router();

const RALD_JWT_SECRET       = process.env["RALD_JWT_SECRET"] ?? "";
const SUPABASE_URL          = process.env["SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_ROLE = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const MESSENGER_WEBHOOK_KEY = process.env["MESSENGER_WEBHOOK_KEY"] ?? "";

function db() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
}

async function requireAuth(req: Request, res: Response): Promise<string | null> {
  if (!RALD_JWT_SECRET) {
    res.status(503).json({ error: "Auth service not configured" });
    return null;
  }
  const auth = (req.headers["authorization"] ?? "") as string;
  if (!auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const payload = await verifyJwt(auth.slice(7), RALD_JWT_SECRET);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
  return payload.id;
}

// ── GET /api/notifications ──────────────────────────────────────────────────
// Returns unread notifications newest-first (max 50).
// Only delivers: direct_message, friend_request, connection_accepted.
router.get("/", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const includeRead = req.query["include_read"] === "true";

  try {
    let q = db()
      .from("notifications")
      .select(`
        id, type, resource_id, resource_type, data, read_at, created_at,
        actor:profiles!notifications_actor_id_fkey (
          id, username, display_name, avatar_url, is_verified
        )
      `)
      .eq("recipient_id", userId)
      .in("type", [
        "direct_message",
        "friend_request",
        "connection_accepted",
        "room_live",
        "room_ended",
        "new_follower",
      ])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!includeRead) {
      q = q.is("read_at", null);
    }

    const { data, error } = await q;
    if (error) throw error;

    res.json({ notifications: data ?? [], count: (data ?? []).length });
  } catch (e) {
    console.error("[notifications] list failed:", String(e));
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ── GET /api/notifications/count ────────────────────────────────────────────
// Returns only the unread badge count. Lightweight — called on every app mount.
router.get("/count", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const { count, error } = await db()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);

    if (error) throw error;
    res.json({ unread: count ?? 0 });
  } catch (e) {
    console.error("[notifications] count failed:", String(e));
    res.status(500).json({ error: "Failed to count notifications" });
  }
});

// ── POST /api/notifications/read ────────────────────────────────────────────
// Body: { ids: string[] }  OR  { all: true }
// Marks notifications as read. Only affects the current user's notifications.
router.post("/read", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { ids, all } = (req.body ?? {}) as { ids?: string[]; all?: boolean };

  if (!all && (!Array.isArray(ids) || ids.length === 0)) {
    res.status(400).json({ error: "Provide ids[] or all:true" });
    return;
  }

  try {
    let q = db()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .is("read_at", null);

    if (!all && ids) {
      q = q.in("id", ids);
    }

    const { error } = await q;
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error("[notifications] mark read failed:", String(e));
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

// ── POST /api/notify/room-ended ─────────────────────────────────────────────
// Called by the host's client immediately after endRoomApi() succeeds.
// Authenticated with the host's RALD JWT — only the host can trigger this.
//
// Threshold: audience_count must be ≥ 500 to warrant notifying followers.
// Below that, the room didn't generate enough engagement to be "missed".
//
// Body: { room_id: string, title: string, audience_count: number }
// Response: { ok: true, notified: N } | { ok: true, skipped: "below_threshold" }
//
// Idempotent via error swallow: if the host somehow triggers this twice
// (network retry), duplicate notification rows are suppressed.
router.post("/room-ended", async (req: Request, res: Response) => {
  const hostId = await requireAuth(req, res);
  if (!hostId) return;

  const { room_id, title, audience_count } =
    (req.body ?? {}) as { room_id?: string; title?: string; audience_count?: number };

  if (!room_id || !title) {
    res.status(400).json({ error: "room_id and title are required" });
    return;
  }

  const count = typeof audience_count === "number" ? audience_count : 0;

  // Below-threshold guard: don't spam followers of quiet rooms.
  if (count < 500) {
    res.json({ ok: true, skipped: "below_threshold", threshold: 500 });
    return;
  }

  try {
    // Resolve host's display name for the notification body.
    const { data: hostProfile } = await db()
      .from("profiles")
      .select("username, display_name")
      .eq("id", hostId)
      .single();

    const hostName = hostProfile?.display_name ?? hostProfile?.username ?? "Host";

    // Fetch all followers of the host (max 500 — prevents runaway inserts).
    const { data: followers, error: fErr } = await db()
      .from("follows")
      .select("follower_id")
      .eq("following_id", hostId)
      .limit(500);

    if (fErr) throw fErr;
    if (!followers || followers.length === 0) {
      res.json({ ok: true, notified: 0 });
      return;
    }

    // Bulk-insert one room_ended notification per follower.
    // On conflict the row already exists — ignore and move on.
    const rows = followers.map((f: { follower_id: string }) => ({
      recipient_id:  f.follower_id,
      actor_id:      hostId,
      type:          "room_ended",
      resource_id:   room_id,
      resource_type: "room",
      data: {
        room_title:     title,
        host_name:      hostName,
        audience_count: count,
      },
    }));

    const { error: insertErr } = await db()
      .from("notifications")
      .insert(rows);

    // Ignore "already exists" errors from accidental double-calls.
    if (insertErr && !insertErr.message.includes("already exists")) throw insertErr;

    console.log(`[notifications] room-ended: notified ${rows.length} followers of ${hostId} (room ${room_id})`);
    res.json({ ok: true, notified: rows.length });
  } catch (e) {
    console.error("[notifications] room-ended failed:", String(e));
    res.status(500).json({ error: "Failed to send room-ended notifications" });
  }
});

// ── POST /api/notify/dm ─────────────────────────────────────────────────────
// Internal webhook — called by the Messenger CF Worker when a DM is sent.
// Authenticated with a shared MESSENGER_WEBHOOK_KEY header (not RALD JWT).
// Mounted at /notify in index.ts → full path is POST /api/notify/dm
//
// Body: {
//   recipient_id: string,   — RALD user ID of message recipient
//   actor_id:     string,   — RALD user ID of message sender
//   resource_id:  string,   — message ID from D1
//   data: {
//     preview:       string,  — first 80 chars of message (for notification text)
//     conversation_id: string
//   }
// }
router.post("/dm", async (req: Request, res: Response) => {
  const webhookKey = req.headers["x-messenger-webhook-key"] as string | undefined;

  if (!MESSENGER_WEBHOOK_KEY) {
    res.status(503).json({ error: "DM notifications not configured" });
    return;
  }
  if (!webhookKey || webhookKey !== MESSENGER_WEBHOOK_KEY) {
    res.status(401).json({ error: "Invalid webhook key" });
    return;
  }

  const { recipient_id, actor_id, resource_id, data } =
    (req.body ?? {}) as {
      recipient_id?: string;
      actor_id?: string;
      resource_id?: string;
      data?: { preview?: string; conversation_id?: string };
    };

  if (!recipient_id || !actor_id || !resource_id) {
    res.status(400).json({ error: "recipient_id, actor_id, and resource_id are required" });
    return;
  }

  if (recipient_id === actor_id) {
    res.json({ ok: true, skipped: "self-message" });
    return;
  }

  try {
    const { error } = await db()
      .from("notifications")
      .insert({
        recipient_id,
        actor_id,
        type:          "direct_message",
        resource_id,
        resource_type: "message",
        data:          { preview: (data?.preview ?? "").slice(0, 80), conversation_id: data?.conversation_id },
      });

    if (error && !error.message.includes("already exists")) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error("[notifications] dm webhook failed:", String(e));
    res.status(500).json({ error: "Failed to create DM notification" });
  }
});

export default router;
