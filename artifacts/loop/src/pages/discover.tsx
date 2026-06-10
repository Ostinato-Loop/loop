/**
 * Loop Discover Page
 *
 * Progressive Trust principle applied to "Near me":
 *   → If profile.state_id is not set, show a soft contextual prompt
 *     explaining WHY location helps, with a region picker.
 *   → User can skip — they'll see all rooms.
 *   → After saving, profile.state_id is persisted and they see "Near <state>".
 *
 * RETENTION-007 (2026-06-10):
 *   1. ?tab= deep-link support — feed "See all →" lands on People tab directly.
 *   2. Loop-native creator suggestions in People tab (no RALD required).
 *   3. Dead Search button wired to /search.
 *
 * LILCKY STUDIO LIMITED
 */

import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { supabase, authedSupabase } from "@/integrations/supabase/client";
import { authFetch } from "@/lib/api-fetch";
import { AppShell } from "@/components/layout/app-shell";
import { RoomCard } from "@/components/rooms/room-card";
import { FollowButton } from "@/components/follow-button";
import { listRooms, type Room, type RoomCategory } from "@/lib/api/rooms";
import {
  searchRelatedPeople, getPeopleSuggestions, hasRaldIdentity,
  type PersonResult, type PersonSuggestion,
} from "@/lib/api/people";
import {
  Search, Sparkles, Radio, Globe2, TrendingUp,
  Calendar, Briefcase, Newspaper, ChevronRight,
  Users, BadgeCheck, Check, UserPlus, MapPin, Loader2, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFollow } from "@/hooks/use-follow";

/* ── Feed tab types ─────────────────────────────────────────────────── */
type FeedTab = "all" | "live" | "near" | "trending" | "events" | "people";

const FEED_TABS: { key: FeedTab; label: string; icon: typeof Radio }[] = [
  { key: "all",      label: "All",      icon: Globe2 },
  { key: "live",     label: "Live now", icon: Radio },
  { key: "people",   label: "People",   icon: Users },
  { key: "near",     label: "Near me",  icon: MapPin },
  { key: "trending", label: "Trending", icon: TrendingUp },
  { key: "events",   label: "Events",   icon: Calendar },
];

/* ── Category filter ────────────────────────────────────────────────── */
const CATEGORIES: { key: RoomCategory | "all"; label: string; emoji: string }[] = [
  { key: "all",         label: "All",         emoji: ""   },
  { key: "community",   label: "Community",   emoji: "🏘️" },
  { key: "news",        label: "News",        emoji: "📡" },
  { key: "commentary",  label: "Commentary",  emoji: "🎙️" },
  { key: "radio",       label: "Radio",       emoji: "📻" },
  { key: "dj-session",  label: "DJ Session",  emoji: "🎧" },
  { key: "education",   label: "Education",   emoji: "📚" },
  { key: "business",    label: "Business",    emoji: "💼" },
];

/* ── Nigerian states + common African countries ─────────────────────── */
const REGIONS = [
  { group: "Nigeria", items: [
    "Lagos", "FCT (Abuja)", "Kano", "Rivers", "Oyo", "Anambra", "Delta",
    "Kaduna", "Enugu", "Imo", "Ogun", "Edo", "Kwara", "Borno", "Bauchi",
    "Jigawa", "Katsina", "Sokoto", "Zamfara", "Niger", "Nasarawa", "Plateau",
    "Benue", "Kogi", "Cross River", "Akwa Ibom", "Abia", "Ebonyi", "Ondo",
    "Ekiti", "Osun", "Kebbi", "Taraba", "Gombe", "Yobe", "Adamawa", "Bayelsa",
  ]},
  { group: "Africa", items: [
    "Ghana", "Kenya", "South Africa", "Ethiopia", "Uganda",
    "Tanzania", "Rwanda", "Senegal", "Cameroon", "Côte d'Ivoire",
  ]},
  { group: "Other", items: ["United Kingdom", "United States", "Canada", "Other"] },
];

/* ── Avatar helpers ─────────────────────────────────────────────────── */
const AVATAR_COLORS = [
  "from-emerald-500 to-teal-500",
  "from-fuchsia-500 to-purple-500",
  "from-amber-500 to-orange-500",
  "from-sky-500 to-blue-500",
  "from-rose-500 to-pink-500",
  "from-mint to-mint-glow",
];
function avatarColor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n += seed.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ── Honest empty states ────────────────────────────────────────────── */
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
        <p className="text-xs font-semibold">News & updates coming soon</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Verified stories curated for your region.</p>
      </div>
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />)}
    </div>
  );
}

function PeopleSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface" />)}
    </div>
  );
}

/* ── Location prompt — Progressive Trust ────────────────────────────── */
function LocationPrompt({
  onSave, onSkip,
}: {
  onSave: (state: string) => Promise<void>;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState("");
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    if (!selected || saving) return;
    setSaving(true);
    await onSave(selected);
    setSaving(false);
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <MapPin className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-bold">Tell Loop where you are</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            So we can show you rooms from your state, city, and community.
            Your location is never shared without your permission.
          </p>
        </div>
      </div>

      {/* Region select */}
      <div className="relative">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full h-12 rounded-xl border border-border bg-background px-4 pr-10 text-sm appearance-none outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
        >
          <option value="">Select your state or country…</option>
          {REGIONS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!selected || saving}
          className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98] transition-transform"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Show nearby rooms"}
        </button>
        <button
          onClick={onSkip}
          className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

/* ── Person card ────────────────────────────────────────────────────── */
type PersonCardProps = {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  raldId: string;
  score: number;
  scoreLabel?: string;
};

function PersonCard({ userId, username, displayName, avatarUrl, isVerified, raldId, score, scoreLabel }: PersonCardProps) {
  const label = displayName ?? username ?? raldId;
  const sub   = username ? `@${username}` : raldId;
  const color = avatarColor(userId);
  const { following, loading, toggle } = useFollow(userId);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3 active:bg-surface transition-colors">
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
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className={cn(
          "shrink-0 flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold active:scale-95 transition-all disabled:opacity-50",
          following
            ? "border-primary/20 bg-primary/5 text-primary/70"
            : "border-primary/40 bg-primary/10 text-primary",
        )}
        aria-label={following ? `Unfollow ${label}` : `Connect with ${label}`}
      >
        {following ? (
          <><Check className="h-3 w-3" /> Following</>
        ) : (
          <><UserPlus className="h-3 w-3" /> Connect</>
        )}
      </button>
    </div>
  );
}

/* ── Loop-native creator suggestions (no RALD required) ─────────────── */
type LoopSuggestion = {
  id:             string;
  username:       string | null;
  display_name:   string | null;
  avatar_url:     string | null;
  is_verified:    boolean;
  is_creator:     boolean;
  follower_count: number;
  bio:            string | null;
};

function LoopCreatorSuggestions() {
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
  const [users,   setUsers]   = useState<LoopSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authFetch(`${API_BASE}/api/follows/suggestions`)
      .then(r => r.ok ? r.json() as Promise<{ suggestions: LoopSuggestion[] }> : Promise.reject())
      .then(d => { if (active) setUsers(d.suggestions ?? []); })
      .catch(() => { if (active) setUsers([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [API_BASE]);

  if (!loading && users.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-1.5">
        <UserPlus className="h-3.5 w-3.5 text-primary" />
        <h2 className="font-display text-xs font-bold uppercase tracking-wider">Creators to follow</h2>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => {
            const name = u.display_name ?? u.username ?? "Creator";
            const color = avatarColor(u.id);
            return (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3"
              >
                {/* Avatar */}
                <div className="shrink-0">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={name} className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <div className={cn(
                      "h-11 w-11 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold",
                      color,
                    )}>
                      {initials(name)}
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="truncate text-sm font-semibold leading-tight">{name}</p>
                    {u.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                  {u.follower_count > 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      {u.follower_count.toLocaleString()} followers
                    </p>
                  ) : u.is_creator ? (
                    <p className="text-[11px] text-primary/70">Creator</p>
                  ) : null}
                  {u.bio && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-1">{u.bio}</p>
                  )}
                </div>
                {/* Follow */}
                <FollowButton userId={u.id} initialFollowing={false} size="sm" />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── People tab ─────────────────────────────────────────────────────── */
function PeopleTab() {
  const [query, setQuery]             = useState("");
  const [results, setResults]         = useState<PersonResult[] | null>(null);
  const [suggestions, setSuggestions] = useState<PersonSuggestion[] | null>(null);
  const [searching, setSearching]     = useState(false);
  const [loadingSugg, setLoadingSugg] = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasIdentity                   = hasRaldIdentity();

  useEffect(() => {
    if (!hasIdentity) { setLoadingSugg(false); return; }
    getPeopleSuggestions(10)
      .then((s) => { setSuggestions(s); setLoadingSugg(false); })
      .catch((e: Error) => { setError(e.message); setLoadingSugg(false); });
  }, [hasIdentity]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true); setError(null);
      try {
        setResults(await searchRelatedPeople(query.trim(), 20));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const showSearch  = query.trim().length > 0;
  const showResults = showSearch && !searching;

  return (
    <div className="space-y-5">
      {/* Search bar — always visible */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people by name or @handle…"
          className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">✕</button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Search results */}
      {showSearch && (
        <section>
          <h2 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            {searching ? "Searching…" : `Results for "${query}"`}
          </h2>
          {searching ? <PeopleSkeleton /> : showResults && results !== null ? (
            results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                <p className="text-sm font-semibold">No results</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different name or @handle.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((p) => (
                  <PersonCard key={p.user_id} userId={p.user_id} username={p.username} displayName={p.display_name} avatarUrl={p.avatar_url} isVerified={p.is_verified} raldId={p.rald_id} score={p.connection_score} scoreLabel={p.connection_score > 0 ? `Connection score ${p.connection_score}` : undefined} />
                ))}
              </div>
            )
          ) : null}
        </section>
      )}

      {/* Suggestions — shown when not actively searching */}
      {!showSearch && (
        <>
          {/* Loop-native creator suggestions — always shown, no RALD needed */}
          <LoopCreatorSuggestions />

          {/* RALD social graph suggestions — only for users with RALD identity */}
          {hasIdentity && (
            <section>
              <div className="mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <h2 className="font-display text-xs font-bold uppercase tracking-wider">People you may know</h2>
              </div>
              {loadingSugg ? <PeopleSkeleton /> : !suggestions || suggestions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
                  <Users className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm font-semibold">No suggestions yet</p>
                  <p className="text-xs text-muted-foreground">Join rooms and connect with more people to grow your network.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {suggestions.map((p) => (
                    <PersonCard key={p.user_id} userId={p.user_id} username={p.username} displayName={p.display_name} avatarUrl={p.avatar_url} isVerified={p.is_verified} raldId={p.rald_id} score={p.mutual_score} scoreLabel={p.mutual_score > 0 ? `Mutual score ${p.mutual_score}` : undefined} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ── RETENTION-016: Top rooms this week ─────────────────────────────── */
/**
 * Ranked list of the 5 rooms with the highest audience_count created in the
 * last 7 days. Gives returning users a social-proof signal: "X people were
 * in this room" primes them to click in and drives re-engagement.
 *
 * Design:
 *   · Medals 🥇🥈🥉 for ranks 1–3, muted "#4" "#5" for the rest
 *   · Proportional audience bar under each title (relative to the #1 room)
 *   · Tapping any row navigates to /room/:id — works for ended rooms too
 */
function TopRoomsThisWeek({ rooms }: { rooms: Room[] }) {
  if (rooms.length === 0) return null;

  const MEDALS = ["🥇", "🥈", "🥉"];
  const max = Math.max(...rooms.map((r) => r.audience_count ?? 0), 1);

  const categoryEmoji: Record<string, string> = {
    community:   "🏘️",
    news:        "📡",
    commentary:  "🎙️",
    radio:       "📻",
    "dj-session":"🎧",
    education:   "📚",
    business:    "💼",
    general:     "🎵",
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-1.5">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-bold uppercase tracking-wider">Top this week</h2>
      </div>

      <div className="space-y-2">
        {rooms.map((room, i) => {
          const hostName = room.host?.display_name ?? room.host?.username ?? "Unknown host";
          const pct      = Math.max(4, Math.round(((room.audience_count ?? 0) / max) * 100));

          return (
            <Link
              key={room.id}
              to={`/room/${room.id}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98]"
            >
              {/* rank badge */}
              <div className="w-7 shrink-0 text-center">
                {i < 3 ? (
                  <span className="text-lg leading-none select-none">{MEDALS[i]}</span>
                ) : (
                  <span className="text-xs font-black tabular-nums text-muted-foreground">#{i + 1}</span>
                )}
              </div>

              {/* category icon */}
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-base select-none">
                {categoryEmoji[room.category] ?? "🎙️"}
              </div>

              {/* text + bar */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight truncate">{room.title}</p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{hostName}</p>
                {/* proportional audience bar — anchored to the #1 room */}
                <div className="mt-1.5 h-1 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* count */}
              <div className="shrink-0 text-right ml-1">
                <p className="text-sm font-bold tabular-nums">
                  {(room.audience_count ?? 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">listeners</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ── Main page ──────────────────────────────────────────────────────── */
const VALID_TABS: FeedTab[] = ["all", "live", "near", "trending", "events", "people"];

export default function DiscoverPage() {
  const { user, loading, profile, refreshProfile } = useAuth();
  const navigate                        = useNavigate();
  const [searchParams]                  = useSearchParams();
  const [rooms, setRooms]               = useState<Room[] | null>(null);
  const [topRooms, setTopRooms]         = useState<Room[] | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [locationSkipped, setLocationSkipped] = useState(false);

  // ?tab= deep-link — lets feed's "See all →" drop into the People tab directly
  const tabParam = searchParams.get("tab") as FeedTab | null;
  const [feedTab, setFeedTab] = useState<FeedTab>(
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : "all",
  );
  const [category, setCategory] = useState<RoomCategory | "all">("all");

  // Auth + onboarding gate now handled by ProtectedRoute in App.tsx

  useEffect(() => {
    if (!user || feedTab === "people") return;
    setRooms(null);
    listRooms({ category: category === "all" ? undefined : category })
      .then(setRooms)
      .catch((e: Error) => {
        console.error("[discover] listRooms:", e.message);
        setError(e.message);
      });
  }, [category, user, feedTab]);

  // RETENTION-016: Top rooms this week — separate query (includes ended rooms,
  // ordered by audience_count DESC, filtered to last 7 days).
  useEffect(() => {
    if (!user) return;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("rooms")
      .select("*, host:profiles!rooms_host_id_fkey(username, display_name, avatar_url, is_verified)")
      .gte("created_at", sevenDaysAgo)
      .gt("audience_count", 0)
      .order("audience_count", { ascending: false })
      .limit(5)
      .then(({ data, error: err }) => {
        if (err) { console.error("[discover] topRooms:", err.message); return; }
        setTopRooms((data as Room[]) ?? []);
      });
  }, [user]);

  /* ── Save location (Progressive Trust) ── */
  const saveLocation = async (stateId: string) => {
    if (!user) return;
    try {
      const { error: err } = await authedSupabase()
        .from("profiles")
        .update({ state_id: stateId })
        .eq("id", user.id);
      if (err) throw err;
      await refreshProfile();
    } catch (e) {
      import("sonner").then(({ toast }) =>
        toast.error(e instanceof Error ? e.message : "Could not save location")
      );
    }
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const liveRooms = rooms?.filter((r) => r.is_live) ?? [];
  const allRooms  = rooms ?? [];
  const hasLocation = !!profile?.state_id;

  return (
    <AppShell>
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border pt-safe-top">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Loop</p>
            <h1 className="font-display text-2xl font-extrabold text-gradient-mint">Discover</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate("/search")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-foreground active:scale-95 transition-transform"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        {/* Feed tabs */}
        <div className="hide-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-2 pt-1">
          {FEED_TABS.map((t) => {
            const Icon   = t.icon;
            const active = feedTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFeedTab(t.key)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-mint"
                    : "bg-surface text-muted-foreground hover:text-foreground border border-border",
                )}
              >
                <Icon className="h-3 w-3" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Category chips — hidden on People tab */}
        {feedTab !== "people" && (
          <div className="hide-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-3">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                  category === c.key
                    ? "bg-primary/15 text-primary border border-primary/40"
                    : "bg-surface text-muted-foreground border border-border",
                )}
              >
                {c.emoji && <span className="mr-1">{c.emoji}</span>}{c.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="px-5 py-4 space-y-6 pb-8">
        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 flex items-center gap-2.5">
            <span className="text-base" aria-hidden>⚠️</span>
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {/* ── People tab ── */}
        {feedTab === "people" && <PeopleTab />}

        {/* ── Live strip ── */}
        {(feedTab === "all" || feedTab === "live") && liveRooms.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary live-dot" />
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                  Live now · {liveRooms.length}
                </h2>
              </div>
              <button type="button" onClick={() => setFeedTab("live")} className="flex items-center gap-1 text-xs text-primary font-semibold">
                See all <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
              {liveRooms.slice(0, 6).map((r) => <RoomCard key={r.id} room={r} compact />)}
            </div>
          </section>
        )}

        {/* ── Top rooms this week ── */}
        {(feedTab === "all" || feedTab === "trending") && topRooms && topRooms.length > 0 && (
          <TopRoomsThisWeek rooms={topRooms} />
        )}

        {/* ── Full feed (All + Trending) ── */}
        {(feedTab === "all" || feedTab === "trending") && (
          <>
            <section>
              <div className="mb-3 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-display text-sm font-bold uppercase tracking-wider">For you</h2>
              </div>
              {rooms === null ? <Skeleton /> : allRooms.length === 0 ? <EmptyState /> : (
                <div className="space-y-3">
                  {allRooms.slice(0, 3).map((r) => <RoomCard key={r.id} room={r} />)}
                </div>
              )}
            </section>

            <DiscussionsEmpty />

            {allRooms.length > 3 && (
              <section>
                <h2 className="font-display text-sm font-bold uppercase tracking-wider mb-3">More rooms</h2>
                <div className="space-y-3">
                  {allRooms.slice(3).map((r) => <RoomCard key={r.id} room={r} />)}
                </div>
              </section>
            )}

            <section>
              <h2 className="font-display text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-primary" />Opportunities
              </h2>
              <OpportunitiesEmpty />
            </section>

            <section>
              <h2 className="font-display text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Newspaper className="h-3.5 w-3.5 text-primary" />News & updates
              </h2>
              <NewsEmpty />
            </section>
          </>
        )}

        {/* ── Near me tab — Progressive Trust location prompt ── */}
        {feedTab === "near" && (
          <div className="space-y-4">
            {/* Progressive Trust: ask for location if not set and not skipped */}
            {!hasLocation && !locationSkipped && (
              <LocationPrompt
                onSave={saveLocation}
                onSkip={() => setLocationSkipped(true)}
              />
            )}

            {/* Location set: show badge */}
            {hasLocation && (
              <div className="flex items-center gap-2 text-xs text-primary font-semibold">
                <MapPin className="h-3.5 w-3.5" />
                Showing rooms near {profile?.state_id}
                <button
                  onClick={() => saveLocation("")}
                  className="text-muted-foreground font-normal underline underline-offset-2 ml-1"
                >
                  Change
                </button>
              </div>
            )}

            {/* Skipped: honest label */}
            {!hasLocation && locationSkipped && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Showing all rooms. Set your location for local results.</p>
                <button
                  onClick={() => setLocationSkipped(false)}
                  className="text-xs text-primary font-semibold"
                >
                  Set location
                </button>
              </div>
            )}

            <section>
              <div className="flex items-center gap-1.5 mb-3">
                <Globe2 className="h-3.5 w-3.5 text-primary" />
                <h2 className="font-display text-sm font-bold uppercase tracking-wider">
                  Near {profile?.state_id ?? "you"}
                </h2>
              </div>
              {rooms === null ? <Skeleton /> : allRooms.length === 0 ? <EmptyState /> : (
                <div className="space-y-3">
                  {allRooms.map((r) => <RoomCard key={r.id} room={r} />)}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── Events tab ── */}
        {feedTab === "events" && (
          <section>
            <div className="flex items-center gap-1.5 mb-3">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <h2 className="font-display text-sm font-bold uppercase tracking-wider">Upcoming events</h2>
            </div>
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <Calendar className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-semibold">Events coming soon</p>
              <p className="text-xs text-muted-foreground mt-1">Conferences, open mics, hackathons and more.</p>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface">
        <Mic className="h-5 w-5 text-primary" />
      </div>
      <h3 className="font-display text-base font-semibold">No rooms yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">Be first — tap + below to start one.</p>
    </div>
  );
}
