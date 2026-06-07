/**
 * Loop — Login redirect page
 * Phase H: Identity Axiom. Loop does NOT own authentication.
 *
 * P1-FIX-001: Show a 2-second interstitial explaining RALD sign-in before
 * redirect. Household users no longer see an unexpected domain change with
 * no explanation.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Shield } from "lucide-react";

const PROFILES_URL = import.meta.env.VITE_RALD_AUTH_URL ?? "https://profiles.rald.cloud";
const INTERSTITIAL_MS = 2200;

export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate("/", { replace: true });
      return;
    }
    if (!loading) {
      // Show interstitial briefly, then redirect
      setRedirecting(true);
      const t = setTimeout(() => {
        const redirectTo = encodeURIComponent(window.location.origin + "/");
        window.location.href = `${PROFILES_URL}/login?app_id=loop&redirect_to=${redirectTo}`;
      }, INTERSTITIAL_MS);
      return () => clearTimeout(t);
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center space-y-6 max-w-xs w-full">
        {/* Logo mark */}
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
      </div>
    </div>
  );
}
