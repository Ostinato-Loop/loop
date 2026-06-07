# AUDIT/community-growth-analysis.md
**Sprint:** V2 Creator Promotion & Community Growth Engine  
**Date:** 2026-06-07  
**Auditor:** CTO Office — LILCKY STUDIO LIMITED

---

## Verdict: ✅ ANALYTICS FOUNDATION READY

---

## Community Health Score Components

| Dimension | Metric | Data Source |
|-----------|--------|-------------|
| Active members | DAL / member_count ratio | activation_events |
| Room frequency | rooms created per 7 days | activation_events |
| Retention | D7 return rate | activation_events |
| Moderation quality | abuse reports / member_count | moderation events (future) |
| Engagement depth | avg room attendance duration | room session (future) |

## Growth Health Tiers

| Score | Tier | Interpretation |
|-------|------|----------------|
| 80–100 | 🟢 Thriving | High engagement, low churn |
| 60–79 | 🟡 Growing | Positive trajectory |
| 40–59 | 🟠 Stagnant | Needs activation stimulus |
| 0–39 | 🔴 At Risk | Requires ops intervention |

## Growth Analytics SQL

```sql
-- Top growing communities (last 30 days)
SELECT
  c.id, c.name, c.member_count,
  COUNT(e.id) FILTER (WHERE e.event_type = 'community_join') AS joins_30d,
  COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'daily_active_listener') AS dal_30d,
  ROUND(
    100.0 *
    COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'daily_active_listener')
    / NULLIF(c.member_count, 0), 1
  ) AS dal_pct
FROM communities c
LEFT JOIN community_activation_events e
  ON e.community_id = c.id AND e.created_at > now() - interval '30 days'
WHERE NOT c.is_deleted
GROUP BY c.id
ORDER BY joins_30d DESC
LIMIT 50;
```

## Regional Growth Analysis

```sql
-- Community growth by region
SELECT
  c.region_id,
  COUNT(DISTINCT c.id) AS community_count,
  SUM(c.member_count) AS total_members,
  COUNT(e.id) AS total_joins_30d
FROM communities c
LEFT JOIN community_activation_events e
  ON e.community_id = c.id
  AND e.event_type = 'community_join'
  AND e.created_at > now() - interval '30 days'
WHERE NOT c.is_deleted AND c.region_id IS NOT NULL
GROUP BY c.region_id
ORDER BY total_joins_30d DESC;
```

**Community Growth Analysis — COMPLETE ✅**
