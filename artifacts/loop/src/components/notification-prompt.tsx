/**
 * Loop — NotificationPrompt
 * Part 19: Day-1 Retention.
 * Shown on the Me page (and optionally after onboarding) when push
 * permission is "default" (not yet asked). Auto-dismissed once granted or denied.
 * Stored dismissal in localStorage so it doesn't reappear every session.
 * LILCKY STUDIO LIMITED
 */

import { useState } from "react";
import { Bell, X, BellRing } from "lucide-react";
import { usePushPermission } from "@/hooks/use-push-permission";
import { toast } from "sonner";

const DISMISS_KEY = "loop_notif_prompt_dismissed";

export function NotificationPrompt() {
  const { permission, requestPermission } = usePushPermission();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1",
  );
  const [asking, setAsking] = useState(false);

  // Don't show if unsupported, already granted, denied, or dismissed
  if (permission !== "default" || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const handleEnable = async () => {
    setAsking(true);
    try {
      const result = await requestPermission();
      if (result === "granted") {
        toast.success("Notifications enabled — you won't miss a thing 🔔");
        dismiss();
      } else {
        toast.info("No problem — you can enable notifications in browser settings anytime.");
        dismiss();
      }
    } catch {
      dismiss();
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="mx-5 mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
      <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
        <BellRing className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">Never miss a live room</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          Get notified when someone you follow goes live or mentions you.
        </p>
        <div className="flex items-center gap-2 mt-2.5">
          <button
            onClick={handleEnable}
            disabled={asking}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground active:scale-95 transition-transform disabled:opacity-60"
          >
            <Bell className="h-3 w-3" />
            {asking ? "Asking…" : "Enable notifications"}
          </button>
          <button onClick={dismiss} className="text-xs text-muted-foreground underline underline-offset-2">
            Not now
          </button>
        </div>
      </div>
      <button onClick={dismiss} className="shrink-0 text-muted-foreground" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
