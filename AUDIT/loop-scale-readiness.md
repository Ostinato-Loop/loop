# Loop Scale Readiness — Phase 3: Infrastructure & Scalability Audit
**Ecosystem:** RALD / LILCKY STUDIO LIMITED
**Repo:** Ostinato-Loop/loop
**Audit Date:** 2026-06-06
**Auditor:** CTO Office
**Status:** Required deliverable — Stabilization Program Phase 3

---

## Executive Summary

The current infrastructure can support a closed beta of <50 concurrent users on the existing Cloudflare Workers + Supabase stack. It **cannot** support a public launch at meaningful scale without: (1) an audio vendor with real media routing, (2) Durable Object connection limits addressed, (3) database query patterns optimised, and (4) observability instrumentation in place.

**Scale Readiness Score: 34/100**
- Frontend delivery: 9/10 (CF Pages is inherently scalable)
- API layer (HTTP): 6/10 (no rate limiting, no circuit breakers)
- Real-time layer: 3/10 (Durable Object limit at 1 MB state, no audio SDK)
- Database: 5/10 (N+1 patterns, no query caching, RLS not tuned)
- Observability: 1/10 (no metrics, no tracing, no uptime monitoring)

---

## 1. Frontend — SPA Delivery

| Dimension | Current State | Scale Ceiling | Remediation |
|---|---|---|---|
| Hosting | Cloudflare Pages | Effectively unlimited | None required |
| Bundle size | Unmeasured | Unknown | Add bundle analyser to CI (rollup-plugin-visualizer) |
| Code splitting | None observed | Degrades on slow mobile | Route-based lazy() splitting |
| Asset caching | CF default | Adequate | Ensure content-hash filenames on deploy |
| Offline / PWA | None | — | Not required for V1 |

**Verdict: Frontend delivery is not the scale constraint.**

---

## 2. API Layer — Cloudflare Worker (HTTP)

### 2.1 Architecture
Each Worker request runs in a V8 isolate globally. Stateless HTTP requests are inherently scalable. Constraints are in the application layer, not the platform.

### 2.2 Critical Gaps

| Gap | Risk Level | Remediation |
|---|---|---|
| No rate limiting on any endpoint | 🔴 High | Cloudflare Rate Limiting rules on `/api/otp/request`, `/api/rooms` |
| No request timeout budget | 🔴 High | Supabase calls can hang — add `AbortController` with 5s timeout |
| No circuit breaker for Supabase | 🟠 Medium | Wrap DB calls; return 503 if Supabase is down rather than hanging |
| CORS origin wildcard in dev mode | 🟠 Medium | Pin `CORS_ORIGIN` per environment in wrangler.toml |
| No request ID / trace header | 🟡 Low | Add `x-request-id` propagation for log correlation |

### 2.3 Bottleneck Scenario — 100K Concurrent Users

At 100K concurrent users each polling `/api/rooms` every 10s:
- **10,000 requests/second** to the rooms endpoint
- Each call does a Supabase query (external network hop)
- Without caching: every request hits Supabase — **Supabase free tier collapses at ~200 concurrent connections**

**Required fix:** Cache room listing in CF KV with 5-second TTL. Invalidate on room create/join/leave events.

---

## 3. Real-Time Layer — Durable Objects + Supabase Realtime

### 3.1 Durable Object Constraints

| Constraint | Limit | Current Use | Risk |
|---|---|---|---|
| State storage | 1 MB per DO | Room participant list + metadata | 🔴 Exceeds at ~5K participants per room |
| Concurrent connections | 32K WebSocket per DO | One DO per room | Adequate for most rooms |
| CPU burst | 30s per request | N/A (WS is persistent) | Low |
| Alarm storage | Unlimited | Not used | — |

**Fix required:** Shard DO state for large rooms. Store participant IDs in KV (not DO state) for rooms >500 participants.

### 3.2 Audio — Complete Absence

The most critical scale constraint is that **there is no audio infrastructure**:
- No audio vendor SDK (Agora, Livekit, Daily, Tencent RTC)
- No media server — the Worker cannot relay audio
- The DO tracks presence but has no audio track management

At 100K concurrent users with audio, a managed media server is mandatory. Self-hosting WebRTC at this scale requires a dedicated SFU cluster.

**Recommendation:** LiveKit Cloud — scales to 1M+ concurrent, $0 at low usage, Nigerian/African PoP via AWS Lagos.

### 3.3 Supabase Realtime

| Scenario | Concurrent Realtime Connections | Supabase Tier Required |
|---|---|---|
| 100 users | 100 | Free |
| 10K users | 10,000 | Pro ($25/mo) |
| 100K users | 100,000 | Enterprise |
| 1M users | 1,000,000 | Enterprise + custom |

Supabase Realtime is suitable through the 10K user range. At 100K+, move room presence to the Durable Object WebSocket layer and reserve Supabase Realtime for notifications only.

---

## 4. Database — Supabase Postgres

### 4.1 Query Patterns

| Query | Pattern | Risk | Fix |
|---|---|---|---|
| `listRooms()` | SELECT * with no LIMIT | 🔴 Full table scan | Add `LIMIT 50`, paginate |
| Room join/leave | Two UPSERTs sequential | 🟠 Medium | Batch or use Supabase edge function |
| Profile fetch on room card | N+1 (one query per card) | 🟠 Medium | JOIN or batch fetch |
| OTP verification | Single row lookup by phone + code | 🟢 Fine | Index exists |

### 4.2 Connection Pooling

Supabase uses PgBouncer in transaction mode by default. At 100K users the connection pool will saturate.

**Fix:** Use Supabase's built-in connection pooler URL, not the direct Postgres connection string.

### 4.3 RLS Performance

Row Level Security adds overhead per query when evaluating `auth.uid()`. At scale, use `security definer` functions for hot paths to avoid repeated RLS evaluation.

---

## 5. Observability — Critical Gap

**Current state: ZERO observability infrastructure.**

| Capability | Current | Required for Launch |
|---|---|---|
| Error tracking | None | Sentry / Cloudflare Logpush |
| Performance tracing | None | CF Workers Trace |
| Uptime monitoring | None | Cloudflare Health Checks / BetterUptime |
| Database metrics | None | Supabase Dashboard (already built in) |
| Audio session metrics | None | LiveKit analytics (built in) |
| Custom business metrics | None | PostHog / Amplitude (V2) |

**Minimum before launch:** Wire Sentry DSN into Worker and SPA. Add CF Workers Analytics. Both are free.

---

## 6. Scale Scenarios

### 100K Concurrent Users
- Requires: KV room cache, audio vendor, Supabase Pro
- Estimated cost: $500–$1,500/month (CF + Supabase + LiveKit)
- Timeline to ready: 4–6 weeks of focused engineering

### 500K Concurrent Users
- Requires: DO sharding for large rooms, CF Enterprise rate limiting, database read replicas
- Estimated cost: $5,000–$15,000/month
- Timeline: 3–4 months

### 1M Concurrent Users
- Requires: Custom SFU evaluation, dedicated Postgres, Supabase Enterprise or Neon
- Estimated cost: $30,000–$80,000/month
- Timeline: 6–12 months

---

## 7. Remediation Priority

| Priority | Action | Effort | Blocks |
|---|---|---|---|
| P0 | Add audio vendor (LiveKit) | L | All scale scenarios |
| P0 | Add rate limiting on OTP + rooms | S | Security + stability |
| P1 | KV cache for room listing | S | 100K scenario |
| P1 | Add Sentry error tracking | S | Observability |
| P1 | Fix N+1 query in room list | S | DB scale |
| P2 | DO state sharding | L | 500K+ scenario |
| P2 | Connection pooler URL in Supabase | XS | DB scale |

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-06*
