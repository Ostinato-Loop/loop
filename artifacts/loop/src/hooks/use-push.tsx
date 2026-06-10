/**
 * Loop — usePush Hook (OneSignal)
 * PUSH-001 (2026-06-10): Replaced VAPID with OneSignal.
 * LILCKY STUDIO LIMITED
 */
import { useState, useEffect, useCallback } from "react";
import { Bell, X } from "lucide-react";
import {
  getPushState,
  subscribeToPush,
  identifyPushUser,
  type PushState,
} from "@/lib/push";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const SESSION_DISMISSED_KEY = "loop:push:dismissed";

interface UsePushResult {
  state:   PushState;
  loading: boolean;
  prompt:  () => Promise<void>;
  dismiss: () => void;
}

export function usePush(): UsePushResult {
  const { user } = useAuth();
  const [state,   setState]   = useState<PushState>("prompt");
  const [loading, setLoading] = useState(true);

  // Fetch initial push state
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getPushState()
      .then(setState)
      .catch(() => setState("unsupported"))
      .finally(() => setLoading(false));
  }, [user]);

  // Set OneSignal external user ID whenever the user authenticates
  useEffect(() => {
    if (!user) return;
    identifyPushUser(user.id).catch(() => {});
  }, [user?.id]);

  const prompt = useCallback(async () => {
    setLoading(true);
    try {
      const next = await subscribeToPush();
      setState(next);
      if (next === "subscribed") sessionStorage.removeItem(SESSION_DISMISSED_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    sessionStorage.setItem(SESSION_DISMISSED_KEY, "1");
    setState(prev => prev === "prompt" ? "unsubscribed" : prev);
  }, []);

  return { state, loading, prompt, dismiss };
}

/* ── PushPromptBanner ─────────────────────────────────────────────── */
export function PushPromptBanner({ className }: { className?: string }) {
  const { state, loading, prompt, dismiss } = usePush();
  const [busy, setBusy] = useState(false);

  const dismissed = typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(SESSION_DISMISSED_KEY) === "1";

  if (loading || dismissed || state === "subscribed" || state === "denied" || state === "unsupported") {
    return null;
  }

  const handleEnable = async () => {
    setBusy(true);
    await prompt();
    setBusy(false);
  };

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/6 px-4 py-3",
      className,
    )}>
      <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Bell className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-primary">Stay in the loop</p>
        <p className="text-[10px] text-primary/70 mt-0.5">
          Get notified when creators you follow go live
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleEnable}
          disabled={busy}
          className="text-xs font-bold bg-primary text-primary-foreground px-3 py-1.5 rounded-full neon-glow disabled:opacity-60"
        >
          {busy ? "…" : "Enable"}
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
