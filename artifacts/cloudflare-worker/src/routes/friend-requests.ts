/**
 * Loop API — Friend Request Routes (Cloudflare Worker / Hono)
 * Mounted at /api/friend-requests in src/index.ts
 *
 * POST   /api/friend-requests             — send a friend request
 * GET    /api/friend-requests             — list requests (incoming + outgoing)
 * PUT    /api/friend-requests/:id/accept  — accept → triggers connection_accepted notification
 * PUT    /api/friend-requests/:id/decline — decline
 * DELETE /api/friend-requests/:id         — cancel sent request
 *
 * DB triggers (002_notifications_friend_requests.sql) handle notification
 * creation automatically on INSERT and status UPDATE.
 * LILCKY STUDIO LIMITED
 */

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

const friendRequests = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { user: AuthUser };
}>();

function sb(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false } });
}

type SendBody = { receiver_id?: string };

/* ── POST /api/friend-requests ───────────────────────────────────────── */
friendRequests.post("/", requireAuth(), async (c) => {
  const user            = c.get("user");
  const body            = (await c.req.json().catch(() => ({}))) as SendBody;
  const { receiver_id } = body;

  if (!receiver_id) return c.json({ error: "receiver_id is required" }, 400);
  if (receiver_id === user.id) return c.json({ error: "Cannot send a friend request to yourself" }, 400);

  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing } = await supabase
    .from("friend_requests")
    .select("id, status")
    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${receiver_id}),and(sender_id.eq.${receiver_id},receiver_id.eq.${user.id})`)
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") return c.json({ error: "Already connected", status: "accepted" }, 409);
    if (existing.status === "pending")  return c.json({ error: "Friend request already sent", status: "pending", id: existing.id }, 409);
  }

  const { data, error } = await supabase
    .from("friend_requests")
    .insert({ sender_id: user.id, receiver_id })
    .select("id, status, created_at")
    .single();

  if (error) {
    console.error("[friend-requests] send failed:", error.message);
    return c.json({ error: "Failed to send friend request" }, 500);
  }
  return c.json({ request: data }, 201);
});

/* ── GET /api/friend-requests ────────────────────────────────────────── */
friendRequests.get("/", requireAuth(), async (c) => {
  const user     = c.get("user");
  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const [{ data: incoming }, { data: outgoing }] = await Promise.all([
    supabase
      .from("friend_requests")
      .select(`
        id, status, created_at,
        sender:profiles!friend_requests_sender_id_fkey (
          id, username, display_name, avatar_url, is_verified
        )
      `)
      .eq("receiver_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),

    supabase
      .from("friend_requests")
      .select(`
        id, status, created_at,
        receiver:profiles!friend_requests_receiver_id_fkey (
          id, username, display_name, avatar_url, is_verified
        )
      `)
      .eq("sender_id", user.id)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false }),
  ]);

  return c.json({ incoming: incoming ?? [], outgoing: outgoing ?? [] });
});

/* ── PUT /api/friend-requests/:id/accept ─────────────────────────────── */
friendRequests.put("/:id/accept", requireAuth(), async (c) => {
  const user     = c.get("user");
  const id       = c.req.param("id");
  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: fr } = await supabase
    .from("friend_requests")
    .select("id, sender_id, receiver_id, status")
    .eq("id", id)
    .eq("receiver_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (!fr) return c.json({ error: "Friend request not found or not pending" }, 404);

  const { data, error } = await supabase
    .from("friend_requests")
    .update({ status: "accepted" })
    .eq("id", id)
    .select("id, status, updated_at")
    .single();

  if (error) {
    console.error("[friend-requests] accept failed:", error.message);
    return c.json({ error: "Failed to accept friend request" }, 500);
  }
  return c.json({ request: data });
});

/* ── PUT /api/friend-requests/:id/decline ────────────────────────────── */
friendRequests.put("/:id/decline", requireAuth(), async (c) => {
  const user     = c.get("user");
  const id       = c.req.param("id");
  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("friend_requests")
    .update({ status: "declined" })
    .eq("id", id)
    .eq("receiver_id", user.id)
    .eq("status", "pending")
    .select("id, status")
    .single();

  if (error || !data) return c.json({ error: "Friend request not found" }, 404);
  return c.json({ ok: true });
});

/* ── DELETE /api/friend-requests/:id ─────────────────────────────────── */
friendRequests.delete("/:id", requireAuth(), async (c) => {
  const user     = c.get("user");
  const id       = c.req.param("id");
  const supabase = sb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await supabase
    .from("friend_requests")
    .delete()
    .eq("id", id)
    .eq("sender_id", user.id)
    .eq("status", "pending");

  if (error) {
    console.error("[friend-requests] cancel failed:", error.message);
    return c.json({ error: "Failed to cancel friend request" }, 500);
  }
  return c.json({ ok: true });
});

export { friendRequests };
