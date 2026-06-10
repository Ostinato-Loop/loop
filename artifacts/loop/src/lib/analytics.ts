/**
 * Loop Analytics — fire-and-forget event tracker.
 *
 * Architecture: POSTs to /api/analytics (Cloudflare Worker) rather than
 * hitting Supabase directly. This keeps the Supabase type definitions clean —
 * the loop_events table is not in the generated types until migration 012 is
 * applied in production. The worker endpoint handles the raw REST insert.
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

export type LoopEvent =
  | "login"
  | "signup"
  | "onboarding_complete"
  | "username_claimed"
  | "room_create"
  | "room_join"
  | "room_leave"
  | "room_end"
  | "session_start"
  | "page_view";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

let _sessionId: string | null = null;

function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = sessionStorage.getItem("loop_sid") ?? crypto.randomUUID().slice(0, 16);
    sessionStorage.setItem("loop_sid", _sessionId);
  }
  return _sessionId;
}

function getToken(): string | null {
  return localStorage.getItem("loop_token");
}

function post(event: LoopEvent, properties: Record<string, unknown>): void {
  const token = getToken();
  if (!token) return; // don't track unauthenticated events — no user_id to attach

  const body = JSON.stringify({
    event,
    properties: { ...properties, path: window.location.pathname },
    session_id: getSessionId(),
    ts: Date.now(),
  });

  // fetch with keepalive:true survives page unload in modern browsers.
  // sendBeacon is intentionally not used — it doesn't support custom headers
  // and we need Authorization: Bearer <token> on every request.
  fetch(`${API_BASE}/api/analytics`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${token}`,
    },
    body,
    keepalive: true, // survives page unload in modern browsers
  }).catch(() => {
    // swallow — analytics must never surface errors to the user
  });
}

export function track(
  event: LoopEvent,
  properties: Record<string, unknown> = {},
): void {
  try {
    post(event, properties);
  } catch {
    // swallow all synchronous errors
  }
}

/**
 * Track session_start and register a pagehide handler to capture session end.
 * Call once when AuthProvider confirms a valid session.
 */
export function trackSessionStart(): void {
  const startMs = Date.now();
  track("session_start");

  const handleLeave = () => {
    track("session_start", { duration_s: Math.round((Date.now() - startMs) / 1000), _phase: "end" });
  };

  window.addEventListener("pagehide", handleLeave, { once: true });
}
