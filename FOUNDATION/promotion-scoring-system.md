# FOUNDATION/promotion-scoring-system.md
**Sprint:** V2 Creator Promotion & Community Growth Engine  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED

---

## Mission

Identify high-quality rooms and creators entirely through data-driven signals. No manual boosting. No paid boosting. No staff boosting.

---

## Promotion Ladder

### Room Ladder
```
Room Created
     ↓ (traction signals)
Community Trending
     ↓
LCDA Trending
     ↓
LGA Trending
     ↓
State Trending
     ↓
National Trending
```

### Creator Ladder
```
Community Creator
     ↓ (engagement signals)
LCDA Creator
     ↓
LGA Creator
     ↓
State Creator
     ↓
National Creator
```

---

## Traction Signals (Weighted)

| Signal | Weight | Source |
|--------|--------|--------|
| Live listeners | 2.0× | rooms.audience_count |
| Listener retention (> 5 min) | 3.0× | room session duration |
| Room duration | 1.5× | room.ended_at - room.started_at |
| Speaker participations | 2.5× | raise_hand events |
| Room shares | 4.0× | share events |
| Room saves | 3.5× | save events |
| Community joins from room | 5.0× | community_join events with room_id |
| Replay requests | 2.0× | replay events (future) |
| Moderation score | -5.0× if < 50 | moderation quality (negative weight) |

### Momentum Score Formula

```
momentum_score = Σ(signal_count × weight)
               × moderation_multiplier (1.0 if clean, 0.2 if flagged)
```

Stored in `community_creator_momentum.momentum_score`.

---

## Promotion Thresholds

| Promotion Level | Threshold | Time Window |
|----------------|-----------|-------------|
| community → lcda | 100 | 30 days |
| lcda → lga | 500 | 30 days |
| lga → state | 2,000 | 30 days |
| state → national | 10,000 | 30 days |

Thresholds stored in `promotion_threshold` column (overrideable per community by ops).

---

## Anti-Gaming

| Attack Vector | Prevention |
|--------------|-----------|
| Bot joins | Listener session must be > 60s to count |
| Fake listeners | Retention weight ≥ 5min required |
| Coordinated join farms | Max 10 joins from single IP per hour (CF Worker rate limit) |
| Repeated self-promotion | Creator cannot promote own room to trending |
| Duplicate accounts | Phone-verified accounts only (OTP gate) |

---

## Promotion Audit Log

Every momentum score update writes to `community_activation_events`:
```json
{
  "event_type": "creator_promotion",
  "user_id": "creator-uuid",
  "community_id": "community-uuid",
  "metadata": {
    "from_level": "community",
    "to_level": "lcda",
    "score":  512,
    "threshold": 500
  }
}
```

No black box. Every promotion event is auditable.

---

## Community Health Score

`communities.health_score` (0–100):

| Factor | Weight |
|--------|--------|
| Active members (DAL/MAU ratio) | 30% |
| Room frequency (rooms per week) | 25% |
| Member retention (D7) | 25% |
| Moderation quality (low abuse reports) | 15% |
| Report ratio | -5% per report above threshold |

---

## Implementation Phase

**V2 Activation Sprint (current):** Schema only (`community_creator_momentum` table).  
**Phase 3+ (future):** Automated scoring job, Cloudflare Queue for event processing, dashboard API for creator view.

**Promotion Scoring — FOUNDATION COMPLETE ✅**
