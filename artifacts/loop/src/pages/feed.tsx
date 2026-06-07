// Loop — Feed Page
// P0-004 FIX: Feed no longer renders permanent empty state.
//   LiveStrip hydrates from Supabase. Content area shows rooms when present,
//   loading skeleton during fetch, error state on failure, empty state only
//   when API returns zero results.
// P0-006 FIX: Category chips are wired to state. Selecting a category
//   re-fetches rooms with the category filter applied.
// AT-LOP-007 FIX: Onboarding interests are now read from profile (server) and
//   loop-store (local fallback) and used to surface a "Picked for you" section
//   when the user is on the "For you" tab with no explicit category filter.
// LILCKY STUDIO LIMITED

import { useEffect, useState, useCallback } from "react";
import { Search, Bell, Radio } from "lucide-react";
import { listRooms, type Room as ApiRoom, type RoomCategory } from "@/lib/api/rooms";
import { useAuth } from "@/hooks/use-auth";
import { useLoop } from "@/lib/loop-store";
import { LoopMark } from "@/components/loop-logo";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";

const CATEGORIES = [
  { label: "For you", value: "" },
  { label: "Africa",  value: "africa" },
  { label: "Civic",   value: "civic" },
  { label: "Music",   value: "music" },
  { label: "Sports",  value: "sports" },
  { label: "Campus",  value: "campus" },
  { label: "Tech",    value: "tech" },
  { label: "Business",value: "business" },
];

// Map interest slugs (from profile/onboarding) → Loop category values
const INTEREST_TO_CATEGORY: Record<string, string> = {
  music: "music",    tech: "tech",        civic: "civic",
  business: "business", sports: "sports", education: "tech",
  community: "civic", africa: "africa",   campus: "campus",
  commentary: "civic", news: "civic",     radio: "music",
  "dj-session": "music", general: "",
};

export default function FeedPage() {
  const [activeCategory, setActiveCategory] = useState<string>("");
  const { profile } = useAuth();
  const { interests: localInterests } = useLoop();

  // AT-LOP-007: derive interest categories from server profile (primary)
  // or local loop-store (fallback from onboarding step).
  const interests: string[] = (() => {
    if (profile?.interests && profile.interests.length > 0) {
      return [...new Set(
        profile.interests
          .map((i) => INTEREST_TO_CATEGORY[i.toLowerCase()] ?? "")
          .filter(Boolean),
      )];
    }
    return [...new Set(
      Object.keys(localInterests)
        .filter((k) => localInterests[k])
        .map((k) => INTEREST_TO_CATEGORY[k.toLowerCase()] ?? "")
        .filter(Boolean),
    )];
  })();

  return (
    <AppShell>
      <FeedHeader />
      <div className="px-4 pt-3 pb-6 space-y-3">
        <RegionScroller
          active={activeCategory}
          onChange={setActiveCategory}
        />
        <LiveStrip category={activeCategory} interests={interests} />
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
            onClick={() => toast.info("Search is coming soon")}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center relative"
            aria-label="Notifications"
            onClick={() => toast.info("Notifications coming soon")}
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

interface RegionScrollerProps {
  active: string;
  onChange: (category: string) => void;
}

function RegionScroller({ active, onChange }: RegionScrollerProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
      {CATEGORIES.map((cat) => (
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

interface LiveStripProps {
  category: string;
  interests: string[];
}

function LiveStrip({ category, interests }: LiveStripProps) {
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [state, setState] = useState<FeedState>("loading");
  const [interestRooms, setInterestRooms] = useState<ApiRoom[]>([]);

  const fetchRooms = useCallback(() => {
    setState("loading");
    listRooms({ limit: 20, category: (category as RoomCategory) || undefined })
      .then((data) => {
        setRooms(data);
        setState(data.length === 0 ? "empty" : "ready");
      })
      .catch(() => setState("error"));
  }, [category]);

  // AT-LOP-007: Personalised picks — fetch top-interest rooms on "For you" tab
  useEffect(() => {
    if (category === "" && interests.length > 0) {
      listRooms({ category: interests[0] as RoomCategory, limit: 5 })
        .then(setInterestRooms)
        .catch(() => setInterestRooms([]));
    } else {
      setInterestRooms([]);
    }
  }, [category, interests]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  if (state === "loading") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="h-2 w-2 rounded-full bg-muted animate-pulse" />
          <span className="text-xs font-bold text-muted-foreground">Loading rooms…</span>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-secondary animate-pulse" />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-medium text-destructive mb-2">Could not load rooms</p>
        <button
          onClick={fetchRooms}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <Radio className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-semibold text-foreground mb-1">
          {category ? `No live ${category} rooms right now` : "No live rooms right now"}
        </p>
        <p className="text-xs text-muted-foreground">
          {category
            ? "Try a different category or check back soon"
            : "Be the first — start a room"}
        <button
          onClick={() => navigate("/create/room")}
          className="mt-3 text-xs font-semibold text-primary underline underline-offset-2"
        >
          Start a room →
        </button>
        </p>
      </div>
    );
  }

  // Deduplicate: don't show interest rooms again in the main list
  const interestIds = new Set(interestRooms.map((r) => r.id));
  const mainRooms = rooms.filter((r) => !interestIds.has(r.id));

  return (
    <div className="space-y-3">
      {/* AT-LOP-007: Personalised section — shown when user has interests and is on For You */}
      {interestRooms.length > 0 && category === "" && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-primary">Picked for you</span>
            <span className="text-[10px] text-muted-foreground capitalize">
              · {interestRooms[0]?.category}
            </span>
          </div>
          {interestRooms.map((room) => (
            <RoomCard key={`interest-${room.id}`} room={room} />
          ))}
          {mainRooms.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="h-2 w-2 rounded-full bg-live animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                All live rooms
              </span>
              <span className="ml-auto text-xs text-muted-foreground">{rooms.length} rooms</span>
            </div>
          )}
        </>
      )}

      {/* Standard header when no personalization */}
      {!(interestRooms.length > 0 && category === "") && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="h-2 w-2 rounded-full bg-live animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {category ? `${category} · Live` : "Live now"}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">{rooms.length} rooms</span>
        </div>
      )}

      {mainRooms.map((room) => (
        <RoomCard key={room.id} room={room} />
      ))}
    </div>
  );
}

function RoomCard({ room }: { room: ApiRoom }) {
  return (
    <Link
      to={`/rooms/${room.id}`}
      className="block rounded-2xl border border-border bg-surface p-4 hover:border-primary/30 transition-colors active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-[10px] font-bold uppercase text-live">
              <span className="h-1.5 w-1.5 rounded-full bg-live" />
              Live
            </span>
            {room.category && (
              <span className="text-[10px] text-muted-foreground capitalize">{room.category}</span>
            )}
          </div>
          <h3 className="font-semibold text-sm leading-tight truncate">{room.title}</h3>
          {room.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{room.description}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">{room.audience_count} listening</p>
        </div>
      </div>
    </Link>
  );
}
