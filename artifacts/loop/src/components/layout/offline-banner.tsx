/**
 * Loop — OfflineBanner
 * Part 13: Poor Network Audit.
 * Shown inside AppShell when the user is offline or on a slow connection.
 * Dismissible on slow-connection; permanent (until online) for offline.
 * LILCKY STUDIO LIMITED
 */

import { useState } from "react";
import { WifiOff, Wifi, X } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const { online, quality } = useNetworkStatus();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed whenever we go fully offline
  if (!online && dismissed) setDismissed(false);

  if (online && quality === "good") return null;
  if (dismissed) return null;

  const isOffline = !online;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold",
        isOffline
          ? "bg-destructive/10 text-destructive border-b border-destructive/20"
          : "bg-amber-500/10 text-amber-600 border-b border-amber-500/20",
      )}
      role="alert"
    >
      {isOffline
        ? <WifiOff className="h-3.5 w-3.5 shrink-0" />
        : <Wifi className="h-3.5 w-3.5 shrink-0" />}
      <span className="flex-1">
        {isOffline
          ? "You're offline — showing cached data"
          : "Slow connection — things may load slowly"}
      </span>
      {!isOffline && (
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-full p-0.5 hover:bg-amber-500/20 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
