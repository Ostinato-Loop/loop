// Loop API — Friend Request Routes
// Trust & Retention Sprint — Phase N
//
// POST /api/friend-requests             — send a friend request
// GET  /api/friend-requests             — list requests (incoming + outgoing)
// PUT  /api/friend-requests/:id/accept  — accept a request → triggers connection_accepted notification
// PUT  /api/friend-requests/:id/decline — decline a request
// DELETE /api/friend-requests/:id       — cancel a sent request
//
// Database triggers (002_notifications_friend_requests.sql) handle
// notification creation automatically on INSERT and status UPDATE.
// LILCKY STUDIO LIMITED

import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { verifyJwt } from "../lib/jwt";

const router = Router();

const RALD_JWT_SECRET       = process.env["RALD_JWT_SECRET"] ?? "";
const SUPABASE_URL          = process.env["SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_ROLE = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

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

// ── POST /api/friend-requests ───────────────────────────────────────────────
// Body: { receiver_id: string }
// Creates a pending friend request. DB trigger fires notification to receiver.
router.post("/", async (req: Request, res: Response) => {
  const senderId = await requireAuth(req, res);
  if (!senderId) return;

  const { receiver_id } = (req.body ?? {}) as { receiver_id?: string };
  if (!receiver_id) {
    res.status(400).json({ error: "receiver_id is required" });
    return;
  }
  if (receiver_id === senderId) {
    res.status(400).json({ error: "Cannot send a friend request to yourself" });
    return;
  }

  try {
    const { data: existing } = await db()
      .from("friend_requests")
      .select("id, status")
      .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiver_id}),and(sender_id.eq.${receiver_id},receiver_id.eq.${senderId})`)
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") {
        res.status(409).json({ error: "Already connected", status: "accepted" });
        return;
      }
      if (existing.status === "pending") {
        res.status(409).json({ error: "Friend request already sent", status: "pending", id: existing.id });
        return;
      }
    }

    const { data, error } = await db()
      .from("friend_requests")
      .insert({ sender_id: senderId, receiver_id })
      .select("id, status, created_at")
      .single();

    if (error) throw error;
    res.status(201).json({ request: data });
  } catch (e) {
    console.error("[friend-requests] send failed:", String(e));
    res.status(500).json({ error: "Failed to send friend request" });
  }
});

// ── GET /api/friend-requests ────────────────────────────────────────────────
// Returns { incoming: [], outgoing: [] }
// incoming = pending requests received; outgoing = pending requests sent
router.get("/", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const [{ data: incoming }, { data: outgoing }] = await Promise.all([
      db()
        .from("friend_requests")
        .select(`
          id, status, created_at,
          sender:profiles!friend_requests_sender_id_fkey (
            id, username, display_name, avatar_url, is_verified
          )
        `)
        .eq("receiver_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),

      db()
        .from("friend_requests")
        .select(`
          id, status, created_at,
          receiver:profiles!friend_requests_receiver_id_fkey (
            id, username, display_name, avatar_url, is_verified
          )
        `)
        .eq("sender_id", userId)
        .in("status", ["pending", "accepted"])
        .order("created_at", { ascending: false }),
    ]);

    res.json({ incoming: incoming ?? [], outgoing: outgoing ?? [] });
  } catch (e) {
    console.error("[friend-requests] list failed:", String(e));
    res.status(500).json({ error: "Failed to fetch friend requests" });
  }
});

// ── PUT /api/friend-requests/:id/accept ────────────────────────────────────
// Accepts an incoming friend request.
// DB trigger fires connection_accepted notification to the original sender.
router.put("/:id/accept", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;

  try {
    const { data: fr } = await db()
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status")
      .eq("id", id)
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if (!fr) {
      res.status(404).json({ error: "Friend request not found or not pending" });
      return;
    }

    const { data, error } = await db()
      .from("friend_requests")
      .update({ status: "accepted" })
      .eq("id", id)
      .select("id, status, updated_at")
      .single();

    if (error) throw error;
    res.json({ request: data });
  } catch (e) {
    console.error("[friend-requests] accept failed:", String(e));
    res.status(500).json({ error: "Failed to accept friend request" });
  }
});

// ── PUT /api/friend-requests/:id/decline ───────────────────────────────────
// Declines an incoming friend request. No notification is sent to the sender.
router.put("/:id/decline", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;

  try {
    const { data, error } = await db()
      .from("friend_requests")
      .update({ status: "declined" })
      .eq("id", id)
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .select("id, status")
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Friend request not found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[friend-requests] decline failed:", String(e));
    res.status(500).json({ error: "Failed to decline friend request" });
  }
});

// ── DELETE /api/friend-requests/:id ────────────────────────────────────────
// Cancels a sent friend request (only the sender can do this).
router.delete("/:id", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;

  try {
    const { error } = await db()
      .from("friend_requests")
      .delete()
      .eq("id", id)
      .eq("sender_id", userId)
      .eq("status", "pending");

    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error("[friend-requests] cancel failed:", String(e));
    res.status(500).json({ error: "Failed to cancel friend request" });
  }
});

export default router;
