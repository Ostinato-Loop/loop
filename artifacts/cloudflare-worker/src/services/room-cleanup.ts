/**
 * Loop — Room Cleanup Service
 *
 * DISCONNECT-001 (2026-06-10): Belt-and-suspenders backup for the DO alarm.
 *
 * Called by the CF Worker scheduled handler (cron every 10 minutes).
 * Finds rooms where is_live = true and last_heartbeat_at is older than
 * STALE_THRESHOLD_MIN, then ends them.
 *
 * This covers edge cases where the Durable Object alarm didn't fire
 * (e.g. DO eviction during a CF incident, missed alarm in early preview).
 *
 * LILCKY STUDIO LIMITED
 */

import type { CloudflareEnv } from "../types/env.js";

const STALE_THRESHOLD_MIN = 12; // a room with no heartbeat for 12min is stale

type StaleRoom = { id: string; title: string; host_id: string };

export async function cleanupStaleRooms(env: CloudflareEnv): Promise<void> {
  const sbUrl = env.SUPABASE_URL;
  const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers: Record<string, string> = {
    apikey:         sbKey,
    Authorization:  `Bearer ${sbKey}`,
    "Content-Type": "application/json",
    Accept:         "application/json",
  };

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60 * 1000).toISOString();

  // Find stale live rooms: live AND (heartbeat missing OR heartbeat too old)
  const qs = new URLSearchParams({
    select:   "id,title,host_id",
    is_live:  "eq.true",
    or:       `(last_heartbeat_at.is.null,last_heartbeat_at.lt.${cutoff})`,
    limit:    "50",
  });

  let stale: StaleRoom[] = [];
  try {
    const resp = await fetch(`${sbUrl}/rest/v1/rooms?${qs}`, { headers });
    if (!resp.ok) {
      console.error("[room-cleanup] query failed:", resp.status, await resp.text().catch(() => ""));
      return;
    }
    stale = await resp.json() as StaleRoom[];
  } catch (err) {
    console.error("[room-cleanup] fetch error:", err);
    return;
  }

  if (!stale.length) return;

  console.log(JSON.stringify({
    level:   "info",
    event:   "stale_room_cleanup",
    count:   stale.length,
    rooms:   stale.map((r) => r.id),
    service: "loop-api-cron",
    ts:      new Date().toISOString(),
  }));

  // End each stale room
  await Promise.allSettled(stale.map(async (room) => {
    try {
      // Mark ended
      await fetch(`${sbUrl}/rest/v1/rooms?id=eq.${room.id}`, {
        method:  "PATCH",
        headers,
        body:    JSON.stringify({ is_live: false, audience_count: 0 }),
      });
      // Remove participants
      await fetch(`${sbUrl}/rest/v1/room_participants?room_id=eq.${room.id}`, {
        method: "DELETE",
        headers,
      });
      console.log(JSON.stringify({
        level:   "info",
        event:   "stale_room_ended",
        roomId:  room.id,
        hostId:  room.host_id,
        service: "loop-api-cron",
        ts:      new Date().toISOString(),
      }));
    } catch (err) {
      console.error("[room-cleanup] end room failed:", room.id, err);
    }
  }));
}
