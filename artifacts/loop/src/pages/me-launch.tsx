// Loop — Profile / Me Page
// Progressive Trust: Edit Profile is now functional (display_name, bio, username).
// Relationship counts show honest zeros until the graph API ships.
//
// IDENTITY-002 (2026-06-12): Progressive identity collection.
//   - useProgressiveIdentity() fetches RALD intelligence on mount.
//   - Profile completion nudge card shown when bio or display_name is missing.
//   - Tapping a nudge opens IdentityPromptSheet — saves to Supabase + syncs to RALD.
//   - Edit profile form pre-fills bio/name from RALD if Loop profile is empty.
//   - saveEdit now syncs each changed field back to RALD Intelligence.
//
// LILCKY STUDIO LIMITED

import {
  Settings, BadgeCheck, MapPin, Mic,
  Heart, Users, Shield, Sun, Moon, Monitor, Copy, ChevronRight, Sparkles,
  LogOut, Pencil, X, Loader2, Check, CircleUser,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLoop } from "@/lib/loop-store";
import { useAuth } from "@/hooks/use-auth";
import { authedSupabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";
import { useNavigate } from "react-router-dom";
import { NotificationPrompt } from "@/components/notification-prompt";
import { getMyFollowCounts } from "@/lib/api/follows";
import { useProgressiveIdentity } from "@/hooks/use-progressive-identity";
import { IdentityPromptSheet } from "@/components/identity-prompt-sheet";
import { updateIdentityField } from "@/lib/api/identity";
import { toast } from "sonner";

type Tab = "activity" | "followers" | "following" | "saved";

export default function MeLaunchPage() {
  const { follows: _follows, toggleFollow: _tf, notifPrefs: _np, setNotifPref: _snp } = useLoop();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab]         = useState<Tab>("activity");
  const [theme, setTheme]     = useState<"light" | "dark" | "system">("dark");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMsg, setReportMsg]   = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  /* ── Edit profile state ── */
  const [editOpen, setEditOpen]     = useState(false);
  const [editName, setEditName]     = useState("");
  const [editBio, setEditBio]       = useState("");
  const [editHandle, setEditHandle] = useState("");
  const [editBusy, setEditBusy]     = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount]  = useState(0);

  /* ── IDENTITY-002: Progressive identity collection ── */
  const {
    missingFields,
    promptField,
    showPrompt,
    closePrompt,
    dismissField,
    raldValues,
  } = useProgressiveIdentity();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      root.classList.add(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  useEffect(() => {
    if (!user?.id) return;
    getMyFollowCounts()
      .then(({ followers_count, following_count }) => {
        setFollowersCount(followers_count);
        setFollowingCount(following_count);
      })
      .catch(() => {});
  }, [user?.id]);

  const displayName = profile?.display_name ?? user?.phone ?? "You";
  const handle      = profile?.username ?? "";
  const avatarUrl   = profile?.avatar_url ?? "";
  const bio         = profile?.bio ?? "";
  const isVerified  = profile?.is_verified ?? false;

  /* ── Open edit form — pre-fill from Loop profile, fall back to RALD ── */
  const openEdit = () => {
    setEditName(profile?.display_name ?? raldValues?.display_name ?? "");
    setEditBio(profile?.bio ?? raldValues?.bio ?? "");
    setEditHandle(profile?.username ?? raldValues?.username ?? "");
    setEditOpen(true);
  };

  /* ── Save profile edits to Supabase + sync to RALD Intelligence ── */
  const saveEdit = async () => {
    if (!user || editBusy) return;
    if (!editName.trim() || editName.trim().length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    setEditBusy(true);
    try {
      const patch: { display_name: string; bio?: string; username?: string } = {
        display_name: editName.trim(),
      };
      if (editBio.trim()) patch.bio = editBio.trim();
      const rawHandle = editHandle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (rawHandle.length >= 3) patch.username = rawHandle.slice(0, 20);

      const { error } = await authedSupabase()
        .from("profiles")
        .update(patch)
        .eq("id", user.id);
      if (error) throw error;

      // Sync each changed field to RALD Intelligence (non-fatal, fire-and-forget)
      void updateIdentityField("display_name", patch.display_name);
      if (patch.bio)      void updateIdentityField("bio",      patch.bio);
      if (patch.username) void updateIdentityField("username", patch.username);

      await refreshProfile();
      setEditOpen(false);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update profile");
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <AppShell>
    <div className="pb-6">
      {/* Banner */}
      <div className="relative h-32 bg-gradient-to-br from-neon/30 via-accent to-orange/20">
        <button
          className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
          aria-label="Settings"
          onClick={() => toast.info("Settings coming soon")}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 -mt-10">
        {/* Avatar + edit button */}
        <div className="flex items-end justify-between">
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="h-20 w-20 rounded-2xl ring-4 ring-background object-cover" />
            : <div className="h-20 w-20 rounded-2xl ring-4 ring-background bg-secondary flex items-center justify-center text-2xl font-extrabold text-foreground">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
          }
          <button
            onClick={openEdit}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-bold active:scale-95 transition-transform"
          >
            <Pencil className="h-3 w-3" /> Edit profile
          </button>
        </div>

        {/* Name + handle + bio */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-extrabold">{displayName}</h1>
            {isVerified && <BadgeCheck className="h-5 w-5 text-neon fill-neon/20" />}
          </div>
          {handle && <div className="text-xs text-muted-foreground">@{handle} · {handle}@rald.me</div>}
          {profile?.state_id && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <MapPin className="h-3 w-3" />{profile.state_id}
            </div>
          )}
          {bio && <p className="text-sm mt-2 leading-snug">{bio}</p>}
        </div>

        {/* ── IDENTITY-002: Profile completion nudge card ──────────────── */}
        {missingFields.length > 0 && !editOpen && (
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CircleUser className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Complete your profile</span>
            </div>
            <div className="space-y-2">
              {missingFields.map((f) => (
                <div key={f.field} className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground flex-1 pr-3">{f.reason}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => showPrompt(f.field)}
                      className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold"
                    >
                      Add {f.label}
                    </button>
                    <button
                      onClick={() => dismissField(f.field)}
                      className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center"
                      aria-label={`Dismiss ${f.label} nudge`}
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Inline Edit Profile Form ── */}
        {editOpen && (
          <div className="mt-4 rounded-2xl border border-primary/30 bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Edit profile</h3>
              <button
                onClick={() => setEditOpen(false)}
                className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Display Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your name"
                maxLength={40}
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
              />
              {raldValues?.display_name && !profile?.display_name && (
                <p className="text-[11px] text-primary/70 pl-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> From your RALD profile
                </p>
              )}
            </div>

            {/* Handle */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                @handle <span className="text-muted-foreground/60 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                <input
                  value={editHandle}
                  onChange={(e) => setEditHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="yourhandle"
                  maxLength={20}
                  className="w-full h-11 rounded-xl border border-border bg-background pl-7 pr-3 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
                />
              </div>
              <p className="text-[11px] text-muted-foreground pl-1">Lowercase letters, numbers, underscores. Min. 3 characters.</p>
            </div>

            {/* Bio */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Bio <span className="text-muted-foreground/60 font-normal">(optional)</span>
              </label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Tell your story in a line…"
                rows={2}
                maxLength={160}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none resize-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
              />
              <p className="text-[11px] text-muted-foreground pl-1">{editBio.length}/160</p>
              {raldValues?.bio && !profile?.bio && (
                <p className="text-[11px] text-primary/70 pl-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> From your RALD profile
                </p>
              )}
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveEdit}
                disabled={editBusy || !editName.trim() || editName.trim().length < 2}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98] transition-transform"
              >
                {editBusy
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Check className="h-3.5 w-3.5" /> Save</>
                }
              </button>
              <button
                onClick={() => setEditOpen(false)}
                className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Push notification prompt — shown once when permission is 'default' */}
        <NotificationPrompt />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button onClick={() => setTab("followers")} className={`rounded-2xl p-3 text-center transition ${tab === "followers" ? "bg-secondary ring-2 ring-neon/40" : "bg-secondary"}`}>
            <div className="text-lg font-extrabold">{followersCount}</div>
            <div className="text-[10px] text-muted-foreground">Followers</div>
          </button>
          <button onClick={() => setTab("following")} className={`rounded-2xl p-3 text-center transition ${tab === "following" ? "bg-secondary ring-2 ring-neon/40" : "bg-secondary"}`}>
            <div className="text-lg font-extrabold">{followingCount}</div>
            <div className="text-[10px] text-muted-foreground">Following</div>
          </button>
          <div className="rounded-2xl p-3 text-center bg-neon/10 border border-neon/40">
            <div className="text-lg font-extrabold text-neon">—</div>
            <div className="text-[10px] text-muted-foreground">Trust</div>
          </div>
        </div>

        {/* RALD Identity */}
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
            <IdRow k="Badge"       v={isVerified ? "Verified contributor" : "Not yet verified"} />
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-2">Connected apps</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { name: "Loop",      on: true,  color: "bg-neon/15 text-neon" },
                { name: "Messenger", on: false, color: "bg-secondary text-muted-foreground" },
                { name: "Mail",      on: false, color: "bg-secondary text-muted-foreground" },
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

        {/* Appearance */}
        <div className="mt-4 rounded-2xl border border-border p-4 bg-card">
          <div className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-neon" />Appearance
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "light"  as const, icon: Sun,     label: "Light" },
              { id: "dark"   as const, icon: Moon,    label: "Dark"  },
              { id: "system" as const, icon: Monitor, label: "Auto"  },
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

        {/* Report problem */}
        <button
          onClick={() => setReportOpen(true)}
          className="mt-4 w-full h-11 rounded-2xl border border-border bg-secondary text-foreground text-sm font-semibold flex items-center justify-center gap-2"
        >
          Report a problem
        </button>

        {reportOpen && (
          <div className="mt-3 rounded-2xl border border-border bg-surface p-4 space-y-3">
            <h3 className="text-sm font-bold">What went wrong?</h3>
            <textarea
              value={reportMsg}
              onChange={(e) => setReportMsg(e.target.value)}
              placeholder="Describe the problem…"
              rows={3}
              maxLength={500}
              className="w-full rounded-xl bg-background border border-border px-3 py-2 text-sm outline-none resize-none placeholder:text-muted-foreground"
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!reportMsg.trim() || reportBusy) return;
                  setReportBusy(true);
                  try {
                    const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
                    const token   = localStorage.getItem("loop_token");
                    await fetch(`${apiBase}/api/feedback`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
                      body: JSON.stringify({ message: reportMsg, page: window.location.pathname }),
                    });
                    setReportOpen(false);
                    setReportMsg("");
                    toast.success("Thanks — we'll look into it.");
                  } catch {
                    toast.error("Could not send report — try again.");
                  } finally {
                    setReportBusy(false);
                  }
                }}
                disabled={!reportMsg.trim() || reportBusy}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
              >
                {reportBusy ? "Sending…" : "Send report"}
              </button>
              <button
                onClick={() => { setReportOpen(false); setReportMsg(""); }}
                className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={() => signOut()}
          className="mt-4 w-full h-11 rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive text-sm font-semibold flex items-center justify-center gap-2"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>

        {/* Activity tabs */}
        <div className="mt-5">
          <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-none">
            {(["activity", "followers", "following", "saved"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-semibold capitalize border-b-2 whitespace-nowrap ${tab === t ? "border-neon text-foreground" : "border-transparent text-muted-foreground"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {tab === "activity"  && <EmptyTab icon={Mic}   title="No activity yet"         body="Your rooms, reactions, and connections will appear here."    cta="Discover rooms"      onCta={() => navigate("/discover")} />}
            {tab === "following" && <EmptyTab icon={Users} title="Not following anyone yet" body="Join a room to start following people you want to hear from." cta="Find rooms & people" onCta={() => navigate("/discover")} />}
            {tab === "followers" && <EmptyTab icon={Users} title="No followers yet"         body="Host or join rooms — followers come when you participate."    cta="Discover rooms"      onCta={() => navigate("/discover")} />}
            {tab === "saved"     && <EmptyTab icon={Heart} title="Nothing saved yet"        body="Saved rooms, comments and events show up here."              cta="Discover rooms"      onCta={() => navigate("/discover")} />}
          </div>
        </div>
      </div>
    </div>

    {/* ── IDENTITY-002: Progressive identity prompt sheet ── */}
    <IdentityPromptSheet
      field={promptField}
      raldValues={raldValues}
      onSaved={refreshProfile}
      onDismiss={() => promptField && dismissField(promptField)}
      onOpenChange={(open) => { if (!open) closePrompt(); }}
    />
    </AppShell>
  );
}

function EmptyTab({ icon: Icon, title, body, cta, onCta }: { icon: typeof Mic; title: string; body: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="h-11 w-11 rounded-xl bg-secondary flex items-center justify-center">
        <Icon className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{body}</p>
      </div>
      {cta && onCta && (
        <button
          onClick={onCta}
          className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground neon-glow"
        >
          {cta}
        </button>
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
        {copy && (
          <Copy
            className="h-3 w-3 text-muted-foreground cursor-pointer"
            onClick={() => navigator.clipboard?.writeText(v)}
          />
        )}
      </span>
    </div>
  );
}
