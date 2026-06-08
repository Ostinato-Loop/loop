# OBSERVABILITY PLAN
**Date:** 2026-06-08  
**Scope:** loop.rald.cloud and all backing services  
**Principle:** You cannot fix what you cannot see. You cannot scale what you don't measure.  
**Current state:** Audit logging exists in Workers. No unified dashboard. No alerting. No structured error tracking.

---

## Current Observability State

| Service | Logging | Metrics | Alerting | Error Tracking |
|---------|---------|---------|----------|----------------|
| `rald-auth-core` | ✅ `src/lib/audit.ts` — KV audit log | ❌ None | ❌ None | ❌ None |
| `rald-realtime` | ✅ `src/lib/audit.ts` — KV audit log | ✅ `GET /analytics/summary` | ❌ None | ❌ None |
| `loop` (frontend) | ✅ `src/lib/analytics.ts` — event tracking | ❌ No destination | ❌ None | ❌ None |
| `messenger` | ✅ `workers/loop-messenger-api/src/lib/audit.ts` | ❌ None | ❌ None | ❌ None |
| Supabase | ✅ Built-in logs | ✅ Dashboard metrics | ✅ Email alerts | ❌ None |
| Cloudflare Workers | ✅ `wrangler tail` in dev | ✅ Worker analytics | ✅ (requires config) | ❌ None |

**Gap:** Every service logs independently. There is no central place to answer: "Is Loop healthy right now?"

---

## Observability Stack (Zero New Services Required)

This plan uses infrastructure that already exists in the RALD ecosystem or is available for free:

| Layer | Tool | Cost | Location |
|-------|------|------|----------|
| Frontend errors | Sentry (free tier, 5K errors/month) | Free | `rald-observability` (stub — implement here) |
| Worker logs | Cloudflare Workers Analytics | Included | CF Dashboard |
| Worker real-time logs | `wrangler tail` | Included | CLI |
| Database metrics | Supabase Dashboard | Included | Supabase |
| Uptime monitoring | Cloudflare Health Checks | Included | CF Dashboard |
| Status page | `rald-status` repo (20KB, already built) | Free | `status.rald.cloud` |
| Alerting | Cloudflare Notifications + email | Included | CF Dashboard |

**No paid observability tool is needed until 10,000 users.**

---

## Plan by Layer

---

### Layer 1: Health Endpoints (Foundation — Implement First)

All Workers already have health routes. They must return machine-readable status that monitoring can poll.

**Fix 1.1 — Standardize health response across all workers**

Every worker's `GET /health` must return:
```json
{
  "ok": true,
  "service": "rald-auth-core",
  "version": "1.0.0",
  "timestamp": "2026-06-08T12:00:00Z",
  "checks": {
    "database": { "ok": true, "latencyMs": 23 },
    "cache": { "ok": true },
    "externalProviders": { "termii": true, "resend": true }
  }
}
```

`rald-auth-core` already has this structure partially. Verify `rald-realtime/src/routes/health.ts` matches the same schema.

**Fix 1.2 — Add to `rald-status` public status page**

`rald-status` (20KB TypeScript) is the status.rald.cloud app. Wire it to poll:
- `https://auth.rald.cloud/health` every 60s
- `https://realtime.rald.cloud/health` every 60s
- `https://realtime.rald.cloud/health/providers` every 60s
- `https://messenger.rald.cloud/health` every 60s

Display as a live status page. This also builds user trust — users can check `status.rald.cloud` before asking "is Loop down?"

---

### Layer 2: Frontend Error Tracking

**Problem:** When the React app throws an error, it vanishes silently. No one knows until a user complains.

**Fix 2.1 — Add Sentry to the loop frontend**

```typescript
// loop/artifacts/loop/src/main.tsx
import * as Sentry from "@sentry/react"

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,         // 10% of transactions
  replaysSessionSampleRate: 0.0, // No session replay until needed
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  // African privacy: no PII in errors
  beforeSend(event) {
    if (event.user) { delete event.user.email; delete event.user.ip_address }
    return event
  }
})
```

**Cost:** Free tier is 5,000 errors/month. Sufficient until 1,000 users.  
**Value:** When a room fails to load in Lagos, you see the stack trace in Sentry before the user tweets about it.

**Fix 2.2 — Custom error boundary for audio failures**

Wrap the `<RoomPage>` in a custom Sentry error boundary:
```tsx
<Sentry.ErrorBoundary fallback={<RoomErrorFallback />}>
  <RoomPage />
</Sentry.ErrorBoundary>
```

`RoomErrorFallback` shows: *"Something went wrong with this room. Tap to retry."* with a 5-second auto-retry.

---

### Layer 3: Structured Worker Logging

**Problem:** `wrangler tail` is useful in development but logs are not persisted or searchable in production.

**Fix 3.1 — Cloudflare Workers Logpush (when ready to scale)**

Cloudflare Workers Logpush streams Worker logs to R2, HTTP endpoint, or Supabase. Enable when approaching 1,000 users.

**Fix 3.2 — Structured log format in all Workers**

Standardise log calls across `rald-auth-core`, `rald-realtime`, `messenger`:
```typescript
// Standard log format — add to each worker's src/lib/logger.ts
function log(level: 'info' | 'warn' | 'error', event: string, context: object = {}) {
  console.log(JSON.stringify({
    level,
    event,
    service: 'rald-auth-core', // per-worker constant
    timestamp: new Date().toISOString(),
    ...context
  }))
}

// Usage:
log('info', 'auth:otp_sent', { channel: 'sms', region: 'lagos' })
log('error', 'room:join_failed', { roomId, userId, provider, error: err.message })
```

Structured logs are parseable. When you add a log aggregator later, these are already in the right format.

---

### Layer 4: Key Metrics to Track

These are the numbers that tell you if Loop is alive and growing.

**Audio Health Metrics (in `rald-realtime/src/routes/analytics.ts`)**

Already implemented: `GET /analytics/summary` endpoint. Ensure it returns:
```json
{
  "activeRooms": 3,
  "totalParticipants": 47,
  "providerHealth": { "livekit": "ok", "realtimekit": "degraded", "tencent": "ok" },
  "roomsCreatedToday": 12,
  "peakConcurrentParticipants": 89,
  "audioFailureRate": 0.02
}
```

**Frontend Metrics (in `loop/artifacts/loop/src/lib/analytics.ts`)**

The analytics module exists. Wire it to Supabase `012_analytics.sql` (already applied):
```typescript
// Events to track:
track('room:joined', { roomId, region, language, connectionType })
track('room:left', { roomId, duration, speakerTime })
track('onboarding:completed', { stepsCompleted, timeMs })
track('push:permission_granted')
track('follow:created', { followedUserId })
track('community:joined', { communityId, category })
```

**Retention Metrics (Supabase)**

Wire to the `012_analytics.sql` analytics tables. Key SQL queries to add as Supabase views:
```sql
-- D1 retention
SELECT 
  COUNT(DISTINCT user_id) FILTER (WHERE session_date = created_date + interval '1 day') 
    * 100.0 / COUNT(DISTINCT user_id) as d1_retention
FROM user_sessions
JOIN users ON user_sessions.user_id = users.id
WHERE created_date >= NOW() - interval '7 days';
```

---

### Layer 5: Alerting

**What to alert on:**

| Alert | Threshold | Channel | Action |
|-------|-----------|---------|--------|
| `auth.rald.cloud` health check fails | 2 consecutive failures | Email + WhatsApp | Redeploy auth worker |
| `realtime.rald.cloud` health check fails | 2 consecutive failures | Email + WhatsApp | Redeploy realtime worker |
| LiveKit provider down | `health/providers` returns ok: false | Email | Verify secrets, check LiveKit status |
| Audio failure rate > 5% | 5% of joins fail within 10 min | WhatsApp | Check provider failover |
| Supabase connection count > 80 | Near free tier limit | Email | Upgrade to Supabase Pro |
| Sentry error spike > 100 errors/min | — | Email | Check deploy, consider rollback |

**Implementation:** Cloudflare Notifications (free, configure in CF Dashboard) cover Workers health checks. Sentry covers frontend error spikes. Supabase Dashboard has built-in alerts for DB metrics.

---

### Layer 6: The Operational Dashboard

**Short-term (now → 1,000 users):** A single Cloudflare Workers Analytics dashboard tab + Supabase Dashboard tab. No code required.

**Medium-term (1,000 → 10,000 users):** Add the `rald-control-center` (380KB, already built as admin command plane) to aggregate all metrics into one screen. Wire it to the standardized `/health` endpoints and Supabase views.

**Long-term (10,000+ users):** Evaluate Grafana Cloud free tier (10K metrics/month), connected to Cloudflare Logpush → R2 → Grafana data source.

---

## Observability Checklist

```
IMMEDIATE — Can do today, costs nothing
[ ] 1.1: Standardize /health response schema across all workers
[ ] 1.2: Wire rald-status to poll /health endpoints every 60s
[ ] 3.2: Add structured JSON logging to all worker log calls

SPRINT 1 — Do before 100 users
[ ] 2.1: Add Sentry to loop frontend (VITE_SENTRY_DSN in Cloudflare Pages env)
[ ] 2.2: Sentry error boundary wrapping RoomPage
[ ] 4: Wire analytics.ts events to Supabase analytics tables

SPRINT 2 — Do before 1,000 users
[ ] 5: Configure Cloudflare Notifications for worker health alerts
[ ] 4: Add D1/D7 retention views to Supabase
[ ] 3.1: Enable Cloudflare Workers Logpush to R2

AT SCALE — 10,000 users
[ ] Connect rald-control-center to aggregated health endpoints
[ ] Evaluate Grafana Cloud for unified metrics
[ ] Add p95 audio latency tracking per region (Lagos, Abuja, PH, Accra, Nairobi)
```

---

*Prepared for LILCKY STUDIO LIMITED — Loop Hardening Directive — 2026-06-08*
