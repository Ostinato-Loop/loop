/**
 * Loop — Notifications Page (Regional Edition)
 * - Regional nudge if profile has no country set
 * - Live follower notifications
 * - Trust/profile completion prompts
 * LILCKY STUDIO LIMITED
 */

import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { useAuth, computeTrustScore } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import {
  Bell, Shield, CheckCircle2, Mic,
  ArrowRight, UserPlus, ChevronLeft, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";


type NotifKind = "follow" | "trust" | "profile" | "room_invite" | "regional" | "system";

type Notif = {
  id:           string;
  kind:         NotifKind;
  title:        string;
  body:         string;
  ts:           number;
  read:         boolean;
  action?:      string;
  actionLabel?: string;
  avatar?:      string | null;
  initials?:    string;
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function kindIcon(kind: NotifKind) {
  switch (kind) {
    case "follow":   return UserPlus;
    case "trust":    return Shield;
    case "profile":  return CheckCircle2;
    case "room_invite": return Mic;
    case "regional": return MapPin;
    default:         return Bell;
  }
}

function kindColor(kind: NotifKind): string {
  switch (kind) {
    case "follow":   return "bg-primary/10 text-primary";
    case "trust":    return "bg-amber-500/10 text-amber-500";
    case "profile":  return "bg-emerald-500/10 text-emerald-500";
    case "room_invite": return "bg-fuchsia-500/10 text-fuchsia-500";
    case "regional": return "bg-primary/10 text-primary";
    default:         return "bg-secondary text-muted-foreground";
  }
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

type FollowerRow = {
  follower_id: string;
  created_at:  string;
  profiles: {
    id:           string;
    username:     string | null;
    display_name: string | null;
    avatar_url:   string | null;
    is_verified:  boolean;
  } | null;
};

async function fetchFollowerNotifs(userId: string): Promise<Notif[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("follows")
      .select("follower_id, created_at, profiles:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, is_verified)")
      .eq("following_id", userId)
      .order("created_at", { ascending: false })
      .limit(10) as { data: FollowerRow[] | null };

    if (!data || data.length === 0) return [];
    return data.map(row => {
      const p    = row.profiles;
      const name = p?.display_name ?? p?.username ?? "Someone";
      return {
        id:       `follow-${row.follower_id}`,
        kind:     "follow" as const,
        title:    "New follower",
        body:     `${name} started following you`,
        ts:       new Date(row.created_at).getTime(),
        read:     false,
        avatar:   p?.avatar_url ?? null,
        initials: initials(name),
      };
    });
  } catch { return []; }
}

async function fetchFollowingLiveRooms(userId: string): Promise<Notif[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: follows } = await (supabase as any)
      .from("follows").select("following_id").eq("follower_id", userId).limit(100) as { data: Array<{ following_id: string }> | null };
    if (!follows || follows.length === 0) return [];
    const ids = follows.map(f => f.following_id);
    const { data: rooms } = await supabase
      .from("rooms").select("id, title, host_id").eq("is_live", true).in("host_id", ids).limit(5);
    if (!rooms || rooms.length === 0) return [];
    return rooms.map(r => ({
      id:          `room-${r.id}`,
      kind:        "room_invite" as const,
      title:       "Live now",
      body:        `${r.title} is live`,
      ts:          Date.now(),
      read:        false,
      action:      `/rooms/${r.id}`,
      actionLabel: "Join",
    }));
  } catch { return []; }
}

export default function NotificationsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);
    try {
      const [followers, liveRooms] = await Promise.all([
        fetchFollowerNotifs(user.id),
        fetchFollowingLiveRooms(user.id),
      ]);

      const systemNotifs: Notif[] = [];

      // ── Regional nudge ────────────────────────────────────────────
      if (!profile.country) {
        systemNotifs.push({
          id:          "regional-nudge",
          kind:        "regional",
          title:       "Set your region",
          body:        "Complete your location to discover nearby conversations, rooms, and people.",
          ts:          Date.now() - 5000,
          read:        false,
          action:      "/settings",
          actionLabel: "Add location",
        });
      }

      // ── Trust nudge ───────────────────────────────────────────────
      const score = computeTrustScore(profile);
      if (score < 60) {
        systemNotifs.push({
          id:    "trust-nudge",
          kind:  "trust",
          title: "Boost your Loop score",
          body:  `Your trust score is ${score}/100. Add a photo, bio, or region to unlock more features.`,
          ts:    Date.now() - 60_000,
          read:  false,
          action:      "/settings",
          actionLabel: "Complete profile",
        });
      }

      // ── Profile completion ────────────────────────────────────────
      if (!profile.avatar_url) {
        systemNotifs.push({
          id:    "avatar-nudge",
          kind:  "profile",
          title: "Add a profile photo",
          body:  "Profiles with photos get 3× more followers on Loop.",
          ts:    Date.now() - 120_000,
          read:  false,
          action:      "/settings",
          actionLabel: "Add photo",
        });
      }

      const all = [...liveRooms, ...followers, ...systemNotifs]
        .sort((a, b) => b.ts - a.ts);
      setNotifs(all);
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!authLoading && !user) navigate("/login"); }, [authLoading, user, navigate]);

  return (
    <AppShell>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border px-4 pt-safe-top">
        <div className="flex items-center gap-2 py-3">
          <button type="button" onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-lg font-bold">Notifications</h1>
        </div>
      </header>

      <div className="px-4 py-4 space-y-2">
        {loading ? (
          <>
            {[0,1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface" />)}
          </>
        ) : notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Bell className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-semibold">No notifications yet</p>
            <p className="text-xs text-muted-foreground max-w-[200px]">Start following people and join rooms to get notified.</p>
          </div>
        ) : (
          notifs.map(n => <NotifRow key={n.id} notif={n} onNavigate={navigate} />)
        )}
      </div>
    </AppShell>
  );
}

function NotifRow({ notif, onNavigate }: { notif: Notif; onNavigate: (path: string) => void }) {
  const Icon  = kindIcon(notif.kind);
  const color = kindColor(notif.kind);

  return (
    <button
      type="button"
      onClick={() => notif.action && onNavigate(notif.action)}
      className={cn(
        "w-full flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors",
        notif.read ? "border-border bg-surface/40" : "border-border bg-surface",
        notif.action ? "hover:border-primary/30 cursor-pointer" : "cursor-default",
      )}
    >
      {/* Icon / avatar */}
      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold", color)}>
        {notif.initials ?? <Icon className="h-4 w-4" />}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{notif.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{notif.body}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(notif.ts)}</p>
      </div>

      {/* Action */}
      {notif.action && notif.actionLabel && (
        <span className="shrink-0 text-xs font-bold text-primary mt-0.5 flex items-center gap-0.5">
          {notif.actionLabel} <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}
