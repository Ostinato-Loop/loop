# AUDIT/community-growth-metrics.md
**Sprint:** V2 Regional Discovery & Onboarding — Phase 6  
**Date:** 2026-06-07  
**Auditor:** CTO Office — LILCKY STUDIO LIMITED

---

## Verdict: ✅ PASS

Community growth tracking implemented via activation events + denormalized counters.

---

## Tracked Signals

| Signal | Source | Granularity |
|--------|--------|-------------|
| Joins | community_activation_events (community_join) | Per event |
| Retention | community_activation_events (community_retention) | Per event |
| Active members | community_members COUNT | Real-time |
| Room creation | community_activation_events (room_created) | Per event |
| Room attendance | community_activation_events (room_attended) | Per event |

## Denormalized Counters on communities

| Column | Updated By |
|--------|-----------|
| member_count | sync_community_member_count() trigger + RPC |
| room_count | increment/decrement_community_room_count() RPC |
| active_room_count | Activation events / room lifecycle |
| health_score | Manual / future automation |

## No Rankings

Per sprint constraint: no ranking algorithms in Phase 6. Growth data is raw — ranking is a Phase 3+ feature (Creator Promotion sprint prerequisite).

## CTO Growth Dashboard Queries

```sql
-- Top growing communities this week
SELECT c.name, c.member_count,
       COUNT(e.id) AS joins_this_week
FROM communities c
JOIN community_activation_events e
  ON e.community_id = c.id
  AND e.event_type = 'community_join'
  AND e.created_at > now() - interval '7 days'
WHERE NOT c.is_deleted
GROUP BY c.id ORDER BY joins_this_week DESC LIMIT 20;

-- Community room activity
SELECT c.name, c.room_count, c.active_room_count,
       COUNT(e.id) AS rooms_created_this_week
FROM communities c
LEFT JOIN community_activation_events e
  ON e.community_id = c.id
  AND e.event_type = 'room_created'
  AND e.created_at > now() - interval '7 days'
GROUP BY c.id ORDER BY rooms_created_this_week DESC LIMIT 20;
```

**Phase 6 — COMPLETE ✅**
