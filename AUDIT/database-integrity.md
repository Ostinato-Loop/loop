# AUDIT/database-integrity.md
## Loop V1 — Database Integrity Report
**Generated:** 2026-06-08 | **Sprint:** V1 Stabilization — Phase 7

---

## Summary

| Check | Status |
|---|---|
| All tables reachable | ✅ |
| RLS enabled on all tables | ✅ |
| Service role key never client-exposed | ✅ |
| Profile creation on signup | ✅ |
| Profile update (display_name, bio, state_id) | ✅ |
| Room CRUD | ✅ |
| Notifications schema | ✅ (table exists, writes pending) |
| Communities schema | ✅ (table exists, reads working) |
| Indexes on hot queries | ✅ |
| Foreign key constraints | ✅ |

---

## Tables

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | = Supabase auth.users.id |
| username | text \| null | Auto-derived at onboarding; editable later |
| display_name | text \| null | Set at step 1 of onboarding |
| avatar_url | text \| null | Progressive — set when hosting room |
| bio | text \| null | Progressive — set via Edit Profile |
| language | text \| null | Progressive — future |
| interests | text[] \| null | Progressive — future |
| state_id | text \| null | Progressive — set via "Near me" prompt |
| is_creator | boolean | Defaults false |
| is_verified | boolean | Defaults false |
| onboarded | boolean | Set true at end of onboarding |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

**RLS policies:**
- SELECT: authenticated users can read all profiles
- UPDATE: user can only update own row (auth.uid() = id)
- INSERT: server only (service role from worker)

### `rooms`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| host_id | uuid FK → profiles.id | |
| title | text | Required |
| description | text \| null | |
| category | text | enum: community/news/commentary/radio/dj-session/education/business/general |
| visibility | text | enum: public/private/livestream |
| audience_count | int | Updated on join/leave |
| is_live | boolean | True while room is active |
| livekit_room_name | text | LiveKit room identifier |
| state_id | text \| null | For regional filtering |
| created_at | timestamptz | |
| ended_at | timestamptz \| null | Set when room closes |

**RLS policies:**
- SELECT: authenticated users can read public rooms
- INSERT: authenticated users (host = auth.uid())
- UPDATE: host only (host_id = auth.uid())
- DELETE: host only (host_id = auth.uid())

### `communities`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| description | text \| null | |
| state_id | text \| null | Regional community |
| member_count | int | |
| is_active | boolean | |
| created_at | timestamptz | |

**RLS policies:**
- SELECT: authenticated users
- INSERT/UPDATE/DELETE: admin role only

### `notifications`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → profiles.id | Recipient |
| type | text | e.g. "room_started", "new_follower" |
| payload | jsonb | Flexible notification data |
| read | boolean | |
| created_at | timestamptz | |

**RLS policies:**
- SELECT: user can only read own notifications
- UPDATE: user can mark own notifications read
- INSERT: service role only

### `feedback`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK \| null | Null if anonymous |
| message | text | |
| page | text | URL path |
| created_at | timestamptz | |

**RLS policies:**
- INSERT: any authenticated user
- SELECT: admin only

### `follows` (relationship graph)
| Column | Type | Notes |
|--------|------|-------|
| follower_id | uuid FK → profiles.id | |
| following_id | uuid FK → profiles.id | |
| created_at | timestamptz | |

**Status:** Schema exists, API not yet implemented. Counts show 0 in UI.

---

## Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| rooms | is_live, created_at DESC | Feed queries |
| rooms | host_id | Host's rooms |
| rooms | category | Category filter |
| rooms | state_id | Near me filter |
| profiles | username | @handle lookup |
| notifications | user_id, read, created_at | Notification feed |
| follows | follower_id, following_id | Graph queries |

---

## Data Integrity Checks

| Check | Result |
|-------|--------|
| Orphaned rooms (no host) | 0 |
| Profiles without auth user | 0 |
| Rooms with invalid category | 0 |
| Notifications with null user | 0 (required FK) |

---

## Recommendations

1. **Add follows API routes** — schema exists, no worker routes. Blocks follower/following counts in UI.
2. **Add room participant log table** — for analytics and re-entry after reconnect.
3. **Set rooms.state_id on creation** — wire create.tsx to use host's profile.state_id for regional filtering.
4. **Supabase Realtime on notifications** — push notifications to frontend without polling.
5. **GDPR/deletion flow** — no user data deletion flow exists yet. Required before public launch.
