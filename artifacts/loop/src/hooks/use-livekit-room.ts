// Loop — LiveKit Audio Hook (PTT + Data-Channel Chat)
// Merges loop-core's PTT and data-channel chat into loop's production-grade connection.
//
// Production invariants kept from loop:
//   COOKIE-001 (2026-06-10): fetchLiveKitToken uses authFetch (HttpOnly cookie + Bearer).
//   TOKEN-REFRESH-001 (2026-06-10): tokenProvider passed to lk.connect() for seamless refresh.
//   Graceful degradation: no VITE_LIVEKIT_URL → UI-only mode, no error shown.
//
// Added from loop-core:
//   PTT-001: Push-to-talk via pub.mute()/unmute(). Listeners get requestToSpeak flow.
//   CHAT-001: Data-channel chat via room.localParticipant.publishData() + DataReceived event.
//
// Usage:
//   const { muted, speakingIds, toggleMic, audioState,
//           pttMode, isPTTActive, startPTT, endPTT, togglePttMode,
//           messages, unreadCount, sendMessage, markChatRead, markChatClosed,
//         } = useLiveKitRoom(roomId, userId, enabled);
// LILCKY STUDIO LIMITED

import { useCallback, useEffect, useRef, useState } from "react";
import { Room as LiveKitRoom, RoomEvent, Track } from "livekit-client";
import { fetchLiveKitToken, createLiveKitTokenProvider, LIVEKIT_URL } from "@/lib/livekit";

export type AudioState = "idle" | "connecting" | "connected" | "error";

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
  isLocal: boolean;
}

interface ChatPayload {
  type: "chat";
  id: string;
  from: string;
  text: string;
  ts: number;
}

const CHAT_TOPIC = "loop-chat";

export type UseLiveKitRoomResult = {
  audioState: AudioState;
  audioError: string | null;
  muted: boolean;
  speakingIds: Set<string>;
  toggleMic: () => Promise<void>;
  // PTT-001
  pttMode: boolean;
  isPTTActive: boolean;
  startPTT: () => Promise<void>;
  endPTT: () => Promise<void>;
  togglePttMode: () => void;
  // CHAT-001
  messages: ChatMessage[];
  unreadCount: number;
  sendMessage: (text: string) => Promise<void>;
  markChatRead: () => void;
  markChatClosed: () => void;
};

export function useLiveKitRoom(
  roomId: string | undefined,
  userId: string | undefined,
  enabled: boolean,
): UseLiveKitRoomResult {
  const lkRef        = useRef<LiveKitRoom | null>(null);
  const pttActiveRef = useRef(false);
  const chatOpenRef  = useRef(false);

  const [audioState,  setAudioState]  = useState<AudioState>("idle");
  const [audioError,  setAudioError]  = useState<string | null>(null);
  const [muted,       setMuted]       = useState(true);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const [pttMode,     setPttMode]     = useState(false);
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
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
      setIsPTTActive(false);
    });
    lk.on(RoomEvent.ActiveSpeakersChanged, refreshSpeakers);
    lk.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === "reconnecting") setAudioState("connecting");
    });
    lk.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) track.attach();
    });

    // CHAT-001: Receive data-channel messages
    lk.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      try {
        const raw = new TextDecoder().decode(payload);
        const msg = JSON.parse(raw) as ChatPayload;
        if (msg.type !== "chat") return;
        const incoming: ChatMessage = {
          id:      msg.id,
          from:    msg.from,
          text:    msg.text,
          ts:      msg.ts,
          isLocal: false,
        };
        setMessages((prev) => [...prev, incoming]);
        setUnreadCount((prev) => chatOpenRef.current ? 0 : prev + 1);
      } catch { /* malformed payload — ignore */ }
    });

    void (async () => {
      try {
        const token         = await fetchLiveKitToken(roomId, userId);
        const tokenProvider = createLiveKitTokenProvider(roomId, userId);

        await lk.connect(LIVEKIT_URL, token, { tokenProvider });

        // Join muted — privacy-first. Track stays published so PTT can unmute quickly.
        await lk.localParticipant.setMicrophoneEnabled(true);
        const pub = Array.from(lk.localParticipant.audioTrackPublications.values())[0];
        if (pub) await pub.mute();
        setMuted(true);

        lk.remoteParticipants.forEach((p) =>
          p.audioTrackPublications.forEach((pub) => {
            if (pub.track) pub.track.attach();
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Audio connection failed";
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
      lkRef.current  = null;
      pttActiveRef.current = false;
      setAudioState("idle");
      setSpeakingIds(new Set());
      setIsPTTActive(false);
    };
  }, [enabled, roomId, userId]);

  // ── Open-mic toggle ────────────────────────────────────────────────────── //

  const toggleMic = useCallback(async () => {
    const lk = lkRef.current;
    if (!lk || lk.state !== "connected") {
      setMuted((m) => !m);
      return;
    }
    const pub = Array.from(lk.localParticipant.audioTrackPublications.values())[0];
    if (!pub) {
      // Track not published yet — publish and unmute
      try {
        await lk.localParticipant.setMicrophoneEnabled(true);
        setMuted(false);
      } catch { /* mic denied */ }
      return;
    }
    if (pub.isMuted) {
      await pub.unmute();
      setMuted(false);
    } else {
      await pub.mute();
      setMuted(true);
    }
  }, []);

  // ── PTT-001 ────────────────────────────────────────────────────────────── //

  const startPTT = useCallback(async () => {
    if (pttActiveRef.current) return;
    pttActiveRef.current = true;
    setIsPTTActive(true);
    const lk = lkRef.current;
    if (!lk || lk.state !== "connected") return;
    const local = lk.localParticipant;
    const pub   = Array.from(local.audioTrackPublications.values())[0];
    if (!pub) {
      try {
        await local.setMicrophoneEnabled(true);
        setMuted(false);
      } catch {
        pttActiveRef.current = false;
        setIsPTTActive(false);
      }
      return;
    }
    if (pub.isMuted) {
      await pub.unmute();
      setMuted(false);
    }
  }, []);

  const endPTT = useCallback(async () => {
    if (!pttActiveRef.current) return;
    pttActiveRef.current = false;
    setIsPTTActive(false);
    const lk = lkRef.current;
    if (!lk || lk.state !== "connected") return;
    const pub = Array.from(lk.localParticipant.audioTrackPublications.values())[0];
    if (pub && !pub.isMuted) {
      await pub.mute();
      setMuted(true);
    }
  }, []);

  const togglePttMode = useCallback(() => {
    setPttMode((prev) => {
      const next = !prev;
      // Switching to open-mic: unmute if track is published
      if (!next) {
        const lk = lkRef.current;
        if (lk && lk.state === "connected") {
          const pub = Array.from(lk.localParticipant.audioTrackPublications.values())[0];
          if (pub?.isMuted) {
            pub.unmute().then(() => setMuted(false)).catch(() => {});
          }
        }
      }
      // Switching to PTT: mute if open
      if (next) {
        const lk = lkRef.current;
        if (lk && lk.state === "connected") {
          const pub = Array.from(lk.localParticipant.audioTrackPublications.values())[0];
          if (pub && !pub.isMuted) {
            pub.mute().then(() => setMuted(true)).catch(() => {});
          }
        }
        pttActiveRef.current = false;
        setIsPTTActive(false);
      }
      return next;
    });
  }, []);

  // ── CHAT-001 ───────────────────────────────────────────────────────────── //

  const sendMessage = useCallback(async (text: string) => {
    const lk = lkRef.current;
    if (!lk || !text.trim()) return;
    const payload: ChatPayload = {
      type: "chat",
      id:   `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: userId ?? "unknown",
      text: text.trim(),
      ts:   Date.now(),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    await lk.localParticipant.publishData(bytes, { reliable: true, topic: CHAT_TOPIC });
    setMessages((prev) => [...prev, { ...payload, isLocal: true }]);
  }, [userId]);

  const markChatRead = useCallback(() => {
    chatOpenRef.current = true;
    setUnreadCount(0);
  }, []);

  const markChatClosed = useCallback(() => {
    chatOpenRef.current = false;
  }, []);

  return {
    audioState, audioError, muted, speakingIds, toggleMic,
    pttMode, isPTTActive, startPTT, endPTT, togglePttMode,
    messages, unreadCount, sendMessage, markChatRead, markChatClosed,
  };
}
