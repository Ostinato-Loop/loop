/**
 * Loop — Notifications Page
 * Real data: new followers from /api/follows/me/followers
 * Trust nudges + profile completion prompts from local state.
 * LILCKY STUDIO LIMITED
 */

import { useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { useAuth, computeTrustScore, getTrustLevel } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import {
  Bell, Users, Shield, CheckCircle2, Mic,
  ArrowRight, UserPlus, ChevronLeft, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/* ── types ── */
type NotifKind = "follow" | "trust" | "profile" | "room_invite" | "system";

type Notif = {
  id:        string;
  kind:      NotifKind;
  title:     string;
  body:      string;
  ts:        number;
  read:      boolean;
  action?:   string;
  actionLabel?: string;
  avatar?:   string | null;
  initials?: string;
};

/* ── helpers ── */
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function kindIcon(kind: NotifKind) {
  switch (kind) {
    case "follow":      return UserPlus;
    case "trust":       return Shield;
    case "profile":     return CheckCircle2;
    case "room_invite": return Mic;
    default:            return Bell;
  }
}

function kindColor(kind: NotifKind): string {
  switch (kind) {
    case "follow":      return "bg-primary/10 text-primary";
    case "trust":       return "bg-amber-500/10 text-amber-500";
    case "profile":     return "bg-emerald-500/10 text-emerald-500";
    case "room_invite": return "bg-fuchsia-500/10 text-fuchsia-500";
    default:            return "bg-secondary text-muted-foreground";
  }
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ── fetch followers as notifications ── */
async function fetchFollowerNotifs(token: string | null): Promise<Notif[]> {
  if (!token) return [];
  try {
    const r = await fetch(`${API_BASE}/api/follows/me/followers?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return [];
    const j = await r.json() as { followers?: Array<{ user_id: string; display_name: string | null; username: string | null; avatar_url: string | null; followed_at: string }> };
    return (j.followers ?? []).map((f) => {
      const label = f.display_name ?? f.username ?? f.user_id.slice(0, 8);
      return {
        id:          `follow-${f.user_id}`,
        kind:        "follow" as const,
        title:       `${label} started following you`,
        body:        f.username ? `@${f.username}` : "Loop member",
        ts:          new Date(f.followed_at).getTime(),
        read:        false,
        action:      `/discover`,
        actionLabel: "View people",
        initials:    initials(label),
        avatar:      f.avatar_url,
      };
    });
  } catch {
    return [];
  }
}

/* ── synthetic nudges from profile state ── */
function buildNudges(profile: ReturnType<typeof useAuth>["profile"], score: number): Notif[] {
  const nudges: Notif[] = [];
  const now = Date.now();

  if (!profile) return nudges;

  if (!profile.avatar_url) {
    nudges.push({
      id: "nudge-avatar", kind: "profile",
      title: "Add a profile photo",
      body: "Members with a photo get 3× more connects.",
      ts: now - 3600_000, read: true,
      action: "https://profiles.rald.cloud", actionLabel: "Add photo",
    });
  }
  if (!profile.bio) {
    nudges.push({
      id: "nudge-bio", kind: "profile",
      title: "Write a bio",
      body: "Tell your community who you are.",
      ts: now - 7200_000, read: true,
      action: "/settings", actionLabel: "Add bio",
    });
  }
  if (!profile.country) {
    nudges.push({
      id: "nudge-region", kind: "profile",
      title: "Set your region",
      body: "See rooms and people from your area.",
      ts: now - 10800_000, read: true,
      action: "/settings", actionLabel: "Set region",
    });
  }
  if (score < 60) {
    const level = getTrustLevel(score);
    nudges.push({
      id: "nudge-trust", kind: "trust",
      title: `Trust score: ${score} — ${level.label}`,
      body: `Next level: ${level.nextLabel} (${level.nextThreshold}). ${level.tip}`,
      ts: now - 14400_000, read: true,
      action: "/trust-center", actionLabel: "Learn more",
    });
  }

  return nudges;
}

/* ── notification row ── */
function NotifRow({ n, onRead }: { n: Notif; onRead: (id: string) => void }) {
  const Icon = kindIcon(n.kind);
  const color = kindColor(n.kind);
  const isExternal = n.action?.startsWith("http");

  const inner = (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3.5 transition-colors active:scale-[0.99]",
        n.read ? "border-border bg-surface/60" : "border-primary/20 bg-primary/5",
      )}
      onClick={() => onRead(n.id)}
    >
      {/* Icon / Avatar */}
      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold", color)}>
        {n.avatar ? (
          <img src={n.avatar} alt={n.title} className="h-10 w-10 rounded-full object-cover" />
        ) : n.initials ? (
          <span>{n.initials}</span>
        ) : (
          <Icon className="h-4.5 w-4.5" />
        )}
      </div>
      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold leading-snug", !n.read && "text-primary")}>{n.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
        {n.action && n.actionLabel && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
            {n.actionLabel} <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </div>
      {/* Time + unread dot */}
      <div className="shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(n.ts)}</span>
        {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
      </div>
    </div>
  );

  if (n.action && isExternal) {
    return <a href={n.action} target="_blank" rel="noopener noreferrer">{inner}</a>;
  }
  if (n.action) {
    return <Link to={n.action}>{inner}</Link>;
  }
  return <div>{inner}</div>;
}

/* ── page ── */
export default function NotificationsPage() {
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [fetching, setFetching] = useState(true);
  const [readSet, setReadSet] = useState<Set<string>>(new Set());

  const trustScore = profile ? computeTrustScore(profile) : 0;

  const load = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    const token = localStorage.getItem("loop_token");
    const [followerNotifs, nudges] = await Promise.all([
      fetchFollowerNotifs(token),
      Promise.resolve(buildNudges(profile, trustScore)),
    ]);
    const all = [...followerNotifs, ...nudges].sort((a, b) => b.ts - a.ts);
    setNotifs(all);
    setFetching(false);
  }, [user, profile, trustScore]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const markRead = (id: string) => setReadSet((s) => new Set([...s, id]));
  const markAllRead = () => setReadSet(new Set(notifs.map((n) => n.id)));

  const displayed = notifs.map((n) => ({ ...n, read: n.read || readSet.has(n.id) }));
  const unread = displayed.filter((n) => !n.read).length;

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <AppShell>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg font-bold leading-tight">
              Notifications
              {unread > 0 && (
                <span className="ml-2 inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1.5">
                  {unread}
                </span>
              )}
            </h1>
          </div>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs font-semibold text-primary shrink-0"
            >
              Mark all read
            </button>
          )}
        </div>
      </header>

      <div className="px-5 py-4 space-y-2.5 pb-8">
        {/* Loading */}
        {fetching && (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!fetching && displayed.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
              <Bell className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-base font-semibold">Nothing yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs leading-relaxed">
                Join rooms, connect with people, and complete your profile to start seeing activity here.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Link
                to="/discover"
                className="flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
              >
                <Mic className="h-4 w-4" /> Discover rooms
              </Link>
              <Link
                to="/settings"
                className="flex items-center justify-center gap-2 h-11 rounded-xl bg-secondary text-sm font-semibold"
              >
                <Sparkles className="h-4 w-4" /> Complete profile
              </Link>
            </div>
          </div>
        )}

        {/* New */}
        {!fetching && unread > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">New</p>
            <div className="space-y-2">
              {displayed.filter((n) => !n.read).map((n) => (
                <NotifRow key={n.id} n={n} onRead={markRead} />
              ))}
            </div>
          </section>
        )}

        {/* Earlier */}
        {!fetching && displayed.filter((n) => n.read).length > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 mt-4">Earlier</p>
            <div className="space-y-2">
              {displayed.filter((n) => n.read).map((n) => (
                <NotifRow key={n.id} n={n} onRead={markRead} />
              ))}
            </div>
          </section>
        )}

        {/* Trust nudge banner */}
        {!fetching && profile && trustScore < 40 && (
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Build your trust score</p>
              <p className="text-xs text-muted-foreground mt-0.5">Complete your profile and join rooms to earn trust points and unlock more features.</p>
            </div>
            <Link to="/trust-center" className="shrink-0 text-xs text-primary font-semibold mt-0.5">
              Learn →
            </Link>
          </div>
        )}

        {/* Follower invite CTA */}
        {!fetching && (
          <div className="mt-2 rounded-2xl border border-border bg-surface p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <Users className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Grow your network</p>
              <p className="text-xs text-muted-foreground">Connect with people from your region.</p>
            </div>
            <Link to="/discover" className="shrink-0">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
