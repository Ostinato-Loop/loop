/**
 * Loop — Login redirect page
 * Phase H: Identity Axiom. Loop does NOT own authentication.
 *
 * P1-FIX-001: Show a 2-second interstitial explaining RALD sign-in before
 * redirect. Users no longer see an unexpected domain change with no explanation.
 *
 * AUTH-RECOVERY-001 (2026-06-10): "Sign in with email" fallback.
 *   Users who cannot access their phone can sign in inline via email OTP
 *   without contacting support or leaving Loop. Cancels the RALD redirect.
 *
 * Auth flow:
 *   /login?next=/rooms/abc
 *     → profiles.rald.cloud/login?app_id=loop&redirect_to=.../auth/callback?next=/rooms/abc
 *     → /auth/callback?next=/rooms/abc   (rald_token exchanged by AuthProvider)
 *     → /rooms/abc
 *
 * Email OTP flow (fallback):
 *   User taps "Can't access your phone?" → enters email → enters 6-digit code
 *   → Worker issues loop_session cookie → window.location.replace(next)
 *
 * Visual design is unchanged. Do NOT redesign.
 * LILCKY STUDIO LIMITED
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { setSessionToken } from "@/lib/session-store";
import { Loader2, Shield, Mail, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PROFILES_URL    = import.meta.env.VITE_RALD_AUTH_URL ?? "https://profiles.rald.cloud";
const API_BASE        = import.meta.env.VITE_API_BASE_URL  ?? "";
const INTERSTITIAL_MS = 300;

export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";

  /* ── RALD redirect state ── */
  const [redirecting, setRedirecting]   = useState(false);
  const redirectTimerRef                = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Email OTP fallback state ── */
  const [emailFlow, setEmailFlow]       = useState(false);
  const [emailStep, setEmailStep]       = useState<"email" | "code">("email");
  const [emailInput, setEmailInput]     = useState("");
  const [sessionToken, setSessionTok]   = useState("");
  const [codeInput, setCodeInput]       = useState("");
  const [emailBusy, setEmailBusy]       = useState(false);
  const [emailError, setEmailError]     = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      navigate(next, { replace: true });
      return;
    }
    if (!loading && !emailFlow) {
      setRedirecting(true);
      redirectTimerRef.current = setTimeout(() => {
        const callbackBase = `${window.location.origin}/auth/callback`;
        const callbackUrl  = next && next !== "/"
          ? `${callbackBase}?next=${encodeURIComponent(next)}`
          : callbackBase;
        window.location.href =
          `${PROFILES_URL}/login?app_id=loop&redirect_to=${encodeURIComponent(callbackUrl)}`;
      }, INTERSTITIAL_MS);
    }
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, emailFlow]);

  function activateEmailFlow() {
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    setRedirecting(false);
    setEmailFlow(true);
    setEmailError(null);
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setEmailBusy(true);
    setEmailError(null);
    try {
      const res  = await fetch(`${API_BASE}/api/auth/send-email-otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: emailInput.trim().toLowerCase() }),
      });
      const data = await res.json() as { sessionToken?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");
      if (!data.sessionToken) throw new Error("No session token returned");
      setSessionTok(data.sessionToken);
      setEmailStep("code");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!codeInput.trim()) return;
    setEmailBusy(true);
    setEmailError(null);
    try {
      const res  = await fetch(`${API_BASE}/api/auth/verify-email-otp`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ sessionToken, code: codeInput.trim() }),
      });
      const data = await res.json() as {
        access_token?: string;
        newUser?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Incorrect or expired code");
      if (data.newUser) {
        // Email has no account — redirect to RALD to complete sign-up
        const callbackBase = `${window.location.origin}/auth/callback`;
        const callbackUrl  = next && next !== "/" ? `${callbackBase}?next=${encodeURIComponent(next)}` : callbackBase;
        window.location.href = `${PROFILES_URL}/login?app_id=loop&redirect_to=${encodeURIComponent(callbackUrl)}`;
        return;
      }
      if (!data.access_token) throw new Error("Sign-in failed — try again");
      // Store in-memory token; cookie is set server-side
      setSessionToken(data.access_token);
      window.location.replace(window.location.origin + (next !== "/" ? next : "/"));
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEmailBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  /* ── Email OTP fallback UI ── */
  if (emailFlow) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-xs space-y-6">
          <button
            type="button"
            onClick={() => { setEmailFlow(false); setEmailStep("email"); setEmailError(null); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </button>

          <div className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Mail className="h-7 w-7 text-primary" />
            </div>
            <h1 className="font-display text-xl font-bold">
              {emailStep === "email" ? "Sign in with email" : "Check your inbox"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {emailStep === "email"
                ? "Enter the email on your Loop account. We'll send a one-time code."
                : `We sent a 6-digit code to ${emailInput}. Enter it below.`}
            </p>
          </div>

          {emailStep === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-3">
              <Input
                type="email"
                placeholder="you@example.com"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                className="h-12 text-center"
                autoFocus
                autoComplete="email"
              />
              {emailError && (
                <p className="text-xs text-destructive text-center">{emailError}</p>
              )}
              <Button
                type="submit"
                disabled={emailBusy || !emailInput.trim()}
                className="h-12 w-full rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint"
              >
                {emailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-3">
              <Input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                value={codeInput}
                onChange={e => setCodeInput(e.target.value.replace(/\D/g, ""))}
                className="h-12 text-center tracking-[0.3em] font-mono text-lg"
                autoFocus
                autoComplete="one-time-code"
              />
              {emailError && (
                <p className="text-xs text-destructive text-center">{emailError}</p>
              )}
              <Button
                type="submit"
                disabled={emailBusy || codeInput.length < 6}
                className="h-12 w-full rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint"
              >
                {emailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify code"}
              </Button>
              <button
                type="button"
                onClick={() => { setEmailStep("email"); setCodeInput(""); setEmailError(null); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Didn't receive it? Try again
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  /* ── Default: RALD redirect interstitial ── */
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center space-y-6 max-w-xs w-full">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Shield className="h-8 w-8 text-primary" />
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-xl font-bold">Signing you in</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Loop uses <span className="font-semibold text-foreground">RALD</span> to verify your
            phone number securely. You'll receive a one-time code, then return here automatically.
          </p>
        </div>

        {redirecting && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Opening RALD…</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Your data is never shared with third parties.
        </p>

        {/* AUTH-RECOVERY-001: Email fallback — no phone access / changed number */}
        <button
          type="button"
          onClick={activateEmailFlow}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Can't access your phone? Sign in with email instead
        </button>
      </div>
    </div>
  );
}
