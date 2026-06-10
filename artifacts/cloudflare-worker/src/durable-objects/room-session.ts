/**
 * RoomSession Durable Object
 *
 * One DO instance per live room. Manages:
 *  - Speaker hand-raise queue (V1)
 *  - Host presence tracking via heartbeat + alarm (DISCONNECT-001)
 *  - Future: sub-100ms globally-consistent room state, WebSocket presence
 *
 * DISCONNECT-001 (2026-06-10): Host disconnect recovery.
 *   The host frontend sends POST /api/rooms/:roomId/heartbeat every 60s.
 *   Each heartbeat resets a DO alarm to fire in 5 minutes.
 *   If the alarm fires (no heartbeat for 5 min), the room is auto-ended:
 *     - is_live = false, audience_count = 0 written to Supabase
 *     - All room_participants rows deleted
 *   This prevents stale "live" rooms from piling up in the feed when
 *   a host closes the app, loses connectivity, or their device dies.
 *
 * Flow:
 *   Room created → POST /heartbeat (roomId, hostId) →
 *     DO stores hostId, sets alarm(now + 5min) →
 *   Every 60s host sends heartbeat →
 *     DO resets alarm(now + 5min) →
 *   Host disconnects → alarm fires after 5min →
 *     DO calls Supabase: end room → done.
 */

import type { CloudflareEnv } from "../types/env.js";

const HEARTBEAT_TIMEOUT_MS  = 5 * 60 * 1000; // 5 minutes
const ALARM_STORAGE_KEY     = "alarm_set";
const HOST_ID_STORAGE_KEY   = "host_id";
const ROOM_ID_STORAGE_KEY   = "room_id";

export class RoomSession implements DurableObject {
  private state: DurableObjectState;
  private env:   CloudflareEnv;
  private handQueue: string[] = [];

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    this.state = state;
    this.env   = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (path === "/heartbeat" && request.method === "POST") {
      return this.handleHeartbeat(request);
    }
    if (path === "/raise-hand" && request.method === "POST") {
      return this.handleRaiseHand(request);
    }
    if (path === "/lower-hand" && request.method === "POST") {
      return this.handleLowerHand(request);
    }
    if (path === "/queue" && request.method === "GET") {
      return Response.json({ queue: this.handQueue });
    }
    if (path === "/cancel-alarm" && request.method === "POST") {
      await this.state.storage.deleteAlarm();
      return Response.json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  }

  // ── alarm() — called by CF runtime when the alarm fires ──────────────
  // If the host hasn't sent a heartbeat in HEARTBEAT_TIMEOUT_MS, end the room.
  async alarm(): Promise<void> {
    const roomId = await this.state.storage.get<string>(ROOM_ID_STORAGE_KEY);
    const hostId = await this.state.storage.get<string>(HOST_ID_STORAGE_KEY);

    if (!roomId) {
      console.warn("[RoomSession/alarm] no roomId in storage — nothing to clean up");
      return;
    }

    console.log(JSON.stringify({
      level:   "info",
      event:   "room_auto_ended",
      reason:  "host_disconnect_timeout",
      roomId,
      hostId,
      service: "room-session-do",
      ts:      new Date().toISOString(),
    }));

    await this.endRoom(roomId);
  }

  // ── Private: heartbeat handler ─────────────────────────────────────
  private async handleHeartbeat(req: Request): Promise<Response> {
    const body = await req.json<{ roomId: string; hostId: string }>();

    await this.state.storage.put(ROOM_ID_STORAGE_KEY, body.roomId);
    await this.state.storage.put(HOST_ID_STORAGE_KEY, body.hostId);

    // Reset (or set) the alarm to fire in 5 minutes from now
    await this.state.storage.setAlarm(Date.now() + HEARTBEAT_TIMEOUT_MS);
    await this.state.storage.put(ALARM_STORAGE_KEY, Date.now());

    return Response.json({ ok: true, alarmAt: new Date(Date.now() + HEARTBEAT_TIMEOUT_MS).toISOString() });
  }

  // ── Private: end room via Supabase REST ───────────────────────────
  private async endRoom(roomId: string): Promise<void> {
    const sbUrl = this.env.SUPABASE_URL;
    const sbKey = this.env.SUPABASE_SERVICE_ROLE_KEY;
    const headers: Record<string, string> = {
      apikey:         sbKey,
      Authorization:  `Bearer ${sbKey}`,
      "Content-Type": "application/json",
      Accept:         "application/json",
    };

    try {
      // 1. Mark room ended
      await fetch(`${sbUrl}/rest/v1/rooms?id=eq.${roomId}`, {
        method:  "PATCH",
        headers,
        body:    JSON.stringify({ is_live: false, audience_count: 0 }),
      });

      // 2. Clean up participants
      await fetch(`${sbUrl}/rest/v1/room_participants?room_id=eq.${roomId}`, {
        method: "DELETE",
        headers,
      });

      // 3. Queue AI summary via Supabase (insert into a job queue table)
      //    TASK_QUEUE is not directly accessible from DOs, so we record it
      //    in a pending_jobs table that the Worker cron picks up.
      await fetch(`${sbUrl}/rest/v1/pending_jobs`, {
        method:  "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body:    JSON.stringify({
          type:        "ai_summary",
          payload:     JSON.stringify({ roomId }),
          created_at:  new Date().toISOString(),
        }),
      }).catch(() => { /* table may not exist yet — non-fatal */ });

    } catch (err) {
      console.error("[RoomSession/alarm] endRoom failed:", err);
    }
  }

  // ── Hand-raise handlers (unchanged from V1) ────────────────────────
  private async handleRaiseHand(req: Request): Promise<Response> {
    const { userId } = await req.json<{ userId: string }>();
    if (!this.handQueue.includes(userId)) {
      this.handQueue.push(userId);
      await this.state.storage.put("handQueue", this.handQueue);
    }
    return Response.json({ ok: true, position: this.handQueue.indexOf(userId) + 1 });
  }

  private async handleLowerHand(req: Request): Promise<Response> {
    const { userId } = await req.json<{ userId: string }>();
    this.handQueue = this.handQueue.filter((id) => id !== userId);
    await this.state.storage.put("handQueue", this.handQueue);
    return Response.json({ ok: true });
  }
}
