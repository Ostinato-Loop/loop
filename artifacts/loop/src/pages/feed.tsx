// Loop — Feed Page (Regional Edition)
// FOLLOWS-001 (2026-06-09): Added "Who to Follow" strip between location banner and categories.
// Regional identity: location badge in header, regional rooms prioritised.
// LILCKY STUDIO LIMITED

import { useEffect, useState, useCallback, useRef } from "react";
import { Search, Bell, Radio, BadgeCheck, MapPin, RefreshCw, UserPlus, X } from "lucide-react";
import { listRooms, type Room as ApiRoom, type RoomCategory } from "@/lib/api/rooms";
import { useAuth } from "@/hooks/use-auth";
import { useLoop } from "@/lib/loop-store";
import { authFetch } from "@/lib/api-fetch";
import { PushPromptBanner } from "@/hooks/use-push";
import { LoopMark } from "@/components/loop-logo";
import { AppShell } from "@/components/layout/app-shell";
import { FollowButton } from "@/components/follow-button";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { formatLocation } from "@/lib/regions-data";
import { fetchUnreadCount } from "@/lib/api/notifications";

const PTR_THRESHOLD = 72;

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

function WhoToFollow() {
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
  const [users,     setUsers]     = useState<SuggestedUser[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    authFetch(`${API_BASE}/api/follows/suggestions`)
      .then(r => r.ok ? r.json() as Promise<{ suggestions: SuggestedUser[] }> : Promise.reject())
      .then(d => setUsers(d.suggestions ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [API_BASE]);

  const visible = users.filter(u => !dismissed.has(u.id));

  // Don't render the section if loading is done and there are no suggestions
  if (!loading && visible.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Who to follow
          </span>
        </div>
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
                onDismiss={() => setDismissed(prev => new Set([...prev, u.id]))}
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
        aria-label="Dismiss"
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
        {user.follower_count > 0 && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {user.follower_count.toLocaleString()} followers
          </p>
        )}
        {user.is_creator && !user.is_verified && (
          <p className="text-[10px] text-primary/70 mt-0.5">Creator</p>
        )}
      </div>

      {/* Follow button */}
      <FollowButton
        userId={user.id}
        initialFollowing={false}
        size="sm"
        onFollowChange={(following) => {
          if (following) {
            // Slide out after a brief delay so user sees "Following" state
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

        {/* Who to Follow — only shown on "For you" tab */}
        {activeCategory === "" && <WhoToFollow />}
        {activeCategory === "" && <PushPromptBanner />}

        <CategoryScroller active={activeCategory} onChange={setActiveCategory} />
        <LiveStrip category={activeCategory} interests={interests} profile={profile} refreshKey={refreshKey} />
      </div>
    </AppShell>
  );
}

function FeedHeader({ location }: { location: string }) {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  useEffect(() => { fetchUnreadCount().then(setUnread).catch(() => {}); }, []);
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
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary border border-background" />
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
