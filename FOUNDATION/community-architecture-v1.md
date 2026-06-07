# FOUNDATION/community-architecture-v1.md
**Version:** 1.0 — V2 Community Architecture Specification
**Date:** 2026-06-07
**Status:** APPROVED — Engineering Reference
**Authority:** CTO Office — LILCKY STUDIO LIMITED
**Prerequisites:** production score ≥ 90 ✅ (91/100 certified 2026-06-07)

---

## Mandate

> Communities are the primary entity. Rooms are events inside communities.

Every architectural decision in V2 flows from this statement. This document is the
engineering-grade specification for the community data layer. It defines schemas,
migrations, indexes, RLS policies, and the scalability plan for the community system.

**Companion docs:**
- `FOUNDATION/loop-v2-regional-network.md` — regional hierarchy strategy
- `FOUNDATION/loop-v2-communities-roadmap.md` — migration approach
- `FOUNDATION/community-discovery-v1.md` — discovery engine spec
- `FOUNDATION/community-promotion-system.md` — promotion algorithm spec

---

## Architecture Overview

### V1 Architecture (room-first)
```
User → Room (standalone entity, no container)
```

### V2 Architecture (community-first)
```
Country
└── State
    └── LGA
        └── LCDA
            └── Community (primary social container)
                └── Room (event inside community)
```

A Room without a Community does not exist in V2. Every room is anchored to a Community.
Every Community is anchored to a region (minimum: State) or to a topic (Interest/Creator type).

---

## Community Types

### 1. Regional Communities

Automatically created for every geographic unit in the Nigerian registry.

| Scope Level | Example | Auto-created | Editable |
|-------------|---------|-------------|---------|
| State | Lagos State | ✅ System | Owner: Loop Admin |
| LGA | Ikeja LGA | ✅ System | Owner: Loop Admin |
| LCDA | Ojodu LCDA | ✅ System | Owner: Loop Admin |
| City | Lekki City | ✅ System | Owner: Loop Admin |

Regional communities are owned by Loop Admin at launch. State-level communities
may be transferred to verified government authorities in Phase 2.

**Nigeria — Phase 1 Launch Regions (auto-seeded):**

Lagos State:
- Ikeja, Surulere, Yaba, Eti-Osa, Lekki, Alimosho, Mushin, Kosofe,
  Somolu, Agege, Ifako-Ijaiye, Shomolu, Lagos Island, Lagos Mainland,
  Ojo, Ajeromi-Ifelodun, Apapa, Amuwo-Odofin, Badagry, Ibeju-Lekki,
  Epe (20 LGAs + 37 LCDAs)

Abuja FCT:
- Gwagwalada, Maitama, Wuse, Kubwa, Garki, Asokoro, Gwarinpa,
  Kuje, Abaji, Kwali, Bwari (6 Area Councils + major districts)

Kano State:
- Municipal, Fagge, Tarauni, Nasarawa, Dala, Gwale, Kumbotso,
  Ungogo, Kano Municipal, Bagwai, Gwarzo (44 LGAs)

Rivers State:
- Port Harcourt, Obio-Akpor, Okrika, Bonny, Degema, Asari-Toru,
  Eleme, Etche, Omuma, Tai (23 LGAs)

Oyo State:
- Ibadan North, Ibadan South, Oluyole, Egbeda, Ona-Ara, Oyo,
  Ogbomosho North, Ogbomosho South (33 LGAs)

### 2. Interest Communities

User-created or system-seeded around topic affinities.

| Category | Communities |
|----------|-------------|
| Music | Hip Hop, Amapiano, Afrobeats, Gospel, Highlife, Juju, Fuji |
| Entertainment | Comedy, Movies, Fashion, Lifestyle |
| Gaming | Football, Basketball, eSports |
| Knowledge | Politics, Business, Technology, Education, Religion |
| Culture | Nollywood, Stand-up, Literature |

### 3. Creator Communities

Platform-endorsed communities for verified creators.

| Type | Purpose |
|------|---------|
| Artist Community | Music artists and their fan base |
| DJ Community | DJs, sets, and music discovery |
| Radio Community | Licensed radio stations, programmes |
| Podcaster Community | Podcast shows and episodes |
| Sports Community | Sports journalists, analysts, fans |

---

## Data Schema

### Table 1: communities

```sql
CREATE TABLE communities (
  -- Identity
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  slug            TEXT        UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  description     TEXT        CHECK (length(description) <= 1000),

  -- Classification
  type            TEXT        NOT NULL CHECK (type IN (
                                'regional_state',
                                'regional_lga',
                                'regional_lcda',
                                'regional_city',
                                'interest',
                                'creator_artist',
                                'creator_dj',
                                'creator_radio',
                                'creator_podcaster',
                                'creator_sports'
                              )),

  -- Regional anchor (NULL for interest/creator communities)
  region_id       TEXT,       -- e.g. 'NG-LA', 'NG-LA-IKJ', 'NG-LA-IKJ-OJD'
  region_scope    TEXT        CHECK (region_scope IN ('country','state','lga','lcda','city')),
  country_code    TEXT        NOT NULL DEFAULT 'NG',

  -- Civic flag — separates civic from entertainment at the data layer
  is_civic        BOOLEAN     NOT NULL DEFAULT false,

  -- Media
  avatar_url      TEXT,
  cover_url       TEXT,

  -- Ownership
  owner_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,

  -- Counters (maintained by triggers, not application code)
  member_count    INTEGER     NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  room_count      INTEGER     NOT NULL DEFAULT 0 CHECK (room_count >= 0),
  active_room_count INTEGER   NOT NULL DEFAULT 0 CHECK (active_room_count >= 0),

  -- Status
  is_verified     BOOLEAN     NOT NULL DEFAULT false,
  is_system       BOOLEAN     NOT NULL DEFAULT false,  -- auto-created regional community
  is_suspended    BOOLEAN     NOT NULL DEFAULT false,
  is_deleted      BOOLEAN     NOT NULL DEFAULT false,

  -- Analytics
  health_score    SMALLINT    NOT NULL DEFAULT 50 CHECK (health_score BETWEEN 0 AND 100),

  -- Topics (for interest communities)
  interest_tags   TEXT[]      DEFAULT '{}',

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT regional_must_have_region_id
    CHECK (NOT (type LIKE 'regional%') OR region_id IS NOT NULL),
  CONSTRAINT civic_must_be_regional
    CHECK (NOT is_civic OR type LIKE 'regional%')
);
```

### Table 2: community_members

```sql
CREATE TABLE community_members (
  community_id    UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL DEFAULT 'member'
                              CHECK (role IN ('owner','moderator','member','banned')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  invite_source   TEXT,       -- 'regional_auto' | 'invite' | 'discovery' | 'interest_match'

  PRIMARY KEY (community_id, user_id)
);
```

### Table 3: community_moderators

```sql
CREATE TABLE community_moderators (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  promoted_by     UUID        NOT NULL REFERENCES profiles(id),
  permissions     JSONB       NOT NULL DEFAULT '{
                                "can_remove_members": false,
                                "can_mute_members": false,
                                "can_pin_announcements": false,
                                "can_approve_rooms": false,
                                "can_remove_rooms": false,
                                "can_ban_members": false,
                                "can_edit_rules": false,
                                "can_manage_events": false
                              }',
  promoted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT true,

  UNIQUE (community_id, user_id)
);
```

### Table 4: community_rules

```sql
CREATE TABLE community_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  rule_number     SMALLINT    NOT NULL CHECK (rule_number BETWEEN 1 AND 20),
  title           TEXT        NOT NULL CHECK (length(title) BETWEEN 5 AND 80),
  body            TEXT        NOT NULL CHECK (length(body) BETWEEN 10 AND 500),
  created_by      UUID        NOT NULL REFERENCES profiles(id),
  updated_by      UUID        REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (community_id, rule_number)
);
```

### Table 5: community_events

```sql
CREATE TABLE community_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  room_id         UUID        REFERENCES rooms(id) ON DELETE SET NULL,
  title           TEXT        NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  description     TEXT        CHECK (length(description) <= 2000),
  type            TEXT        NOT NULL CHECK (type IN (
                                'audio_room','discussion','ama','debate',
                                'civic_meeting','news_briefing','community_notice'
                              )),
  scheduled_at    TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ,
  created_by      UUID        NOT NULL REFERENCES profiles(id),
  rsvp_count      INTEGER     NOT NULL DEFAULT 0,
  is_cancelled    BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ends_after_start CHECK (ends_at IS NULL OR ends_at > scheduled_at)
);
```

### Table 6: community_announcements

```sql
CREATE TABLE community_announcements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id       UUID        NOT NULL REFERENCES profiles(id),
  body            TEXT        NOT NULL CHECK (length(body) BETWEEN 1 AND 3000),
  media_url       TEXT,
  is_pinned       BOOLEAN     NOT NULL DEFAULT false,
  pin_expires_at  TIMESTAMPTZ,
  reaction_counts JSONB       NOT NULL DEFAULT '{"like":0,"heart":0,"fire":0}',
  is_removed      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Table 7: community_trending

```sql
CREATE TABLE community_trending (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  scope           TEXT        NOT NULL CHECK (scope IN ('lcda','lga','state','national')),
  rank            SMALLINT    NOT NULL CHECK (rank BETWEEN 1 AND 100),
  score           NUMERIC(12,4) NOT NULL,
  signal_breakdown JSONB      NOT NULL DEFAULT '{}',  -- for audit transparency
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,

  -- Only one entry per community per scope (upserted on compute)
  UNIQUE (community_id, scope)
);
```

### rooms table: add community_id column

```sql
-- Non-destructive: nullable first, then backfill, then constrain
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE RESTRICT;
```

---

## Migration Plan

All migrations are non-destructive and reversible. V1 data is never deleted.

```sql
-- Migration: 20260607000001_create_communities.sql
-- Creates the 7 community tables. All additions; nothing dropped.

-- 1. communities
-- (full CREATE TABLE as above)

-- 2. community_members
-- (full CREATE TABLE as above)

-- 3. community_moderators
-- (full CREATE TABLE as above)

-- 4. community_rules
-- (full CREATE TABLE as above)

-- 5. community_events
-- (full CREATE TABLE as above)

-- 6. community_announcements
-- (full CREATE TABLE as above)

-- 7. community_trending
-- (full CREATE TABLE as above)

-- 8. add community_id to rooms
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id);
```

```sql
-- Migration: 20260607000002_seed_regional_communities.sql
-- Seeds the Phase 1 regional communities. Idempotent (ON CONFLICT DO NOTHING).

INSERT INTO communities (name, slug, type, region_id, region_scope, country_code, is_system, owner_id)
SELECT name, slug, type, region_id, 'state', 'NG', true,
       (SELECT id FROM profiles WHERE is_admin = true ORDER BY created_at LIMIT 1) as owner_id
FROM (VALUES
  ('Lagos State',   'lagos-state',   'regional_state', 'NG-LA'),
  ('Kano State',    'kano-state',    'regional_state', 'NG-KN'),
  ('Abuja FCT',     'abuja-fct',     'regional_state', 'NG-AB'),
  ('Rivers State',  'rivers-state',  'regional_state', 'NG-RS'),
  ('Oyo State',     'oyo-state',     'regional_state', 'NG-OY')
) AS t(name, slug, type, region_id)
ON CONFLICT (slug) DO NOTHING;
```

```sql
-- Migration: 20260607000003_rooms_community_backfill.sql
-- Backfill all existing rooms to the General community.
-- Run after seed migration, verify, then set NOT NULL.

UPDATE rooms
SET community_id = (SELECT id FROM communities WHERE slug = 'general' LIMIT 1)
WHERE community_id IS NULL;

-- Run this only after verifying zero NULLs:
-- ALTER TABLE rooms ALTER COLUMN community_id SET NOT NULL;
```

---

## Performance Indexes

```sql
-- communities: primary lookup patterns
CREATE INDEX idx_communities_type        ON communities(type) WHERE NOT is_deleted;
CREATE INDEX idx_communities_region_id   ON communities(region_id) WHERE region_id IS NOT NULL AND NOT is_deleted;
CREATE INDEX idx_communities_country     ON communities(country_code) WHERE NOT is_deleted;
CREATE INDEX idx_communities_owner       ON communities(owner_id);
CREATE INDEX idx_communities_health      ON communities(health_score DESC) WHERE NOT is_deleted AND NOT is_suspended;
CREATE INDEX idx_communities_civic       ON communities(is_civic) WHERE is_civic = true;
CREATE INDEX idx_communities_interest_tags ON communities USING gin(interest_tags);

-- community_members: join queries
CREATE INDEX idx_cm_user_id             ON community_members(user_id);
CREATE INDEX idx_cm_community_role      ON community_members(community_id, role);
CREATE INDEX idx_cm_last_active         ON community_members(community_id, last_active_at DESC);

-- community_moderators: permission checks
CREATE INDEX idx_cmods_community        ON community_moderators(community_id) WHERE is_active;
CREATE INDEX idx_cmods_user             ON community_moderators(user_id) WHERE is_active;

-- community_events: scheduled events discovery
CREATE INDEX idx_cevents_community_time ON community_events(community_id, scheduled_at)
  WHERE NOT is_cancelled;
CREATE INDEX idx_cevents_upcoming       ON community_events(scheduled_at)
  WHERE scheduled_at > now() AND NOT is_cancelled;

-- community_announcements: feed queries
CREATE INDEX idx_cannouncements_feed    ON community_announcements(community_id, created_at DESC)
  WHERE NOT is_removed;
CREATE INDEX idx_cannouncements_pinned  ON community_announcements(community_id, pin_expires_at)
  WHERE is_pinned AND NOT is_removed;

-- community_trending: discovery queries
CREATE INDEX idx_trending_scope_rank    ON community_trending(scope, rank) WHERE expires_at > now();
CREATE INDEX idx_trending_community     ON community_trending(community_id);

-- rooms: community-scoped room queries
CREATE INDEX idx_rooms_community        ON rooms(community_id) WHERE is_live;
CREATE INDEX idx_rooms_community_cat    ON rooms(community_id, category) WHERE is_live;
```

---

## Row Level Security

```sql
ALTER TABLE communities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_trending  ENABLE ROW LEVEL SECURITY;

-- communities: public for non-deleted, non-suspended communities
CREATE POLICY "communities_read_public" ON communities
  FOR SELECT USING (NOT is_deleted AND NOT is_suspended);

CREATE POLICY "communities_update_owner" ON communities
  FOR UPDATE USING (owner_id = auth.uid());

-- community_members: users can read their own memberships + public lists
CREATE POLICY "cm_read_own" ON community_members
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM communities WHERE id = community_id AND NOT is_deleted
  ));

CREATE POLICY "cm_insert_self" ON community_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "cm_delete_self" ON community_members
  FOR DELETE USING (user_id = auth.uid());

-- community_announcements: all members can read, owners/mods can write
CREATE POLICY "cannouncements_read" ON community_announcements
  FOR SELECT USING (NOT is_removed);

CREATE POLICY "cannouncements_insert" ON community_announcements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_members
      WHERE community_id = community_announcements.community_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'moderator')
    )
  );

-- community_trending: world-readable
CREATE POLICY "trending_read_all" ON community_trending FOR SELECT USING (true);

-- community_events: world-readable
CREATE POLICY "cevents_read" ON community_events
  FOR SELECT USING (NOT is_cancelled);
```

---

## Member Count Triggers

Member counts on the `communities` table are maintained by Postgres triggers,
not application code. This prevents count drift from concurrent inserts/deletes.

```sql
CREATE OR REPLACE FUNCTION update_community_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities SET member_count = member_count + 1, updated_at = now()
    WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE communities SET member_count = GREATEST(0, member_count - 1), updated_at = now()
    WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_community_member_count
  AFTER INSERT OR DELETE ON community_members
  FOR EACH ROW EXECUTE FUNCTION update_community_member_count();
```

---

## Community ID System

Every regional community has a deterministic slug derived from its region code.

```
Format:  <country>-<state>[-<lga>[-<lcda>]]
Examples:
  ng-la              → Lagos State Community
  ng-la-ikj          → Ikeja LGA Community
  ng-la-ikj-ojd      → Ojodu LCDA Community
  ng-kn              → Kano State Community
  ng-ab              → Abuja FCT Community
```

This enables deterministic community lookup without a database query for regional contexts:
```typescript
const regionSlug = buildRegionSlug(countryCode, stateCode, lgaCode, lcdaCode);
// → "ng-la-ikj-ojd"
const community = await getCommunityBySlug(regionSlug);
```

---

## Scalability Plan

### Phase 1: Beta (0–10K members per community)
- Single Supabase Postgres instance (current)
- All writes go through Supabase REST
- Member counts via triggers ✅
- Trending computed on demand (scheduled CF Cron Trigger every 5 minutes)
- **No changes to current infrastructure required**

### Phase 2: Growth (10K–100K members per community)
- Cache community metadata in CF KV (TTL: 60s)
- Cache trending lists in CF KV (TTL: 5m)
- Separate read endpoint for trending (returns cached list, avoids DB hit)
- Add CF D1 as hot cache for community slugs → UUIDs lookup
- Connection pooler: use Supabase pooler URL (PgBouncer, transaction mode)

### Phase 3: Scale (100K–1M+ members)
- Shard member tables by community_id range
- Move trending computation to dedicated CF Worker (not inline with API)
- Read replicas for community discovery queries
- Archive inactive communities (no activity in 90 days) to S3-compatible store

### Trending Score Computation
Computed by a scheduled CF Cron Trigger (every 5 minutes):
```
SELECT c.id, c.region_id,
  SUM(
    (r.audience_count * 1.0)
    + (r.retention_score * 1.5)
    + (r.raise_hand_count * 2.0)
    + (r.share_count * 3.0)
    + (EXTRACT(EPOCH FROM (now() - r.created_at)) / -3600.0 * 0.5)  -- recency decay
  ) as score
FROM communities c
JOIN rooms r ON r.community_id = c.id AND r.is_live = true
GROUP BY c.id, c.region_id
ORDER BY score DESC;
```
Results upserted into community_trending for each scope level.

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
