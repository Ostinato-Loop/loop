// Loop — LiveKit Audio Token Endpoint
// GET /api/audio/token?room_id=&identity=
//
// Returns a signed LiveKit JWT for the authenticated user.
// If LIVEKIT credentials are absent, returns 503 with configuration
// guidance rather than crashing the worker.
//
// JWT signed with HMAC-SHA256 using Web Crypto API (no Node.js crypto).
// LILCKY STUDIO LIMITED

import { Hono } from "hono";
import { createClient as _createClient } from "@supabase/supabase-js";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Bindings: CloudflareEnv; Variables: { user: AuthUser } }>();

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

// GET /api/audio/token?room_id=<id>
app.get("/token", requireAuth(), async (c) => {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = c.env;

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
      canPublish:     true,
      canSubscribe:   true,
      canPublishData: true,
    },
  };

  try {
    const token = await signLiveKitJwt(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, payload);
    return c.json({ token, url: LIVEKIT_URL ?? "", room: roomId });
  } catch (err) {
    console.error("[audio/token] signing error:", err);
    return c.json({ error: "Token generation failed" }, 500);
  }
});

export { app as audio };
