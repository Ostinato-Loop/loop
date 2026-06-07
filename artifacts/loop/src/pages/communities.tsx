/**
 * Loop — Communities Page
 * Shows regional communities and rooms grouped by the user's region.
 * Calls /api/communities for community list; falls back to room cards.
 * Honest empty states with actionable CTAs.
 * LILCKY STUDIO LIMITED
 */

import { useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { listRooms, type Room } from "@/lib/api/rooms";
import {
  Globe2, Users, Mic, MapPin, ChevronRight,
  Radio, Sparkles, Plus, Search,
} from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/* ── types ── */
type Community = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  room_count: number;
  region: string | null;
  is_official: boolean;
  category: string | null;
};

/* ── fetch ── */
async function fetchCommunities(token: string | null): Promise<Community[]> {
  if (!token) return [];
  try {
    const r = await fetch(`${API_BASE}/api/communities?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return [];
    const j = await r.json() as { communities?: Community[] };
    return j.communities ?? [];
  } catch { return []; }
}

/* ── Region label ── */
function regionString(profile: ReturnType<typeof useAuth>["profile"]) {
  if (!profile) return null;
  const parts: string[] = [];
  if (profile.country)  parts.push(profile.country);
  if (profile.state_id) parts.push(profile.state_id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  if (profile.lga_id)   parts.push(profile.lga_id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  return parts.join(" · ") || null;
}

/* ── Community card ── */
function CommunityCard({ c }: { c: Community }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Globe2 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold truncate">{c.name}</p>
            {c.is_official && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold uppercase text-primary">Official</span>
            )}
          </div>
          {c.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.description}</p>}
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Users className="h-3 w-3" />{c.member_count.toLocaleString()} members
            </span>
            {c.room_count > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Mic className="h-3 w-3" />{c.room_count} rooms
              </span>
            )}
            {c.region && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                <MapPin className="h-3 w-3 shrink-0" />{c.region}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={() => {}}
        className="w-full h-9 rounded-xl border border-primary/30 bg-primary/5 text-xs font-semibold text-primary transition-colors active:bg-primary/10"
      >
        Join community
      </button>
    </div>
  );
}

/* ── Room card (regional rooms fallback) ── */
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
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold truncate">{room.title}</p>
          {room.is_live && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-live/15 px-1.5 py-px text-[9px] font-bold uppercase text-live">
              <span className="h-1.5 w-1.5 rounded-full bg-live" />Live
            </span>
          )}
        </div>
        {room.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{room.description}</p>}
        <div className="flex items-center gap-2 mt-0.5">
          {room.category && <span className="text-[10px] text-muted-foreground capitalize">{room.category}</span>}
          <span className="text-[10px] text-muted-foreground">{room.audience_count} listening</span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1" />
    </Link>
  );
}

/* ── Skeleton ── */
function Skel() {
  return (
    <div className="space-y-3">
      {[0,1,2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />)}
    </div>
  );
}

/* ── Page ── */
export default function CommunitiesPage() {
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [regionalRooms, setRegionalRooms] = useState<Room[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");

  const region = regionString(profile);

  const load = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    const token = localStorage.getItem("loop_token");
    const [comms, rooms] = await Promise.all([
      fetchCommunities(token),
      listRooms({ category: "community", limit: 10 }).catch(() => [] as Room[]),
    ]);
    setCommunities(comms);
    setRegionalRooms(rooms);
    setFetching(false);
  }, [user]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (loading || !user) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  const filtered = (communities ?? []).filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.region?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
        <div className="px-5 pt-4 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Loop</p>
          <div className="flex items-center justify-between mt-0.5">
            <h1 className="font-display text-2xl font-extrabold text-gradient-mint">Communities</h1>
            <button
              onClick={() => navigate("/create/community")}
              className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary active:scale-95 transition-transform"
            >
              <Plus className="h-3.5 w-3.5" /> Create
            </button>
          </div>
          {region && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground truncate">{region}</p>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="px-5 pb-3 pt-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search communities…"
              className="w-full rounded-xl border border-border bg-surface pl-9 pr-4 py-2.5 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
            />
          </div>
        </div>
      </header>

      <div className="px-5 py-4 pb-8 space-y-6">
        {fetching && <Skel />}

        {/* Communities list */}
        {!fetching && filtered.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-3">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <p className="text-[11px] font-bold uppercase tracking-wider">
                {search ? `Results for "${search}"` : "Communities for you"}
              </p>
            </div>
            <div className="space-y-3">
              {filtered.map((c) => <CommunityCard key={c.id} c={c} />)}
            </div>
          </section>
        )}

        {/* No communities — but show regional rooms */}
        {!fetching && filtered.length === 0 && !search && (
          <section>
            <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/5 p-5 text-center mb-4">
              <Globe2 className="h-8 w-8 text-primary/40 mx-auto mb-2" />
              <p className="text-sm font-bold">Communities launching soon</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Be among the first to build your regional community on Loop.
              </p>
              <button
                onClick={() => navigate("/create/community")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-bold"
              >
                <Plus className="h-3 w-3" /> Start a community
              </button>
            </div>

            {/* Regional rooms as proxy for community activity */}
            {regionalRooms.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <Radio className="h-3.5 w-3.5 text-primary" />
                  <p className="text-[11px] font-bold uppercase tracking-wider">Community rooms</p>
                </div>
                <div className="space-y-2">
                  {regionalRooms.map((r) => <RoomRow key={r.id} room={r} />)}
                </div>
              </div>
            )}

            {/* No regional rooms either */}
            {regionalRooms.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <Mic className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-semibold">No community rooms yet</p>
                <p className="text-xs text-muted-foreground mt-1">Start one — be the first voice in your region.</p>
                <button
                  onClick={() => navigate("/create/room")}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-bold"
                >
                  <Mic className="h-3 w-3" /> Start a room
                </button>
              </div>
            )}
          </section>
        )}

        {/* Search returned nothing */}
        {!fetching && filtered.length === 0 && search && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center">
              <Globe2 className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-semibold">No communities found for "{search}"</p>
            <p className="text-xs text-muted-foreground">Try a different region or topic name.</p>
          </div>
        )}

        {/* Region nudge */}
        {!fetching && !region && (
          <div className="rounded-2xl border border-border bg-surface p-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <MapPin className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Set your region</p>
              <p className="text-xs text-muted-foreground mt-0.5">See communities from your country, state, and LGA.</p>
            </div>
            <Link to="/settings" className="shrink-0 text-xs text-primary font-semibold mt-0.5">Set →</Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
