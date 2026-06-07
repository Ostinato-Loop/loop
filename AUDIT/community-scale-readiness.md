# AUDIT/community-scale-readiness.md
**Date:** 2026-06-07  **Auditor:** RALD CTO
**Scope:** V2 Community Feature — scale readiness assessment before implementation
**Phase:** V2 Foundation Sprint — Scale Audit

---

## Executive Summary

The community feature adds 7 new tables, multiple high-cardinality indexes, and 2
new query patterns (geo-proximity and trending computation) to the existing Supabase
stack. This audit assesses whether the current infrastructure can support the
community feature at closed beta scale and defines the requirements for growth.

**Community Scale Readiness Score: 7.5/10**

- Database schema design: 9/10 (fully normalized, RLS-ready, triggers for counts)
- Query performance (beta scale): 8/10 (indexes defined; N+1 risk in discovery)
- Query performance (100K+ scale): 5/10 (needs caching layer)
- Migration safety: 9/10 (all migrations non-destructive, reversible)
- Trending computation: 7/10 (CF Cron viable at beta; needs KV cache at scale)
- Civic/entertainment separation: 10/10 (enforced at DB, API, and frontend layers)

---

## Community Volume Estimates

### Phase 1 Beta (Months 0–3)
| Entity | Count | Notes |
|--------|-------|-------|
| Regional communities | ~350 | 5 states × ~70 geographic units each |
| Interest communities | ~50 | Pre-seeded topics |
| Creator communities | ~20 | Early verified creators |
| **Total communities** | **~420** | |
| Community members | ~5K | Early adopter cohort |
| Active rooms per day | ~100 | Cross-community |
| Trending computations/day | 288 | Every 5 min |

### Phase 2 Growth (Months 3–12)
| Entity | Count | Notes |
|--------|-------|-------|
| Regional communities | ~3,700 | All 36 states + FCT fully seeded |
| Interest communities | ~200 | User-created communities approved |
| Creator communities | ~500 | Verified creator program scaling |
| **Total communities** | **~4,400** | |
| Community members | ~500K | Organic growth |
| Active rooms per day | ~5,000 | |
| Member inserts per day | ~10K | New joins + re-joins |

### Phase 3 Scale (Month 12+)
| Entity | Count | Notes |
|--------|-------|-------|
| Total communities | ~50K | Ghana + Kenya expansion |
| Community members | ~10M | Full Nigeria coverage |
| Active rooms per day | ~100K | National volume |

---

## Query Load Analysis

### High-Frequency Queries (run on every Discovery feed load)

#### Query 1: Nearby Communities
```sql
SELECT * FROM communities
WHERE region_id LIKE 'NG-LA%' AND NOT is_deleted AND NOT is_suspended
ORDER BY member_count DESC LIMIT 20;
```
**Index:** `idx_communities_region_id` ✅
**Estimated execution:** < 5ms at 10K communities

#### Query 2: Live Rooms in Nearby Communities
```sql
SELECT r.*, c.name as community_name
FROM rooms r JOIN communities c ON r.community_id = c.id
WHERE c.region_id LIKE 'NG-LA%' AND r.is_live = true AND c.is_civic = false;
```
**Index:** `idx_rooms_community` on rooms, `idx_communities_region_id` on communities ✅
**Join cost:** Low at beta scale. At 100K communities: add KV cache (TTL 30s).
**Estimated execution:** < 15ms at beta; < 5ms with KV cache.

#### Query 3: Interest Community Match
```sql
SELECT c.* FROM communities c
WHERE c.interest_tags && '{afrobeats,hiphop}'::text[]
AND NOT is_suspended
ORDER BY member_count DESC LIMIT 10;
```
**Index:** `idx_communities_interest_tags` (GIN) ✅
**Estimated execution:** < 10ms at 50K communities (GIN index is O(log n) for overlap queries)

#### Query 4: Trending Lookup
```sql
SELECT ct.*, c.* FROM community_trending ct
JOIN communities c ON c.id = ct.community_id
WHERE ct.scope = 'state' AND ct.expires_at > now()
ORDER BY ct.rank ASC LIMIT 10;
```
**Index:** `idx_trending_scope_rank` with partial WHERE ✅
**Estimated execution:** < 3ms (small table; max 100 rows per scope × 5 scopes = 500 rows)

---

## N+1 Risk Assessment

### Risk 1: Community Card with Room Count
**Pattern:** For each community card, a separate query fetches live room count.
**At 20 community cards:** 21 queries (1 list + 20 individual counts)
**Fix:** Use a CTE or subquery to batch room counts:
```sql
SELECT c.*,
  (SELECT COUNT(*) FROM rooms r WHERE r.community_id = c.id AND r.is_live = true) as live_room_count
FROM communities c
WHERE ... LIMIT 20;
```
**Or:** Maintain `active_room_count` on communities table via trigger (already in schema ✅)

### Risk 2: Member Verification Check
**Pattern:** For each community action (join, post), verify the user is a member.
**Fix:** Index on `(community_id, user_id)` (primary key on community_members ✅)

### Risk 3: Moderator Permission Check
**Pattern:** For each moderation action, check permissions JSONB.
**Fix:** Cache moderator permission sets in CF KV for 5 minutes per community.

---

## Migration Safety Assessment

| Migration | Risk Level | Rollback |
|-----------|-----------|---------|
| 20260607000001_create_communities | 🟢 Low | DROP TABLE (no data loss) |
| 20260607000002_seed_regional_communities | 🟢 Low | DELETE WHERE is_system = true |
| 20260607000003_rooms_community_backfill | 🟡 Medium | Set community_id = NULL again |
| ALTER TABLE rooms ADD COLUMN community_id | 🟢 Low | DROP COLUMN |
| ALTER TABLE rooms ALTER COLUMN SET NOT NULL | 🔴 High | Must verify 0 NULLs first |

**NOT NULL constraint rule:** The final migration (SET NOT NULL) must not run until:
1. All existing rows have community_id set (verified with COUNT query)
2. All new room creation paths include community_id
3. The change is deployed to production, verified, and the team is on-call for rollback

---

## Supabase Tier Requirements

| Phase | Tier | Reason |
|-------|------|--------|
| Beta (0–3 months) | Free | < 50 concurrent realtime connections |
| Growth (3–12 months) | Pro ($25/mo) | > 200 concurrent connections |
| Scale (12+ months) | Team/Enterprise | Connection pooler, read replicas |

**Community member count triggers** (Postgres-side) add no Supabase tier requirement —
they run inside the DB engine, not as Supabase edge functions.

---

## CF Worker Impact

### New Routes Added
- `GET /api/communities/nearby` — 1 SQL query + KV read
- `GET /api/communities/trending` — 1 KV read (populated by cron)
- `GET /api/communities/:id/rooms` — 1 SQL query
- `GET /api/discovery/feed` — 4 SQL queries (parallelized with Promise.all)
- `POST /api/civic/rooms` — 6 async validation checks + 1 insert
- `GET /api/civic/feed` — 1 SQL query

### Cron Trigger
New CF Cron Trigger: `computeTrending` every 5 minutes.
Workers Cron: 0 requests/day budget impact (runs in background).
Query load: 1 aggregation query over `rooms` table per cron run.

### KV Writes
Trending results cached: ~500 rows × 5 scopes × 5 min TTL = 2,500 KV writes/hour.
KV cost: Effectively free at free tier (100M reads, 1M writes/month included).

---

## Recommendations Before Implementation

| Priority | Action | Blocks |
|----------|--------|--------|
| P0 | Add `active_room_count` trigger to communities table | Avoids N+1 in discovery |
| P0 | Implement all indexes from community-architecture-v1.md | Query performance |
| P1 | Add KV cache for trending (TTL 5min) before enabling trending | Scale |
| P1 | Verify Supabase connection pooler URL is in use | Connection limits |
| P2 | Add CF Cron Trigger for trending computation | Trending system |
| P3 | Implement community member count trigger | Count accuracy |

---

## Compliance with Production Requirements

- ✅ No CI failures introduced (new tables don't affect existing tests)
- ✅ No lint failures (no new frontend code in this sprint)
- ✅ No security regressions (RLS enabled on all new tables from day 1)
- ✅ No auth regressions (existing auth flow unchanged)
- ✅ No JWT changes (community endpoints use existing requireAuth middleware)
- ✅ No readiness score reduction (community layer is additive, not replacement)

Current production readiness score: **91/100**
Estimated post-V2-foundation score: **91/100** (no regression; V2 is docs-only this sprint)

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
