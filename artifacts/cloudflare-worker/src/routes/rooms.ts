import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import type { RoomCategory } from "@workspace/loop-shared-types";
import { getRecommendations } from "../services/recommendations.js";

// NOTE: @supabase/supabase-js createClient is intentionally NOT used here.
// In Cloudflare Workers (nodejs_compat), the JS client accesses private
// properties that changed in v2.49.8 and attempts browser APIs at init time.
// All DB access uses direct REST fetch with explicit headers.

// RETENTION-004 (2026-06-10): When a host ends a room, call
// POST /api/push/notify-room-ended (internal) to insert in-app notifications
// for all followers. Uses MESSENGER_WEBHOOK_KEY as the internal shared secret.

const rooms = new Hono<{ Bindings: CloudflareEnv; Variables: { user: AuthUser } }>();


/**
 * POST /api/rooms
 * Create a new live audio room.
 *
 * Body: { title, description?, category, visibility?, tags? }
 * Returns: Room object (201)
 * Errors: 400 (missing fields), 429 (rate limit exceeded)
 *
 * RATE-LIMIT-001 (2026-06-10): Per-user room creation capped at 3 per 24 h
 * using the CACHE KV namespace. Key: rl:room_create:{userId}.
 */
rooms.post("/", requireAuth(), async (c) => {
  const user  = c.get("user");
  const sbUrl = c.env.SUPABASE_URL;
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  // ── Rate limiting: max 3 rooms per user per 24 h ──────────────────────
  const rlKey    = `rl:room_create:${user.id}`;
  const countStr = await c.env.CACHE.get(rlKey);
  const count    = countStr ? Number(countStr) : 0;
  if (count >= 3) {
    return c.json({ error: "Room creation limit reached (max 3 per 24 hours)" }, 429);
  }

  // ── Validate body ────────────────────────────────────────────────────
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const { title, description, category, tags = [] } = body;
  const visibility = (body.visibility as string) ?? "public";
  if (!title || typeof title !== "string" || !title.trim()) {
    return c.json({ error: "title is required" }, 400);
  }
  if (!category || typeof category !== "string") {
    return c.json({ error: "category is required" }, 400);
  }

  const headers = {
    apikey:         sbKey,
    Authorization:  `Bearer ${sbKey}`,
    "Content-Type": "application/json",
    Accept:         "application/json",
    Prefer:         "return=representation",
  };

  // ── Insert room row ───────────────────────────────────────────────────
  const createResp = await fetch(`${sbUrl}/rest/v1/rooms`, {
    method:  "POST",
    headers,
    body:    JSON.stringify({
      title:          (title as string).trim(),
      description:    description ?? null,
      category,
      visibility,
      tags:           Array.isArray(tags) ? tags : [],
      host_id:        user.id,
      is_live:        true,
      audience_count: 1,
    }),
  });

  if (!createResp.ok) {
    const errText = await createResp.text().catch(() => "");
    console.error("[rooms/create] failed:", createResp.status, errText.slice(0, 200));
    return c.json({ error: "Failed to create room" }, 500);
  }

  const rows = await createResp.json() as Record<string, unknown>[];
  if (!rows.length) return c.json({ error: "Room created but not returned" }, 500);
  const room = rows[0];

  // ── Add host as participant (fire-and-forget) ─────────────────────────
  fetch(`${sbUrl}/rest/v1/room_participants`, {
    method:  "POST",
    headers,
    body:    JSON.stringify({ room_id: room.id, user_id: user.id, role: "host" }),
  }).catch(err => console.warn("[rooms/create] participant insert failed:", err));

  // ── Increment rate limit counter (expires after 24 h) ────────────────
  await c.env.CACHE.put(rlKey, String(count + 1), { expirationTtl: 86_400 });

  console.log(JSON.stringify({
    level: "info", event: "room_created",
    roomId: room.id, userId: user.id,
    service: "loop-api", timestamp: new Date().toISOString(),
  }));
  return c.json(room, 201);
});

/**
 * GET /api/rooms
 * Public listing of live and recent rooms. No authentication required.
 *
 * Query params:
 *   category     — filter by room category
 *   community_id — filter to a specific community (V2)
 *   limit        — max rooms to return (default: 20, max: 100)
 *   offset       — pagination offset (default: 0)
 *
 * FIX (2026-06-07): Replaced Supabase JS client with direct REST fetch.
 * The JS client's private property access (.supabaseUrl, .supabaseKey) broke
 * in v2.49.8, causing all queries to fail silently with "Failed to fetch rooms".
 * Direct fetch with explicit apikey/Authorization headers resolves this.
 */
rooms.get("/", async (c) => {
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const limit   = Math.min(Number(c.req.query("limit")  ?? 20), 100);
  const offset  = Math.max(Number(c.req.query("offset") ?? 0),  0);
  const category    = c.req.query("category");
  const communityId = c.req.query("community_id");

  const select = "*";

  const qs = new URLSearchParams({
    select,
    visibility: "eq.public",
    order:      "is_live.desc,audience_count.desc,created_at.desc",
    limit:      String(limit),
    offset:     String(offset),
  });
  if (category)    qs.set("category",     `eq.${category}`);
  if (communityId) qs.set("community_id", `eq.${communityId}`);

  let resp: Response;
  try {
    resp = await fetch(`${sbUrl}/rest/v1/rooms?${qs.toString()}`, {
      method: "GET",
      headers: {
        apikey:         sbKey,
        Authorization:  `Bearer ${sbKey}`,
        "Content-Type": "application/json",
        Accept:         "application/json",
      },
    });
  } catch (err) {
    console.error("[rooms] fetch error:", err);
    return c.json({ error: "Failed to fetch rooms", _debug: String(err) }, 500);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error("[rooms] list error:", resp.status, body.slice(0, 300));
    return c.json({ error: "Failed to fetch rooms", _debug: body.slice(0, 300) }, 500);
  }

  const data = await resp.json() as unknown[];
  return c.json({ rooms: data ?? [], count: (data ?? []).length, offset, limit });
});

/**
 * GET /api/rooms/recommendations
 * Personalised room recommendations for the authenticated user.
 *
 * Query params:
 *   limit   — max rooms to return (default: 10)
 *   lang    — preferred language code (e.g. "en", "ha", "yo")
 */
rooms.get("/recommendations", requireAuth(), async (c) => {
  const user  = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") ?? 10), 50);
  const lang  = c.req.query("lang") ?? "en";

  const result = await getRecommendations(c.env, { userId: user.id, limit, lang });
  return c.json(result);
});

/**
 * POST /api/rooms/:roomId/queue-summary
 * Enqueues an AI summary generation task for a completed room.
 * Called by the host or moderator when a room ends.
 */
rooms.post("/:roomId/queue-summary", requireAuth(), async (c) => {
  const { roomId } = c.req.param();
  const user = c.get("user");

  await c.env.TASK_QUEUE.send({
    type:        "ai_summary",
    roomId,
    requestedBy: user.id,
    timestamp:   Date.now(),
  });

  return c.json({ ok: true, queued: true, roomId });
});


/**
 * DELETE /api/rooms/:roomId
 * Host ends a live room.
 *
 * Effects (in order):
 *   1. Verifies the caller is the room's host.
 *   2. Sets is_live = false, audience_count = 0.
 *   3. Deletes all room_participants rows.
 *   4. If LiveKit credentials are present, deletes the LiveKit room (kicks all audio).
 *   5. Queues an AI summary task.
 *   6. RETENTION-004: Notifies all followers via in-app notification (room_ended).
 *
 * Returns 200 { ok, roomId } on success.
 * Returns 403 if caller is not the host.
 * Returns 404 if room not found.
 */
rooms.delete('/:roomId', requireAuth(), async (c) => {
  const { roomId } = c.req.param();
  const user    = c.get('user');
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Accept: 'application/json' };

  // 1. Fetch room and verify host
  const roomResp = await fetch(`${sbUrl}/rest/v1/rooms?id=eq.${roomId}&select=id,host_id,is_live,title&limit=1`, { headers });
  if (!roomResp.ok) return c.json({ error: 'Failed to fetch room' }, 500);
  const rooms_ = await roomResp.json() as { id: string; host_id: string; is_live: boolean; title: string }[];
  if (!rooms_.length) return c.json({ error: 'Room not found' }, 404);
  const room = rooms_[0];
  if (room.host_id !== user.id) return c.json({ error: 'Only the host can end this room' }, 403);

  // 2. Mark room ended
  const updateResp = await fetch(
    `${sbUrl}/rest/v1/rooms?id=eq.${roomId}`,
    { method: 'PATCH', headers, body: JSON.stringify({ is_live: false, audience_count: 0 }) },
  );
  if (!updateResp.ok) {
    const body = await updateResp.text().catch(() => '');
    console.error('[rooms/delete] update failed:', updateResp.status, body.slice(0, 200));
    return c.json({ error: 'Failed to end room' }, 500);
  }

  // 3. Remove all participants (fire-and-forget)
  const cleanupPromise = fetch(
    `${sbUrl}/rest/v1/room_participants?room_id=eq.${roomId}`,
    { method: 'DELETE', headers },
  ).catch((err) => console.error('[rooms/delete] participant cleanup failed:', err));

  // 4. Delete LiveKit room if configured (kicks all audio connections)
  const livekitPromise = (async () => {
    const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = c.env;
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) return;
    try {
      const now = Math.floor(Date.now() / 1000);
      const payload = { iss: LIVEKIT_API_KEY, sub: 'loop-server', nbf: now, exp: now + 60, video: { roomAdmin: true } };
      const b64url = (obj: Record<string, unknown>) => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const unsigned = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}`;
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(LIVEKIT_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const token = `${unsigned}.${sig}`;
      const wsBase = LIVEKIT_URL.replace(/^wss?:\/\//, 'https://');
      await fetch(`${wsBase}/twirp/livekit.RoomService/DeleteRoom`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomId }),
      });
    } catch (err) {
      console.warn('[rooms/delete] LiveKit room delete failed (non-fatal):', err);
    }
  })();

  // 5. Queue AI summary
  const summaryPromise = c.env.TASK_QUEUE.send({ type: 'ai_summary', roomId, requestedBy: user.id, timestamp: Date.now() })
    .catch((err) => console.warn('[rooms/delete] summary queue failed:', err));

  // 6. RETENTION-004: Notify followers that the room ended (in-app inbox)
  //    Fire-and-forget via waitUntil — never blocks the response.
  //    Uses the internal /api/push/notify-room-ended route (server-to-server).
  const roomTitle = room.title ?? "A room";
  if (c.env.MESSENGER_WEBHOOK_KEY) {
    c.executionCtx.waitUntil(
      fetch(new URL('/api/push/notify-room-ended', `https://${new URL(c.req.url).host}`).toString(), {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${c.env.MESSENGER_WEBHOOK_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hostId:    user.id,
          roomId,
          roomTitle,
        }),
      }).catch(err => console.warn('[rooms/delete] room-ended notify failed (non-fatal):', err))
    );
  }

  await Promise.all([cleanupPromise, livekitPromise, summaryPromise]);

  console.log(JSON.stringify({ level: 'info', event: 'room_ended', roomId, hostId: user.id, service: 'loop-api', timestamp: new Date().toISOString() }));
  return c.json({ ok: true, roomId });
});

/**
 * PATCH /api/rooms/:roomId
 * Host updates mutable room fields (title, description, visibility).
 * Only the host can modify their room.
 */
rooms.patch('/:roomId', requireAuth(), async (c) => {
  const { roomId } = c.req.param();
  const user    = c.get('user');
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Accept: 'application/json' };

  // Verify host
  const roomResp = await fetch(`${sbUrl}/rest/v1/rooms?id=eq.${roomId}&select=id,host_id&limit=1`, { headers });
  if (!roomResp.ok) return c.json({ error: 'Failed to fetch room' }, 500);
  const rooms_ = await roomResp.json() as { id: string; host_id: string }[];
  if (!rooms_.length) return c.json({ error: 'Room not found' }, 404);
  if (rooms_[0].host_id !== user.id) return c.json({ error: 'Only the host can edit this room' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const allowed = ['title', 'description', 'visibility'] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body && body[k] !== undefined) patch[k] = body[k];
  }
  if (!Object.keys(patch).length) return c.json({ error: 'No valid fields to update' }, 400);
  if (typeof patch.title === 'string' && !patch.title.trim()) return c.json({ error: 'Title cannot be empty' }, 400);

  const updateResp = await fetch(`${sbUrl}/rest/v1/rooms?id=eq.${roomId}`, {
    method: 'PATCH', headers, body: JSON.stringify(patch),
  });
  if (!updateResp.ok) {
    const errBody = await updateResp.text().catch(() => '');
    console.error('[rooms/patch] failed:', updateResp.status, errBody.slice(0, 200));
    return c.json({ error: 'Failed to update room' }, 500);
  }
  return c.json({ ok: true, roomId, updated: Object.keys(patch) });
});


/**
 * POST /api/rooms/:roomId/heartbeat
 * Host liveness signal — called every 60s from the room page.
 *
 * DISCONNECT-001 (2026-06-10):
 *   1. Verifies the caller is the room's host.
 *   2. Updates last_heartbeat_at on the room row (for cron backup).
 *   3. Resets the RoomSession DO alarm to now + 5 minutes.
 *
 * If the host stops heartbeating (disconnect, crash, tab close), the DO
 * alarm fires after 5 minutes and auto-ends the room.
 */
rooms.post('/:roomId/heartbeat', requireAuth(), async (c) => {
  const { roomId } = c.req.param();
  const user    = c.get('user');
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: sbKey, Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json', Accept: 'application/json',
  };

  // Verify host ownership (cheap single-row lookup)
  const roomResp = await fetch(`${sbUrl}/rest/v1/rooms?id=eq.${roomId}&select=id,host_id&limit=1`, { headers });
  if (!roomResp.ok) return c.json({ error: 'Failed to verify room' }, 500);
  const rows = await roomResp.json() as { id: string; host_id: string }[];
  if (!rows.length) return c.json({ error: 'Room not found' }, 404);
  if (rows[0].host_id !== user.id) return c.json({ error: 'Only the host can heartbeat this room' }, 403);

  // Update last_heartbeat_at in Supabase (belt-and-suspenders for cron)
  await fetch(`${sbUrl}/rest/v1/rooms?id=eq.${roomId}`, {
    method: 'PATCH', headers,
    body:   JSON.stringify({ last_heartbeat_at: new Date().toISOString() }),
  }).catch((err) => console.warn('[heartbeat] db update failed:', err));

  // Reset DO alarm (primary recovery mechanism)
  try {
    const doId   = c.env.ROOM_SESSION.idFromName(roomId);
    const doStub = c.env.ROOM_SESSION.get(doId);
    await doStub.fetch(new Request('https://do-internal/heartbeat', {
      method: 'POST',
      body:   JSON.stringify({ roomId, hostId: user.id }),
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch (err) {
    // DO unavailable — DB update above is the fallback; don't fail the request
    console.warn('[heartbeat] DO alarm reset failed (non-fatal):', err);
  }

  return c.json({ ok: true });
});

export { rooms };
