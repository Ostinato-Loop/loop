import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import DiscoverPage from "@/pages/discover";
import LoginPage from "@/pages/login";
import OnboardingPage from "@/pages/onboarding";
import CreatePage from "@/pages/create";
import LivePage from "@/pages/live";
import MessagesPage from "@/pages/messages";
import MePage from "@/pages/me";
import RoomPage from "@/pages/room";

const queryClient = new QueryClient();

export default function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={base}>
          <Routes>
            <Route path="/" element={<DiscoverPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/create" element={<CreatePage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/rooms/:roomId" element={<RoomPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
