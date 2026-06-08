/**
 * Loop Analytics — Server-side event ingestion
 * POST /api/analytics
 *
 * Receives batches of events from the Loop frontend and writes them
 * to Supabase using the service role key (bypasses RLS).
 * This covers cases where the client Supabase token isn't available
 * (e.g., pre-login page views, session_end sendBeacon).
 *
 * Auth: optional — if Authorization header present, user_id extracted from JWT.
 * If not present, user_id from body is used (unverified, low-trust events).
 *
 * LILCKY STUDIO LIMITED
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";

type EventPayload = {
  event: string;
  properties?: Record<string, unknown>;
  session_id?: string;
  user_id?: string;
  ts?: number;
};

const app = new Hono<{ Bindings: CloudflareEnv }>();

app.post("/", async (c) => {
  const sbUrl = c.env.SUPABASE_URL;
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  let body: { events?: EventPayload[]; event?: string; properties?: Record<string, unknown>; session_id?: string; user_id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Accept a single event or a batch
  const rawEvents: EventPayload[] = body.events
    ? body.events
    : [{ event: body.event ?? "", properties: body.properties, session_id: body.session_id, user_id: body.user_id }];

  if (!rawEvents.length) return c.json({ ok: true, inserted: 0 });

  // Try to extract user_id from the Authorization header
  let authedUserId: string | null = null;
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token  = authHeader.slice(7);
      const [, b64] = token.split(".");
      const payload = JSON.parse(atob(b64.replace(/-/g, "+").replace(/_/g, "/")));
      authedUserId  = (payload.id ?? payload.sub ?? null) as string | null;
    } catch { /* malformed token — skip */ }
  }

  const rows = rawEvents
    .filter((e) => e.event && typeof e.event === "string")
    .map((e) => ({
      event:      e.event.slice(0, 64),
      user_id:    authedUserId ?? e.user_id ?? null,
      properties: {
        ...(e.properties ?? {}),
        _server_ingested: true,
      },
      session_id: e.session_id ?? null,
      created_at: e.ts ? new Date(e.ts).toISOString() : new Date().toISOString(),
    }))
    .filter((r) => r.user_id !== null);  // discard anonymous events for now

  if (!rows.length) return c.json({ ok: true, inserted: 0 });

  try {
    const resp = await fetch(`${sbUrl}/rest/v1/loop_events`, {
      method: "POST",
      headers: {
        apikey:        sbKey,
        Authorization: `Bearer ${sbKey}`,
        "Content-Type": "application/json",
        Prefer:        "return=minimal",
      },
      body: JSON.stringify(rows),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      // 42P01 = table doesn't exist yet — migration pending, treat as ok
      if (err.includes("42P01") || err.includes("does not exist")) {
        console.warn("[analytics] loop_events table not found — migration pending");
        return c.json({ ok: true, inserted: 0, pending_migration: true });
      }
      console.error("[analytics] insert error:", resp.status, err.slice(0, 200));
      return c.json({ ok: false, error: "insert failed" }, 500);
    }

    return c.json({ ok: true, inserted: rows.length });
  } catch (err) {
    console.error("[analytics] fetch error:", err);
    return c.json({ ok: false, error: "internal error" }, 500);
  }
});

export { app as analytics };
