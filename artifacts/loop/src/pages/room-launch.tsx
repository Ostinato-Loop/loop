// Loop — Room Detail Page (Launch UI)
// Adopted from loop-audio-ui-ux reference design.
// Adapted for React Router DOM.
// LILCKY STUDIO LIMITED

import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Mic, MicOff, Heart, Hand, Share2, MessageCircle, MoreHorizontal, Check, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { rooms } from "@/lib/loop-mock";
import { useLoop } from "@/lib/loop-store";

type QueueEntry = { handle: string; name: string; avatar: string; me?: boolean };

const SEED_QUEUE: QueueEntry[] = [
  { handle: "kola",  name: "Kọ́lá A.",  avatar: "https://i.pravatar.cc/100?img=11" },
  { handle: "amaka", name: "Amaka N.", avatar: "https://i.pravatar.cc/100?img=45" },
  { handle: "biko",  name: "Biko O.",  avatar: "https://i.pravatar.cc/100?img=58" },
  { handle: "zola",  name: "Zola M.", avatar: "https://i.pravatar.cc/100?img=21" },
  { handle: "fela",  name: "Fẹlá B.", avatar: "https://i.pravatar.cc/100?img=14" },
];

export default function RoomLaunchPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const r = rooms.find((x) => x.id === roomId) ?? rooms[0];
  const { joined, speakState, muted, setJoined, setSpeakState, toggleMute, setQueuePos } = useLoop();
  const isJoined  = !!joined[r.id];
  const sState    = speakState[r.id] ?? "listener";
  const isMuted   = muted[r.id] !== false;
  const [reactions, setReactions] = useState<{ id: number; emoji: string }[]>([]);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [showQueue, setShowQueue]   = useState(false);
  const [queue, setQueue]           = useState<QueueEntry[]>(SEED_QUEUE);
  const [tick, setTick]             = useState(0);

  const liveQueue = useMemo<QueueEntry[]>(() => {
    if (sState !== "raised") return queue;
    const myPos = Math.min(queue.length, 2 + (tick % 2));
    const copy  = [...queue];
    copy.splice(myPos, 0, { handle: "me", name: "You", avatar: "https://i.pravatar.cc/100?img=47", me: true });
    return copy;
  }, [queue, sState, tick]);

  useEffect(() => {
    if (!isJoined) return;
    const t = setInterval(() => {
      setTick((x) => x + 1);
      setQueue((q) => {
        if (Math.random() < 0.45 && q.length > 1) {
          const [, ...rest] = q;
          if (Math.random() < 0.6) {
            const pool  = ["zuri", "ife", "tomi", "obi", "ada", "lerato"];
            const names = ["Zuri K.", "Ifeoma C.", "Tomi A.", "Obi N.", "Ada E.", "Lerato P."];
            const i = Math.floor(Math.random() * pool.length);
            return [...rest, { handle: pool[i], name: names[i], avatar: `https://i.pravatar.cc/100?img=${30 + i * 3}` }];
          }
          return rest;
        }
        return q;
      });
    }, 3500);
    return () => clearInterval(t);
  }, [isJoined]);

  useEffect(() => {
    if (sState !== "raised") return;
    const idx = liveQueue.findIndex((q) => q.me);
    setQueuePos(r.id, idx + 1);
    if (idx === 0) {
      const t = setTimeout(() => setSpeakState(r.id, "speaker"), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [liveQueue, sState, r.id, setQueuePos, setSpeakState]);

  const audience = Array.from({ length: 12 }).map((_, i) => ({
    name: `Listener ${i + 1}`,
    avatar: `https://i.pravatar.cc/100?img=${(i * 4 + 7) % 70}`,
  }));

  const sendReaction = (emoji: string) => {
    const id = Date.now() + Math.random();
    setReactions((rs) => [...rs, { id, emoji }]);
    setTimeout(() => setReactions((rs) => rs.filter((x) => x.id !== id)), 2500);
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-accent/30">
        <header className="px-3 py-2.5 flex items-center gap-2">
          <Link to="/" className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </header>
        <div className="flex-1 px-6 flex flex-col justify-center text-center">
          <div className="flex items-center justify-center gap-1.5 mb-3">
            {r.live && (
              <>
                <span className="h-2 w-2 rounded-full bg-live animate-pulse" />
                <span className="text-[10px] font-bold uppercase text-live tracking-wider">Live now</span>
              </>
            )}
          </div>
          <span className="text-[11px] uppercase font-bold tracking-wider text-neon">{r.category} Room · {r.region}</span>
          <h1 className="text-2xl font-extrabold leading-tight mt-2 mb-3">{r.title}</h1>
          <p className="text-sm text-muted-foreground mb-6">{r.context}</p>
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex -space-x-2">
              {r.speakers.map((s) => (
                <img key={s.name} src={s.avatar} alt="" className="h-10 w-10 rounded-full border-2 border-background ring-1 ring-neon" />
              ))}
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">{r.listeners.toLocaleString()} listening</div>
              <div className="text-[11px] text-muted-foreground">{r.speakers.length} speakers · {queue.length} in queue</div>
            </div>
          </div>
          <button
            onClick={() => { setJoined(r.id, true); setSpeakState(r.id, "listener"); }}
            className="w-full h-14 rounded-2xl bg-neon text-neon-foreground font-extrabold text-base neon-glow active:scale-[0.98] transition"
          >
            Join as listener
          </button>
          <p className="text-[11px] text-muted-foreground mt-3">You can raise your hand to speak anytime.</p>
        </div>
      </div>
    );
  }

  const myPos = liveQueue.findIndex((q) => q.me) + 1;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-border px-3 py-2.5 flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {r.live && (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse" />
                <span className="text-[10px] font-bold uppercase text-live">Live</span>
              </>
            )}
            <span className="text-[10px] uppercase font-bold text-neon">{r.category}</span>
          </div>
          <div className="text-sm font-bold truncate">{r.title}</div>
        </div>
        <button className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 px-4 pt-4 pb-44 space-y-5 relative">
        <div className="pointer-events-none fixed bottom-44 right-6 z-40">
          {reactions.map((re) => (
            <div key={re.id} className="absolute right-0 bottom-0 text-2xl animate-bounce">{re.emoji}</div>
          ))}
        </div>

        {sState === "raised" && (
          <button onClick={() => setShowQueue(true)} className="w-full rounded-2xl bg-neon/10 border border-neon/40 p-3 flex items-center gap-2 text-left active:scale-[0.99] transition">
            <div className="h-9 w-9 rounded-full bg-neon/20 flex items-center justify-center"><Hand className="h-4 w-4 text-neon" /></div>
            <div className="flex-1 text-xs">
              <div className="font-bold">You're #{myPos || "—"} in the speaker queue</div>
              <div className="text-muted-foreground text-[11px]">Live — updating in real time. Tap to see queue.</div>
            </div>
            <span className="text-[10px] font-bold text-neon">VIEW</span>
          </button>
        )}
        {sState === "speaker" && (
          <div className="rounded-2xl bg-live/10 border border-live/40 p-3 flex items-center gap-2">
            <Mic className="h-4 w-4 text-live" />
            <div className="flex-1 text-xs">
              <span className="font-bold">You're on stage.</span>{" "}
              {isMuted ? "Tap mic to unmute." : "Mic is live — speak."}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-card border border-border p-3">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Context · {r.region}</div>
          <p className="text-xs">{r.context}</p>
        </div>

        <section>
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-3">
            Speakers · {r.speakers.length + (sState === "speaker" ? 1 : 0)}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {r.speakers.map((s, i) => (
              <div key={s.name} className="flex flex-col items-center gap-1.5">
                <div className="relative">
                  <img src={s.avatar} alt="" className={`h-16 w-16 rounded-full ${i === 0 ? "ring-2 ring-neon neon-glow" : ""}`} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full bg-neon text-neon-foreground flex items-center justify-center border-2 border-card">
                    <Mic className="h-3 w-3" />
                  </span>
                </div>
                <div className="text-[10px] font-semibold text-center leading-tight">{s.name}</div>
                {i === 0 && <span className="text-[9px] text-neon font-bold uppercase">Host</span>}
              </div>
            ))}
            {sState === "speaker" && (
              <div className="flex flex-col items-center gap-1.5">
                <div className="relative">
                  <img src="https://i.pravatar.cc/100?img=47" alt="" className="h-16 w-16 rounded-full ring-2 ring-live" />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full ${isMuted ? "bg-muted text-muted-foreground" : "bg-live text-white"} flex items-center justify-center border-2 border-card`}>
                    {isMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                  </span>
                </div>
                <div className="text-[10px] font-semibold text-center leading-tight">You</div>
                <span className="text-[9px] text-live font-bold uppercase">On stage</span>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Hand className="h-3 w-3 text-neon" />Speaker queue · {liveQueue.length}
              <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse ml-1" />
            </div>
            <button onClick={() => setShowQueue(true)} className="text-[10px] text-neon font-semibold">View all</button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
            {liveQueue.slice(0, 8).map((q, i) => (
              <div key={q.handle + i} className="shrink-0 flex flex-col items-center gap-1">
                <div className="relative">
                  <img src={q.avatar} alt="" className={`h-11 w-11 rounded-full ${q.me ? "ring-2 ring-neon" : ""}`} />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full text-[10px] font-extrabold flex items-center justify-center border-2 border-background ${i === 0 ? "bg-neon text-neon-foreground" : "bg-secondary text-foreground"}`}>{i + 1}</span>
                </div>
                <div className="text-[9px] font-semibold max-w-[52px] truncate text-center">{q.me ? "You" : q.name.split(" ")[0]}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              Listeners · {r.listeners.toLocaleString()}
            </div>
            <button className="text-[10px] text-neon font-semibold">See all</button>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {audience.map((a) => (
              <img key={a.name} src={a.avatar} alt="" className="h-10 w-10 rounded-full" />
            ))}
          </div>
        </section>
      </div>

      {showQueue && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-end" onClick={() => setShowQueue(false)}>
          <div className="w-full max-w-[480px] mx-auto rounded-t-3xl bg-background border-t border-x border-border max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-background/95 backdrop-blur-xl px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-sm font-extrabold flex items-center gap-2">
                  <Hand className="h-4 w-4 text-neon" />Speaker queue
                  <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse" />
                  <span className="text-[10px] font-bold text-live uppercase">Live</span>
                </div>
                <div className="text-[11px] text-muted-foreground">{liveQueue.length} waiting · updates in real time</div>
              </div>
              <button onClick={() => setShowQueue(false)} className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center font-bold">×</button>
            </div>
            <div className="p-3 space-y-2">
              {liveQueue.map((q, i) => (
                <div key={q.handle + i} className={`flex items-center gap-3 p-3 rounded-2xl border transition ${q.me ? "border-neon bg-neon/10" : "border-border bg-card"}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-extrabold ${i === 0 ? "bg-neon text-neon-foreground" : "bg-secondary"}`}>{i + 1}</div>
                  <img src={q.avatar} alt="" className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <div className="text-sm font-bold">{q.me ? "You" : q.name}</div>
                    <div className="text-[10px] text-muted-foreground">{i === 0 ? "Next up — host can let in" : `≈ ${i * 40}s wait`}</div>
                  </div>
                  {q.me && <span className="text-[10px] font-bold text-neon">YOU</span>}
                </div>
              ))}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-2 px-1">
                <Users className="h-3 w-3" /> Host controls order. Hosts see raised hands instantly.
              </div>
            </div>
          </div>
        </div>
      )}

      {showCommentBox && (
        <div className="fixed bottom-[88px] left-0 right-0 z-40 mx-auto max-w-[480px] px-3">
          <div className="rounded-2xl bg-card border border-border p-2 flex items-center gap-2 shadow-xl">
            <input autoFocus placeholder="Add a comment that could spark a room…" className="flex-1 h-9 bg-transparent text-sm outline-none px-2" />
            <button onClick={() => setShowCommentBox(false)} className="h-9 px-3 rounded-full bg-neon text-neon-foreground text-xs font-bold">Send</button>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-xl border-t border-border px-3 py-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          {sState === "speaker" ? (
            <button onClick={() => toggleMute(r.id)} className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${isMuted ? "bg-secondary" : "bg-live text-white"}`}>
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          ) : sState === "raised" ? (
            <button onClick={() => setShowQueue(true)} className="h-12 px-4 rounded-full bg-neon/15 text-neon text-xs font-bold flex items-center gap-1.5 shrink-0 border border-neon/40">
              <Check className="h-4 w-4" />#{myPos || "…"} in queue
            </button>
          ) : (
            <button onClick={() => setSpeakState(r.id, "raised")} className="h-12 px-4 rounded-full bg-neon text-neon-foreground text-xs font-bold flex items-center gap-1.5 shrink-0 neon-glow">
              <Hand className="h-4 w-4" />Speak
            </button>
          )}

          <div className="flex items-center gap-1 flex-1 justify-center">
            {["❤️", "🔥", "👏", "💯", "🙏"].map((e) => (
              <button key={e} onClick={() => sendReaction(e)} className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-lg active:scale-90 transition">{e}</button>
            ))}
          </div>

          <button onClick={() => setShowCommentBox((v) => !v)} className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <MessageCircle className="h-5 w-5" />
          </button>
          <button className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <Share2 className="h-5 w-5" />
          </button>
          <button
            onClick={() => { setJoined(r.id, false); setSpeakState(r.id, "listener"); }}
            className="h-12 w-12 rounded-full bg-live/15 text-live flex items-center justify-center shrink-0 font-extrabold"
          >×</button>
        </div>
        <div className="flex items-center gap-1 justify-center mt-1.5">
          <Heart className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{(r.listeners + 1).toLocaleString()} in the room</span>
        </div>
      </div>
    </div>
  );
}
