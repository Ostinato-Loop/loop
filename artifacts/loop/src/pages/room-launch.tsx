// Loop — Room Page
  // Fetches real room data from Supabase. Calls joinRoom/leaveRoom on enter/exit.
  // LILCKY STUDIO LIMITED

  import { Link, useParams, useNavigate } from "react-router-dom";
  import { ChevronLeft, Mic, MicOff, Heart, Hand, MessageCircle, MoreHorizontal, Users, Loader2 } from "lucide-react";
  import { useEffect, useRef, useState, useCallback } from "react";
  import { useAuth } from "@/hooks/use-auth";
  import { getRoom, joinRoom, leaveRoom, setRoomLive, listMessages, sendMessage, type Room } from "@/lib/api/rooms";
  import { toast } from "sonner";
  import { cn } from "@/lib/utils";

  const EMOJIS = ["🔥", "👏", "❤️", "😂", "🎙️", "💯"];

  type RoomState = "loading" | "not_found" | "error" | "lobby" | "joined";

  type ChatMsg = { id: string; sender: string; content: string; self: boolean };

  export default function RoomLaunchPage() {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [room, setRoom]         = useState<Room | null>(null);
    const [state, setState]       = useState<RoomState>("loading");
    const [muted, setMuted]       = useState(true);
    const [reactions, setReactions] = useState<{ id: number; emoji: string; x: number }[]>([]);
    const [showChat, setShowChat] = useState(false);
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [msgInput, setMsgInput] = useState("");
    const [sendingMsg, setSendingMsg] = useState(false);
    const isHost = user && room ? room.host_id === user.id : false;
    const hasJoined = useRef(false);

    // Fetch real room
    useEffect(() => {
      if (!roomId) { setState("not_found"); return; }
      setState("loading");
      getRoom(roomId)
        .then((r) => {
          if (!r) { setState("not_found"); return; }
          setRoom(r);
          setState("lobby");
        })
        .catch((e) => {
          console.error("[room] getRoom:", e);
          setState("error");
        });
    }, [roomId]);

    // Leave room & clean up on unmount
    const doLeave = useCallback(async () => {
      if (!hasJoined.current || !roomId || !user?.id) return;
      hasJoined.current = false;
      await leaveRoom(roomId, user.id).catch(() => null);
      // If host leaves, end the room
      if (isHost) {
        await setRoomLive(roomId, false).catch(() => null);
      }
    }, [roomId, user?.id, isHost]);

    useEffect(() => {
      return () => { doLeave(); };
    }, [doLeave]);

    const handleJoin = async () => {
      if (!roomId || !user?.id) { toast.error("Sign in to join rooms."); return; }
      try {
        await joinRoom(roomId, user.id);
        hasJoined.current = true;
        setState("joined");
        // Load initial messages
        listMessages(roomId, 30)
          .then((rows) => setMessages(rows.map((m: Record<string, unknown>) => ({
            id: m.id as string,
            sender: ((m.profiles as Record<string, unknown>)?.display_name as string) ?? "Someone",
            content: m.content as string,
            self: m.user_id === user.id,
          }))))
          .catch(() => null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not join room");
      }
    };

    const handleLeave = async () => {
      await doLeave();
      navigate("/");
    };

    const sendReactionEmoji = (emoji: string) => {
      const id = Date.now() + Math.random();
      const x = 20 + Math.random() * 60;
      setReactions((rs) => [...rs, { id, emoji, x }]);
      setTimeout(() => setReactions((rs) => rs.filter((r) => r.id !== id)), 2200);
    };

    const handleSendMsg = async () => {
      if (!msgInput.trim() || !roomId || !user?.id || sendingMsg) return;
      const content = msgInput.trim();
      setMsgInput("");
      setSendingMsg(true);
      try {
        await sendMessage(roomId, user.id, content);
        setMessages((ms) => [...ms, { id: Date.now().toString(), sender: "You", content, self: true }]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not send message");
        setMsgInput(content);
      } finally {
        setSendingMsg(false);
      }
    };

    // ── Loading ────────────────────────────────────────────────────────────────
    if (state === "loading") {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    // ── Not found ──────────────────────────────────────────────────────────────
    if (state === "not_found" || !room) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4 px-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
            <Mic className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold">Room not found</h1>
          <p className="text-sm text-muted-foreground">This room may have ended or the link is invalid.</p>
          <Link to="/discover" className="text-sm text-primary underline underline-offset-2">Browse rooms</Link>
        </div>
      );
    }

    // ── Error ──────────────────────────────────────────────────────────────────
    if (state === "error") {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4 px-6 text-center">
          <p className="text-sm text-muted-foreground">Could not load this room. Check your connection and try again.</p>
          <button onClick={() => { setState("loading"); getRoom(roomId!).then((r) => { setRoom(r); setState(r ? "lobby" : "not_found"); }).catch(() => setState("error")); }}
            className="text-sm text-primary underline">Retry</button>
        </div>
      );
    }

    const hostName = room.host?.display_name ?? room.host?.username ?? "Host";
    const hostAvatar = room.host?.avatar_url;

    // ── Lobby (pre-join) ───────────────────────────────────────────────────────
    if (state === "lobby") {
      return (
        <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-accent/30">
          <header className="px-3 py-2.5 flex items-center gap-2">
            <Link to="/" className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </header>
          <div className="flex-1 px-6 flex flex-col justify-center text-center">
            {room.is_live && (
              <div className="flex items-center justify-center gap-1.5 mb-3">
                <span className="h-2 w-2 rounded-full bg-live animate-pulse" />
                <span className="text-[10px] font-bold uppercase text-live tracking-wider">Live now</span>
              </div>
            )}
            <span className="text-[11px] uppercase font-bold tracking-wider text-neon">{room.category}</span>
            <h1 className="text-2xl font-extrabold leading-tight mt-2 mb-3">{room.title}</h1>
            {room.description && (
              <p className="text-sm text-muted-foreground mb-4">{room.description}</p>
            )}
            <div className="flex items-center justify-center gap-3 mb-6">
              {hostAvatar ? (
                <img src={hostAvatar} alt={hostName} className="h-10 w-10 rounded-full border-2 border-background ring-1 ring-neon" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-neon/20 border-2 border-background ring-1 ring-neon flex items-center justify-center text-sm font-bold text-neon">
                  {hostName[0].toUpperCase()}
                </div>
              )}
              <div className="text-left">
                <div className="text-sm font-bold">{room.audience_count} listening</div>
                <div className="text-[11px] text-muted-foreground">Hosted by {hostName}</div>
              </div>
            </div>
            <button
              onClick={handleJoin}
              className="w-full h-14 rounded-2xl bg-neon text-neon-foreground font-extrabold text-base neon-glow active:scale-[0.98] transition"
            >
              Join as listener
            </button>
            <p className="text-[11px] text-muted-foreground mt-3">You can raise your hand to speak anytime.</p>
          </div>
        </div>
      );
    }

    // ── Joined ─────────────────────────────────────────────────────────────────
    return (
      <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
        {/* Floating reactions */}
        <div className="pointer-events-none fixed inset-0 z-50">
          {reactions.map((re) => (
            <div
              key={re.id}
              className="absolute bottom-44 text-2xl animate-bounce"
              style={{ left: `${re.x}%` }}
            >
              {re.emoji}
            </div>
          ))}
        </div>

        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-border px-3 py-2.5 flex items-center gap-2">
          <button onClick={handleLeave} className="h-9 w-9 rounded-full flex items-center justify-center">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {room.is_live && (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse" />
                  <span className="text-[10px] font-bold uppercase text-live">Live</span>
                </>
              )}
              <span className="text-[10px] uppercase font-bold text-neon">{room.category}</span>
            </div>
            <div className="text-sm font-bold truncate">{room.title}</div>
          </div>
          <button className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </header>

        {/* Room body */}
        <div className="flex-1 px-4 pt-4 pb-44 space-y-5">
          {/* Host / speakers */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                {hostAvatar ? (
                  <img src={hostAvatar} alt={hostName} className="h-16 w-16 rounded-2xl object-cover ring-2 ring-neon/60" />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-neon/20 ring-2 ring-neon/60 flex items-center justify-center text-xl font-bold text-neon">
                    {hostName[0].toUpperCase()}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-neon flex items-center justify-center">
                  <Mic className="h-3 w-3 text-neon-foreground" />
                </div>
              </div>
              <span className="text-[11px] font-semibold text-center truncate w-full text-center">{hostName}</span>
              <span className="text-[9px] text-neon font-bold uppercase">Host</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>{room.audience_count} listening</span>
          </div>

          {/* Chat panel */}
          {showChat && (
            <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No messages yet. Say something!</p>
                ) : messages.map((m) => (
                  <div key={m.id} className={cn("text-xs", m.self ? "text-right" : "")}>
                    <span className="font-semibold text-muted-foreground">{m.self ? "You" : m.sender}: </span>
                    <span>{m.content}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSendMsg(); }}
                  placeholder="Say something…"
                  className="flex-1 text-xs bg-surface rounded-xl px-3 py-2 outline-none border border-border"
                />
                <button
                  onClick={handleSendMsg}
                  disabled={!msgInput.trim() || sendingMsg}
                  className="rounded-xl bg-neon px-3 py-2 text-xs font-bold text-neon-foreground disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-xl border-t border-border pb-[env(safe-area-inset-bottom)]">
          {/* Emoji reactions */}
          <div className="flex gap-3 justify-center px-5 py-2 border-b border-border/50">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => sendReactionEmoji(e)} className="text-xl active:scale-110 transition-transform">
                {e}
              </button>
            ))}
          </div>
          {/* Main controls */}
          <div className="flex items-center justify-around px-5 py-3">
            <button
              onClick={() => setMuted((m) => !m)}
              className={cn(
                "flex flex-col items-center gap-0.5",
                muted ? "opacity-50" : "text-neon"
              )}
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              <span className="text-[9px]">{muted ? "Muted" : "Live"}</span>
            </button>

            <button onClick={() => setShowChat((s) => !s)} className="flex flex-col items-center gap-0.5">
              <MessageCircle className={cn("h-6 w-6", showChat ? "text-neon" : "")} />
              <span className="text-[9px]">Chat</span>
            </button>

            <button className="flex flex-col items-center gap-0.5">
              <Hand className="h-6 w-6" />
              <span className="text-[9px]">Raise hand</span>
            </button>

            <button className="flex flex-col items-center gap-0.5">
              <Heart className="h-6 w-6" />
              <span className="text-[9px]">Like</span>
            </button>

            <button
              onClick={handleLeave}
              className="flex flex-col items-center gap-0.5 text-destructive"
            >
              <div className="h-6 w-6 rounded-full bg-destructive/20 flex items-center justify-center">
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </div>
              <span className="text-[9px]">Leave</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
  