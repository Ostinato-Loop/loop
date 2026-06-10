/**
 * Loop — Me (Profile) Page
 * PUSH-001 (2026-06-10): Added PushPromptBanner; fixed followers_count mapping.
 * FOLLOWS-001: Follower/Following counts fetched from /api/follows/me/counts.
 * LILCKY STUDIO LIMITED
 */
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/api-fetch";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PushPromptBanner } from "@/hooks/use-push";
import {
  BadgeCheck, Bell, ChevronRight, Globe2,
  LogOut, MapPin, Settings, Shield, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLocation } from "@/lib/regions-data";

const AVATAR_COLORS = [
  "from-emerald-500 to-teal-500","from-fuchsia-500 to-purple-500",
  "from-amber-500 to-orange-500","from-sky-500 to-blue-500",
  "from-rose-500 to-pink-500","from-mint to-mint-glow",
];
function avatarColor(uid: string) {
  let n = 0; for (let i = 0; i < uid.length; i++) n += uid.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

const SETTINGS_ITEMS = [
  { icon: Bell,     label: "Notifications",           sub: "Manage alerts & sounds" },
  { icon: Globe2,   label: "Language & commentary",   sub: "Preferred room language" },
  { icon: Shield,   label: "Privacy",                 sub: "Who can see & follow you" },
  { icon: Settings, label: "Audio quality",           sub: "Bandwidth & codec preferences" },
];

type ProfileCounts = { followers: number; following: number };

export default function MePage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [counts, setCounts] = useState<ProfileCounts>({ followers: 0, following: 0 });

  // Auth gate now handled by ProtectedRoute in App.tsx

  useEffect(() => {
    if (!user) return;
    authFetch("/api/follows/me/counts")
      .then(r => r.ok ? r.json() as Promise<{ followers_count: number; following_count: number }> : Promise.reject())
      .then(data => setCounts({
        followers: data.followers_count ?? 0,
        following: data.following_count ?? 0,
      }))
      .catch(() => {});
  }, [user]);

  if (!profile || !user) return null;

  const color    = avatarColor(user.id);
  const name     = profile.display_name ?? "You";
  const location = formatLocation(profile);

  const handleSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); navigate("/login"); }
    finally { setSigningOut(false); }
  };

  return (
    <AppShell>
      {/* Cover gradient */}
      <div className="relative h-36 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--mint)_0%,transparent_65%)] opacity-20" />
      </div>

      <div className="-mt-14 px-5">
        {/* Avatar + name */}
        <div className="flex items-end gap-4">
          <div className={cn(
            "h-24 w-24 rounded-2xl border-4 border-background bg-gradient-to-br flex items-center justify-center font-display text-2xl font-bold text-white shadow-lg",
            color,
          )}>
            {initials(name)}
          </div>
          <div className="pb-2 min-w-0">
            <h1 className="flex items-center gap-1.5 font-display text-xl font-bold">
              <span className="truncate">{name}</span>
              {profile.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />}
              {profile.is_creator  && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            </h1>
            <p className="text-xs text-muted-foreground">@{profile.username ?? "set-a-handle"}</p>

            {/* ── Location badge ─────────────────────────────────── */}
            {location ? (
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="mt-1.5 flex items-center gap-1 rounded-full border border-primary/25 bg-primary/8 px-2.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/15 transition-colors"
                aria-label="Edit location"
              >
                <MapPin className="h-3 w-3 shrink-0" />
                {location}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="mt-1.5 flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/30 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                aria-label="Add location"
              >
                <MapPin className="h-3 w-3 shrink-0" />
                Add your location
              </button>
            )}

            {profile.bio && (
              <p className="mt-1.5 max-w-[200px] text-xs leading-snug text-muted-foreground line-clamp-2">{profile.bio}</p>
            )}
          </div>
        </div>

        {/* Stats row — tappable to navigate to followers/following lists when built */}
        <div className="mt-5 grid grid-cols-2 divide-x divide-border overflow-hidden rounded-2xl bg-surface">
          {([
            [counts.followers, "Followers"],
            [counts.following, "Following"],
          ] as [number, string][]).map(([v, l]) => (
            <div key={l} className="py-3 text-center">
              <p className="font-display text-xl font-bold">{v}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>

        {/* Push notification prompt — shown if not yet enabled */}
        <PushPromptBanner className="mt-4" />

        {/* Interests */}
        {profile.interests && profile.interests.length > 0 && (
          <div className="mt-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Interests</h2>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map(i => (
                <span key={i} className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {i}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Settings list */}
        <h2 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Settings</h2>
        <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
          {SETTINGS_ITEMS.map(({ icon: Icon, label, sub }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate("/settings")}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/60 transition-colors"
            >
              <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground truncate">{sub}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>

        {/* Sign out */}
        <div className="mt-6 mb-8">
          <Button
            variant="outline"
            className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
