# FOUNDATION/community-promotion-system.md
**Version:** 1.0 — Room Promotion System Specification
**Date:** 2026-06-07
**Status:** APPROVED — Engineering Reference
**Authority:** CTO Office — LILCKY STUDIO LIMITED

---

## Core Rule

> Rooms are promoted by verified traction. No exceptions. No manual boosting.

Any exception to this rule — any operator intervention that promotes a room outside of
the data-driven system — is a governance violation. This rule protects Loop's credibility
as a fair platform.

---

## Promotion Ladder

```
Room starts
    ↓
Community Feed         (visible to community members)
    ↓  [threshold: Community Trending Score ≥ T1]
Community Trending     (prominent placement in community)
    ↓  [threshold: LGA Trending Score ≥ T2]
LGA Trending           (visible across entire LGA)
    ↓  [threshold: State Trending Score ≥ T3]
State Trending         (visible across entire State)
    ↓  [threshold: National Trending Score ≥ T4]
National Trending      (visible nationally)
```

Each level is gated by a score threshold. Rooms can move up and down.
A room that loses listeners rapidly will be demoted.

---

## Traction Signals

Eight signals drive promotion. No other signals are considered.

| Signal | Weight | Measurement | Notes |
|--------|--------|-------------|-------|
| Listeners (peak concurrent) | 1.0× | Max concurrent listeners in last 10min | Raw audience size |
| Retention score | 1.5× | Listeners who stay > 5min / total who joined | Quality signal |
| Participation rate | 2.0× | Raised hands + approved speakers / total listeners | Engagement quality |
| Raise hand rate | 1.5× | Hands raised per listener per minute | Demand to speak |
| Share events | 3.0× | Times room link shared externally (WhatsApp, Twitter) | Virality signal |
| Bookmark/Save rate | 2.5× | Listeners who bookmark room / total listeners | Intent to return |
| Replay requests | 2.0× | Users who request recap after room ends | Post-room quality |
| Community engagement | 1.5× | Announcements + reactions triggered by this room | Community impact |

### Signal Collection

All signals are collected by the Cloudflare Worker, not by the client.
Clients send events; the Worker validates and aggregates them.

```typescript
// Worker: POST /api/rooms/:id/event
type RoomEvent = {
  type: 'join' | 'leave' | 'raise_hand' | 'share' | 'bookmark' | 'replay_request';
  room_id: string;
  user_id: string;  // must match JWT sub
  timestamp: number;
};

// Anti-spoofing:
// - user_id must match authenticated JWT
// - events are rate-limited per user per room (max 1 per type per minute)
// - join/leave must match Durable Object presence state
// - share events require a platform share token (generated server-side)
```

---

## Score Formula

### Room Traction Score

```
traction_score(room, t) =

  (listeners_peak * 1.0)
  + (retention_score * 1.5 * listeners_peak)
  + (participation_rate * 2.0 * listeners_peak)
  + (raise_hand_rate * 1.5 * listeners_peak)
  + (share_count * 3.0)
  + (bookmark_count / listeners_peak * 2.5 * listeners_peak)
  + (replay_request_count * 2.0)
  + (community_engagement_score * 1.5)

  * recency_multiplier(age_minutes)
  * community_size_normalizer(community.member_count)
```

### Recency Multiplier (decays with age)
```
recency_multiplier(age_minutes) =
  1.0                      if age_minutes ≤ 5    (just started)
  exp(-0.015 * age_minutes) if age_minutes > 5    (exponential decay)
```

Half-life: ~46 minutes. A 2-hour-old room has 16% of its peak recency score.

### Community Size Normalizer (prevents large community capture)
```
community_size_normalizer(member_count) =
  1 / log10(max(member_count, 10))
```

This prevents a community with 1M members from always dominating the trending list
over a smaller community with genuinely high relative engagement.

---

## Promotion Thresholds

Thresholds are defined per scope level and re-evaluated every 5 minutes.

| Promotion Level | Score Threshold (T) | Additional Requirements |
|----------------|--------------------|-----------------------|
| Community Trending | T1: score ≥ 10 | Room has been live ≥ 2 minutes |
| LGA Trending | T2: score ≥ 50 | Community trending for ≥ 10 minutes |
| State Trending | T3: score ≥ 200 | LGA trending for ≥ 15 minutes |
| National Trending | T4: score ≥ 500 | State trending for ≥ 20 minutes |

Time requirements prevent flash-in-the-pan spikes from gaming the system.
A room must sustain traction at each level before advancing.

### Demotion

Rooms are immediately demoted if:
1. Traction score falls below the threshold for the current level for 3 consecutive evaluations (15 minutes)
2. Room host ends the room
3. Room is reported by 5+ unique verified users (pending civic team review)
4. Audience count drops to 0 and stays there for 5 minutes

---

## Anti-Gaming Rules

### 1. No Manual Boosting
The `community_trending` table has no `is_pinned_by_operator` column.
No operator UI exists to manually insert a community into the trending list.
Trending is computed exclusively by the score formula.

**Exception:** Emergency civic rooms can be promoted by Loop Civic Team
to the Civic Trending list (separate system — never mixed with entertainment).

### 2. Join-Farm Detection
```
If a room receives > 50 joins in < 60 seconds:
  - Flag for review
  - Cap join contribution to traction score for this room
  - Alert Trust & Safety team
```

### 3. Bot Detection
New accounts (< 7 days old) contribute 50% of normal weight to traction signals.
Accounts with no profile photo and no followers contribute 25% of normal weight.

### 4. Single-Account Dominance Cap
No single user can generate > 5% of a room's total traction score.
This prevents a creator from having their inner circle boost one room artificially.

### 5. Share Token Validation
External share events (WhatsApp, Twitter) require a signed share token generated
by the Worker at the moment of sharing. Fabricated share events without a valid
token are rejected.

```typescript
// Worker: GET /api/rooms/:id/share-token
// Returns a signed token valid for 1 hour for this room
const token = await signShareToken({ room_id, user_id, issued_at: Date.now() });
// Token stored in KV with expiry; redeemed once when share returns a viewer
```

---

## Trending Computation Pipeline

Runs as a Cloudflare Cron Trigger every 5 minutes.

```typescript
// Worker: scheduled handler
async function computeTrending(env: CloudflareEnv) {
  const liveRooms = await getLiveRoomsWithSignals(env);

  for (const room of liveRooms) {
    const score = computeTractionScore(room);
    const community = await getCommunity(room.community_id);

    if (score >= T1) await upsertCommunityTrending(community, 'lcda', score);
    if (score >= T2) await upsertCommunityTrending(community, 'lga', score);
    if (score >= T3) await upsertCommunityTrending(community, 'state', score);
    if (score >= T4) await upsertCommunityTrending(community, 'national', score);
  }

  // Expire stale trending entries (rooms that ended or dropped below threshold)
  await expireStaleEntries(env);
}
```

---

## UI Representation

### Community Feed (default)
Room appears in the community's room list. No badge.

### Community Trending
Room card shows: `🔥 Trending in [Community Name]`

### LGA Trending
Room card shows: `📡 Trending in [LGA Name]`
LGA discovery feed shows a "Trending" section at the top.

### State Trending
Room card shows: `⚡ Trending in [State Name]`
State-level discovery tab shows dedicated Trending section.

### National Trending
Room card shows: `🇳🇬 National Trending`
Shown on the National tab and the Loop home screen "Trending Nationally" strip.

---

## Civic Rooms — Separate Promotion System

Civic rooms (is_civic = true) are never in the entertainment promotion system.
They have a separate civic trending system governed by:
1. **Urgency** (Emergency > Traffic > Weather > Community Notice > Town Hall)
2. **Verification status** (Verified > Community-Verified > Unverified)
3. **Proximity** (LCDA > LGA > State > National)
4. **Freshness** (civic rooms decay faster — 30 minute half-life)

No engagement signals. No audience count. No shares. Only urgency + verification + proximity.

---

## Audit Trail

Every trending state change is logged for audit:

```sql
CREATE TABLE promotion_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID        NOT NULL,
  community_id    UUID        NOT NULL,
  event_type      TEXT        NOT NULL CHECK (event_type IN (
                                'promoted','demoted','flagged','expired'
                              )),
  from_scope      TEXT,
  to_scope        TEXT,
  traction_score  NUMERIC(12,4),
  signal_breakdown JSONB,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

This log is used for:
1. Operator debugging ("why did this room trend?")
2. Abuse investigation ("was this room artificially promoted?")
3. Algorithm tuning ("what signals predicted national trending?")

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
