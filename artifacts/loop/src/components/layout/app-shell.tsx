// Loop — App Shell
// P2-FIX-002: Bottom navigation hidden when inside a room (/rooms/*).
// Room page is full-screen and manages its own controls.
// LILCKY STUDIO LIMITED

import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { BottomNav } from "./bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const inRoom = pathname.startsWith("/rooms/");

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <main className={inRoom ? "flex-1" : "flex-1 pb-24"}>{children}</main>
      {!inRoom && <BottomNav />}
    </div>
  );
}
