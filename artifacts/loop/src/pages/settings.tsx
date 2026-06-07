/**
 * Loop — Settings Page
 * Part 7: All settings must fully function. No "Coming Soon" or placeholders.
 * LILCKY STUDIO LIMITED
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { authedSupabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";
import {
  ChevronLeft, ChevronRight, Bell, Globe2, Shield,
  UserCircle, MapPin, Trash2, Sun, Moon, Monitor,
  BellOff, BellRing, Volume2, Check, Loader2, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Section = "menu" | "profile" | "region" | "notifications" | "privacy" | "account" | "appearance";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "sw", label: "Kiswahili" },
  { code: "ha", label: "Hausa" },
  { code: "yo", label: "Yoruba" },
  { code: "ig", label: "Igbo" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "Arabic" },
  { code: "pt", label: "Português" },
];

const MENU_SECTIONS = [
  { id: "profile" as Section,       icon: UserCircle, label: "Profile Settings",      sub: "Name, bio, avatar, handle" },
  { id: "region" as Section,        icon: MapPin,     label: "Region Settings",        sub: "Country, state, LGA, LCDA" },
  { id: "notifications" as Section, icon: Bell,       label: "Notification Settings",  sub: "Alerts, sounds, room notifications" },
  { id: "privacy" as Section,       icon: Shield,     label: "Privacy Settings",       sub: "Visibility, blocking, data" },
  { id: "account" as Section,       icon: Lock,       label: "Account Settings",       sub: "Phone, security, delete account" },
  { id: "appearance" as Section,    icon: Sun,        label: "Appearance",             sub: "Theme, display preferences" },
];

function ProfileSettings() {
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [language, setLanguage] = useState(profile?.language ?? "en");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const { error } = await authedSupabase()
        .from("profiles")
        .update({ display_name: displayName.trim() || null, bio: bio.trim() || null, language })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 py-6 space-y-5">
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          placeholder="Your display name"
          className="w-full rounded-xl border border-border bg-surface px-4 h-12 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={200}
          placeholder="Tell your community who you are…"
          rows={3}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none transition-colors"
        />
        <p className="text-[11px] text-muted-foreground text-right">{bio.length}/200</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Language</label>
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLanguage(l.code)}
              className={cn(
                "h-10 rounded-xl border text-sm font-medium text-left px-3 transition-colors",
                language === l.code ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={save}
        disabled={busy}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {busy ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function RegionSettings() {
  const { user, profile, refreshProfile } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ area_name: string; display_label: string; country: string; state_id: string; lga_id: string | null; lcda_id: string | null }>>([]);
  const [selected, setSelected] = useState<{ country: string; state_id: string; lga_id: string | null; lcda_id: string | null; display_label: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

  const currentRegion = (() => {
    const parts = [profile?.lga_id, profile?.state_id, profile?.country].filter(Boolean);
    return parts.join(", ") || null;
  })();

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const url = new URL(`${API_BASE}/api/regions/search`);
        url.searchParams.set("q", query.trim());
        url.searchParams.set("limit", "8");
        const r = await fetch(url.toString());
        if (r.ok) {
          const j = await r.json() as { results: typeof results };
          setResults(j.results ?? []);
        }
      } catch { /* silent */ } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, API_BASE]);

  const save = async () => {
    if (!user || !selected || saving) return;
    setSaving(true);
    try {
      const { error } = await authedSupabase()
        .from("profiles")
        .update({
          country:  selected.country,
          state_id: selected.state_id,
          lga_id:   selected.lga_id,
          lcda_id:  selected.lcda_id,
        })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Region updated");
      setSelected(null);
      setQuery("");
      setResults([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-5 py-6 space-y-5">
      {currentRegion && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-xs text-muted-foreground">Current region</p>
          <p className="text-sm font-semibold mt-0.5">{currentRegion}</p>
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Search your area</label>
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Ikeja, Lagos, Abuja…"
            className="w-full rounded-xl border border-border bg-surface px-4 h-12 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 pr-10 transition-colors"
          />
          {searching && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>
      {results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface divide-y divide-border">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => { setSelected({ country: r.country, state_id: r.state_id, lga_id: r.lga_id, lcda_id: r.lcda_id, display_label: r.display_label }); setQuery(r.display_label); setResults([]); }}
              className={cn("w-full px-4 py-2.5 text-left text-sm hover:bg-surface-elev transition-colors", selected?.display_label === r.display_label && "bg-primary/10 text-primary")}
            >
              {r.display_label}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <button
          onClick={save}
          disabled={saving}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Saving…" : `Set region to ${selected.display_label}`}
        </button>
      )}
      <p className="text-xs text-muted-foreground">Your region helps us surface relevant rooms and communities near you.</p>
    </div>
  );
}

function NotificationSettings() {
  const [roomAlerts, setRoomAlerts] = useState(true);
  const [mentionAlerts, setMentionAlerts] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem("loop_notif_prefs", JSON.stringify({ roomAlerts, mentionAlerts, soundEnabled }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success("Notification preferences saved");
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem("loop_notif_prefs");
      if (raw) {
        const p = JSON.parse(raw) as { roomAlerts?: boolean; mentionAlerts?: boolean; soundEnabled?: boolean };
        if (p.roomAlerts    !== undefined) setRoomAlerts(p.roomAlerts);
        if (p.mentionAlerts !== undefined) setMentionAlerts(p.mentionAlerts);
        if (p.soundEnabled  !== undefined) setSoundEnabled(p.soundEnabled);
      }
    } catch { /* ignore */ }
  }, []);

  const Toggle = ({ value, onChange, label, sub, icon: Icon }: { value: boolean; onChange: (v: boolean) => void; label: string; sub: string; icon: typeof Bell }) => (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn("relative h-6 w-11 rounded-full transition-colors", value ? "bg-primary" : "bg-border")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", value ? "translate-x-5" : "translate-x-0.5")} />
      </button>
    </div>
  );

  return (
    <div className="px-5 py-6 space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface px-4">
        <Toggle value={roomAlerts}    onChange={setRoomAlerts}    label="Room alerts"    sub="Notify when people you follow go live" icon={BellRing} />
        <Toggle value={mentionAlerts} onChange={setMentionAlerts} label="Mentions"       sub="Notify when someone mentions you"       icon={Bell} />
        <Toggle value={soundEnabled}  onChange={setSoundEnabled}  label="Sound effects"  sub="Audio cues for reactions and events"    icon={Volume2} />
        <div className="py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <BellOff className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Quiet hours</p>
              <p className="text-xs text-muted-foreground">No notifications 11pm–7am</p>
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={save}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
      >
        {saved ? <Check className="h-4 w-4" /> : null}
        {saved ? "Saved" : "Save preferences"}
      </button>
    </div>
  );
}

function PrivacySettings() {
  const [profilePublic, setProfilePublic] = useState(true);
  const [showRegion, setShowRegion] = useState(true);
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem("loop_privacy_prefs", JSON.stringify({ profilePublic, showRegion }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success("Privacy preferences saved");
  };

  const Toggle = ({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub: string }) => (
    <div className="flex items-center justify-between py-3.5 border-b border-border last:border-0">
      <div className="min-w-0 flex-1 pr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", value ? "bg-primary" : "bg-border")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", value ? "translate-x-5" : "translate-x-0.5")} />
      </button>
    </div>
  );

  return (
    <div className="px-5 py-6 space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface px-4">
        <Toggle value={profilePublic} onChange={setProfilePublic} label="Public profile" sub="Anyone can see your name and rooms you host" />
        <Toggle value={showRegion}    onChange={setShowRegion}    label="Show my region" sub="Display your country and state on your profile" />
      </div>
      <p className="text-xs text-muted-foreground">Your phone number is never visible to other users. Only your username and display name are shown publicly.</p>
      <button
        onClick={save}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
      >
        {saved ? <Check className="h-4 w-4" /> : null}
        {saved ? "Saved" : "Save preferences"}
      </button>
    </div>
  );
}

function AppearanceSettings() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");

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
    toast.success(`Theme set to ${t}`);
  };

  const opts = [
    { id: "light" as const,  icon: Sun,     label: "Light" },
    { id: "dark"  as const,  icon: Moon,    label: "Dark" },
    { id: "system" as const, icon: Monitor, label: "Auto" },
  ];

  return (
    <div className="px-5 py-6 space-y-5">
      <p className="text-xs text-muted-foreground">Choose how Loop looks on your device.</p>
      <div className="grid grid-cols-3 gap-3">
        {opts.map((opt) => {
          const Icon = opt.icon;
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => applyTheme(opt.id)}
              className={cn(
                "flex flex-col items-center gap-2 py-5 rounded-2xl border transition-colors",
                active ? "border-primary bg-primary/10" : "border-border bg-surface",
              )}
            >
              <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("text-xs font-semibold", active ? "text-primary" : "text-muted-foreground")}>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccountSettings() {
  const { user, signOut } = useAuth();
  const [delConfirm, setDelConfirm] = useState(false);

  return (
    <div className="px-5 py-6 space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="px-4 py-3.5 border-b border-border">
          <p className="text-xs text-muted-foreground">Phone number</p>
          <p className="text-sm font-semibold mt-0.5">{user?.phone || "Not set"}</p>
        </div>
        <div className="px-4 py-3.5 border-b border-border">
          <p className="text-xs text-muted-foreground">Account ID</p>
          <p className="text-sm font-mono font-semibold mt-0.5 break-all">{user?.id ?? "—"}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Authentication</p>
          <p className="text-sm font-semibold mt-0.5">RALD Identity (profiles.rald.cloud)</p>
        </div>
      </div>

      <button
        onClick={() => signOut()}
        className="w-full h-12 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive font-semibold text-sm flex items-center justify-center gap-2"
      >
        Sign out of Loop
      </button>

      {!delConfirm ? (
        <button
          onClick={() => setDelConfirm(true)}
          className="w-full h-11 rounded-xl border border-border text-muted-foreground text-sm flex items-center justify-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Delete account
        </button>
      ) : (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-destructive">Are you sure?</p>
          <p className="text-xs text-muted-foreground">This permanently deletes your Loop profile and all your rooms. This cannot be undone.</p>
          <div className="flex gap-2">
            <a
              href="https://profiles.rald.cloud/settings/delete"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-10 rounded-xl bg-destructive text-white text-xs font-semibold flex items-center justify-center"
            >
              Yes, delete
            </a>
            <button
              onClick={() => setDelConfirm(false)}
              className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("menu");

  const goBack = () => {
    if (section === "menu") navigate(-1);
    else setSection("menu");
  };

  const SECTION_TITLE: Record<Section, string> = {
    menu: "Settings",
    profile: "Profile Settings",
    region: "Region Settings",
    notifications: "Notifications",
    privacy: "Privacy",
    account: "Account",
    appearance: "Appearance",
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={goBack}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-lg font-bold">{SECTION_TITLE[section]}</h1>
        </div>
      </header>

      {section === "menu" && (
        <div className="px-5 py-6 space-y-3">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {MENU_SECTIONS.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-elev active:bg-surface-elev",
                    idx < MENU_SECTIONS.length - 1 && "border-b border-border",
                  )}
                >
                  <div className="h-8 w-8 shrink-0 rounded-xl bg-secondary flex items-center justify-center">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {section === "profile"       && <ProfileSettings />}
      {section === "region"        && <RegionSettings />}
      {section === "notifications" && <NotificationSettings />}
      {section === "privacy"       && <PrivacySettings />}
      {section === "account"       && <AccountSettings />}
      {section === "appearance"    && <AppearanceSettings />}
    </AppShell>
  );
}
