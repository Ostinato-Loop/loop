# Loop V2 Readiness — Phase 5: Strategic Architecture
**Ecosystem:** RALD / LILCKY STUDIO LIMITED  
**Repo:** Ostinato-Loop/loop  
**Audit Date:** 2026-06-06  
**Auditor:** CTO Office  

---

## Executive Summary

Loop V2 is a strategic re-architecture from a **Rooms-first** product to a **Communities-first** product. Rooms become ephemeral live events that happen *inside* communities. Communities are the durable social identity users subscribe to, moderate, and grow. This document defines the V2 architecture, the migration path from V1, the data model, and the feature roadmap aligned with this direction.

**This is the canonical strategic document for all V2 engineering decisions.**

---

## 1. Why Communities, Not Rooms

### V1 Problem

In V1, a Room is the top-level entity. When a room ends, the relationship between participants is lost. There is no persistent identity for a group of people with shared interests. Users have no reason to return to the app when they are not actively in a live audio session. The product has no retention mechanic.

### V2 Solution

A **Community** is the persistent social container:
- Users **join** communities (not rooms)
- Rooms are **events** that happen within a community
- Communities have **timelines** (posts, announcements, recordings)
- Communities have **members**, **roles**, and **governance**
- A user's identity in the ecosystem is shaped by which communities they belong to and lead

### Analogy

| V1 | V2 |
|---|---|
| Rooms are the product | Communities are the product |
| Join a room → listen → leave → forget | Join a community → listen live → read posts → return |
| No persistent social graph | Community membership is the social graph |
| Hosts are ephemeral | Community owners are ecosystem citizens |

---

## 2. Community Types

| Type | Description | Privacy | Audio | Posts | Members |
|---|---|---|---|---|---|
| **Public** | Open to all, discoverable | Public | ✅ | ✅ | Unlimited |
| **Private** | Invite or request to join | Private | ✅ | ✅ | Configurable cap |
| **Verified** | Credentialed creators/orgs (blue check) | Public | ✅ | ✅ | Unlimited |
| **Geographic** | Location-scoped (city, neighbourhood) | Public | ✅ | ✅ | Unlimited |
| **Interest** | Topic-tagged, algorithmically surfaced | Public | ✅ | ✅ | Unlimited |

All community types support:
- Live audio rooms (scheduled and spontaneous)
- Scheduled events with RSVP
- Announcements (owner/moderator only)
- Member directory
- Moderation tooling (kick, ban, mute, report)

---

## 3. V2 Data Model

### 3.1 Core Entities

```
Community
├── id (uuid)
├── name (text)
├── slug (text, unique)
├── description (text)
├── type (public | private | verified | geographic | interest)
├── avatar_url (text)
├── cover_url (text)
├── owner_id (uuid → profiles.id)
├── member_count (int, materialized)
├── is_live (bool, derived from active rooms)
├── location (point, nullable — for geographic communities)
├── interest_tags (text[], nullable)
├── created_at (timestamptz)

CommunityMember
├── community_id (uuid → communities.id)
├── user_id (uuid → profiles.id)
├── role (owner | moderator | member | banned)
├── joined_at (timestamptz)
└── PRIMARY KEY (community_id, user_id)

Room  ← now belongs to a community
├── id (uuid)
├── community_id (uuid → communities.id)  ← NEW
├── title (text)
├── topic (text)
├── status (scheduled | live | ended)
├── scheduled_at (timestamptz, nullable)
├── started_at (timestamptz, nullable)
├── ended_at (timestamptz, nullable)
├── host_id (uuid → profiles.id)
├── participant_count (int, materialized)
└── audio_vendor_session_id (text, nullable)

RoomParticipant
├── room_id (uuid → rooms.id)
├── user_id (uuid → profiles.id)
├── role (host | co-host | speaker | listener)
├── joined_at (timestamptz)
└── PRIMARY KEY (room_id, user_id)

Post  ← community timeline
├── id (uuid)
├── community_id (uuid → communities.id)
├── author_id (uuid → profiles.id)
├── type (text | announcement | room_recording)
├── content (text)
├── media_url (text, nullable)
├── created_at (timestamptz)

Event  ← scheduled room wrapper
├── id (uuid)
├── community_id (uuid → communities.id)
├── room_id (uuid → rooms.id, nullable — set when room goes live)
├── title (text)
├── description (text)
├── scheduled_at (timestamptz)
├── host_id (uuid → profiles.id)
└── rsvp_count (int, materialized)
```

### 3.2 Schema Migration Strategy

Migration from V1 to V2 schema:

1. **Add `communities` table** (non-destructive)
2. **Add `community_members` table** (non-destructive)
3. **Add `community_id` to `rooms`** as nullable FK initially
4. Create a **"General" community** as the default community for all existing rooms
5. Backfill `rooms.community_id` = General community id for all existing rows
6. Make `rooms.community_id` NOT NULL
7. Add `posts` and `events` tables
8. Update RLS policies for all new tables

All migrations run via `supabase db push` with a rollback script for each step.

---

## 4. V2 API Contract

New endpoints required (add to OpenAPI spec before implementation):

```yaml
# Communities
GET    /communities                    # Browse/search communities
GET    /communities/:id                # Community detail
POST   /communities                    # Create community
PATCH  /communities/:id                # Update community (owner/mod only)
DELETE /communities/:id                # Delete community (owner only)

# Community membership
GET    /communities/:id/members        # Member list
POST   /communities/:id/join           # Join community
DELETE /communities/:id/leave          # Leave community
PATCH  /communities/:id/members/:uid   # Update member role (mod only)
DELETE /communities/:id/members/:uid   # Remove member / ban (mod only)

# Community rooms (rooms scoped to a community)
GET    /communities/:id/rooms          # Active and scheduled rooms in community
POST   /communities/:id/rooms          # Create room in community

# Community posts
GET    /communities/:id/posts          # Timeline posts
POST   /communities/:id/posts          # Create post (member only)
DELETE /communities/:id/posts/:pid     # Delete post (author or mod)

# Community events
GET    /communities/:id/events         # Upcoming events
POST   /communities/:id/events         # Create event (mod/owner only)
POST   /communities/:id/events/:eid/rsvp  # RSVP to event
```

---

## 5. V2 Navigation Architecture

V2 replaces the current 5-tab nav (Feed, Discover, Create, Messages, Me) with a Communities-first information architecture:

```
Bottom Nav:
├── 🏠 Home         — My communities feed (live + recent posts)
├── 🔍 Discover     — Browse/search communities
├── ➕ Create        — Create community or room within a community
├── 💬 Messages     — DMs (in-app, not external redirect)
└── 👤 Me           — Profile, my communities, settings

Community Detail Screen:
├── Header          — Cover, avatar, name, member count, Live badge
├── Tabs:
│   ├── Live        — Active room (if live) or "No live session"
│   ├── Schedule    — Upcoming events + RSVP
│   ├── Posts       — Community timeline
│   └── Members     — Member directory
└── Join/Leave CTA
```

---

## 6. V2 Audio Architecture

Audio must be designed for V2 from day one. The audio vendor integration must support:

| Requirement | Rationale |
|---|---|
| SFU (Selective Forwarding Unit) architecture | Scales to 500+ listeners without N² mesh |
| Host token + listener token model | Server issues role-specific tokens — host publishes, listeners subscribe |
| Dynamic role promotion | Listener can be promoted to speaker without reconnecting |
| Room lifecycle hooks | `onRoomStart`, `onParticipantJoin`, `onRoomEnd` — needed for DB sync |
| Recording (optional) | Community wants archived sessions in their timeline |
| No video required for V1 | Audio-only for launch; architecture must not preclude video later |

**Vendor decision gate:** Audio vendor must be selected and documented in this file before any P0-001 sprint begins.

**Selected vendor:** `[ PENDING — CTO to fill in ]`  
**Rationale:** `[ PENDING ]`  
**Token issuance endpoint:** `[ PENDING — add to OpenAPI spec ]`

---

## 7. V2 Moderation Model

Communities have a governance hierarchy:

```
Ecosystem Level:    RALD Trust & Safety team
    ↓
Community Level:    Owner > Moderator > Member > Banned
    ↓
Room Level:         Host > Co-Host > Speaker > Listener
```

**Moderation actions by role:**

| Action | Owner | Moderator | Host (in room) |
|---|---|---|---|
| Remove member from community | ✅ | ✅ | — |
| Ban member from community | ✅ | ✅ | — |
| Delete post | ✅ | ✅ | — |
| Promote member to moderator | ✅ | — | — |
| Kick participant from room | ✅ | ✅ | ✅ |
| Mute participant | ✅ | ✅ | ✅ |
| End room | ✅ | ✅ | ✅ |
| Promote listener to speaker | — | — | ✅ |

All moderation actions are logged to an audit table with `actor_id`, `target_id`, `action`, `reason`, `created_at`.

---

## 8. V2 Rollout Plan

### Phase A — Fix V1 (Current sprint)
Resolve all P0 launch blockers. Ship a functional V1 product. Do not introduce V2 schema or navigation yet.

### Phase B — V2 Foundation (Sprint +1)
1. Add `communities` table and API
2. Migrate all existing rooms to a default "General" community
3. Add Community Detail screen (read-only)
4. Update Feed to show community-scoped rooms

### Phase C — V2 Full (Sprint +2 to +3)
1. Full communities navigation (Home, Discover, Create, Messages, Me)
2. Community posts and timeline
3. Scheduled events with RSVP
4. Moderation tooling
5. Verified community tier

### Phase D — Audio V2 (Parallel to Phase B/C)
1. Audio vendor integrated (prerequisite: P0-001 resolved in Phase A)
2. Role-based token issuance (host vs listener)
3. Dynamic speaker promotion
4. Room recording → Post pipeline

---

## 9. What Does Not Change in V2

- Auth mechanism (OTP + JWT — improved, not replaced)
- Cloudflare Worker as the API edge layer
- Supabase as the primary database
- React + Vite as the frontend framework
- Core brand and design system (`rald-design-system`)
- TypeScript everywhere

---

## 10. V2 Success Criteria

| Metric | Target at Open Beta |
|---|---|
| Communities created | > 50 organic communities |
| Members per community (avg) | > 20 |
| Live sessions per community per week | > 2 |
| D7 retention | > 30% |
| Audio drop rate | < 5% |
| Crash-free sessions | > 99% |

---

*End of Phase 5 — V2 Readiness*  
*This document is the source of truth for all V2 architectural decisions. Update it as decisions are made.*
