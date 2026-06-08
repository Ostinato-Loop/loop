import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { RoomCard } from "@/components/rooms/room-card";
import { listRooms, type Room } from "@/lib/api/rooms";
import { Radio, Users, TrendingUp } from "lucide-react";

export default function LivePage() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const load = () => listRooms().then(setRooms).catch(() => setRooms([]));
    load();
    /* auto-refresh every 30 s to feel alive */
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  /* pulsing elapsed timer to give "live" feel */
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const livestreams = rooms?.filter((r) => r.visibility === "livestream") ?? [];
  const allLive = rooms?.filter((r) => r.is_live) ?? [];
  const trending = allLive.slice(0, 3);
  const rest = allLive.slice(3);

  const totalListeners = allLive.reduce((sum, r) => sum + r.audience_count, 0);

  return (
    <AppShell>
      {/* Header */}
      <header className="relative overflow-hidden px-5 pt-5 pb-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--mint)_0%,transparent_65%)] opacity-10" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            <span className="relative h-1.5 w-1.5 rounded-full bg-primary live-dot" />
            Live now
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold">What's on</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Rooms happening right now across Loop.
          </p>

          {/* live stats strip */}
          {rooms !== null && allLive.length > 0 && (
            <div className="mt-3 flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Radio className="h-3 w-3 text-primary" />
                <span><strong className="text-foreground">{allLive.length}</strong> live rooms</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span><strong className="text-foreground">{totalListeners.toLocaleString()}</strong> listening</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Skeleton */}
      {rooms === null && (
        <div className="space-y-3 px-5 py-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {rooms !== null && allLive.length === 0 && (
        <div className="mx-5 mt-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <Radio className="mx-auto mb-3 h-6 w-6 text-primary" />
          <p className="font-display text-sm font-semibold">Nothing live right now</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start a room — you could be the first voice on air today.
          </p>
        </div>
      )}

      {/* Trending section */}
      {trending.length > 0 && (
        <section className="px-5 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <h2 className="font-display text-xs font-bold uppercase tracking-wider">Most listeners</h2>
          </div>
          <div className="space-y-3">
            {trending.map((r) => <RoomCard key={r.id} room={r} />)}
          </div>
        </section>
      )}

      {/* Livestreams section */}
      {livestreams.length > 0 && (
        <section className="px-5 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-primary" />
            <h2 className="font-display text-xs font-bold uppercase tracking-wider">Livestreams</h2>
          </div>
          <div className="space-y-3">
            {livestreams.map((r) => <RoomCard key={r.id} room={r} />)}
          </div>
        </section>
      )}

      {/* All other live rooms */}
      {rest.length > 0 && (
        <section className="px-5 py-3">
          <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
            All rooms
          </h2>
          <div className="space-y-3">
            {rest.map((r) => <RoomCard key={r.id} room={r} />)}
          </div>
        </section>
      )}

      {/* Last-updated hint */}
      {rooms !== null && (
        <p className="py-4 text-center text-[10px] text-muted-foreground/50">
          Refreshes every 30s · {elapsed}s since load
        </p>
      )}
    </AppShell>
  );
}
