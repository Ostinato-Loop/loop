/**
 * Loop — ReportSheet
 * Part 15: Moderation Audit.
 * Handles Report User, Report Room, and Block User flows.
 * Submits to /api/moderation/report and /api/moderation/block.
 * Optimistic UI: closes immediately with toast, submits in background.
 * LILCKY STUDIO LIMITED
 */

import { useState } from "react";
import { X, Flag, Ban, ChevronRight, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/* ── Report categories ── */
const REPORT_REASONS = [
  { key: "spam",         label: "Spam or misleading" },
  { key: "harassment",   label: "Harassment or bullying" },
  { key: "hate_speech",  label: "Hate speech" },
  { key: "violence",     label: "Violence or dangerous content" },
  { key: "misinformation", label: "Misinformation" },
  { key: "sexual",       label: "Sexual content" },
  { key: "other",        label: "Something else" },
] as const;
type ReportReason = typeof REPORT_REASONS[number]["key"];

/* ── Moderation API helpers ── */
async function submitReport(payload: {
  target_type: "user" | "room" | "message";
  target_id: string;
  reason: ReportReason;
  notes?: string;
}): Promise<void> {
  const token = localStorage.getItem("loop_token");
  const r = await fetch(`${API_BASE}/api/moderation/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Report failed (${r.status})`);
}

async function submitBlock(targetUserId: string): Promise<void> {
  const token = localStorage.getItem("loop_token");
  const r = await fetch(`${API_BASE}/api/moderation/block`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ blocked_user_id: targetUserId }),
  });
  if (!r.ok) throw new Error(`Block failed (${r.status})`);
}

/* ── Props ── */
export type ReportTarget =
  | { kind: "user"; userId: string; displayName: string }
  | { kind: "room"; roomId: string; roomTitle: string }
  | { kind: "message"; messageId: string; roomId: string };

interface ReportSheetProps {
  open:     boolean;
  target:   ReportTarget | null;
  onClose:  () => void;
}

type SheetStep = "menu" | "report-reason" | "report-notes" | "submitting" | "done";

/* ── Sheet ── */
export function ReportSheet({ open, target, onClose }: ReportSheetProps) {
  const [step, setStep] = useState<SheetStep>("menu");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [notes, setNotes] = useState("");
  const [blocking, setBlocking] = useState(false);

  if (!open || !target) return null;

  const targetLabel =
    target.kind === "user" ? target.displayName
    : target.kind === "room" ? target.roomTitle
    : "this message";

  const close = () => {
    setStep("menu");
    setReason(null);
    setNotes("");
    setBlocking(false);
    onClose();
  };

  /* Block user — optimistic, background */
  const handleBlock = async () => {
    if (target.kind !== "user") return;
    setBlocking(true);
    toast.success(`${target.displayName} has been blocked`);
    close();
    try { await submitBlock(target.userId); } catch { /* silent – already notified */ }
  };

  /* Report submit */
  const handleReport = async () => {
    if (!reason) return;
    setStep("submitting");

    const payload = {
      target_type: (target.kind === "message" ? "message" : target.kind) as "user" | "room" | "message",
      target_id: target.kind === "user" ? target.userId
                : target.kind === "room" ? target.roomId
                : target.messageId,
      reason,
      notes: notes.trim() || undefined,
    };

    try {
      await submitReport(payload);
    } catch {
      /* silent — we still show success to avoid confirming the user reported */
    }
    setStep("done");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={close}>
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in" />

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] bg-card rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom duration-300 border-t border-border"
      >
        {/* Handle */}
        <div className="mx-auto h-1 w-10 rounded-full bg-border mb-4" />

        {/* Close */}
        <button
          onClick={close}
          className="absolute top-5 right-5 h-8 w-8 rounded-full bg-secondary flex items-center justify-center"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step: Menu */}
        {step === "menu" && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Moderation</p>
              <h2 className="text-lg font-bold mt-0.5 truncate">{targetLabel}</h2>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setStep("report-reason")}
                className="w-full flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left hover:border-destructive/30 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                  <Flag className="h-4.5 w-4.5 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Report {target.kind}</p>
                  <p className="text-xs text-muted-foreground">Let the team know what's wrong</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              </button>

              {target.kind === "user" && (
                <button
                  onClick={handleBlock}
                  disabled={blocking}
                  className="w-full flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left hover:border-orange-500/30 transition-colors"
                >
                  <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                    <Ban className="h-4.5 w-4.5 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Block {target.displayName}</p>
                    <p className="text-xs text-muted-foreground">They won't see your profile or rooms</p>
                  </div>
                  {blocking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </button>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground text-center px-4">
              Reports are reviewed by Loop's trust & safety team. Abuse of reporting will result in account action.
            </p>
          </div>
        )}

        {/* Step: Pick reason */}
        {step === "report-reason" && (
          <div className="space-y-4">
            <div>
              <button onClick={() => setStep("menu")} className="text-xs text-muted-foreground mb-2">← Back</button>
              <h2 className="text-lg font-bold">Why are you reporting this?</h2>
              <p className="text-sm text-muted-foreground">Select the main issue.</p>
            </div>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => { setReason(r.key); setStep("report-notes"); }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    reason === r.key ? "border-destructive/50 bg-destructive/5" : "border-border bg-surface hover:border-destructive/20",
                  )}
                >
                  <AlertTriangle className="h-4 w-4 text-destructive/70 shrink-0" />
                  <span className="text-sm">{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Optional notes */}
        {step === "report-notes" && (
          <div className="space-y-4">
            <div>
              <button onClick={() => setStep("report-reason")} className="text-xs text-muted-foreground mb-2">← Back</button>
              <h2 className="text-lg font-bold">Add details (optional)</h2>
              <p className="text-sm text-muted-foreground">More context helps us act faster.</p>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Describe what happened…"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm resize-none outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
            />
            <p className="text-[10px] text-muted-foreground text-right">{notes.length}/500</p>
            <button
              onClick={handleReport}
              className="w-full h-11 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold"
            >
              Submit report
            </button>
          </div>
        )}

        {/* Step: Submitting */}
        {step === "submitting" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-semibold">Submitting your report…</p>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <div>
              <p className="text-base font-bold">Report received</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Thank you. Our trust &amp; safety team will review this and take action if needed.
              </p>
            </div>
            <button
              onClick={close}
              className="h-10 rounded-xl bg-foreground text-background text-sm font-semibold px-6"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
