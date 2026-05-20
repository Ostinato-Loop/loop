import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  BadgeCheck, Bell, ChevronRight, Globe2,
  LogOut, Settings, Shield, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "from-emerald-500 to-teal-500",
  "from-fuchsia-500 to-purple-500",
  "from-amber-500 to-orange-500",
  "from-sky-500 to-blue-500",
  "from-rose-500 to-pink-500",
  "from-mint to-mint-glow",
];
function avatarColor(uid: string) {
  let n = 0;
  for (let i = 0; i < uid.length; i++) n += uid.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const SETTINGS = [
  { icon: Bell, label: "Notifications", sub: "Manage alerts & sounds" },
  { icon: Globe2, label: "Language & commentary", sub: "Preferred room language" },
  { icon: Shield, label: "Privacy", sub: "Who can see & follow you" },
  { icon: Settings, label: "Audio quality", sub: "Bandwidth & codec preferences" },
];

export default function MePage() {
  const { user, loading, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  if (!profile || !user) return null;

  const color = avatarColor(user.id);
  const name = profile.display_name ?? "You";

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login");
    } finally {
      setSigningOut(false);
    }
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
              {profile.is_creator && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            </h1>
            <p className="text-xs text-muted-foreground">@{profile.username ?? "set-a-handle"}</p>
            {profile.bio && (
              <p className="mt-1 max-w-[200px] text-xs leading-snug text-muted-foreground line-clamp-2">{profile.bio}</p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl bg-surface">
          {[["0", "Rooms"], ["0", "Followers"], ["0", "Following"]].map(([v, l]) => (
            <div key={l} className="py-3 text-center">
              <p className="font-display text-xl font-bold">{v}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>

        {/* Interests */}
        {profile.interests && profile.interests.length > 0 && (
          <div className="mt-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Interests</h2>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((i) => (
                <span
                  key={i}
                  className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  {i}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Settings list */}
        <h2 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Settings</h2>
        <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
          {SETTINGS.map(({ icon: Icon, label, sub }, idx) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                idx < SETTINGS.length - 1 && "border-b border-border",
              )}
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-surface-elev">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-[11px] text-muted-foreground">{sub}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            </li>
          ))}
        </ul>

        {/* Sign out */}
        <Button
          onClick={handleSignOut}
          disabled={signingOut}
          variant="secondary"
          className="mb-8 mt-5 h-12 w-full rounded-xl"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </AppShell>
  );
}
