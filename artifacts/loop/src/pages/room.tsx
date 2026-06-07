// Loop — Room Page (canonical)
// P0-002 FIX: Host sees host-only controls (End Room, mic, speaker queue hints).
//   Listener sees Raise Hand button. Co-host/Speaker see mic toggle.
//   Role is derived from room_participants.role for the current user.
// P0-003 FIX: toggleHandRaise broadcasts via Supabase Realtime channel so the
//   host receives the notification in real-time without a DB migration.
// P0-007: This file is now routed from App.tsx (/rooms/:roomId → RoomPage).
// LILCKY STUDIO LIMITED

import { useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  getRoom, joinRoom, leaveRoom, setRoomLive,
  listMessages, listParticipants,
  sendMessage, sendReaction,
  type Room,
} from "@/lib/api/rooms";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, BadgeCheck, Hand, Mic, MicOff,
  Send, Sparkles, Users, X, Star,
  PhoneOff, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLiveKitRoom } from "@/hooks/use-livekit-room";

/* ─── types ──────────────────────────────────────────────────────────── */
type ParticipantRow = {
  user_id: string;
  role: string;
  profiles: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    is_creator?: boolean;
  } | null;
};
type MessageRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};
type FloatingReaction = { id: number; emoji: string; x: number; lane: number };
type ActivityItem = { id: number; text: string };

const REACTIONS = ["🔥", "👏", "❤️", "🎯", "😂", "💯"];
const LANES = 5;

/* ─── helpers ────────────────────────────────────────────────────────── */
function roleBadge(role: string) {
  if (role === "host") return { label: "Host", cls: "bg-primary text-primary-foreground" };
  if (role === "moderator") return { label: "Mod", cls: "bg-secondary text-secondary-foreground" };
  if (role === "speaker") return { label: "Speaker", cls: "bg-accent/80 text-accent-foreground" };
  return null;
}

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "from-emerald-500 to-teal-500",
  "from-fuchsia-500 to-purple-500",
  "from-amber-500 to-orange-500",
  "from-sky-500 to-blue-500",
  "from-rose-500 to-pink-500",
  "from-mint to-mint-glow",
];
function avatarColor(uid: string) {
  let n = 0;
  for (let i = 0; i < uid.length; i++) n += uid.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

/* ─── SpeakerAvatar ──────────────────────────────────────────────────── */
function SpeakerAvatar({ p, speaking }: { p: ParticipantRow; speaking: boolean }) {
  const badge = roleBadge(p.role);
  const color = avatarColor(p.user_id);
  const name = p.profiles?.display_name ?? "User";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {speaking && (
          <>
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" style={{ animationDuration: "1.2s" }} />
            <span className="absolute -inset-1 rounded-full ring-2 ring-primary/60" />
          </>
        )}
        <div
          className={cn(
            "relative h-16 w-16 rounded-full bg-gradient-to-br flex items-center justify-center font-display font-bold text-base text-white shadow-lg transition-all duration-300",
            color,
            speaking && "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105",
          )}
        >
          {initials(name)}
        </div>
        {badge && (
          <span className={cn(
            "absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-px text-[8px] font-bold uppercase",
            badge.cls,
          )}>
            {badge.label}
          </span>
        )}
        {p.profiles?.is_verified && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-background">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" />
          </span>
        )}
        {p.profiles?.is_creator && (
          <span className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-background">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          </span>
        )}
      </div>
      <p className="max-w-[64px] truncate text-center text-[10px] font-medium leading-tight text-foreground/80">
        {name}
      </p>
    </div>
  );
}

/* ─── AudienceAvatar ──────────────────────────────────────────────────── */
function AudienceAvatar({ p }: { p: ParticipantRow }) {
  const color = avatarColor(p.user_id);
  const name = p.profiles?.display_name ?? "?";
  return (
    <div
      className={cn("h-9 w-9 shrink-0 rounded-full bg-gradient-to-br flex items-center justify-center text-[10px] font-bold text-white", color)}
      title={name}
    >
      {initials(name)}
    </div>
  );
}

/* ─── HostControls ───────────────────────────────────────────────────── */
function HostControls({
  muted,
  onToggleMic,
  onEndRoom,
  raisedHandCount,
}: {
  muted: boolean;
  onToggleMic: () => void;
  onEndRoom: () => void;
  raisedHandCount: number;
  audioError?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      {/* Mic toggle */}
      <button
        onClick={onToggleMic}
        disabled={audioError}
        title={audioError ? "Audio unavailable" : undefined}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition",
          audioError
            ? "bg-destructive/10 text-destructive cursor-not-allowed opacity-60"
            : muted
            ? "bg-secondary text-foreground"
            : "bg-primary text-primary-foreground neon-glow",
        )}
      >
        {audioError ? <MicOff className="h-4 w-4" /> : muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {audioError ? "No audio" : muted ? "Unmute" : "Mute"}
      </button>

      {/* Raised hands indicator */}
      {raisedHandCount > 0 && (
        <div className="flex items-center gap-1.5 rounded-2xl bg-amber-500/15 px-3 py-3">
          <Hand className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-bold text-amber-500">{raisedHandCount}</span>
        </div>
      )}

      {/* End room */}
      <button
        onClick={onEndRoom}
        className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-destructive/10 py-3 text-sm font-semibold text-destructive transition hover:bg-destructive/20"
      >
        <PhoneOff className="h-4 w-4" />
        End room
      </button>
    </div>
  );
}

/* ─── SpeakerControls ────────────────────────────────────────────────── */
function SpeakerControls({
  muted,
  onToggleMic,
  onLeave,
}: {
  muted: boolean;
  onToggleMic: () => void;
  onLeave: () => void;
  audioError?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        onClick={onToggleMic}
        disabled={audioError}
        title={audioError ? "Audio unavailable" : undefined}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition",
          audioError
            ? "bg-destructive/10 text-destructive cursor-not-allowed opacity-60"
            : muted
            ? "bg-secondary text-foreground"
            : "bg-primary text-primary-foreground neon-glow",
        )}
      >
        {audioError ? <MicOff className="h-4 w-4" /> : muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {audioError ? "No audio" : muted ? "Unmute" : "Mute"}
      </button>
      <button
        onClick={onLeave}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ─── ListenerControls ───────────────────────────────────────────────── */
function ListenerControls({
  handRaised,
  onToggleHand,
  onLeave,
}: {
  handRaised: boolean;
  onToggleHand: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        onClick={onToggleHand}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition",
          handRaised
            ? "bg-amber-500 text-white"
            : "bg-secondary text-foreground hover:bg-secondary/80",
        )}
      >
        <Hand className="h-4 w-4" />
        {handRaised ? "Lower hand" : "Raise hand"}
      </button>
      <button
        onClick={onLeave}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────────────── */
export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [floats, setFloats] = useState<FloatingReaction[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [draft, setDraft] = useState("");
  const { muted, speakingIds, toggleMic, audioState, audioError } = useLiveKitRoom(
    roomId,
    user?.id,
    !loading && !!user,
  );
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHandCount, setRaisedHandCount] = useState(0);
  const [entered, setEntered] = useState(false);

  const floatId = useRef(0);
  const actId = useRef(0);
  const msgEnd = useRef<HTMLDivElement>(null);
  const prevParticipants = useRef<ParticipantRow[]>([]);
  const eventChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);

  /* auth guard */
  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  const pushActivity = useCallback((text: string) => {
    const id = ++actId.current;
    setActivity((s) => [...s.slice(-4), { id, text }]);
    setTimeout(() => setActivity((s) => s.filter((a) => a.id !== id)), 4000);
  }, []);

  /* main data load + realtime */
  useEffect(() => {
    if (!user || !roomId) return;
    let active = true;

    (async () => {
      try {
        const [r, p, m] = await Promise.all([
          getRoom(roomId),
          listParticipants(roomId),
          listMessages(roomId),
        ]);
        if (!active) return;
        if (!r) { toast.error("Room not found"); navigate("/"); return; }
        setRoom(r);
        setParticipants(p as ParticipantRow[]);
        prevParticipants.current = p as ParticipantRow[];
        setMessages(m as MessageRow[]);
        await joinRoom(roomId, user.id);
        setTimeout(() => setEntered(true), 80);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load room");
      }
    })();

    /* Supabase Realtime channel for DB changes */
    const dbChannel = supabase
      .channel(`room:${roomId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const m = payload.new as { id: string; user_id: string; content: string; created_at: string };
          const { data: prof } = await supabase
            .from("profiles").select("username, display_name, avatar_url")
            .eq("id", m.user_id).maybeSingle();
          setMessages((s) => [...s, { ...m, profiles: prof ?? null } as MessageRow]);
        })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "room_reactions", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const { emoji } = payload.new as { emoji: string };
          const id = ++floatId.current;
          const lane = id % LANES;
          const x = (lane - 2) * 28 + (Math.random() * 12 - 6);
          setFloats((s) => [...s, { id, emoji, x, lane }]);
          setTimeout(() => setFloats((s) => s.filter((f) => f.id !== id)), 2800);
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "room_participants", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const next = await listParticipants(roomId);
          const prev = prevParticipants.current;
          if (payload.eventType === "INSERT") {
            const uid = (payload.new as { user_id: string }).user_id;
            const p = (next as ParticipantRow[]).find((x) => x.user_id === uid);
            if (uid !== user.id) pushActivity(`${p?.profiles?.display_name ?? "Someone"} joined`);
          }
          if (payload.eventType === "DELETE") {
            const uid = (payload.old as { user_id: string }).user_id;
            const p = prev.find((x) => x.user_id === uid);
            if (uid !== user.id) pushActivity(`${p?.profiles?.display_name ?? "Someone"} left`);
          }
          prevParticipants.current = next as ParticipantRow[];
          setParticipants(next as ParticipantRow[]);
        })
      .subscribe();

    /* Broadcast channel for raise_hand events (P0-003 host receives) */
    const evtCh = supabase
      .channel(`room:${roomId}:events`)
      .on("broadcast", { event: "raise_hand" }, (payload) => {
        const { raised } = payload.payload as { user_id: string; raised: boolean };
        setRaisedHandCount((n) => Math.max(0, raised ? n + 1 : n - 1));
      })
      .subscribe();
    eventChannel.current = evtCh;

    return () => {
      active = false;
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(evtCh);
      if (user) void leaveRoom(roomId, user.id);
    };
  }, [roomId, user, navigate, pushActivity]);

  /* auto-scroll messages */
  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !draft.trim() || !roomId) return;
    const content = draft.trim();
    setDraft("");
    const optimisticId = `opt-${Date.now()}`;
    setMessages((s) => [...s, {
      id: optimisticId,
      user_id: user.id,
      content,
      created_at: new Date().toISOString(),
      profiles: {
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      },
    }]);
    try {
      await sendMessage(roomId, user.id, content);
    } catch (err) {
      setMessages((s) => s.filter((m) => m.id !== optimisticId));
      toast.error(err instanceof Error ? err.message : "Failed to send");
    }
  };

  const react = async (emoji: string) => {
    if (!user || !roomId) return;
    const id = ++floatId.current;
    const lane = id % LANES;
    const x = (lane - 2) * 28 + (Math.random() * 12 - 6);
    setFloats((s) => [...s, { id, emoji, x, lane }]);
    setTimeout(() => setFloats((s) => s.filter((f) => f.id !== id)), 2800);
    try { await sendReaction(roomId, user.id, emoji); } catch { /* silent */ }
  };

  /* P0-003 FIX: toggleHandRaise broadcasts via the already-subscribed eventChannel */
  const toggleHandRaise = async () => {
    if (!user || !roomId || !eventChannel.current) return;
    const next = !handRaised;
    setHandRaised(next);
    try {
      await eventChannel.current.send({
        type: "broadcast",
        event: "raise_hand",
        payload: { user_id: user.id, raised: next },
      });
      if (next) toast.success("Hand raised — the host will be notified");
      else toast.info("Hand lowered");
    } catch {
      setHandRaised(!next);
      toast.error("Failed to update hand status");
    }
  };

  const endRoom = async () => {
    if (!roomId || !user) return;
    try {
      await setRoomLive(roomId, false);
      await leaveRoom(roomId, user.id);
    } catch { /* ignore */ }
    navigate("/");
  };

  const leaveRoom_ = async () => {
    if (!roomId || !user) return;
    try { await leaveRoom(roomId, user.id); } catch { /* ignore */ }
    navigate("/");
  };

  const myRole = participants.find((p) => p.user_id === user?.id)?.role ?? "listener";
  const isHost = myRole === "host";
  const isOnStage = ["host", "co-host", "speaker"].includes(myRole);
  const speakers = participants.filter((p) => ["host", "moderator", "speaker"].includes(p.role));
  const listeners = participants.filter((p) => p.role === "listener");

  if (!room) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <div className="h-10 w-10 animate-pulse rounded-full bg-gradient-mint" />
        <p className="text-sm text-muted-foreground">Entering the room…</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-background transition-opacity duration-500",
        entered ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={() => navigate("/")}
          className="grid h-9 w-9 place-items-center rounded-full bg-surface transition-colors active:bg-surface-elev"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary live-dot" />
              Live
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {participants.length}
            </span>

            {/* P0-001: Audio status indicator */}
            {audioState === "connected" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Audio on
              </span>
            )}
            {audioState === "error" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">
                <MicOff className="h-2.5 w-2.5" />
                Audio unavailable
              </span>
            )}
            {audioState === "connecting" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                Connecting…
              </span>
            )}
            {/* P0-002: Host badge in header */}
            {isHost && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                <Crown className="h-2.5 w-2.5" />
                Host
              </span>
            )}
          </div>
          <h1 className="truncate font-display text-sm font-bold leading-tight">{room.title}</h1>
        </div>
        <button
          onClick={leaveRoom_}
          className="grid h-9 w-9 place-items-center rounded-full bg-surface transition-colors active:bg-surface-elev"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* ── Stage ──────────────────────────────────────────────────── */}
      <section className="relative px-5 py-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          On stage · {speakers.length}
        </p>
        {speakers.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-8 text-center">
            <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-surface">
              <Mic className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">The stage is empty.</p>
          </div>
        ) : (
          <div className={cn(
            "mt-3 grid gap-4",
            speakers.length <= 3 ? "grid-cols-3" : speakers.length <= 6 ? "grid-cols-4" : "grid-cols-5",
          )}>
            {speakers.map((p) => (
              <SpeakerAvatar key={p.user_id} p={p} speaking={speakingIds.has(p.user_id)} />
            ))}
          </div>
        )}
      </section>

      {/* ── AI Summary — only shown when a summary exists ─────────── */}
      {room.ai_summary && (
        <section className="mx-5 mb-3 overflow-hidden rounded-2xl border border-primary/20 bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Pinned AI summary</span>
            <span className="ml-auto text-[10px] text-muted-foreground">Live</span>
          </div>
          <p className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            {room.ai_summary}
          </p>
        </section>
      )}

      {/* ── Audience grid ──────────────────────────────────────────── */}
      {listeners.length > 0 && (
        <section className="px-5 pb-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Audience · {listeners.length}
            </p>
            {listeners.length > 20 && (
              <span className="text-[10px] text-muted-foreground">+{listeners.length - 20} more</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {listeners.slice(0, 20).map((p) => (
              <AudienceAvatar key={p.user_id} p={p} />
            ))}
          </div>
        </section>
      )}

      {/* ── Chat messages ──────────────────────────────────────────── */}
      <section className="flex-1 space-y-2.5 overflow-y-auto px-5 pb-48">
        {messages.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">No messages yet — say something!</p>
        )}
        {messages.map((m) => {
          const isMe = m.user_id === user?.id;
          const color = avatarColor(m.user_id);
          return (
            <div key={m.id} className={cn("flex items-start gap-2", isMe && "flex-row-reverse")}>
              <div className={cn(
                "mt-0.5 h-7 w-7 shrink-0 rounded-full bg-gradient-to-br flex items-center justify-center text-[9px] font-bold text-white",
                color,
              )}>
                {initials(m.profiles?.display_name ?? "?")}
              </div>
              <div className={cn("min-w-0 max-w-[75%]", isMe && "items-end")}>
                {!isMe && (
                  <p className="mb-0.5 text-[11px] font-semibold text-foreground/70">
                    {m.profiles?.display_name ?? "Someone"}
                  </p>
                )}
                <div className={cn(
                  "rounded-2xl px-3 py-2 text-sm break-words",
                  isMe
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm bg-surface text-foreground/90",
                )}>
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={msgEnd} />
      </section>

      {/* ── Activity toast strip ────────────────────────────────────── */}
      <div className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2 space-y-1">
        {activity.map((a) => (
          <div key={a.id} className="animate-in fade-in slide-in-from-top-2 rounded-full bg-surface/90 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
            {a.text}
          </div>
        ))}
      </div>

      {/* ── Floating reactions ──────────────────────────────────────── */}
      <div className="pointer-events-none fixed bottom-36 left-1/2 z-30 -translate-x-1/2">
        {floats.map((f) => (
          <span
            key={f.id}
            className="absolute bottom-0 select-none text-2xl"
            style={{ left: `${f.x}px`, animation: "loop-rise 2.8s cubic-bezier(0.22,1,0.36,1) forwards" }}
          >
            {f.emoji}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes loop-rise {
          0%   { transform: translateY(0)    scale(0.5); opacity: 0; }
          12%  { transform: translateY(-18px) scale(1.1); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(-200px) scale(0.9); opacity: 0; }
        }
      `}</style>

      {/* ── Bottom dock ────────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-background/90 backdrop-blur-xl safe-pb">
        {/* Reaction bar */}
        <div className="flex items-center justify-around px-4 py-2 border-b border-border/50">
          {REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => react(e)}
              className="text-2xl transition-transform active:scale-125 select-none"
            >
              {e}
            </button>
          ))}
        </div>

        {/* P0-002 FIX: Role-based action bar */}
        {isHost ? (
          <HostControls
            muted={muted}
            onToggleMic={toggleMic}
            onEndRoom={endRoom}
            raisedHandCount={raisedHandCount}
            audioError={audioState === "error"}
          />
        ) : isOnStage ? (
          <SpeakerControls
            muted={muted}
            onToggleMic={toggleMic}
            onLeave={leaveRoom_}
            audioError={audioState === "error"}
          />
        ) : (
          <ListenerControls
            handRaised={handRaised}
            onToggleHand={toggleHandRaise}
            onLeave={leaveRoom_}
          />
        )}

        {/* Chat input — visible to all */}
        <form onSubmit={send} className="flex items-center gap-2 border-t border-border/50 px-4 py-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something…"
            maxLength={500}
            className="flex-1 rounded-2xl bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 rounded-full shrink-0"
            disabled={!draft.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
