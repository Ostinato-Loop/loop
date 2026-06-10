/**
 * CleanupCoordinator — Singleton Durable Object
 *
 * CRON-DISABLED-001 workaround (2026-06-10):
 *   The CF free-plan account-level cron limit (5) was exhausted by other workers,
 *   so the loop-api cron trigger is disabled in wrangler.toml.
 *   This DO replicates the same 10-minute sweep by perpetually rescheduling its
 *   own alarm — no cron quota consumed.
 *
 * Singleton pattern:
 *   Always accessed via env.CLEANUP_COORDINATOR.idFromName("global").
 *   Only ONE instance ever exists on the account.
 *
 * Bootstrap:
 *   The shallow GET /health route calls POST /arm on startup (idempotent).
 *   Once armed, the DO reschedules itself on every alarm() — self-sustaining.
 */

import type { CloudflareEnv } from "../types/env.js";
import { cleanupStaleRooms } from "../services/room-cleanup.js";

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes — matches the disabled cron schedule

export class CleanupCoordinator implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env:   CloudflareEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /arm — idempotent bootstrap; only sets alarm if not already scheduled
    if (url.pathname === "/arm" && request.method === "POST") {
      const existing = await this.state.storage.getAlarm();
      if (!existing) {
        const next = Date.now() + INTERVAL_MS;
        await this.state.storage.setAlarm(next);
        return Response.json({ ok: true, armed: true, nextRun: new Date(next).toISOString() });
      }
      return Response.json({ ok: true, armed: false, nextRun: new Date(existing).toISOString() });
    }

    // GET /status — inspect when the next sweep is scheduled
    if (url.pathname === "/status" && request.method === "GET") {
      const next = await this.state.storage.getAlarm();
      return Response.json({
        ok:      true,
        nextRun: next ? new Date(next).toISOString() : null,
        service: "cleanup-coordinator-do",
      });
    }

    return new Response("Not found", { status: 404 });
  }

  // ── alarm() — CF runtime calls this when the scheduled time is reached ──
  async alarm(): Promise<void> {
    const t0 = Date.now();
    console.log(JSON.stringify({
      level:   "info",
      event:   "cleanup_coordinator_run",
      service: "cleanup-coordinator-do",
      ts:      new Date().toISOString(),
    }));

    try {
      await cleanupStaleRooms(this.env);
    } catch (err) {
      console.error(JSON.stringify({
        level:   "error",
        event:   "cleanup_coordinator_error",
        error:   String(err),
        service: "cleanup-coordinator-do",
        ts:      new Date().toISOString(),
      }));
    } finally {
      // Reschedule unconditionally — even on failure — so the loop never breaks
      const next = Date.now() + INTERVAL_MS;
      await this.state.storage.setAlarm(next);
      console.log(JSON.stringify({
        level:   "info",
        event:   "cleanup_coordinator_rescheduled",
        ms:      Date.now() - t0,
        nextRun: new Date(next).toISOString(),
        service: "cleanup-coordinator-do",
        ts:      new Date().toISOString(),
      }));
    }
  }
}
