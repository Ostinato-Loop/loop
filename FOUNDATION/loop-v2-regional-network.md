# FOUNDATION/loop-v2-regional-network.md
**Version:** 2.0 — Regional Network Architecture
**Date:** 2026-06-07
**Status:** APPROVED FOUNDATION — implementation reference
**Classification:** Architecture

---

## Mission

Loop is not a generic audio social network.
Loop is a **Regional Audio Network** — a living civic and cultural infrastructure for Nigeria, built region by region.

### The Principle

```
Region First.
Interest Second.
Room Third.
```

A user opens Loop and sees their region. Not algorithmic noise. Not global trending. Their street, their council, their state — then the world.

---

## Strategic Position

| Generic "Spaces" clone | Loop Regional Network |
|------------------------|----------------------|
| Global feed by default | Region feed by default |
| Follow graph is primary | Geographic proximity is primary |
| Viral content wins | Local relevance wins |
| Creator-first discovery | Region-first discovery |
| Homogeneous room types | Civic, Entertainment, Business, Traffic, Weather, Emergency — separated |

---

## Hierarchy Model

```
Planet
└── Country                           (e.g. Nigeria)
    └── State                         (e.g. Lagos State)
        └── Local Government Area     (LGA) (e.g. Ikeja LGA)
            └── LCDA                  (e.g. Ojodu LCDA)
                └── Neighborhood      (future — e.g. GRA Phase 2)
                    └── Street        (future — e.g. Toyin Street)
```

### Design Constraints

- Every room MUST be anchored to at least a **State** (minimum scope)
- Rooms can be anchored to LGA, LCDA, or Neighborhood (narrower scopes)
- A room can span multiple regions (e.g. cross-LGA flood alert)
- Country-level rooms exist for national scope content
- Global rooms exist (no region) for diaspora content

---

## Nigeria First — State Registry

### Phase 1 Launch States (Tier 1 — highest population density)

| State ID | State | Capital | LGA Count |
|----------|-------|---------|-----------|
| `NG-LA` | Lagos | Ikeja | 20 LGAs + 37 LCDAs |
| `NG-KN` | Kano | Kano Municipal | 44 LGAs |
| `NG-AB` | Abuja FCT | Abuja | 6 Area Councils |
| `NG-RS` | Rivers | Port Harcourt | 23 LGAs |
| `NG-OY` | Oyo | Ibadan | 33 LGAs |

### Phase 2 States (6–12 months)

`NG-EN`, `NG-AN`, `NG-IM`, `NG-DE`, `NG-ED`, `NG-KD`, `NG-SO`, `NG-BO`, `NG-PL`, `NG-BE`, `NG-ON`, `NG-OS`

### Phase 3 — All 36 States + FCT (12–24 months)

Full national coverage.

### Global Expansion (24+ months)

```
Phase 4: West Africa    — Ghana (GH), Senegal (SN), Côte d'Ivoire (CI)
Phase 5: East Africa    — Kenya (KE), Uganda (UG), Tanzania (TZ)
Phase 6: Southern Africa — South Africa (ZA)
Phase 7: Diaspora nodes  — UK-London, US-Houston, CA-Toronto (diaspora communities)
```

---

## Region ID System

### Format

```
<ISO-3166-1-alpha2>-<STATE>-<LGA_CODE>-<LCDA_CODE>

Examples:
  NG-LA           = Nigeria, Lagos State
  NG-LA-IKJ       = Nigeria, Lagos, Ikeja LGA
  NG-LA-IKJ-OJD   = Nigeria, Lagos, Ikeja LGA, Ojodu LCDA
  NG-KN           = Nigeria, Kano State
  NG-KN-NSW       = Nigeria, Kano, Nassarawa LGA
  NG-KN-NSW-TRN   = Nigeria, Kano, Nassarawa, Tarauni
  NG-AB-AAC       = Nigeria, Abuja, Abuja Area Council
```

### ID Rules

- All uppercase
- Hyphen-delimited
- Country: ISO 3166-1 alpha-2 (NG, GH, KE...)
- State: 2-letter abbreviation from a controlled registry
- LGA: 3-letter code from a controlled registry (no duplicates across a state)
- LCDA: 3-letter code (unique within LGA)
- Neighborhood (future): 3-letter or numeric grid code

### Controlled Registry Location

`FOUNDATION/region-registry/` — a versioned JSON registry of all valid region IDs, names, and parent chains. This is the single source of truth. No hardcoded region strings in application code.

---

## Core Entities

### 1. Region

A Region is a permanent, system-owned geographic space. Regions are not created by users — they are provisioned by Loop operators from the controlled registry.

```
Region {
  id:             RegionID (e.g. "NG-LA-IKJ-OJD")
  country:        string   ("NG")
  state:          string   ("LA")
  lga:            string | null   ("IKJ")
  lcda:           string | null   ("OJD")
  neighborhood:   string | null   (future)
  name:           string          ("Ojodu LCDA")
  full_name:      string          ("Ojodu LCDA, Ikeja, Lagos")
  parent_id:      RegionID | null ("NG-LA-IKJ")
  timezone:       string          ("Africa/Lagos")
  population:     number | null
  is_active:      boolean
  created_at:     timestamp
}
```

**Region Permanence Rule:** Regions are never deleted. They may be merged, archived, or reclassified, but their IDs remain valid for historical content lookup.

---

### 2. Interest

An Interest is a topic cluster that spans regions. Interests are content-type agnostic — a user in Lagos and a user in Kano can both follow "Football" even though their regional rooms are different.

```
Interest {
  id:           string
  label:        string          ("Football", "Civic Watch", "Music")
  category:     InterestCategory
  icon_url:     string | null
  room_count:   number          (denormalized)
  follower_count: number        (denormalized)
  is_civic:     boolean         (civic interests never mix with entertainment ranking)
  created_at:   timestamp
}
```

**Interest Categories:**
- `civic` — News, Politics, Government, Emergency, Traffic, Weather, Public Safety
- `entertainment` — Music, Sport, Comedy, Drama, Celebrity
- `education` — Learning, Debate, Language, Career
- `business` — Finance, Real Estate, Startup, Jobs
- `culture` — Faith, Tradition, Language, Arts
- `local` — Neighborhood, Community, Local Business, Events

**Separation Rule:** Civic and Entertainment interests NEVER appear in the same discovery ranking. They are ranked by separate algorithms on separate leaderboards.

---

### 3. Room

A Room is the atomic unit of real-time audio experience. Rooms always belong to a Region AND optionally to a Community. A room without a community is a standalone regional room.

```
Room {
  id:             uuid
  title:          string
  description:    string | null
  region_id:      RegionID        (required — must be anchored to a region)
  community_id:   uuid | null     (optional — rooms can exist outside communities)
  host_id:        uuid
  room_type:      RoomType        (see Room Types below)
  category:       RoomCategory
  visibility:     "public" | "private" | "invite_only"
  is_live:        boolean
  audience_count: number
  is_auto_generated: boolean      (Traffic, Weather, Emergency rooms)
  auto_expires_at:   timestamp | null  (auto-generated rooms only)
  civic_verified: boolean         (Civic rooms only)
  evidence_urls:  string[]        (Civic rooms only)
  source_attribution: string | null (Civic rooms only)
  language:       string
  tags:           string[]
  created_at:     timestamp
  ended_at:       timestamp | null
}
```

---

### 4. Creator

A Creator is a user who has been granted at least one Regional Badge. Regular users become Creators when they earn their first LCDA badge.

```
Creator {
  user_id:              uuid
  badges:               RegionalBadge[]
  highest_badge_level:  "lcda" | "lga" | "state" | "national"
  primary_region_id:    RegionID
  is_civic_verified:    boolean
  verification_tier:    "none" | "community" | "journalist" | "official"
  rooms_hosted:         number      (lifetime)
  total_attendance:     number      (lifetime listeners across all rooms)
  avg_retention_pct:    number      (listener who stayed > 50% of room)
  abuse_strikes:        number
  is_suspended:         boolean
  suspended_until:      timestamp | null
}
```

---

## Regional Spaces

Every region in the registry has a permanent **Regional Space** — a discovery hub for that region. Regional Spaces are not rooms. They are persistent containers that hold:
- Pinned live rooms
- Upcoming scheduled rooms
- Community list (communities anchored to this region)
- Regional leaderboard (top creators, trending topics)
- Civic alert banner (if active emergency)

### Regional Space URL Structure

```
loop.app/ng/lagos                → Lagos State space
loop.app/ng/lagos/ikeja          → Ikeja LGA space
loop.app/ng/lagos/ikeja/ojodu    → Ojodu LCDA space
```

### Moderation Ownership

| Level | Moderation Owner | Escalation Path |
|-------|-----------------|-----------------|
| LCDA Space | LCDA Creator (highest badge) | → LGA Moderator |
| LGA Space | State-verified Creator | → State Moderator |
| State Space | Loop-assigned State Moderator | → Loop Trust & Safety |
| National | Loop Trust & Safety | → Government escalation (emergency only) |

**Moderation Principle:** Regional moderation is earned through the Creator Growth Ladder. No user is assigned regional moderation without earning it.

---

## Room Types — Separated by Function

All room types are fully separated. A room belongs to exactly one type. Type determines:
- Moderation rules
- Discovery weighting
- Verification requirements
- Auto-expiry rules
- Ranking algorithm

### 1. Civic Rooms

**Purpose:** News, politics, government accountability, public safety
**Rules:**
- Evidence-first policy: claims must be sourced
- Source attribution is required (URL or document)
- Creator must be community-verified minimum
- Never ranked alongside Entertainment rooms
- Moderated by Loop Civic Team + regional civic moderators
- False report = immediate strike (3 strikes = civic ban)
- Government officials must be government-verified tier

**Auto-creation:** Never (always human-initiated)
**Expiry:** Manual (host ends room) or 24h max with evidence review queue

---

### 2. Entertainment Rooms

**Purpose:** Music, comedy, drama, celebrity, sport commentary
**Rules:**
- Standard community guidelines apply
- Ranked by engagement and retention
- Anyone can create (subject to LCDA badge minimum for regional rooms)
- Moderated by community reports + AI pre-screening

**Auto-creation:** Never
**Expiry:** Manual

---

### 3. Business Rooms

**Purpose:** Finance, career, real estate, startup, investment
**Rules:**
- No investment solicitation without Verified Business badge
- Financial advice must carry disclaimer
- Moderators are Business-tier verified creators

**Auto-creation:** Never
**Expiry:** Manual

---

### 4. Traffic Rooms

**Purpose:** Real-time road condition reporting
**Examples:** Accident on Third Mainland Bridge, closure on Kano–Kaduna expressway
**Rules:**
- Requires at least 2 independent reports (verified by geo + timestamp) to auto-create
- OR created by LGA-verified creator
- Auto-expires 2 hours after last update or when host closes
- No debate/opinion permitted — strictly informational
- Abuse: reporting false traffic = immediate account flag

**Auto-creation:** YES — trigger: 2+ geo-tagged reports within 500m radius within 15 minutes
**Expiry:** 2 hours of inactivity or manual close. Hard max: 4 hours.

---

### 5. Weather Rooms

**Purpose:** Hyper-local weather alerts — flooding, storms, heat advisories
**Examples:** Flooding on Eko Atlantic, heavy rain Surulere axis
**Data Sources:**
- Nigerian Meteorological Agency (NiMet) API
- Community ground-truth reports
- Lagos State Emergency Management Agency (LASEMA) feed
**Rules:**
- Auto-created from NiMet + community trigger
- Government weather rooms auto-escalate to Emergency if severity ≥ "extreme"
- Strictly informational — no monetization

**Auto-creation:** YES — trigger: NiMet alert OR 3+ geo-tagged community reports
**Expiry:** When alert condition clears or 6 hours, whichever is shorter

---

### 6. Sports Rooms

**Purpose:** Live match commentary, post-match analysis, fantasy leagues
**Examples:** AFCON match commentary, NPFL match thread, Premier League viewing rooms
**Rules:**
- Ranked by real-time active listener count
- No illegal streaming links
- Sports rooms during active matches auto-appear in regional discovery

**Auto-creation:** PARTIAL — match schedule triggers "pre-room prompt" (creator must confirm to open)
**Expiry:** Manual

---

### 7. Education Rooms

**Purpose:** Learning sessions, tutorials, debates, language practice
**Examples:** WAEC prep room Ikeja, JAMB study Lagos North, Yoruba language practice
**Rules:**
- Session format enforced (structured hand-raise queue)
- Educator badge required to create Education rooms
- Can be scheduled (advance booking up to 30 days)

**Auto-creation:** Never
**Expiry:** Manual

---

## Profiles — Required Fields for V2

```
Profile {
  id:                   uuid
  username:             string
  display_name:         string
  avatar_url:           string | null
  bio:                  string | null

  // Regional identity
  country:              string | null       ("NG")
  state_id:             string | null       ("NG-LA")
  lga_id:               string | null       ("NG-LA-IKJ")
  lcda_id:              string | null       ("NG-LA-IKJ-OJD")
  neighborhood_id:      string | null       (future)

  // Discovery fields
  interests:            string[]            (interest IDs)
  profession:           string | null
  language:             string              (primary, default "en")
  languages_spoken:     string[]

  // Verification
  verification_status:  "none" | "community" | "journalist" | "official" | "government"
  is_verified:          boolean
  is_creator:           boolean
  highest_badge:        "lcda" | "lga" | "state" | "national" | null

  // Privacy
  location_visibility:  "everyone" | "followers" | "none"  (default: "none")
  show_lga:             boolean   (default: false)
  show_lcda:            boolean   (default: false)

  onboarded:            boolean
  created_at:           timestamp
  updated_at:           timestamp
}
```

**Privacy Rule:** A user's LGA/LCDA is NEVER shown publicly without explicit opt-in. Regional routing uses the region for content delivery, not for public profile display.

---

## Communities in the Regional Context

In Loop V2, Communities are **Regional Communities** — not generic interest groups.

A community MUST be anchored to a region (minimum: State level). A community cannot exist without a regional anchor.

```
Community {
  id:          uuid
  name:        string
  slug:        string
  region_id:   RegionID   (required — minimum state-level)
  category:    CommunityCategory
  visibility:  "public" | "private" | "invite_only"
  owner_id:    uuid
  ...
}
```

**Why region-first communities:** A "Lagos Tech" community is not the same as a "Nigeria Tech" community. Scoping communities to regions prevents the global homogenisation that destroys local culture on mainstream platforms.

---

## Manilla Integration (Future Architecture)

Manilla is the RALD music distribution platform. Loop × Manilla creates **Release Rooms** — a new room type triggered by music release dates.

```
Manilla Integration Flow:
  Artist uploads track to Manilla
  → Release date stored in Manilla catalog
  → On release date: Manilla signals Loop
  → Loop creates Release Room in artist's primary region
  → Release Room type: "listening" (read-only, play-first)
  → After 24h: transitions to "commentary" mode (open discussion)

Listening Room rules:
  - Artist must be Manilla-verified
  - Track plays natively inside Loop room (no redirect)
  - No re-sharing of audio (DRM)
  - Artist community is auto-notified
  - Regional discovery surfaces Release Rooms to artist's region followers

Artist Communities:
  - Every Manilla artist gets an artist community
  - Community anchored to artist's primary region
  - Fans join the community; Release Room notifications go to members
  - Artist badge: "Manilla Verified Artist"
```

This integration is **architecture-only**. No implementation until Loop V2 reaches 80+/100 certification and Manilla integration API is confirmed stable.

---

## Final Recommendation: Launch Strategy

### Decision: **B — Region-First**

**Rationale:**

Loop's defensible moat is its regional depth. No platform has built civic-grade regional audio infrastructure for Nigeria. If Loop launches as community-first, it risks becoming another generic group-chat platform that Twitter Spaces already does.

Region-first forces three structural advantages:

1. **Cold-start solution** — A new user with zero followers and zero follows has *immediate* local content on day one. Their LGA rooms appear because they exist as a region, not because anyone followed anyone.

2. **Network effects anchor** — Regional network effects compound locally before going national. A user in Ojodu tells a friend in Ojodu. Two users in Ojodu means two users in the same regional space. This is a denser early-stage flywheel than global follow graphs.

3. **Competitive moat** — Twitter, Meta, and TikTok cannot localise to LGA level without rebuilding their data models. Loop can. This is a 3–5 year moat if executed correctly.

**The hybrid risk:** Launching as hybrid (Community + Region simultaneously) splits engineering focus, splits user mental model, and delays the moment either flywheel reaches critical mass. Build the region infrastructure first. Communities run on top of it.

**Implementation order:**
1. Region-anchored profiles (Phase 1 — onboarding)
2. Regional discovery feed (Phase 1 — day one)
3. Regional communities (Phase 2 — communities ARE regional)
4. Civic rooms (Phase 3 — requires regional moderation ownership to be in place first)
5. Traffic / Weather auto-rooms (Phase 4 — requires regional data feeds)

---

*Next document: FOUNDATION/loop-v2-creator-economy.md*
