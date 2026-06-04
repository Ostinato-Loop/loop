// Loop — Profile / Me Page (Launch UI)
// Adopted from loop-audio-ui-ux reference design with RALD Identity section.
// Adapted for React Router DOM.
// LILCKY STUDIO LIMITED

import { Link } from "react-router-dom";
import {
  Settings, BadgeCheck, MapPin, Mic, MessageCircle,
  Heart, Users, Shield, Sun, Moon, Monitor, Copy, ChevronRight, Sparkles,
  Bell, BellOff, BellRing, LogOut,
} from "lucide-react";
import { useState } from "react";
import { me, people } from "@/lib/loop-mock";
import { useLoop, type NotifLevel } from "@/lib/loop-store";
import { useAuth } from "@/hooks/use-auth";

type Tab = "activity" | "followers" | "following" | "saved";

export default function MeLaunchPage() {
  const { follows, toggleFollow, notifPrefs, setNotifPref } = useLoop();
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("activity");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");

  const followingList = people.filter((p) => follows[p.handle]);
  const followersList = people.filter((p) => !follows[p.handle]).concat(people.slice(0, 2));

  return (
    <div className="pb-24">
      <div className="relative h-32 bg-gradient-to-br from-neon/30 via-accent to-orange/20">
        <button className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/80 backdrop-blur flex items-center justify-center" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 -mt-10">
        <div className="flex items-end justify-between">
          <img src={me.avatar} alt="" className="h-20 w-20 rounded-2xl ring-4 ring-background object-cover" />
          <button className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-bold">Edit profile</button>
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-extrabold">{me.name}</h1>
            <BadgeCheck className="h-5 w-5 text-neon fill-neon/20" />
          </div>
          <div className="text-xs text-muted-foreground">@{me.handle} · {me.handle}@rald.me</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <MapPin className="h-3 w-3" />{me.region}
          </div>
          <p className="text-sm mt-2 leading-snug">{me.bio}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <button onClick={() => setTab("followers")} className={`rounded-2xl p-3 text-center transition ${tab === "followers" ? "bg-secondary ring-2 ring-neon/40" : "bg-secondary"}`}>
            <div className="text-lg font-extrabold">{fmt(me.followers)}</div>
            <div className="text-[10px] text-muted-foreground">Followers</div>
          </button>
          <button onClick={() => setTab("following")} className={`rounded-2xl p-3 text-center transition ${tab === "following" ? "bg-secondary ring-2 ring-neon/40" : "bg-secondary"}`}>
            <div className="text-lg font-extrabold">{followingList.length || me.following}</div>
            <div className="text-[10px] text-muted-foreground">Following</div>
          </button>
          <div className="rounded-2xl p-3 text-center bg-neon/10 border border-neon/40">
            <div className="text-lg font-extrabold text-neon">{me.trust}</div>
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
            <IdRow k="RALD ID"     v="rald_8f2c…a91" copy />
            <IdRow k="Mail"        v={`${me.handle}@rald.me`} copy />
            <IdRow k="Trust score" v={`${me.trust} / 100`} badge />
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
              <>
                <Activity icon={Mic}           text="Spoke in Lagos Traffic Reform" meta="2h · 38 reactions" />
                <Activity icon={MessageCircle} text="Top comment in Afrobeats Room" meta="Yesterday · 412 likes" />
                <Activity icon={Heart}         text="Joined University of Lagos room" meta="Mon" />
                <Activity icon={Users}         text="Connected with Wanjiku M." meta="From Nairobi Devs Room" />
              </>
            )}
            {tab === "following" && (followingList.length ? followingList : people.slice(0, 3)).map((p) => (
              <PersonRow key={p.handle} p={p} following={!!follows[p.handle]} onToggle={() => toggleFollow(p.handle)} notifLevel={notifPrefs[p.handle] ?? "all"} onNotif={(l) => setNotifPref(p.handle, l)} showNotif />
            ))}
            {tab === "followers" && followersList.slice(0, 6).map((p) => (
              <PersonRow key={p.handle + "f"} p={p} following={!!follows[p.handle]} onToggle={() => toggleFollow(p.handle)} notifLevel={notifPrefs[p.handle] ?? "all"} onNotif={(l) => setNotifPref(p.handle, l)} />
            ))}
            {tab === "saved" && (
              <div className="text-center text-xs text-muted-foreground py-10">Saved rooms, comments and events show up here.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonRow({ p, following, onToggle, notifLevel, onNotif, showNotif }: {
  p: typeof people[number];
  following: boolean;
  onToggle: () => void;
  notifLevel: NotifLevel;
  onNotif: (l: NotifLevel) => void;
  showNotif?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const NIcon = notifLevel === "off" ? BellOff : notifLevel === "all" ? BellRing : Bell;
  return (
    <div className="rounded-2xl bg-card border border-border">
      <div className="flex items-center gap-3 p-3">
        <img src={p.avatar} alt="" className="h-11 w-11 rounded-full" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold truncate">{p.name}</span>
            {p.verified && <BadgeCheck className="h-3.5 w-3.5 text-neon shrink-0" />}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{p.region}</div>
          {p.metVia && <div className="text-[10px] text-neon font-semibold mt-0.5">↺ {p.metVia}</div>}
        </div>
        {showNotif && following && (
          <button onClick={() => setOpen((v) => !v)} className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${notifLevel === "off" ? "bg-secondary text-muted-foreground" : "bg-neon/15 text-neon"}`} aria-label="Notifications">
            <NIcon className="h-4 w-4" />
          </button>
        )}
        <button onClick={onToggle} className={`px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 ${following ? "bg-secondary text-foreground" : "bg-neon text-neon-foreground"}`}>
          {following ? "Following" : "Follow"}
        </button>
      </div>
      {showNotif && following && open && (
        <div className="px-3 pb-3 border-t border-border pt-3">
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-2">
            Notify me about {p.name.split(" ")[0]}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {([
              { id: "all" as NotifLevel,   label: "Everything", I: BellRing },
              { id: "rooms" as NotifLevel, label: "Rooms only", I: Mic },
              { id: "posts" as NotifLevel, label: "Posts",      I: MessageCircle },
              { id: "off" as NotifLevel,   label: "Muted",      I: BellOff },
            ]).map(({ id, label, I }) => {
              const active = notifLevel === id;
              return (
                <button key={id} onClick={() => onNotif(id)} className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] font-semibold ${active ? "border-neon bg-neon/10 text-foreground" : "border-border bg-secondary text-muted-foreground"}`}>
                  <I className={`h-3.5 w-3.5 ${active ? "text-neon" : ""}`} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
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

function Activity({ icon: Icon, text, meta }: { icon: typeof Mic; text: string; meta: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
      <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center">
        <Icon className="h-4 w-4 text-neon" />
      </div>
      <div className="flex-1">
        <div className="text-xs font-semibold">{text}</div>
        <div className="text-[10px] text-muted-foreground">{meta}</div>
      </div>
    </div>
  );
}

function fmt(n: number) { return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }
