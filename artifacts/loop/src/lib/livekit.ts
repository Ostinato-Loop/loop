// Loop — LiveKit Audio Utility
// Decision: LiveKit Cloud — AWS Lagos PoP, $0 at low usage, scales to 1M+
//
// Backend contract: the Loop Worker must expose:
//   GET /api/audio/token?room_id=<id>&identity=<userId>
//   → 200 { token: string }  (JWT signed with LIVEKIT_API_KEY + LIVEKIT_API_SECRET)
//
// COOKIE-001 FIX (2026-06-10): Removed localStorage.getItem("loop_token") —
//   loop_token was removed from localStorage in COOKIE-001 (2026-06-09).
//   Token is now carried via HttpOnly cookie (credentials: "include") +
//   in-memory Authorization header via authFetch. Prior version silently
//   sent unauthenticated token requests, getting 401 every time.
//
// TOKEN-REFRESH-001 (2026-06-10):
//   createLiveKitTokenProvider() returns a TokenProvider function for the
//   LiveKit SDK's tokenProvider option. The SDK calls it automatically when
//   the token is near expiry (~90% of TTL), refreshing seamlessly without
//   disconnecting participants.
//
// LILCKY STUDIO LIMITED

import { authFetch } from "@/lib/api-fetch";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export const LIVEKIT_URL: string = (import.meta.env.VITE_LIVEKIT_URL as string | undefined) ?? "";

/**
 * fetchLiveKitToken — fetches a signed LiveKit JWT from the Loop Worker.
 *
 * Uses authFetch (not bare fetch) so the HttpOnly loop_session cookie is
 * forwarded and the in-memory Bearer token is attached. Replaces the previous
 * localStorage-based approach removed in COOKIE-001.
 */
export async function fetchLiveKitToken(
  roomId: string,
  identity: string,
): Promise<string> {
  const url = `${API_BASE}/api/audio/token?room_id=${encodeURIComponent(roomId)}&identity=${encodeURIComponent(identity)}`;
  const res = await authFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; configured?: boolean };
    if (body.configured === false) {
      // LiveKit not yet configured — UI-only mode, not an error to surface
      throw new Error("__livekit_not_configured__");
    }
    throw new Error(body.error ?? `Audio token request failed (${res.status})`);
  }
  const data = await res.json() as { token: string };
  if (!data.token) throw new Error("Audio token missing from response");
  return data.token;
}

/**
 * createLiveKitTokenProvider — returns a TokenProvider function compatible
 * with LiveKit SDK v2.x ConnectOptions.tokenProvider.
 *
 * The SDK calls this automatically before the current token expires
 * (typically at ~90% of TTL elapsed), refreshing the session without
 * disconnecting. This eliminates the 4-hour hard cutoff.
 *
 * Usage:
 *   await room.connect(LIVEKIT_URL, initialToken, {
 *     tokenProvider: createLiveKitTokenProvider(roomId, userId),
 *   });
 */
export function createLiveKitTokenProvider(
  roomId: string,
  identity: string,
): () => Promise<string> {
  return () => fetchLiveKitToken(roomId, identity);
}
