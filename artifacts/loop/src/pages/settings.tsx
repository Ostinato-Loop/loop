/**
 * Loop — Settings Page
 * Part 7: All settings must fully function. No "Coming Soon" or placeholders.
 * REVOKE-ALL-001 (2026-06-09): Added Security & Devices section (Device Center).
 * LILCKY STUDIO LIMITED
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/api-fetch";
import { setSessionToken } from "@/lib/session-store";
import { authedSupabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";
import {
  ChevronLeft, ChevronRight, Bell, Shield, UserCircle, MapPin, Trash2,
  Download, Sun, Moon, Monitor, BellOff, BellRing, Volume2, Check,
  Loader2, Lock, Smartphone, LogOut, ShieldAlert, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Section = "menu" | "profile" | "region" | "notifications" | "privacy" | "security" | "account" | "appearance";

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
  { id: "profile"       as Section, icon: UserCircle,  label: "Profile Settings",     sub: "Name, bio, avatar, handle" },
  { id: "region"        as Section, icon: MapPin,       label: "Region Settings",      sub: "Country, state, LGA, LCDA" },
  { id: "notifications" as Section, icon: Bell,         label: "Notifications",        sub: "Alerts, sounds, room notifications" },
  { id: "privacy"       as Section, icon: Shield,       label: "Privacy",              sub: "Visibility, blocking, data" },
  { id: "security"      as Section, icon: ShieldAlert,  label: "Security & Devices",   sub: "Active sessions, sign out other devices" },
  { id: "account"       as Section, icon: Lock,         label: "Account",              sub: "Phone, identity, delete account" },
  { id: "appearance"    as Section, icon: Sun,          label: "Appearance",           sub: "Theme, display preferences" },
];

/* ── ProfileSettings ─────────────────────────────────────────────────── */

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

/* ── RegionSettings ──────────────────────────────────────────────────── */

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
        .update({ country: selected.country, state_id: selected.state_id, lga_id: selected.lga_id, lcda_id: selected.lcda_id })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Region updated");
      setSelected(null); setQuery(""); setResults([]);
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

/* ── NotificationSettings ────────────────────────────────────────────── */

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
      <button onClick={() => onChange(!value)} className={cn("relative h-6 w-11 rounded-full transition-colors", value ? "bg-primary" : "bg-border")}>
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
      <button onClick={save} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2">
        {saved ? <Check className="h-4 w-4" /> : null}
        {saved ? "Saved" : "Save preferences"}
      </button>
    </div>
  );
}

/* ── PrivacySettings ─────────────────────────────────────────────────── */

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
      <button onClick={() => onChange(!value)} className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", value ? "bg-primary" : "bg-border")}>
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
      <button onClick={save} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2">
        {saved ? <Check className="h-4 w-4" /> : null}
        {saved ? "Saved" : "Save preferences"}
      </button>
    </div>
  );
}

/* ── SecuritySettings — Device Center ────────────────────────────────── */

type Device = {
  id:            string;
  device_name:   string;
  device_type:   string;
  os:            string;
  browser:       string;
  ip_address:    string | null;
  city:          string | null;
  country:       string | null;
  last_seen_at:  string;
  is_trusted:    boolean;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/** Best-effort current device detection by comparing navigator.userAgent */
function detectCurrentDevice(devices: Device[]): string | null {
  const ua = navigator.userAgent;
  const browser =
    /Edg\//.test(ua)     ? "Edge"    :
    /Chrome\//.test(ua)  ? "Chrome"  :
    /Safari\//.test(ua)  ? "Safari"  :
    /Firefox\//.test(ua) ? "Firefox" : "Unknown";
  const os =
    /iPhone/.test(ua)    ? "iOS"     :
    /Android/.test(ua)   ? "Android" :
    /Macintosh/.test(ua) ? "macOS"   :
    /Windows/.test(ua)   ? "Windows" : "Other";

  // First match wins (list is sorted by last_seen DESC — most recent first)
  for (const d of devices) {
    if (d.browser === browser && d.os.startsWith(os)) return d.id;
  }
  return devices[0]?.id ?? null; // Fall back to most-recently-seen
}

function DeviceIcon({ type }: { type: string }) {
  if (type === "mobile" || type === "tablet") return <Smartphone className="h-5 w-5 text-muted-foreground" />;
  return <Monitor className="h-5 w-5 text-muted-foreground" />;
}

function SecuritySettings() {
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null); // device id being revoked
  const [revokeAllBusy, setRevokeAllBusy] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/auth/devices`);
      if (res.ok) {
        const data = await res.json() as { devices: Device[] };
        setDevices(data.devices ?? []);
        setCurrentDeviceId(detectCurrentDevice(data.devices ?? []));
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const revokeDevice = async (deviceId: string) => {
    if (deviceId === currentDeviceId) return; // Never revoke current device from here
    setRevoking(deviceId);
    try {
      const res = await authFetch(`${API_BASE}/api/auth/revoke-device`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ device_id: deviceId }),
      });
      if (res.ok) {
        setDevices(prev => prev.filter(d => d.id !== deviceId));
        toast.success("Device signed out");
      } else {
        toast.error("Could not revoke device");
      }
    } catch {
      toast.error("Could not revoke device");
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    setRevokeAllBusy(true);
    try {
      const res = await authFetch(`${API_BASE}/api/auth/revoke-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json() as { access_token?: string };
        if (data.access_token) setSessionToken(data.access_token);
        toast.success("All other devices signed out");
        // Reload device list — only current device should remain
        await loadDevices();
      } else {
        toast.error("Could not revoke other sessions");
      }
    } catch {
      toast.error("Could not revoke other sessions");
    } finally {
      setRevokeAllBusy(false);
    }
  };

  const otherDevices = devices.filter(d => d.id !== currentDeviceId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-5 py-6 space-y-6">

      {/* Revoke-all action */}
      {otherDevices.length > 0 && (
        <button
          onClick={revokeAll}
          disabled={revokeAllBusy}
          className="w-full h-12 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {revokeAllBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {revokeAllBusy ? "Signing out…" : `Sign out ${otherDevices.length} other device${otherDevices.length !== 1 ? "s" : ""}`}
        </button>
      )}

      {/* Current device */}
      {currentDeviceId && devices.find(d => d.id === currentDeviceId) && (() => {
        const d = devices.find(dev => dev.id === currentDeviceId)!;
        return (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">This device</p>
            <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                <DeviceIcon type={d.device_type} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{d.device_name}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">Current</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{d.browser} · {d.os}</p>
                {(d.city || d.country) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Globe className="h-3 w-3 inline" />
                    {[d.city, d.country].filter(Boolean).join(", ")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">Active {relativeTime(d.last_seen_at)}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Other devices */}
      {otherDevices.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Other sessions</p>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
            {otherDevices.map((d) => (
              <div key={d.id} className="px-4 py-3.5 flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                  <DeviceIcon type={d.device_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{d.device_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{d.browser} · {d.os}</p>
                  {(d.city || d.country) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Globe className="h-3 w-3 inline" />
                      {[d.city, d.country].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">Last active {relativeTime(d.last_seen_at)}</p>
                </div>
                <button
                  onClick={() => revokeDevice(d.id)}
                  disabled={revoking === d.id}
                  className="shrink-0 h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:border-destructive/50 hover:text-destructive transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {revoking === d.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <LogOut className="h-3 w-3" />}
                  {revoking === d.id ? "…" : "Sign out"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {devices.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Smartphone className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No devices found</p>
          <p className="text-xs text-muted-foreground/60">Devices appear here after each sign-in</p>
        </div>
      )}

      {otherDevices.length === 0 && devices.length > 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3.5 text-center">
          <p className="text-sm font-medium text-muted-foreground">Only signed in on this device</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Signing out a device immediately revokes its session. The device will need to sign in again.
        If you don't recognise a session, sign out all other devices immediately.
      </p>
    </div>
  );
}

/* ── AppearanceSettings ──────────────────────────────────────────────── */

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
    { id: "light"  as const, icon: Sun,     label: "Light" },
    { id: "dark"   as const, icon: Moon,    label: "Dark" },
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
              className={cn("flex flex-col items-center gap-2 py-5 rounded-2xl border transition-colors", active ? "border-primary bg-primary/10" : "border-border bg-surface")}
            >
              <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("text-xs font-semibold", active ? "text-primary" : "text-muted-foreground")}>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── AccountSettings ─────────────────────────────────────────────────── */

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

      <a
        href="https://profiles.rald.cloud/settings/data"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full h-11 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2"
      >
        <Download className="h-4 w-4" />
        Download my data
      </a>

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

/* ── SettingsPage ────────────────────────────────────────────────────── */

export default function SettingsPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("menu");

  const goBack = () => {
    if (section === "menu") navigate(-1);
    else setSection("menu");
  };

  const SECTION_TITLE: Record<Section, string> = {
    menu:          "Settings",
    profile:       "Profile Settings",
    region:        "Region Settings",
    notifications: "Notifications",
    privacy:       "Privacy",
    security:      "Security & Devices",
    account:       "Account",
    appearance:    "Appearance",
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border pt-safe-top">
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
      {section === "security"      && <SecuritySettings />}
      {section === "account"       && <AccountSettings />}
      {section === "appearance"    && <AppearanceSettings />}
    </AppShell>
  );
}
