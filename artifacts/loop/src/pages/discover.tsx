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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── feed tab types ─────────────────────────────────────────────────── */
type FeedTab = "all" | "live" | "near" | "trending" | "events" | "people";

const FEED_TABS: { key: FeedTab; label: string; icon: typeof Radio }[] = [
  { key: "all",      label: "All",      icon: Globe2 },
  { key: "live",     label: "Live now", icon: Radio },
  { key: "people",   label: "People",   icon: Users },
  { key: "near",     label: "Near me",  icon: Globe2 },
  { key: "trending", label: "Trending", icon: TrendingUp },
  { key: "events",   label: "Events",   icon: Calendar },
];

/* ── category filter ────────────────────────────────────────────────── */
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
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
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
      {[0,1,2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />)}
    </div>
  );
}
function PeopleSkeleton() {
  return (
    <div className="space-y-2">
      {[0,1,2,3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface" />)}
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
      {/* Avatar */}
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

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
        {score > 0 && <p className="text-[10px] text-primary font-medium mt-0.5">{scoreLabel ?? `Score ${score}`}</p>}
      </div>

      {/* Follow */}
      <button type="button" onClick={handleToggle} disabled={loading}
        className={cn("shrink-0 flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95",
          following ? "border-border bg-secondary text-foreground" : "border-primary/40 bg-primary/10 text-primary")}
        aria-label={following ? `Unfollow ${label}` : `Follow ${label}`}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" />
          : following ? <><UserCheck className="h-3 w-3" />Following</>
          : <><UserPlus className="h-3 w-3" />Follow</>}
      </button>

      {/* More (⋮) — report */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          aria-label="More options"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-9 z-20 w-36 rounded-xl border border-border bg-card shadow-lg py-1">
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-secondary transition-colors"
                onClick={() => {
                  setMenuOpen(false);
                  onReport({ kind: "user", userId, displayName: label });
                }}
              >
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
      try { setResults(await searchRelatedPeople(query.trim(), 20)); }
      catch (e) { setError((e as Error).message); }
      finally { setSearching(false); }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  if (!hasIdentity) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center space-y-2">
        <Users className="h-8 w-8 text-muted-foreground/40 mx-auto" />
        <p className="text-sm font-semibold">Connect your RALD identity</p>
        <p className="text-xs text-muted-foreground">Sign in via profiles.rald.cloud to discover people you know.</p>
      </div>
    );
  }

  const showSearch  = query.trim().length > 0;
  const showResults = showSearch && !searching;
  const mkCard = (p: { user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; is_verified: boolean; rald_id: string }, score: number, lbl?: string) => (
    <PersonCard key={p.user_id} userId={p.user_id} username={p.username} displayName={p.display_name}
      avatarUrl={p.avatar_url} isVerified={p.is_verified} raldId={p.rald_id}
      score={score} scoreLabel={lbl} onReport={onReport} />
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people by name or @handle…"
          className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors" />
        {query && <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">✕</button>}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {showSearch && (
        <section>
          <h2 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            {searching ? "Searching…" : `Results for "${query}"`}
          </h2>
          {searching ? <PeopleSkeleton />
            : showResults && results !== null ? (
              results.length === 0
                ? <div className="rounded-2xl border border-dashed border-border p-6 text-center"><p className="text-sm font-semibold">No results</p><p className="text-xs text-muted-foreground mt-1">Try a different name or @handle.</p></div>
                : <div className="space-y-2">{results.map((p) => mkCard(p, p.connection_score, p.connection_score > 0 ? `Connection score ${p.connection_score}` : undefined))}</div>
            ) : null}
        </section>
      )}

      {!showSearch && (
        <section>
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <h2 className="font-display text-xs font-bold uppercase tracking-wider">People you may know</h2>
          </div>
          {loadingSugg ? <PeopleSkeleton />
            : !suggestions || suggestions.length === 0
            ? <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2"><Users className="h-8 w-8 text-muted-foreground/40 mx-auto" /><p className="text-sm font-semibold">No suggestions yet</p><p className="text-xs text-muted-foreground">Join rooms and connect with more people.</p></div>
            : <div className="space-y-2">{suggestions.map((p) => mkCard(p, p.mutual_score, p.mutual_score > 0 ? `Mutual score ${p.mutual_score}` : undefined))}</div>}
        </section>
      )}
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────── */
export default function DiscoverPage() {
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [feedTab, setFeedTab] = useState<FeedTab>("all");
  const [category, setCategory] = useState<RoomCategory | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
    else if (!loading && user && profile && !profile.onboarded) navigate("/onboarding");
  }, [loading, user, profile, navigate]);

  useEffect(() => {
    if (!user || feedTab === "people") return;
    setRooms(null);
    listRooms({ category: category === "all" ? undefined : category })
      .then(setRooms)
      .catch((e: Error) => { setError(e.message); });
  }, [category, user, feedTab]);

  if (loading || !user) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  const liveRooms = rooms?.filter((r) => r.is_live) ?? [];
  const allRooms  = rooms ?? [];

  return (
    <AppShell>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Loop</p>
            <h1 className="font-display text-2xl font-extrabold text-gradient-mint">Discover</h1>
          </div>
          <button type="button" onClick={() => navigate("/search")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-foreground active:scale-95 transition-transform"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        <div className="hide-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-2 pt-1">
          {FEED_TABS.map((t) => {
            const Icon = t.icon;
            const active = feedTab === t.key;
            return (
              <button key={t.key} type="button" onClick={() => setFeedTab(t.key)}
                className={cn("shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-mint" : "bg-surface text-muted-foreground hover:text-foreground border border-border")}
              >
                <Icon className="h-3 w-3" />{t.label}
              </button>
            );
          })}
        </div>

        {feedTab !== "people" && (
          <div className="hide-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-3">
            {CATEGORIES.map((c) => (
              <button key={c.key} type="button" onClick={() => setCategory(c.key)}
                className={cn("shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                  category === c.key ? "bg-primary/15 text-primary border border-primary/40" : "bg-surface text-muted-foreground border border-border")}
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

        {feedTab === "people" && <PeopleTab onReport={setReportTarget} />}

        {(feedTab === "all" || feedTab === "live") && liveRooms.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary live-dot" />
                <h2 className="font-display text-sm font-bold uppercase tracking-wider">Live now · {liveRooms.length}</h2>
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

        {(feedTab === "all" || feedTab === "trending") && (
          <>
            <section>
              <div className="mb-3 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-display text-sm font-bold uppercase tracking-wider">For you</h2>
              </div>
              {rooms === null ? <Skeleton /> : allRooms.length === 0 ? <EmptyState /> : (
                <div className="space-y-3">{allRooms.slice(0, 3).map((r) => <RoomCard key={r.id} room={r} />)}</div>
              )}
            </section>
            <DiscussionsEmpty />
            {allRooms.length > 3 && (
              <section>
                <h2 className="font-display text-sm font-bold uppercase tracking-wider mb-3">More rooms</h2>
                <div className="space-y-3">{allRooms.slice(3).map((r) => <RoomCard key={r.id} room={r} />)}</div>
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
                <Newspaper className="h-3.5 w-3.5 text-primary" />News &amp; updates
              </h2>
              <NewsEmpty />
            </section>
          </>
        )}

        {feedTab === "near" && (
          <section>
            <div className="flex items-center gap-1.5 mb-3">
              <Globe2 className="h-3.5 w-3.5 text-primary" />
              <h2 className="font-display text-sm font-bold uppercase tracking-wider">
                Near {profile?.state_id?.replace(/-/g, " ") ?? profile?.country ?? "you"}
              </h2>
            </div>
            {!profile?.country ? (
              <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-7 text-center space-y-3">
                <Globe2 className="h-8 w-8 text-primary/40 mx-auto" />
                <div>
                  <p className="text-sm font-semibold">Set your region to find nearby rooms</p>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-xs mx-auto">
                    Rooms from your city, state, and country will appear here. Your region is never shared publicly.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/settings")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2 text-xs font-semibold text-primary"
                >
                  Set region in settings →
                </button>
              </div>
            ) : rooms === null ? <Skeleton /> : (() => {
              const nearby = allRooms.filter((r) => !r.language || r.language === profile.language);
              return nearby.length > 0 ? (
                <div className="space-y-3">{nearby.map((r) => <RoomCard key={r.id} room={r} />)}</div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
                  <Globe2 className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm font-semibold">No rooms from your area right now</p>
                  <p className="text-xs text-muted-foreground">Be the first — start a room for your community.</p>
                  <button onClick={() => navigate("/create/room")}
                    className="mt-1 text-xs font-semibold text-primary underline underline-offset-2">
                    Start a room →
                  </button>
                </div>
              );
            })()}
          </section>
        )}

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

      {/* Part 15: Report sheet */}
      <ReportSheet
        open={reportTarget !== null}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
      />
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
