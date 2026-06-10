/**
 * Loop — Push Notification Route (OneSignal)
 * Mounted at /api/push in src/index.ts
 *
 * Routes
 * ──────
 *  POST /api/push/notify-room-live  — notify followers when a room goes live
 *  POST /api/push/notify-room-ended — notify followers when a host's room ends
 *
 * PUSH-001 (2026-06-10): Replaced VAPID with OneSignal REST API.
 * PUSH-002 (2026-06-10): Fixed auth — requireAuth() replaces MESSENGER_WEBHOOK_KEY.
 *   /notify-room-live is called from the frontend immediately after room creation.
 *   The host is the authenticated caller; hostId in the body must match user.id.
 * PUSH-003 (2026-06-10): Retention Engine — dual delivery.
 *   OneSignal push + Supabase notifications table insert (batch, fire-and-forget).
 *   This ensures both push (device) and in-app inbox (notifications page) are populated.
 *
 * LILCKY STUDIO LIMITED
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendOneSignalNotification } from "../lib/push-crypto.js";

const push = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { user: AuthUser };
}>();

/* ── Category → emoji map ─────────────────────────────────────────── */
const CATEGORY_EMOJI: Record<string, string> = {
  community:   "🏘️",
  news:        "📡",
  commentary:  "🎙️",
  radio:       "📻",
  "dj-session":"🎧",
  education:   "📚",
  business:    "💼",
  general:     "🔊",
};

/* ── POST /api/push/notify-room-live ──────────────────────────────── */
/**
 * Notifies all followers of the host that their room just went live.
 *
 * PUSH-002: Secured with requireAuth() middleware.
 *   - hostId in the body MUST match the authenticated user.id (prevents spoofing).
 *   - Called directly from create.tsx after createRoom() succeeds.
 *
 * PUSH-003: Dual delivery.
 *   - OneSignal push (device notification, appears even when app is closed)
 *   - Supabase notifications insert (in-app inbox row for each follower)
 *
 * Body: { hostId, roomId, roomTitle, category }
 */
push.post("/notify-room-live", requireAuth(), async (c) => {
  const user = c.get("user");

  let body: { hostId?: string; roomId?: string; roomTitle?: string; category?: string };
  try { body = await c.req.json(); }
  catch { return c.json({ error: "Invalid JSON" }, 400); }

  const { hostId, roomId, roomTitle, category } = body;
  if (!hostId || !roomId || !roomTitle) {
    return c.json({ error: "hostId, roomId, and roomTitle are required" }, 400);
  }

  // Security: only the host can broadcast their own room-live notifications
  if (hostId !== user.id) {
    return c.json({ error: "Unauthorized: hostId must match authenticated user" }, 403);
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
    console.error("[push/room-live] followers fetch failed:", followersRes.status);
    return c.json({ dispatched: 0, error: "Could not fetch followers" }, 500);
  }

  const followers = (await followersRes.json()) as Array<{ follower_id: string }>;
  if (followers.length === 0) return c.json({ ok: true, dispatched: 0, recipients: 0 });

  const followerIds = followers.map(f => f.follower_id);
  const emoji = CATEGORY_EMOJI[category ?? "general"] ?? "🔊";

  // 2. Fetch host display name for notification body
  const hostProfileRes = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${hostId}&select=display_name,username&limit=1`,
    {
      headers: {
        apikey:        c.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept:        "application/json",
      },
    },
  );
  const hostProfiles = hostProfileRes.ok
    ? (await hostProfileRes.json()) as Array<{ display_name: string | null; username: string | null }>
    : [];
  const hostName = hostProfiles[0]?.display_name || hostProfiles[0]?.username || "Someone";

  // 3. OneSignal push (device notification) — returns immediately
  const onesignalPromise = (c.env.ONESIGNAL_APP_ID && c.env.ONESIGNAL_REST_API_KEY)
    ? sendOneSignalNotification(
        c.env.ONESIGNAL_APP_ID,
        c.env.ONESIGNAL_REST_API_KEY,
        {
          externalIds: followerIds,
          headings:    { en: `${emoji} ${hostName} is live` },
          contents:    { en: roomTitle },
          webUrl:      `/rooms/${roomId}`,
          icon:        "/icons/icon-192.png",
          tag:         `room-live-${roomId}`,
          data:        { url: `/rooms/${roomId}`, type: "room_live", roomId },
        },
      )
    : Promise.resolve({ ok: true, recipients: 0 });

  // 4. Supabase notifications insert — batch per follower (fire-and-forget)
  //    Runs in background so it never delays the response.
  c.executionCtx.waitUntil(
    (async () => {
      const rows = followerIds.map(followerId => ({
        recipient_id:  followerId,
        actor_id:      hostId,
        type:          "room_live",
        resource_id:   roomId,
        resource_type: "room",
        data: {
          room_title: roomTitle,
          category:   category ?? "general",
          host_name:  hostName,
        },
      }));

      // Insert in chunks of 500 to stay within PostgREST body limits
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/notifications`, {
          method:  "POST",
          headers: {
            apikey:          c.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization:   `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type":  "application/json",
            Accept:          "application/json",
            Prefer:          "return=minimal",
          },
          body: JSON.stringify(chunk),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("[push/room-live] notifications insert failed:", res.status, text.slice(0, 200));
        }
      }

      console.log(JSON.stringify({
        level:      "info",
        event:      "room_live_notifications_sent",
        roomId,
        hostId,
        recipients: followerIds.length,
        service:    "loop-api",
        timestamp:  new Date().toISOString(),
      }));
    })()
  );

  const result = await onesignalPromise;
  return c.json({ ok: result.ok, recipients: result.recipients, id: (result as { id?: string }).id });
});

/* ── POST /api/push/notify-room-ended ────────────────────────────── */
/**
 * Notifies followers when a host's room has ended.
 * Called internally from the DELETE /api/rooms/:roomId handler.
 *
 * RETENTION-001 (2026-06-10): Room lifecycle events.
 *   When a host ends a room, their followers receive:
 *     - An in-app notification (Supabase insert)
 *   No push notification for room-ended (would be annoying).
 *   The notification tells followers "X's room has ended — join the next one!"
 *
 * Internal route: authenticated via shared MESSENGER_WEBHOOK_KEY header
 * (called server-side from rooms.ts, not from the browser).
 *
 * Body: { hostId, roomId, roomTitle }
 */
push.post("/notify-room-ended", async (c) => {
  const authHeader = c.req.header("Authorization") ?? "";
  const secret     = authHeader.replace(/^Bearer\s+/, "");
  if (!secret || secret !== c.env.MESSENGER_WEBHOOK_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: { hostId?: string; roomId?: string; roomTitle?: string };
  try { body = await c.req.json(); }
  catch { return c.json({ error: "Invalid JSON" }, 400); }

  const { hostId, roomId, roomTitle } = body;
  if (!hostId || !roomId || !roomTitle) {
    return c.json({ error: "hostId, roomId, and roomTitle are required" }, 400);
  }

  // Fetch followers
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

  if (!followersRes.ok || (followersRes.headers.get("content-length") === "2")) {
    return c.json({ ok: true, recipients: 0 });
  }

  const followers = (await followersRes.json()) as Array<{ follower_id: string }>;
  if (followers.length === 0) return c.json({ ok: true, recipients: 0 });

  const followerIds = followers.map(f => f.follower_id);

  // Fetch host display name
  const hostProfileRes = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${hostId}&select=display_name,username&limit=1`,
    {
      headers: {
        apikey:        c.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept:        "application/json",
      },
    },
  );
  const hostProfiles = hostProfileRes.ok
    ? (await hostProfileRes.json()) as Array<{ display_name: string | null; username: string | null }>
    : [];
  const hostName = hostProfiles[0]?.display_name || hostProfiles[0]?.username || "Someone";

  // Insert in-app notifications (room_ended — no device push, just inbox)
  const rows = followerIds.map(followerId => ({
    recipient_id:  followerId,
    actor_id:      hostId,
    type:          "room_ended",
    resource_id:   roomId,
    resource_type: "room",
    data: {
      room_title: roomTitle,
      host_name:  hostName,
    },
  }));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await fetch(`${c.env.SUPABASE_URL}/rest/v1/notifications`, {
      method:  "POST",
      headers: {
        apikey:         c.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization:  `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Accept:         "application/json",
        Prefer:         "return=minimal",
      },
      body: JSON.stringify(chunk),
    }).catch(err => console.error("[push/room-ended] insert failed:", err));
  }

  console.log(JSON.stringify({
    level:      "info",
    event:      "room_ended_notifications_sent",
    roomId,
    hostId,
    recipients: followerIds.length,
    service:    "loop-api",
    timestamp:  new Date().toISOString(),
  }));

  return c.json({ ok: true, recipients: followerIds.length });
});

export { push };
