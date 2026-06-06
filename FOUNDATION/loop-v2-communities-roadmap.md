# Loop V2 Communities — Implementation Roadmap
**Phase 5: Communities-First Refactor Plan**
**Date:** 2026-06-06
**Authority:** CTO Office
**Mandate:** Plan only. Do not implement until Phase 1–4 of governance are complete.

---

## Prerequisites Before Any V2 Work Begins

Per governance policy, V2 cannot start until:
- [ ] CI Governance implemented (branch protection, deploy gating, lint, tests)
- [ ] All 7 P0 launch blockers resolved (see `AUDIT/loop-launch-blockers.md`)
- [ ] Audio vendor selected and documented
- [ ] V1 deployed and stable at internal alpha

**This document is a plan. Not a sprint. V2 work starts after the above checklist is complete.**

---

## V2 Mission Statement

> A Community is the durable social container. A Room is a live event that happens inside a Community. A User's identity in Loop is shaped by which Communities they belong to and lead.

Every design decision in V2 flows from this statement.

---

## Migration Strategy

### Guiding Principle: Non-Destructive Migration

V1 data is never deleted. V1 users are never disrupted. V2 is added alongside V1 until V2 is stable, then V1 is deprecated gracefully.

### Step-by-Step Migration Plan

**Step M-1: Add `communities` table (non-destructive)**
```sql
CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('public','private','verified','geographic','interest')),
  avatar_url TEXT,
  cover_url TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id),
  member_count INT NOT NULL DEFAULT 0,
  is_live BOOLEAN NOT NULL DEFAULT false,
  location POINT,
  interest_tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public communities are visible to all" ON communities
  FOR SELECT USING (type != 'private' OR EXISTS (
    SELECT 1 FROM community_members WHERE community_id = id AND user_id = auth.uid()
  ));
CREATE POLICY "owner can update community" ON communities
  FOR UPDATE USING (owner_id = auth.uid());
```

**Step M-2: Add `community_members` table (non-destructive)**
```sql
CREATE TABLE community_members (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','moderator','member','banned')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
```

**Step M-3: Add `community_id` to `rooms` as nullable (non-destructive)**
```sql
ALTER TABLE rooms ADD COLUMN community_id UUID REFERENCES communities(id);
```

**Step M-4: Create default "General" community**
```sql
INSERT INTO communities (name, slug, description, type, owner_id)
VALUES ('General', 'general', 'The default community for all Loop rooms', 'public',
  (SELECT id FROM profiles WHERE is_admin = true LIMIT 1));
```

**Step M-5: Backfill all existing rooms to "General" community**
```sql
UPDATE rooms SET community_id = (SELECT id FROM communities WHERE slug = 'general')
WHERE community_id IS NULL;
```

**Step M-6: Make `community_id` NOT NULL (after backfill verified)**
```sql
ALTER TABLE rooms ALTER COLUMN community_id SET NOT NULL;
```

**Step M-7: Add `posts` and `events` tables**
```sql
CREATE TABLE community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('text','announcement','room_recording')),
  content TEXT NOT NULL,
  media_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE community_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  host_id UUID NOT NULL REFERENCES profiles(id),
  rsvp_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Step M-8: Update RLS on all new tables**
(Each table gets appropriate RLS policies before any frontend access)

**Rollback plan:** Each step is reversible. Steps M-1 through M-3 can be undone with `DROP TABLE`/`ALTER TABLE DROP COLUMN`. Steps M-4/M-5 are data operations with a transaction log. Step M-6 requires reverting to nullable before dropping data.

---

## Rollout Strategy

### Phase A — V1 Stability (Current — must complete first)
- Fix all 7 P0 blockers
- Deploy functional V1 to internal alpha (50 users)
- Validate audio vendor works end-to-end
- Collect user feedback

### Phase B — Database Foundation (Sprint 1 of V2)
- Run migrations M-1 through M-7
- Add community API endpoints to Worker (GET/POST /communities, /communities/:id)
- No frontend changes yet — API-first
- Internal testing of community CRUD

### Phase C — Read-Only Community UI (Sprint 2 of V2)
- Community detail screen (read-only: name, members, active rooms)
- Feed shows community context for each room ("room in Lagos Music Scene")
- Discover shows community cards alongside room cards
- Join/leave community (no content creation yet)

### Phase D — Community Activity (Sprint 3–4 of V2)
- Community timeline / posts
- Scheduled events with RSVP
- Community notifications ("Lagos Music Scene is going live")
- Member directory

### Phase E — Full Communities Navigation (Sprint 5 of V2)
- New Home tab: "My Communities" feed replaces generic feed
- Create flow: create community OR create room within community
- Community moderation tools (moderator dashboard, kick/ban)
- Verified community tier (application process)

### Phase F — Audio V2 (Parallel to Phases C–E)
- Audio vendor integration (prerequisite: selected in V1)
- Host token vs listener token model
- Dynamic speaker promotion via live role update
- Room recording → Post pipeline (audio clip appears in community timeline)

---

## Backwards Compatibility

### V1 API endpoints remain unchanged
All existing routes (`GET /rooms`, `POST /rooms`, `POST /rooms/:id/join`, etc.) continue to work during the transition. Community ID is added as an optional parameter in Phase B and becomes required in Phase E.

### V1 room experience remains accessible
The room screen (`room.tsx`) is not replaced — it is extended. Community context is added to the room header. No existing room flow breaks.

### V1 user data is preserved
No user data is deleted. No user is forced to adopt communities. Users who joined in V1 are automatically members of the "General" community and can discover private communities from there.

### JWT claims are backwards compatible
Community membership is not added to JWT claims — it is fetched from Supabase on demand. JWT tokens issued in V1 remain valid in V2.

---

## Breaking Changes (identified in advance)

| Change | When | Impact | Mitigation |
|---|---|---|---|
| `community_id` becomes NOT NULL on `rooms` | Phase B Step M-6 | Room creation without community fails | New room creation always sets community_id; only after backfill is verified |
| Feed endpoint returns community context | Phase C | Clients rendering room cards need to handle new fields | Fields are additive — existing clients ignore unknown fields |
| Navigation changes (Phase E) | Phase E | Bottom nav changes from 5 to 5 new tabs | Feature flag: roll out to % of users first |

---

## Success Criteria for V2 Launch

| Metric | Target |
|---|---|
| Communities created (organic) | > 50 |
| Members per community (avg) | > 15 |
| Live sessions per community per week | > 2 |
| D7 retention | > 30% |
| Users joining via community invite | > 40% of new signups |

---

*This is a plan document. Implementation begins only after V1 governance is complete.*
