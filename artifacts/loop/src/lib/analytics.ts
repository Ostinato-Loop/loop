/**
 * Loop Analytics — fire-and-forget event tracker.
 *
 * Rules:
 *   - Never await. Never block UI. Never throw.
 *   - Swallow all errors silently.
 *   - One session ID per browser tab (sessionStorage).
 *
 * Usage:
 *   track("room_join", { room_id: "...", category: "community" });
 *
 * LILCKY STUDIO LIMITED
 */

import { authedSupabase } from "@/integrations/supabase/client";

export type LoopEvent =
  | "login"
  | "signup"
  | "onboarding_complete"
  | "room_create"
  | "room_join"
  | "room_leave"
  | "session_start"
  | "page_view";

let _sessionId: string | null = null;

function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = sessionStorage.getItem("loop_sid") ?? crypto.randomUUID().slice(0, 16);
    sessionStorage.setItem("loop_sid", _sessionId);
  }
  return _sessionId;
}

export function track(
  event: LoopEvent,
  properties: Record<string, unknown> = {},
): void {
  try {
    const db = authedSupabase();
    db.from("loop_events")
      .insert({
        event,
        properties: {
          ...properties,
          path: window.location.pathname,
        },
        session_id: getSessionId(),
      })
      .then(({ error }) => {
        if (error && error.code !== "42P01") {
          // 42P01 = table doesn't exist yet — migration pending, ignore
          console.warn("[analytics]", event, error.code, error.message);
        }
      });
  } catch {
    // analytics must never break the app
  }
}

/**
 * Track session duration when the user leaves.
 * Call once when AuthProvider confirms a valid session.
 */
export function trackSessionStart(): void {
  const startMs = Date.now();
  track("session_start");

  const handleLeave = () => {
    const duration_s = Math.round((Date.now() - startMs) / 1000);
    // use sendBeacon so it fires even during page unload
    try {
      const db = authedSupabase();
      db.from("loop_events").insert({
        event: "session_start",
        properties: { duration_s, path: window.location.pathname },
        session_id: getSessionId(),
      });
    } catch { /* swallow */ }
  };

  window.addEventListener("pagehide", handleLeave, { once: true });
}
