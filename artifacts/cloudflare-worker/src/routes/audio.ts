// Loop — LiveKit Audio Token Endpoint
// GET /api/audio/token?room_id=&identity=
//
// Returns a signed LiveKit JWT for the authenticated user.
// Role-based canPublish permissions: listeners cannot publish;
// speakers, hosts, moderators, and admins can.
//
// LIVEKIT-ROLES-001 (2026-06-13): Replace canPublish=true-for-all with
//   role lookup from room_participants table. Default role: listener.
//   See SECURITY/hardening/LIVEKIT_ROLE_MODEL.md for full spec.
//
// If LIVEKIT credentials are absent, returns 503 with configuration
// guidance rather than crashing the worker.
//
// JWT signed with HMAC-SHA256 using Web Crypto API (no Node.js crypto).
// LILCKY STUDIO LIMITED

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Bindings: CloudflareEnv; Variables: { user: AuthUser } }>();

// ── Role types ────────────────────────────────────────────────────────────────

type RoomRole = "listener" | "speaker" | "host" | "moderator" | "admin";

interface RoomPermissions {
  canPublish:     boolean;
  canSubscribe:   boolean;
  canPublishData: boolean;
}

/** Derive LiveKit permissions from room role. Listeners are read-only. */
function roleToPermissions(role: RoomRole): RoomPermissions {
  const canPublish = role !== "listener";
  return {
    canPublish,
    canSubscribe:   true,
    canPublishData: canPublish,
  };
}

/**
 * Look up the user's role in room_participants via the Supabase REST API.
 *
 * Falls back to "listener" on any error so that an outage in the DB
 * degrades gracefully (users stay connected as listeners rather than
 * getting blocked entirely).
 *
 * Room creators are recorded as "host" at room-creation time.
 * Moderators are elevated by hosts via POST /api/audio/rooms/:roomId/participants/:userId/role.
 */
async function getRoomRole(
  sbUrl: string,
  sbKey: string,
  userId: string,
  roomId: string,
): Promise<RoomRole> {
  try {
    const url = `${sbUrl}/rest/v1/room_participants` +
      `?room_id=eq.${encodeURIComponent(roomId)}` +
      `&user_id=eq.${encodeURIComponent(userId)}` +
      `&select=role` +
      `&limit=1`;

    const res = await fetch(url, {
      headers: {
        apikey:        sbKey,
        Authorization: `Bearer ${sbKey}`,
        Accept:        "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`[audio/token] room_participants lookup HTTP ${res.status} — defaulting to listener`);
      return "listener";
    }

    const rows = await res.json() as { role?: string }[];
    const raw  = rows[0]?.role;

    if (
      raw === "speaker"   ||
      raw === "host"      ||
      raw === "moderator" ||
      raw === "admin"
    ) {
      return raw as RoomRole;
    }

    // No record or unrecognised role → listener (read-only)
    return "listener";
  } catch (err) {
    console.warn("[audio/token] room_participants lookup threw — defaulting to listener:", err);
    return "listener";
  }
}

// ── JWT signing ───────────────────────────────────────────────────────────────

async function signLiveKitJwt(
  apiKey: string,
  apiSecret: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const b64url = (obj: Record<string, unknown>) => {
    const s = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(s)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const header: Record<string, unknown> = { alg: "HS256", typ: "JWT" };
  const unsigned = `${b64url(header)}.${b64url(payload)}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${unsigned}.${sig}`;
}

// ── GET /api/audio/token?room_id=<id> ────────────────────────────────────────

app.get("/token", requireAuth(), async (c) => {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = c.env;

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return c.json(
      {
        error: "LiveKit not configured",
        hint: "Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL via `wrangler secret put`",
        configured: false,
      },
      503,
    );
  }

  const roomId   = c.req.query("room_id");
  const user     = c.get("user");
  const identity = c.req.query("identity") ?? user.id;

  if (!roomId) {
    return c.json({ error: "room_id query param is required" }, 400);
  }

  // LIVEKIT-ROLES-001: look up role from room_participants; default to listener
  const role        = await getRoomRole(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, user.id, roomId);
  const permissions = roleToPermissions(role);

  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: LIVEKIT_API_KEY,
    sub: identity,
    nbf: now,
    exp: now + 4 * 3600,
    jti: `${identity}-${roomId}-${now}`,
    video: {
      roomJoin:       true,
      room:           roomId,
      canPublish:     permissions.canPublish,
      canSubscribe:   permissions.canSubscribe,
      canPublishData: permissions.canPublishData,
    },
  };

  try {
    const token = await signLiveKitJwt(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, payload);
    return c.json({
      token,
      url:  LIVEKIT_URL ?? "",
      room: roomId,
      role,
      can_publish: permissions.canPublish,
    });
  } catch (err) {
    console.error("[audio/token] signing error:", err);
    return c.json({ error: "Token generation failed" }, 500);
  }
});

// ── POST /api/audio/rooms/:roomId/participants/:userId/role ───────────────────
// Host/moderator/admin elevates or demotes a participant's role.

app.post("/rooms/:roomId/participants/:userId/role", requireAuth(), async (c) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = c.env;
  const caller  = c.get("user");
  const roomId  = c.req.param("roomId");
  const userId  = c.req.param("userId");
  const body    = await c.req.json<{ role?: string }>().catch(() => null);
  const newRole = body?.role;

  if (!newRole || !["listener", "speaker"].includes(newRole)) {
    return c.json({ error: "role must be 'listener' or 'speaker'" }, 400);
  }

  // Verify caller is host/moderator/admin of this room
  const callerRole = await getRoomRole(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, caller.id, roomId);
  if (callerRole !== "host" && callerRole !== "moderator" && callerRole !== "admin") {
    return c.json({ error: "Only hosts and moderators can change participant roles" }, 403);
  }

  // Upsert the participant role
  const res = await fetch(`${SUPABASE_URL}/rest/v1/room_participants`, {
    method:  "POST",
    headers: {
      apikey:          SUPABASE_SERVICE_ROLE_KEY,
      Authorization:   `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type":  "application/json",
      Prefer:          "resolution=merge-duplicates",
    },
    body: JSON.stringify({ room_id: roomId, user_id: userId, role: newRole }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[audio/role] upsert failed:", res.status, text);
    return c.json({ error: "Failed to update role" }, 500);
  }

  return c.json({ room_id: roomId, user_id: userId, role: newRole, updated_by: caller.id });
});

export { app as audio };
