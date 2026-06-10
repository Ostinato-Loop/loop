/**
 * Loop — Full Trust & Privacy Center
 *
 * TRUST-001 (2026-06-10): Expanded from basic feedback-only page to full
 *   Trust & Privacy Center with 7 sections:
 *     Report   — Bug, Abuse, False Info, Feature Request
 *     Security — Device Center, Session Management, Recovery Codes
 *     Privacy  — Consent Center, Data Export
 *     Policies — Community Standards, Transparency, Safety
 *
 * LILCKY STUDIO LIMITED
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/api-fetch";
import { AppShell } from "@/components/layout/app-shell";
import {
  Bug, AlertTriangle, FileText, Lightbulb,
  BookOpen, Eye, Shield, ChevronLeft, ChevronRight,
  CheckCircle2, Loader2, Smartphone, Lock, Key,
  Download, ToggleLeft, ToggleRight, Trash2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

type Section =
  | "menu"
  | "report-bug" | "report-abuse" | "report-false-info" | "feature-request"
  | "devices" | "sessions" | "recovery-codes"
  | "consent" | "data-export"
  | "community-standards" | "transparency" | "safety";

interface MenuItem {
  id: Section;
  icon: typeof Bug;
  label: string;
  sub: string;
  form?: boolean;
  group: "report" | "security" | "privacy" | "policy";
}

const MENU_ITEMS: MenuItem[] = [
  { id: "report-bug",        icon: Bug,          label: "Report a Bug",         sub: "Something broken or not working",              form: true,  group: "report"   },
  { id: "report-abuse",      icon: AlertTriangle, label: "Report Abuse",         sub: "Harassment, hate speech, policy violations",   form: true,  group: "report"   },
  { id: "report-false-info", icon: FileText,      label: "Report False Info",    sub: "Misinformation or misleading content",         form: true,  group: "report"   },
  { id: "feature-request",   icon: Lightbulb,     label: "Feature Request",      sub: "Suggest something you'd love to see",          form: true,  group: "report"   },
  { id: "devices",           icon: Smartphone,    label: "Device Center",        sub: "Manage trusted devices & active sessions",                  group: "security" },
  { id: "sessions",          icon: Lock,          label: "Session Management",   sub: "View and revoke active login sessions",                     group: "security" },
  { id: "recovery-codes",    icon: Key,           label: "Recovery Codes",       sub: "Backup codes to recover your account",                      group: "security" },
  { id: "consent",           icon: ToggleLeft,    label: "Consent Center",       sub: "Manage what data Loop collects",                            group: "privacy"  },
  { id: "data-export",       icon: Download,      label: "Data Export",          sub: "Download a copy of your Loop data",                         group: "privacy"  },
  { id: "community-standards", icon: BookOpen,   label: "Community Standards",  sub: "Rules for healthy, respectful conversations",               group: "policy"   },
  { id: "transparency",      icon: Eye,           label: "Transparency Policy",  sub: "How we operate, moderate, and use your data",               group: "policy"   },
  { id: "safety",            icon: Shield,        label: "Safety Information",   sub: "Resources and guidance for your safety",                    group: "policy"   },
];

const PLACEHOLDERS: Record<string, string> = {
  "report-bug":        "Describe the bug — what happened, where, what you expected…",
  "report-abuse":      "Describe the abuse — include usernames or content involved…",
  "report-false-info": "Describe the false information — what was claimed, and why it's wrong…",
  "feature-request":   "What would you like Loop to do? Describe the feature and why it would help…",
};
const LABELS: Record<string, string> = {
  "report-bug":        "Bug Report",
  "report-abuse":      "Abuse Report",
  "report-false-info": "False Information Report",
  "feature-request":   "Feature Request",
};

/* ── Feedback Form ─────────────────────────────────────────────────────── */
function FeedbackForm({ section, onBack }: { section: Section; onBack: () => void }) {
  const { session } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy]       = useState(false);
  const [done, setDone]       = useState(false);

  const submit = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      const token = session?.access_token ?? "";
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: `[${LABELS[section]}] ${message.trim()}`, page: `trust-center/${section}` }),
      });
      if (res.ok || res.status === 201) { setDone(true); }
      else { const j = await res.json().catch(() => ({}) as { error?: string }); alert((j as {error?:string}).error ?? "Could not send — please try again."); }
    } catch { alert("Network error — check your connection and try again."); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="flex flex-col items-center gap-5 py-16 text-center px-6">
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-display text-lg font-bold">Received — thank you</h2>
        <p className="text-sm text-muted-foreground max-w-xs">We review every report. You'll see improvements as we act on feedback.</p>
      </div>
      <button onClick={onBack} className="mt-2 h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Back to Trust Center</button>
    </div>
  );

  const item = MENU_ITEMS.find((m) => m.id === section)!;
  const Icon = item.icon;

  return (
    <div className="px-5 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
        <div><h2 className="font-display text-base font-bold">{item.label}</h2><p className="text-xs text-muted-foreground">{item.sub}</p></div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{LABELS[section]}</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={PLACEHOLDERS[section]}
          rows={5} maxLength={1500}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none placeholder:text-muted-foreground transition-colors" />
        <p className="text-[11px] text-muted-foreground text-right">{message.length}/1500</p>
      </div>
      <button onClick={() => void submit()} disabled={message.trim().length < 5 || busy}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy ? "Sending…" : "Submit"}
      </button>
    </div>
  );
}

/* ── Device Center ─────────────────────────────────────────────────────── */
type Device = { id: string; device_name: string; platform: string; trusted: boolean; last_seen_at: string; created_at: string };
function DeviceCenter() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    authFetch(`${API_BASE}/api/auth/devices`)
      .then(r => r.ok ? r.json() as Promise<{ devices: Device[] }> : Promise.reject())
      .then(d => setDevices(d.devices ?? []))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false));
  }, []);

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await authFetch(`${API_BASE}/api/auth/devices/${id}/revoke`, { method: "DELETE" });
      setDevices(prev => prev.filter(d => d.id !== id));
    } catch { /* non-fatal */ } finally { setRevoking(null); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="px-5 py-6 space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold">Device Center</h2>
        <p className="text-sm text-muted-foreground">Devices that have accessed your Loop account. Revoke any you don't recognise.</p>
      </div>

      {devices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
          <Smartphone className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No device records yet. Device tracking activates after your next login.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{d.device_name || d.platform || "Unknown device"}</p>
                <p className="text-xs text-muted-foreground">
                  {d.trusted ? "Trusted · " : ""}Last seen {new Date(d.last_seen_at).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => void revoke(d.id)} disabled={revoking === d.id}
                className="shrink-0 h-8 px-3 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
                {revoking === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface/60 p-4 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Revoking a device signs it out immediately. If you see a device you don't recognise, revoke it and change your login method.
        </p>
      </div>
    </div>
  );
}

/* ── Session Management ────────────────────────────────────────────────── */
type SessionRow = { id: string; created_at: string; last_active_at: string; ip?: string; user_agent?: string };
function SessionManagement() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  useEffect(() => {
    authFetch(`${API_BASE}/api/auth/sessions`)
      .then(r => r.ok ? r.json() as Promise<{ sessions: SessionRow[] }> : Promise.reject())
      .then(d => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await authFetch(`${API_BASE}/api/auth/sessions/${id}/revoke`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch { /* non-fatal */ } finally { setRevoking(null); }
  };

  const revokeAll = async () => {
    setRevokingAll(true);
    try {
      await authFetch(`${API_BASE}/api/auth/sessions/revoke-all`, { method: "DELETE" });
      setSessions([]);
    } catch { /* non-fatal */ } finally { setRevokingAll(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="px-5 py-6 space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold">Session Management</h2>
        <p className="text-sm text-muted-foreground">Active login sessions across all your devices.</p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No active sessions found.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{s.user_agent?.split(" ")[0] ?? "Session"}</p>
                  <p className="text-xs text-muted-foreground">Active {new Date(s.last_active_at ?? s.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => void revoke(s.id)} disabled={revoking === s.id}
                  className="shrink-0 h-8 px-3 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
                  {revoking === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}Sign out
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => void revokeAll()} disabled={revokingAll}
            className="w-full h-11 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {revokingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Sign out all other sessions
          </button>
        </>
      )}
    </div>
  );
}

/* ── Recovery Codes ────────────────────────────────────────────────────── */
function RecoveryCodes() {
  const [codes, setCodes]       = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API_BASE}/api/auth/recovery-codes/generate`, { method: "POST" });
      if (r.ok) {
        const d = await r.json() as { codes: string[] };
        setCodes(d.codes ?? []);
        setGenerated(true);
      }
    } catch { /* non-fatal */ } finally { setLoading(false); }
  };

  const copy = () => {
    void navigator.clipboard.writeText(codes.join("\n"));
  };

  return (
    <div className="px-5 py-6 space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold">Recovery Codes</h2>
        <p className="text-sm text-muted-foreground">
          One-time backup codes you can use if you lose access to your phone number. Each code can only be used once.
        </p>
      </div>

      {!generated ? (
        <>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              Store recovery codes securely — in a password manager or printed offline. Do not share them with anyone.
            </p>
          </div>
          <button onClick={() => void generate()} disabled={loading}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
            Generate Recovery Codes
          </button>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-surface p-4 font-mono text-sm space-y-2">
            {codes.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-foreground tracking-widest">{c}</span>
                <span className="text-xs text-muted-foreground">#{i + 1}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={copy}
              className="flex-1 h-11 rounded-xl border border-border bg-surface text-sm font-semibold flex items-center justify-center gap-2">
              <Download className="h-4 w-4" /> Copy all
            </button>
            <button onClick={() => void generate()} disabled={loading}
              className="flex-1 h-11 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Regenerate
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Regenerating invalidates all previous codes.
          </p>
        </>
      )}
    </div>
  );
}

/* ── Consent Center ────────────────────────────────────────────────────── */
type ConsentPrefs = { analytics: boolean; notifications: boolean; personalization: boolean; marketing: boolean };
function ConsentCenter() {
  const [prefs, setPrefs]     = useState<ConsentPrefs>({ analytics: true, notifications: true, personalization: true, marketing: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    authFetch(`${API_BASE}/api/auth/consent`)
      .then(r => r.ok ? r.json() as Promise<ConsentPrefs> : Promise.reject())
      .then(d => setPrefs(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await authFetch(`${API_BASE}/api/auth/consent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* non-fatal */ } finally { setSaving(false); }
  };

  const ToggleRow = ({ label, sub, key: k }: { label: string; sub: string; key: keyof ConsentPrefs }) => (
    <div className="flex items-center justify-between gap-4 py-3.5 px-4 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{sub}</p>
      </div>
      <button onClick={() => setPrefs(p => ({ ...p, [k]: !p[k] }))}
        className="shrink-0 transition-colors">
        {prefs[k]
          ? <ToggleRight className="h-7 w-7 text-primary" />
          : <ToggleLeft  className="h-7 w-7 text-muted-foreground" />}
      </button>
    </div>
  );

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="px-5 py-6 space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold">Consent Center</h2>
        <p className="text-sm text-muted-foreground">Control what data Loop collects and how it's used.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <ToggleRow key="analytics"        label="Usage Analytics"       sub="Help us understand how you use Loop to improve features" />
        <ToggleRow key="notifications"    label="Push Notifications"    sub="Rooms going live, new followers, and important updates" />
        <ToggleRow key="personalization"  label="Personalisation"       sub="Rooms and creators suggested based on your activity" />
        <ToggleRow key="marketing"        label="Marketing Messages"    sub="Loop news, product updates, and invitations" />
      </div>

      <button onClick={() => void save()} disabled={saving}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : null}
        {saving ? "Saving…" : saved ? "Saved" : "Save preferences"}
      </button>

      <p className="text-xs text-muted-foreground text-center">
        Loop never sells your data. Essential service data cannot be disabled.
      </p>
    </div>
  );
}

/* ── Data Export ───────────────────────────────────────────────────────── */
function DataExport() {
  const [requested, setRequested] = useState(false);
  const [loading, setLoading]     = useState(false);

  const request = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API_BASE}/api/auth/data-export`, { method: "POST" });
      if (r.ok || r.status === 202) setRequested(true);
    } catch { /* non-fatal */ } finally { setLoading(false); }
  };

  return (
    <div className="px-5 py-6 space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold">Data Export</h2>
        <p className="text-sm text-muted-foreground">Download a copy of all data Loop holds about your account.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
        {["Profile & identity", "Room history", "Follows & followers", "Notifications", "Analytics events", "Device records"].map((item) => (
          <div key={item} className="flex items-center gap-3 px-4 py-3">
            <div className="h-2 w-2 rounded-full bg-primary/40 shrink-0" />
            <p className="text-sm text-foreground/80">{item}</p>
          </div>
        ))}
      </div>

      {requested ? (
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">Export requested</p>
            <p className="text-xs text-green-600/80 dark:text-green-500/80 mt-0.5">
              We'll prepare your data and notify you when it's ready (usually within 24 hours). Check your Loop notifications.
            </p>
          </div>
        </div>
      ) : (
        <button onClick={() => void request()} disabled={loading}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Request data export
        </button>
      )}

      <p className="text-xs text-muted-foreground text-center">
        GDPR Article 20 — Right to Data Portability. Your data, your right.
      </p>
    </div>
  );
}

/* ── Static policy content ─────────────────────────────────────────────── */
function StaticContent({ section }: { section: Section }) {
  const CONTENT: Record<string, { title: string; body: string[] }> = {
    "community-standards": {
      title: "Community Standards",
      body: [
        "Loop is a space for authentic conversations rooted in your community. We expect everyone to treat others with respect.",
        "Prohibited: Harassment, hate speech, threats, doxxing, spam, impersonation, illegal content, and coordinated inauthentic behavior.",
        "Rooms must be honest about their purpose. Hosts are responsible for the content that happens in their rooms.",
        "Violations may result in content removal, account suspension, or permanent bans. Serious violations may be reported to authorities.",
        "Report violations using the abuse or false information forms in this Trust Center. We act on every verified report.",
        "Loop's moderation is transparent. We publish decisions for cases that affect public interest.",
      ],
    },
    "transparency": {
      title: "Transparency Policy",
      body: [
        "Loop is built by LILCKY STUDIO LIMITED. We are transparent about how we operate.",
        "Data collection: We collect your phone number, profile information, and room activity to operate the service. We do not sell your data.",
        "Moderation: All moderation actions are logged. We use both automated systems and human review.",
        "Identity: Loop uses RALD — the RALD Identity Network — for authentication. Your identity is portable across RALD apps.",
        "Regional data: Your region (country, state, LGA, LCDA) is used to surface relevant rooms and communities. It is not shared with advertisers.",
        "AI features: Loop uses AI for room summaries and recommendations. AI-generated content is labelled.",
        "We publish a quarterly transparency report covering moderation actions, government requests, and platform health.",
      ],
    },
    "safety": {
      title: "Safety Information",
      body: [
        "Your safety on Loop matters. Here's how to protect yourself and others.",
        "Block and report: Any user can be blocked. Reports are reviewed within 24 hours for serious cases.",
        "Room safety: You can leave any room at any time. Rooms cannot force your microphone on.",
        "Privacy: Your phone number is never visible to other users. Only your username and display name are public.",
        "Mental health: If someone expresses distress in a room, encourage them to seek professional help. Loop does not provide crisis services.",
        "Emergency: If you or someone else is in immediate danger, contact local emergency services. In Nigeria, call 112.",
        "Scams: Loop staff will never ask for your password, OTP, or payment information over chat. Report any such requests immediately.",
        "For safety concerns, use the abuse report form in this Trust Center. For urgent threats, contact local law enforcement.",
      ],
    },
  };

  const content = CONTENT[section];
  if (!content) return null;

  return (
    <div className="px-5 py-6 space-y-5">
      <h2 className="font-display text-lg font-bold">{content.title}</h2>
      <div className="space-y-4">
        {content.body.map((para, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground/90">{para}</p>
        ))}
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────── */
type GroupKey = "report" | "security" | "privacy" | "policy";
const GROUP_LABELS: Record<GroupKey, string> = {
  report:   "Report",
  security: "Security",
  privacy:  "Privacy",
  policy:   "Policies",
};

export default function TrustCenterPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("menu");

  const goBack = () => {
    if (section === "menu") navigate(-1);
    else setSection("menu");
  };

  const renderSection = () => {
    const item = MENU_ITEMS.find((m) => m.id === section);
    if (!item) return null;
    if (item.form) return <FeedbackForm section={section} onBack={() => setSection("menu")} />;
    if (section === "devices")        return <DeviceCenter />;
    if (section === "sessions")       return <SessionManagement />;
    if (section === "recovery-codes") return <RecoveryCodes />;
    if (section === "consent")        return <ConsentCenter />;
    if (section === "data-export")    return <DataExport />;
    return <StaticContent section={section} />;
  };

  return (
    <AppShell>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border pt-safe-top">
        <div className="flex items-center gap-3 px-5 py-4">
          <button onClick={goBack}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-display text-lg font-bold">Trust Center</h1>
            {section !== "menu" && (
              <p className="text-xs text-muted-foreground">{MENU_ITEMS.find((m) => m.id === section)?.label}</p>
            )}
          </div>
        </div>
      </header>

      {section === "menu" && (
        <div className="px-5 py-6 space-y-4">
          {/* Hero */}
          <div className="rounded-2xl bg-primary/8 border border-primary/20 p-5 flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-display text-sm font-bold">Loop is built on trust</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Every report is reviewed. Every policy is enforced. Your data belongs to you.
              </p>
            </div>
          </div>

          {(["report", "security", "privacy", "policy"] as GroupKey[]).map((group) => {
            const items = MENU_ITEMS.filter((m) => m.group === group);
            return (
              <div key={group}>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                  {GROUP_LABELS[group]}
                </h2>
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  {items.map((item, idx, arr) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.id} onClick={() => setSection(item.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-elev active:bg-surface-elev",
                          idx < arr.length - 1 && "border-b border-border",
                        )}>
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
            );
          })}

          <p className="text-center text-xs text-muted-foreground pb-4">
            LILCKY STUDIO LIMITED · Loop v1 · GDPR & NDPR compliant
          </p>
        </div>
      )}

      {section !== "menu" && renderSection()}
    </AppShell>
  );
}
