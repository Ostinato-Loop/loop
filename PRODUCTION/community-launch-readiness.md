# PRODUCTION/community-launch-readiness.md
**Date:** 2026-06-07  **Auditor:** RALD CTO
**Scope:** V2 Community Feature — production launch readiness checklist
**Phase:** V2 Foundation Sprint — Launch Readiness

---

## Overview

This document defines the production requirements for the V2 Community feature launch.
It serves as the authoritative checklist for go/no-go decisions at each deployment gate.

**Current status:** Foundation Sprint complete (docs generated, no code deployed).
**Next gate:** Schema Migration (Supabase migrations applied to production).

---

## Production Score Baseline

Before any V2 community code ships:

| Baseline | Score | Status |
|---------|-------|--------|
| Current production score (v3 cert) | 91/100 | ✅ |
| Required minimum to start V2 | 90/100 | ✅ |
| V2 community launch target | 91/100 (no regression) | — |

V2 community feature must not reduce the production score. If any gate fails,
feature deployment is halted until the failure is resolved.

---

## Gate 1: Schema Migration ✅ CRITERIA

**Status:** Not started (Foundation Sprint is docs-only)

- [ ] All 7 community tables created in production Supabase
- [ ] All indexes created (verify with `pg_indexes` query)
- [ ] RLS enabled on all 7 tables (`pg_tables` + `pg_policies`)
- [ ] Member count triggers active (verify with test insert/delete)
- [ ] Existing rooms.community_id column added (nullable)
- [ ] Regional communities seeded (5 Phase 1 states, all LGAs)
- [ ] Zero Supabase migration errors in apply log
- [ ] Rollback tested: CREATE TABLE can be dropped without data loss

**Verification SQL:**
```sql
-- Check all tables exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('communities','community_members','community_moderators',
                    'community_rules','community_events','community_announcements',
                    'community_trending')
ORDER BY tablename;
-- Expected: 7 rows

-- Check RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('communities','community_members','community_moderators',
                    'community_rules','community_events','community_announcements',
                    'community_trending');
-- All rowsecurity must be TRUE

-- Check indexes
SELECT indexname FROM pg_indexes
WHERE tablename IN ('communities','community_members','community_trending')
ORDER BY indexname;
-- Expected: minimum 15 indexes

-- Check regional seed data
SELECT COUNT(*) FROM communities WHERE is_system = true;
-- Expected: ≥ 350 (Phase 1 regional communities)
```

---

## Gate 2: API Readiness ✅ CRITERIA

**Status:** Not started

- [ ] GET /api/communities/nearby returns 200 with correct data
- [ ] GET /api/communities/trending returns 200 with correct data
- [ ] GET /api/communities/:id/rooms returns 200 with correct data
- [ ] GET /api/discovery/feed returns 200 with correct structure
- [ ] POST /api/communities (create community) — auth required, validates all fields
- [ ] POST /api/communities/:id/join — auth required, idempotent
- [ ] GET /api/civic/rooms — returns only is_civic=true rooms
- [ ] GET /api/rooms — still returns 0 civic rooms after community feature ships
- [ ] POST /api/civic/rooms — requires creator verification tier ≥ community
- [ ] All new endpoints return structured errors (not stack traces)
- [ ] All new authenticated endpoints return 401 without valid JWT
- [ ] No existing endpoints broken (regression test suite passes)

**Regression gate:** The full CI suite (lint, typecheck, test, security) must pass
before deploy-worker is triggered. No bypasses.

---

## Gate 3: Frontend Readiness ✅ CRITERIA

**Status:** Not started

- [ ] Home tab renders community discovery strip (nearby communities)
- [ ] Home tab never shows is_civic=true room
- [ ] Civic tab renders correctly for all 5 sub-tabs
- [ ] Civic tab never shows is_civic=false room
- [ ] Community card renders correctly for regional/interest/creator types
- [ ] Community card shows live room count (from active_room_count trigger)
- [ ] Verification badges render for all 4 verification levels
- [ ] Empty feed prevention cascade tested (LCDA → LGA → State → National)
- [ ] Geo-detection tested for Lagos, Kano, Abuja (3 priority regions)
- [ ] Discover "Near me" uses actual detected region (not hardcoded Lagos)

**Critical UX rule:** The Civic tab and the Home tab must be visually distinct.
Civic content must never be visually ambiguous with entertainment content.

---

## Gate 4: CI/CD Compliance ✅ CRITERIA

**Non-negotiable. Matches existing production requirements.**

- [ ] pnpm lint — zero errors
- [ ] pnpm typecheck — zero errors
- [ ] pnpm test — zero failures (unit + integration)
- [ ] pnpm audit --audit-level=high — zero high/critical vulnerabilities
- [ ] deploy-worker CI job: all 4 gates (lint, typecheck, test, security) pass
- [ ] deploy-pages CI job: all 4 gates pass
- [ ] Post-deploy smoke test: GET /api/health → HTTP 200, all bindings true
- [ ] GET /api/healthz → HTTP 200 (liveness probe)
- [ ] Audit log entry generated for deploy-worker and deploy-pages

---

## Gate 5: Security Compliance ✅ CRITERIA

- [ ] RLS policies verified: anonymous users cannot read private community data
- [ ] RLS policies verified: non-members cannot read banned member records
- [ ] RLS policies verified: only owners/moderators can write announcements
- [ ] RLS policies verified: only Civic Team accounts can verify civic rooms
- [ ] API: civic room creation requires verification tier (no public civic room creation)
- [ ] Civic room reports are rate-limited (max 1 report per user per room)
- [ ] No new CORS changes (same CORS policy as production)
- [ ] No new JWT changes (community endpoints use existing middleware)
- [ ] No service role key usage in frontend code (all writes via authenticated Supabase)

---

## Gate 6: Monitoring Readiness ✅ CRITERIA

- [ ] /api/health binding checks still pass (D1, KV, R2, Queue, DO, AI)
- [ ] Trending computation cron trigger registered in wrangler.toml (production env)
- [ ] Cron trigger first run logged in CF Workers dashboard
- [ ] community_trending table populated after first cron run
- [ ] Error rate for new community endpoints < 1% in first 24 hours
- [ ] No spike in Supabase connection usage after deploy (verify in Supabase dashboard)

---

## Gate 7: Data Integrity Readiness ✅ CRITERIA

- [ ] Member count trigger tested: insert → count increases, delete → count decreases
- [ ] Member count trigger tested: concurrent inserts do not cause count drift
- [ ] Room backfill: all existing rooms have community_id set before NOT NULL constraint
- [ ] Regional communities: all Phase 1 regions seeded with correct region_id format
- [ ] Civic/entertainment separation: verified no civic rooms appear in entertainment queries
- [ ] Trending expiry: expired trending entries removed from community_trending table

---

## Rollback Plan

If any gate fails post-deployment:

### Worker Rollback (< 2 minutes)
```bash
# Cloudflare Dashboard → Workers & Pages → loop-api → Deployments → Rollback
# New community routes return 404 after rollback (not 500) — acceptable
```

### Pages Rollback (< 2 minutes)
```bash
# Cloudflare Dashboard → Workers & Pages → loop (Pages) → Deployments → Rollback
```

### Schema Rollback (if needed before NOT NULL constraint)
```sql
-- Drop community tables (only if no user data has been written)
DROP TABLE IF EXISTS community_trending CASCADE;
DROP TABLE IF EXISTS community_announcements CASCADE;
DROP TABLE IF EXISTS community_events CASCADE;
DROP TABLE IF EXISTS community_rules CASCADE;
DROP TABLE IF EXISTS community_moderators CASCADE;
DROP TABLE IF EXISTS community_members CASCADE;
DROP TABLE IF EXISTS communities CASCADE;
ALTER TABLE rooms DROP COLUMN IF EXISTS community_id;
ALTER TABLE rooms DROP COLUMN IF EXISTS is_civic;
```

**Note:** Schema rollback is only safe before any community data is written.
Once users have joined communities, schema rollback requires a data migration plan.

---

## Success Criteria

V2 Community feature launch is declared successful when:

1. **Adoption:** ≥ 10% of daily active users have joined at least 1 community within 7 days
2. **Regional engagement:** ≥ 3 regional communities have ≥ 100 members within 14 days
3. **Civic integrity:** Zero civic-entertainment content mixing incidents in first 30 days
4. **Performance:** Discovery feed P95 load time < 500ms
5. **Stability:** No V2 community-related CI failures or production incidents in first 7 days
6. **Score:** Post-launch production certification score ≥ 91/100

---

## Certification Schedule

| Gate | Responsible | Target Date |
|------|-------------|-------------|
| Gate 1: Schema Migration | Database Engineer | TBD |
| Gate 2: API Readiness | Backend Engineer | TBD |
| Gate 3: Frontend Readiness | Frontend Engineer | TBD |
| Gate 4: CI/CD Compliance | CI/CD | Automated |
| Gate 5: Security Compliance | CTO | TBD |
| Gate 6: Monitoring Readiness | CTO | TBD |
| Gate 7: Data Integrity | Database Engineer | TBD |
| Production Certification v4 | CTO | After all gates ✅ |

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
