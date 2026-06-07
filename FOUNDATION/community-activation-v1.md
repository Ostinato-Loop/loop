# FOUNDATION/community-activation-v1.md
**Sprint:** V2 Community Activation  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED  
**Scope:** Community Activation architecture — making communities living daily destinations

---

## Mission

Turn communities from static structures into living daily destinations. Every user who opens Loop must immediately feel they are inside a relevant, active conversation — not browsing an empty directory.

---

## Objective 1 — Auto-Join Community System

### Principle

No manual setup required. On first launch, every user is automatically placed into communities relevant to their location and interests.

### Auto-Join Cascade

```
User completes location step
         ↓
LCDA community auto-join (if exists)
         ↓
LGA community auto-join (if exists)
         ↓
State community auto-join (always)
         ↓
Interest communities auto-join (1–5 based on selections)
```

### Implementation

**API:** `POST /api/activation/auto-join`

Request body (or read from profile):
```json
{
  "country":  "NG",
  "state_id": "lagos",
  "lga_id":   "ikeja",
  "lcda_id":  "ojodu",
  "interests": ["music", "technology"]
}
```

Response:
```json
{
  "ok": true,
  "regional_joined": ["uuid-lcda", "uuid-lga", "uuid-state"],
  "interest_joined": ["uuid-music-comm", "uuid-tech-comm"],
  "skipped": [],
  "total_joined": 5
}
```

**Database:** `auto_join_regional_communities()` Supabase RPC (migration 008)

### Rules

- Auto-join is idempotent — calling twice does not duplicate membership
- `invite_only` communities are NEVER auto-joined
- Users are joined as `role='member'` only
- Auto-join is triggered once on onboarding; subsequent profile updates do NOT re-trigger
- Users can leave any auto-joined community at any time

---

## Objective 2 — Daily Community Pulse

### Principle

Every community should show its "heartbeat" — a daily summary of what's happening.

### Pulse Data Shape

```json
{
  "community_id":      "uuid",
  "member_count":      4820,
  "room_count":        23,
  "active_room_count": 3,
  "health_score":      74,
  "is_suspended":      false,
  "live_rooms":        [ /* Room[] — up to 5 live rooms */ ],
  "recent_badges":     [ /* badges awarded in last 7 days */ ],
  "verifications":     [ /* active civic/loop/official verifications */ ],
  "generated_at":      "2026-06-07T12:00:00Z"
}
```

**API:** `GET /api/activation/pulse/:communityId`

**Database:** `get_community_pulse(p_community_id UUID)` Supabase RPC (migration 008)

### Pulse Components

| Component | Source | Freshness |
|-----------|--------|-----------|
| member_count | communities.member_count | Real-time via trigger |
| active_room_count | COUNT(rooms WHERE is_live) | Real-time |
| health_score | communities.health_score | Updated by community events |
| live_rooms | rooms WHERE is_live=true | Real-time |
| recent_badges | community_leader_badges (last 7d) | Event-driven |
| verifications | civic_verifications (active) | Stable |

---

## Objective 3 — Community Leader Program

### Badges

| Badge | Type Key | Description |
|-------|----------|-------------|
| 🎙 Community Reporter | reporter | Covers community news and civic events |
| 🎧 Community DJ | dj | Hosts music sessions for the community |
| 🎤 Community Host | host | Regular room host, high retention |
| 🤝 Community Volunteer | volunteer | Service-oriented community contributor |
| 🎨 Community Artist | artist | Creative contributor (music, poetry, comedy) |

### Award Process

Only owners and admins can award badges:

```
POST /api/activation/badges/:communityId
{
  "user_id":    "uuid",
  "badge_type": "host",
  "metadata":   { "reason": "100 rooms hosted" }
}
```

### Database: `community_leader_badges`

```sql
(community_id, user_id, badge_type) UNIQUE
-- Badges are soft-revoked: is_active=false
-- Multiple badge types per user per community allowed
```

### Display

Badges appear on:
- User's community member card
- Community pulse (recent_badges array)
- User profile (aggregated across all communities)

---

## Objective 4 — First Room Experience

### Principle

A user must NEVER see an empty screen. The first-room cascade always finds something.

### Cascade Strategy

```
User opens Loop (first session)
         ↓
GET /api/activation/first-room
         ↓
Look for live rooms in user's LCDA communities
         ↓ (empty?)
Look for live rooms in user's LGA communities
         ↓ (empty?)
Look for live rooms in user's State communities
         ↓ (still empty?)
National popular rooms (always non-empty)
```

Response always includes `cascade_level` so the UI can show context:
```json
{
  "rooms": [ /* Room[] */ ],
  "cascade_level": "state",
  "cascade_label": "Your State",
  "count": 6
}
```

### Rules

- Cascade uses CF geo-headers + profile region (whichever is available)
- Always uses public rooms only
- Ordered by: is_live DESC, audience_count DESC, created_at DESC
- Minimum 1 room returned (national fallback guarantees this)

---

## Objective 5 — Creator Momentum System

### Promotion Ladder

```
Community Creator
      ↓ (momentum threshold reached)
Rising in LCDA
      ↓
Rising in LGA
      ↓
Rising in State
      ↓
National Trend
```

### Momentum Score

Computed server-side from engagement signals (no AI):
```
momentum_score = listeners_count * 2
               + rooms_hosted * 5
               + retention_score * 1.5
```

Once `momentum_score >= promotion_threshold`, the creator is eligible for the next level. Manual promotion by system (CTO/ops) in V2 — automated ladder is a Phase 3+ feature.

### Database: `community_creator_momentum`

```sql
PRIMARY KEY (user_id, community_id)
-- One row per creator per community
-- promotion_level tracks current tier
-- promotion_threshold = 100 (default)
```

**API:** `GET /api/activation/momentum/:userId`

---

## Objective 6 — Civic Trust UI

### Verification Types

| Mark | type key | Granted By | Meaning |
|------|----------|-----------|---------|
| ✅ Community Verified | community | Community owner | Owner validates this is an authentic community |
| 🔵 Loop Verified | loop | Platform (ops) | Platform confirms authenticity |
| 🏛 Official Verified | official | Platform (ops) | Government/institution verified |

### Database: `civic_verifications`

```sql
-- community_id OR profile_id (either can be verified)
-- verification_type: community | loop | official
-- expires_at: optional expiry (for time-limited official marks)
-- is_active: soft-revoke pattern
```

### Display Rules

- `community` mark is shown on community cards (self-certified)
- `loop` mark overrides community mark (platform trust > self-trust)
- `official` mark is the highest trust signal (government/institution)
- Expired verifications are automatically hidden (expires_at < now())

---

## Objective 7 — Activation Metrics

### Events Tracked

| Event | Trigger | Purpose |
|-------|---------|---------|
| `community_join` | User joins any community | Funnel: onboarding → engaged |
| `first_room_join` | User joins their first room ever | Key conversion metric |
| `daily_active_listener` | User attends any room session | DAL metric |
| `community_retention` | User returns to community 7d+ after join | Retention |
| `creator_promotion` | Creator advances a promotion level | Growth |
| `badge_awarded` | Leader badge granted | Program adoption |
| `room_created` | Room created in a community | Activity |
| `room_attended` | User attends a room | Engagement |
| `auto_join_triggered` | Auto-join fired on onboarding | Funnel start |
| `first_room_cascade_used` | First-room fell back past LCDA | Content gap signal |

### Database: `community_activation_events`

Append-only event log. No updates. No deletes. Retention period: 1 year.

### Client Reporting

```
POST /api/activation/events
{ "event_type": "first_room_join", "community_id": "...", "room_id": "..." }
```

Only allowed event types from `ALLOWED_CLIENT_EVENTS` constant are accepted.

---

## Architecture Constraints

| Constraint | Status |
|-----------|--------|
| No video | ✅ Not implemented |
| No AI features | ✅ Not implemented |
| No radio | ✅ Not implemented |
| No CI regressions | ✅ Additive only |
| Production score ≥ 91/100 | ✅ Zero regressions |

---

## API Surface Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/activation/auto-join | ✅ JWT | Auto-join regional + interest communities |
| GET | /api/activation/first-room | ❌ Public | First room cascade |
| GET | /api/activation/pulse/:id | ❌ Public | Daily community pulse |
| GET | /api/activation/recommendations | ❌ Public | 5+ recommendations |
| GET | /api/activation/home-feed | ❌ Public | Regional home feed |
| GET | /api/activation/momentum/:userId | ❌ Public | Creator promotion ladder |
| GET | /api/activation/badges/:communityId | ❌ Public | List community badges |
| POST | /api/activation/badges/:communityId | ✅ JWT | Award leader badge |
| POST | /api/activation/events | ✅ JWT | Record activation event |

**Phase 1–7 — COMPLETE ✅**
