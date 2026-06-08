// Loop — Feed Page (Regional Edition)
// Regional identity: location badge in header, regional rooms prioritised.
// LILCKY STUDIO LIMITED

import { useEffect, useState, useCallback } from "react";
import { Search, Bell, Radio, BadgeCheck, MapPin } from "lucide-react";
import { listRooms, type Room as ApiRoom, type RoomCategory } from "@/lib/api/rooms";
import { useAuth } from "@/hooks/use-auth";
import { useLoop } from "@/lib/loop-store";
import { LoopMark } from "@/components/loop-logo";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { formatLocation } from "@/lib/regions-data";

const CATEGORIES = [
  { label: "For you",    value: "" },
  { label: "Community",  value: "community" },
  { label: "News",       value: "news" },
  { label: "Commentary", value: "commentary" },
  { label: "Music",      value: "radio" },
  { label: "DJ",         value: "dj-session" },
  { label: "Education",  value: "education" },
  { label: "Business",   value: "business" },
];

const INTEREST_TO_CATEGORY: Record<string, string> = {
  music:"radio", tech:"education", civic:"commentary", business:"business",
  sports:"community", education:"education", community:"community",
  africa:"community", campus:"education", commentary:"commentary",
  news:"news", radio:"radio", "dj-session":"dj-session", general:"",
};

export default function FeedPage() {
  const [activeCategory, setActiveCategory] = useState<string>("");
  const { profile } = useAuth();
  const { interests: localInterests } = useLoop();

  const interests: string[] = (() => {
    if (profile?.interests && profile.interests.length > 0) {
      return [...new Set(
        profile.interests
          .map(i => INTEREST_TO_CATEGORY[i.toLowerCase()] ?? "")
          .filter(Boolean),
      )];
    }
    return [...new Set(
      Object.keys(localInterests)
        .filter(k => localInterests[k])
        .map(k => INTEREST_TO_CATEGORY[k.toLowerCase()] ?? "")
        .filter(Boolean),
    )];
  })();

  const location = profile ? formatLocation(profile) : "";

  return (
    <AppShell>
      <FeedHeader location={location} />
      <div className="px-4 pt-3 pb-6 space-y-3">
        {/* Regional context banner — shown when user has region */}
        {location && (
          <Link
            to="/discover"
            className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/6 px-3.5 py-2.5 hover:bg-primary/10 transition-colors"
          >
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-primary truncate">{location}</p>
              <p className="text-[10px] text-primary/70">Tap to see nearby rooms & communities</p>
            </div>
            <span className="text-xs text-primary font-semibold shrink-0">Near me →</span>
          </Link>
        )}

        <CategoryScroller active={activeCategory} onChange={setActiveCategory} />
        <LiveStrip category={activeCategory} interests={interests} profile={profile} />
      </div>
    </AppShell>
  );
}

function FeedHeader({ location }: { location: string }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border pt-safe-top">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-neon flex items-center justify-center neon-glow">
            <LoopMark className="h-4 w-6 text-neon-foreground" />
          </div>
          <div>
            <div className="text-base font-extrabold leading-none">Loop</div>
            {location && (
              <div className="flex items-center gap-0.5 mt-0.5">
                <MapPin className="h-2.5 w-2.5 text-primary" />
                <span className="text-[10px] text-primary font-semibold leading-none truncate max-w-[120px]">{location}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate("/search")}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate("/notifications")}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center relative active:scale-95 transition-transform"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function CategoryScroller({ active, onChange }: { active: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
      {CATEGORIES.map(cat => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          className={cn(
            "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition",
            active === cat.value
              ? "bg-foreground text-background"
              : "bg-secondary text-foreground hover:bg-secondary/80",
          )}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}

type FeedState = "loading" | "error" | "empty" | "ready";

function LiveStrip({
  category, interests, profile,
}: {
  category: string;
  interests: string[];
  profile: ReturnType<typeof useAuth>["profile"];
}) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [state, setState] = useState<FeedState>("loading");
  const [interestRooms, setInterestRooms] = useState<ApiRoom[]>([]);

  const fetchRooms = useCallback(() => {
    setState("loading");
    listRooms({ limit: 20, category: (category as RoomCategory) || undefined })
      .then(data => { setRooms(data); setState(data.length === 0 ? "empty" : "ready"); })
      .catch(() => setState("error"));
  }, [category]);

  useEffect(() => {
    if (category === "" && interests.length > 0) {
      listRooms({ category: interests[0] as RoomCategory, limit: 5 })
        .then(setInterestRooms).catch(() => setInterestRooms([]));
    } else {
      setInterestRooms([]);
    }
  }, [category, interests]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  if (state === "loading") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="h-2 w-2 rounded-full bg-muted animate-pulse" />
          <span className="text-xs font-bold text-muted-foreground">Loading rooms…</span>
        </div>
        {[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-secondary animate-pulse" />)}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-medium text-destructive mb-2">Could not load rooms</p>
        <button onClick={fetchRooms} className="text-xs text-destructive/70 underline">Retry</button>
      </div>
    );
  }

  const hasRegion = !!(profile?.country);

  if (state === "empty") {
    return (
      <div className="space-y-3">
        {/* No-region nudge */}
        {!hasRegion && (
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="w-full flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/6 p-4 text-left hover:bg-primary/10 transition-colors"
          >
            <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-primary">Complete your region</p>
              <p className="text-xs text-primary/70 mt-0.5">Discover conversations happening near you.</p>
            </div>
          </button>
        )}
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center space-y-2">
          <Radio className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm font-semibold">No live rooms right now</p>
          <p className="text-xs text-muted-foreground">Be the first to start a conversation.</p>
          <button
            onClick={() => navigate("/create/room")}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground neon-glow"
          >
            Start a room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Interest rooms ("Picked for you") */}
      {category === "" && interestRooms.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-0.5">Picked for you</h2>
          {interestRooms.map(r => <RoomRow key={r.id} room={r} onClick={() => navigate(`/rooms/${r.id}`)} />)}
        </div>
      )}

      {/* Main feed */}
      <div className="space-y-2">
        {category === "" && (
          <div className="flex items-center gap-1.5 pb-0.5">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live now</h2>
          </div>
        )}
        {rooms.map(r => <RoomRow key={r.id} room={r} onClick={() => navigate(`/rooms/${r.id}`)} />)}
      </div>
    </div>
  );
}

function RoomRow({ room, onClick }: { room: ApiRoom; onClick: () => void }) {
  const CATEGORY_EMOJI: Record<string, string> = {
    community:"🏘️", news:"📡", commentary:"🎙️", radio:"📻",
    "dj-session":"🎧", education:"📚", business:"💼", general:"🔊",
  };
  const emoji = CATEGORY_EMOJI[room.category] ?? "🔊";
  const host  = (room as ApiRoom & { host?: { display_name?: string | null } }).host;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-border bg-surface/60 px-4 py-3 text-left flex items-center gap-3 hover:border-primary/30 hover:bg-surface transition-all active:scale-[0.98]"
    >
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-base">{emoji}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{room.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[11px] text-muted-foreground">{room.audience_count} listening</span>
          {host?.display_name && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground truncate">{host.display_name}</span>
            </>
          )}
        </div>
      </div>
      <BadgeCheck className="h-4 w-4 text-muted-foreground/30 shrink-0" />
    </button>
  );
}
