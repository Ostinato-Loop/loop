// Loop — Feed Page
// Sprint 02 Trust & Retention: removed hardcoded "Lagos · Nigeria" from loop-mock.
// Location chip removed — user region is not yet available from profile API.
// LiveStrip: real Supabase rooms. Content feed: honest empty state until API ships.
// LILCKY STUDIO LIMITED

import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Search, Bell, MessageCircle, Radio,
} from "lucide-react";
import { listRooms, type Room as ApiRoom } from "@/lib/api/rooms";
import { LoopMark } from "@/components/loop-logo";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";

export default function FeedPage() {
  return (
    <AppShell>
      <FeedHeader />
      <div className="px-4 pt-3 pb-6 space-y-3">
        <LiveStrip />
        <ContentFeedEmpty />
      </div>
    </AppShell>
  );
}

function FeedHeader() {
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-neon flex items-center justify-center neon-glow">
            <LoopMark className="h-4 w-6 text-neon-foreground" />
          </div>
          <div className="text-base font-extrabold leading-none">Loop</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center"
            aria-label="Search"
            onClick={() => {}}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center relative"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
      <RegionScroller />
    </header>
  );
}

function RegionScroller() {
  const tabs = ["For you", "Africa", "Civic", "Music", "Sports", "Campus", "Tech", "Business"];
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 pb-2.5">
      {tabs.map((t, i) => (
        <button
          key={t}
          className={cn(
            "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition",
            i === 0 ? "bg-foreground text-background" : "bg-secondary text-foreground",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function LiveStrip() {
  const [rooms, setRooms] = useState<ApiRoom[] | null>(null);

  useEffect(() => {
    listRooms({ limit: 10 })
      .then(setRooms)
      .catch(() => setRooms([]));
  }, []);

  return (
    <div className="-mx-4 px-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-live animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider">Live now</span>
        </div>
        <Link to="/discover" className="text-xs text-muted-foreground hover:text-foreground transition">
          See all
        </Link>
      </div>

      {rooms === null && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
          {[1, 2, 3].map((k) => (
            <div key={k} className="shrink-0 w-44 h-28 rounded-2xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      )}

      {rooms !== null && rooms.length === 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Radio className="h-5 w-5 shrink-0 text-muted-foreground/50" />
          <span>No live rooms right now — be the first to start one.</span>
        </div>
      )}

      {rooms !== null && rooms.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
          {rooms.map((room) => (
            <Link
              key={room.id}
              to={`/rooms/${room.id}`}
              className="shrink-0 w-44 rounded-2xl bg-card border border-border p-3 hover:border-neon transition"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse" />
                <span className="text-[10px] font-bold uppercase text-live">Live</span>
                <span className="text-[10px] text-neon ml-auto uppercase font-bold">{room.category}</span>
              </div>
              <div className="text-xs font-semibold line-clamp-2 mb-2 min-h-[2rem]">{room.title}</div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {room.host?.avatar_url ? (
                  <img src={room.host.avatar_url} alt="" className="h-5 w-5 rounded-full border-2 border-card" />
                ) : (
                  <div className="h-5 w-5 rounded-full bg-secondary border-2 border-card flex items-center justify-center text-[8px] font-bold">
                    {(room.host?.display_name ?? "?")[0]}
                  </div>
                )}
                <span className="ml-1">{formatN(room.audience_count)} listening</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sprint 02 — Honest empty state. No mock content cards. */
function ContentFeedEmpty() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/30 p-6 text-center space-y-2 mt-2">
      <div className="flex justify-center mb-3">
        <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
          <MessageCircle className="h-5 w-5 text-muted-foreground/50" />
        </div>
      </div>
      <p className="text-sm font-semibold text-foreground">Discussions coming soon</p>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
        Civic discussions, events, and opportunities from your community will appear here once the feed API ships.
      </p>
    </div>
  );
}

function formatN(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return n.toString();
}
