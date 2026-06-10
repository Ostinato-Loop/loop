/**
 * Loop — usePush Hook
 * Manages push notification permission state and subscription lifecycle.
 *
 * PUSH-001 (2026-06-10)
 * LILCKY STUDIO LIMITED
 *
 * Usage:
 *   const { state, prompt, dismiss } = usePush();
 *
 *   state: PushState — "unsupported" | "denied" | "prompt" | "subscribed" | "unsubscribed"
 *   prompt(): triggers permission request + subscription
 *   dismiss(): marks "don't ask again" for this session
 */

import { useState, useEffect, useCallback } from "react";
import {
  getPushState,
  subscribeToPush,
  listenForSubscriptionChange,
  type PushState,
} from "@/lib/push";
import { useAuth } from "@/hooks/use-auth";

interface UsePushResult {
  state:    PushState;
  loading:  boolean;
  prompt:   () => Promise<void>;
  dismiss:  () => void;
}

const SESSION_DISMISSED_KEY = "loop:push:dismissed";

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

  // Listen for SW key rotation
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const cleanup = listenForSubscriptionChange();
    return cleanup;
  }, []);

  const prompt = useCallback(async () => {
    setLoading(true);
    try {
      const next = await subscribeToPush();
      setState(next);
      // Clear session-dismissed flag if they successfully subscribed
      if (next === "subscribed") {
        sessionStorage.removeItem(SESSION_DISMISSED_KEY);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    // Mark dismissed for this browser session — won't prompt again until next session
    sessionStorage.setItem(SESSION_DISMISSED_KEY, "1");
    setState(prev => prev === "prompt" ? "unsubscribed" : prev);
  }, []);

  return { state, loading, prompt, dismiss };
}

/* ── Push Prompt Banner ──────────────────────────────────────────────
 * Drop-in UI component that shows a nudge banner to users who haven't
 * enabled push yet. Import separately so pages can opt-in individually.
 *
 * Usage:
 *   import { PushPromptBanner } from "@/hooks/use-push";
 *   <PushPromptBanner />
 */

import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function PushPromptBanner({ className }: { className?: string }) {
  const { state, loading, prompt, dismiss } = usePush();
  const [busy, setBusy] = useState(false);

  // Don't show if: unsupported, denied, already subscribed, loading, or dismissed this session
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
          className="text-xs font-bold bg-primary text-primary-foreground px-3 py-1.5 rounded-full neon-glow disabled:opacity-60 transition-opacity"
        >
          {busy ? "…" : "Enable"}
        </button>
        <button
          onClick={dismiss}
          className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
