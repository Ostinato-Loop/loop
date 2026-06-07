/**
 * Loop — Search Page
 * Rooms tab: full-text search against listRooms API.
 * People tab: searchRelatedPeople API.
 * Empty states are honest and actionable.
 * LILCKY STUDIO LIMITED
 */

import { useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { listRooms, type Room } from "@/lib/api/rooms";
import { searchRelatedPeople, type PersonResult } from "@/lib/api/people";
import { useFollow } from "@/lib/api/follows";
import {
  Search, ChevronLeft, Mic, Users, Radio, Loader2,
  BadgeCheck, UserPlus, UserCheck, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SearchTab = "rooms" | "people";

/* ── avatar helpers ── */
const AVATAR_COLORS = [
  "from-emerald-500 to-teal-500","from-fuchsia-500 to-purple-500",
  "from-amber-500 to-orange-500","from-sky-500 to-blue-500",
  "from-rose-500 to-pink-500",
];
function avatarColor(seed: string) {
  let n = 0; for (let i = 0; i < seed.length; i++) n += seed.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ── Person card with follow toggle ── */
function PersonRow({ p }: { p: PersonResult }) {
  const label = p.display_name ?? p.username ?? p.rald_id;
  const sub   = p.username ? `@${p.username}` : p.rald_id;
  const color = avatarColor(p.user_id);
  const { following, loading, toggle } = useFollow(p.user_id);

  const handleToggle = async () => {
    try { await toggle(); toast.success(following ? `Unfollowed ${label}` : `Now following ${label}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update"); }
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3">
      <div className="relative shrink-0">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt={label} className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <div className={cn("h-11 w-11 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold", color)}>
            {initials(label)}
          </div>
        )}
        {p.is_verified && <BadgeCheck className="absolute -bottom-0.5 -right-0.5 h-4 w-4 text-primary fill-background" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <button
        onClick={handleToggle} disabled={loading}
        className={cn("shrink-0 flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95",
          following ? "border-border bg-secondary text-foreground" : "border-primary/40 bg-primary/10 text-primary")}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" />
          : following ? <><UserCheck className="h-3 w-3" />Following</>
          : <><UserPlus className="h-3 w-3" />Connect</>}
      </button>
    </div>
  );
}

/* ── Room row ── */
function RoomRow({ room }: { room: Room }) {
  return (
    <Link
      to={`/rooms/${room.id}`}
      className="flex items-start gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3.5 transition-colors active:scale-[0.99]"
    >
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Mic className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold truncate">{room.title}</p>
          {room.is_live && (
            <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-[9px] font-bold uppercase text-live shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-live" />Live
            </span>
          )}
        </div>
        {room.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{room.description}</p>}
        <div className="flex items-center gap-2 mt-1">
          {room.category && <span className="text-[10px] text-muted-foreground capitalize">{room.category}</span>}
          <span className="text-[10px] text-muted-foreground">{room.audience_count} listening</span>
        </div>
      </div>
    </Link>
  );
}

/* ── Skeleton ── */
function Skel({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface" />
      ))}
    </div>
  );
}

/* ── Empty state ── */
function Empty({ tab, query }: { tab: SearchTab; query: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center">
        {tab === "rooms" ? <Radio className="h-6 w-6 text-muted-foreground/40" /> : <Users className="h-6 w-6 text-muted-foreground/40" />}
      </div>
      <div>
        <p className="text-sm font-semibold">
          {query ? `No ${tab} found for "${query}"` : `Search for ${tab}`}
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
          {query
            ? tab === "rooms" ? "Try a different title or category." : "Try a name or @handle."
            : tab === "rooms" ? "Type a title, topic, or keyword." : "Type a name or @handle to find people."}
        </p>
      </div>
    </div>
  );
}

/* ── Page ── */
export default function SearchPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<SearchTab>("rooms");
  const [query, setQuery] = useState("");
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [people, setPeople] = useState<PersonResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [trendingRooms, setTrendingRooms] = useState<Room[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  /* preload trending rooms */
  useEffect(() => {
    if (!user) return;
    listRooms({ limit: 8 }).then(setTrendingRooms).catch(() => {});
  }, [user]);

  /* focus input on mount */
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  /* debounced search */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setRooms(null); setPeople(null); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        if (tab === "rooms") {
          const r = await listRooms({ limit: 20 });
          const q = query.trim().toLowerCase();
          setRooms(r.filter((room) =>
            room.title.toLowerCase().includes(q) ||
            room.description?.toLowerCase().includes(q) ||
            room.category?.toLowerCase().includes(q)
          ));
        } else {
          const r = await searchRelatedPeople(query.trim(), 20);
          setPeople(r);
        }
      } catch { /* silent */ }
      finally { setSearching(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, tab]);

  /* reset results on tab switch */
  useEffect(() => { setRooms(null); setPeople(null); }, [tab]);

  if (loading || !user) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  const hasQuery = query.trim().length > 0;
  const showSkeleton = hasQuery && searching;
  const showRoomResults = tab === "rooms" && hasQuery && !searching && rooms !== null;
  const showPeopleResults = tab === "people" && hasQuery && !searching && people !== null;
  const showTrending = !hasQuery && tab === "rooms";

  return (
    <AppShell>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-2 px-5 py-3">
          <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0 active:scale-95 transition-transform" aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text" value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "rooms" ? "Search rooms…" : "Search people…"}
              className="w-full rounded-xl border border-border bg-surface pl-9 pr-9 py-2.5 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pb-3">
          {(["rooms", "people"] as SearchTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 rounded-full py-1.5 text-xs font-semibold capitalize transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="px-5 py-4 pb-8 space-y-3">
        {showSkeleton && <Skel />}

        {/* Room results */}
        {showRoomResults && (
          rooms!.length === 0 ? <Empty tab="rooms" query={query} />
          : <div className="space-y-2">{rooms!.map((r) => <RoomRow key={r.id} room={r} />)}</div>
        )}

        {/* People results */}
        {showPeopleResults && (
          people!.length === 0 ? <Empty tab="people" query={query} />
          : <div className="space-y-2">{people!.map((p) => <PersonRow key={p.user_id} p={p} />)}</div>
        )}

        {/* Trending rooms (default state) */}
        {showTrending && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Trending rooms</p>
            {trendingRooms.length === 0 ? (
              <Empty tab="rooms" query="" />
            ) : (
              <div className="space-y-2">{trendingRooms.map((r) => <RoomRow key={r.id} room={r} />)}</div>
            )}
          </section>
        )}

        {/* People default prompt */}
        {!hasQuery && tab === "people" && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center">
              <Users className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-semibold">Find people you know</p>
            <p className="text-xs text-muted-foreground max-w-[220px]">Search by name or @handle to connect with people on Loop.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
