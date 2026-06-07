# FOUNDATION/community-discovery-v1.md
**Version:** 1.0 — Community Discovery Engine Specification
**Date:** 2026-06-07
**Status:** APPROVED — Engineering Reference
**Authority:** CTO Office — LILCKY STUDIO LIMITED
**Companion:** FOUNDATION/loop-v2-discovery-engine.md (discovery algorithm strategy)

---

## Purpose

This document specifies the engineering implementation of community discovery:
how a user's location is detected, how communities are surfaced in priority order,
and how the system prevents empty feeds at every geographic level.

---

## Geo-Detection Pipeline

When a user opens Loop, the system determines their location in this priority order:

### Layer 1: Cloudflare Headers (instant, server-side)
```
CF-IPCountry      → country code (e.g. "NG")
CF-IPCity         → city name (e.g. "Lagos")
CF-IPRegion       → state/region (e.g. "Lagos State")
CF-IPContinent    → continent code (e.g. "AF")
```
These are populated by Cloudflare for every Worker request. They are the fastest
and most reliable signal. No user permission required.

### Layer 2: Browser Geolocation (accurate, requires permission)
```typescript
// Called once on first app load, result stored in localStorage
navigator.geolocation.getCurrentPosition(
  (pos) => resolveRegionFromCoordinates(pos.coords.latitude, pos.coords.longitude),
  (err) => fallbackToCFHeaders(),
  { enableHighAccuracy: false, timeout: 5000, maximumAge: 3600000 }
);
```
Result: reverse-geocoded to State/LGA/LCDA. Stored in profile.location_region_id.

### Layer 3: Profile Setting (persistent, user-controlled)
User can manually set their region in Settings → "My Region". This overrides
all automatic detection and is persisted to the `profiles` table.

```sql
-- profiles table additions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_region_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_set_manually BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
```

### Layer 4: Onboarding State (fallback)
During onboarding, users select their state. This is the fallback when all other
signals are unavailable.

### Fallback Chain
```
profile.location_region_id (manual override)
  ↓ missing
CF-IPRegion → resolved to region_id
  ↓ VPN / unavailable
navigator.geolocation → reverse geocode
  ↓ permission denied
onboarding state selection
  ↓ not onboarded
Default: "NG-LA" (Lagos State) — disclosed to user
```

---

## Discovery Feed Composition

When a user opens Loop, they see 5 discovery layers in this order:

### Layer 1: Nearby Communities
Communities anchored to the user's detected region.

```
Priority order:
  1. Exact LCDA match    (e.g. user is in Ojodu LCDA → show Ojodu LCDA community)
  2. LGA match           (e.g. Ikeja LGA community)
  3. State match         (e.g. Lagos State community)
  4. National            (e.g. Nigeria national community)
```

Display: horizontal scroll of community cards with live room count and member count.

### Layer 2: Live Rooms in Nearby Communities
Rooms that are currently live, anchored to communities in the user's region.

```sql
SELECT r.*, c.name as community_name, c.region_id
FROM rooms r
JOIN communities c ON r.community_id = c.id
WHERE c.region_id LIKE :user_state_prefix || '%'  -- e.g. 'NG-LA%'
  AND r.is_live = true
  AND c.is_civic = false  -- civic rooms are in the Civic tab only
ORDER BY r.audience_count DESC, r.created_at DESC
LIMIT 20;
```

### Layer 3: Interest Communities
Communities matching the user's stated interests from onboarding.

```sql
SELECT c.*,
  CARDINALITY(ARRAY(
    SELECT unnest(c.interest_tags) INTERSECT SELECT unnest(:user_interests)
  )) as match_score
FROM communities c
WHERE c.type IN ('interest', 'creator_artist', 'creator_dj', 'creator_radio',
                 'creator_podcaster', 'creator_sports')
  AND c.interest_tags && :user_interests::text[]  -- overlap operator
  AND NOT c.is_suspended
ORDER BY match_score DESC, c.member_count DESC
LIMIT 10;
```

### Layer 4: Friends Activity
Communities where accounts the user follows are active.

```sql
SELECT DISTINCT cm.community_id, c.name, cm.last_active_at
FROM community_members cm
JOIN communities c ON c.id = cm.community_id
WHERE cm.user_id IN (
  SELECT following_id FROM follows WHERE follower_id = :user_id
)
AND cm.last_active_at > now() - INTERVAL '24 hours'
ORDER BY cm.last_active_at DESC
LIMIT 10;
```

### Layer 5: Trending Regional Rooms
The top-ranked live rooms at state or national level (from community_trending).

```sql
SELECT ct.rank, ct.score, c.*, ct.scope
FROM community_trending ct
JOIN communities c ON c.id = ct.community_id
WHERE ct.scope = :user_scope  -- 'lga' | 'state' | 'national'
  AND ct.expires_at > now()
ORDER BY ct.rank ASC
LIMIT 10;
```

---

## Empty Feed Prevention

**Rule:** Users always see activity. Empty feeds are never acceptable.

The system implements a geographic merge cascade:

### Level 1: LCDA Feed
Show rooms from communities anchored to user's LCDA.

```typescript
if (lcda_room_count < MIN_ROOMS_THRESHOLD) {
  // escalate to LGA
}
```

### Level 2: LGA Merge
If LCDA has fewer than `MIN_ROOMS_THRESHOLD` (default: 3) live rooms,
merge with the LGA-level feed.

```typescript
// Merge LCDA + LGA rooms, deduplicated
const feed = [...lcda_rooms, ...lga_rooms.filter(r => !lcda_room_ids.has(r.id))];
if (feed.length < MIN_ROOMS_THRESHOLD) escalate_to_state();
```

### Level 3: State Merge
If LGA has fewer than threshold, merge with State-level feed.

### Level 4: National Merge
If State has fewer than threshold, merge with National feed.

### Level 5: Scheduled Content (final fallback)
If no live rooms exist at any level, show:
1. Scheduled rooms (events with `scheduled_at` in the next 4 hours)
2. Recent community announcements
3. "Be the first — start a room" CTA with creator quick-start

```typescript
const MIN_ROOMS_THRESHOLD = 3;  // configurable via CF environment variable

async function buildRegionalFeed(userRegionId: string): Promise<FeedContent> {
  const levels = buildRegionHierarchy(userRegionId);
  // ['NG-LA-IKJ-OJD', 'NG-LA-IKJ', 'NG-LA', 'NG']

  for (const regionId of levels) {
    const rooms = await getLiveRoomsForRegion(regionId);
    if (rooms.length >= MIN_ROOMS_THRESHOLD) {
      return { rooms, source: regionId, merged: regionId !== userRegionId };
    }
  }

  // All levels empty — return scheduled + announcements
  return {
    rooms: await getScheduledRooms(24),
    announcements: await getRecentAnnouncements(userRegionId),
    source: 'national',
    isEmpty: true
  };
}
```

---

## Community Card Specification

Community cards appear in horizontal scroll strips and vertical feed lists.

### Regional Community Card
```
┌─────────────────────────────────────────┐
│ [Avatar]  Lagos State                   │
│           Regional · 2.4M members       │
│           ● 12 live rooms right now     │
└─────────────────────────────────────────┘
```

### Interest Community Card
```
┌─────────────────────────────────────────┐
│ [Avatar]  Afrobeats                     │
│           Music · 180K members          │
│           ● 7 live rooms · 3 following  │
└─────────────────────────────────────────┘
```

### Creator Community Card
```
┌─────────────────────────────────────────┐
│ [Avatar]  DJ Neptune · Verified ✓       │
│           DJ Community · 92K fans       │
│           ○ Next room: Saturday 10pm    │
└─────────────────────────────────────────┘
```

---

## API Endpoints

### GET /api/communities/nearby
Returns nearby communities based on region detection from CF headers.

```
Query params:
  region_id   optional — override detection
  limit       optional — default 20
  include_live optional — include live room count

Response:
  { communities: Community[], detected_region: string, merge_level: string }
```

### GET /api/communities/trending
Returns trending communities at the specified scope level.

```
Query params:
  scope       required — 'lcda' | 'lga' | 'state' | 'national'
  region_id   optional — filter by region
  limit       optional — default 10
```

### GET /api/communities/:id/rooms
Returns live rooms inside a specific community.

```
Query params:
  category    optional
  limit       optional — default 20
  include_scheduled optional
```

### GET /api/discovery/feed
Returns the full personalized discovery feed for the authenticated user.

```
Response:
  {
    nearby:    { communities: Community[], region_label: string },
    live:      { rooms: Room[], merge_level: string },
    interests: { communities: Community[] },
    friends:   { communities: Community[] },
    trending:  { communities: Community[], scope: string }
  }
```

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
