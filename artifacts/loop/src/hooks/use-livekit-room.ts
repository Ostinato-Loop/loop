// Loop — LiveKit Audio Hook
// Manages LiveKit connection lifecycle, mic mute state, and speaking indicators.
//
// Graceful degradation:
//   - If VITE_LIVEKIT_URL is not set → UI-only mode (local mute state only)
//   - If token fetch fails → audioState = "error", UI remains functional
//   - If LiveKit disconnects → reconnect handled automatically by the SDK
//
// COOKIE-001 FIX (2026-06-10): fetchLiveKitToken now uses authFetch.
//   Prior version used localStorage.getItem("loop_token") — removed in COOKIE-001.
//   Audio was silently broken for all users since that migration.
//
// TOKEN-REFRESH-001 (2026-06-10): Pass tokenProvider to lk.connect().
//   LiveKit SDK v2.x calls tokenProvider() automatically before the token
//   expires (~90% of TTL). This eliminates the 4-hour hard disconnect.
//   No additional timers needed — the SDK handles the refresh lifecycle.
//
// Usage:
//   const { muted, speakingIds, toggleMic, audioState } = useLiveKitRoom(roomId, userId, enabled);
// LILCKY STUDIO LIMITED

import { useCallback, useEffect, useRef, useState } from "react";
import { Room as LiveKitRoom, RoomEvent, Track } from "livekit-client";
import { fetchLiveKitToken, createLiveKitTokenProvider, LIVEKIT_URL } from "@/lib/livekit";

export type AudioState = "idle" | "connecting" | "connected" | "error";

export type UseLiveKitRoomResult = {
  audioState: AudioState;
  audioError: string | null;
  muted: boolean;
  speakingIds: Set<string>;
  toggleMic: () => Promise<void>;
};

export function useLiveKitRoom(
  roomId: string | undefined,
  userId: string | undefined,
  enabled: boolean,
): UseLiveKitRoomResult {
  const lkRef = useRef<LiveKitRoom | null>(null);
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true); // start muted — user opts into speaking
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // UI-only mode: no LIVEKIT_URL configured yet
    if (!LIVEKIT_URL || !enabled || !roomId || !userId) return;

    const lk = new LiveKitRoom({
      audioCaptureDefaults: {
        autoGainControl:  true,
        echoCancellation: true,
        noiseSuppression: true,
      },
      adaptiveStream: true,
      dynacast:       true,
    });
    lkRef.current = lk;
    setAudioState("connecting");
    setAudioError(null);

    const refreshSpeakers = () => {
      const active = new Set<string>();
      lk.remoteParticipants.forEach((p) => {
        if (p.isSpeaking) active.add(p.identity);
      });
      if (lk.localParticipant.isSpeaking) active.add(lk.localParticipant.identity);
      setSpeakingIds(new Set(active));
    };

    lk.on(RoomEvent.Connected, () => {
      setAudioState("connected");
      setAudioError(null);
    });
    lk.on(RoomEvent.Disconnected, () => {
      setAudioState("idle");
      setSpeakingIds(new Set());
    });
    lk.on(RoomEvent.ActiveSpeakersChanged, refreshSpeakers);
    lk.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === "reconnecting") setAudioState("connecting");
    });
    // Auto-attach audio tracks from remote participants
    lk.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) track.attach();
    });

    void (async () => {
      try {
        // TOKEN-REFRESH-001: Fetch initial token, then pass tokenProvider so the
        // SDK refreshes automatically before expiry. No manual timer needed.
        const token         = await fetchLiveKitToken(roomId, userId);
        const tokenProvider = createLiveKitTokenProvider(roomId, userId);

        await lk.connect(LIVEKIT_URL, token, {
          // SDK calls tokenProvider() at ~90% of TTL elapsed — seamless refresh
          tokenProvider,
        });

        // Join muted — privacy-first
        await lk.localParticipant.setMicrophoneEnabled(false);

        // Attach any tracks already published before we joined
        lk.remoteParticipants.forEach((p) =>
          p.audioTrackPublications.forEach((pub) => {
            if (pub.track) pub.track.attach();
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Audio connection failed";

        // LiveKit not configured — degrade silently (no error shown to user)
        if (msg === "__livekit_not_configured__") {
          setAudioState("idle");
          lkRef.current = null;
          return;
        }

        setAudioError(msg);
        setAudioState("error");
        lkRef.current = null;
      }
    })();

    return () => {
      lk.removeAllListeners();
      void lk.disconnect();
      lkRef.current = null;
      setAudioState("idle");
      setSpeakingIds(new Set());
    };
  }, [enabled, roomId, userId]);

  const toggleMic = useCallback(async () => {
    const lk   = lkRef.current;
    const next = !muted;
    setMuted(next);

    if (!lk || lk.state !== "connected") {
      // UI-only mode or not yet connected — just track local state
      return;
    }
    try {
      // next = false → user will be unmuted → enable mic
      // next = true  → user will be muted   → disable mic
      await lk.localParticipant.setMicrophoneEnabled(!next);
    } catch {
      setMuted(!next); // revert on error
    }
  }, [muted]);

  return { audioState, audioError, muted, speakingIds, toggleMic };
}
