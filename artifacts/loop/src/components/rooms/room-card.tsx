// RETENTION-009 (2026-06-10): Live audience count via useLiveRoomCount.
// RETENTION-015 (2026-06-10): LiveWaveform replaces the static live-dot.
import { Link } from "react-router-dom";
import { Users, BadgeCheck, Lock, Mic } from "lucide-react";
import type { Room } from "@/lib/api/rooms";
import { cn } from "@/lib/utils";
import { useLiveRoomCount } from "@/hooks/use-live-room-count";

/**
 * Animated equalizer bars that replace the static pulsing dot on live rooms.
 *
 * Each bar independently oscillates between scaleY(0.18) and scaleY(1.0)
 * using the `loop-wave` keyframe defined in index.css. Different durations
 * and delays per bar create an organic, out-of-phase waveform appearance.
 *
 * Uses `bg-current` + `origin-bottom` so the bars grow upward and inherit
 * whatever text-color is set by the parent (text-primary, text-white, etc.).
 */
const WAVE_BARS: { h: number; dur: string; delay: string }[] = [
  { h:  8, dur: '0.55s', delay: '0.00s' },
  { h: 13, dur: '0.40s', delay: '0.12s' },
  { h: 10, dur: '0.70s', delay: '0.06s' },
  { h: 14, dur: '0.50s', delay: '0.20s' },
  { h:  7, dur: '0.60s', delay: '0.08s' },
];

export function LiveWaveform({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-end gap-[1.5px] shrink-0", className)}
      aria-label="Live audio"
      role="img"
    >
      {WAVE_BARS.map((b, i) => (
        <span
          key={i}
          className="inline-block w-[2px] rounded-full bg-current origin-bottom"
          style={{
            height:                   b.h,
            animationName:            'loop-wave',
            animationDuration:        b.dur,
            animationDelay:           b.delay,
            animationTimingFunction:  'ease-in-out',
            animationIterationCount:  'infinite',
            animationDirection:       'alternate',
            animationFillMode:        'both',
          }}
        />
      ))}
    </span>
  );
}

const categoryGradient: Record<string, string> = {
  sports:        "from-emerald-500/25 via-teal-500/15 to-transparent",
  civic:         "from-amber-500/20 via-orange-500/10 to-transparent",
  music:         "from-fuchsia-500/25 via-purple-500/15 to-transparent",
  entertainment: "from-pink-500/25 via-rose-500/15 to-transparent",
  news:          "from-sky-500/20 via-blue-500/10 to-transparent",
  general:       "from-primary/20 via-primary/10 to-transparent",
};

const categoryEmoji: Record<string, string> = {
  sports: "⚽", civic: "🏛️", music: "🎧",
  entertainment: "🎬", news: "📡", general: "🎙️",
};

export function RoomCard({ room, compact = false }: { room: Room; compact?: boolean }) {
  const { count, updated } = useLiveRoomCount(room.id, room.audience_count);
  return (
    <Link
      to={`/rooms/${room.id}`}
      className={cn(
        "group relative block overflow-hidden rounded-2xl border border-border bg-surface transition-transform active:scale-[0.98]",
        compact ? "min-w-[220px] p-3" : "w-full p-4",
      )}
    >
      {/* category glow */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70",
          categoryGradient[room.category] ?? categoryGradient.general,
        )}
      />

      <div className="relative flex flex-col gap-2.5">
        {/* top row */}
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
            {room.visibility === "private" ? (
              <Lock className="h-3 w-3" />
            ) : (
              <span className="mr-0.5">{categoryEmoji[room.category] ?? "🎙️"}</span>
            )}
            {room.category}
          </span>
          {room.is_live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
              <LiveWaveform className="text-primary" />
              Live
            </span>
          )}
        </div>

        {/* title */}
        <h3 className={cn(
          "font-display font-bold leading-tight text-foreground",
          compact ? "text-sm line-clamp-2 min-h-[2.4rem]" : "text-base line-clamp-2",
        )}>
          {room.title}
        </h3>

        {/* ai summary (full only) */}
        {room.ai_summary && !compact && (
          <p className="text-xs text-muted-foreground line-clamp-2">{room.ai_summary}</p>
        )}

        {/* footer */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              "shrink-0 rounded-full bg-gradient-mint flex items-center justify-center",
              compact ? "h-6 w-6" : "h-7 w-7",
            )}>
              <Mic className={cn("text-primary-foreground", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
            </div>
            <span className="truncate text-[11px] text-muted-foreground">
              {room.host?.display_name ?? "Host"}
              {room.host?.is_verified && (
                <BadgeCheck className="ml-1 inline h-3 w-3 text-primary" />
              )}
            </span>
          </div>
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium transition-colors duration-500",
            updated ? "text-primary" : "text-foreground/80",
          )}>
            <Users className="h-3.5 w-3.5" />
            {count.toLocaleString()}
          </div>
        </div>
      </div>
    </Link>
  );
}
