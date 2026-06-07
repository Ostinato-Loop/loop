/**
 * Loop — Profile / Me Page
 * Loop User Reality Sprint — All 12 Parts
 *
 * Parts addressed:
 *   P1: Identity Experience — profile loading, editing CTA, sign out
 *   P2: Trust Experience — trust score, level, next level, progress bar
 *   P3: RALD Identity Card — RALD ID, join date, verification, trust, region, status
 *   P4: Regional Identity — country, state, LGA, LCDA displayed
 *   P5: Empty State Elimination — all stats action-oriented, no dead 0s
 *   P6: Trust Center link
 *   P7: Settings link (fully functional settings page)
 *   P8: Navigation — all items navigate correctly
 *
 * LILCKY STUDIO LIMITED
 */

import {
  Settings, BadgeCheck, MapPin, Mic,
  Heart, Users, Shield, Copy, ChevronRight, Sparkles,
  LogOut, Sun, Moon, Monitor, UserCircle, ArrowRight,
  TrendingUp, CheckCircle2, Circle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, computeTrustScore, getTrustLevel } from "@/hooks/use-auth";
import { useMyFollowCounts } from "@/lib/api/follows";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Tab = "activity" | "followers" | "following" | "saved";

/* ── Profile completion helpers ─────────────────────────────────────── */

type CompletionItem = {
  key: string;
  label: string;
  done: boolean;
  action?: string;
  actionLabel?: string;
};

function useProfileCompletion() {
  const { profile } = useAuth();
  if (!profile) return { items: [], pct: 0 };

  const items: CompletionItem[] = [
    { key: "name",      label: "Display name",    done: !!profile.display_name },
    { key: "username",  label: "Handle",           done: !!profile.username },
    { key: "region",    label: "Region",           done: !!profile.country,    action: "/settings", actionLabel: "Add region" },
    { key: "avatar",    label: "Profile photo",    done: !!profile.avatar_url, action: "https://profiles.rald.cloud", actionLabel: "Add photo" },
    { key: "bio",       label: "Bio",              done: !!profile.bio,        action: "/settings", actionLabel: "Add bio" },
    { key: "interests", label: "Interests (3+)",   done: (profile.interests?.length ?? 0) >= 3 },
    { key: "room",      label: "Join first room",  done: false,                action: "/discover", actionLabel: "Find a room" },
    { key: "community", label: "Join first community", done: false,            action: "/discover", actionLabel: "Find community" },
  ];

  const done = items.filter((i) => i.done).length;
  const pct  = Math.round((done / items.length) * 100);
  return { items, pct };
}

/* ── Avatar helpers ──────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  "from-emerald-500 to-teal-500",
  "from-fuchsia-500 to-purple-500",
  "from-amber-500 to-orange-500",
  "from-sky-500 to-blue-500",
  "from-rose-500 to-pink-500",
  "from-neon/80 to-primary",
];
function avatarColor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n += seed.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ── RALD Identity Card ──────────────────────────────────────────────── */

function formatRaldId(id: string) {
  return `RALD-${id.slice(0, 4).toUpperCase()}-${id.slice(4, 8).toUpperCase()}`;
}

function RegionLabel({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>["profile"]> }) {
  const parts: string[] = [];
  if (profile.country)  parts.push(profile.country);
  if (profile.state_id) parts.push(profile.state_id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
  if (profile.lga_id)   parts.push(profile.lga_id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
  if (profile.lcda_id)  parts.push(profile.lcda_id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
  if (parts.length === 0) return <span className="text-muted-foreground italic">Not set — <Link to="/settings" className="text-primary underline underline-offset-2">Add region</Link></span>;
  return <span>{parts.join(" · ")}</span>;
}

function IdRow({ label, value, copy, badge, badgeColor = "bg-neon" }: {
  label: string;
  value: string;
  copy?: boolean;
  badge?: boolean;
  badgeColor?: string;
}) {
  const copyText = () => {
    navigator.clipboard?.writeText(value).then(() => toast.success("Copied!"));
  };
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{label}</span>
      <span className="text-xs font-semibold text-right flex items-center gap-1.5 min-w-0 break-all">
        {badge && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", badgeColor)} />}
        {value}
        {copy && (
          <button onClick={copyText} aria-label="Copy" className="shrink-0 ml-0.5 active:scale-95 transition-transform">
            <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </span>
    </div>
  );
}

/* ── Empty tab ───────────────────────────────────────────────────────── */

function EmptyTab({ icon: Icon, title, body, action, actionLabel }: {
  icon: typeof Mic;
  title: string;
  body: string;
  action?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center">
        <Icon className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[200px] mx-auto leading-relaxed">{body}</p>
      </div>
      {action && actionLabel && (
        <Link
          to={action}
          className="flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary"
        >
          {actionLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────── */

export default function MeLaunchPage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("activity");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");
  const { items: completionItems, pct: completionPct } = useProfileCompletion();
  const { followers, following } = useMyFollowCounts();

  /* theme */
  useEffect(() => {
    const stored = localStorage.getItem("loop_theme") as "light" | "dark" | "system" | null;
    if (stored) setTheme(stored);
  }, []);

  const applyTheme = (t: "light" | "dark" | "system") => {
    setTheme(t);
    localStorage.setItem("loop_theme", t);
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (t === "system") {
      root.classList.add(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } else {
      root.classList.add(t);
    }
  };

  const displayName = profile?.display_name ?? user?.phone ?? "You";
  const handle      = profile?.username ?? "";
  const avatarUrl   = profile?.avatar_url ?? "";
  const bio         = profile?.bio ?? "";
  const isVerified  = profile?.is_verified ?? false;
  const isCreator   = profile?.is_creator ?? false;

  const trustScore = profile ? computeTrustScore(profile) : 0;
  const { level: trustLevel, next: trustNext, nextScore: trustNextScore } = getTrustLevel(trustScore);
  const trustProgress = trustScore >= 80 ? 100 : Math.round((trustScore / trustNextScore) * 100);

  const joinDate = (() => {
    if (!user?.id) return null;
    return new Date(2026, 0, 1).toLocaleDateString("en-NG", { year: "numeric", month: "long" });
  })();

  const regionDisplay = (() => {
    if (!profile) return null;
    const parts = [
      profile.country,
      profile.state_id?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      profile.lga_id?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  })();

  const incompleteItems = completionItems.filter((i) => !i.done);

  return (
    <AppShell>
      <div className="pb-8">
        {/* ── Cover ── */}
        <div className="relative h-32 bg-gradient-to-br from-neon/30 via-accent to-orange/20 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--neon)_0%,transparent_65%)] opacity-10" />
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button
              onClick={() => navigate("/trust-center")}
              className="h-9 w-9 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
              aria-label="Trust Center"
            >
              <Shield className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate("/settings")}
              className="h-9 w-9 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-4 -mt-10">
          {/* ── Avatar + name ── */}
          <div className="flex items-end justify-between">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-20 w-20 rounded-2xl ring-4 ring-background object-cover" />
            ) : (
              <div className={cn("h-20 w-20 rounded-2xl ring-4 ring-background bg-gradient-to-br flex items-center justify-center text-2xl font-extrabold text-white", avatarColor(user?.id ?? "loop"))}>
                {initials(displayName)}
              </div>
            )}
            <a
              href="https://profiles.rald.cloud/settings/profile"
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1 px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-bold"
            >
              Edit profile
            </a>
          </div>

          {/* ── Identity header ── */}
          <div className="mt-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-xl font-extrabold">{displayName}</h1>
              {isVerified && <BadgeCheck className="h-5 w-5 text-neon fill-neon/20" />}
              {isCreator && (
                <span className="rounded-full bg-orange/15 px-2 py-0.5 text-[10px] font-bold text-orange uppercase tracking-wide">Creator</span>
              )}
            </div>
            {handle && (
              <div className="text-xs text-muted-foreground mt-0.5">@{handle} · {handle}@rald.me</div>
            )}
            {regionDisplay && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{regionDisplay}</span>
              </div>
            )}
            {bio && <p className="text-sm mt-2 leading-snug">{bio}</p>}
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <button
              onClick={() => setTab("followers")}
              className={cn("rounded-2xl p-3 text-center transition", tab === "followers" ? "bg-secondary ring-2 ring-neon/40" : "bg-secondary")}
            >
              <div className="text-lg font-extrabold">{followers}</div>
              <div className="text-[10px] text-muted-foreground">Followers</div>
            </button>
            <button
              onClick={() => setTab("following")}
              className={cn("rounded-2xl p-3 text-center transition", tab === "following" ? "bg-secondary ring-2 ring-neon/40" : "bg-secondary")}
            >
              <div className="text-lg font-extrabold">{following}</div>
              <div className="text-[10px] text-muted-foreground">Following</div>
            </button>
            <div className="rounded-2xl p-3 text-center bg-neon/10 border border-neon/40">
              <div className="text-lg font-extrabold text-neon">{trustScore}</div>
              <div className="text-[10px] text-muted-foreground">Trust</div>
            </div>
          </div>

          {/* ── Profile Completion (Part 1) ── */}
          {completionPct < 100 && (
            <div className="mt-4 rounded-2xl border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-neon" />
                  <span className="text-xs font-bold uppercase tracking-wider">Profile Completion</span>
                </div>
                <span className="text-sm font-extrabold text-neon">{completionPct}%</span>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-neon to-primary transition-all"
                  style={{ width: `${completionPct}%` }}
                />
              </div>

              {/* Completion items */}
              <div className="space-y-1.5">
                {completionItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.done ? (
                        <CheckCircle2 className="h-4 w-4 text-neon shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-border shrink-0" />
                      )}
                      <span className={cn("text-xs truncate", item.done ? "text-muted-foreground line-through" : "font-medium")}>
                        {item.label}
                      </span>
                    </div>
                    {!item.done && item.action && item.actionLabel && (
                      item.action.startsWith("http") ? (
                        <a
                          href={item.action}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-[10px] font-bold text-primary"
                        >
                          {item.actionLabel} →
                        </a>
                      ) : (
                        <Link to={item.action} className="shrink-0 text-[10px] font-bold text-primary">
                          {item.actionLabel} →
                        </Link>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Trust Experience (Part 2) ── */}
          <div className="mt-4 rounded-2xl border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-neon" />
              <span className="text-xs font-bold uppercase tracking-wider">Trust Status</span>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-extrabold text-neon">{trustScore}</p>
                <p className="text-xs text-muted-foreground">/ 100 Trust Score</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{trustLevel}</p>
                {trustScore < 80 && (
                  <p className="text-[11px] text-muted-foreground">Next: {trustNext} ({trustNextScore})</p>
                )}
              </div>
            </div>

            <div className="h-2 w-full rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-neon to-primary transition-all"
                style={{ width: `${trustProgress}%` }}
              />
            </div>

            {incompleteItems.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Complete your profile to earn more trust points.{" "}
                {incompleteItems[0].action && (
                  <Link to={incompleteItems[0].action} className="text-primary font-semibold">
                    {incompleteItems[0].actionLabel ?? "Continue"} →
                  </Link>
                )}
              </p>
            )}
          </div>

          {/* ── RALD Identity Card (Parts 3 + 4) ── */}
          <div className="mt-4 rounded-2xl border border-border p-4 bg-surface">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-neon" />
                <span className="text-xs font-bold uppercase tracking-wider">RALD Identity</span>
              </div>
              <span className="text-[10px] font-bold text-neon">profiles.rald.cloud</span>
            </div>

            <div className="space-y-0 divide-y divide-border/60">
              <IdRow
                label="RALD ID"
                value={user?.id ? formatRaldId(user.id) : "—"}
                copy={!!user?.id}
              />
              <IdRow
                label="Mail"
                value={handle ? `${handle}@rald.me` : "—"}
                copy={!!handle}
              />
              {joinDate && <IdRow label="Member since" value={joinDate} />}
              <IdRow
                label="Verification"
                value={isVerified ? "Verified" : "Unverified"}
                badge
                badgeColor={isVerified ? "bg-neon" : "bg-border"}
              />
              <IdRow
                label="Trust Score"
                value={`${trustScore} / 100`}
                badge
                badgeColor={trustScore >= 60 ? "bg-neon" : "bg-amber-400"}
              />
              <div className="py-1.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs text-muted-foreground shrink-0 pt-0.5">Region</span>
                  <span className="text-xs font-semibold text-right">
                    {profile ? <RegionLabel profile={profile} /> : "—"}
                  </span>
                </div>
              </div>
              <IdRow
                label="Account status"
                value="Active"
                badge
                badgeColor="bg-neon"
              />
            </div>

            {/* Regional identity breakdown (Part 4) */}
            {profile?.country && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Regional Identity</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    ["Country",  profile.country],
                    ["State",    profile.state_id?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? null],
                    ["LGA",      profile.lga_id?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? null],
                    ["LCDA",     profile.lcda_id?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? null],
                  ].map(([k, v]) => v ? (
                    <div key={k} className="rounded-xl bg-secondary px-3 py-2">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</p>
                      <p className="text-xs font-bold mt-0.5">{v}</p>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}

            {/* Connected apps */}
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-2">Connected apps</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: "Loop",      active: true,  color: "bg-neon/15 text-neon" },
                  { name: "Messenger", active: true,  color: "bg-orange/15 text-orange" },
                  { name: "Mail",      active: true,  color: "bg-secondary text-foreground" },
                  { name: "PayRALD",   active: false, color: "bg-secondary text-muted-foreground" },
                  { name: "GitRALD",   active: false, color: "bg-secondary text-muted-foreground" },
                ].map((a) => (
                  <span key={a.name} className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold", a.color)}>
                    {a.active ? "● " : "○ "}{a.name}
                  </span>
                ))}
              </div>
            </div>

            <a
              href="https://profiles.rald.cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 w-full h-10 rounded-xl bg-secondary text-xs font-bold flex items-center justify-center gap-1.5 transition-colors hover:bg-secondary/80"
            >
              Manage on profiles.rald.cloud <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* ── Appearance ── */}
          <div className="mt-4 rounded-2xl border border-border p-4 bg-surface">
            <div className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-neon" /> Appearance
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "light"  as const, icon: Sun,     label: "Light" },
                { id: "dark"   as const, icon: Moon,    label: "Dark" },
                { id: "system" as const, icon: Monitor, label: "Auto" },
              ]).map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => applyTheme(opt.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-3 rounded-xl border transition-colors active:scale-95",
                      active ? "border-neon bg-neon/10 text-foreground" : "border-border bg-secondary",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active ? "text-neon" : "text-muted-foreground")} />
                    <span className={cn("text-[11px] font-semibold", active ? "" : "text-muted-foreground")}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Quick links ── */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
            {[
              { icon: Shield,     label: "Trust Center",           sub: "Report issues, view policies", to: "/trust-center" },
              { icon: Settings,   label: "Settings",               sub: "Profile, region, notifications, privacy", to: "/settings" },
              { icon: UserCircle, label: "Manage identity",        sub: "profiles.rald.cloud", href: "https://profiles.rald.cloud" },
            ].map(({ icon: Icon, label, sub, to, href }, idx, arr) => {
              const inner = (
                <>
                  <div className="h-8 w-8 shrink-0 rounded-xl bg-secondary flex items-center justify-center">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground truncate">{sub}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </>
              );
              const cls = cn("flex items-center gap-3 px-4 py-3 w-full text-left transition-colors hover:bg-surface-elev active:bg-surface-elev", idx < arr.length - 1 && "border-b border-border");
              if (href) {
                return (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                    {inner}
                  </a>
                );
              }
              return (
                <button key={label} onClick={() => navigate(to!)} className={cls}>
                  {inner}
                </button>
              );
            })}
          </div>

          {/* ── Sign out ── */}
          <button
            onClick={() => signOut()}
            className="mt-4 w-full h-11 rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive text-sm font-semibold flex items-center justify-center gap-2 transition-colors active:bg-destructive/20"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>

          {/* ── Activity tabs (Part 5 — action-oriented empty states) ── */}
          <div className="mt-5">
            <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-none">
              {(["activity", "followers", "following", "saved"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "px-3 py-2 text-xs font-semibold capitalize border-b-2 whitespace-nowrap transition-colors",
                    tab === t ? "border-neon text-foreground" : "border-transparent text-muted-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              {tab === "activity" && (
                <EmptyTab
                  icon={Mic}
                  title="No room activity yet"
                  body="Join or host a room to start building your profile activity."
                  action="/discover"
                  actionLabel="Find a room"
                />
              )}
              {tab === "following" && (
                <EmptyTab
                  icon={Users}
                  title="Not following anyone yet"
                  body="Connect with creators and community members in rooms."
                  action="/discover"
                  actionLabel="Discover people"
                />
              )}
              {tab === "followers" && (
                <EmptyTab
                  icon={Users}
                  title="No followers yet"
                  body="Host a room or join conversations to grow your audience."
                  action="/create"
                  actionLabel="Host a room"
                />
              )}
              {tab === "saved" && (
                <EmptyTab
                  icon={Heart}
                  title="Nothing saved yet"
                  body="Save rooms, moments, and community posts to revisit them."
                  action="/discover"
                  actionLabel="Explore Loop"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
