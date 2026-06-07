# PRODUCTION/community-engagement-metrics.md
**Sprint:** V2 Community Activation  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED  
**Scope:** Activation metrics framework — what to measure, targets, instrumentation

---

## Production Score Impact

```
╔══════════════════════════════════════════════════════════════════╗
║  Production Score:  91/100 — MAINTAINED                        ║
║  No auth, JWT, CI, or health endpoint changes.                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Metric 1 — Community Joins

**Definition:** Count of `community_join` activation events per day.

**Instrumentation:**
- Client fires `POST /api/activation/events { event_type: "community_join" }` on join
- Also captured server-side via `auto_join_triggered` event metadata

**Target:**
| Phase | Target |
|-------|--------|
| Day 1 | ≥ 3 communities joined per new user |
| Week 1 | ≥ 80% of new users in ≥ 1 community |
| Month 1 | ≥ 5 communities per active user |

**Query:**
```sql
SELECT date_trunc('day', created_at) AS day,
       COUNT(*) AS joins,
       COUNT(DISTINCT user_id) AS unique_users
FROM community_activation_events
WHERE event_type = 'community_join'
GROUP BY 1 ORDER BY 1 DESC;
```

---

## Metric 2 — First Room Joins

**Definition:** `first_room_join` event — user attends their first room ever.

**Instrumentation:** Client fires on first room entry (client tracks first-time state).

**Target:**
| Funnel Step | Target |
|-------------|--------|
| Install → First Community | < 60 seconds |
| Install → First Room | < 90 seconds |
| First Room Join Rate | ≥ 60% of new users within 24h |

**Cascade Efficiency:**
```sql
SELECT
  (metadata->>'cascade_level') AS cascade,
  COUNT(*) AS uses
FROM community_activation_events
WHERE event_type = 'first_room_cascade_used'
GROUP BY 1;
-- High 'national' cascade count = signal to add more local communities
```

---

## Metric 3 — Daily Active Listeners (DAL)

**Definition:** Unique users who fire `daily_active_listener` in a 24h window.

**Instrumentation:** Client fires on room session start (deduplicated per day client-side).

**Target:**
| Metric | Target |
|--------|--------|
| DAL / MAU | ≥ 30% |
| DAL Growth (MoM) | ≥ 20% |
| DAL per Community (top 10) | ≥ 50 daily |

**Query:**
```sql
SELECT date_trunc('day', created_at) AS day,
       COUNT(DISTINCT user_id) AS dal
FROM community_activation_events
WHERE event_type = 'daily_active_listener'
GROUP BY 1 ORDER BY 1 DESC;
```

---

## Metric 4 — Community Retention

**Definition:** % of users who return to a community 7 days after joining.

**Instrumentation:** `community_retention` event fired 7 days post-join if user is still active.

**Target:**
| Day | Retention Target |
|-----|-----------------|
| D7  | ≥ 40% |
| D30 | ≥ 25% |
| D90 | ≥ 15% |

**Query:**
```sql
WITH joins AS (
  SELECT user_id, community_id, MIN(created_at) AS join_date
  FROM community_activation_events WHERE event_type = 'community_join'
  GROUP BY 1, 2
),
returns AS (
  SELECT DISTINCT user_id, community_id FROM community_activation_events
  WHERE event_type = 'community_retention'
)
SELECT
  COUNT(*) AS total_joined,
  COUNT(r.user_id) AS retained,
  ROUND(100.0 * COUNT(r.user_id) / COUNT(*), 1) AS retention_pct
FROM joins j LEFT JOIN returns r USING (user_id, community_id);
```

---

## Metric 5 — Creator Promotion Rates

**Definition:** % of active creators who advance a promotion level within 30 days.

**Instrumentation:** `creator_promotion` event fired on level advancement.

**Target:**
| Level | % of creators reaching it |
|-------|--------------------------|
| Community | 100% (all room hosts) |
| LCDA | ≥ 20% |
| LGA | ≥ 10% |
| State | ≥ 3% |
| National | ≥ 0.5% |

**Query:**
```sql
SELECT promotion_level, COUNT(DISTINCT user_id) AS creators
FROM community_creator_momentum
GROUP BY promotion_level
ORDER BY array_position(
  ARRAY['community','lcda','lga','state','national'],
  promotion_level
);
```

---

## Dashboard Queries (CTO View)

### Weekly Activation Funnel
```sql
SELECT
  SUM(CASE WHEN event_type='auto_join_triggered' THEN 1 END)   AS auto_joins,
  SUM(CASE WHEN event_type='community_join' THEN 1 END)        AS community_joins,
  SUM(CASE WHEN event_type='first_room_join' THEN 1 END)       AS first_rooms,
  SUM(CASE WHEN event_type='daily_active_listener' THEN 1 END) AS dal_events,
  SUM(CASE WHEN event_type='community_retention' THEN 1 END)   AS retained
FROM community_activation_events
WHERE created_at > now() - interval '7 days';
```

### Community Health Overview
```sql
SELECT c.name, c.member_count, c.room_count, c.health_score,
       COUNT(b.id) AS active_badges,
       COUNT(cv.id) AS verifications
FROM communities c
LEFT JOIN community_leader_badges b
  ON b.community_id = c.id AND b.is_active
LEFT JOIN civic_verifications cv
  ON cv.community_id = c.id AND cv.is_active
WHERE NOT c.is_deleted
GROUP BY c.id
ORDER BY c.member_count DESC
LIMIT 50;
```

---

## Alerting Thresholds

| Metric | Alert | Severity |
|--------|-------|----------|
| DAL drops > 20% week-over-week | PagerDuty | HIGH |
| First room join rate < 30% | Slack | MEDIUM |
| Auto-join total_joined = 0 for user | Slack | LOW |
| first_room_cascade_used hitting 'national' > 50% | Slack | MEDIUM (content gap) |
| community_retention D7 < 25% | PagerDuty | HIGH |

**Production Metrics — COMPLETE ✅**
