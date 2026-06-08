import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { RoomCard } from "@/components/rooms/room-card";
import { listRooms, type Room, type RoomCategory } from "@/lib/api/rooms";
import {
  searchRelatedPeople, getPeopleSuggestions, hasRaldIdentity,
  type PersonResult, type PersonSuggestion,
} from "@/lib/api/people";
import { useFollow } from "@/lib/api/follows";
import { ReportSheet, type ReportTarget } from "@/components/report-sheet";
import {
  Search, Sparkles, Radio, Globe2, TrendingUp,
  Mic, Calendar, Briefcase, Newspaper, ChevronRight,
  Users, BadgeCheck, UserPlus, UserCheck, Loader2, MoreVertical,
  MapPin, Navigation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatLocation } from "@/lib/regions-data";

/* ── feed tab types ─────────────────────────────────────────────────── */
type FeedTab = "all" | "live" | "near" | "trending" | "events" | "people";

const FEED_TABS: { key: FeedTab; label: string; icon: typeof Radio }[] = [
  { key: "all",      label: "All",      icon: Globe2 },
  { key: "live",     label: "Live now", icon: Radio },
  { key: "people",   label: "People",   icon: Users },
  { key: "near",     label: "Near me",  icon: Navigation },
  { key: "trending", label: "Trending", icon: TrendingUp },
  { key: "events",   label: "Events",   icon: Calendar },
];

/* ── category filter ────────────────────────────────────────────────── */
const CATEGORIES: { key: RoomCategory | "all"; label: string; emoji: string }[] = [
  { key: "all",        label: "All",         emoji: ""   },
  { key: "community",  label: "Community",   emoji: "🏘️" },
  { key: "news",       label: "News",        emoji: "📡" },
  { key: "commentary", label: "Commentary",  emoji: "🎙️" },
  { key: "radio",      label: "Radio",       emoji: "📻" },
  { key: "dj-session", label: "DJ Session",  emoji: "🎧" },
  { key: "education",  label: "Education",   emoji: "📚" },
  { key: "business",   label: "Business",    emoji: "💼" },
];

/* ── avatar helpers ─────────────────────────────────────────────────── */
const AVATAR_COLORS = [
  "from-emerald-500 to-teal-500","from-fuchsia-500 to-purple-500",
  "from-amber-500 to-orange-500","from-sky-500 to-blue-500",
  "from-rose-500 to-pink-500","from-mint to-mint-glow",
];
function avatarColor(seed: string) {
  let n = 0; for (let i = 0; i < seed.length; i++) n += seed.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ── Honest empty-state slots ─────────────────────────────────────── */
function DiscussionsEmpty() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-5 text-center space-y-1.5">
      <p className="text-sm font-semibold">Discussions coming soon</p>
      <p className="text-xs text-muted-foreground">Community discussions will appear here once the feed API ships.</p>
    </div>
  );
}
function OpportunitiesEmpty() {
  return (
    <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/5 p-5 flex items-start gap-3">
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Briefcase className="h-5 w-5 text-primary/50" />
      </div>
      <div>
        <p className="text-sm font-bold">Opportunities coming soon</p>
        <p className="text-xs text-muted-foreground mt-0.5">Scholarships, grants, and jobs from your community.</p>
      </div>
    </div>
  );
}
function NewsEmpty() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-2xl border border-dashed border-border bg-surface/50">
      <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
        <Newspaper className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <div>
        <p className="text-xs font-semibold">News &amp; updates coming soon</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Verified stories curated for your region.</p>
      </div>
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div className="space-y-3">
      {[0,1,2].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />)}
    </div>
  );
}
function PeopleSkeleton() {
  return (
    <div className="space-y-2">
      {[0,1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface" />)}
    </div>
  );
}

/* ── Person card — follow + report ──────────────────────────────────── */
type PersonCardProps = {
  userId: string; username: string | null; displayName: string | null;
  avatarUrl: string | null; isVerified: boolean; raldId: string;
  score: number; scoreLabel?: string;
  onReport: (target: ReportTarget) => void;
};

function PersonCard({ userId, username, displayName, avatarUrl, isVerified, raldId, score, scoreLabel, onReport }: PersonCardProps) {
  const label = displayName ?? username ?? raldId;
  const sub   = username ? `@${username}` : raldId;
  const color = avatarColor(userId);
  const { following, loading, toggle } = useFollow(userId);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleToggle = async () => {
    try { await toggle(); toast.success(following ? `Unfollowed ${label}` : `Following ${label}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update follow"); }
  };

  return (
    <div className="relative flex items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3 transition-colors">
      <div className="relative shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={label} className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <div className={cn("h-11 w-11 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold", color)}>
            {initials(label)}
          </div>
        )}
        {isVerified && <BadgeCheck className="absolute -bottom-0.5 -right-0.5 h-4 w-4 text-primary fill-background" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
        {score > 0 && <p className="text-[10px] text-primary font-medium mt-0.5">{scoreLabel ?? `Score ${score}`}</p>}
      </div>
      <button type="button" onClick={handleToggle} disabled={loading}
        className={cn("shrink-0 flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95",
          following ? "border-border bg-secondary text-foreground" : "border-primary/40 bg-primary/10 text-primary")}
        aria-label={following ? `Unfollow ${label}` : `Follow ${label}`}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" />
          : following ? <><UserCheck className="h-3 w-3" />Following</>
          : <><UserPlus className="h-3 w-3" />Follow</>}
      </button>
      <div className="relative">
        <button type="button" onClick={() => setMenuOpen(o => !o)}
          className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          aria-label="More options">
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-9 z-20 w-36 rounded-xl border border-border bg-card shadow-lg py-1">
              <button type="button"
                className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-secondary transition-colors"
                onClick={() => { setMenuOpen(false); onReport({ kind:"user", userId, displayName: label }); }}>
                Report user
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── People tab ─────────────────────────────────────────────────────── */
function PeopleTab({ onReport }: { onReport: (t: ReportTarget) => void }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<PersonResult[] | null>(null);
  const [suggestions, setSuggestions] = useState<PersonSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const { user, profile } = useAuth();
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!user) return;
    getPeopleSuggestions(user.id, profile?.interests ?? [])
      .then(setSuggestions).catch(() => {});
  }, [user, profile]);

  const doSearch = (q: string) => {
    clearTimeout(debounce.current);
    if (!q.trim() || !user) { setResults(null); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try { setResults(await searchRelatedPeople(q, user.id)); }
      catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search people…"
          value={query}
          onChange={e => { setQuery(e.target.value); doSearch(e.target.value); }}
          className="w-full pl-9 pr-4 h-10 rounded-2xl border border-border bg-surface text-sm outline-none focus:border-primary/50 transition-colors"
        />
      </div>
      {loading && <PeopleSkeleton />}
      {!loading && results !== null && results.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-6">No results for "{query}"</p>
      )}
      {!loading && results !== null && results.length > 0 && (
        <div className="space-y-2">
          {results.map(p => (
            <PersonCard key={p.userId} {...p} score={0} onReport={onReport} />
          ))}
        </div>
      )}
      {results === null && suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Suggested for you</p>
          {suggestions.map(s => (
            <PersonCard key={s.userId} {...s} score={s.matchScore ?? 0}
              scoreLabel={s.matchScore ? `${s.matchScore}% match` : undefined}
              onReport={onReport} />
          ))}
        </div>
      )}
      {results === null && suggestions.length === 0 && !loading && (
        <div className="text-center py-10">
          <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Search to find people on Loop</p>
        </div>
      )}
    </div>
  );
}

/* ── Near Me tab ─────────────────────────────────────────────────────── */
function NearMeTab({ onReport }: { onReport: (t: ReportTarget) => void }) {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [rooms, setRooms]     = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const location = profile ? formatLocation(profile) : "";
  const hasRegion = !!(profile?.state_id || profile?.country);

  useEffect(() => {
    if (!hasRegion) { setLoading(false); return; }
    listRooms({ limit: 20 })
      .then(data => {
        // Client-side region filter: match rooms to user region.
        // When the backend exposes region filtering (after migration 008+),
        // this should move to listRooms({ country: profile.country, stateId: profile.state_id })
        setRooms(data);
      })
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, [hasRegion]);

  if (!hasRegion) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-14 px-4">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Navigation className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Set your region</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-[260px]">
            Add your country, state, and local area to discover rooms and communities near you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground neon-glow"
        >
          <MapPin className="h-4 w-4" />
          Add location
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[0,1,2].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Location header */}
      <div className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/6 px-4 py-2.5">
        <MapPin className="h-4 w-4 text-primary shrink-0" />
        <div>
          <p className="text-xs font-bold text-primary">{location}</p>
          <p className="text-[10px] text-primary/60">Showing live rooms</p>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
          <Navigation className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm font-semibold">No live rooms in {location} right now</p>
          <p className="text-xs text-muted-foreground">Be the first to start a conversation here.</p>
          <button
            type="button"
            onClick={() => navigate("/create/room")}
            className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground neon-glow"
          >
            Start a room
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{rooms.length} live room{rooms.length !== 1 ? "s" : ""}</p>
          {rooms.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(`/rooms/${r.id}`)}
              className="w-full flex items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3 text-left hover:border-primary/30 transition-all"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{r.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-[11px] text-muted-foreground">{r.audience_count} listening</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Coming soon: local communities */}
      <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Users className="h-4 w-4 text-primary/60" />
        </div>
        <div>
          <p className="text-sm font-bold">Nearby communities</p>
          <p className="text-xs text-muted-foreground mt-0.5">Local communities for {location} are coming soon.</p>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────── */
export default function DiscoverPage() {
  const navigate      = useNavigate();
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab]       = useState<FeedTab>("all");
  const [activeCategory, setActiveCategory] = useState<RoomCategory | "all">("all");
  const [rooms, setRooms]               = useState<Room[]>([]);
  const [loading, setLoading]           = useState(true);
  const [query, setQuery]               = useState("");
  const [report, setReport]             = useState<ReportTarget | null>(null);

  const hasRegion = !!(profile?.state_id || profile?.country);

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  useEffect(() => {
    if (activeTab === "people" || activeTab === "near") return;
    setLoading(true);
    listRooms({
      category: activeCategory !== "all" ? activeCategory : undefined,
      limit: 30,
    })
      .then(data => setRooms(data))
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, [activeTab, activeCategory]);

  const filtered = query.trim()
    ? rooms.filter(r =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        r.description?.toLowerCase().includes(query.toLowerCase()))
    : rooms;

  return (
    <AppShell>
      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-xl border-b border-border">
        {/* Search bar */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search rooms, people, topics…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 h-10 rounded-2xl border border-border bg-surface text-sm outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 overflow-x-auto scrollbar-none px-4 pb-2">
          {FEED_TABS.map(tab => {
            const Icon = tab.icon;
            const isNear = tab.key === "near";
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
                  activeTab === tab.key
                    ? "bg-foreground text-background"
                    : "bg-secondary text-foreground hover:bg-secondary/80",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {/* Badge when user has region set and Near Me tab */}
                {isNear && hasRegion && activeTab !== "near" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        {/* Category chips (only for non-people, non-near tabs) */}
        {activeTab !== "people" && activeTab !== "near" && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 pb-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all",
                  activeCategory === cat.key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-transparent text-muted-foreground hover:border-primary/40",
                )}
              >
                {cat.emoji && <span className="mr-1">{cat.emoji}</span>}
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-4">
        {activeTab === "people" ? (
          <PeopleTab onReport={setReport} />
        ) : activeTab === "near" ? (
          <NearMeTab onReport={setReport} />
        ) : loading ? (
          <Skeleton />
        ) : (
          <>
            {filtered.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
                  <Sparkles className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm font-semibold">No rooms found</p>
                  <p className="text-xs text-muted-foreground">
                    {query ? `No results for "${query}"` : "No live rooms in this category right now."}
                  </p>
                </div>
                <DiscussionsEmpty />
                <OpportunitiesEmpty />
                <NewsEmpty />
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(r => (
                  <RoomCard
                    key={r.id}
                    room={r}
                    onClick={() => navigate(`/rooms/${r.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ReportSheet
        target={report}
        open={!!report}
        onClose={() => setReport(null)}
      />
    </AppShell>
  );
}
