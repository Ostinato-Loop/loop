/**
 * useNotificationCount — polls GET /api/notifications/count every 60 seconds.
 *
 * RETENTION-005 (2026-06-10): Notification badge polling hook.
 *   - Initial fetch on mount so the badge appears immediately.
 *   - 60-second interval keeps it fresh without hammering the API.
 *   - Auto-resets to 0 when the user navigates to /notifications
 *     (the page marks all as read server-side on load).
 *   - Cleans up on unmount — no leaked intervals.
 *
 * Usage: const count = useNotificationCount();
 *
 * LILCKY STUDIO LIMITED
 */

import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { fetchUnreadCount } from "@/lib/api/notifications";

const POLL_INTERVAL_MS = 60_000;

export function useNotificationCount(): number {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);

  // Immediately clear the badge when the user opens the notifications page.
  // The page calls markNotificationsRead(true) on load, so the next poll
  // will also return 0 — but clearing here gives instant visual feedback.
  useEffect(() => {
    if (pathname === "/notifications") {
      setCount(0);
    }
  }, [pathname]);

  // Initial fetch + interval poll
  useEffect(() => {
    let active = true;

    const poll = async () => {
      const n = await fetchUnreadCount().catch(() => 0);
      if (active) setCount(n);
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return count;
}

/**
 * Format a raw unread count into a badge label.
 *   0  → null   (caller should hide the badge)
 *   1–9 → "1" … "9"
 *   10+ → "9+"
 */
export function formatBadgeCount(count: number): string | null {
  if (count <= 0)  return null;
  if (count <= 9)  return String(count);
  return "9+";
}
