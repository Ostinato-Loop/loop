# AUDIT/onboarding-performance-metrics.md
**Sprint:** V3 Frictionless Onboarding — Phase 7  
**Date:** 2026-06-07  
**Auditor:** CTO Office — LILCKY STUDIO LIMITED

---

## Verdict: ✅ PASS

Metrics instrumented. Targets defined.

---

## Success Metrics

| Metric | Target | Instrumentation |
|--------|--------|-----------------|
| Time To First Room | < 30 seconds | `first_room_join` event timestamp - install timestamp |
| Time To First Community | < 60 seconds | `community_join` event timestamp - install timestamp |
| Time To First Follow | < 120 seconds | follow event timestamp - install timestamp |
| Time To First Creator Action | < 5 minutes | `room_created` event timestamp |

## Onboarding Funnel

```
Install
  ↓  (< 5s) Interest selection
  ↓  (< 10s) Location search
  ↓  (< 15s) First rooms displayed
  ↓  (< 30s) User taps room → FIRST ROOM JOIN ✅
  ↓  (< 60s) User joins community → FIRST COMMUNITY JOIN ✅
```

## Metric Queries

```sql
-- Time to first room (seconds from account creation)
SELECT
  EXTRACT(EPOCH FROM (e.created_at - p.created_at)) AS seconds_to_first_room
FROM community_activation_events e
JOIN profiles p ON p.id = e.user_id
WHERE e.event_type = 'first_room_join'
ORDER BY p.created_at DESC LIMIT 1000;

-- P50 / P90 / P99 distribution
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY diff) AS p50_seconds,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY diff) AS p90_seconds,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY diff) AS p99_seconds
FROM (
  SELECT EXTRACT(EPOCH FROM (e.created_at - p.created_at)) AS diff
  FROM community_activation_events e
  JOIN profiles p ON p.id = e.user_id
  WHERE e.event_type = 'first_room_join'
    AND e.created_at > now() - interval '30 days'
) t;
```

## Onboarding Dead End Detection

A dead end = user installed, completed interest selection, but never fired `first_room_join` within 5 minutes.

```sql
-- Dead ends: users who selected interests but never saw a room
SELECT COUNT(DISTINCT user_id) AS dead_ends
FROM community_activation_events
WHERE event_type = 'auto_join_triggered'
  AND created_at > now() - interval '7 days'
  AND user_id NOT IN (
    SELECT DISTINCT user_id FROM community_activation_events
    WHERE event_type = 'first_room_join'
      AND created_at < now() - interval '5 minutes'
  );
```

**Phase 7 — COMPLETE ✅**
