# PRODUCTION/monitoring-runbook.md
**Service:** Loop (loop-api Cloudflare Worker + loop Cloudflare Pages + Supabase)
**Owner:** LILCKY STUDIO LIMITED — CTO
**Last updated:** 2026-06-07
**Status:** Active — Production Stabilization Sprint

---

## 1. Alert Inventory & Thresholds

### 1.1 Cloudflare Worker (loop-api)

| Alert | Threshold | Severity | Channel |
|-------|-----------|----------|---------|
| Worker error rate | > 1% of requests return 5xx over 5 min window | P0 | Email + Webhook |
| Worker offline | 0 requests processed for 3 min | P0 | Email + Webhook |
| p99 latency | > 500 ms over 10 min window | P1 | Email |
| CPU time budget | > 80% of 50ms CPU limit per request | P1 | Email |
| KV read failures | > 5 consecutive KV errors (rate-limit store) | P1 | Email |
| D1 query errors | > 10 D1 errors per minute | P1 | Email |

**Configure in:** Cloudflare Dashboard → Workers & Pages → loop-api → Settings → Notifications

### 1.2 Supabase (onxdcikfttdmnhofsuwo)

| Alert | Threshold | Severity | Channel |
|-------|-----------|----------|---------|
| API error rate | > 5% of requests fail | P0 | Email |
| Database CPU | > 80% sustained for 5 min | P1 | Email |
| Connection pool | > 90% connections used | P1 | Email |
| Slow queries | Query time > 500 ms | P2 | Email |
| Disk usage | > 80% of allocated storage | P2 | Email |
| Realtime disconnections | > 50 simultaneous drops | P1 | Email |

**Configure in:** Supabase Dashboard → Project onxdcikfttdmnhofsuwo → Reports → Alerts

### 1.3 LiveKit (Rooms / Audio)

| Alert | Threshold | Severity | Channel |
|-------|-----------|----------|---------|
| LiveKit API unreachable | `/api/health` check returns non-200 | P0 | Email |
| Room creation failures | > 3 failures per minute | P1 | Email |
| Participant join failures | > 5% of join attempts fail | P1 | Email |
| Active rooms anomaly | > 50% drop in active rooms without scheduled end | P1 | Email |

**Configure in:** LiveKit Cloud Dashboard → Project → Alerts

### 1.4 GET /api/health — Automated Probe

The deep health endpoint (`GET /api/health`) must be probed every 60 seconds by an external monitor.

```
Probe URL:   https://loop-api.rald.cloud/api/health
Method:      GET
Expected:    HTTP 200, body.status = "ok"
Timeout:     10 seconds
Alert on:    Non-200 OR body.status != "ok" for 2 consecutive checks
Severity:    P0
```

**Recommended monitors:** UptimeRobot (free tier) or Cloudflare Zero Trust health checks.

---

## 2. Escalation Flow

```
Alert fires
    │
    ▼
Is this a P0?
    ├── YES → Page on-call engineer immediately (< 5 min response)
    │         → Open incident in GitHub Issues (label: incident, priority:p0)
    │         → Notify founder via Telegram/WhatsApp
    └── NO  → P1: Notify on-call engineer via email (< 30 min response)
              P2: Add to weekly ops review queue
```

### Incident Ownership Matrix

| Service | Primary Owner | Backup |
|---------|--------------|--------|
| Cloudflare Worker | CTO | Dev Lead |
| Supabase database | CTO | Dev Lead |
| LiveKit rooms | Dev Lead | CTO |
| Cloudflare Pages (loop.rald.cloud) | Dev Lead | CTO |
| DNS / rald.cloud zone | CTO | — |

---

## 3. Runbook — Per-Service Recovery

### 3.1 Worker Error Spike (5xx > 1%)

1. Check CF Dashboard → loop-api → Logs → filter `outcome:exception`
2. `wrangler tail --env production` for live log stream
3. Check recent deploys: was this triggered by a push? Roll back via CF Dashboard → Deployments → Revert
4. Check Supabase is reachable: curl `https://onxdcikfttdmnhofsuwo.supabase.co/rest/v1/`
5. Check KV quota: CF Dashboard → KV → loop-cache → Usage
6. If unresolvable: disable the failing route in wrangler.toml and redeploy (feature flag off)

### 3.2 Supabase Slow / Unreachable

1. Check Supabase status: https://status.supabase.com
2. Dashboard → Reports → Query Performance → identify slow queries
3. Check connection pool: Dashboard → Database → Connection Pooling
4. Kill long-running queries: Dashboard → Database → Query Editor → `SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_duration > interval '30 seconds'`
5. If pool exhausted: restart connection pooler from Dashboard → Settings → Database

### 3.3 LiveKit Room Failures

1. Check LiveKit Cloud status: https://status.livekit.io
2. Verify `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are set: `wrangler secret list --env production`
3. Test token generation manually: `GET /api/audio/token?room_id=test&identity=test` with valid Bearer
4. Check worker logs for `[audio-token]` prefix errors
5. If LiveKit Cloud is down: rooms become audio-only degraded → notify users via status page

### 3.4 OTP / Auth Failures

1. Check Termii dashboard for delivery failures
2. Verify `TERMII_API_KEY` secret: `wrangler secret list --env production`
3. Check KV rate-limit store is not corrupted: list keys with `wrangler kv key list --namespace-id 3c71da01b3174d6c9353adbfde7491a3`
4. If KV is corrupted: delete rate-limit keys manually (users will be temporarily unblocked — acceptable trade-off)
5. Fallback: disable OTP temporarily, enable SSO-only login

---

## 4. Monitoring Readiness Verification

### 4.1 Cloudflare

- [x] Worker deployed and receiving traffic (verified 2026-06-06 post-deploy smoke test)
- [x] Built-in analytics enabled (`[observability] enabled = true` in wrangler.toml)
- [ ] Error rate alert configured (manual operator step — CF Dashboard)
- [ ] Worker offline alert configured (manual operator step — CF Dashboard)
- [x] Post-deploy smoke test (`GET /api/health` required to pass before deploy completes)

### 4.2 Supabase

- [x] Database accessible and migrations applied (003 confirmed 2026-06-05)
- [x] Realtime enabled on notifications and friend_requests tables
- [ ] Email alerts configured (manual operator step — Supabase Dashboard)
- [ ] Slow query alerts configured (manual operator step — Supabase Dashboard)

### 4.3 LiveKit

- [x] SDK integrated (`livekit-server-sdk@^2.9.0` in package.json)
- [x] Token generation route live (`GET /api/audio/token`)
- [ ] LiveKit API key added to deep health probe env var `LIVEKIT_URL` (GitHub secret missing — request to owner)
- [ ] LiveKit Cloud dashboard alerts configured

---

## 5. Health Check Endpoint Reference

```
GET /api/healthz   — Liveness (no deps). Returns 200 always if process is alive.
GET /api/health    — Readiness (Supabase + LiveKit + KV/Worker). Returns 200 or 207.
```

**Expected healthy response:**
```json
{
  "status": "ok",
  "service": "loop-api-server",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 3600,
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "checks": {
    "supabase": { "ok": true, "latencyMs": 45 },
    "livekit":  { "ok": true, "latencyMs": 120 },
    "kv":       { "ok": true, "latencyMs": 8, "detail": "cache=true, db=true" }
  },
  "checkedAt": "2026-06-07T12:00:00.000Z"
}
```

---

## 6. Log Format Reference

Every API request emits a structured JSON log line:

```json
{
  "level": 30,
  "time": 1749297600000,
  "msg": "http",
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "path": "/api/auth/rald-sso",
  "userId": null,
  "statusCode": 200,
  "latencyMs": 87,
  "timestamp": "2026-06-07T12:00:00.000Z"
}
```

Query logs in production: `wrangler tail --env production --format json | jq 'select(.statusCode >= 500)'`
