/**
 * Loop — Notifications API Client
 *
 * Typed wrapper for the three Loop API notification endpoints:
 *   GET  /api/notifications           — unread list (up to 50)
 *   GET  /api/notifications/count     — lightweight unread badge count
 *   POST /api/notifications/read      — mark read (ids[] or all:true)
 *
 * Types returned by the API: direct_message | friend_request | connection_accepted.
 * Follower/live-room/system notifications are synthesised client-side in the page.
 *
 * Uses authFetch() so the Loop JWT is always sent and silent-refresh is handled.
 * LILCKY STUDIO LIMITED
 */
import { authFetch } from "@/lib/api-fetch";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export type ApiNotif = {
  id:            string;
  type:          "direct_message" | "friend_request" | "connection_accepted";
  resource_id:   string | null;
  resource_type: string | null;
  data:          Record<string, unknown> | null;
  read_at:       string | null;
  created_at:    string;
  actor: {
    id:           string;
    username:     string | null;
    display_name: string | null;
    avatar_url:   string | null;
    is_verified:  boolean;
  } | null;
};

/** Fetch unread (or all) notifications from the DB via the Loop API worker. */
export async function fetchNotifications(opts?: {
  limit?: number;
  includeRead?: boolean;
}): Promise<ApiNotif[]> {
  const params = new URLSearchParams();
  if (opts?.limit)       params.set("limit", String(opts.limit));
  if (opts?.includeRead) params.set("include_read", "true");
  try {
    const res = await authFetch(`${API_BASE}/api/notifications?${params}`);
    if (!res.ok) return [];
    const body = await res.json() as { notifications?: ApiNotif[] };
    return body.notifications ?? [];
  } catch { return []; }
}

/** Lightweight unread count for the nav badge. */
export async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await authFetch(`${API_BASE}/api/notifications/count`);
    if (!res.ok) return 0;
    const body = await res.json() as { unread?: number };
    return body.unread ?? 0;
  } catch { return 0; }
}

/** Mark notifications as read.
 *  Pass `true` to mark all, or an array of IDs to mark specific ones. */
export async function markNotificationsRead(arg: string[] | true): Promise<void> {
  try {
    await authFetch(`${API_BASE}/api/notifications/read`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(arg === true ? { all: true } : { ids: arg }),
    });
  } catch { /* silent — badge will clear on next count refresh */ }
}
