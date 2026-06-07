# PRODUCTION/operational-readiness.md
**Date:** 2026-06-07  **Auditor:** RALD CTO
**Scope:** DNS, Cloudflare, Supabase, LiveKit, Resend, GitHub Actions, branch protection, CI governance

---

## Summary

Loop is operationally ready for closed beta. All infrastructure is deployed and live. Five operator-side
configuration items remain before public launch. All code-side operational items are complete.

**Operational Readiness Score: 8.5/10**

---

## DNS

| Domain | Target | Verification | Status |
|--------|--------|-------------|--------|
| loop.rald.cloud | CF Pages (loop project) | HTTP 200 confirmed 2026-06-07 | ✅ Live |
| loop-api.rald.cloud | CF Worker (loop-api) | /api/health 200 + all bindings | ✅ Live |

All DNS managed via Cloudflare DNS. Proxied (orange cloud). Instant propagation.

---

## Cloudflare Status

| Resource | Details | Status |
|----------|---------|--------|
| Worker: loop-api | Production env, wrangler@4.16.0 | ✅ Deployed |
| Pages: loop | loop.rald.cloud, dist/public | ✅ Deployed (HTTP 200) |
| KV: CACHE | id: 3c71da01b3174d6c9353adbfde7491a3 | ✅ Live (binding: true) |
| D1: loop-db | id: 4616fcac-96e0-4150-a42f-3d020f45cd1d | ✅ Live (binding: true) |
| R2: loop-media | bucket: loop-media | ✅ Live (binding: true) |
| Durable Objects: ROOM_SESSION | RoomSession class | ✅ Live (binding: true) |
| Queue: loop-tasks | Consumer: max_batch 10, timeout 5s | ✅ Live (binding: true) |
| Workers AI | AI binding | ✅ Live (binding: true) |
| Observability | [observability] enabled=true | ✅ Configured |
| WAF / Bot Rules | Not audited | ⚠️ Operator action |

---

## Supabase Status

| Item | Status |
|------|--------|
| Project ID | onxdcikfttdmnhofsuwo | ✅ Live |
| Service role key | CF Worker secret (not in code) | ✅ |
| Anon key | CF Pages build env | ✅ |
| JWT secret alignment to RALD_JWT_SECRET | ❌ Not aligned (B1) — operator action |
| PITR (backup) | Requires Pro plan | ⚠️ |
| RLS policies defined | ✅ Syntax correct |
| RLS policies enforced | ❌ Blocked by B1 |
| Migration 006 applied | profile region fields (country/state/lga/lcda) | ✅ |
| Realtime | Used by room chat (messages.tsx) | ✅ |

---

## LiveKit Status

| Item | Status |
|------|--------|
| CF Worker secret: LIVEKIT_API_KEY | ⚠️ Must be set by operator |
| CF Worker secret: LIVEKIT_API_SECRET | ⚠️ Must be set by operator |
| Pages build env: VITE_LIVEKIT_URL | ⚠️ Must be set by operator |
| Health probe check | Included when key present | ✅ Code-ready |
| Token endpoint | /api/audio/token — deployed | ✅ |
| Frontend hook | use-livekit-room.ts — degrades gracefully | ✅ |

---

## GitHub Actions CI Status

| Job | Passing | Last verified |
|-----|---------|--------------|
| Lint | ✅ | 2026-06-07 |
| Typecheck | ✅ | 2026-06-07 |
| Tests | ✅ | 2026-06-07 |
| Security Audit | ✅ | 2026-06-07 |
| Deploy Worker | ✅ | 2026-06-07 |
| Deploy Pages | ✅ Fixed (919fe949) | 2026-06-07 |

All 6 jobs green. Previous Deploy Pages failure resolved by:
- Adding idempotent project-create step
- Pinning wrangler@4.16.0
- Explicit CLOUDFLARE_API_TOKEN/ACCOUNT_ID env on deploy step

---

## Branch Protection

| Rule | Status | Recommendation |
|------|--------|----------------|
| Require PR before merge | ⚠️ Not verified | Enable: require 1 review |
| Require status checks | ⚠️ Not verified | Require: Lint, Typecheck, Tests, Security |
| No direct push to main | ⚠️ Not enforced | Enable after team alignment |
| Signed commits | ⚠️ Not enforced | Optional — enable for audit trail |

---

## CI Governance Scorecard

| Standard | Status |
|----------|--------|
| 4 mandatory CI gates before deploy | ✅ |
| Deploy gated on CI (needs: [...]) | ✅ |
| Post-deploy smoke test on every Worker deploy | ✅ |
| Audit log on every deploy (Worker + Pages) | ✅ |
| pnpm audit --audit-level=high passes | ✅ |
| Dependency supply-chain policy | ✅ (minimumReleaseAgeExclude) |
| Wrangler version pinned | ✅ 4.16.0 (Phase 2 fix) |

---

## Pre-Launch Checklist

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1 | Align Supabase JWT secret = RALD_JWT_SECRET | Operator | ❌ |
| 2 | Set LIVEKIT_API_KEY CF Worker secret | Operator | ❌ |
| 3 | Set LIVEKIT_API_SECRET CF Worker secret | Operator | ❌ |
| 4 | Set VITE_LIVEKIT_URL in Pages build | Operator | ❌ |
| 5 | Configure uptime monitor on /api/healthz | Operator | ❌ |
| 6 | Set CF Analytics alert rules | Operator | ❌ |
| 7 | Enable GitHub branch protection on main | Operator | ❌ |
| 8 | Upgrade Supabase to Pro | Operator | ⚠️ For 500+ CCU |
| All code items | Complete | Engineer | ✅ |
