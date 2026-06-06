// Loop — LiveKit Audio Utility (P0-001)
// Decision: LiveKit Cloud — AWS Lagos PoP, $0 at low usage, scales to 1M+
//
// Backend contract: the Loop Worker must expose:
//   GET /api/audio/token?room_id=<id>&identity=<userId>
//   → 200 { token: string }  (JWT signed with LIVEKIT_API_KEY + LIVEKIT_API_SECRET)
//
// Required Worker env vars:
//   LIVEKIT_URL        wss://<project>.livekit.cloud
//   LIVEKIT_API_KEY    <key from LiveKit Cloud dashboard>
//   LIVEKIT_API_SECRET <secret from LiveKit Cloud dashboard>
//
// Required frontend env vars:
//   VITE_LIVEKIT_URL   wss://<project>.livekit.cloud
//
// If VITE_LIVEKIT_URL is not set, useLiveKitRoom operates in UI-only mode
// (mic toggle shows state but no audio is transmitted or received).
// LILCKY STUDIO LIMITED

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export const LIVEKIT_URL: string = (import.meta.env.VITE_LIVEKIT_URL as string | undefined) ?? "";

/**
 * Fetches a short-lived LiveKit JWT from the Loop Worker.
 * The token grants the caller permission to publish and subscribe in `roomId`.
 */
export async function fetchLiveKitToken(
  roomId: string,
  identity: string,
): Promise<string> {
  const loopToken = localStorage.getItem("loop_token");
  const url = `${API_BASE}/api/audio/token?room_id=${encodeURIComponent(roomId)}&identity=${encodeURIComponent(identity)}`;
  const res = await fetch(url, {
    headers: loopToken ? { Authorization: `Bearer ${loopToken}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Audio token request failed (${res.status})`);
  }
  const data = await res.json() as { token: string };
  if (!data.token) throw new Error("Audio token missing from response");
  return data.token;
}
