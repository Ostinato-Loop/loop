// Loop — Feed Page (Regional Edition)
// FOLLOWS-001 (2026-06-09): Added "Who to Follow" strip between location banner and categories.
// RETENTION-006 (2026-06-10): Four gap-fills in the "Who to Follow" strip:
//   1. sessionStorage persistence — dismissed cards don't re-appear on refresh/navigation
//   2. refreshKey prop — pull-to-refresh re-fetches suggestions
//   3. FeedHeader bell upgraded to useNotificationCount (count pill, 60s poll)
//   4. "See all →" link to /discover in the strip header
// Regional identity: location badge in header, regional rooms prioritised.
// LILCKY STUDIO LIMITED

import { useEffect, useState, useCallback, useRef } from "react";
import { Search, Bell, Radio, BadgeCheck, MapPin, RefreshCw, UserPlus, X, ChevronRight, Users } from "lucide-react";
import { listRooms, type Room as ApiRoom, type RoomCategory } from "@/lib/api/rooms";
import { useAuth } from "@/hooks/use-auth";
import { useLoop } from "@/lib/loop-store";
import { authFetch } from "@/lib/api-fetch";
import { PushPromptBanner } from "@/hooks/use-push";
import { useNotificationCount, formatBadgeCount } from "@/hooks/use-notification-count";
import { useLiveRoomCount } from "@/hooks/use-live-room-count";
import { LoopMark } from "@/components/loop-logo";
import { AppShell } from "@/components/layout/app-shell";
import { FollowButton } from "@/components/follow-button";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { formatLocation } from "@/lib/regions-data";

const PTR_THRESHOLD = 72;

/** sessionStorage key for dismissed suggestion IDs — persists across navigation. */
const DISMISSED_KEY = "loop:suggestions:dismissed";

function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}
function saveDismissed(ids: Set<string>) {
  try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids])); }
  catch { /* quota exceeded — ignore */ }
}

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

const AVATAR_COLORS = [
  "from-emerald-500 to-teal-500","from-fuchsia-500 to-purple-500",
  "from-amber-500 to-orange-500","from-sky-500 to-blue-500",
  "from-rose-500 to-pink-500","from-primary to-primary/60",
];
function avatarColor(uid: string) {
  let n = 0; for (let i = 0; i < uid.length; i++) n += uid.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ── Who to Follow strip ─────────────────────────────────────────────── */

type SuggestedUser = {
  id:             string;
  username:       string | null;
  display_name:   string | null;
  avatar_url:     string | null;
  is_verified:    boolean;
  is_creator:     boolean;
  follower_count: number;
  bio:            string | null;
};

/**
 * WhoToFollow — horizontally scrollable creator suggestion strip.
 *
 * RETENTION-006:
 *   - Receives refreshKey so pull-to-refresh re-fetches suggestions.
 *   - Dismissed IDs are persisted in sessionStorage so cards don't
 *     re-appear on navigation or soft refresh within the session.
 *   - "See all →" link to /discover for deeper exploration.
 */
function WhoToFollow({ refreshKey }: { refreshKey: number }) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
  const navigate = useNavigate();
  const [users,   setUsers]   = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Persist dismissals across renders/navigation within the session
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set([...prev, id]);
      saveDismissed(next);
      return next;
    });
  }, []);

  // Re-fetch when pull-to-refresh fires (refreshKey increments)
  useEffect(() => {
    let active = true;
    setLoading(true);
    authFetch(`${API_BASE}/api/follows/suggestions`)
      .then(r => r.ok ? r.json() as Promise<{ suggestions: SuggestedUser[] }> : Promise.reject())
      .then(d => { if (active) setUsers(d.suggestions ?? []); })
      .catch(() => { if (active) setUsers([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // refreshKey is intentional — re-fetch on pull-to-refresh
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE, refreshKey]);

  const visible = users.filter(u => !dismissed.has(u.id));

  if (!loading && visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Section header with "See all" link */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Who to follow
          </span>
        </div>
        <button
          onClick={() => navigate("/discover?tab=people")}
          className="flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline"
        >
          See all
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4">
        {loading
          ? [1, 2, 3].map(i => (
              <div key={i} className="shrink-0 w-36 h-44 rounded-2xl bg-surface border border-border animate-pulse" />
            ))
          : visible.map(u => (
              <SuggestionCard
                key={u.id}
                user={u}
                onDismiss={() => dismiss(u.id)}
              />
            ))}
      </div>
    </div>
  );
}

function SuggestionCard({
  user,
  onDismiss,
}: {
  user: SuggestedUser;
  onDismiss: () => void;
}) {
  const color = avatarColor(user.id);
  const name  = user.display_name ?? user.username ?? "Anonymous";

  return (
    <div className="shrink-0 w-36 rounded-2xl border border-border bg-surface p-3 flex flex-col items-center gap-2 relative">
      {/* Dismiss */}
      <button
        onClick={onDismiss}
        aria-label={`Dismiss ${name}`}
        className="absolute top-2 right-2 h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3 w-3" />
      </button>

      {/* Avatar */}
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={name}
          className="h-14 w-14 rounded-2xl object-cover"
        />
      ) : (
        <div className={cn(
          "h-14 w-14 rounded-2xl bg-gradient-to-br flex items-center justify-center font-display text-lg font-bold text-white",
          color,
        )}>
          {initials(name)}
        </div>
      )}

      {/* Name + verified */}
      <div className="text-center w-full">
        <div className="flex items-center justify-center gap-1">
          <p className="text-xs font-bold truncate max-w-[90px]">{name}</p>
          {user.is_verified && (
            <BadgeCheck className="h-3 w-3 text-primary shrink-0" />
          )}
        </div>
        {user.follower_count > 0 ? (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {user.follower_count.toLocaleString()} followers
          </p>
        ) : user.is_creator ? (
          <p className="text-[10px] text-primary/70 mt-0.5">Creator</p>
        ) : null}
        {/* Bio snippet — max 2 lines */}
        {user.bio && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2 leading-snug">
            {user.bio}
          </p>
        )}
      </div>

      {/* Follow button */}
      <FollowButton
        userId={user.id}
        initialFollowing={false}
        size="sm"
        onFollowChange={(following) => {
          if (following) {
            // Brief delay so user sees "Following" state before card slides out
            setTimeout(onDismiss, 1200);
          }
        }}
        className="w-full justify-center"
      />
    </div>
  );
}

/* ── Feed page ────────────────────────────────────────────────────────── */

export default function FeedPage() {
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [pullDisplay,  setPullDisplay]  = useState(0);
  const [refreshing,   setRefreshing]   = useState(false);
  const startYRef = useRef(0);
  const pullYRef  = useRef(0);
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

  // ── Pull-to-refresh ─────────────────────────────────────────────────
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      startYRef.current = e.touches[0].clientY;
      pullYRef.current  = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!startYRef.current) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta > 0 && window.scrollY === 0) {
        pullYRef.current = Math.min(delta * 0.45, PTR_THRESHOLD);
        setPullDisplay(pullYRef.current);
      } else if (delta <= 0) {
        pullYRef.current  = 0;
        startYRef.current = 0;
        setPullDisplay(0);
      }
    };
    const onEnd = () => {
      const py = pullYRef.current;
      pullYRef.current  = 0;
      startYRef.current = 0;
      setPullDisplay(0);
      if (py >= PTR_THRESHOLD * 0.65) {
        setRefreshing(true);
        setRefreshKey(k => k + 1);
        setTimeout(() => setRefreshing(false), 900);
      }
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove",  onMove,  { passive: true });
    document.addEventListener("touchend",   onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove",  onMove);
      document.removeEventListener("touchend",   onEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell>
      <FeedHeader location={location} />

      {/* Pull-to-refresh indicator */}
      {(pullDisplay > 4 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
          style={{ height: refreshing ? 48 : Math.round(pullDisplay * 0.65) }}
        >
          <div
            className={cn(
              "h-8 w-8 rounded-full bg-surface border border-border flex items-center justify-center shadow-sm",
              refreshing && "animate-spin",
            )}
            style={!refreshing ? { transform: `rotate(${Math.round((pullDisplay / PTR_THRESHOLD) * 180)}deg)` } : undefined}
          >
            <RefreshCw className="h-4 w-4 text-primary" />
          </div>
        </div>
      )}

      <div className="px-4 pt-3 pb-6 space-y-4">
        {/* Regional context banner */}
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

        {/* Who to Follow — only shown on "For you" tab; refreshes with pull-to-refresh */}
        {activeCategory === "" && <WhoToFollow refreshKey={refreshKey} />}
        {activeCategory === "" && <PushPromptBanner />}

        <CategoryScroller active={activeCategory} onChange={setActiveCategory} />
        <LiveStrip category={activeCategory} interests={interests} profile={profile} refreshKey={refreshKey} />
      </div>
    </AppShell>
  );
}

/**
 * FeedHeader — sticky top bar with Loop logo, location, search, and notification bell.
 *
 * RETENTION-006: Upgraded bell badge from a one-shot dot to a count pill using
 * useNotificationCount (60s polling, consistent with bottom-nav badge).
 */
function FeedHeader({ location }: { location: string }) {
  const navigate = useNavigate();
  const unread   = useNotificationCount();
  const badge    = formatBadgeCount(unread);

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
          {/* Bell — count pill badge + 60s polling via useNotificationCount */}
          <button
            onClick={() => navigate("/notifications")}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center relative active:scale-95 transition-transform"
            aria-label={badge ? `${unread} unread notifications` : "Notifications"}
          >
            <Bell className="h-4 w-4" />
            {badge && (
              <span className="absolute top-1 right-1 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold leading-none border border-background">
                {badge}
              </span>
            )}
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
  category, interests, profile, refreshKey,
}: {
  category: string;
  interests: string[];
  profile: ReturnType<typeof useAuth>["profile"];
  refreshKey: number;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, refreshKey]);

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
      {category === "" && interestRooms.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-0.5">Picked for you</h2>
          {interestRooms.map(r => <RoomRow key={r.id} room={r} onClick={() => navigate(`/rooms/${r.id}`)} />)}
        </div>
      )}
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

// RETENTION-009: useLiveRoomCount wires each row to real-time audience_count
// updates via postgres_changes, so the listener count ticks up/down within
// ~200ms without any polling.
function RoomRow({ room, onClick }: { room: ApiRoom; onClick: () => void }) {
  const CATEGORY_EMOJI: Record<string, string> = {
    community:"🏘️", news:"📡", commentary:"🎙️", radio:"📻",
    "dj-session":"🎧", education:"📚", business:"💼", general:"🔊",
  };
  const emoji = CATEGORY_EMOJI[room.category] ?? "🔊";
  const host  = (room as ApiRoom & { host?: { display_name?: string | null } }).host;
  const { count, updated } = useLiveRoomCount(room.id, room.audience_count);

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
          <span className={cn(
            "text-[11px] transition-colors duration-500",
            updated ? "text-primary font-semibold" : "text-muted-foreground",
          )}>
            {count.toLocaleString()} listening
          </span>
          {host?.display_name && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground truncate">{host.display_name}</span>
            </>
          )}
        </div>
      </div>
      {/* Live listener count — flashes primary when someone joins */}
      <div className={cn(
        "flex items-center gap-1 text-xs font-medium shrink-0 transition-colors duration-500",
        updated ? "text-primary" : "text-muted-foreground/50",
      )}>
        <Users className="h-3.5 w-3.5" />
        {count.toLocaleString()}
      </div>
    </button>
  );
}
