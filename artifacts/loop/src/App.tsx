// Loop App — V1 Final Stabilization + Auth Hardening
// ProtectedRoute: unauthenticated → /login?next=. Not onboarded → /onboarding.
// /auth/callback: dedicated landing page after profiles.rald.cloud authentication.
// All existing routes, layout, and design unchanged.
// LILCKY STUDIO LIMITED

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { LoopStoreProvider } from "@/lib/loop-store";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

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

/**
 * ProtectedRoute — guards every page that requires an authenticated session.
 *
 * 1. While auth resolves: spinner (prevents flash of empty content on cold load).
 * 2. No session:  → /login?next=<intended-path>  (preserved through auth callback)
 * 3. Authenticated but profile.onboarded === false AND not already at /onboarding:
 *    → /onboarding  (new user gate — lets first-time users set a display name before
 *    they enter the feed, without blocking users whose profile failed to load due to
 *    network error, since profile===null falls through rather than blocking).
 * 4. All other cases: render children as-is.
 *
 * No visual changes — design is unchanged.
 */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // profile===null means the /me fetch failed (network error) — don't block the user.
  // Only gate on onboarding when we know for certain profile.onboarded is false.
  if (profile !== null && !profile.onboarded && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
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
  );
}
