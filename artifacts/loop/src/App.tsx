// Loop App — Phase H: Identity Axiom + Foundation Lockdown Sprint
// Main entry routes for Loop Audio Platform.
// Profiles.rald.cloud is the identity authority — Loop consumes it.
// LILCKY STUDIO LIMITED
//
// P0-007 FIX: Route /rooms/:roomId to RoomPage (room.tsx) — the complete
// room implementation with Supabase Realtime, participant grid, and
// floating reactions. room-launch.tsx is retained for reference only.

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { LoopStoreProvider } from "@/lib/loop-store";

import FeedPage       from "@/pages/feed";
import DiscoverPage   from "@/pages/discover";
import LoginPage      from "@/pages/login";
import OnboardingPage from "@/pages/onboarding";
import CreatePage     from "@/pages/create";
import MessagesPage   from "@/pages/messages";
import MeLaunchPage   from "@/pages/me-launch";
import RoomPage       from "@/pages/room";

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
              {/* ── Core launch routes ─────────────────────────────────── */}
              <Route path="/"           element={<FeedPage />} />
              <Route path="/discover"   element={<DiscoverPage />} />
              <Route path="/messages"   element={<MessagesPage />} />
              <Route path="/me"         element={<MeLaunchPage />} />
              <Route path="/rooms/:roomId" element={<RoomPage />} />

              {/* ── Auth / onboarding ──────────────────────────────────── */}
              <Route path="/login"      element={<LoginPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />

              {/* ── Create flows ──────────────────────────────────────── */}
              <Route path="/create"          element={<CreatePage />} />
              <Route path="/create/:kind"    element={<CreatePage />} />

              {/* ── Catch-all ─────────────────────────────────────────── */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster position="top-center" />
        </LoopStoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
