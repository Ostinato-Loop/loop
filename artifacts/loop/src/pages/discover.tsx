import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { RoomCard } from "@/components/rooms/room-card";
import { listRooms, type Room, type RoomCategory } from "@/lib/api/rooms";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const categories: { key: RoomCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sports", label: "Sports" },
  { key: "civic", label: "Civic" },
  { key: "music", label: "Music" },
  { key: "entertainment", label: "Culture" },
  { key: "news", label: "News" },
];

export default function DiscoverPage() {
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [active, setActive] = useState<RoomCategory | "all">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
    else if (!loading && user && profile && !profile.onboarded) navigate("/onboarding");
  }, [loading, user, profile, navigate]);

  useEffect(() => {
    if (!user) return;
    setRooms(null);
    listRooms({ category: active === "all" ? undefined : active })
      .then(setRooms)
      .catch((e: Error) => setError(e.message));
  }, [active, user]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const trending = rooms?.slice(0, 5) ?? [];
  const rest = rooms?.slice(5) ?? [];

  return (
    <AppShell>
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Loop</p>
            <h1 className="font-display text-2xl font-bold text-gradient-mint">Discover</h1>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-foreground">
            <Search className="h-4 w-4" />
          </button>
        </div>
        <div className="hide-scrollbar flex gap-2 overflow-x-auto px-5 pb-3">
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => setActive(c.key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                active === c.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-5 py-4 space-y-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {trending.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-display text-sm font-bold uppercase tracking-wider">Trending now</h2>
            </div>
            <div className="hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
              {trending.map((r) => (
                <RoomCard key={r.id} room={r} compact />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider">For you</h2>
          {rooms === null ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />
              ))}
            </div>
          ) : rest.length === 0 && trending.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {rest.map((r) => (
                <RoomCard key={r.id} room={r} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <h3 className="font-display text-base font-semibold">No live rooms yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Be the first — tap the + below to start one.
      </p>
    </div>
  );
}
