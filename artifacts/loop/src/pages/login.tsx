/**
 * Loop — Login redirect page
 * Phase H: Identity Axiom. Loop does NOT own authentication.
 * Redirect immediately to profiles.rald.cloud with return context.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

const PROFILES_URL = import.meta.env.VITE_RALD_AUTH_URL ?? "https://profiles.rald.cloud";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate          = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/", { replace: true });
      return;
    }
    if (!loading) {
      // Redirect to RALD Profiles — the identity authority
      const redirectTo = encodeURIComponent(window.location.origin + "/");
      window.location.href = `${PROFILES_URL}/login?app_id=loop&redirect_to=${redirectTo}`;
    }
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Connecting to RALD Profiles…</p>
      </div>
    </div>
  );
}
