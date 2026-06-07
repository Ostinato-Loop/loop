# FOUNDATION/Loop-creator-economy-v1.md
**Version:** 1.0 — Community Validation Sprint
**Date:** 2026-06-07
**Authority:** CTO Office — LILCKY STUDIO LIMITED
**Classification:** Strategic — Internal

---

## Mission

> **Prove that communities drive retention.**

This sprint answers one question with data:

> **"Why did users return to Loop?"**

Every metric, score, dashboard, and segment in this sprint is designed to answer that question — and only that question. We are not measuring vanity. We are measuring survival.

---

## Context

Loop is a community-first platform. The hypothesis at the core of the product is:

> Users return because they belong somewhere. Not because of content — because of community.

If this is true, D1 / D7 / D30 retention will be higher in users who are active in a named community than in users who are not. If it is false, we need to know before we scale distribution.

This sprint builds the infrastructure to find out.

---

## Sprint Scope

### What We Build

1. **Retention analytics pipeline** — D1, D7, D30 cohort tracking per user
2. **Segmentation layer** — retention broken down by LCDA, LGA, State, Community, Creator
3. **Three composite scores** — Community Health Score, Creator Health Score, Regional Density Score
4. **Four dashboards** — Returning users, Most retained communities, Most trusted civic communities, Fastest growing regions

### What We Do Not Build

- Monetisation flows (paywall, subscriptions) — deferred to creator economy v2
- Creator payouts — deferred
- Advertising attribution — deferred
- Cross-platform tracking — out of scope

---

## Retention Definitions

### D1 Retention
A user who performed any qualifying action (post, react, comment, view, join) on Day 0 AND returned to perform any qualifying action on Day 1.

```
D1_retention = users_active_day_1 / users_active_day_0
```

**Qualifying actions:** Post, React, Comment, Direct message sent, Community join, Profile view (self-initiated), Story view.  
**Non-qualifying:** Push notification open without further action, background refresh.

### D7 Retention
A user who was active on Day 0 and performed any qualifying action at least once in the window Day 2–Day 7 inclusive.

```
D7_retention = users_active_days_2_to_7 / users_active_day_0
```

### D30 Retention
A user who was active on Day 0 and performed any qualifying action at least once in the window Day 8–Day 30 inclusive.

```
D30_retention = users_active_days_8_to_30 / users_active_day_0
```

### Cohort Definition
All retention metrics are computed on a **weekly cohort basis**. A cohort is the set of users whose first qualifying action fell in a given ISO calendar week (Monday–Sunday).

---

## Segmentation Layer

All retention metrics are computed at each of the following granularities:

### LCDA (Local Council Development Area)
- The lowest Nigerian administrative geography for community policy
- Each user is assigned to an LCDA at registration via their stated location or IP-derived location at first session
- Retention is aggregated across all users registered to each LCDA

### LGA (Local Government Area)
- Parent of LCDA
- Multiple LCDAs roll up to one LGA
- Computed by joining LCDA membership to an LGA lookup table

### State
- Parent of LGA
- 36 states + FCT
- Computed by joining LGA to a state lookup table

### Community
- A named Loop community (a defined space or group with a slug)
- A user belongs to a community if they have `joined` the community (not just visited)
- Retention is computed for each community: "of users who first qualified via this community, what % returned?"

### Creator
- A Loop user with `creator_tier IS NOT NULL` OR `post_count >= 5`
- Creator retention is computed as: of all users who first discovered Loop via a creator's content, what % returned?
- Creator attribution: a user is attributed to a creator if their first qualifying action was a view or react on that creator's post

---

## Scores

### Community Health Score (CHS)
A single number (0–100) representing the vitality of a named Loop community.

**Inputs:**
| Signal | Weight |
|--------|--------|
| D7 retention of community members | 30% |
| D30 retention of community members | 25% |
| Posts per member per week (7-day rolling) | 15% |
| Comment-to-post ratio (7-day rolling) | 10% |
| New member growth rate (7-day rolling %) | 10% |
| Member trust score (avg of member Trust Scores) | 10% |

**Formula:**
```
CHS = (
  0.30 * normalise(D7_retention) +
  0.25 * normalise(D30_retention) +
  0.15 * normalise(posts_per_member_per_week) +
  0.10 * normalise(comment_to_post_ratio) +
  0.10 * normalise(new_member_growth_rate) +
  0.10 * normalise(avg_member_trust_score)
) * 100
```

Where `normalise(x)` maps x to [0,1] using the 5th–95th percentile of the distribution across all communities with >= 10 members.

**Tiers:**
| Score | Tier |
|-------|------|
| 80–100 | 🟢 Thriving |
| 60–79 | 🟡 Growing |
| 40–59 | 🟠 Stabilising |
| 20–39 | 🔴 At risk |
| 0–19 | ⚫ Dormant |

**Minimum viable community:** >= 10 members, >= 1 post in last 30 days. Communities below this threshold are excluded from CHS scoring and labelled `Unscored`.

---

### Creator Health Score (CreatorHS)
A single number (0–100) representing how effectively a creator drives and retains their audience on Loop.

**Inputs:**
| Signal | Weight |
|--------|--------|
| D7 retention of attributed audience | 35% |
| D30 retention of attributed audience | 25% |
| Posts published per week (30-day avg) | 15% |
| Avg reactions per post (30-day) | 10% |
| Avg comments per post (30-day) | 10% |
| Audience trust score (avg Trust Score of followers) | 5% |

**Formula:**
```
CreatorHS = (
  0.35 * normalise(D7_attributed_retention) +
  0.25 * normalise(D30_attributed_retention) +
  0.15 * normalise(posts_per_week) +
  0.10 * normalise(avg_reactions_per_post) +
  0.10 * normalise(avg_comments_per_post) +
  0.05 * normalise(audience_trust_score)
) * 100
```

**Tiers:**
| Score | Tier |
|-------|------|
| 80–100 | 🏆 Elite |
| 60–79 | 🌟 Rising |
| 40–59 | 📈 Building |
| 20–39 | 🌱 Early |
| 0–19 | 💤 Inactive |

**Minimum viable creator:** >= 3 posts in last 30 days, >= 20 attributed users. Creators below threshold receive `Unscored`.

---

### Regional Density Score (RDS)
A composite score (0–100) measuring how concentrated and active Loop's user base is within a geographic region (LCDA, LGA, or State level).

**Why this matters:** Loop is a density-dependent product. A community of 1,000 users spread across Nigeria is far less valuable than 1,000 users in one LGA where they can meet offline, validate each other's identity, and build real trust. RDS measures concentration *and* activity.

**Inputs:**
| Signal | Weight |
|--------|--------|
| Active users per km² (last 30 days) | 30% |
| D30 retention rate in region | 25% |
| Community count in region (>=1 post/week) | 15% |
| Creator count in region (CreatorHS >= 40) | 15% |
| Civic community ratio (verified civic orgs / total communities) | 15% |

**Formula:**
```
RDS = (
  0.30 * normalise(active_users_per_km2) +
  0.25 * normalise(D30_retention_rate) +
  0.15 * normalise(active_community_count) +
  0.15 * normalise(creator_count) +
  0.15 * normalise(civic_ratio)
) * 100
```

**Tiers:**
| Score | Tier |
|-------|------|
| 80–100 | 🔥 Dense |
| 60–79 | 🌆 Emerging |
| 40–59 | 🌱 Seeding |
| 0–39 | ⚪ Sparse |

---

## Dashboards

### Dashboard 1 — Returning Users
**Purpose:** Top-level answer to "why did users return to Loop?"

**Panels:**
- Weekly cohort D1 / D7 / D30 retention — line chart, last 12 weeks
- Retention by segment (LCDA, LGA, State, Community) — sortable table
- Retention by acquisition source (organic, creator referral, community invite, direct) — stacked bar
- Returning vs new users ratio — area chart
- Top 10 sessions per returning user (what did they do when they came back?) — ranked list

**Key question answered:** Is retention trending up, flat, or down — and in which segments?

---

### Dashboard 2 — Most Retained Communities
**Purpose:** Identify which communities cause users to return.

**Panels:**
- Top 20 communities by D30 retention — ranked table with CHS badge
- CHS distribution — histogram (Thriving / Growing / Stabilising / At risk / Dormant)
- Community retention vs community size — scatter plot (y: D30 retention, x: member count)
- Retention delta week-over-week per community — sparklines
- Bottom 10 communities (at-risk alert list) — table

**Key question answered:** Which communities are engines of retention and which are drains?

---

### Dashboard 3 — Most Retained Creators
**Purpose:** Identify which creators drive sustainable audience retention.

**Panels:**
- Top 20 creators by D30 attributed retention — ranked table with CreatorHS badge
- CreatorHS distribution — histogram
- Creator output vs retention — scatter (y: D30 retention, x: posts/week)
- New audience D1 retention per creator — bar chart (who converts new users to day-2 visitors?)
- Creator retention by region — choropleth heatmap
- Most trusted civic creators (Trust Score >= 80) — highlighted table

**Key question answered:** Which creators are worth investing in, and which are burning their audiences?

---

### Dashboard 4 — Most Trusted Civic Communities
**Purpose:** Identify communities built around civic identity (neighbourhood, LGA, school, market, trade group) — the highest-trust, highest-retention category.

**Panels:**
- All communities with `type: civic` and CHS >= 60 — ranked table
- Civic vs non-civic D30 retention comparison — grouped bar
- Trust Score distribution across civic communities — violin plot
- Civic community density by LGA — bar chart
- Verified civic orgs (linked to official registry) — highlighted rows

**Key question answered:** Are civic communities disproportionately retaining users compared to entertainment / content communities?

---

### Dashboard 5 — Fastest Growing Regions
**Purpose:** Identify where Loop is gaining meaningful density fastest.

**Panels:**
- Top 10 LGAs by 7-day user growth — bar chart
- Top 10 LGAs by RDS — ranked table
- RDS heatmap of Nigeria — choropleth at state level, drillable to LGA
- Growth rate vs retention scatter — (fast growth + low retention = acquisition problem; slow growth + high retention = distribution problem)
- Emerging density zones (RDS 40→60 in last 30 days) — alert list

**Key question answered:** Where should we invest in distribution next, and where are users staying once they arrive?

---

## Data Requirements

### Supabase Tables Required

```sql
-- Core events table (already partially exists)
user_events (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES profiles(id),
  event_type  text NOT NULL,  -- 'post','react','comment','join','view','message'
  community_id uuid REFERENCES communities(id),
  creator_id  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
)

-- Retention cohorts (materialised daily)
retention_cohorts (
  cohort_week   date NOT NULL,       -- ISO week start (Monday)
  user_id       uuid NOT NULL,
  lcda          text,
  lga           text,
  state         text,
  community_id  uuid,
  creator_id    uuid,
  d1_retained   boolean DEFAULT false,
  d7_retained   boolean DEFAULT false,
  d30_retained  boolean DEFAULT false,
  computed_at   timestamptz NOT NULL,
  PRIMARY KEY (cohort_week, user_id)
)

-- Community health scores (materialised weekly)
community_health_scores (
  community_id  uuid NOT NULL REFERENCES communities(id),
  score_week    date NOT NULL,
  chs           numeric(5,2),
  tier          text,
  d7_retention  numeric(5,4),
  d30_retention numeric(5,4),
  member_count  integer,
  post_count    integer,
  computed_at   timestamptz NOT NULL,
  PRIMARY KEY (community_id, score_week)
)

-- Creator health scores (materialised weekly)
creator_health_scores (
  creator_id    uuid NOT NULL REFERENCES profiles(id),
  score_week    date NOT NULL,
  creator_hs    numeric(5,2),
  tier          text,
  d7_retention  numeric(5,4),
  d30_retention numeric(5,4),
  audience_size integer,
  post_count    integer,
  computed_at   timestamptz NOT NULL,
  PRIMARY KEY (creator_id, score_week)
)

-- Regional density scores (materialised weekly)
regional_density_scores (
  geography_type text NOT NULL,  -- 'lcda','lga','state'
  geography_id   text NOT NULL,
  score_week     date NOT NULL,
  rds            numeric(5,2),
  tier           text,
  active_users   integer,
  area_km2       numeric,
  community_count integer,
  creator_count   integer,
  computed_at    timestamptz NOT NULL,
  PRIMARY KEY (geography_type, geography_id, score_week)
)
```

### Geography Reference Data Required
- Nigerian LCDA → LGA → State lookup table (sourced from NBS/NIMC official data)
- Area (km²) per LCDA and LGA for density calculations
- Civic organisation registry linkage (to identify and verify civic communities)

---

## Implementation Phases

### Phase 0 — Schema (Week 1)
- Create `user_events`, `retention_cohorts`, `community_health_scores`, `creator_health_scores`, `regional_density_scores` tables with RLS
- Seed geography reference data (LCDA/LGA/State lookup)
- Backfill `user_events` from existing post/react/comment/join activity

### Phase 1 — Retention Pipeline (Week 2)
- Build daily Supabase Edge Function: `compute-retention-cohorts`
  - Runs every day at 02:00 WAT
  - For each cohort week, computes D1 / D7 / D30 flags
  - Upserts `retention_cohorts` table
- Build weekly Edge Function: `compute-scores`
  - Runs every Monday at 03:00 WAT
  - Computes CHS, CreatorHS, RDS for the completed week
  - Upserts all three score tables

### Phase 2 — API Layer (Week 3)
- Cloudflare Worker endpoints:
  - `GET /api/analytics/retention?segment=community&id=:id&weeks=12`
  - `GET /api/analytics/communities/health?sort=chs&limit=20`
  - `GET /api/analytics/creators/health?sort=creator_hs&limit=20`
  - `GET /api/analytics/regions/density?type=lga&sort=rds&limit=20`
  - `GET /api/analytics/civic?min_chs=60&limit=20`
- All endpoints require `RALD_JWT_SECRET` auth (role: `admin` or `analytics`)
- All responses cached in Cloudflare KV with 1-hour TTL

### Phase 3 — Dashboards (Week 4)
- Build the 5 dashboards in `rald-control-center` using Recharts
- Connect to analytics API endpoints
- Date range picker: last 4 weeks / 12 weeks / all time
- Export to CSV on all table views
- Segment drilldown: click any row to filter entire dashboard by that segment

### Phase 4 — Validation (Week 5)
- With 4 weeks of data, run the primary validation query:
  ```sql
  SELECT
    community_attributed,
    AVG(d1_retained::int) AS d1,
    AVG(d7_retained::int) AS d7,
    AVG(d30_retained::int) AS d30
  FROM retention_cohorts
  GROUP BY community_attributed
  ORDER BY community_attributed;
  ```
- If community-attributed users show >= 15% higher D30 retention than non-attributed users: **hypothesis confirmed**
- If difference < 5%: **hypothesis rejected** — convene product review
- Publish findings in `PRODUCTION/community-validation-result.md`

---

## Success Criteria

| Metric | Target |
|--------|--------|
| D1 retention (all users) | >= 30% |
| D7 retention (all users) | >= 15% |
| D30 retention (all users) | >= 8% |
| D30 retention (community members) | >= 20% (vs 8% baseline) |
| Communities scored (CHS) | >= 10 by Week 5 |
| Creators scored | >= 20 by Week 5 |
| Regions with RDS data | All 36 states + FCT |
| Dashboard latency (p95) | < 2 seconds |

---

## Output Documents

This sprint produces three output documents:

1. **`FOUNDATION/community-validation-framework.md`** — Technical implementation spec for the retention pipeline and segmentation layer
2. **`FOUNDATION/community-health-score.md`** — Detailed specification of CHS, CreatorHS, and RDS scoring algorithms
3. **`PRODUCTION/community-retention-dashboard.md`** — Dashboard specifications, mockups, and API contracts

---

## Ownership

| Area | Owner |
|------|-------|
| Retention pipeline (Edge Functions) | Engineering Lead |
| Score algorithms | Analytics Lead |
| Dashboard UI | Frontend Lead |
| Geography reference data | CTO |
| Civic community classification | Trust & Safety Lead |
| Validation report | CTO |

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
