# FOUNDATION/community-validation-framework.md
**Version:** 1.0
**Date:** 2026-06-07
**Sprint:** Community Validation Sprint
**Parent:** `FOUNDATION/Loop-creator-economy-v1.md`
**Authority:** CTO Office — LILCKY STUDIO LIMITED

---

## Purpose

This document is the technical implementation specification for the Loop Community Validation retention pipeline. It defines the database schema, computation logic, segmentation model, API layer, and data contracts that power the Community Validation Sprint.

The primary question being answered:

> **"Why did users return to Loop?"**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       DATA SOURCES                              │
│  user_events table   │  communities table  │  profiles table    │
└──────────────────────┴─────────────────────┴────────────────────┘
              │                    │                    │
              ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              SUPABASE EDGE FUNCTIONS (scheduled)                │
│                                                                 │
│  compute-retention-cohorts    │  compute-scores                 │
│  (daily @ 02:00 WAT)          │  (weekly Mon @ 03:00 WAT)       │
└──────────────────┬────────────┴──────────────────┬─────────────┘
                   │                               │
                   ▼                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   ANALYTICS TABLES (Supabase)                    │
│  retention_cohorts  │  community_health_scores                   │
│  creator_health_scores  │  regional_density_scores               │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                CLOUDFLARE WORKER — loop-api.rald.cloud           │
│                     /api/analytics/* endpoints                   │
│                     (JWT auth, KV cache 1h TTL)                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│              rald-control-center — Analytics Dashboards          │
│    Returning Users │ Communities │ Creators │ Civic │ Regions    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### 1. `user_events` — Event Capture

Primary feed for all retention computation. Every qualifying user action is written here.

```sql
CREATE TABLE user_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type    text NOT NULL CHECK (event_type IN (
                  'post','react','comment','join','view','message',
                  'story_view','profile_view'
                )),
  community_id  uuid REFERENCES communities(id) ON DELETE SET NULL,
  creator_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  session_id    text,
  lcda          text,
  lga           text,
  state         text,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for retention cohort queries
CREATE INDEX idx_user_events_user_created   ON user_events (user_id, created_at);
CREATE INDEX idx_user_events_community      ON user_events (community_id, created_at);
CREATE INDEX idx_user_events_creator        ON user_events (creator_id, created_at);
CREATE INDEX idx_user_events_created_at     ON user_events (created_at);
CREATE INDEX idx_user_events_geography      ON user_events (state, lga, lcda, created_at);

-- RLS: analytics role can read all rows
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON user_events
  USING (auth.role() = 'service_role');
CREATE POLICY "user_own_events" ON user_events
  FOR SELECT USING (auth.uid() = user_id);
```

**Geography population strategy:**
At event write time, the Loop API resolves `lcda`, `lga`, `state` from the user's profile location. If no location is stored, a one-time async enrichment job backfills from the IP-to-geography table. The geography fields are denormalised on `user_events` for query performance — joins to a geography lookup at analytics query time add unacceptable latency at scale.

---

### 2. `retention_cohorts` — Computed Retention Flags

```sql
CREATE TABLE retention_cohorts (
  cohort_week        date NOT NULL,   -- ISO week Monday (YYYY-MM-DD)
  user_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_event_at     timestamptz NOT NULL,
  lcda               text,
  lga                text,
  state              text,
  first_community_id uuid REFERENCES communities(id) ON DELETE SET NULL,
  first_creator_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  community_attributed boolean NOT NULL DEFAULT false,
  creator_attributed   boolean NOT NULL DEFAULT false,
  d1_retained        boolean NOT NULL DEFAULT false,
  d7_retained        boolean NOT NULL DEFAULT false,
  d30_retained       boolean NOT NULL DEFAULT false,
  computed_at        timestamptz NOT NULL,
  PRIMARY KEY (cohort_week, user_id)
);

CREATE INDEX idx_retention_cohorts_week   ON retention_cohorts (cohort_week);
CREATE INDEX idx_retention_cohorts_lcda   ON retention_cohorts (lcda, cohort_week);
CREATE INDEX idx_retention_cohorts_lga    ON retention_cohorts (lga, cohort_week);
CREATE INDEX idx_retention_cohorts_state  ON retention_cohorts (state, cohort_week);
CREATE INDEX idx_retention_cohorts_comm   ON retention_cohorts (first_community_id, cohort_week);
CREATE INDEX idx_retention_cohorts_creator ON retention_cohorts (first_creator_id, cohort_week);

ALTER TABLE retention_cohorts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON retention_cohorts
  USING (auth.role() = 'service_role');
```

**`community_attributed`:** TRUE if the user's first qualifying event (`first_event_at`) was a `join`, `post`, `react`, or `comment` in a specific community.

**`creator_attributed`:** TRUE if the user's first qualifying event was a `view` or `react` on content owned by a specific creator.

A user can be both community-attributed and creator-attributed if a creator's content was inside a community. In this case both flags are set to TRUE and both `first_community_id` and `first_creator_id` are populated.

---

### 3. `community_health_scores`

```sql
CREATE TABLE community_health_scores (
  community_id        uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  score_week          date NOT NULL,
  chs                 numeric(5,2),       -- 0-100
  tier                text CHECK (tier IN ('Thriving','Growing','Stabilising','At risk','Dormant','Unscored')),
  d7_retention        numeric(5,4),
  d30_retention       numeric(5,4),
  member_count        integer NOT NULL DEFAULT 0,
  posts_per_member    numeric(6,3),
  comment_post_ratio  numeric(6,3),
  growth_rate_7d      numeric(6,4),
  avg_trust_score     numeric(5,2),
  computed_at         timestamptz NOT NULL,
  PRIMARY KEY (community_id, score_week)
);

CREATE INDEX idx_chs_week ON community_health_scores (score_week, chs DESC);
```

---

### 4. `creator_health_scores`

```sql
CREATE TABLE creator_health_scores (
  creator_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score_week          date NOT NULL,
  creator_hs          numeric(5,2),
  tier                text CHECK (tier IN ('Elite','Rising','Building','Early','Inactive','Unscored')),
  d7_retention        numeric(5,4),
  d30_retention       numeric(5,4),
  audience_size       integer NOT NULL DEFAULT 0,
  posts_per_week      numeric(5,2),
  avg_reactions       numeric(6,2),
  avg_comments        numeric(6,2),
  audience_trust_score numeric(5,2),
  computed_at         timestamptz NOT NULL,
  PRIMARY KEY (creator_id, score_week)
);

CREATE INDEX idx_creator_hs_week ON creator_health_scores (score_week, creator_hs DESC);
```

---

### 5. `regional_density_scores`

```sql
CREATE TABLE regional_density_scores (
  geography_type   text NOT NULL CHECK (geography_type IN ('lcda','lga','state')),
  geography_id     text NOT NULL,    -- slug, e.g. 'lagos-island', 'eti-osa', 'lagos'
  geography_name   text NOT NULL,
  score_week       date NOT NULL,
  rds              numeric(5,2),
  tier             text CHECK (tier IN ('Dense','Emerging','Seeding','Sparse')),
  active_users_30d integer NOT NULL DEFAULT 0,
  area_km2         numeric,
  density_per_km2  numeric(10,4),
  d30_retention    numeric(5,4),
  active_community_count integer DEFAULT 0,
  creator_count    integer DEFAULT 0,
  civic_ratio      numeric(5,4),
  computed_at      timestamptz NOT NULL,
  PRIMARY KEY (geography_type, geography_id, score_week)
);

CREATE INDEX idx_rds_week ON regional_density_scores (score_week, rds DESC);
CREATE INDEX idx_rds_type_week ON regional_density_scores (geography_type, score_week, rds DESC);
```

---

### 6. `geography_reference` — Nigeria LCDA/LGA/State Lookup

```sql
CREATE TABLE geography_reference (
  lcda_id     text PRIMARY KEY,
  lcda_name   text NOT NULL,
  lga_id      text NOT NULL,
  lga_name    text NOT NULL,
  state_id    text NOT NULL,
  state_name  text NOT NULL,
  area_km2    numeric,
  lat_center  numeric,
  lng_center  numeric
);

CREATE INDEX idx_geography_lga   ON geography_reference (lga_id);
CREATE INDEX idx_geography_state ON geography_reference (state_id);
```

**Data source:** Nigerian Bureau of Statistics LCDA/LGA/State boundary data (public domain). Area km² values from geospatial boundary files (GADM level 3). Seed file: `workers/loop-messenger-api/supabase/seeds/geography_reference.sql`.

---

## Computation Logic

### Edge Function: `compute-retention-cohorts`

**Schedule:** Daily at 02:00 WAT (01:00 UTC)

**Algorithm:**

```typescript
// Pseudocode for compute-retention-cohorts
async function computeRetentionCohorts(db: SupabaseClient) {
  // 1. Find all cohort weeks that need recomputing
  //    (current week + any week in last 35 days with new events)
  const cohortWeeks = await getCohortWeeksToProcess(db); // ISO Monday dates

  for (const cohortWeek of cohortWeeks) {
    const cohortStart = cohortWeek;               // Day 0
    const cohortEnd   = addDays(cohortWeek, 6);  // Day 6 (end of first week)

    // 2. Get all users whose first qualifying event falls in this cohort week
    const cohortUsers = await db.rpc('get_cohort_users', {
      p_week_start: cohortStart,
      p_week_end:   cohortEnd
    });
    // Returns: { user_id, first_event_at, lcda, lga, state,
    //            first_community_id, first_creator_id,
    //            community_attributed, creator_attributed }

    // 3. For each user, compute D1 / D7 / D30 retention
    const records = await Promise.all(cohortUsers.map(async (user) => {
      const day0 = user.first_event_at;

      const [d1, d7, d30] = await Promise.all([
        hasEventInWindow(db, user.user_id, day0, 1, 1),   // Day 1
        hasEventInWindow(db, user.user_id, day0, 2, 7),   // Days 2-7
        hasEventInWindow(db, user.user_id, day0, 8, 30),  // Days 8-30
      ]);

      return {
        cohort_week:          cohortWeek,
        user_id:              user.user_id,
        first_event_at:       user.first_event_at,
        lcda:                 user.lcda,
        lga:                  user.lga,
        state:                user.state,
        first_community_id:   user.first_community_id,
        first_creator_id:     user.first_creator_id,
        community_attributed: user.community_attributed,
        creator_attributed:   user.creator_attributed,
        d1_retained:          d1,
        d7_retained:          d7,
        d30_retained:         d30,
        computed_at:          new Date().toISOString(),
      };
    }));

    // 4. Upsert all records for this cohort week
    await db.from('retention_cohorts')
      .upsert(records, { onConflict: 'cohort_week,user_id' });
  }
}

async function hasEventInWindow(
  db: SupabaseClient,
  userId: string,
  day0: Date,
  startDay: number,
  endDay: number
): Promise<boolean> {
  const windowStart = addDays(day0, startDay);
  const windowEnd   = addDays(day0, endDay + 1); // exclusive upper bound
  const { count } = await db
    .from('user_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart.toISOString())
    .lt('created_at',  windowEnd.toISOString());
  return (count ?? 0) > 0;
}
```

---

### Edge Function: `compute-scores`

**Schedule:** Every Monday at 03:00 WAT (02:00 UTC)

**Algorithm:**

```typescript
// Pseudocode for compute-scores
async function computeScores(db: SupabaseClient) {
  const scoreWeek = getPreviousMonday(); // completed week just ended

  // 1. Community Health Scores
  const communities = await db
    .from('communities')
    .select('id')
    .gte('member_count', 10); // minimum viable community

  for (const community of communities) {
    const signals = await getCommunitySignals(db, community.id, scoreWeek);
    const chs = computeCHS(signals, await getPercentiles(db, 'community', scoreWeek));
    await upsertCHS(db, community.id, scoreWeek, chs, signals);
  }

  // 2. Creator Health Scores
  const creators = await getEligibleCreators(db); // post_count >= 3 last 30d + audience >= 20
  for (const creator of creators) {
    const signals = await getCreatorSignals(db, creator.id, scoreWeek);
    const creatorHS = computeCreatorHS(signals, await getPercentiles(db, 'creator', scoreWeek));
    await upsertCreatorHS(db, creator.id, scoreWeek, creatorHS, signals);
  }

  // 3. Regional Density Scores
  for (const geoType of ['lcda', 'lga', 'state'] as const) {
    const regions = await getRegions(db, geoType);
    for (const region of regions) {
      const signals = await getRegionalSignals(db, geoType, region.id, scoreWeek);
      const rds = computeRDS(signals, await getPercentiles(db, 'region', scoreWeek));
      await upsertRDS(db, geoType, region.id, scoreWeek, rds, signals);
    }
  }
}
```

**Normalisation function:**
```typescript
function normalise(
  value: number,
  p5: number,   // 5th percentile across all entities in class
  p95: number   // 95th percentile
): number {
  if (p95 === p5) return 0.5; // degenerate distribution
  const clamped = Math.max(p5, Math.min(p95, value));
  return (clamped - p5) / (p95 - p5);
}
```

---

## API Layer

All analytics endpoints are served by the Cloudflare Worker at `loop-api.rald.cloud`. They require a valid JWT with `role: admin` or `role: analytics`.

### Retention Endpoint

```
GET /api/analytics/retention
  ?segment=community|creator|lcda|lga|state|all
  &id=<entity_id>               (required when segment != 'all')
  &weeks=4|12|52                (default: 12)
  &cohort_start=YYYY-MM-DD      (optional override)

Response 200:
{
  "segment": "community",
  "entity_id": "uuid",
  "cohorts": [
    {
      "cohort_week": "2026-05-25",
      "cohort_size": 342,
      "d1_retained": 127,
      "d7_retained": 89,
      "d30_retained": 51,
      "d1_rate": 0.371,
      "d7_rate": 0.260,
      "d30_rate": 0.149
    }
  ],
  "averages": {
    "d1_rate": 0.348,
    "d7_rate": 0.241,
    "d30_rate": 0.143
  }
}
```

### Community Health Endpoint

```
GET /api/analytics/communities/health
  ?sort=chs|d7|d30|members|growth     (default: chs)
  &tier=Thriving|Growing|...           (optional filter)
  &limit=20                            (default: 20, max: 100)
  &week=YYYY-MM-DD                     (default: latest)

Response 200:
{
  "week": "2026-06-01",
  "communities": [
    {
      "community_id": "uuid",
      "name": "string",
      "slug": "string",
      "chs": 87.3,
      "tier": "Thriving",
      "d7_retention": 0.412,
      "d30_retention": 0.231,
      "member_count": 1204,
      "posts_per_member": 2.3,
      "growth_rate_7d": 0.08
    }
  ],
  "total": 47
}
```

### Creator Health Endpoint

```
GET /api/analytics/creators/health
  ?sort=creator_hs|d7|d30|audience|posts  (default: creator_hs)
  &tier=Elite|Rising|...
  &limit=20
  &week=YYYY-MM-DD

Response 200:
{
  "week": "2026-06-01",
  "creators": [
    {
      "creator_id": "uuid",
      "display_name": "string",
      "creator_hs": 91.2,
      "tier": "Elite",
      "d7_retention": 0.451,
      "d30_retention": 0.278,
      "audience_size": 3420,
      "posts_per_week": 5.2,
      "avg_reactions": 142.3
    }
  ],
  "total": 31
}
```

### Regional Density Endpoint

```
GET /api/analytics/regions/density
  ?type=lcda|lga|state       (default: lga)
  &sort=rds|growth|users     (default: rds)
  &limit=20
  &week=YYYY-MM-DD

Response 200:
{
  "week": "2026-06-01",
  "geography_type": "lga",
  "regions": [
    {
      "geography_id": "eti-osa",
      "name": "Eti-Osa",
      "state": "Lagos",
      "rds": 78.4,
      "tier": "Emerging",
      "active_users_30d": 4201,
      "density_per_km2": 12.4,
      "d30_retention": 0.192,
      "active_community_count": 14,
      "creator_count": 8
    }
  ],
  "total": 140
}
```

### Civic Communities Endpoint

```
GET /api/analytics/civic
  ?min_chs=60
  &state=<state_id>
  &limit=20
  &week=YYYY-MM-DD

Response 200:
{
  "communities": [
    {
      "community_id": "uuid",
      "name": "string",
      "community_type": "civic",
      "verified": true,
      "chs": 73.2,
      "d30_retention": 0.248,
      "state": "Lagos",
      "lga": "Eti-Osa"
    }
  ]
}
```

---

## Caching Strategy

| Cache layer | TTL | Invalidation |
|-------------|-----|-------------|
| Cloudflare KV — retention endpoint | 1 hour | On Edge Function compute completion |
| Cloudflare KV — health/density endpoints | 6 hours | Weekly on score compute |
| Cloudflare KV — civic endpoint | 6 hours | Weekly on score compute |
| Dashboard client — React Query | 5 minutes | Manual refresh button |

Cache keys follow the pattern: `analytics:v1:{endpoint}:{params_hash}`.

---

## Backfill Strategy

On first deploy, all historical events must be backfilled into `user_events` from the existing `posts`, `reactions`, `comments`, and `community_members` tables.

```sql
-- Backfill posts
INSERT INTO user_events (user_id, event_type, community_id, lcda, lga, state, created_at)
SELECT p.author_id, 'post', p.community_id, pr.lcda, pr.lga, pr.state, p.created_at
FROM posts p
LEFT JOIN profiles pr ON pr.id = p.author_id
ON CONFLICT DO NOTHING;

-- Backfill joins
INSERT INTO user_events (user_id, event_type, community_id, created_at)
SELECT cm.user_id, 'join', cm.community_id, cm.joined_at
FROM community_members cm
ON CONFLICT DO NOTHING;

-- Backfill reactions (similarly for comments, messages)
-- ...
```

Run backfill as a one-time migration file in `supabase/migrations/`.

---

## Validation Query

After 4+ weeks of data, run this query to answer the primary question:

```sql
SELECT
  community_attributed,
  creator_attributed,
  COUNT(*) AS cohort_size,
  ROUND(AVG(d1_retained::int) * 100, 1) AS d1_pct,
  ROUND(AVG(d7_retained::int) * 100, 1) AS d7_pct,
  ROUND(AVG(d30_retained::int) * 100, 1) AS d30_pct
FROM retention_cohorts
WHERE cohort_week >= CURRENT_DATE - INTERVAL '35 days'
GROUP BY GROUPING SETS (
  (community_attributed, creator_attributed),
  (community_attributed),
  ()
)
ORDER BY community_attributed DESC, creator_attributed DESC;
```

**Expected result if hypothesis holds:**

| community_attributed | creator_attributed | d1_pct | d7_pct | d30_pct |
|---|---|---|---|---|
| true | true | 42% | 28% | 18% |
| true | false | 38% | 24% | 15% |
| false | true | 31% | 19% | 11% |
| false | false | 22% | 11% | 6% |
| (all) | — | 31% | 19% | 11% |

Community-attributed users should show 2–3x higher D30 retention than non-attributed users.

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
