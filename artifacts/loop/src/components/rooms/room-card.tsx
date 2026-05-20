import { Link } from "react-router-dom";
import { Users, Radio, BadgeCheck, Lock } from "lucide-react";
import type { Room } from "@/lib/api/rooms";
import { cn } from "@/lib/utils";

const categoryGradient: Record<string, string> = {
  sports: "from-emerald-500/30 via-teal-500/20 to-cyan-500/10",
  civic: "from-amber-500/25 via-orange-500/15 to-rose-500/10",
  music: "from-fuchsia-500/30 via-purple-500/20 to-indigo-500/10",
  entertainment: "from-pink-500/30 via-rose-500/20 to-fuchsia-500/10",
  news: "from-sky-500/25 via-blue-500/15 to-indigo-500/10",
  general: "from-mint/30 via-mint/15 to-transparent",
};

export function RoomCard({ room, compact = false }: { room: Room; compact?: boolean }) {
  return (
    <Link
      to={`/rooms/${room.id}`}
      className={cn(
        "group relative block overflow-hidden rounded-2xl border border-border bg-surface p-4 transition-transform active:scale-[0.98]",
        compact ? "min-w-[240px]" : "w-full",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70",
          categoryGradient[room.category] ?? categoryGradient.general,
        )}
      />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
            {room.visibility === "private" ? <Lock className="h-3 w-3" /> : <Radio className="h-3 w-3 text-primary" />}
            {room.category}
          </span>
          {room.is_live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary live-dot" />
              Live
            </span>
          )}
        </div>
        <h3 className="font-display text-lg font-semibold leading-tight text-foreground line-clamp-2">
          {room.title}
        </h3>
        {room.ai_summary && !compact && (
          <p className="text-xs text-muted-foreground line-clamp-2">{room.ai_summary}</p>
        )}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-full bg-gradient-mint shrink-0" />
            <span className="truncate text-xs text-muted-foreground">
              {room.host?.display_name ?? "Host"}
              {room.host?.is_verified && <BadgeCheck className="ml-1 inline h-3 w-3 text-primary" />}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-foreground/80">
            <Users className="h-3.5 w-3.5" />
            {room.audience_count}
          </div>
        </div>
      </div>
    </Link>
  );
}
