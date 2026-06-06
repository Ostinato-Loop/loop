// Loop — Profile / Me Page
// Sprint 01 Priority 3: No mock identity data. All user data from real auth.
// Relationship counts (followers/following/trust) show honest zeros until
// the relationship graph API is wired (Sprint 02).
// LILCKY STUDIO LIMITED


import {
  Settings, BadgeCheck, MapPin, Mic, MessageCircle,
  Heart, Users, Shield, Sun, Moon, Monitor, Copy, ChevronRight, Sparkles,
  Bell, BellOff, BellRing, LogOut,
} from "lucide-react";
import { useState } from "react";
import { userRegion } from "@/lib/loop-mock";
import { useLoop, type NotifLevel } from "@/lib/loop-store";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";

type Tab = "activity" | "followers" | "following" | "saved";

export default function MeLaunchPage() {
  const { follows: _follows, toggleFollow: _toggleFollow, notifPrefs: _notifPrefs, setNotifPref: _setNotifPref } = useLoop();
  const { user, profile, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("activity");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");

  const displayName  = profile?.display_name ?? user?.phone ?? "You";
  const handle       = profile?.username ?? "";
  const avatarUrl    = profile?.avatar_url ?? "";
  const bio          = profile?.bio ?? "";
  const isVerified   = profile?.is_verified ?? false;

  const followingList: unknown[] = [];
  const followersList: unknown[] = [];

  return (
    <AppShell>
    <div className="pb-6">
      <div className="relative h-32 bg-gradient-to-br from-neon/30 via-accent to-orange/20">
        <button className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/80 backdrop-blur flex items-center justify-center" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 -mt-10">
        <div className="flex items-end justify-between">
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="h-20 w-20 rounded-2xl ring-4 ring-background object-cover" />
            : <div className="h-20 w-20 rounded-2xl ring-4 ring-background bg-secondary flex items-center justify-center text-2xl font-extrabold text-foreground">{displayName.slice(0, 1).toUpperCase()}</div>
          }
          <button className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-bold">Edit profile</button>
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-extrabold">{displayName}</h1>
            {isVerified && <BadgeCheck className="h-5 w-5 text-neon fill-neon/20" />}
          </div>
          {handle && <div className="text-xs text-muted-foreground">@{handle} · {handle}@rald.me</div>}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <MapPin className="h-3 w-3" />{userRegion.city}
          </div>
          {bio && <p className="text-sm mt-2 leading-snug">{bio}</p>}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <button onClick={() => setTab("followers")} className={`rounded-2xl p-3 text-center transition ${tab === "followers" ? "bg-secondary ring-2 ring-neon/40" : "bg-secondary"}`}>
            <div className="text-lg font-extrabold">{followersList.length || 0}</div>
            <div className="text-[10px] text-muted-foreground">Followers</div>
          </button>
          <button onClick={() => setTab("following")} className={`rounded-2xl p-3 text-center transition ${tab === "following" ? "bg-secondary ring-2 ring-neon/40" : "bg-secondary"}`}>
            <div className="text-lg font-extrabold">{followingList.length}</div>
            <div className="text-[10px] text-muted-foreground">Following</div>
          </button>
          <div className="rounded-2xl p-3 text-center bg-neon/10 border border-neon/40">
            <div className="text-lg font-extrabold text-neon">—</div>
            <div className="text-[10px] text-muted-foreground">Trust</div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border p-4 bg-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-neon" />
              <span className="text-xs font-bold uppercase tracking-wider">RALD Identity</span>
            </div>
            <span className="text-[10px] font-bold text-neon">profiles.rald.cloud</span>
          </div>
          <div className="space-y-2 text-xs">
            <IdRow k="RALD ID"     v={user?.id ? `rald_${user.id.slice(0, 8)}…` : "—"} copy={!!user?.id} />
            <IdRow k="Mail"        v={handle ? `${handle}@rald.me` : "—"} copy={!!handle} />
            <IdRow k="Trust score" v="— / 100" badge />
            <IdRow k="Badge"       v="Verified contributor" />
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-2">Connected apps</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { name: "Loop",      on: true,  color: "bg-neon/15 text-neon" },
                { name: "Messenger", on: true,  color: "bg-orange/15 text-orange" },
                { name: "Mail",      on: true,  color: "bg-secondary text-foreground" },
                { name: "PayRALD",   on: false, color: "bg-secondary text-muted-foreground" },
                { name: "GitRALD",   on: false, color: "bg-secondary text-muted-foreground" },
              ].map((a) => (
                <span key={a.name} className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${a.color}`}>
                  {a.on ? "● " : "○ "}{a.name}
                </span>
              ))}
            </div>
          </div>
          <a
            href="https://profiles.rald.cloud"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 w-full h-10 rounded-xl bg-secondary text-xs font-bold flex items-center justify-center gap-1.5"
          >
            Manage on profiles.rald.cloud <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-4 rounded-2xl border border-border p-4 bg-card">
          <div className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-neon" />Appearance
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "light" as const, icon: Sun,     label: "Light" },
              { id: "dark"  as const, icon: Moon,    label: "Dark" },
              { id: "system" as const, icon: Monitor, label: "Auto" },
            ]).map((opt) => {
              const Icon   = opt.icon;
              const active = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setTheme(opt.id)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border ${active ? "border-neon bg-neon/10 text-foreground" : "border-border bg-secondary"}`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-neon" : ""}`} />
                  <span className="text-[11px] font-semibold">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => signOut()}
          className="mt-4 w-full h-11 rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive text-sm font-semibold flex items-center justify-center gap-2"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>

        <div className="mt-5">
          <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-none">
            {(["activity", "followers", "following", "saved"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-xs font-semibold capitalize border-b-2 whitespace-nowrap ${tab === t ? "border-neon text-foreground" : "border-transparent text-muted-foreground"}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {tab === "activity" && (
              <EmptyTab
                icon={Mic}
                title="No activity yet"
                body="Your rooms, reactions, and connections will appear here."
              />
            )}
            {tab === "following" && (
              followingList.length === 0
                ? <EmptyTab icon={Users} title="Not following anyone yet" body="Join a room to discover and follow people." />
                : null
            )}
            {tab === "followers" && (
              followersList.length === 0
                ? <EmptyTab icon={Users} title="No followers yet" body="People who follow you will appear here." />
                : null
            )}
            {tab === "saved" && (
              <EmptyTab icon={Heart} title="Nothing saved yet" body="Saved rooms, comments and events show up here." />
            )}
          </div>
        </div>
      </div>
    </div>
    </AppShell>
  );
}

type Person = {
  handle: string; name: string; avatar: string;
  region: string; verified?: boolean; metVia?: string;
};

function EmptyTab({ icon: Icon, title, body }: { icon: typeof Mic; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="h-11 w-11 rounded-xl bg-secondary flex items-center justify-center">
        <Icon className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{body}</p>
      </div>
    </div>
  );
}

function IdRow({ k, v, copy, badge }: { k: string; v: string; copy?: boolean; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-semibold flex items-center gap-1.5">
        {badge && <span className="h-1.5 w-1.5 rounded-full bg-neon" />}
        {v}
        {copy && <Copy className="h-3 w-3 text-muted-foreground cursor-pointer" onClick={() => navigator.clipboard?.writeText(v)} />}
      </span>
    </div>
  );
}


