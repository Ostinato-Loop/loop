# PRODUCTION/community-validation-result.md
**Version:** TEMPLATE — awaiting Week 5 data
**Sprint:** Community Validation Sprint
**Parent:** `FOUNDATION/Loop-creator-economy-v1.md`
**Authority:** CTO Office — LILCKY STUDIO LIMITED
**Status:** 🟡 IN PROGRESS — populate after first 35 days of cohort data

---

## The Question

> **"Why did users return to Loop?"**

This document records the answer — with numbers.

Fill this document at the end of Week 5 of the Community Validation Sprint, once the first cohort has turned 35 days old and all D1/D7/D30 retention flags are computed.

---

## Hypothesis

> Users who were attributed to a named community or a specific creator on their first session will show significantly higher D30 retention than users with no attribution.

**Operationally:**
- Community-attributed D30 >= 15% above unattributed D30 → **Hypothesis Confirmed**
- Community-attributed D30 5–14% above unattributed D30 → **Inconclusive — extend sprint**
- Community-attributed D30 < 5% above unattributed D30 → **Hypothesis Rejected — convene product review**

---

## Validation Query

Run this query in the Supabase SQL editor against the `retention_cohorts` table once sufficient data is available:

```sql
SELECT
  community_attributed,
  creator_attributed,
  COUNT(*)                                   AS cohort_size,
  ROUND(AVG(d1_retained::int) * 100, 1)     AS d1_pct,
  ROUND(AVG(d7_retained::int) * 100, 1)     AS d7_pct,
  ROUND(AVG(d30_retained::int) * 100, 1)    AS d30_pct,
  MIN(cohort_week)                           AS earliest_cohort,
  MAX(cohort_week)                           AS latest_cohort
FROM retention_cohorts
WHERE cohort_week >= CURRENT_DATE - INTERVAL '35 days'
GROUP BY GROUPING SETS (
  (community_attributed, creator_attributed),
  (community_attributed),
  (creator_attributed),
  ()
)
ORDER BY community_attributed DESC NULLS LAST,
         creator_attributed    DESC NULLS LAST;
```

---

## Results

*Fill in after running the validation query.*

### Primary Retention Table

| Segment | Cohort size | D1 % | D7 % | D30 % |
|---------|-------------|-------|-------|-------|
| Community + Creator attributed | — | — | — | — |
| Community attributed only | — | — | — | — |
| Creator attributed only | — | — | — | — |
| No attribution | — | — | — | — |
| **All users (overall)** | — | — | — | — |

### D30 Lift: Community vs No Attribution

```
D30 (community attributed): —%
D30 (no attribution):        —%
Absolute lift:               —pp
Relative lift:               —%
```

### D30 Lift: Creator vs No Attribution

```
D30 (creator attributed):  —%
D30 (no attribution):       —%
Absolute lift:              —pp
Relative lift:              —%
```

---

## Top Communities by D30 Retention

*Pull from `/api/analytics/communities/health?sort=d30&limit=10` at Week 5*

| Rank | Community | Members | D30 % | CHS | Tier |
|------|-----------|---------|-------|-----|------|
| 1 | — | — | — | — | — |
| 2 | — | — | — | — | — |
| 3 | — | — | — | — | — |
| 4 | — | — | — | — | — |
| 5 | — | — | — | — | — |
| 6 | — | — | — | — | — |
| 7 | — | — | — | — | — |
| 8 | — | — | — | — | — |
| 9 | — | — | — | — | — |
| 10 | — | — | — | — | — |

---

## Top Creators by D30 Attributed Retention

*Pull from `/api/analytics/creators/health?sort=d30&limit=10` at Week 5*

| Rank | Creator | Audience | D30 % | CreatorHS | Tier |
|------|---------|----------|-------|-----------|------|
| 1 | — | — | — | — | — |
| 2 | — | — | — | — | — |
| 3 | — | — | — | — | — |
| 4 | — | — | — | — | — |
| 5 | — | — | — | — | — |
| 6 | — | — | — | — | — |
| 7 | — | — | — | — | — |
| 8 | — | — | — | — | — |
| 9 | — | — | — | — | — |
| 10 | — | — | — | — | — |

---

## Highest Density Regions at Week 5

*Pull from `/api/analytics/regions/density?type=lga&sort=rds&limit=10` at Week 5*

| Rank | LGA | State | RDS | Tier | Active users | D30 % |
|------|-----|-------|-----|------|-------------|-------|
| 1 | — | — | — | — | — | — |
| 2 | — | — | — | — | — | — |
| 3 | — | — | — | — | — | — |
| 4 | — | — | — | — | — | — |
| 5 | — | — | — | — | — | — |

---

## Civic vs Non-Civic Comparison

*Pull from `/api/analytics/civic/comparison` at Week 5*

| Metric | Civic communities | Non-civic communities | Δ |
|--------|------------------|--------------------|---|
| D1 retention | — | — | — |
| D7 retention | — | — | — |
| D30 retention | — | — | — |
| Avg CHS | — | — | — |
| Avg Trust Score | — | — | — |
| Avg member count | — | — | — |

**Civic hypothesis:** Civic communities will show higher D30 retention than non-civic communities.
**Result:** — (Confirmed / Rejected / Inconclusive)

---

## What Returning Users Did

*Pull from `/api/analytics/return-actions?weeks=5&limit=10` at Week 5*

| Rank | Action | % of return sessions |
|------|--------|---------------------|
| 1 | — | — |
| 2 | — | — |
| 3 | — | — |
| 4 | — | — |
| 5 | — | — |
| 6 | — | — |
| 7 | — | — |
| 8 | — | — |
| 9 | — | — |
| 10 | — | — |

---

## Overall Retention Against Targets

| Metric | Target | Actual | Result |
|--------|--------|--------|--------|
| D1 (all users) | ≥ 30% | — | — |
| D7 (all users) | ≥ 15% | — | — |
| D30 (all users) | ≥ 8% | — | — |
| D30 (community members) | ≥ 20% | — | — |
| Communities scored | ≥ 10 | — | — |
| Creators scored | ≥ 20 | — | — |
| Regions with RDS data | All 37 | — | — |

---

## Verdict

**Date of verdict:** —

**Hypothesis status:** 🟡 PENDING

> *(Replace with one of:)*
> - ✅ CONFIRMED — Community attribution drives significantly higher D30 retention. Proceed with Phase 3 (Retention Engine) and begin creator programme investment.
> - ⚠️ INCONCLUSIVE — Lift exists but below 15pp threshold. Extend sprint by 2 weeks with deeper segmentation. Do not scale distribution until resolved.
> - ❌ REJECTED — Community attribution does not drive meaningful D30 lift. Convene product review before continuing activation sequencing. Revisit product hypothesis.

---

## The Answer

**"Why did users return to Loop?"**

> *(Write 2–4 sentences here based on the data. Be direct. No qualifications. This is the statement we take to investors, the team, and to the next sprint.)*

---

## Next Steps Based on Verdict

### If CONFIRMED
- [ ] Publish results to team Slack and all-hands deck
- [ ] Begin Phase 3: Retention Engine (personalised feed, community digest, smart notifications)
- [ ] Launch creator programme: invite top 10 creators from this table
- [ ] Focus distribution investment on top 5 LGAs from density table
- [ ] Set D30 target for next sprint: ≥ 25% community-attributed

### If INCONCLUSIVE
- [ ] Extend cohort window to 10 weeks
- [ ] Segment deeper: which community *types* (civic, interest, neighbourhood) show the strongest lift?
- [ ] Audit community onboarding — are new users actually finding and joining communities at first session?
- [ ] Check creator attribution quality — are attributed users actually engaging with creator content or just landing on it?

### If REJECTED
- [ ] Emergency product review within 48 hours
- [ ] Pull activation sequencing until root cause is identified
- [ ] Investigate: what DO the returning users have in common?
- [ ] Consider alternative hypothesis: is it creator content quality (not community membership) that drives return?

---

## Data Lineage

| Table | Last computed | Rows |
|-------|---------------|------|
| `user_events` | — | — |
| `retention_cohorts` | — | — |
| `community_health_scores` | — | — |
| `creator_health_scores` | — | — |
| `regional_density_scores` | — | — |

**Signed off by:** —
**Date:** —

---

*CTO Office — LILCKY STUDIO LIMITED*
*Template version: 1.0 — 2026-06-07*
*Fill date: Week 5 of Community Validation Sprint*
