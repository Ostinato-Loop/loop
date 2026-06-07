# FOUNDATION/community-room-relationship.md
**Sprint:** V2 Community Infrastructure — Phase 5  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED  
**Scope:** Community-Room relationship model — ownership, cardinality, API contracts

---

## Principle

> In Loop V2, **rooms belong to communities**. A room without a community is a legacy standalone room. New rooms created by members are always community-scoped.

---

## Data Model

### FK Relationship

```
communities.id ──── rooms.community_id (nullable FK, ON DELETE SET NULL)
```

- `rooms.community_id` is nullable (added in migration 005)
- NULL = standalone room (legacy V1 behaviour — backwards compatible)
- NOT NULL = community-owned room

### Cardinality

```
Community 1 ──── N Rooms
```

A community can have many rooms. A room belongs to at most one community.

### Denormalized Counters

Two counters are maintained on the `communities` row to avoid expensive COUNT queries:

| Counter | Updates When |
|---------|-------------|
| `room_count` | Room created in community (+1 via RPC), room deleted (-1 via RPC) |
| `active_room_count` | Room goes live (+1), room ends (-1) — maintained by room lifecycle |

RPC functions (from migration 005):
- `increment_community_room_count(p_community_id uuid)`
- `decrement_community_room_count(p_community_id uuid)`

Both use `GREATEST(0, count - 1)` to prevent negative values.

---

## Index

```sql
CREATE INDEX IF NOT EXISTS rooms_community_id_idx
  ON public.rooms (community_id)
  WHERE community_id IS NOT NULL;
```

Partial index — only indexes non-NULL community_id values (legacy standalone rooms not indexed).

---

## API Contracts

### GET /api/communities/:id/rooms

Returns all public rooms belonging to a community.

```
GET /api/communities/a1b2c3d4-e5f6.../rooms
```

**Query params:**
| Param | Default | Max |
|-------|---------|-----|
| limit | 20 | 100 |
| offset | 0 | — |
| live | false | — |

**Response:**
```json
{
  "rooms": [ /* Room[] */ ],
  "count": 5,
  "offset": 0,
  "limit": 20
}
```

**Ordering:** `is_live DESC, audience_count DESC, created_at DESC`  
(Live rooms first, then by audience size, then newest)

**Auth:** Not required — public endpoint.

---

### POST /api/communities/:id/rooms

Creates a room inside the community. Caller must be a member.

```
POST /api/communities/a1b2c3d4-e5f6.../rooms
Authorization: Bearer <JWT>

{
  "title": "Friday Night Mix",
  "description": "DJ session",
  "category": "dj-session",
  "visibility": "public",
  "language": "en"
}
```

**Membership check:** User must exist in `community_members` for this community.  
**Sets:** `rooms.community_id = :id`, `rooms.host_id = user.id`  
**Fires:** `increment_community_room_count` RPC after creation.  
**Returns:** 201 with the created room object.

---

### GET /api/communities (list)

`room_count` is included in every community card:
```json
{
  "id": "...",
  "name": "Lagos Tech Hub",
  "room_count": 12,
  ...
}
```

### GET /api/communities/:slug (detail)

Also returns `active_room_count` (live rooms right now).

---

### GET /api/rooms?community_id=:id

The existing rooms listing endpoint also supports community filtering:

```
GET /api/rooms?community_id=a1b2c3d4-e5f6...&limit=20
```

This provides an alternative to `/api/communities/:id/rooms` — same data, different entry point.

---

## Room Lifecycle within a Community

```
Member creates room via POST /api/communities/:id/rooms
  → room.community_id = id
  → room.host_id = user.id  
  → increment_community_room_count fires
  
Host starts room (is_live = true)
  → active_room_count +1 (Room Durable Object or future webhook)

Host ends room (is_live = false)
  → active_room_count -1

Room deleted
  → decrement_community_room_count fires
  → rooms.community_id SET NULL on communities delete (ON DELETE SET NULL)
```

---

## Backwards Compatibility

All changes are additive:
- `community_id` is nullable → existing standalone rooms unaffected
- `visibility` column has DEFAULT 'public' → existing rooms unaffected
- `GET /api/rooms` still works without `community_id` filter
- Community cards show `room_count: 0` for communities with no rooms

---

## Rooms Visibility and Community Privacy

| Room visibility | Community visibility | Behaviour |
|----------------|---------------------|-----------|
| public | public | Discoverable via /api/rooms and /api/communities/:id/rooms |
| public | private | Discoverable via /api/communities/:id/rooms (member) |
| public | invite_only | Only visible to community members |
| private | any | Not returned in /api/rooms or community room lists |

The `visibility=eq.public` filter on `/api/communities/:id/rooms` ensures private rooms are never leaked.

---

## Sign-off

- [x] rooms.community_id FK exists (migration 005)
- [x] rooms_community_id_idx partial index exists (migration 005)
- [x] GET /api/communities/:id/rooms — public listing with ordering
- [x] POST /api/communities/:id/rooms — member-gated creation
- [x] room_count counter maintained via RPC on creation
- [x] active_room_count column added (migration 007) for live room tracking
- [x] GET /api/rooms?community_id=:id cross-compatible
- [x] Backwards compatible with pre-V2 standalone rooms (nullable community_id)

**Phase 5 — COMPLETE ✅**
