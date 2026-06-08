// Loop — App Shell
// P2-FIX-002: Bottom navigation hidden when inside a room (/rooms/*).
// Part 13: OfflineBanner shown at top of every shell page on offline/slow connection.
// Mobile: pt-[env(safe-area-inset-top)] so headers clear the iPhone notch/Dynamic Island
// when the app is launched in standalone/fullscreen mode (apple-mobile-web-app-capable).
// LILCKY STUDIO LIMITED

import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { BottomNav } from "./bottom-nav";
import { OfflineBanner } from "./offline-banner";

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const inRoom = pathname.startsWith("/rooms/");

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <OfflineBanner />
      <main className={inRoom ? "flex-1" : "flex-1 pb-24"}>{children}</main>
      {!inRoom && <BottomNav />}
    </div>
  );
}
