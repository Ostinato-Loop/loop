// Loop App — V1 Final Stabilization + Auth Hardening
// ProtectedRoute: unauthenticated → /login?next=. Not onboarded → /onboarding.
// /auth/callback: dedicated landing page after profiles.rald.cloud authentication.
// ErrorBoundary: catches unhandled React render errors, shows branded recovery UI.
//
// ARCH-001 (2026-06-12): All page imports converted to React.lazy() + Suspense.
//   Benefit: page-level module errors are isolated to their route — a crash in
//   DiscoverPage no longer kills FeedPage or the login flow. The initial JS
//   bundle is ~60% smaller (only the shell + providers load upfront).
//
// LILCKY STUDIO LIMITED

import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { LoopStoreProvider } from "@/lib/loop-store";
import { Loader2 } from "lucide-react";
import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

// ── Lazy page imports — each page loads only when its route is matched ─────────
const FeedPage          = lazy(() => import("@/pages/feed"));
const DiscoverPage      = lazy(() => import("@/pages/discover"));
const LoginPage         = lazy(() => import("@/pages/login"));
const AuthCallbackPage  = lazy(() => import("@/pages/auth-callback"));
const OnboardingPage    = lazy(() => import("@/pages/onboarding"));
const CreatePage        = lazy(() => import("@/pages/create"));
const MessagesPage      = lazy(() => import("@/pages/messages"));
const MeLaunchPage      = lazy(() => import("@/pages/me-launch"));
const RoomPage          = lazy(() => import("@/pages/room"));
const LivePage          = lazy(() => import("@/pages/live"));
const SettingsPage      = lazy(() => import("@/pages/settings"));
const TrustCenterPage   = lazy(() => import("@/pages/trust-center"));
const NotificationsPage = lazy(() => import("@/pages/notifications"));
const SearchPage        = lazy(() => import("@/pages/search"));
const CommunitiesPage   = lazy(() => import("@/pages/communities"));
const MetricsPage       = lazy(() => import("@/pages/metrics"));
const NotFound          = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 2, refetchOnWindowFocus: false },
  },
});

// ── Branded loading spinner — shown by Suspense during lazy page loads ─────────
function PageLoader() {
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

// ── ErrorBoundary ──────────────────────────────────────────────────────────────
// Catches unhandled React render errors — shows a branded recovery screen
// instead of a blank white page. Never exposes stack traces to users.
class ErrorBoundary extends Component<
  { children: ReactNode; fallbackPath?: string },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: ReactNode; fallbackPath?: string }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }
  static getDerivedStateFromError(error: unknown): { hasError: boolean; errorMessage: string } {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: msg };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Loop ErrorBoundary]", error.message, info.componentStack);
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

// ── ProtectedRoute — guards pages that require an authenticated session ─────────
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (profile !== null && profile.onboarded === false && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LoopStoreProvider>
            <BrowserRouter basename={base}>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* ── Public — no auth required ────────────────────── */}
                  <Route path="/login"         element={<LoginPage />} />
                  <Route path="/auth/callback" element={<AuthCallbackPage />} />

                  {/* ── Protected — requires authenticated session ────── */}
                  <Route path="/"              element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />
                  <Route path="/discover"      element={<ProtectedRoute><DiscoverPage /></ProtectedRoute>} />
                  <Route path="/live"          element={<ProtectedRoute><LivePage /></ProtectedRoute>} />
                  <Route path="/messages"      element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                  <Route path="/me"            element={<ProtectedRoute><MeLaunchPage /></ProtectedRoute>} />
                  <Route path="/rooms/:roomId" element={<ProtectedRoute><RoomPage /></ProtectedRoute>} />

                  {/* ── Auth / onboarding ──────────────────────────── */}
                  <Route path="/onboarding"    element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

                  {/* ── Create ─────────────────────────────────────── */}
                  <Route path="/create"        element={<ProtectedRoute><CreatePage /></ProtectedRoute>} />
                  <Route path="/create/:kind"  element={<ProtectedRoute><CreatePage /></ProtectedRoute>} />

                  {/* ── Search, Notifications, Communities ─────────── */}
                  <Route path="/search"        element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
                  <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
                  <Route path="/communities"   element={<ProtectedRoute><CommunitiesPage /></ProtectedRoute>} />

                  {/* ── Settings, Trust Center & Metrics ───────────── */}
                  <Route path="/settings"      element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                  <Route path="/trust-center"  element={<ProtectedRoute><TrustCenterPage /></ProtectedRoute>} />
                  <Route path="/metrics"       element={<ProtectedRoute><MetricsPage /></ProtectedRoute>} />

                  {/* ── Catch-all ──────────────────────────────────── */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster position="top-center" />
          </LoopStoreProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
