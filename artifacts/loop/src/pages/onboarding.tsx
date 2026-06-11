/**
 * Loop — Username-First Progressive Onboarding
 *
 * IDENTITY-001 (2026-06-10): @username is now the primary Loop identity.
 *   Replaces the old "display name first" flow.
 *
 * Flow:
 *   Step 1 — @username: Pick your handle. Live availability check.
 *             Persists username in profiles. Calls /api/auth/username/check.
 *   Step 2 — Display name: What others see when you speak.
 *             Defaults to @username if skipped.
 *   Step 3 — Enter Loop: Jump into a live room or explore solo.
 *
 * Everything else (location, interests, avatar, bio) collected progressively
 * in context — when the user attempts the feature that needs it.
 *
 * LILCKY STUDIO LIMITED
 */

import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { authedSupabase } from "@/integrations/supabase/client";
import { authFetch } from "@/lib/api-fetch";
import { track } from "@/lib/analytics";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { listRooms, type Room } from "@/lib/api/rooms";
import {
  AtSign, ArrowRight, BadgeCheck, CheckCircle2, Loader2,
  Mic, Users, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

const STEPS = ["username", "displayname", "enter"] as const;
type Step = typeof STEPS[number];

function validateUsernameFormat(u: string): string | null {
  if (u.length < 2)  return "At least 2 characters";
  if (u.length > 20) return "20 characters maximum";
  if (!/^[a-z0-9_]+$/.test(u)) return "Letters, numbers, and underscores only";
  if (u.startsWith("_") || u.endsWith("_")) return "Cannot start or end with _";
  if (/_{2,}/.test(u)) return "No consecutive underscores";
  return null;
}

type AvailabilityState = "idle" | "checking" | "available" | "taken" | "error";

export default function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [stepIdx, setStepIdx]     = useState(0);
  const step: Step                = STEPS[stepIdx];

  const [username,     setUsername]     = useState("");
  const [displayName,  setDisplayName]  = useState("");
  const [availability, setAvailability] = useState<AvailabilityState>("idle");
  const [availReason,  setAvailReason]  = useState<string | null>(null);
  const [busy,         setBusy]         = useState(false);
  const [rooms,        setRooms]        = useState<Room[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Already-onboarded redirect ────────────────────────────────────── */
  useEffect(() => {
    if (profile) {
      if (profile.onboarded) navigate("/");
      if (profile.username)     setUsername(profile.username);
      if (profile.display_name) setDisplayName(profile.display_name);
    }
  }, [profile, navigate]);

  /* ── Fetch live rooms when on Enter step ────────────────────────────── */
  useEffect(() => {
    if (step !== "enter") return;
    listRooms({ limit: 4 }).then(setRooms).catch(() => {});
  }, [step]);

  /* ── Live availability check (debounced 400 ms) ─────────────────────── */
  const checkAvailability = useCallback((lower: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const formatErr = validateUsernameFormat(lower);
    if (formatErr) {
      setAvailability("error");
      setAvailReason(formatErr);
      return;
    }

    setAvailability("checking");
    setAvailReason(null);

    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`${API_BASE}/api/auth/username/check/${encodeURIComponent(lower)}`);
        const data = await res.json() as { available: boolean; reason: string | null };
        setAvailability(data.available ? "available" : "taken");
        setAvailReason(data.reason ?? null);
      } catch {
        // Fallback: check Supabase profiles directly
        try {
          const { data: rows } = await authedSupabase()
            .from("profiles")
            .select("id")
            .eq("username", lower)
            .limit(1);
          const taken = !!(rows && rows.length > 0);
          setAvailability(taken ? "taken" : "available");
          setAvailReason(taken ? "Username is already taken" : null);
        } catch {
          setAvailability("idle");
        }
      }
    }, 400);
  }, []);

  const handleUsernameChange = (raw: string) => {
    const lower = raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(lower);
    if (lower.length < 2) {
      setAvailability("idle");
      setAvailReason(null);
      return;
    }
    checkAvailability(lower);
  };

  const usernameValid = availability === "available";

  /* ── Step 1: Claim username ─────────────────────────────────────────── */
  const submitUsername = async () => {
    if (!usernameValid || busy || !user) return;
    setBusy(true);
    try {
      // Try to claim via auth endpoint (non-fatal if unavailable)
      await authFetch(`${API_BASE}/api/auth/username/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      }).catch(() => null);

      // Always persist to Loop profiles (primary UI source of truth)
      const { error } = await authedSupabase()
        .from("profiles")
        .update({ username })
        .eq("id", user.id);
      if (error) throw new Error(error.message);

      track("username_claimed", { username });
      setStepIdx(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not claim — try again");
    } finally {
      setBusy(false);
    }
  };

  /* ── Step 2: Save display name ──────────────────────────────────────── */
  const displayNameValid =
    displayName.trim().length === 0 ||
    (displayName.trim().length >= 1 && displayName.trim().length <= 40);

  const submitDisplayName = async () => {
    if (!displayNameValid || busy || !user) return;
    setBusy(true);
    try {
      const finalName = displayName.trim() || username;
      await authedSupabase()
        .from("profiles")
        .update({ display_name: finalName })
        .eq("id", user.id);
      setDisplayName(finalName);
      setStepIdx(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save — try again");
    } finally {
      setBusy(false);
    }
  };

  /* ── Step 3: Enter Loop ─────────────────────────────────────────────── */
  const enterLoop = async (roomId?: string) => {
    setBusy(true);
    try {
      await authedSupabase()
        .from("profiles")
        .update({ onboarded: true })
        .eq("id", user!.id);
      track("onboarding_complete", {
        entered_room: !!roomId,
        room_id:      roomId ?? null,
        username,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile — try again");
      setBusy(false);
      return;
    }
    // refreshProfile is non-fatal: profile already saved in DB.
    // If it fails (network blip), navigate anyway — AuthProvider will re-fetch on mount.
    try { await refreshProfile(); } catch { /* non-fatal */ }
    navigate(roomId ? `/rooms/${roomId}` : "/");
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

      {/* ── Step 1: @Username ──────────────────────────────────────────────── */}
      {step === "username" && (
        <div className="flex flex-col flex-1 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your identity</p>
            <h1 className="font-display text-3xl font-extrabold leading-tight">
              Choose your<br />@username
            </h1>
            <p className="text-sm text-muted-foreground">
              Your unique Loop handle. You can&apos;t change it for 30 days after claiming.
            </p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground pointer-events-none">
                <AtSign className="h-5 w-5" />
              </div>
              <Input
                autoFocus
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="yourhandle"
                className={cn(
                  "h-14 text-lg rounded-xl border-border bg-surface pl-11 pr-12",
                  availability === "available" && "border-green-500/60",
                  availability === "taken"     && "border-destructive/60",
                )}
                maxLength={20}
                onKeyDown={(e) => { if (e.key === "Enter" && usernameValid) void submitUsername(); }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                {availability === "checking"  && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                {availability === "available" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                {(availability === "taken" || availability === "error") && <XCircle className="h-5 w-5 text-destructive" />}
              </div>
            </div>

            <div className="h-4">
              {availability === "available" && (
                <p className="text-xs text-green-600 font-medium flex items-center gap-1 pl-1">
                  <CheckCircle2 className="h-3 w-3" /> @{username} is available
                </p>
              )}
              {(availability === "taken" || availability === "error") && availReason && (
                <p className="text-xs text-destructive flex items-center gap-1 pl-1">
                  <XCircle className="h-3 w-3" /> {availReason}
                </p>
              )}
              {availability === "idle" && username.length > 0 && (
                <p className="text-xs text-muted-foreground pl-1">
                  Letters, numbers, underscores — no spaces
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground pl-1">{username.length}/20</p>
          </div>

          {/* Identity preview card */}
          {availability === "available" && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-primary/70">Your Loop identity</p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                  {username[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">@{username}</p>
                  <p className="text-xs text-muted-foreground truncate">{username}.loop.rald.me</p>
                </div>
                <BadgeCheck className="ml-auto h-5 w-5 text-primary/60 shrink-0" />
              </div>
            </div>
          )}

          <div className="mt-auto pt-6">
            <Button
              onClick={submitUsername}
              disabled={!usernameValid || busy}
              className="h-14 w-full rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint text-base"
            >
              {busy
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <span className="flex items-center gap-2">Claim @{username || "handle"} <ArrowRight className="h-4 w-4" /></span>
              }
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Display Name ───────────────────────────────────────────── */}
      {step === "displayname" && (
        <div className="flex flex-col flex-1 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Step 2 of 3 · Your name</p>
            <h1 className="font-display text-3xl font-extrabold leading-tight">
              What should<br />we call you?
            </h1>
            <p className="text-sm text-muted-foreground">
              This is what others see when you speak. Optional — defaults to @{username}.
            </p>
          </div>

          <div className="space-y-3">
            <Input
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={`e.g. Ada O. (default: @${username})`}
              className="h-14 text-lg rounded-xl border-border bg-surface"
              maxLength={40}
              onKeyDown={(e) => { if (e.key === "Enter") void submitDisplayName(); }}
            />
            <p className="text-xs text-muted-foreground pl-1">
              {displayName.trim().length}/40 · Can always be changed later
            </p>
          </div>

          <div className="mt-auto pt-6 flex flex-col gap-3">
            <Button
              onClick={submitDisplayName}
              disabled={!displayNameValid || busy}
              className="h-14 w-full rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint text-base"
            >
              {busy
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <span className="flex items-center gap-2">Continue <ArrowRight className="h-4 w-4" /></span>
              }
            </Button>
            <button
              type="button"
              onClick={() => void submitDisplayName()}
              disabled={busy}
              className="text-sm text-muted-foreground underline underline-offset-2 py-2"
            >
              Skip — use @{username}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Enter Loop ────────────────────────────────────────────── */}
      {step === "enter" && (
        <div className="flex flex-col flex-1 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">You&apos;re in</p>
            <h1 className="font-display text-3xl font-extrabold leading-tight">
              Hey {displayName.trim() || `@${username}`} 👋
            </h1>
            <p className="text-sm text-muted-foreground">
              Jump into a live room or explore on your own.
            </p>
          </div>

          {/* Identity confirmation */}
          <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
              {(displayName.trim() || username)[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{displayName.trim() || username}</p>
              <p className="text-xs text-muted-foreground">@{username}</p>
            </div>
            <BadgeCheck className="ml-auto h-5 w-5 text-primary shrink-0" />
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
                  onClick={() => void enterLoop(r.id)}
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

          <div className="mt-auto pt-6 flex flex-col gap-3">
            <Button
              onClick={() => void enterLoop()}
              disabled={busy}
              className="h-14 w-full rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint text-base"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enter Loop"}
            </Button>
            {rooms.length > 0 && (
              <button
                type="button"
                onClick={() => void enterLoop()}
                disabled={busy}
                className="text-sm text-muted-foreground underline underline-offset-2 py-2"
              >
                Skip — explore on my own
              </button>
            )}

            {/* TRUST-003 (2026-06-11): Trust & privacy links on final onboarding step */}
            <div className="flex items-center justify-center gap-3 pt-1">
              <a href="/trust-center" className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">Privacy Policy</a>
              <span className="text-muted-foreground/30 text-[11px]">·</span>
              <a href="/trust-center" className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">Trust Center</a>
              <span className="text-muted-foreground/30 text-[11px]">·</span>
              <a href="/trust-center?section=community-standards" className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">Community Standards</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
