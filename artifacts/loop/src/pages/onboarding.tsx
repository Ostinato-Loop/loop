/**
 * Loop Progressive Trust Onboarding
 *
 * Principle: Ask only when needed. Explain why. Show immediate value. Allow skip.
 *
 * Flow: [already collected: phone via OTP login]
 *   Step 1 — Name:        "What should we call you?" (display_name)
 *   Step 2 — Enter Loop:  Jump into a live room or start exploring
 *
 * Everything else (location, interests, avatar, bio, handle) is collected
 * progressively in context — when the user attempts the feature that needs it.
 *
 * LILCKY STUDIO LIMITED
 */

import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { authedSupabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { listRooms, type Room } from "@/lib/api/rooms";
import { Loader2, Users, Mic, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["name", "enter"] as const;
type Step = typeof STEPS[number];

export default function OnboardingPage() {
  const { user, loading, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [stepIdx, setStepIdx] = useState(0);
  const step: Step = STEPS[stepIdx];

  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy]               = useState(false);
  const [rooms, setRooms]             = useState<Room[]>([]);

  /* ── Redirect if not authed or already onboarded ── */
  useEffect(() => {
    if (!loading && !user) navigate("/login");
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      if (profile.onboarded) navigate("/");
    }
  }, [loading, user, profile, navigate]);

  /* ── Fetch live rooms when on Enter step ── */
  useEffect(() => {
    if (step !== "enter") return;
    listRooms({ limit: 4 }).then(setRooms).catch(() => {});
  }, [step]);

  const nameValid = displayName.trim().length >= 2 && displayName.trim().length <= 40;

  /* ── Derive a username from display_name (used internally, editable later) ── */
  function deriveUsername(name: string): string {
    const slug = name.trim().toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 20);
    return slug.length >= 3 ? slug : `user_${Date.now().toString(36).slice(-5)}`;
  }

  /* ── Save display_name and auto-derived username, advance to step 2 ── */
  const submitName = async () => {
    if (!nameValid || busy || !user) return;
    setBusy(true);
    try {
      const username = deriveUsername(displayName);
      await authedSupabase()
        .from("profiles")
        .update({ display_name: displayName.trim(), username })
        .eq("id", user.id);
      setStepIdx(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save — try again");
    } finally {
      setBusy(false);
    }
  };

  /* ── Mark onboarded and enter Loop ── */
  const enterLoop = async (roomId?: string) => {
    setBusy(true);
    try {
      await authedSupabase()
        .from("profiles")
        .update({ onboarded: true })
        .eq("id", user!.id);
      await refreshProfile();
      navigate(roomId ? `/rooms/${roomId}` : "/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not continue");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 py-8">

      {/* Progress dots */}
      <div className="mb-8 flex gap-2">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              stepIdx >= i ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>

      {/* ── Step 1: Name ── */}
      {step === "name" && (
        <div className="flex flex-col flex-1 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Welcome to Loop</p>
            <h1 className="font-display text-3xl font-extrabold leading-tight">
              What should we<br />call you?
            </h1>
            <p className="text-sm text-muted-foreground">
              This is what others hear when you speak. You can change it any time.
            </p>
          </div>

          <div className="space-y-3">
            <Input
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Ada O."
              className="h-14 text-lg rounded-xl border-border bg-surface"
              maxLength={40}
              onKeyDown={(e) => { if (e.key === "Enter" && nameValid) submitName(); }}
            />
            <p className="text-xs text-muted-foreground pl-1">
              {displayName.trim().length}/40 characters
            </p>
          </div>

          <div className="mt-auto pt-8">
            <Button
              onClick={submitName}
              disabled={!nameValid || busy}
              className="h-14 w-full rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint text-base"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <span className="flex items-center gap-2">Continue <ArrowRight className="h-4 w-4" /></span>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Enter Loop ── */}
      {step === "enter" && (
        <div className="flex flex-col flex-1 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">You're in</p>
            <h1 className="font-display text-3xl font-extrabold leading-tight">
              Hey {displayName.trim() || "there"} 👋
            </h1>
            <p className="text-sm text-muted-foreground">
              Jump into a live room or explore on your own.
            </p>
          </div>

          {/* Live rooms */}
          {rooms.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary live-dot inline-block" />
                Live now
              </p>
              {rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => enterLoop(r.id)}
                  disabled={busy}
                  className="w-full rounded-2xl border border-border bg-surface p-4 text-left transition-all active:scale-[0.98] hover:border-primary/40"
                >
                  <p className="font-display font-semibold leading-tight line-clamp-1">{r.title}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {r.audience_count ?? 0} listening
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-6 text-center space-y-2">
              <div className="mx-auto h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
                <Mic className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold">No live rooms right now</p>
              <p className="text-xs text-muted-foreground">Be the first — start a room from the feed.</p>
            </div>
          )}

          <div className="mt-auto pt-8 flex flex-col gap-3">
            {rooms.length === 0 && (
              <Button
                onClick={() => enterLoop()}
                disabled={busy}
                className="h-14 w-full rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint text-base"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enter Loop"}
              </Button>
            )}
            <button
              type="button"
              onClick={() => enterLoop()}
              disabled={busy}
              className="text-sm text-muted-foreground underline underline-offset-2 py-2"
            >
              {rooms.length > 0 ? "Skip — explore on my own" : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
