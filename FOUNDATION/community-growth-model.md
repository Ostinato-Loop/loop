# FOUNDATION/community-growth-model.md
**Version:** 1.0 — Community Growth Model
**Date:** 2026-06-07
**Status:** APPROVED — Strategy Reference
**Authority:** CTO Office — LILCKY STUDIO LIMITED
**Companion docs:**
- `FOUNDATION/network-activation-v1.md` — activation sprint specification
- `FOUNDATION/community-architecture-v1.md` — data schema and community types
- `FOUNDATION/community-promotion-system.md` — promotion algorithm
- `FOUNDATION/loop-v2-regional-network.md` — regional hierarchy

---

## The Core Growth Thesis

> Loop grows community by community, not user by user.

On a global follow-graph platform (Twitter, TikTok), growth is driven by individual users accumulating followers. The network effect is personal and slow to compound at the local level.

On Loop, growth is driven by communities becoming alive. A community with 50 active members creates a pull that attracts the next 50. The unit of network value is not the individual user — it is the active regional community.

**Implication:** Every growth metric, every retention mechanism, and every activation trigger must be measured at the community level first, the user level second.

---

## Community Lifecycle Stages

Every community in Loop passes through five lifecycle stages. Stage determines what actions the platform takes to support or accelerate growth.

### Stage 0: Seeded (system-created, no human activity)

```
Characteristics:
- Created automatically from the regional registry
- member_count = 0 (no users yet)
- room_count = 0
- health_score = 50 (default)
- Zero user interactions

Platform actions:
- Community exists in the database and is discoverable
- Does NOT appear in "Active Communities" on the discovery feed
- Will receive new members through auto-join onboarding cascade
- Monitored for first-member event
```

### Stage 1: Nascent (1–49 members, 0 active rooms in last 7 days)

```
Characteristics:
- Has members but no consistent activity
- Rooms are occasional, if any
- No established hosts

Platform actions:
- Appears in "Near you" discovery with a "New community" label
- System generates a weekly "Welcome post" in the community announcements
- First room in a nascent community gets a +20% momentum score bonus
- Community does NOT appear in LGA or State trending feeds yet
- Loop Ops is notified to seed a featured room or invite a creator
```

### Stage 2: Emerging (50–499 members, ≥ 1 room in last 7 days)

```
Characteristics:
- Has recurring activity
- One or more hosts returning to the community
- Some member-to-member interaction

Platform actions:
- Appears in regional discovery feed without special label
- Eligible for Community Trending (local scope only)
- Top 3 rooms from this community appear in LGA feed during peak activity
- Community host receives first Creator Stats notification
- Growth Dashboard begins tracking this community
```

### Stage 3: Active (500–4,999 members, ≥ 3 rooms in last 7 days)

```
Characteristics:
- Regular programming (multiple hosts, recurring topics)
- Community has social memory — members reference past rooms
- Distinct community identity visible in room titles and descriptions

Platform actions:
- Eligible for LGA Trending promotion
- Top room may bubble to State feed if score ≥ T3
- Community moderator slot opens (owner can appoint)
- Community Presence Layer is active and visible (members online, rooms live)
- Room hosts in this community receive Creator Discovery profile
- Host analytics surfaced in Creator Dashboard
```

### Stage 4: Established (5,000–49,999 members, ≥ 5 rooms per week)

```
Characteristics:
- A recognisable community with consistent culture
- Multiple verified creators as regular hosts
- Community generates its own events (scheduled rooms, AMAs, debates)

Platform actions:
- Eligible for State Trending promotion
- Community gets a verified badge (is_verified = true)
- Community events appear in Discover → Events tab (no longer dead-end)
- Creator leaderboard within community is surfaced to members
- Promotion eligibility messages activate for all top hosts
- Community featured on Loop's regional discovery strip
```

### Stage 5: Network Node (50,000+ members, daily programming)

```
Characteristics:
- The community functions as a regional institution
- Has civic credibility (government entities, media, verified journalists engage)
- Consistent daily listeners across multiple hosts

Platform actions:
- Eligible for National Trending (Phase 2)
- Government and press verification tier available for community admins
- Cross-community event capabilities (joint rooms with neighbouring communities)
- Community API endpoint available for third-party integration
- Featured in Loop's national launch communications
```

---

## Growth Flywheel

The Loop community growth flywheel has four phases. Each phase feeds the next.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   REGIONAL IDENTITY                                         │
│   User joins their LCDA/LGA/State community automatically   │
│   → They are "home" from day one                            │
│                                                             │
│              ↓                                              │
│                                                             │
│   FIRST LIVE EXPERIENCE                                     │
│   A room is live in their community                         │
│   → They listen for the first time                          │
│   → They feel the energy of real people talking             │
│                                                             │
│              ↓                                              │
│                                                             │
│   CREATOR PULL                                              │
│   A host's room gets momentum, reaches LGA trending         │
│   → Host receives stats: "74 people from Ikeja heard you"   │
│   → Host returns to host again, with more preparation       │
│   → Listeners follow the host to their next room            │
│                                                             │
│              ↓                                              │
│                                                             │
│   COMMUNITY GRAVITY                                         │
│   Community becomes known for a specific type of content    │
│   → New users in the region are auto-joined                 │
│   → Community appears in regional discovery                 │
│   → The cycle accelerates                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**The flywheel fails if:**
1. The first live experience is absent (no rooms live when user opens Loop)
2. Creator pull is invisible (no stats = no motivation to return)
3. Auto-join delivers the user to a community with no activity

All three failure modes are addressed by `FOUNDATION/network-activation-v1.md`.

---

## Growth Metrics — Full Definitions

### Community-Level Metrics

| Metric | Formula | Measurement Frequency | Target (Stage 3+) |
|--------|---------|-----------------------|-------------------|
| Community DAU | Distinct user_ids active in community in last 24h | Hourly | ≥ 50 |
| Weekly Rooms | Count of rooms opened in community in last 7 days | Daily | ≥ 3 |
| Host Retention | % of first-time hosts who host again within 14 days | Weekly | ≥ 40% |
| Listener Retention | % of listeners who return to same community within 7 days | Weekly | ≥ 35% |
| Member Growth Rate | (current_members − members_7days_ago) / members_7days_ago | Weekly | ≥ 5% |
| Community Health Score | Composite (activity + retention + creator count + civic flag) | Daily | ≥ 65/100 |
| Content Diversity | Unique host IDs per week / total room count | Weekly | ≥ 0.4 |

**Community Health Score Formula:**

```
health_score =
  (rooms_this_week / 7 × 20)           max 20 — activity component
  + (listener_retention_pct × 20)       max 20 — stickiness
  + (min(unique_hosts_this_week, 5) × 8) max 40 — creator density
  + (has_moderator ? 10 : 0)            max 10 — governance
  + (is_verified ? 10 : 0)              max 10 — trust

Range: 0–100. Stored in communities.health_score. Updated daily.
```

---

### Platform-Level Growth Metrics

| Metric | Definition | Target at Network Launch |
|--------|-----------|--------------------------|
| DAU | Distinct sessions in last 24h | ≥ 500 |
| WAU | Distinct sessions in last 7 days | ≥ 2,000 |
| MAU | Distinct sessions in last 30 days | ≥ 6,000 |
| Stickiness (DAU/MAU) | Daily retention ratio | ≥ 0.15 |
| Active Communities | Communities with ≥ 1 room in last 24h | ≥ 20 |
| Active Rooms (daily peak) | Max live rooms at any point in 24h | ≥ 10 |
| Average Session Length | Mean time from first to last event | ≥ 5 minutes |
| Listener Retention | % of room joins with duration > 5 min | ≥ 35% |
| Creator Return Rate | % of hosts who host again within 7 days | ≥ 40% |
| Regional Spread | Distinct states with ≥ 1 active community | ≥ 3 states |

---

## Network Effects — When They Kick In

Loop has two types of network effects. Understanding when each activates determines the launch sequencing.

### Type 1: Local Network Effects (density-dependent)

**Threshold:** A region needs ≥ 15 active members to sustain a live room with non-trivial participation.

Below this threshold, rooms feel empty even if technically live. A room with 2 listeners and 1 host does not feel like a community. It feels like a broadcast to nobody.

**Implication:** Launch strategy concentrates on one LCDA first, then expands. Do not spread the early user base across 37 LCDAs simultaneously. Density beats distribution in Phase 1.

```
Phase 1: 1–3 LCDAs (target 50+ active users per LCDA before expanding)
Phase 2: Full LGA coverage (all LCDAs in first 3 LGAs)
Phase 3: Second state (Kano or Abuja — based on where organic signups cluster)
Phase 4: Full Phase 1 state coverage (5 states)
```

### Type 2: Cross-Regional Network Effects (content-dependent)

**Threshold:** A room needs to reach State Trending to generate cross-regional pull.

When a room from Ojodu LCDA reaches State Trending in Lagos, users in Surulere and Apapa discover it. The original community gains members from outside its region. This is the moment Loop stops being a local app and starts being a network.

**Implication:** Creator development and promotion engine are not vanity features. They are the mechanism that converts local density into regional reach.

---

## Community Seeding Strategy

At zero users, communities must be seeded with enough "gravitational pull" to attract first users. Three seeding vectors:

### Vector 1: Creator Seeding

Loop Ops identifies and partners with 10–20 creators in the Phase 1 launch LCDAs before public launch. These creators:
- Host 2–3 rooms per week during the pre-launch period
- Build a listener base in their community before it is opened to the public
- Become the "founders" of their LCDA community — their names appear in the community history

**Target:** 3 creators per launch LCDA minimum. 1 civic, 1 entertainment, 1 wild card.

### Vector 2: Content Seeding

Every community, at Stage 0 and Stage 1, receives system-generated announcements that establish community presence:

```
Day 1: "Welcome to [LCDA] Community — [N] members and counting"
Day 3: "This week in [LCDA]: [Top 3 discussion topics from LGA]"
Day 7: "Your community is growing — [N] new members joined this week"
```

These are not spam. They are pinned announcements from the community system account. They signal that the community exists and is watched.

### Vector 3: Event Seeding

Loop Ops pre-schedules 5 events for each Phase 1 LCDA before public launch:

| Week | Event | Type |
|------|-------|------|
| Week 1 | "Introduce yourself — Who's in [LCDA]?" | Community AMA |
| Week 2 | "[LCDA] Traffic Talk — daily morning room" | Recurring Traffic |
| Week 3 | "Top News in [LGA] — what are we talking about?" | Civic Discussion |
| Week 4 | "[LCDA] Music Room — Afrobeats / Amapiano hour" | Entertainment |
| Week 5 | "Ask the Community — community Q&A" | Community AMA |

These events appear in Discover → Events tab (making it non-dead-end from day one).

---

## Retention Architecture

### Why Users Return to Loop

Users return to platforms for one of three reasons:

| Reason | Loop Mechanism |
|--------|---------------|
| Social obligation (someone is waiting for me) | Following a creator → notification when they go live |
| Fear of missing out (something is happening) | Trending room alert — "this is hot right now in your area" |
| Habit (I always check this at a certain time) | Daily programming — morning traffic room, evening music room |

**Loop's retention model targets all three:**

1. **Creator follow** → push notification when creator goes live → FOMO converted to return visit
2. **Community trending** → in-app notification when any room in joined community hits LGA trending → social obligation (my community is buzzing)
3. **Recurring rooms** → scheduled events at consistent times → habit formation

**The habit loop:**

```
Trigger (notification)
  → Action (open Loop)
    → Reward (hear community conversation)
      → Investment (join as speaker, bookmark, share)
        → Increases chance of future trigger (promotion, more notifications)
```

### Retention Risk: The Dead Second Session

The highest churn point for any social platform is Session 2. A user who had a great first session returns — and finds an empty feed, no live rooms, and nothing that remembers they were there.

**Loop's defence:**

| Churn risk | Defence |
|-----------|---------|
| Empty feed on return | Regional cascade (never empty) |
| No personal context | "Welcome back — [Community Name] has a new room" |
| No progress feeling | "You've joined 3 communities — [X] new members since you joined" |
| No creator to follow | Creator Discovery surfaced after first listened room |

---

## Launch Region Strategy

### Decision: Density-First, Not Coverage-First

Loop does not launch in all 36 states simultaneously. Loop launches in one concentrated urban area, builds genuine community density, then expands.

**Phase 1 Launch Target: Lagos (Ikeja LGA — 3 LCDAs)**

| Rationale | Detail |
|-----------|--------|
| Highest urban density | 10+ million people within 20km radius |
| Creator ecosystem | Lagos has the largest concentration of audio content creators in Nigeria |
| Civic urgency | Lagos traffic, flooding, and power cuts are a shared daily experience |
| Entertainment demand | Afrobeats, Nollywood, comedy — all centred in Lagos |
| Tech-forward audience | Early adopter concentration in Ikeja, VI, Lekki |

**Phase 1 Launch LCDAs:**

```
1. Ojodu LCDA (Ikeja)    — middle class, dense, tech-aware
2. Agege LCDA (Agege)    — mass market, high density, entertainment-driven
3. Lekki LCDA (Eti-Osa)  — affluent early adopters, high WhatsApp sharing behaviour
```

**Expansion triggers (when to add next LCDA):**

```
Current LCDAs all at Stage 2 (50+ members, ≥ 1 room per 7 days)
Stickiness ≥ 0.10
At least 1 LCDA has an established host returning weekly
```

---

## The Anti-Metrics

These metrics look good but indicate platform failure. Track them. Act on them when they appear.

| Anti-Metric | What It Looks Like | What It Actually Means |
|------------|-------------------|------------------------|
| High install count, low DAU | 10,000 installs, 50 DAU | Users installed but found nothing — cold start failure |
| High room count, low listener retention | 20 rooms live, 5 min avg session | Rooms are low quality — users leave fast |
| High creator count, low room frequency | 100 creators, 2 rooms per week | Creators tried once, saw no audience, never returned |
| High community member count, low rooms_live | 500 members, 0 rooms this week | Community is a ghost town — seeding failed |
| High notification send rate, low open rate | 10,000 notifications, 2% open | Notifications are not relevant — triggers misconfigured |

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
