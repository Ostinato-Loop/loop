# FOUNDATION/civic-layer-design.md
**Version:** 1.0 — Civic Layer Architecture Design
**Date:** 2026-06-07
**Status:** APPROVED — Engineering Reference
**Authority:** CTO Office — LILCKY STUDIO LIMITED
**Companion:** FOUNDATION/loop-v2-civic-network.md (civic content strategy)

---

## The Inviolable Separation Rule

> Civic content and entertainment content NEVER appear in the same ranked list.
> This is an architectural constraint, not a design preference.

This rule is enforced at every layer of the stack:

| Layer | Enforcement |
|-------|-------------|
| Database | `is_civic = true` flag on rooms; civic tables separated by naming convention |
| API | Separate route namespaces (`/api/civic/*` vs `/api/rooms/*`) |
| Ranking algorithm | Civic rooms have a separate scoring function; never enter entertainment ranking |
| Frontend | Dedicated "Civic" tab; civic content never appears in Home, Trending, or Explore tabs |
| Moderation | Separate civic moderation team; different review SLAs |
| Promotion | Civic rooms are never in the entertainment promotion ladder |

**Why:** Engagement-based ranking is destructive for civic content. A viral false emergency
generates massive engagement. A verified public safety notice from a local authority may
have low engagement. Mixing them means false information wins. The architectural separation
removes this incentive entirely.

---

## Civic Room Types

### 1. Traffic Rooms
Real-time traffic conditions, road closures, accident alerts, construction updates.

**Creation:** Any verified user within the relevant region.
**Required fields:** Route description, direction (inbound/outbound), severity (minor/moderate/severe/closed).
**Auto-expire:** 3 hours after creation (traffic conditions change rapidly).
**Example:** "Sanusi Fafunwa → Marina — Severe congestion, estimated 45min delay"

### 2. Weather Rooms
Weather alerts, flood warnings, storm tracking, extreme heat notices.

**Creation:** Automated (from NiMet data feed integration) OR verified weather reporters.
**Required fields:** Affected region(s), alert type, severity, official source link.
**Auto-expire:** Per alert duration from source, or 6 hours default.
**Example:** "Flood warning: Badagry coastal areas — NiMet advisory #2026-1204"

### 3. Emergency Rooms
Crime alerts, missing persons, disasters, public safety crises.

**Creation:** Community-verified users. Government-verified for health emergencies.
**Required fields:** Incident type, location (LCDA-level minimum), claim, evidence type.
**Moderation SLA:** Review within 60 minutes. High-severity: 30 minutes.
**Badge system:** UNVERIFIED → COMMUNITY-VERIFIED → LOOP-VERIFIED → OFFICIAL-VERIFIED

### 4. Crime Alert Rooms
Robbery, kidnapping, property crime, phone snatching alerts.

**Creation:** Any community member (low threshold — crime is time-sensitive).
**Required fields:** Crime type, location, time of incident (within last 6 hours).
**Auto-flag:** Duplicate detection — if same location + type in last 2 hours, merge.
**Warning displayed:** "Report to police at 112. Loop is not a police service."

### 5. Community Notices
LCDA or LGA official communications, community meetings, local ordinances.

**Creation:** Community-verified leaders, LGA officials, verified community associations.
**Required fields:** Notice type, originating authority, effective date.
**Example:** "Ojodu LCDA — Water supply interruption: Wednesday 8am–6pm, maintenance works"

### 6. Public Services
Government service announcements, public office hours, application deadlines.

**Creation:** Government-verified accounts only.
**Required fields:** Service name, authority, date(s), reference number if applicable.
**Example:** "Lagos LASRRA — Voter registration extended to June 30. Collect cards at all LGA offices."

### 7. Town Hall Rooms
Community town halls, elected official Q&A sessions, civic engagement events.

**Creation:** Elected officials (government-verified) OR community associations (community-verified).
**Required fields:** Hosting authority, agenda, scheduled time, expected duration.
**Moderation:** Civic team monitors in real-time during the event.
**No anonymous questions.** All participants must be logged in with verified profiles.

---

## Database Design

### Civic flag on rooms table
```sql
-- Already in communities table: is_civic BOOLEAN NOT NULL DEFAULT false
-- This flag cascades to rooms inside civic communities
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_civic BOOLEAN NOT NULL DEFAULT false;

-- Trigger: rooms in civic communities are automatically marked civic
CREATE OR REPLACE FUNCTION set_room_civic_from_community()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_civic := (SELECT is_civic FROM communities WHERE id = NEW.community_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_room_civic
  BEFORE INSERT OR UPDATE OF community_id ON rooms
  FOR EACH ROW EXECUTE FUNCTION set_room_civic_from_community();
```

### Civic verification table
```sql
CREATE TABLE civic_room_verifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  verifier_id     UUID        REFERENCES profiles(id),  -- NULL for automated
  verification_type TEXT      NOT NULL CHECK (verification_type IN (
                                'automated',      -- system check (URL resolves, etc.)
                                'community',      -- crowd-verified (5+ reports)
                                'loop_civic_team', -- Loop Civic Team manual review
                                'official'        -- verified government authority
                              )),
  verification_level SMALLINT NOT NULL CHECK (verification_level BETWEEN 0 AND 3),
  -- 0=unverified, 1=community, 2=loop-team, 3=official
  notes           TEXT,
  evidence_urls   TEXT[],
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (room_id, verification_type)
);
```

### Civic report table (crowdsourced accuracy signals)
```sql
CREATE TABLE civic_room_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  reporter_id     UUID        NOT NULL REFERENCES profiles(id),
  report_type     TEXT        NOT NULL CHECK (report_type IN (
                                'false_information',
                                'duplicate',
                                'resolved',      -- situation no longer active
                                'location_wrong',
                                'inappropriate'
                              )),
  detail          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (room_id, reporter_id)  -- one report per user per room
);
```

---

## API Separation

Civic content routes are namespaced separately from entertainment routes:

```
Entertainment routes (existing):
  GET  /api/rooms            → list live entertainment rooms
  POST /api/rooms            → create entertainment room
  GET  /api/trending         → entertainment trending

Civic routes (new):
  GET  /api/civic/rooms           → list live civic rooms
  POST /api/civic/rooms           → create civic room (requires verification tier)
  GET  /api/civic/rooms/:id       → get civic room details + verification status
  POST /api/civic/rooms/:id/verify → mark as verified (Civic Team only)
  POST /api/civic/rooms/:id/report → report civic room
  GET  /api/civic/trending         → civic trending (urgency-based, not engagement)
  GET  /api/civic/feed             → personalized civic feed for user's region
```

**Cross-contamination check:** The `/api/rooms` endpoint enforces `is_civic = false`
at the query level. A civic room cannot be returned by the entertainment endpoint.

```typescript
// cloudflare-worker/src/routes/rooms.ts
app.get('/api/rooms', async (req, res) => {
  const { data } = await supabase
    .from('rooms')
    .select('*')
    .eq('is_live', true)
    .eq('is_civic', false)  // ← hard filter: civic rooms never in this response
    .order('audience_count', { ascending: false })
    .limit(50);
  // ...
});
```

---

## Frontend Tab Architecture

The main navigation has a dedicated "Civic" tab:

```
Bottom Nav (5 tabs):
  Home     → Entertainment feed + community discovery
  Discover → Regional + interest exploration
  +        → Create (room or civic report)
  Civic    → Civic-only feed (Traffic, Weather, Emergency, Notices)
  You      → Profile
```

The Civic tab has sub-tabs:
```
Civic Tab:
  All        → All civic content for user's region
  Emergency  → Emergency rooms only (crime, disaster, safety)
  Traffic    → Traffic + infrastructure
  Community  → Notices, Town Hall, Public Services
  Weather    → Weather alerts
```

**UI Rules:**
1. Civic rooms never appear in the Home tab room strip
2. Trending content in the Home tab never includes civic rooms
3. Civic rooms have a distinct visual treatment:
   - Colored left border by type (red=Emergency, orange=Traffic, blue=Weather, green=Community)
   - Badge showing verification level
   - Auto-expiry countdown
   - "Report" and "Verify" actions visible to members

---

## Verified Information Only Rule

A civic room that is unverified is clearly labelled. The system enforces:

```
UNVERIFIED badge:
  - Shown in yellow/amber
  - Room title prefixed with [UNVERIFIED]
  - Visible to all users in the Civic tab
  - Cannot be promoted to LGA or State level until verified

COMMUNITY-VERIFIED badge:
  - Shown when 5+ verified community members confirm the report
  - Yellow badge, lighter
  - Can be promoted to LGA level

LOOP-VERIFIED badge:
  - Shown after Loop Civic Team review
  - Green badge
  - Can be promoted to State level

OFFICIAL-VERIFIED badge:
  - Shown after government authority confirms
  - Blue badge with shield icon
  - Can be promoted to National level
```

### Automated Pre-publish Checks

Before a civic room is created, the Worker runs:

```typescript
async function validateCivicRoom(room: CivicRoomCreate, env: CloudflareEnv) {
  const checks = await Promise.all([
    checkCreatorVerificationTier(room.creator_id, env),
    checkDuplicateIncident(room.type, room.location, env),
    checkCreatorRegionMatch(room.creator_id, room.location, env),
    checkSourceUrlResolves(room.source_url),
    checkTitleLength(room.title),          // max 120 chars
    checkNoOpinionLanguage(room.title),    // text classifier
  ]);

  const failures = checks.filter(c => !c.passed);
  if (failures.length > 0) {
    return { allowed: false, reasons: failures.map(f => f.reason) };
  }

  return { allowed: true };
}
```

---

## Moderation Requirements

| Civic Room Type | Review SLA | Moderator Tier Required |
|----------------|-----------|------------------------|
| Emergency | 60 min (high severity: 30 min) | Civic Team |
| Crime Alert | 120 min | Community Moderator |
| Traffic | Auto-approved + spot-check | Algorithm |
| Weather | Auto-approved (NiMet feed) | Algorithm |
| Community Notice | 24 hours | Community Moderator |
| Public Services | 24 hours | Civic Team |
| Town Hall | Pre-approved (24h before) | Civic Team |

### Auto-Expiry Rules

| Type | Default Expiry | Max Expiry |
|------|---------------|-----------|
| Traffic | 3 hours | 8 hours |
| Weather | 6 hours (or per alert) | 24 hours |
| Emergency | 12 hours | 72 hours |
| Crime Alert | 24 hours | 72 hours |
| Community Notice | 7 days | 30 days |
| Public Services | Until event date + 1 day | — |
| Town Hall | Duration + 2 hours | — |

Expired civic rooms are archived (not deleted) for audit purposes.

---

## Separation Compliance Checklist

This checklist must pass before any civic feature ships:

- [ ] `/api/rooms` enforces `is_civic = false` filter in all queries
- [ ] `/api/trending` enforces `is_civic = false` filter in all queries
- [ ] Home tab never renders a room with `is_civic = true`
- [ ] Civic tab never renders a room with `is_civic = false`
- [ ] Community trending score computation excludes `is_civic = true` rooms
- [ ] Civic trending computation only includes `is_civic = true` rooms
- [ ] All civic write endpoints require Creator verification ≥ 'community'
- [ ] Verification badges render correctly for all 4 verification levels
- [ ] Auto-expiry triggers tested for all 7 civic room types
- [ ] Report system tested: 5 community reports → auto-flag

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
