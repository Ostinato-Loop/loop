# AUDIT/load-readiness.md
**Service:** Loop (loop-api Cloudflare Worker + Supabase PostgreSQL)
**Owner:** LILCKY STUDIO LIMITED — CTO
**Date:** 2026-06-07
**Sprint:** Production Stabilization Sprint — Phase C

---

## Summary

Loop's backend runs on Cloudflare Workers (globally distributed, auto-scaling) + Supabase PostgreSQL (dedicated instance). This document analyses capacity headroom at 100, 500, and 1,000 concurrent users based on platform limits, current architecture, and known bottlenecks.

**Verdict:** Loop can safely handle **100 concurrent users** today. Reaching **500 concurrent** requires one schema fix. **1,000 concurrent** requires connection pooling and query optimisation.

---

## 1. Platform Capacity Baselines

### Cloudflare Worker (loop-api)

| Metric | Limit | Expected at 100 CCU | Expected at 500 CCU | Expected at 1,000 CCU |
|--------|-------|---------------------|---------------------|----------------------|
| Requests/sec | Unlimited (auto-scale) | ~50 rps | ~250 rps | ~500 rps |
| CPU time per request | 50 ms (Workers Free) / 30 s (Paid) | ~5–15 ms | ~5–15 ms | ~5–15 ms |
| Memory per isolate | 128 MB | ~20 MB | ~20 MB | ~20 MB |
| KV reads/sec | 10M/day (no burst limit) | Negligible | Negligible | Negligible |
| D1 queries/day | 5M (free) / unlimited (paid) | ~10K | ~50K | ~100K |
| Durable Object writes | 1M/day | Room-scoped, low | Room-scoped, low | Room-scoped, low |

**Finding:** Worker layer has no meaningful concurrency ceiling for these user counts. Cloudflare auto-scales globally.

### Supabase PostgreSQL

| Metric | Free Tier Limit | Pro Tier Limit | Expected at 100 CCU | Expected at 500 CCU | Expected at 1,000 CCU |
|--------|----------------|----------------|---------------------|---------------------|----------------------|
| Direct connections | 60 | 200 | ~10–20 | ~50–100 | ~100–200 |
| Pooler connections (PgBouncer) | Unlimited | Unlimited | ~5–10 | ~25–50 | ~50–100 |
| DB CPU | Shared | 2 vCPU | < 20% | < 60% | 60–90% |
| Realtime connections | 200 (free) | Unlimited | ~50 | ~250 | ~500 |
| API rate limit | 500 req/s | 500 req/s | ~50 rps | ~250 rps | ~500 rps |

---

## 2. Concurrency Analysis

### 2.1 — 100 Concurrent Users

**Workload model:** 100 users actively browsing, joining rooms, and sending notifications.
- ~50 rps to Worker (auth, rooms, notifications)
- ~20 simultaneous Supabase queries
- ~30 Realtime connections (active notifications)

**Bottlenecks:** None expected. All metrics well within limits.

**Verdict:** ✅ READY — No changes required.

### 2.2 — 500 Concurrent Users

**Workload model:** 500 users, 20% in active rooms, 80% browsing.
- ~250 rps to Worker
- ~100 simultaneous Supabase connections (direct pool)
- ~150 Realtime connections
- OTP KV: ~10 concurrent rate-limit lookups

**Bottlenecks identified:**

| # | Bottleneck | Impact | Fix |
|---|-----------|--------|-----|
| B1 | Direct connection pool saturation (60 limit on free tier) | Auth/profile queries queue, latency spikes | Switch to Supabase Pooler (port 6543) in service role connections |
| B2 | `profiles` table missing pagination index for discovery | Discovery queries full-scan without `country` index | Apply migration 006 (region fields + indexes) |
| B3 | `notifications` SELECT without partial index on `read_at IS NULL` | Unread count queries scan all rows | Index exists (migration 002) — verify applied |

**Verdict:** ⚠️ CONDITIONALLY READY — Fix B1 (connection pooler) before reaching 500 CCU.

**Fix B1 action:** In `artifacts/api-server/src/routes/auth.ts` and all Supabase clients, use `https://onxdcikfttdmnhofsuwo.supabase.co` pooler URL (port 6543) instead of direct (port 5432).

### 2.3 — 1,000 Concurrent Users

**Workload model:** 1,000 users, 30% in rooms, concurrent OTP sends during peak sign-up.
- ~500 rps to Worker
- ~200 simultaneous Supabase connections via pooler
- ~300 Realtime connections
- KV: ~50 concurrent rate-limit lookups (OTP abuse protection)
- LiveKit: ~100 active room participants

**Bottlenecks identified:**

| # | Bottleneck | Impact | Fix |
|---|-----------|--------|-----|
| B4 | Supabase Pro tier required | Free tier hits 60 connection limit, 200 Realtime limit | Upgrade to Pro ($25/mo) |
| B5 | `rooms` list query: no compound index `(is_live, audience_count DESC)` | Room discovery queries slow at 1K+ rows | Add compound index on rooms |
| B6 | `audience_count` stale (not updated from Durable Object) | Incorrect room ordering | Implement DO→Supabase sync (already scaffolded) |
| B7 | No token revocation = no signout scalability | Stolen tokens live 30d; blocklist would need KV scan at 1K CCU | Implement `jti` blocklist in KV (Phase 3) |
| B8 | LiveKit SDK `listRooms()` in health probe | Every health check hits LiveKit API; at 1K CCU, probes at 60s interval | Cache health probe results for 30s |

**Verdict:** ❌ NOT READY — Upgrade Supabase to Pro + fix B5 before 1K CCU.

---

## 3. Database Performance Analysis

### Current Query Patterns

| Query | Table | Index Used | Estimated p99 at 500 CCU |
|-------|-------|-----------|--------------------------|
| Profile lookup by ID | profiles | PRIMARY KEY (uuid) | ~5 ms |
| Rooms list (live first) | rooms | rooms_is_live_idx | ~20 ms |
| Friend requests (incoming) | friend_requests | fr_receiver_idx | ~8 ms |
| Notifications (unread) | notifications | notif_recipient_read_idx | ~10 ms |
| Community list | communities | visibility + member_count | ~15 ms |
| Region discovery | profiles | profiles_country_idx (migration 006) | ~12 ms |

### Missing Indexes (to add before 500 CCU)

```sql
-- Room discovery compound index (is_live + ordering)
CREATE INDEX IF NOT EXISTS rooms_live_audience_idx
  ON public.rooms (is_live DESC, audience_count DESC, created_at DESC)
  WHERE visibility = 'public';
```

---

## 4. Room Join Performance

| Step | Estimated Latency | Bottleneck Risk |
|------|------------------|-----------------|
| Auth verification (JWT verify) | ~2 ms | None (crypto.subtle) |
| Supabase room lookup | ~8 ms | None at 500 CCU |
| Supabase participant insert | ~10 ms | None at 500 CCU |
| LiveKit token generation | ~5 ms | None (local crypto) |
| Total room join p50 | ~25 ms | — |
| Total room join p99 | ~80 ms | Connection pool at 500 CCU |

---

## 5. Bottleneck Summary & Priority

| Priority | Bottleneck | Required Before | Effort |
|----------|-----------|-----------------|--------|
| P0 | Connection pooler (B1) | 500 CCU | 1h code change |
| P0 | Supabase Pro (B4) | 1,000 CCU | Operator action |
| P1 | Region index migration 006 | 500 CCU | Apply migration |
| P1 | Room compound index (B5) | 1,000 CCU | 30 min |
| P2 | DO→Supabase audience_count sync (B6) | 1,000 CCU | 4h |
| P2 | Health probe caching (B8) | 1,000 CCU | 30 min |
| P3 | JWT blocklist (B7) | Scale | Phase 3 |

---

## 6. Recommendation

**Current safe operating ceiling: 100 concurrent users.**

Timeline to 500 CCU readiness: 1 sprint (connection pooler + migration 006 applied).
Timeline to 1,000 CCU readiness: 2 sprints (Supabase Pro upgrade + compound index + audience_count sync).
