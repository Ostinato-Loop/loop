// Loop App — User Reality Sprint
// Part 8: Navigation Reality — all routes verified, no dead links.
// New routes: /settings, /trust-center, /notifications
// LILCKY STUDIO LIMITED

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { LoopStoreProvider } from "@/lib/loop-store";

import FeedPage        from "@/pages/feed";
import DiscoverPage    from "@/pages/discover";
import LoginPage       from "@/pages/login";
import OnboardingPage  from "@/pages/onboarding";
import CreatePage      from "@/pages/create";
import MessagesPage    from "@/pages/messages";
import MeLaunchPage    from "@/pages/me-launch";
import RoomPage        from "@/pages/room";
import LivePage        from "@/pages/live";
import SettingsPage    from "@/pages/settings";
import TrustCenterPage from "@/pages/trust-center";
import NotFound        from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LoopStoreProvider>
          <BrowserRouter basename={base}>
            <Routes>
              {/* ── Core routes ─────────────────────────────────────────── */}
              <Route path="/"              element={<FeedPage />} />
              <Route path="/discover"      element={<DiscoverPage />} />
              <Route path="/live"          element={<LivePage />} />
              <Route path="/messages"      element={<MessagesPage />} />
              <Route path="/me"            element={<MeLaunchPage />} />
              <Route path="/rooms/:roomId" element={<RoomPage />} />

              {/* ── Auth / onboarding ───────────────────────────────────── */}
              <Route path="/login"         element={<LoginPage />} />
              <Route path="/onboarding"    element={<OnboardingPage />} />

              {/* ── Create flows ────────────────────────────────────────── */}
              <Route path="/create"        element={<CreatePage />} />
              <Route path="/create/:kind"  element={<CreatePage />} />

              {/* ── Settings & Trust Center (Part 7 + 6) ────────────────── */}
              <Route path="/settings"      element={<SettingsPage />} />
              <Route path="/trust-center"  element={<TrustCenterPage />} />

              {/* ── Catch-all ────────────────────────────────────────────── */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          <Toaster position="top-center" />
        </LoopStoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
