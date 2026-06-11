// Loop App — V1 Final Stabilization + Auth Hardening
// ProtectedRoute: unauthenticated → /login?next=. Not onboarded → /onboarding.
// /auth/callback: dedicated landing page after profiles.rald.cloud authentication.
// ErrorBoundary: catches unhandled React render errors, shows branded recovery UI.
// All existing routes, layout, and design unchanged.
// LILCKY STUDIO LIMITED

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { LoopStoreProvider } from "@/lib/loop-store";
import { Loader2 } from "lucide-react";
import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

import FeedPage          from "@/pages/feed";
import DiscoverPage      from "@/pages/discover";
import LoginPage         from "@/pages/login";
import AuthCallbackPage  from "@/pages/auth-callback";
import OnboardingPage    from "@/pages/onboarding";
import CreatePage        from "@/pages/create";
import MessagesPage      from "@/pages/messages";
import MeLaunchPage      from "@/pages/me-launch";
import RoomPage          from "@/pages/room";
import LivePage          from "@/pages/live";
import SettingsPage      from "@/pages/settings";
import TrustCenterPage   from "@/pages/trust-center";
import NotificationsPage from "@/pages/notifications";
import SearchPage        from "@/pages/search";
import CommunitiesPage   from "@/pages/communities";
import NotFound          from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 2, refetchOnWindowFocus: false },
  },
});

// ── ErrorBoundary ──────────────────────────────────────────────────────────────
// Catches unhandled React render errors — shows a branded recovery screen
// instead of a blank white page. Never exposes stack traces to users.
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console for developer visibility — never shown to users
    console.error("[Loop ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-6 px-6 text-center max-w-sm">
            <div style={{display:"flex",gap:2,alignItems:"center"}}>
              <span style={{fontSize:26,fontWeight:900,letterSpacing:-1,color:"#FFFFFF",fontFamily:"system-ui"}}>L</span>
              <span style={{fontSize:26,fontWeight:900,letterSpacing:-1,color:"#2ECFA3",fontFamily:"system-ui"}}>O</span>
              <span style={{fontSize:26,fontWeight:900,letterSpacing:-1,color:"#FFFFFF",fontFamily:"system-ui"}}>OP</span>
            </div>
            <p className="text-sm text-muted-foreground">Something went wrong. Tap below to reload.</p>
            <button
              onClick={() => window.location.reload()}
              className="h-11 px-8 rounded-xl text-sm font-semibold"
              style={{background:"#2ECFA3",color:"#0A1F16"}}
            >
              Reload Loop
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * ProtectedRoute — guards every page that requires an authenticated session.
 */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div style={{display:"flex",gap:2,alignItems:"center"}}>
            <span style={{fontSize:26,fontWeight:900,letterSpacing:-1,color:"#FFFFFF",fontFamily:"system-ui"}}>L</span>
            <span style={{fontSize:26,fontWeight:900,letterSpacing:-1,color:"#2ECFA3",fontFamily:"system-ui"}}>O</span>
            <span style={{fontSize:26,fontWeight:900,letterSpacing:-1,color:"#FFFFFF",fontFamily:"system-ui"}}>OP</span>
          </div>
          <Loader2 className="h-5 w-5 animate-spin" style={{color:"#2ECFA3"}} />
        </div>
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (profile !== null && !profile.onboarded && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LoopStoreProvider>
            <BrowserRouter basename={base}>
              <Routes>
                {/* ── Public — no auth required ─────────────────────── */}
                <Route path="/login"         element={<LoginPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />

                {/* ── Protected — requires authenticated session ─────── */}
                <Route path="/"              element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />
                <Route path="/discover"      element={<ProtectedRoute><DiscoverPage /></ProtectedRoute>} />
                <Route path="/live"          element={<ProtectedRoute><LivePage /></ProtectedRoute>} />
                <Route path="/messages"      element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                <Route path="/me"            element={<ProtectedRoute><MeLaunchPage /></ProtectedRoute>} />
                <Route path="/rooms/:roomId" element={<ProtectedRoute><RoomPage /></ProtectedRoute>} />

                {/* ── Auth / onboarding ─────────────────────────────── */}
                <Route path="/onboarding"    element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

                {/* ── Create ────────────────────────────────────────── */}
                <Route path="/create"        element={<ProtectedRoute><CreatePage /></ProtectedRoute>} />
                <Route path="/create/:kind"  element={<ProtectedRoute><CreatePage /></ProtectedRoute>} />

                {/* ── Search, Notifications, Communities ───────────── */}
                <Route path="/search"        element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
                <Route path="/communities"   element={<ProtectedRoute><CommunitiesPage /></ProtectedRoute>} />

                {/* ── Settings & Trust Center ───────────────────────── */}
                <Route path="/settings"      element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/trust-center"  element={<ProtectedRoute><TrustCenterPage /></ProtectedRoute>} />

                {/* ── Catch-all ─────────────────────────────────────── */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            <Toaster position="top-center" />
          </LoopStoreProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
