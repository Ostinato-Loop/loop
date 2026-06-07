# FOUNDATION/community-health-score.md
**Version:** 1.0
**Date:** 2026-06-07
**Sprint:** Community Validation Sprint
**Parent:** `FOUNDATION/Loop-creator-economy-v1.md`
**Authority:** CTO Office — LILCKY STUDIO LIMITED

---

## Purpose

This document is the authoritative specification for the three composite scoring algorithms used in the Loop Community Validation Sprint:

1. **Community Health Score (CHS)** — vitality of a named Loop community
2. **Creator Health Score (CreatorHS)** — effectiveness of a creator at retaining their audience
3. **Regional Density Score (RDS)** — geographic concentration and activity of the Loop user base

These scores are not vanity metrics. They are operational decision signals:
- CHS tells community managers which communities need intervention
- CreatorHS tells the creator programme which creators to invest in
- RDS tells distribution which regions to activate next

---

## 1. Community Health Score (CHS)

### Definition

A weekly composite score (0–100) that measures the vitality of a named Loop community — its ability to retain members, generate content, and maintain trust.

### Formula

```
CHS = (
  0.30 × N(D7_retention) +
  0.25 × N(D30_retention) +
  0.15 × N(posts_per_member_per_week) +
  0.10 × N(comment_to_post_ratio) +
  0.10 × N(new_member_growth_rate_7d) +
  0.10 × N(avg_member_trust_score)
) × 100
```

Where `N(x)` is the normalisation function (see below).

### Signal Definitions

**D7_retention** (weight 30%)
Proportion of community members who performed a qualifying action in the 7 days after joining.
```
D7_retention = members_active_days_2_to_7 / total_members
```
Only members who joined in the most recent completed cohort week are counted. Minimum eligible window: the member must have joined at least 8 days ago.

**D30_retention** (weight 25%)
Proportion of community members who returned in Days 8–30 after joining.
```
D30_retention = members_active_days_8_to_30 / total_members
```
Minimum eligible window: member joined at least 31 days ago.

**Posts per member per week** (weight 15%)
Content output normalised by community size.
```
posts_per_member_per_week = posts_in_last_7d / member_count
```
Capped at 10 per member per week (to prevent spam communities from scoring high on output).

**Comment-to-post ratio** (weight 10%)
Measures discussion depth — communities that only receive broadcasts (many posts, no replies) score lower.
```
comment_to_post_ratio = comments_in_last_7d / MAX(posts_in_last_7d, 1)
```
Capped at 20 (communities with pathological comment volumes — debate storms — are not healthier).

**New member growth rate, 7-day** (weight 10%)
Week-over-week membership growth.
```
growth_rate_7d = (members_today - members_7d_ago) / MAX(members_7d_ago, 1)
```
Capped at +200% (viral growth in a single week is noise, not signal). Negative values (member loss) are allowed — a community losing members scores 0 on this signal.

**Average member Trust Score** (weight 10%)
The mean of the Loop Trust Score of all active members (active = posted or commented in last 30 days).
```
avg_trust_score = SUM(trust_score of active members) / COUNT(active members)
```
If the community has no active members with a Trust Score, this signal returns 0.5 (neutral).

### Normalisation Function

```
N(x) = CLAMP( (x - P5) / (P95 - P5), 0, 1 )
```

Where:
- `P5` = 5th percentile of signal `x` across all scored communities (>= 10 members) in the current scoring week
- `P95` = 95th percentile of signal `x` across the same population
- `CLAMP(v, 0, 1)` = MAX(0, MIN(1, v))

**Degenerate case:** If `P95 == P5` (all communities have the same value), `N(x) = 0.5`.

Percentiles are computed fresh each scoring week. A community that was in the top 5% last week may not be this week — the distribution shifts as communities evolve.

### Eligibility Requirements

A community is eligible for CHS scoring if and only if:
1. `member_count >= 10`
2. At least 1 post published in the last 30 days
3. Community is `status = 'active'` (not archived, suspended, or private_unlisted)

Communities that fail eligibility receive `tier = 'Unscored'` and `chs = NULL`. They appear at the bottom of ranked lists with an `Unscored` badge.

### Score Tiers

| CHS range | Tier | Badge colour | Meaning |
|-----------|------|-------------|---------|
| 80 – 100 | Thriving | 🟢 Green | Healthy engine — high retention, active content, trusted membership |
| 60 – 79 | Growing | 🟡 Yellow | Positive momentum — above-median on most signals |
| 40 – 59 | Stabilising | 🟠 Orange | Mixed signals — good in some areas, weak in others |
| 20 – 39 | At risk | 🔴 Red | Below-median retention, declining or stagnant |
| 0 – 19 | Dormant | ⚫ Dark | Minimal activity, near-zero retention |
| NULL | Unscored | ⬜ Grey | Does not meet minimum eligibility |

### Interpretation Guide

**High CHS + Low member count:** Tight-knit, healthy micro-community. May be ready to grow — consider featuring.

**High CHS + High member count:** Scale engine. Study what it does right and apply to other communities.

**High retention + Low posts per member:** Members return but don't post. Content imbalance — community is consumption-heavy. Prompt community leaders to post more.

**Low retention + High growth:** New members are joining but leaving quickly. Onboarding or content relevance problem. Investigate D1 actions of churned members.

**Low Trust Score + High retention:** Members are returning but the community may have low-quality or unverified content. Flag for Trust & Safety review.

---

## 2. Creator Health Score (CreatorHS)

### Definition

A weekly composite score (0–100) that measures how effectively a Loop creator drives and retains an audience. It is attribution-based: the creator is only credited for retention of users whose first qualifying action was engagement with that creator's content.

### Formula

```
CreatorHS = (
  0.35 × N(D7_attributed_retention) +
  0.25 × N(D30_attributed_retention) +
  0.15 × N(posts_per_week_30d) +
  0.10 × N(avg_reactions_per_post_30d) +
  0.10 × N(avg_comments_per_post_30d) +
  0.05 × N(audience_trust_score)
) × 100
```

### Signal Definitions

**D7_attributed_retention** (weight 35%)
Of all users whose first qualifying action was engagement with this creator's content, the proportion who returned within 7 days.
```
D7_attributed_retention =
  attributed_users_active_days_2_to_7 / attributed_users_in_cohort_window
```

**D30_attributed_retention** (weight 25%)
Of the same attributed cohort, the proportion who returned in Days 8–30.

**Posts per week, 30-day average** (weight 15%)
Content cadence signals to the algorithm that the creator is consistently active.
```
posts_per_week_30d = posts_in_last_30d / 4.3
```
Capped at 21 posts/week (3/day). Creators exceeding this cap are not penalised — the signal just plateaus.

**Average reactions per post, 30-day** (weight 10%)
Raw engagement signal. Includes all reaction types (like, fire, heart, etc.).
```
avg_reactions_30d = total_reactions_on_posts_last_30d / posts_last_30d
```

**Average comments per post, 30-day** (weight 10%)
Discussion signal. Comments indicate the creator is generating conversation, not just broadcasting.

**Audience Trust Score** (weight 5%)
The mean Loop Trust Score of the creator's followers (users who have followed the creator profile).
```
audience_trust_score = SUM(trust_score of followers) / COUNT(followers)
```
A low-quality audience (low Trust Score) slightly penalises the creator's score — we want creators who attract verified, trusted users.

### Eligibility Requirements

A creator is eligible for CreatorHS scoring if and only if:
1. `posts_published_last_30d >= 3`
2. `attributed_audience_size >= 20` (at least 20 users whose first action was their content)
3. `account_status = 'active'`

### Score Tiers

| CreatorHS | Tier | Badge | Meaning |
|-----------|------|-------|---------|
| 80 – 100 | Elite | 🏆 Gold | Exceptional retention driver — top investment priority |
| 60 – 79 | Rising | 🌟 Silver | Strong and growing — creator programme candidate |
| 40 – 59 | Building | 📈 Bronze | Developing audience — worth monitoring |
| 20 – 39 | Early | 🌱 Green | New or inconsistent — encourage posting cadence |
| 0 – 19 | Inactive | 💤 Grey | Below threshold activity |
| NULL | Unscored | ⬜ Grey | Does not meet minimum eligibility |

### Attribution Rules

A user is attributed to a creator if their `first_event_at` action was:
1. A `view` of a post where `post.author_id = creator.id`
2. A `react` on a post where `post.author_id = creator.id`
3. A `comment` on a post where `post.author_id = creator.id`

Attribution is assigned at cohort entry time and never changes. A user attributed to Creator A at signup remains attributed to Creator A even if they later follow Creator B.

**No double-attribution:** Each user is attributed to at most one creator. If the first event matches multiple creators (edge case: a group post with multiple authors), attribution goes to the account with the higher CreatorHS from the previous scoring week (or the lower user ID as tiebreaker on first-ever scoring).

### Interpretation Guide

**High CreatorHS + Low post count:** Creator is highly efficient — each post retains users. Quality over quantity. Don't pressure them to post more; risk quality degradation.

**High post count + Low retention:** Creator is burning their audience. Every post generates new users who don't return. Content strategy problem — likely chasing viral rather than building depth.

**High D1 + Low D30:** Creator is effective at converting first impressions but can't sustain interest. Content variety or community integration is missing.

**Low audience Trust Score:** Creator may be attracting low-quality or unverified accounts. Flag for review — not necessarily a problem but worth monitoring for coordinated behaviour.

---

## 3. Regional Density Score (RDS)

### Definition

A weekly composite score (0–100) per geographic region (computed at LCDA, LGA, and State level) measuring how concentrated and actively retained the Loop user base is within that region.

**The core insight:** Loop's value is density-dependent. 500 active users in one LGA can form real communities, validate each other's identity, and meet offline. 500 users spread across 36 states cannot. RDS measures whether density is building in a way that creates sustainable value.

### Formula

```
RDS = (
  0.30 × N(active_users_per_km2) +
  0.25 × N(D30_retention_rate) +
  0.15 × N(active_community_count) +
  0.15 × N(creator_count_active) +
  0.15 × N(civic_community_ratio)
) × 100
```

### Signal Definitions

**Active users per km²** (weight 30%)
The primary density signal. Active = at least one qualifying event in the last 30 days.
```
active_users_per_km2 = active_users_30d / area_km2
```
Area km² values come from the `geography_reference` table (sourced from NBS boundary data).

For **State-level** RDS, area is the sum of all LGA areas in the state. For **LGA-level**, sum of LCDA areas. For **LCDA-level**, the direct LCDA area.

**D30 retention rate in region** (weight 25%)
The D30 retention rate of all cohort users attributed to this region.
```
D30_region = users_in_region_active_days_8_to_30 / users_in_region_in_cohort
```
This is the retention rate for users who were first active in this region (not just any users who happen to have this region on their profile).

**Active community count** (weight 15%)
Number of communities associated with this region that have at least 1 post in the last 7 days.
```
active_community_count = COUNT(communities WHERE geography = region AND posts_7d >= 1)
```
A community is associated with a region if `community.lcda`, `community.lga`, or `community.state` matches.

**Creator count (active)** (weight 15%)
Number of creators in this region with `CreatorHS >= 40` (Building tier or above) in the most recent scoring week.
```
creator_count_active = COUNT(creators WHERE geography = region AND creator_hs >= 40)
```

**Civic community ratio** (weight 15%)
The proportion of communities in this region that have `type = 'civic'` AND are verified.
```
civic_ratio = civic_verified_communities / MAX(total_communities, 1)
```
A high civic ratio signals that the region's Loop presence is anchored by trusted, real-world organisations (neighbourhood associations, trade groups, local government community liaisons) — the highest-trust community type.

### Geography Hierarchy

```
State (36 + FCT)
  └── LGA (774 total)
        └── LCDA (varies by state — e.g. Lagos has 57 LCDAs)
```

RDS is computed independently at each level. A State's RDS is NOT an average of its LGA RDS values — it is computed from the state-level signal values directly. This is intentional: a state with one hyper-dense LGA and 30 empty ones should score differently at state level vs LGA level.

### Score Tiers

| RDS | Tier | Meaning |
|-----|------|---------|
| 80 – 100 | 🔥 Dense | High concentration + high retention — launch point for offline activation |
| 60 – 79 | 🌆 Emerging | Building density — invest in creator and community growth |
| 40 – 59 | 🌱 Seeding | Early presence — some users and communities but below critical mass |
| 0 – 39 | ⬜ Sparse | Low concentration — distribution investment needed before community investment |

### Interpretation Guide

**High RDS + Low creator count:** Users are dense and retained but have no local creators. Creator recruitment opportunity — seed the region with creator activation kits.

**Low density + High retention:** Small but loyal user base. High-quality seed community that could grow with focused distribution. Don't abandon — invest.

**High density + Low retention:** Acquisition is working but product isn't retaining. Community quality problem — check CHS of communities in this region.

**High civic ratio + High retention:** This region's Loop presence is built on civic trust. These regions are the model — study and replicate their community seeding approach.

**Fast RDS growth (>15% week-over-week):** Emerging zones. Flag for distribution team to investigate organic drivers and potentially boost with targeted creator content.

---

## Score Versioning

All three scores are versioned. This document defines **v1** of each algorithm.

When signal weights, normalisation approach, eligibility thresholds, or tier boundaries change, a new version is published (`v2`, etc.) and all three scores in the `community_health_scores`, `creator_health_scores`, and `regional_density_scores` tables gain a `score_version` column. Historical scores are never overwritten — they are preserved under the version they were computed with.

Version changes require:
1. A new `FOUNDATION/community-health-score-v{N}.md` document
2. A Supabase migration adding the `score_version` column (if not already present)
3. A backfill run computing v{N} scores for all historical weeks (optional but recommended for comparison)
4. An entry in the dashboard date range picker noting the version boundary

---

## Quick Reference

### CHS Weights
| Signal | Weight |
|--------|--------|
| D7 member retention | 30% |
| D30 member retention | 25% |
| Posts per member/week | 15% |
| Comment-to-post ratio | 10% |
| New member growth rate (7d) | 10% |
| Avg member Trust Score | 10% |

### CreatorHS Weights
| Signal | Weight |
|--------|--------|
| D7 attributed retention | 35% |
| D30 attributed retention | 25% |
| Posts per week (30d avg) | 15% |
| Avg reactions per post | 10% |
| Avg comments per post | 10% |
| Audience Trust Score | 5% |

### RDS Weights
| Signal | Weight |
|--------|--------|
| Active users per km² | 30% |
| D30 regional retention | 25% |
| Active community count | 15% |
| Active creator count | 15% |
| Civic community ratio | 15% |

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
