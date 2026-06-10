/**
 * Loop — Push Notification Route (OneSignal)
 * Mounted at /api/push in src/index.ts
 *
 * Routes
 * ──────
 *  POST /api/push/notify-room-live  — notify followers when a room goes live (internal)
 *
 * PUSH-001 (2026-06-10): Replaced VAPID with OneSignal REST API.
 *   /subscribe and /unsubscribe removed — OneSignal manages subscriptions client-side.
 *   Backend only needs to dispatch targeted notifications via REST API.
 *
 * Security: Bearer MESSENGER_WEBHOOK_KEY (same shared secret as DM webhook).
 * LILCKY STUDIO LIMITED
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import { sendOneSignalNotification } from "../lib/push-crypto.js";

const push = new Hono<{ Bindings: CloudflareEnv }>();

/* ── POST /api/push/notify-room-live ──────────────────────────────── */
/**
 * Notifies all followers of the host that their room just went live.
 *
 * Body: { hostId, roomId, roomTitle, category }
 *
 * Flow:
 *   1. Validate internal secret
 *   2. Fetch follower IDs from the follows table
 *   3. Dispatch via OneSignal REST API targeting external_id = Supabase user UUID
 */
push.post("/notify-room-live", async (c) => {
  // Validate internal secret
  const authHeader = c.req.header("Authorization") ?? "";
  const secret     = authHeader.replace(/^Bearer\s+/, "");
  if (!secret || secret !== c.env.MESSENGER_WEBHOOK_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: { hostId?: string; roomId?: string; roomTitle?: string; category?: string };
  try { body = await c.req.json(); }
  catch { return c.json({ error: "Invalid JSON" }, 400); }

  const { hostId, roomId, roomTitle, category } = body;
  if (!hostId || !roomId || !roomTitle) {
    return c.json({ error: "hostId, roomId, and roomTitle are required" }, 400);
  }

  // 1. Fetch followers
  const followersRes = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/follows?select=follower_id&following_id=eq.${hostId}&limit=2000`,
    {
      headers: {
        apikey:        c.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept:        "application/json",
      },
    },
  );

  if (!followersRes.ok) {
    console.error("[push] followers fetch failed:", followersRes.status);
    return c.json({ dispatched: 0, error: "Could not fetch followers" });
  }

  const followers = (await followersRes.json()) as Array<{ follower_id: string }>;
  if (followers.length === 0) return c.json({ dispatched: 0, recipients: 0 });

  const followerIds = followers.map(f => f.follower_id);

  // 2. Category → emoji
  const CATEGORY_EMOJI: Record<string, string> = {
    community:"🏘️", news:"📡", commentary:"🎙️", radio:"📻",
    "dj-session":"🎧", education:"📚", business:"💼", general:"🔊",
  };
  const emoji = CATEGORY_EMOJI[category ?? "general"] ?? "🔊";

  // 3. Send via OneSignal
  const result = await sendOneSignalNotification(
    c.env.ONESIGNAL_APP_ID,
    c.env.ONESIGNAL_REST_API_KEY,
    {
      externalIds: followerIds,
      headings:    { en: `${emoji} Live now` },
      contents:    { en: roomTitle },
      webUrl:      `/rooms/${roomId}`,
      icon:        "/icons/icon-192.png",
      tag:         `room-live-${roomId}`,
      data:        { url: `/rooms/${roomId}`, type: "room_live", roomId },
    },
  );

  return c.json({ ok: result.ok, recipients: result.recipients, id: result.id });
});

export { push };
