// Loop API Server — Audio Token Route (P0-001)
// GET /api/audio/token?room_id=<id>&identity=<userId>
//
// Issues a short-lived LiveKit JWT granting the caller permission to
// join and participate in the specified room.
//
// Auth:   Bearer <loop_token> (RALD JWT, verified against RALD_JWT_SECRET)
// Env:    LIVEKIT_API_KEY, LIVEKIT_API_SECRET (from LiveKit Cloud dashboard)
//
// Role-based mic control is enforced client-side by useLiveKitRoom (starts
// muted; only speakers who explicitly unmute publish audio tracks). Sprint 02
// will add server-side publish grants tied to room_participants.role.
// LILCKY STUDIO LIMITED

import { Router, type Request, type Response } from "express";
import { AccessToken } from "livekit-server-sdk";
import { verifyJwt } from "../lib/jwt";

const router = Router();

const RALD_JWT_SECRET  = process.env["RALD_JWT_SECRET"]    ?? "";
const LIVEKIT_API_KEY  = process.env["LIVEKIT_API_KEY"]    ?? "";
const LIVEKIT_API_SECRET = process.env["LIVEKIT_API_SECRET"] ?? "";

// Token TTL: 2 hours — enough for a long room session without becoming stale.
const TOKEN_TTL = "2h";

// ── GET /api/audio/token ──────────────────────────────────────────────────────
// Query:  room_id  — the Loop room UUID
//         identity — the caller's user ID (must match the authenticated user)
// Returns { token: string } — a signed LiveKit access token
router.get("/token", async (req: Request, res: Response) => {
  // ── 1. Verify caller is a valid Loop user ──────────────────────────────────
  const authHeader = (req.headers["authorization"] ?? "") as string;
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized — Bearer token required" });
    return;
  }
  if (!RALD_JWT_SECRET) {
    res.status(503).json({ error: "Auth service not configured" });
    return;
  }
  const loopToken = authHeader.slice(7);
  const payload = await verifyJwt(loopToken, RALD_JWT_SECRET);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // ── 2. Validate query params ───────────────────────────────────────────────
  const roomId   = (req.query["room_id"]  as string | undefined)?.trim();
  const identity = (req.query["identity"] as string | undefined)?.trim();
  if (!roomId || !identity) {
    res.status(400).json({ error: "room_id and identity are required" });
    return;
  }
  // The identity in the request must match the authenticated user (prevents
  // impersonation — user A cannot request a token as user B).
  if (identity !== payload.id) {
    res.status(403).json({ error: "Identity mismatch — identity must match authenticated user" });
    return;
  }

  // ── 3. Check LiveKit credentials are configured ────────────────────────────
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    res.status(503).json({
      error: "Audio service not configured — set LIVEKIT_API_KEY and LIVEKIT_API_SECRET",
    });
    return;
  }

  // ── 4. Generate LiveKit access token ──────────────────────────────────────
  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl: TOKEN_TTL,
    });
    at.addGrant({
      roomJoin:     true,
      room:         roomId,
      canPublish:   true,   // mic gating is client-side (starts muted)
      canSubscribe: true,   // all participants receive audio from speakers
      canPublishData: true, // enables text/data channel for future use
    });
    const token = await at.toJwt();
    res.json({ token });
  } catch (err) {
    console.error("[audio-token] LiveKit token generation failed:", String(err));
    res.status(500).json({ error: "Failed to generate audio token" });
  }
});

export default router;
