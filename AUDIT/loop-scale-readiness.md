# Loop Scale Readiness — Phase 3: Infrastructure & Scalability
**Ecosystem:** RALD / LILCKY STUDIO LIMITED  
**Repo:** Ostinato-Loop/loop  
**Audit Date:** 2026-06-06  
**Auditor:** CTO Office  

---

## Executive Summary

The current infrastructure can support a small closed beta (< 50 concurrent users) with the existing Cloudflare Workers + Supabase stack. It **cannot** support a public launch at meaningful scale without resolving the audio layer, Durable Object limitations, database query patterns, and the absence of observability tooling. This document maps every constraint with a concrete remediation path.

---

## 1. Frontend — SPA Delivery

| Dimension | Current State | Scale Ceiling | Remediation |
|---|---|---|---|
| Hosting | Cloudflare Pages | Effectively unlimited | None required |
| Bundle size | Not measured | Unknown | Add bundle analyzer to CI |
| Code splitting | None observed | Degrades on slow connections | Implement route-based splitting |
| Asset caching | Cloudflare default | Good | Ensure cache-busting on deploy |
| Offline support | None | — | Not required for V1 |

**Verdict:** Frontend delivery is not the scale constraint. Focus elsewhere.

---

## 2. API Layer — Cloudflare Worker

### 2.1 Worker Architecture

The Worker runs globally across Cloudflare's edge network. Each request is stateless and handled in a V8 isolate. This is inherently scalable for HTTP request handling.

**Constraints identified:**

| Constraint | Risk | Remediation |
|---|---|---|
| No rate limiting on any endpoint | High — OTP abuse, room spam | Implement Cloudflare Rate Limiting rules or CF Worker rate limiting middleware |
| CORS allows `*` | Medium — credential exposure | Lock to `*.rald.cloud` and `loop.rald.cloud` |
| No request body size limit | Medium — DoS via large payload | Add `Content-Length` check in middleware |
| Synchronous Supabase calls in hot paths | Medium — latency spikes | Add response caching for `GET /rooms` (5s TTL) |
| No circuit breaker for Supabase | Medium — cascading failure | Wrap Supabase calls with timeout + fallback |

### 2.2 Worker CPU / Memory Limits

Cloudflare Workers have a 10ms CPU time limit on the free plan, 30ms on Paid. A single Worker request doing heavy JWT validation + Supabase query + response serialization may approach this limit under load.

**Remediation:**
- Profile request CPU time using `wrangler tail` during load testing
- Move JWT validation to a cached lookup pattern (validate once, cache result in KV)
- Pre-compile Zod schemas outside request handlers (already partially done)

---

## 3. Durable Objects — Room Session

`room-session.ts` is the most critical scale bottleneck.

### 3.1 Current Implementation

```
Single Durable Object per room → single-region → all room state in one JS object
```

| Issue | Scale Impact | Remediation |
|---|---|---|
| Single-region by default | All room traffic routes to one datacenter; latency is 200–400ms for geographically distant users | Use `locationHint` on DO creation to place it near the majority of room participants |
| No sharding | One DO per room is correct for small rooms (< 100 people). At 500+ participants a single DO becomes a bottleneck | Shard at 500 participants: split into a coordinator DO + shard DOs |
| Hardcoded 10-participant cap in business logic | Artificially prevents testing at scale | Remove cap for internal testing; set as a configurable env var |
| No cleanup on abnormal disconnect | Zombie rooms accumulate in Supabase — participant counts are wrong | Implement DO alarm to sweep stale participants after 30s inactivity |
| No DO persistence (no `storage.put`) | Room state is lost on DO cold start | Persist critical state (participant list, role assignments) to DO storage |
| No alarm-based heartbeat | Clients that drop connection silently leave ghost participants | Add `setAlarm(30000)` heartbeat check; remove participants who miss 2 heartbeats |

### 3.2 DO Scale Model

| Room Size | Architecture | Notes |
|---|---|---|
| 1–100 participants | Single DO, locationHint set | Handles with current architecture |
| 100–500 participants | Single DO, explicit region pinning | Needs DO storage persistence |
| 500–5,000 participants | Coordinator DO + 5–10 shard DOs | Re-architecture required |
| 5,000+ participants | CDN-delivered SFU (e.g., Cloudflare Calls, Livekit cloud) | Outside current scope |

---

## 4. Audio Infrastructure

**This is the largest scale unknown.** No audio vendor is selected. The choice of audio vendor determines the entire scale model for the core product.

### 4.1 Vendor Comparison

| Vendor | Model | Scale | Cost at 1,000 CCU | Notes |
|---|---|---|---|---|
| Tencent RTC | SFU cloud | 10,000+ | ~$200/month | Already in `messenger` repo |
| Agora | SFU cloud | 100,000+ | ~$400/month | Industry standard, excellent SDK |
| Livekit Cloud | SFU cloud / self-hosted | 10,000+ | ~$150/month | Open source option, CF Calls compatible |
| Cloudflare Calls | SFU, CF-native | 10,000+ | ~$50/month | Best integration with CF Worker stack |
| Daily | SFU cloud | 10,000+ | ~$300/month | Strong React SDK |

### 4.2 Recommendation

Given the existing Cloudflare stack, **Cloudflare Calls** is the recommended default for V1 — lowest latency from the Worker layer, direct API integration, no external vendor dependency. Tencent RTC (already in `messenger`) is a valid alternative if the team prefers a single vendor for audio across Loop and Messenger.

**Decision must be made before P0-001 sprint. Document outcome in `/FOUNDATION/loop-v2-readiness.md`.**

---

## 5. Database — Supabase

### 5.1 Connection Pooling

Supabase's default connection limit on the free plan is 60 connections (shared across all services). Cloudflare Workers open a new connection per request.

**Risk:** At 60+ concurrent API requests, new connections are refused.  
**Remediation:** Enable **Supabase Transaction Mode pooler** (pgBouncer) on port 6543. Switch `DATABASE_URL` to the pooler connection string. This is critical before launch.

### 5.2 Query Analysis

| Query | Issue | Remediation |
|---|---|---|
| `SELECT * FROM rooms` (feed) | Full table scan, no LIMIT | Add `LIMIT 50`, ensure `created_at` index exists |
| `SELECT * FROM room_participants WHERE room_id = $1` | Missing index on `room_id` | `CREATE INDEX ON room_participants(room_id)` |
| Follower count | No materialized count | Add `follower_count` column to `profiles`, update via trigger |
| Interest-based recommendations | Not implemented | Not a launch requirement |

### 5.3 RLS Performance

Row Level Security adds overhead to every query. All policies should be audited for index alignment. Policies filtering on `auth.uid()` perform well when the filter column is indexed. Audit each policy in the current schema against the index list.

### 5.4 Realtime

Supabase Realtime is used in `room.tsx` for participant grid updates. At > 200 subscribers to a single channel, Realtime performance degrades on lower Supabase plans.

**Remediation:** For V1 with small rooms, Realtime is acceptable. At scale, move participant state updates to the Durable Object WebSocket broadcast (already partially implemented in `room-session.ts`) and use Realtime only for presence indicators.

---

## 6. Observability — Current State: None

| Capability | Status | Impact |
|---|---|---|
| Error tracking | ❌ None | Crashes are invisible in production |
| Performance monitoring | ❌ None | Cannot identify slow queries or routes |
| Uptime monitoring | ❌ None | No alert when the Worker or Supabase is down |
| Logging | ⚠️ `wrangler tail` only | Not persistent, not searchable |
| User analytics | ❌ None | Cannot measure funnel drop-off |

**Minimum observability stack before launch:**
1. **Sentry** — error tracking in the Worker and in the frontend SPA
2. **Cloudflare Analytics** — request volume, error rate, latency (free, already available)
3. **Supabase Dashboard** — query performance, connection count (free, already available)
4. **UptimeRobot** or Cloudflare Health Checks — alert on downtime

---

## 7. Scale Readiness Scorecard

| Area | Score | Verdict |
|---|---|---|
| Frontend delivery | 8/10 | ✅ Ready |
| API Worker (stateless) | 5/10 | ⚠️ Needs rate limiting + CORS fix |
| Durable Objects | 3/10 | 🔴 Not production-ready |
| Audio infrastructure | 0/10 | 🔴 No implementation |
| Database (Supabase) | 4/10 | 🔴 Needs pooling + indexes |
| Observability | 0/10 | 🔴 Flying blind |

**Overall Scale Readiness: 3/10 — Not ready for public launch**

---

## 8. Scale Milestones

| Milestone | Concurrent Users | Blockers to Resolve Before This Milestone |
|---|---|---|
| Internal Alpha | 10 | P0-001 through P0-007 |
| Closed Beta | 100 | Audio vendor, DO locationHint, Supabase pooler |
| Open Beta | 1,000 | Observability, rate limiting, CORS, DO persistence |
| Public Launch | 5,000+ | DO sharding evaluation, CDN audio tier, query optimization |

---

*End of Phase 3 — Scale Readiness*
