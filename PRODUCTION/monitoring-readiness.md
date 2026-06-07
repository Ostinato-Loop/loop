# PRODUCTION/monitoring-readiness.md
**Date:** 2026-06-07
**Sprint:** Production Hardening Sprint — Phase 4
**Scope:** Cloudflare Workers, CF Pages, Supabase, LiveKit, Messenger, Auth

---

## Executive Summary

| Service | Liveness | Readiness | Error Alerting | Structured Logs | Dashboard |
|---------|---------|----------|---------------|-----------------|-----------|
| CF Worker (loop-api) | ✅ `/api/health` | ❌ Binding-only (no deep probe) | ❌ No alerting | ⚠️ Partial | ❌ None |
| CF Pages (loop frontend) | ✅ HTTP 200 | N/A | ❌ No alerting | N/A | ❌ None |
| Supabase | ❌ Not probed | ❌ Not probed | ❌ No alerting | ❌ Not configured | ❌ None |
| LiveKit | ❌ Not probed | ❌ Not probed | ❌ No alerting | ❌ Not configured | ❌ None |
| Auth (auth.rald.cloud) | ❌ Not probed | ❌ Not probed | ❌ No alerting | ❌ Not configured | ❌ None |
| Messenger | ❌ Not probed | N/A | ❌ No alerting | ❌ Not configured | ❌ None |

**Overall monitoring maturity: 4/10 — Critical gaps**

---

## Current Coverage

### 1. Cloudflare Worker — `GET /api/health`

```json
{
  "ok": true,
  "service": "loop-api",
  "version": "1.0.0",
  "environment": "production",
  "timestamp": "2026-06-07T12:00:00.000Z",
  "bindings": {
    "db": true,
    "cache": true,
    "media": true,
    "taskQueue": true,
    "roomSession": true,
    "ai": true
  }
}
```

**What it covers:** Worker process is running, environment bindings are registered.
**What it does NOT cover:**
- Whether KV is actually readable/writable (binding present ≠ KV healthy)
- Whether Supabase is reachable and responding
- Whether LiveKit is reachable
- Whether RALD_JWT_SECRET is configured (only checks `typeof !== "undefined"` for KV, not for secrets)
- Worker error rate (HTTP 5xx percentage)

### 2. Console Logging

| Event | Log level | Format | Indexed? |
|-------|-----------|--------|---------|
| OTP abuse | `console.warn` | `[LOOP/ABUSE] { JSON }` | CF Logs only |
| Auth signout | `console.log` | `[auth/signout] { JSON }` | CF Logs only |
| Auth verify-otp | `console.log` | `[auth/verify-otp] { JSON }` | CF Logs only |
| SSO login | `console.log` | `[rald-sso] { JSON }` | CF Logs only |
| Profile upsert errors | `console.error` | `[rald-sso] profile upsert failed: ...` | CF Logs only |
| Room list errors | `console.error` | `[rooms] list error: ...` | CF Logs only |
| General errors | `console.error` | Unstructured | CF Logs only |

**Gaps:**
- No `traceId` / `requestId` for correlating request lifecycle across log entries
- No `latencyMs` tracking — cannot identify slow handlers
- Inconsistent format: some logs use `JSON.stringify`, others use unstructured strings
- CF Logs are not queryable (no LogPush configured, no Tail Workers)
- No log retention beyond CF's default (72 hours in live tail)

### 3. Post-Deploy Smoke Test (Added PHD-001)

`deploy.yml` now runs `curl -sf /api/health` after `wrangler deploy`. A non-200 response fails the CI job, preventing a broken deploy from being declared successful.

---

## Missing Coverage — Critical Gaps

### Gap 1: No Deep Health Probe

**Current:** `GET /api/health` checks `typeof binding !== "undefined"` — this only verifies the binding is registered in wrangler.toml, not that the underlying service is healthy.

**Required:** Each binding should be actively probed:

```typescript
// Proposed additions to health.ts
async function probeKV(cache: KVNamespace): Promise<boolean> {
  try {
    await cache.put("__health_probe__", "1", { expirationTtl: 10 });
    const v = await cache.get("__health_probe__");
    return v === "1";
  } catch { return false; }
}

async function probeSupabase(url: string, key: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(3000),
    });
    return r.status < 500;
  } catch { return false; }
}

async function probeLiveKit(serverUrl: string): Promise<boolean> {
  try {
    const r = await fetch(`${serverUrl}/`, {
      signal: AbortSignal.timeout(3000),
    });
    return r.status < 500;
  } catch { return false; }
}
```

**Proposed health response:**
```json
{
  "ok": true,
  "service": "loop-api",
  "version": "1.0.0",
  "environment": "production",
  "timestamp": "2026-06-07T12:00:00.000Z",
  "checks": {
    "kv": { "status": "ok", "latencyMs": 4 },
    "supabase": { "status": "ok", "latencyMs": 45 },
    "livekit": { "status": "ok", "latencyMs": 120 },
    "bindings": { "db": true, "media": true, "taskQueue": true, "roomSession": true, "ai": true }
  }
}
```

---

### Gap 2: No Structured Request Logging

**Required:** A request middleware that logs every request with a consistent schema:

```typescript
// Proposed: src/middleware/logger.ts
export function requestLogger() {
  return createMiddleware(async (c, next) => {
    const traceId = crypto.randomUUID().slice(0, 8);
    const start = Date.now();
    c.set("traceId", traceId);

    await next();

    console.log("[LOOP/REQUEST]", JSON.stringify({
      traceId,
      method:     c.req.method,
      path:       new URL(c.req.url).pathname,
      status:     c.res.status,
      latencyMs:  Date.now() - start,
      userId:     (c.get("user") as AuthUser | undefined)?.id ?? null,
      ip:         getClientIp(c.req.raw),
      service:    "loop-api",
      timestamp:  new Date().toISOString(),
    }));
  });
}
```

**Log schema:**
```json
{
  "traceId": "a1b2c3d4",
  "method": "GET",
  "path": "/api/rooms/recommendations",
  "status": 200,
  "latencyMs": 87,
  "userId": "uuid-here",
  "ip": "1.2.3.4",
  "service": "loop-api",
  "timestamp": "2026-06-07T12:00:00.000Z"
}
```

---

### Gap 3: No Error Rate Alerting

**Available:** Cloudflare Workers Analytics (built-in, no configuration needed). Accessible via:
- CF Dashboard → Workers & Pages → loop-api → Metrics
- CF Analytics Engine (custom metrics, requires Worker code changes)

**Missing:** No alert configured for:
- Error rate > 1% (5xx responses / total requests)
- p99 latency > 500ms
- Request volume drop > 50% (service offline indicator)

**Recommended immediate action (no code required):**
CF Dashboard → Workers & Pages → loop-api → Settings → Notifications → Create notification:
- Trigger: Error rate > 1% for 5 minutes
- Channel: Email / PagerDuty / Webhook

---

### Gap 4: No Supabase Monitoring

**Available in Supabase dashboard (no configuration needed):**
- API request volume and error rate (project dashboard)
- Database query performance (slow queries > 500ms appear in logs)
- Realtime connection count (Messenger usage)
- Storage usage

**Missing:**
- No alerting on Supabase error spikes
- No slow query alerting
- No connection pool exhaustion alerting

**Recommended (no code required):**
Supabase Dashboard → Project `onxdcikfttdmnhofsuwo` → Reports → enable email alerts for:
- API error rate > 5%
- Database CPU > 80%

---

### Gap 5: No Audit Log Persistence

**Current:** Auth events logged to CF Logs (72h retention, not queryable).

**Required for incident response:** Auth events must be queryable post-incident.

**Options:**
- CF D1: `INSERT INTO audit_log (event, user_id, jti, ip, timestamp)` in signout/login handlers
- CF KV: Store last N auth events per user (bounded)
- CF Logpush: Stream CF Worker logs to R2 / external service

**Recommended:** D1 audit log table. Schema:
```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id        TEXT PRIMARY KEY,
  event     TEXT NOT NULL,
  user_id   TEXT,
  jti       TEXT,
  ip        TEXT,
  source    TEXT,
  status    INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at ON audit_log(created_at);
```

---

### Gap 6: No LiveKit Health Monitoring

LiveKit rooms are core product. No monitoring exists for:
- LiveKit server availability
- Active room count
- Participant count
- WebRTC error rates
- Room creation failure rate

**Recommended:** LiveKit provides a `/rtc/validate` and metrics endpoint. Add to health check.

---

## Alerting Gaps

| Alert | Priority | Status | Action |
|-------|----------|--------|--------|
| Worker error rate > 1% | P0 | ❌ Missing | CF Dashboard notification (no code) |
| Worker offline | P0 | ❌ Missing | CF Dashboard notification (no code) |
| Supabase error rate > 5% | P0 | ❌ Missing | Supabase Dashboard notification (no code) |
| Post-deploy health check | P0 | ✅ Added (PHD-001 smoke test) | Done |
| KV unresponsive | P1 | ❌ Missing | Deep health probe in health.ts |
| LiveKit unreachable | P1 | ❌ Missing | Add to health probe |
| Auth failure spike | P1 | ❌ Missing | CF Analytics alert |
| OTP abuse spike | P1 | ⚠️ Logged not alerted | CF Log tail → alert integration |
| Supabase DB CPU > 80% | P2 | ❌ Missing | Supabase Dashboard notification |

---

## Dashboard Gaps

| Dashboard | Status | Where to build |
|-----------|--------|---------------|
| Auth funnel (send OTP → verify OTP → success rate) | ❌ Missing | CF Analytics Engine |
| Room creation / join success rate | ❌ Missing | CF Analytics Engine |
| Active users (DAU/MAU) | ❌ Missing | D1 query on audit_log |
| Error rate over time | ❌ Missing | CF Workers Metrics (built-in) |
| Token revocation events | ❌ Missing | D1 audit_log |
| OTP abuse events | ❌ Missing | CF Log tail + filter |
| Supabase query performance | ❌ Missing | Supabase Reports |

---

## Implementation Plan (Ordered by Impact)

| Priority | Action | Type | Effort |
|----------|--------|------|--------|
| P0 | CF Dashboard: worker error rate alert | Operator (no code) | 10 min |
| P0 | CF Dashboard: worker offline alert | Operator (no code) | 10 min |
| P0 | Supabase Dashboard: error rate alert | Operator (no code) | 10 min |
| P1 | Add deep health probe (KV + Supabase + LiveKit) to health.ts | Engineer | 2h |
| P1 | Add `requestLogger` middleware to index.ts | Engineer | 1h |
| P2 | D1 audit_log table + migration | Engineer | 3h |
| P2 | Write auth events to D1 audit_log | Engineer | 2h |
| P3 | CF Analytics Engine for auth funnel metrics | Engineer | 4h |
