// Loop — LiveKit Audio Hook (P0-001)
// Manages LiveKit connection lifecycle, mic mute state, and speaking indicators.
//
// Graceful degradation:
//   - If VITE_LIVEKIT_URL is not set → UI-only mode (local mute state only)
//   - If token fetch fails → audioState = "error", UI remains functional
//   - If LiveKit disconnects → reconnect is handled automatically by the SDK
//
// Usage:
//   const { muted, speakingIds, toggleMic, audioState } = useLiveKitRoom(roomId, userId, enabled);
// LILCKY STUDIO LIMITED

import { useCallback, useEffect, useRef, useState } from "react";
import { Room as LiveKitRoom, RoomEvent, Track } from "livekit-client";
import { fetchLiveKitToken, LIVEKIT_URL } from "@/lib/livekit";

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
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
      adaptiveStream: true,
      dynacast: true,
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
        const token = await fetchLiveKitToken(roomId, userId);
        await lk.connect(LIVEKIT_URL, token);
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
    const lk = lkRef.current;
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
