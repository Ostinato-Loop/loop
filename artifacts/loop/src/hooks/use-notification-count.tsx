/**
 * useNotificationCount — real-time + polling hybrid notification badge counter.
 *
 * RETENTION-005 (2026-06-10): Initial polling implementation.
 * RETENTION-008 (2026-06-10): Upgraded to real-time + polling hybrid.
 *
 * Architecture:
 *   PRIMARY  — Supabase postgres_changes INSERT listener on `notifications`
 *              filtered to recipient_id=eq.{userId}.  Fires within ~200ms of
 *              a server-side insert, giving instant badge updates.
 *
 *   FALLBACK — 60-second poll via GET /api/notifications/count.
 *              Acts as a reconciliation safety net in case the WS connection
 *              drops, reconnects, or the realtime event is missed.
 *
 *   CLEAR    — Badge resets to 0 immediately when the user visits /notifications.
 *              The page marks all notifications read server-side on load, so
 *              the next poll also returns 0.
 *
 * LILCKY STUDIO LIMITED
 */

import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { supabase, getLoopToken } from "@/integrations/supabase/client";
import { fetchUnreadCount } from "@/lib/api/notifications";

const POLL_INTERVAL_MS = 60_000;

export function useNotificationCount(): number {
  const { pathname } = useLocation();
  const { user }     = useAuth();
  const [count, setCount] = useState(0);
  // Track whether the user is on the notifications page so we skip incrementing
  const onNotifPage = useRef(pathname === "/notifications");

  // Keep the ref in sync with pathname so the realtime handler can read it
  // without needing to be inside the pathname-dependent effect.
  useEffect(() => {
    onNotifPage.current = pathname === "/notifications";
    if (pathname === "/notifications") {
      setCount(0);
    }
  }, [pathname]);

  // ── Initial fetch + 60-second reconciliation poll ──────────────────────
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

  // ── Real-time: Supabase postgres_changes INSERT on notifications ────────
  // Fires within ~200ms of a server insert, giving instant badge increments
  // without waiting for the 60-second poll window.
  useEffect(() => {
    if (!user?.id) return;

    supabase.realtime.setAuth(getLoopToken() ?? "");

    const ch = supabase
      .channel(`notif-count:${user.id}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          // Only increment the badge when not already on /notifications.
          // If the user is viewing the page, the notifications page's own
          // realtime listener handles re-fetching and marking as read.
          if (!onNotifPage.current) {
            setCount(prev => prev + 1);
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [user?.id]);

  return count;
}

/**
 * Format a raw unread count into a badge label.
 *   0   → null   (caller should hide the badge)
 *   1–9 → "1" … "9"
 *   10+ → "9+"
 */
export function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  if (count <= 9) return String(count);
  return "9+";
}
