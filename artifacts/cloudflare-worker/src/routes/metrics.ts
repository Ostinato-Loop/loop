/**
 * Loop — Observability Metrics (Phase 8)
 * GET /api/metrics/overview  — rooms, DAU, auth stats
 * GET /api/metrics/rooms     — room creation/join/end rates
 * GET /api/metrics/retention — D1/D7 retention estimates
 * GET /api/metrics/auth      — OTP success rate, session counts
 *
 * Access: authenticated. In production, restrict to operator role.
 * OBSERVABILITY-001 (2026-06-10)
 * LILCKY STUDIO LIMITED
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";

const metrics = new Hono<{ Bindings: CloudflareEnv; Variables: { user: AuthUser } }>();

// ── GET /api/metrics/overview ─────────────────────────────────────────────────
metrics.get("/overview", requireAuth(), async (c) => {
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Accept: "application/json" };
  const now     = new Date();
  const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const week    = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [roomsAlive, roomsToday, profilesTotal, profilesToday, sessionsToday] = await Promise.allSettled([
    fetch(`${sbUrl}/rest/v1/rooms?is_live=eq.true&select=id`, { headers }),
    fetch(`${sbUrl}/rest/v1/rooms?created_at=gte.${today}&select=id`, { headers }),
    fetch(`${sbUrl}/rest/v1/profiles?select=id`, { headers }),
    fetch(`${sbUrl}/rest/v1/profiles?created_at=gte.${today}&select=id`, { headers }),
    fetch(`${sbUrl}/rest/v1/analytics_events?event=eq.session_start&created_at=gte.${today}&select=id`, { headers }),
  ]);

  const count = async (s: PromiseSettledResult<Response>) => {
    if (s.status !== "fulfilled" || !s.value.ok) return null;
    const data = await s.value.json() as unknown[];
    return Array.isArray(data) ? data.length : null;
  };

  const [live, createdToday, totalUsers, newUsersToday, sessionsCount] = await Promise.all([
    count(roomsAlive), count(roomsToday), count(profilesTotal), count(profilesToday), count(sessionsToday),
  ]);

  // Week-over-week rooms (approximate from analytics_events)
  const roomsWeek = await fetch(
    `${sbUrl}/rest/v1/analytics_events?event=eq.room_created&created_at=gte.${week}&select=id`,
    { headers },
  ).then(r => r.ok ? r.json().then((d: unknown) => (d as unknown[]).length) : null).catch(() => null);

  return c.json({
    timestamp: now.toISOString(),
    rooms: {
      live_now:       live,
      created_today:  createdToday,
      created_7d:     roomsWeek,
    },
    users: {
      total:          totalUsers,
      new_today:      newUsersToday,
    },
    sessions: {
      started_today:  sessionsCount,
    },
    service: "loop-api",
  });
});

// ── GET /api/metrics/rooms ────────────────────────────────────────────────────
metrics.get("/rooms", requireAuth(), async (c) => {
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Accept: "application/json" };
  const days    = Math.min(Number(c.req.query("days") ?? 7), 30);
  const since   = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [created, joined, byCategory] = await Promise.allSettled([
    fetch(`${sbUrl}/rest/v1/analytics_events?event=eq.room_created&created_at=gte.${since}&select=created_at,properties`, { headers }),
    fetch(`${sbUrl}/rest/v1/analytics_events?event=eq.room_joined&created_at=gte.${since}&select=created_at,properties`, { headers }),
    fetch(`${sbUrl}/rest/v1/rooms?created_at=gte.${since}&select=category&order=category`, { headers }),
  ]);

  type Event = { created_at: string; properties: Record<string, unknown> | null };
  type RoomRow = { category: string };

  const createdEvents: Event[] = created.status === "fulfilled" && created.value.ok
    ? await created.value.json() as Event[] : [];
  const joinedEvents: Event[] = joined.status === "fulfilled" && joined.value.ok
    ? await joined.value.json() as Event[] : [];
  const categoryRows: RoomRow[] = byCategory.status === "fulfilled" && byCategory.value.ok
    ? await byCategory.value.json() as RoomRow[] : [];

  // Aggregate by day
  const byDay: Record<string, { created: number; joined: number }> = {};
  for (const e of createdEvents) {
    const day = e.created_at.split("T")[0];
    byDay[day] = byDay[day] ?? { created: 0, joined: 0 };
    byDay[day].created++;
  }
  for (const e of joinedEvents) {
    const day = e.created_at.split("T")[0];
    byDay[day] = byDay[day] ?? { created: 0, joined: 0 };
    byDay[day].joined++;
  }
  const timeline = Object.entries(byDay).sort().map(([date, v]) => ({ date, ...v }));

  // Category breakdown
  const byCat: Record<string, number> = {};
  for (const r of categoryRows) byCat[r.category] = (byCat[r.category] ?? 0) + 1;

  return c.json({
    period_days: days,
    since,
    total_created: createdEvents.length,
    total_joined:  joinedEvents.length,
    avg_joins_per_room: createdEvents.length > 0
      ? Math.round((joinedEvents.length / createdEvents.length) * 10) / 10
      : 0,
    timeline,
    by_category: byCat,
    timestamp:   new Date().toISOString(),
  });
});

// ── GET /api/metrics/retention ────────────────────────────────────────────────
metrics.get("/retention", requireAuth(), async (c) => {
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Accept: "application/json" };

  const d1ago  = new Date(Date.now() -  1 * 24 * 60 * 60 * 1000).toISOString();
  const d7ago  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const d30ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const today  = new Date(Date.now()).toISOString().split("T")[0];

  const [dau, wau, mau, newD1, newD7] = await Promise.allSettled([
    fetch(`${sbUrl}/rest/v1/analytics_events?event=eq.session_start&created_at=gte.${d1ago}&select=user_id`, { headers }),
    fetch(`${sbUrl}/rest/v1/analytics_events?event=eq.session_start&created_at=gte.${d7ago}&select=user_id`, { headers }),
    fetch(`${sbUrl}/rest/v1/analytics_events?event=eq.session_start&created_at=gte.${d30ago}&select=user_id`, { headers }),
    fetch(`${sbUrl}/rest/v1/profiles?created_at=gte.${d1ago}&select=id`, { headers }),
    fetch(`${sbUrl}/rest/v1/profiles?created_at=gte.${d7ago}&select=id`, { headers }),
  ]);

  const uniqueUsers = async (s: PromiseSettledResult<Response>) => {
    if (s.status !== "fulfilled" || !s.value.ok) return null;
    const rows = await s.value.json() as { user_id: string }[];
    return new Set(rows.map(r => r.user_id)).size;
  };
  const countRows = async (s: PromiseSettledResult<Response>) => {
    if (s.status !== "fulfilled" || !s.value.ok) return null;
    const rows = await s.value.json() as unknown[];
    return rows.length;
  };

  const [dauCount, wauCount, mauCount, newD1Count, newD7Count] = await Promise.all([
    uniqueUsers(dau), uniqueUsers(wau), uniqueUsers(mau), countRows(newD1), countRows(newD7),
  ]);

  const d1Retention = dauCount && newD1Count && newD1Count > 0
    ? Math.round((dauCount / newD1Count) * 100) : null;
  const d7Retention = wauCount && newD7Count && newD7Count > 0
    ? Math.round((wauCount / newD7Count) * 100) : null;

  return c.json({
    timestamp: new Date().toISOString(),
    dau:       dauCount,
    wau:       wauCount,
    mau:       mauCount,
    new_users_d1:    newD1Count,
    new_users_d7:    newD7Count,
    d1_retention_pct: d1Retention,
    d7_retention_pct: d7Retention,
    stickiness_pct: mauCount && dauCount ? Math.round((dauCount / mauCount) * 100) : null,
  });
});

// ── GET /api/metrics/auth ─────────────────────────────────────────────────────
metrics.get("/auth", requireAuth(), async (c) => {
  const sbUrl   = c.env.SUPABASE_URL;
  const sbKey   = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Accept: "application/json" };
  const since   = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [logins, registrations, otpSent, otpVerified] = await Promise.allSettled([
    fetch(`${sbUrl}/rest/v1/analytics_events?event=eq.login&created_at=gte.${since}&select=id`, { headers }),
    fetch(`${sbUrl}/rest/v1/analytics_events?event=eq.signup&created_at=gte.${since}&select=id`, { headers }),
    fetch(`${sbUrl}/rest/v1/analytics_events?event=eq.otp_sent&created_at=gte.${since}&select=id`, { headers }),
    fetch(`${sbUrl}/rest/v1/analytics_events?event=eq.otp_verified&created_at=gte.${since}&select=id`, { headers }),
  ]);

  const count = async (s: PromiseSettledResult<Response>) => {
    if (s.status !== "fulfilled" || !s.value.ok) return null;
    return ((await s.value.json() as unknown[]).length);
  };

  const [loginCount, regCount, sentCount, verifiedCount] = await Promise.all([
    count(logins), count(registrations), count(otpSent), count(otpVerified),
  ]);

  const otpSuccessRate = sentCount && verifiedCount
    ? Math.round((verifiedCount / sentCount) * 100) : null;

  return c.json({
    period: "24h",
    since,
    logins_24h:         loginCount,
    registrations_24h:  regCount,
    otp_sent_24h:       sentCount,
    otp_verified_24h:   verifiedCount,
    otp_success_rate_pct: otpSuccessRate,
    timestamp: new Date().toISOString(),
  });
});

export { metrics };
