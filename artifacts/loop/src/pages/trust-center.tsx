/**
 * Loop — Trust Center
 * Part 6: Trust Center accessible from Profile, Settings, Navigation.
 * All forms functional — saves to Supabase feedback table.
 * LILCKY STUDIO LIMITED
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import {
  Bug, AlertTriangle, FileText, Lightbulb,
  BookOpen, Eye, Shield, ChevronLeft, ChevronRight,
  CheckCircle2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

type Section =
  | "menu"
  | "report-bug"
  | "report-abuse"
  | "report-false-info"
  | "feature-request"
  | "community-standards"
  | "transparency"
  | "safety";

interface MenuItem {
  id: Section;
  icon: typeof Bug;
  label: string;
  sub: string;
  form?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { id: "report-bug",       icon: Bug,           label: "Report a Bug",         sub: "Something broken or not working correctly",      form: true },
  { id: "report-abuse",     icon: AlertTriangle, label: "Report Abuse",         sub: "Harassment, hate speech, or policy violations",  form: true },
  { id: "report-false-info",icon: FileText,      label: "Report False Info",    sub: "Misinformation or misleading content",           form: true },
  { id: "feature-request",  icon: Lightbulb,     label: "Feature Request",      sub: "Suggest something you'd love to see in Loop",    form: true },
  { id: "community-standards", icon: BookOpen,   label: "Community Standards",  sub: "Our rules for healthy, respectful conversations", form: false },
  { id: "transparency",     icon: Eye,           label: "Transparency Policy",  sub: "How we operate, moderate, and use your data",    form: false },
  { id: "safety",           icon: Shield,        label: "Safety Information",   sub: "Resources and guidance for your safety on Loop", form: false },
];

const PLACEHOLDERS: Record<string, string> = {
  "report-bug":        "Describe the bug — what happened, where you were, what you expected…",
  "report-abuse":      "Describe the abuse — include usernames or content involved if possible…",
  "report-false-info": "Describe the false information — what was claimed, and why it's incorrect…",
  "feature-request":   "What would you like Loop to do? Describe the feature and why it would help…",
};

const LABELS: Record<string, string> = {
  "report-bug":        "Bug Report",
  "report-abuse":      "Abuse Report",
  "report-false-info": "False Information Report",
  "feature-request":   "Feature Request",
};

function FeedbackForm({ section, onBack }: { section: Section; onBack: () => void }) {
  const { session } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      const token = session?.access_token ?? localStorage.getItem("loop_token") ?? "";
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: `[${LABELS[section]}] ${message.trim()}`,
          page: `trust-center/${section}`,
        }),
      });
      if (res.ok || res.status === 201) {
        setDone(true);
      } else {
        const j = await res.json().catch(() => ({})) as { error?: string };
        alert(j.error ?? "Could not send — please try again.");
      }
    } catch {
      alert("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-5 py-16 text-center px-6">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-display text-lg font-bold">Received — thank you</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            We review every report. You'll see improvements as we act on feedback.
          </p>
        </div>
        <button
          onClick={onBack}
          className="mt-2 h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          Back to Trust Center
        </button>
      </div>
    );
  }

  const item = MENU_ITEMS.find((m) => m.id === section)!;
  const Icon = item.icon;

  return (
    <div className="px-5 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-base font-bold">{item.label}</h2>
          <p className="text-xs text-muted-foreground">{item.sub}</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {LABELS[section]}
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={PLACEHOLDERS[section]}
          rows={5}
          maxLength={1500}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none placeholder:text-muted-foreground transition-colors"
        />
        <p className="text-[11px] text-muted-foreground text-right">{message.length}/1500</p>
      </div>

      <button
        onClick={submit}
        disabled={message.trim().length < 5 || busy}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Sending…" : "Submit"}
      </button>
    </div>
  );
}

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
          <p key={i} className="text-sm leading-relaxed text-foreground/90">
            {para}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function TrustCenterPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("menu");

  const goBack = () => {
    if (section === "menu") navigate(-1);
    else setSection("menu");
  };

  return (
    <AppShell>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={goBack}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-display text-lg font-bold">Trust Center</h1>
            {section !== "menu" && (
              <p className="text-xs text-muted-foreground">
                {MENU_ITEMS.find((m) => m.id === section)?.label}
              </p>
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
                Every report is reviewed. Every policy is enforced. Report anything that doesn't feel right.
              </p>
            </div>
          </div>

          {/* Report section */}
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
              Report
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {MENU_ITEMS.filter((m) => m.form).map((item, idx, arr) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-elev active:bg-surface-elev",
                      idx < arr.length - 1 && "border-b border-border",
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

          {/* Policies section */}
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
              Policies
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {MENU_ITEMS.filter((m) => !m.form).map((item, idx, arr) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-elev active:bg-surface-elev",
                      idx < arr.length - 1 && "border-b border-border",
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

          <p className="text-center text-xs text-muted-foreground pb-4">
            LILCKY STUDIO LIMITED · Loop v1
          </p>
        </div>
      )}

      {section !== "menu" && (() => {
        const item = MENU_ITEMS.find((m) => m.id === section)!;
        if (item.form) return <FeedbackForm section={section} onBack={() => setSection("menu")} />;
        return <StaticContent section={section} />;
      })()}
    </AppShell>
  );
}
