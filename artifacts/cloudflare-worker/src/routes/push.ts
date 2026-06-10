/**
 * Loop — Push Notification Route
 * Mounted at /api/push in src/index.ts
 *
 * Routes
 * ──────
 *  POST   /api/push/subscribe          — save Web Push subscription (auth required)
 *  DELETE /api/push/unsubscribe        — remove subscription (auth required)
 *  POST   /api/push/notify-room-live   — notify followers when a room goes live (internal)
 *
 * PUSH-001 (2026-06-10)
 * LILCKY STUDIO LIMITED
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser }      from "../middleware/auth.js";
import { requireAuth }        from "../middleware/auth.js";
import { buildVapidAuth, encryptPushPayload } from "../lib/push-crypto.js";

const push = new Hono<{
  Bindings:  CloudflareEnv;
  Variables: { user: AuthUser };
}>();

/* ── helpers ──────────────────────────────────────────────────────── */

function sb(url: string, key: string) {
  const headers = {
    apikey:         key,
    Authorization:  `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept:         "application/json",
  };
  return {
    from: (table: string) => ({
      select: (cols: string) => ({ eq: (...args: unknown[]) => ({ single: () => null }) }),
    }),
    headers,
    url,
  };
}

/** Low-level: deliver a single Web Push request to one subscription endpoint. */
async function deliverPush(
  env:      CloudflareEnv,
  endpoint: string,
  p256dh:   string,
  auth:     string,
  payload:  object,
): Promise<{ ok: boolean; status: number; expired: boolean }> {
  const payloadStr = JSON.stringify(payload);

  const { body, contentEncoding } = await encryptPushPayload(p256dh, auth, payloadStr);

  // Parse audience from endpoint URL (origin only)
  const endpointUrl = new URL(endpoint);
  const audience    = endpointUrl.origin;

  const authorization = await buildVapidAuth(
    audience,
    `mailto:${env.VAPID_SUBJECT}`,
    env.VAPID_PRIVATE_KEY,
    env.VAPID_PUBLIC_KEY,
  );

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type":      "application/octet-stream",
      "Content-Encoding":  contentEncoding,
      Authorization:       authorization,
      TTL:                 "86400",
    },
    body,
  });

  // 410 Gone / 404 = subscription expired → caller should delete it
  const expired = res.status === 410 || res.status === 404;
  return { ok: res.ok, status: res.status, expired };
}

/** Fetch all push subscriptions for a list of user IDs. */
async function getSubscriptions(
  env:     CloudflareEnv,
  userIds: string[],
): Promise<Array<{ user_id: string; endpoint: string; p256dh: string; auth: string }>> {
  if (userIds.length === 0) return [];

  const qs = new URLSearchParams({
    select:  "user_id,endpoint,p256dh,auth",
    user_id: `in.(${userIds.map(id => `"${id}"`).join(",")})`,
  });

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?${qs}`, {
    headers: {
      apikey:        env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept:        "application/json",
    },
  });

  if (!res.ok) return [];
  return (await res.json()) as Array<{ user_id: string; endpoint: string; p256dh: string; auth: string }>;
}

/** Delete an expired subscription from DB. */
async function deleteExpiredSubscription(env: CloudflareEnv, endpoint: string) {
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    {
      method:  "DELETE",
      headers: {
        apikey:        env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
}

/* ── POST /api/push/subscribe ─────────────────────────────────────── */
push.post("/subscribe", requireAuth(), async (c) => {
  const user = c.get("user");

  let body: { endpoint?: string; p256dh?: string; auth?: string; platform?: string; userAgent?: string };
  try { body = await c.req.json(); }
  catch { return c.json({ error: "Invalid JSON" }, 400); }

  const { endpoint, p256dh, auth, platform = "web", userAgent } = body;
  if (!endpoint || !p256dh || !auth) {
    return c.json({ error: "endpoint, p256dh, and auth are required" }, 400);
  }

  // Upsert — safe to call multiple times (SW re-registers on each page load)
  const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/push_subscriptions`, {
    method:  "POST",
    headers: {
      apikey:        c.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer:        "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      user_id:    user.id,
      endpoint,
      p256dh,
      auth,
      platform,
      user_agent: userAgent ?? null,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("[push] subscribe error:", res.status, err.slice(0, 200));
    return c.json({ error: "Could not save subscription" }, 500);
  }

  return c.json({ ok: true, subscribed: true });
});

/* ── DELETE /api/push/unsubscribe ─────────────────────────────────── */
push.delete("/unsubscribe", requireAuth(), async (c) => {
  const user = c.get("user");

  let endpoint: string | undefined;
  try {
    const body = await c.req.json() as { endpoint?: string };
    endpoint = body.endpoint;
  } catch { /* ignore */ }

  const qs = new URLSearchParams({ user_id: `eq.${user.id}` });
  if (endpoint) qs.set("endpoint", `eq.${endpoint}`);

  const res = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/push_subscriptions?${qs}`,
    {
      method:  "DELETE",
      headers: {
        apikey:        c.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );

  if (!res.ok && res.status !== 404) {
    return c.json({ error: "Could not remove subscription" }, 500);
  }

  return c.json({ ok: true, subscribed: false });
});

/* ── POST /api/push/notify-room-live ─────────────────────────────── */
/**
 * Internal endpoint called when a creator goes live.
 * Notifies all followers of the host who have push subscriptions.
 *
 * Body: { hostId, roomId, roomTitle, category }
 * Security: requires Bearer MESSENGER_WEBHOOK_KEY (same shared secret pattern
 * used for the DM notification webhook) — not user-auth, internal service call.
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

  // 1. Fetch host's followers
  const followersRes = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/follows?select=follower_id&following_id=eq.${hostId}&limit=500`,
    {
      headers: {
        apikey:        c.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept:        "application/json",
      },
    },
  );
  if (!followersRes.ok) return c.json({ dispatched: 0 });

  const followers = (await followersRes.json()) as Array<{ follower_id: string }>;
  const followerIds = followers.map(f => f.follower_id);
  if (followerIds.length === 0) return c.json({ dispatched: 0 });

  // 2. Fetch their push subscriptions
  const subs = await getSubscriptions(c.env, followerIds);
  if (subs.length === 0) return c.json({ dispatched: 0 });

  // 3. Build notification payload (matches sw.js notificationclick handler)
  const CATEGORY_EMOJI: Record<string, string> = {
    community:"🏘️", news:"📡", commentary:"🎙️", radio:"📻",
    "dj-session":"🎧", education:"📚", business:"💼", general:"🔊",
  };
  const emoji = CATEGORY_EMOJI[category ?? "general"] ?? "🔊";
  const notifPayload = {
    title: `${emoji} Live now`,
    body:  roomTitle,
    icon:  "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    data:  { url: `/rooms/${roomId}`, type: "room_live" },
    tag:   `room-live-${roomId}`,
  };

  // 4. Dispatch all pushes concurrently (max 50 at a time to avoid CF limits)
  let dispatched = 0;
  const BATCH = 50;
  for (let i = 0; i < subs.length; i += BATCH) {
    const batch = subs.slice(i, i + BATCH);
    await Promise.all(batch.map(async (sub) => {
      try {
        const result = await deliverPush(
          c.env,
          sub.endpoint,
          sub.p256dh,
          sub.auth,
          notifPayload,
        );
        if (result.ok) {
          dispatched++;
        } else if (result.expired) {
          // Clean up expired subscription asynchronously
          c.executionCtx.waitUntil(deleteExpiredSubscription(c.env, sub.endpoint));
        }
      } catch (err) {
        console.error("[push] dispatch error:", err);
      }
    }));
  }

  return c.json({ dispatched, total: subs.length });
});

export { push };
