/**
 * Loop — Auth Callback Page
 *
 * Landing page after profiles.rald.cloud authentication.
 * The rald_token param is detected and exchanged by AuthProvider (use-auth.tsx).
 * This page shows a branded loading state, then navigates to the intended
 * destination preserved in the `next` search param.
 *
 * Visual design matches login.tsx — same background, same logo, same tone.
 * Do NOT redesign.
 *
 * LILCKY STUDIO LIMITED
 */
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { LoopMark } from "@/components/loop-logo";

export default function AuthCallbackPage() {
  const { user, loading, ssoError } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Preserved by login.tsx so we land the user where they intended to go
  const next = params.get("next") ?? "/";

  useEffect(() => {
    if (!loading && user) {
      navigate(next, { replace: true });
    }
  }, [user, loading, next, navigate]);

  // SSO exchange failed — show a minimal error with retry
  if (ssoError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center space-y-5 max-w-xs w-full">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <LoopMark className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-lg font-bold">Sign-in failed</h1>
            <p className="text-sm text-muted-foreground">{ssoError}</p>
          </div>
          <button
            onClick={() => navigate("/login", { replace: true })}
            className="text-sm text-primary underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Auth exchange in progress
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <LoopMark className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-1.5">
          <p className="font-display text-sm font-semibold">Signing you in to Loop</p>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Just a moment…</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 max-w-[200px] mx-auto leading-relaxed">
          Your RALD profile powers all RALD apps.
        </p>
      </div>
    </div>
  );
}
