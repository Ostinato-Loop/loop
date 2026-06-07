# FOUNDATION/network-activation-v1.md
**Version:** 1.0 — V2 Network Activation Sprint
**Date:** 2026-06-07
**Status:** APPROVED — Engineering Execution Reference
**Authority:** CTO Office — LILCKY STUDIO LIMITED
**Sprint Classification:** Network Activation — no new infrastructure, no new auth, no new CI, no new governance

---

## Mission

> Make Loop feel alive even with low user numbers.

Loop currently scores 16/100 as a product (loop-reality-check.md). The feed is empty. The core audio feature does not work. Messages eject the user from the app. Communities do not exist.

This sprint does not fix all of that. This sprint answers one question:

**When a real user opens Loop today, what do they see, feel, and do that makes them come back tomorrow?**

Everything in this document is constrained by four hard rules:

| Rule | Constraint |
|------|-----------|
| No new infrastructure | Use Supabase + Cloudflare Worker + D1 + KV already in production |
| No new authentication | Use existing RALD Auth + Supabase JWT |
| No new CI | Existing GitHub Actions pipeline is the gate — do not modify it |
| No new governance | No new moderation tiers, no new policy documents |

---

## The Ten Activation Systems

### 1. Community Home Feed

**Goal:** Every user lands inside a feed that has content. Not a placeholder. Not "coming soon." Real content scoped to their region.

**Cascade Logic:**

```
User opens Loop
  → Detect region from profile (lcda_id → lga_id → state_id → country = NG)
  → Query: live rooms WHERE region_id STARTS WITH lcda_id ORDER BY traction_score DESC
  → If result.length < 3: expand to lga_id
  → If result.length < 3: expand to state_id
  → If result.length < 3: expand to 'NG' (national)
  → If result.length = 0: render seeded featured rooms (never empty state)
```

**Priority Order:**

| Level | Label | Example |
|-------|-------|---------|
| 1 | LCDA Feed | "Rooms in Ojodu" |
| 2 | LGA Feed | "Rooms in Ikeja" |
| 3 | State Feed | "Rooms in Lagos" |
| 4 | National | "Rooms across Nigeria" |

**Implementation:**

The feed cascade is a single Cloudflare Worker query. No new tables. The `rooms` table already has `region_id` (or `community_id` after V2 schema lands). A composite query with `COALESCE` and fallback scope suffixes handles all four levels.

```typescript
// Worker: GET /api/feed/regional
async function getRegionalFeed(env: Env, user: AuthUser) {
  const profile = await getProfile(env, user.id);
  const scopes = buildScopeCascade(profile); // [lcda, lga, state, national]

  for (const scope of scopes) {
    const rooms = await getLiveRoomsForScope(env, scope, { limit: 20 });
    if (rooms.length >= 3) return { scope, rooms, feed_level: scope.level };
  }
  return { scope: 'national', rooms: await getFeaturedRooms(env), feed_level: 'featured' };
}
```

**Wire:** `feed.tsx` — replace `ContentFeedEmpty` with regional feed result. Category chips must drive scope, not cosmetic state only.

---

### 2. Community Welcome System

**Goal:** A new user never lands on an empty feed. They are immediately placed inside communities that have content.

**Auto-Join Logic (runs at profile creation, in existing onboarding flow):**

```
On onboarding complete:
  1. Auto-join StateCommmunity based on profile.state_id
     (INSERT INTO community_members, role = 'member', invite_source = 'regional_auto')
  2. Auto-join top 3 Interest Communities matching profile.interests[]
     (rank interest communities by member_count DESC, seed score = 1.0)
  3. Immediately surface first room recommendation for each joined community
     (store in user_recommendations KV key, TTL = 24h)
```

**First Room Recommendation:**

The recommendation appears on the home screen as a single highlighted card immediately after onboarding redirect. It is not a notification. It is inline content — the first thing a user sees after "Let's go."

```typescript
// KV: user_recommendations:{user_id}
type FirstRoomRec = {
  community_id: string;
  community_name: string;
  room_id: string | null;          // null if no live room → show scheduled
  room_title: string;
  room_host: string;
  prompt: string;                  // "Lagos is talking about this right now"
  expires_at: number;
};
```

**No empty first session rule:** If a user's state community has zero live rooms, surface the highest-momentum room in any of their interest communities. If that is also zero, surface the national trending room. A user sees zero rooms in their first session only if Loop has zero live rooms globally — which is addressed by Activation System 7.

---

### 3. Active Rooms Engine

**Goal:** Live rooms are sorted and surfaced by real activity, not by creation time or random order.

**Room Momentum Score:**

Computed by the Cloudflare Worker every 60 seconds per live room. Stored in KV (`room_momentum:{room_id}`, TTL = 90s).

```
momentum_score =
  (audience_count × 1.0)
  + (speaker_count × 2.5)         // speakers = conversation = more engaging
  + (raise_hand_count × 3.0)      // demand to speak = high energy
  + (join_rate_last_5min × 4.0)   // accelerating growth = viral signal
  + (reaction_count_last_5min × 1.5)
  − (leave_rate_last_5min × 2.0)  // rapid departures = content is failing

  × recency_boost(room_age_minutes):
    ≤ 10 min: 1.3 (new room bonus)
    10–30 min: 1.0 (neutral)
    > 60 min: 0.85 (age decay)
```

**Room Card Displays (required fields):**

Every room card must render:

| Field | Source | Example |
|-------|--------|---------|
| Speaker count | `room.speaker_count` | "4 on stage" |
| Listener count | `room.audience_count` | "127 listening" |
| Momentum badge | `momentum_score` tier | 🔥 Hot · 📡 Growing · ● Live |

**Momentum Tiers:**

```
score ≥ 100  → 🔥 Hot
score ≥ 40   → 📡 Growing
score ≥ 10   → ● Live
score < 10   → (no badge — room is quiet)
```

**Wire:** `room-card.tsx` — add momentum badge. Worker cron every 60s computes scores and writes to KV. Feed query reads from KV, not from rooms table, for momentum ordering.

---

### 4. Community Presence Layer

**Goal:** Every community page communicates that people are here, right now.

**Presence Data Contract:**

```typescript
type CommunityPresence = {
  community_id: string;
  members_online: number;        // active in last 15 minutes
  rooms_live_now: number;        // is_live = true AND community_id matches
  newest_members: MiniProfile[]; // last 5 joined, show avatar strip
  trending_topics: string[];     // top 3 discussion keywords from live rooms
  computed_at: number;           // unix ms — client shows "updated X ago"
};
```

**Presence Computation:**

- `members_online`: count of `community_members WHERE last_active_at > now() - interval '15 minutes'`
- `rooms_live_now`: count from `rooms` where `community_id` matches and `is_live = true`
- `newest_members`: 5 most recent `community_members` joins (avatar + display_name)
- `trending_topics`: extracted by Cloudflare AI (`@cf/baai/bge-base-en-v1.5` keyword extraction from live room titles + descriptions in this community)

**Stored in:** Cloudflare KV `community_presence:{community_id}`, TTL = 60s
**Computed by:** Cloudflare Cron Trigger every 60s (reuse existing cron infrastructure)

**UI:** Community header renders a presence strip:
```
● 34 online  ·  3 rooms live  ·  Newest: [Avatar] [Avatar] [Avatar]
```

**Critical rule:** If `members_online = 0` and `rooms_live_now = 0`, hide the presence strip entirely. Do not show "0 online." Show nothing rather than a dead signal.

---

### 5. Creator Discovery

**Goal:** Every room host has a stats panel that gives them signal on their performance. Creators cannot grow what they cannot measure.

**Room Host Stats (available immediately after room ends):**

```typescript
type CreatorRoomStats = {
  room_id: string;
  peak_listeners: number;          // max concurrent in any 1-minute window
  total_unique_listeners: number;  // distinct user_ids who joined
  avg_session_length_min: number;  // average time before user left
  listener_retention_pct: number;  // % who stayed > 5 minutes
  community_reach: string;         // "Reached Ikeja LGA" | "Reached Lagos State" | "National"
  promotion_eligible: boolean;     // threshold met for next promotion level
  promotion_message: string;       // "This room qualifies for LGA promotion next time"
  shares: number;
  bookmarks: number;
};
```

**Community Reach Label:**

Determined by the highest scope level the room achieved in `community_trending`. Not estimated — pulled from the promotion audit log.

**Promotion Eligibility Message:**

If the room reached LGA trending: "You're eligible for State promotion. Host 3 more rooms with ≥ 50 listeners to unlock."

**Where it appears:** In the host's Room Summary card, accessible from their profile → "My Rooms" → tap ended room. Also surfaced as an in-app notification 10 minutes after the room ends.

**No new infrastructure:** All data is derivable from existing `room_participants`, `community_trending`, and `promotion_audit_log` tables.

---

### 6. Promotion Engine V1

**Foundation:** This engine builds directly on `FOUNDATION/community-promotion-system.md`. This section specifies the V1 scope and what is deferred.

**V1 Scope (this sprint):**

| Promotion Level | Status |
|----------------|--------|
| Community Room (visible to community members) | ✅ Ship |
| LGA Promotion | ✅ Ship |
| State Promotion | ✅ Ship |
| National Trending | ⏳ Phase 2 — requires moderation capacity at national scale |

**Promotion Signal Weights (V1 — simplified from full spec):**

| Signal | V1 Weight | Rationale |
|--------|-----------|-----------|
| Peak listeners | 1.0× | Raw reach |
| Listener retention (>5 min) | 2.0× | Quality over quantity |
| Participation rate (speakers/listeners) | 2.5× | Conversation density |
| Shares (verified platform shares only) | 3.0× | External pull signal |
| Bookmarks | 1.5× | Intent to return |

**V1 Thresholds:**

```
Community Trending:  score ≥ 10,  live ≥ 2 minutes
LGA Promotion:       score ≥ 50,  community trending ≥ 10 minutes
State Promotion:     score ≥ 200, LGA trending ≥ 15 minutes
```

**Demotion:** Any room dropping below current threshold for 3 consecutive 5-minute cycles is demoted. Room ending triggers immediate removal.

**Civic rooms:** Separate civic promotion system. Never mixed with entertainment. Governed by urgency + verification + proximity. Not modified by this sprint.

---

### 7. Empty Room Prevention

**Goal:** A user never opens Loop to see an empty feed with no rooms.

**Cascade — Full Specification:**

```
STEP 1: Get user's primary region (lcda_id from profile)
  → Query live rooms for this LCDA
  → If ≥ 3 results: SERVE

STEP 2: Expand to LGA
  → Query live rooms for user's lga_id (includes all LCDAs)
  → If ≥ 3 results: SERVE with label "Near you in [LGA Name]"

STEP 3: Expand to State
  → Query live rooms for user's state_id
  → If ≥ 3 results: SERVE with label "Across [State Name]"

STEP 4: National
  → Query all live rooms ORDER BY traction_score DESC LIMIT 20
  → If ≥ 1 result: SERVE with label "Happening across Nigeria"

STEP 5: Featured (no live rooms nationally)
  → Pull from KV key `featured_rooms` — a manually curated list of
    seed rooms maintained by Loop Ops
  → These are "always available" rooms — permanent anchor content
  → SERVE with label "Recommended for you"

STEP 6: Scheduled Rooms
  → If still empty: show next 3 scheduled rooms (community_events table)
  → "Coming up soon" — with countdown timer
```

**The `featured_rooms` KV key:**

Loop Ops maintains a list of 10 permanent featured rooms — pinned conversations, radio stations with regular programming, or creator communities that always have content. These are manually managed, not algorithmic. They are the floor below which the feed cannot fall.

**Wire:** `feed.tsx` GET `/api/feed/regional` handles all cascade steps server-side. Client renders what it receives. Client never knows which cascade level was used — the label in the response carries the context.

---

### 8. Civic Layer Visibility

**Goal:** Civic content (Traffic, Weather, Emergency, Community Notices) is always visually separated from entertainment. Never mixed. Always prioritised within the Civic tab.

**Civic Sub-Tab Hierarchy:**

```
Civic Tab
├── 🚨 Emergency       (is_civic=true, category='emergency') — always pinned top
├── 🚦 Traffic         (is_civic=true, category='traffic') — sorted by recency
├── 🌧️ Weather         (is_civic=true, category='weather') — sorted by severity
├── 📢 Notices         (is_civic=true, category='community_notice')
└── 🏛️ Town Hall       (is_civic=true, category='civic_meeting')
```

**Separation Rules (hard enforcement):**

| Rule | Enforcement |
|------|------------|
| Civic rooms never appear in Entertainment feed | `WHERE is_civic = false` on all entertainment queries |
| Entertainment rooms never appear in Civic tab | `WHERE is_civic = true` on all civic queries |
| Civic rooms sorted by urgency, NOT traction score | Separate sort column: `urgency_level INT 1–5` |
| Civic rooms never carry momentum badges | Badge system is entertainment-only |
| Civic room cards use distinct visual design | Red/amber header instead of gradient |

**Civic Room Card (distinct from entertainment):**

```
┌─────────────────────────────────┐
│ 🚨 EMERGENCY · Verified         │
│ Flooding Alert — Lekki Axis     │
│ ● 847 listening · LASEMA Source │
│ Last updated: 4 minutes ago     │
└─────────────────────────────────┘
```

**Auto-created civic rooms (Traffic, Weather)** follow the rules in `FOUNDATION/loop-v2-regional-network.md` — two independent geo-tagged reports within 500m within 15 minutes, or NiMet API trigger.

---

### 9. Community Growth Dashboard

**Goal:** Track whether Loop is actually growing as a living network, not just as an app install counter.

**Metrics — Full Definition:**

| Metric | Definition | Measurement |
|--------|-----------|-------------|
| DAU | Distinct user_ids with session in last 24h | Supabase: `profiles` last_active_at |
| WAU | Distinct user_ids with session in last 7 days | Rolling 7-day window |
| MAU | Distinct user_ids with session in last 30 days | Rolling 30-day window |
| Active Communities | Communities with ≥ 1 live room in last 24h | `rooms` JOIN `communities` |
| Active Rooms | Count of `is_live = true` rooms, sampled hourly | `rooms` WHERE is_live |
| Avg Session Length | Mean time from first to last event per session | Client-side event timing |
| Listener Retention | % of room joins with duration > 5 min | `room_participants.duration_seconds` |
| Regional Spread | Count of unique state_ids active in last 7 days | `profiles` GROUP BY state_id |
| Creator Retention | % of room hosts who hosted again within 7 days | `rooms` GROUP BY host_id |

**Computed:** Cloudflare Analytics Engine + Supabase scheduled functions (existing infra).

**Dashboard:** Surfaced in Loop Admin (`RALD Control Center → Loop → Growth`). Not surfaced to end users.

**Stickiness Ratio:**

```
stickiness = DAU / MAU

Target: ≥ 0.20 (20% of monthly users return daily)
Current: Unmeasurable — no session tracking implemented
Activation gate: stickiness must reach 0.10 before network launch declared
```

---

### 10. Retention Engine

**Goal:** Users who are not in the app are notified when something worth returning for happens.

**Notification Triggers (V1 — 4 trigger types):**

| Trigger | Condition | Message |
|---------|-----------|---------|
| Community Goes Live | A room opens in any community user has joined | "[Community Name] just started a room: [Room Title]" |
| Favourite Creator Goes Live | Host the user follows opens a room | "[Display Name] just went live: [Room Title]" |
| Trending Room Emerges | A room in user's region reaches LGA trending | "🔥 [Room Title] is trending in [LGA Name]" |
| Civic Alert Published | New emergency or traffic room in user's region | "🚨 [Alert Type] alert for [Region Name]: [Brief]" |

**Delivery Channels (V1):**

| Channel | Status | Notes |
|---------|--------|-------|
| In-app notification (bell icon) | Ship V1 | Supabase Realtime subscription on `notifications` table |
| Push notification (FCM/APNs) | Ship V1 | Registered in onboarding (existing push token flow) |
| WhatsApp notification | Phase 2 | Requires RALD Notify → WhatsApp provider |
| Email digest | Phase 2 | Weekly digest of top rooms in communities |

**Notification Rate Limiting:**

```
Max notifications per user per hour: 3
Max notifications per user per day: 10
Civic Emergency alerts: exempt from rate limits — always delivered immediately
Favourite creator alerts: max 1 per creator per 6 hours
Community alerts: max 1 per community per 4 hours
```

**Bell Icon — V1 Requirement:**

The bell icon in `feed.tsx` currently has no onClick. V1 ships with:
- Bell icon opens notification panel (slide-down sheet)
- Notifications rendered from `notifications` Supabase table
- Unread badge count on bell icon
- "Mark all read" action

---

## Sprint Execution Constraints

### What This Sprint Does NOT Include

| Excluded | Reason |
|----------|--------|
| Audio SDK integration | Separate track — requires LiveKit + infrastructure capacity |
| In-app messaging | Separate track — Loop Messenger integration is a P0 but not in this sprint |
| New CI pipeline | Existing GitHub Actions pipeline is not modified |
| New governance rules | No new moderation tiers or community policy |
| New authentication | Existing RALD Auth + Supabase JWT only |
| New Supabase instance | All writes go through existing production Supabase |
| National trending | Requires moderation capacity at scale — Phase 2 |

### What This Sprint DOES Include

1. Regional feed cascade (community home feed)
2. Auto-join state + interest communities at onboarding
3. Momentum score computation + room card display
4. Community presence layer (KV-cached)
5. Creator room stats (post-room summary)
6. Promotion Engine V1 (Community → LGA → State)
7. Empty room prevention with featured_rooms floor
8. Civic tab with full separation and sub-tabs
9. Growth metrics computation + dashboard integration
10. Retention notifications (in-app + push, 4 trigger types)

---

## Activation Definition

**Loop is activated** when:

```
DAU ≥ 100
Stickiness (DAU/MAU) ≥ 0.10
Active Communities ≥ 5
Avg Session Length ≥ 4 minutes
Listener Retention ≥ 30%
Zero empty-feed incidents (no user lands on empty state with no fallback)
```

Until these thresholds are met, Loop is in **pre-activation** mode — functional but not network-alive.

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
