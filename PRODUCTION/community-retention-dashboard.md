# PRODUCTION/community-retention-dashboard.md
**Version:** 1.0
**Date:** 2026-06-07
**Sprint:** Community Validation Sprint
**Parent:** `FOUNDATION/Loop-creator-economy-v1.md`
**Authority:** CTO Office — LILCKY STUDIO LIMITED

---

## Purpose

This document specifies the five production dashboards that answer the Community Validation Sprint's primary question:

> **"Why did users return to Loop?"**

Each dashboard is a panel inside `rald-control-center`. All dashboards consume data from the Cloudflare Worker analytics endpoints documented in `FOUNDATION/community-validation-framework.md`. All data is real — no mocks, no placeholders.

---

## Access Control

| Role | Access |
|------|--------|
| `admin` | Full access to all 5 dashboards |
| `analytics` | Full access to all 5 dashboards (read-only) |
| `community_manager` | Dashboard 2 (Communities) + Dashboard 4 (Civic) only |
| `creator_manager` | Dashboard 3 (Creators) only |
| `distribution` | Dashboard 5 (Regions) only |

All access is gated by the Loop JWT (`RALD_JWT_SECRET`). Role is embedded in the JWT `role` claim.

---

## Dashboard 1 — Returning Users

**Route:** `/analytics/retention`
**Purpose:** Top-level executive view. The single screen that answers "why did users return to Loop?"

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  RETURNING USERS                          [4W ▾] [12W] [All] [↓CSV]│
├──────────────────┬──────────────────┬──────────────────┬────────────┤
│   D1 RETENTION   │  D7 RETENTION    │  D30 RETENTION   │  COHORT Δ  │
│   31.4%          │  19.2%           │  11.8%           │  +2.1% wk  │
│   ▲ +1.2%        │  ▲ +0.8%         │  ▲ +0.4%         │            │
├─────────────────────────────────────────────────────────────────────┤
│  WEEKLY COHORT RETENTION — last 12 weeks (line chart)               │
│  D1 ── D7 ── D30                                                    │
│  [Line chart: x=cohort week, y=retention %, 3 lines]               │
├─────────────────────────────────────────────────────────────────────┤
│  RETENTION BY SEGMENT              │  RETURNING vs NEW (area chart)  │
│  [Table: segment, D1, D7, D30, Δ]  │  [Stacked area: new / returning]│
│  Community members  38% 24% 15%    │                                 │
│  Creator attributed 31% 19% 11%    │                                 │
│  No attribution     22% 11%  6%    │                                 │
│  [Sort: D30 ▾]  [Filter segment]   │                                 │
├─────────────────────────────────────────────────────────────────────┤
│  WHAT DID RETURNING USERS DO? — top 10 actions on return session    │
│  1. React to post (42%)   6. View community feed (18%)              │
│  2. View feed (39%)       7. Send DM (12%)                          │
│  3. Comment (31%)         8. Join new community (9%)                │
│  4. Post (24%)            9. View creator profile (7%)              │
│  5. View story (21%)     10. Update profile (4%)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### API Calls

```typescript
// Primary retention data
GET /api/analytics/retention?segment=all&weeks=12

// Segment breakdown
GET /api/analytics/retention?segment=community_attributed&weeks=4
GET /api/analytics/retention?segment=creator_attributed&weeks=4
GET /api/analytics/retention?segment=no_attribution&weeks=4

// Return session actions
GET /api/analytics/return-actions?weeks=4&limit=10
```

### Key Metric Cards

| Metric | Format | Positive trend |
|--------|--------|---------------|
| D1 retention | `{pct}%` with Δ vs prev week | ↑ |
| D7 retention | `{pct}%` with Δ | ↑ |
| D30 retention | `{pct}%` with Δ | ↑ |
| Cohort size Δ | `+{n}% wk` | ↑ |

### Alert Conditions

- D30 retention drops > 2% week-over-week → red alert banner
- D1 retention drops > 5% → yellow alert banner
- Cohort size drops > 20% → orange alert (acquisition problem, not retention)

---

## Dashboard 2 — Most Retained Communities

**Route:** `/analytics/communities`
**Purpose:** Identify which communities are engines of retention and which are at risk.

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  COMMUNITY HEALTH                         [This week ▾] [↓CSV]     │
├──────────────────────────────────────────────────────────────────────┤
│  CHS DISTRIBUTION (histogram)             │  COMMUNITY STATS        │
│  Thriving  ████████████  14               │  Total scored:  47      │
│  Growing   ██████████    11               │  Unscored:      12      │
│  Stabilise ████████      9                │  Avg CHS:       61.4    │
│  At risk   ████          5                │  Avg D30:       16.2%   │
│  Dormant   ██            3                │  Avg members:   384     │
│  Unscored  ██            12               │                         │
├─────────────────────────────────────────────────────────────────────┤
│  TOP 20 COMMUNITIES BY D30 RETENTION                                │
│  Name             CHS    Members  D7     D30    Δ wk    Tier        │
│  Surulere Mamas   91.2   1,204    41.2%  28.4%  +1.2%  🟢 Thriving │
│  Lagos Tech Hub   88.4   842      38.1%  24.1%  +0.8%  🟢 Thriving │
│  Abuja Traders    83.1   623      33.4%  21.2%  +2.1%  🟢 Thriving │
│  ...                                                                │
│  [Click any row → filter all panels to this community]             │
│  [Sort: D30 ▾ | CHS | Members | Growth | Name]                     │
├─────────────────────────────────────────────────────────────────────┤
│  RETENTION vs SIZE (scatter)              │  BOTTOM 10 — AT RISK    │
│  [y: D30 retention, x: member count]      │  [Red-highlighted table]│
│  [Bubble size: CHS, colour: tier]         │  Community | D30 | Δ wk │
│                                           │  ... members leaving... │
└─────────────────────────────────────────────────────────────────────┘
```

### API Calls

```typescript
// Top communities by CHS
GET /api/analytics/communities/health?sort=d30&limit=20&week=YYYY-MM-DD

// CHS distribution for histogram
GET /api/analytics/communities/distribution?week=YYYY-MM-DD

// Bottom 10 (at-risk)
GET /api/analytics/communities/health?sort=chs&order=asc&limit=10&min_members=10
```

### Drilldown: Community Detail View

Clicking any community row opens a slide-over panel:

```
┌─────────────────────────────────────────────────────┐
│  Surulere Mamas                          🟢 Thriving │
│  CHS: 91.2  │  1,204 members  │  Lagos              │
├─────────────────────────────────────────────────────┤
│  D1: 44.2%  D7: 41.2%  D30: 28.4%                  │
│  [Retention line chart — 12 week trend]             │
├─────────────────────────────────────────────────────┤
│  Posts/member/wk: 3.2  │  Comment ratio: 4.8        │
│  Growth rate (7d): +6%  │  Avg trust: 72.4          │
├─────────────────────────────────────────────────────┤
│  Signal breakdown (radar chart)                     │
│  D7 ████████  D30 ████████  Posts ██████            │
│  Comments █████  Growth ████  Trust ███████         │
└─────────────────────────────────────────────────────┘
```

---

## Dashboard 3 — Most Retained Creators

**Route:** `/analytics/creators`
**Purpose:** Identify which creators drive sustainable audience retention and deserve investment.

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  CREATOR HEALTH                           [This week ▾] [↓CSV]     │
├──────────────────────────────────────────────────────────────────────┤
│  CREATOR HS DISTRIBUTION         │  CREATOR STATS                   │
│  Elite     ██████   6            │  Total scored:   31              │
│  Rising    ████████  9           │  Unscored:       18              │
│  Building  ██████████  11        │  Avg CreatorHS:  54.2            │
│  Early     ████  4               │  Avg D30:        17.8%           │
│  Inactive  █  1                  │  Total audience: 42,100          │
├─────────────────────────────────────────────────────────────────────┤
│  TOP 20 CREATORS BY D30 ATTRIBUTED RETENTION                        │
│  Name          HS    Audience  Posts/wk  D7     D30    Tier         │
│  @temi_builds  94.1  3,420     5.2       45.1%  27.8%  🏆 Elite    │
│  @lagos_live   88.3  2,104     3.1       41.2%  24.3%  🏆 Elite    │
│  @ikeja_news   82.4  1,832     7.4       38.4%  21.1%  🏆 Elite    │
│  ...                                                                │
│  [Sort: D30 ▾ | HS | Audience | Posts | Growth]                    │
├─────────────────────────────────────────────────────────────────────┤
│  CREATOR OUTPUT vs RETENTION (scatter)  │  NEW USER D1 CONVERSION   │
│  [y: D30 retention, x: posts/week]      │  Which creators convert   │
│  [Bubble: audience size, colour: tier]  │  new users to day-2 back? │
│  [Trend line overlaid]                  │  [Bar chart, top 10]      │
├─────────────────────────────────────────────────────────────────────┤
│  CREATOR RETENTION BY REGION (choropleth)                           │
│  [Map of Nigeria — LGA level — colour = avg CreatorHS of creators   │
│   in that region]                                                   │
│  [Hover: region name, creator count, avg HS, top creator]          │
└─────────────────────────────────────────────────────────────────────┘
```

### API Calls

```typescript
GET /api/analytics/creators/health?sort=d30&limit=20&week=YYYY-MM-DD
GET /api/analytics/creators/distribution?week=YYYY-MM-DD
GET /api/analytics/creators/d1-conversion?limit=10&week=YYYY-MM-DD
GET /api/analytics/regions/creators?type=lga&week=YYYY-MM-DD
```

### Drilldown: Creator Detail View

```
┌─────────────────────────────────────────────────────┐
│  @temi_builds                            🏆 Elite   │
│  CreatorHS: 94.1  │  3,420 audience  │  Eti-Osa LGA │
├─────────────────────────────────────────────────────┤
│  D1: 48.2%  D7: 45.1%  D30: 27.8%                  │
│  [Retention line chart — 12-week trend]             │
├─────────────────────────────────────────────────────┤
│  Posts/week: 5.2  │  Avg reactions: 142.3           │
│  Avg comments: 38.2  │  Audience Trust: 74.1        │
├─────────────────────────────────────────────────────┤
│  [Radar chart: D7, D30, Posts, Reactions, Comments, │
│   Trust — relative to Elite tier peers]             │
├─────────────────────────────────────────────────────┤
│  [Button: View creator profile]                     │
│  [Button: Add to creator programme]                 │
└─────────────────────────────────────────────────────┘
```

---

## Dashboard 4 — Most Trusted Civic Communities

**Route:** `/analytics/civic`
**Purpose:** Identify the highest-trust communities (civic organisations, neighbourhood groups, trade associations) that disproportionately retain users.

### Hypothesis Being Tested

Civic communities — those anchored by real-world organisations and geographic identity — will show higher D30 retention than entertainment or interest-based communities. This would confirm that identity-based belonging (not content) drives return.

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  CIVIC COMMUNITIES                        [This week ▾] [State ▾]  │
├─────────────────────────────────────────────────────────────────────┤
│  CIVIC vs NON-CIVIC D30 RETENTION (grouped bar)                     │
│  D7:   Civic 31.4%  │  Non-civic 18.2%                             │
│  D30:  Civic 22.1%  │  Non-civic 12.4%                             │
│  [Bar chart: 3 groups (D1/D7/D30), 2 bars each (civic/non-civic)] │
├─────────────────────────────────────────────────────────────────────┤
│  CIVIC COMMUNITIES (CHS >= 60)                                      │
│  Name                 Type       CHS   D30    Verified  LGA         │
│  Aguda Residents Assn Civic Org  84.2  28.1%  ✅        Surulere    │
│  Oshodi Traders Union Trade      81.4  26.3%  ✅        Oshodi-Isale│
│  Ikeja GRA WhatsApp   Neighbour  74.1  22.4%  ✅        Ikeja       │
│  ...                                                                │
│  [Verified ✅ = confirmed linked to registered organisation]        │
├─────────────────────────────────────────────────────────────────────┤
│  TRUST SCORE DISTRIBUTION (violin)      │  CIVIC DENSITY BY LGA    │
│  [y: Trust Score, grouped: Civic/Other] │  [Bar chart: civic count  │
│  [Shows civic communities cluster at    │   per LGA, top 15]        │
│   higher trust end of distribution]     │                           │
├─────────────────────────────────────────────────────────────────────┤
│  VERIFIED CIVIC ORGANISATIONS                                       │
│  [Highlighted table: org name, type, registration number,          │
│   CHS, D30, member count, linked Loop community]                   │
└─────────────────────────────────────────────────────────────────────┘
```

### API Calls

```typescript
GET /api/analytics/civic?min_chs=60&week=YYYY-MM-DD
GET /api/analytics/civic/comparison?week=YYYY-MM-DD  // civic vs non-civic stats
GET /api/analytics/civic/density?type=lga&week=YYYY-MM-DD
GET /api/analytics/civic/verified?week=YYYY-MM-DD
```

### Civic Community Classification

A community is classified as `type: civic` if any of the following:
1. Manually tagged as civic by a community manager or Trust & Safety team
2. Created by an account linked to a verified organisation in the Loop org registry
3. Community name matches patterns: "residents association", "traders union", "youth council", "women's cooperative", "market association", neighbourhood names + "community"

Civic communities are additionally tagged as `verified: true` if the creating organisation has submitted an organisation verification application and it has been approved.

---

## Dashboard 5 — Fastest Growing Regions

**Route:** `/analytics/regions`
**Purpose:** Identify where Loop is gaining meaningful density and direct distribution investment.

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  REGIONAL GROWTH                [LGA ▾] [This week ▾] [State: All ▾]│
├─────────────────────────────────────────────────────────────────────┤
│  NIGERIA DENSITY MAP                                                │
│  [Choropleth: Nigeria map at state level, colour = RDS tier]        │
│  [Click state → drills to LGA map of that state]                   │
│  Dense 🔥  Emerging 🌆  Seeding 🌱  Sparse ⬜                       │
├─────────────────────────────────────────────────────────────────────┤
│  TOP 10 LGAs BY RDS              │  TOP 10 LGAs BY 7d USER GROWTH   │
│  LGA          State  RDS  Tier   │  LGA         Growth  New users   │
│  Eti-Osa      Lagos  78.4 🌆     │  Enugu East  +34%    842         │
│  Lagos Island Lagos  74.2 🌆     │  Wuse        +28%    621         │
│  Wuse         FCT    71.1 🌆     │  Port Harcourt+22%   489         │
│  ...                             │  ...                             │
├─────────────────────────────────────────────────────────────────────┤
│  GROWTH RATE vs RETENTION (scatter)      │  EMERGING ZONES ALERT    │
│  [y: D30 retention, x: 7d growth rate]   │  Regions: RDS 40→60     │
│  [4 quadrants:]                          │  in last 30 days:        │
│    TL: High growth, low retention        │  [Alert list with Δ RDS] │
│       → acquisition problem              │                          │
│    TR: High growth, high retention       │  🌱 Enugu East  +18 RDS  │
│       → invest here immediately          │  🌱 Ibadan North+14 RDS  │
│    BL: Low growth, low retention         │  🌱 Kano Mun.  +12 RDS   │
│       → de-prioritise                    │                          │
│    BR: Low growth, high retention        │                          │
│       → distribution problem             │                          │
├─────────────────────────────────────────────────────────────────────┤
│  RDS SCORE TABLE — all LGAs with data                               │
│  LGA  State  RDS  Tier  Users  Density  D30   Communities  Creators │
│  [Sortable, filterable, paginated — up to 774 LGAs]                │
│  [Export to CSV for offline distribution planning]                  │
└─────────────────────────────────────────────────────────────────────┘
```

### The Four Quadrants (Growth vs Retention)

| Quadrant | Condition | Diagnosis | Action |
|----------|-----------|-----------|--------|
| **Invest** | High growth + High D30 | Density forming with stickiness | Accelerate — more distribution, more creator activation |
| **Investigate** | High growth + Low D30 | Users coming but not staying | Pause acquisition spend; diagnose onboarding or content gap |
| **Sustain** | Low growth + High D30 | Small loyal base | Increase distribution to build on strong retention foundation |
| **Deprioritise** | Low growth + Low D30 | Neither growing nor retaining | Move resources elsewhere; minimum viable presence only |

### API Calls

```typescript
GET /api/analytics/regions/density?type=lga&sort=rds&limit=20&week=YYYY-MM-DD
GET /api/analytics/regions/growth?type=lga&sort=growth_7d&limit=10&week=YYYY-MM-DD
GET /api/analytics/regions/density?type=state&week=YYYY-MM-DD  // for choropleth
GET /api/analytics/regions/emerging?min_rds_delta=10&days=30   // emerging zones
GET /api/analytics/regions/quadrant?type=lga&week=YYYY-MM-DD   // scatter data
```

### Map Implementation Notes

The choropleth map uses Nigeria's GADM Level 1 (state) and Level 2 (LGA) GeoJSON boundaries. Map library: **Mapbox GL JS** or **react-simple-maps** depending on bundle size constraints.

Colour scale for RDS:
```
Dense    (80-100) → #ef4444  (red-hot)
Emerging (60-79)  → #f97316  (orange)
Seeding  (40-59)  → #84cc16  (lime)
Sparse   (0-39)   → #e5e7eb  (light grey)
No data           → #f3f4f6  (lighter grey)
```

---

## Common Components

### Date Range Picker

All 5 dashboards share a date range control:

| Option | Label | Behaviour |
|--------|-------|-----------|
| Last 4 weeks | `4W` | Show last 4 complete ISO weeks |
| Last 12 weeks | `12W` | Show last 12 complete ISO weeks (default) |
| All time | `All` | All available data since first cohort |
| Custom | `Custom` | Date range input (week granularity) |

The selected range applies to all panels on the dashboard simultaneously.

### CSV Export

Every table view has a `↓CSV` button. The export includes all visible columns plus:
- `entity_id` (UUID) for programmatic use
- `cohort_week` (ISO date)
- `score_version` (always `v1` for this iteration)

### Segment Filter

Dashboard 1 and Dashboard 5 have a global segment filter that cascades:
- **State** → filters to communities, creators, and users in that state
- **LGA** → further narrows
- **LCDA** → most granular

Segment filter appears as a breadcrumb: `All → Lagos → Eti-Osa → Lekki Phase 1`

---

## Implementation Stack

| Component | Technology |
|-----------|-----------|
| Dashboard container | `rald-control-center` (React + Vite) |
| Charts | Recharts (line, bar, scatter, area) |
| Map / choropleth | react-simple-maps + Nigeria GeoJSON |
| Data fetching | React Query (TanStack Query v5) with 5-min stale time |
| Table | TanStack Table v8 (sortable, filterable, virtual scroll) |
| Auth | `RALD_JWT_SECRET` via `Authorization: Bearer` header |
| API | Cloudflare Worker `loop-api.rald.cloud/api/analytics/*` |
| Cache | KV 1h TTL (retention) / 6h TTL (scores) |
| Export | `papaparse` for client-side CSV generation |

---

## Success Criteria for Dashboard Launch

| Criterion | Target |
|-----------|--------|
| Dashboard loads within | < 2 seconds (p95) |
| All 5 dashboards working end-to-end | Before Week 5 of sprint |
| CSV export functional on all tables | Required for launch |
| Map renders all 36 states + FCT | Required for launch |
| Mobile responsive (tablet) | Minimum tablet support |
| Zero broken charts when data is empty | Required (empty states for all panels) |

### Empty States

When a panel has no data (e.g. no communities scored yet, no cohorts old enough for D30):

- Replace chart with: `No data yet — {reason}. {Expected: date or condition}.`
- Do not hide the panel — show the empty state so the operator knows it will populate.

Example: "D30 retention data will appear after the first cohort turns 31 days old. Expected: {date}."

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
