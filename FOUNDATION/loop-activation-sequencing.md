# FOUNDATION/loop-activation-sequencing.md
**Version:** 1.0 — Loop Activation Sequencing
**Date:** 2026-06-07
**Status:** APPROVED — Engineering Execution Order
**Authority:** CTO Office — LILCKY STUDIO LIMITED

**Synthesises:**
- `FOUNDATION/network-activation-v1.md` — 10 activation systems
- `FOUNDATION/trust-center-v1.md` — 10 trust systems
- `FOUNDATION/community-architecture-v1.md` — community data layer
- `FOUNDATION/community-growth-model.md` — growth flywheel
- `FOUNDATION/community-promotion-system.md` — promotion engine
- `AUDIT/retention-readiness.md` — retention infrastructure gaps
- `AUDIT/trust-readiness.md` — trust infrastructure gaps
- `AUDIT/loop-v2-launch-blockers.md` — P0 / P1 / P2 blockers
- `PRODUCTION/network-launch-readiness.md` — 7-gate network readiness
- `PRODUCTION/trust-launch-readiness.md` — 6-gate trust readiness

---

## The Master Sequencing Problem

Loop has two parallel sprint missions:

1. **Network Activation Sprint** — Make Loop feel alive (10 systems)
2. **Trust & Transparency Sprint** — Make Loop feel safe (10 systems)

Both are required before public launch. Neither can be done in isolation. They have shared dependencies, shared infrastructure, and shared gating criteria.

This document answers: **In what order does engineering build everything?**

The answer is not "both at once" and not "one then the other." It is a dependency graph that minimises rework, maximises time to first demonstrable product, and ensures no feature ships on top of broken infrastructure.

---

## The Three Invariants

Before any other decision, three invariants hold. They cannot be violated regardless of timeline pressure.

```
Invariant 1: RLS must be correct before any personal data feature ships.
             (trust data, retention data, privacy dashboard — all blocked)

Invariant 2: Trust schema (trust tables) must exist before any moderation action is taken.
             (a moderation action without an appeal path is not launchable)

Invariant 3: The regional feed cascade must work before any growth or retention metric matters.
             (a platform that shows empty feed cannot grow regardless of notification quality)
```

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FOUNDATION LAYER                                  │
│                                                                             │
│  RLS Fix ──────────────────────────────────────────────────────────────────►│
│       │                                                                      │
│       └──► All trust tables    All retention features    Privacy dashboard  │
│                                                                             │
│  Community Schema (7 tables) ──────────────────────────────────────────────►│
│       │                                                                      │
│       ├──► Auto-join onboarding    Community presence    Promotion engine   │
│       └──► Feed cascade (community rooms)    Creator stats                  │
│                                                                             │
│  Regional Feed Cascade ────────────────────────────────────────────────────►│
│       │                                                                      │
│       └──► Retention notifications (need something to notify about)         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           DELIVERY SEQUENCE                                  │
│                                                                             │
│  PHASE 0: Infrastructure fix (no features)                                  │
│  PHASE 1: Feed + Community (first alive state)                              │
│  PHASE 2: Trust baseline (moderation, reporting, deletion)                  │
│  PHASE 3: Retention (notifications, creator stats)                          │
│  PHASE 4: Promotion + Civic (full network quality)                          │
│  PHASE 5: Trust Center + Transparency (public trust surfaces)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 0 — Infrastructure (Days 1–5)
**"Fix what is broken before building anything new."**

No user-facing features. All backend and database. No frontend changes.

### 0.1 — RLS Remediation (Days 1–2)
**Dependency for:** all trust tables, privacy dashboard, retention data, safety reports

```
Fix all USING(true) RLS policies:
  profiles UPDATE    → USING(auth.uid() = id)
  rooms DELETE       → USING(auth.uid() = host_id)
  rooms SELECT       → public rooms only OR host/participant
  notifications      → USING(auth.uid() = recipient_id)
  friend_requests    → parties only
  room_participants  → room members only

Verification:
  SELECT policyname FROM pg_policies WHERE qual = '(true)';
  → Expected: 0 rows (or only genuinely world-readable tables)
```

**Owner:** Database Engineer
**Effort:** 2 days
**Risk:** Low — non-destructive policy replacements, testable in staging

---

### 0.2 — Community Schema Migration (Days 2–4)
**Dependency for:** community auto-join, community feed, community presence, promotion engine

```
Apply migrations (from community-architecture-v1.md):
  20260607000001_create_communities.sql      (7 community tables)
  20260607000002_seed_regional_communities.sql
  20260607000003_rooms_community_backfill.sql

Verify:
  SELECT COUNT(*) FROM communities WHERE is_system = true;
  → Expected: ≥ 350 Phase 1 regional communities
```

**Owner:** Database Engineer
**Effort:** 2 days (migration authoring + staging test + production apply)
**Risk:** Low — additive only, no existing tables modified

---

### 0.3 — Trust Schema Migration (Days 3–5)
**Dependency for:** safety reporting, moderation history, account deletion, trust center

```
Apply migrations:
  user_trust_records    → with new-user trigger
  trust_strikes         → with RLS: owner-read-only
  safety_reports        → with RLS: reporter-read-only, subject-invisible
  bug_reports           → with RLS: owner-read-only
  feature_requests      → with RLS: public read, auth insert
  civic_room_verifications
  civic_room_reports
  promotion_audit_log

Verify:
  SELECT tablename FROM pg_tables WHERE tablename IN ('user_trust_records', ...);
  → Expected: 8 rows
```

**Owner:** Database Engineer
**Effort:** 2 days
**Risk:** Low — additive, no existing tables modified

---

### 0.4 — Moderation Service Wire-Up (Days 4–5)
**Dependency for:** room creation safety, display name safety

```
In moderation.ts:
  1. Uncomment Workers AI classification
  2. Seed KV: moderation:blocklist (100+ terms)
  3. Wire moderateMessage() into POST /api/rooms (title + description)
  4. Wire moderateMessage() into PATCH /api/profiles (display name)

Verify:
  POST /api/rooms { title: "[blocked term]" }
  → Expected: 400 { error: "Content not allowed — see Community Rules" }
```

**Owner:** Backend Engineer
**Effort:** 1.5 days
**Risk:** Medium — Workers AI adds latency to room creation path (< 200ms expected — verify)

---

**Phase 0 exit criteria:**
- [ ] Zero `USING(true)` policies in `pg_policies`
- [ ] 7 community tables + 8 trust tables in production
- [ ] 350+ regional communities seeded
- [ ] Moderation returns non-passthrough verdicts
- [ ] Trust record auto-created for all existing users

---

## PHASE 1 — Feed Alive (Days 6–12)
**"A user who opens Loop sees content. Always."**

This is the most critical product milestone. Everything else depends on the feed not being empty.

### 1.1 — Regional Feed Cascade (Days 6–8)
**From:** Network Activation System 1 + System 7

```
Worker: GET /api/feed/regional
  → LCDA scope (3 results min)
  → LGA scope fallback
  → State scope fallback
  → National fallback
  → featured_rooms KV fallback
  → scheduled community_events fallback

Returns: { scope, rooms[], feed_level, label }

Frontend: feed.tsx
  → Replace ContentFeedEmpty with regional cascade result
  → Render feed_level label ("In Ojodu" / "Near Ikeja" / "Across Lagos")
  → Add explanation field rendering (ⓘ button)
```

**Owner:** Backend + Frontend Engineer
**Effort:** 3 days
**Risk:** Low-medium — requires community schema (Phase 0.2)

---

### 1.2 — Community Auto-Join at Onboarding (Days 7–9)
**From:** Network Activation System 2

```
In onboarding completion handler:
  → INSERT INTO community_members (community_id=state_community, user_id, invite_source='regional_auto')
  → INSERT INTO community_members (community_id=interest_communities[0..2], ...)
  → Store first_room_recommendation in KV: user_recommendations:{user_id}
  → Return recommendation in feed response for new users
```

**Owner:** Backend Engineer
**Effort:** 2 days
**Risk:** Low

---

### 1.3 — Category Chips Functional (Days 8–9)
**From:** Launch Blockers P0-006 + Retention Audit 2.2

```
In feed.tsx RegionScroller:
  → Add activeCategory state
  → On chip tap: setActiveCategory → re-fetch with ?category= param
  → Worker: add category WHERE clause to rooms query
  → Civic chip: WHERE is_civic = true (routes to Civic endpoint)
```

**Owner:** Frontend Engineer
**Effort:** 0.5 days
**Risk:** Low

---

### 1.4 — Momentum Score + Room Card (Days 9–11)
**From:** Network Activation System 3

```
Worker cron (every 60s):
  → Compute momentum_score for all live rooms
  → Write to KV: room_momentum:{room_id} (TTL 90s)

Room card:
  → Add speaker_count, audience_count to room card
  → Add momentum badge: 🔥 Hot / 📡 Growing / ● Live
  → Fix category emoji/gradient for all 8 categories (P1-003)

Feed query:
  → Read momentum scores from KV
  → Sort rooms by momentum_score DESC
```

**Owner:** Backend + Frontend Engineer
**Effort:** 2.5 days
**Risk:** Low

---

### 1.5 — Community Presence Layer (Days 10–12)
**From:** Network Activation System 4

```
Worker cron (every 60s):
  → Compute CommunityPresence for all active communities
  → Write to KV: community_presence:{community_id} (TTL 60s)

Community page header:
  → Render presence strip: members online / rooms live / newest members
  → Hide strip if members_online = 0 AND rooms_live = 0
```

**Owner:** Backend + Frontend Engineer
**Effort:** 2 days
**Risk:** Low

---

**Phase 1 exit criteria:**
- [ ] ContentFeedEmpty never shown as final state
- [ ] Feed label matches actual scope
- [ ] Category chips trigger real re-fetch
- [ ] Room cards show momentum badges
- [ ] Community presence strip renders for all active communities
- [ ] New user auto-joined to state + interest communities on onboarding completion

---

## PHASE 2 — Trust Baseline (Days 10–17)
**"Before Loop can grow, it must be safe to use."**

Runs partially parallel to Phase 1 (different engineers). Trust baseline gates public launch.

### 2.1 — Safety Reporting System (Days 10–13)
**From:** Trust Center System 3

```
Worker: POST /api/safety/report
  → Validate body (category required, subject required)
  → Rate limit: 5 reports per user per 24h
  → INSERT into safety_reports
  → Generate case ID: LSR-YYYYMM-NNNN
  → Trigger: priority-based notification to Trust Team channel
  → Return: { case_id, expected_review_hours }

Worker: GET /api/safety/reports
  → RLS enforced: reporter sees own cases only
  → Return cases with status, outcome, updated_at

Frontend:
  → "Report" option in room speaker long-press
  → "Report" in user profile menu
  → Report form sheet with category selection
  → Case confirmation screen: "Case LSR-202607-0082 received"
```

**Owner:** Backend + Frontend Engineer
**Effort:** 3 days
**Risk:** Low

---

### 2.2 — Account Deletion + Data Export (Days 11–14)
**From:** Trust Audit — NDPR compliance

```
Worker: DELETE /api/users/me
  → Soft delete: profiles.is_deleted = true
  → Schedule hard delete at +30 days
  → Anonymise content immediately (display_name → "Deleted User")
  → Send confirmation SMS
  → Return: { status: 'deletion_scheduled', effective_at }

Worker: POST /api/users/me/data-export
  → Async job: collect profile, rooms, communities, notifications
  → Bundle as ZIP
  → Deliver via email/SMS link within 48h
  → Link expires 7 days
```

**Owner:** Backend Engineer
**Effort:** 3 days
**Risk:** Medium — hard delete job must be tested carefully in staging

---

### 2.3 — Community Verification Auto-Upgrade (Days 12–13)
**From:** Trust Audit 2.2

```
Cron (daily):
  → SELECT users WHERE verification_status = 'none'
      AND account_age_days >= 30
      AND rooms_hosted >= 5
      AND trust_strikes.severity NOT IN ('major','critical') (last 90 days)
  → UPDATE profiles SET verification_status = 'community'
  → Notify: "You've earned Community verification ✓"
```

**Owner:** Backend Engineer
**Effort:** 1 day
**Risk:** Low

---

**Phase 2 exit criteria:**
- [ ] Safety report returns case ID within 500ms
- [ ] Account deletion functional end-to-end (soft → 30d grace → hard)
- [ ] Data export ZIP delivered within 48h
- [ ] Community verification auto-upgrade running
- [ ] Zero NDPR blockers remaining

---

## PHASE 3 — Retention Engine (Days 15–22)
**"Users who left come back."**

Depends on: Phase 1 (feed has content to notify about), Phase 0 (community schema for community notifications).

### 3.1 — Push Notification Infrastructure (Days 15–17)
**From:** Retention Audit 1.1

```
Frontend (onboarding, after interests step):
  → Request notification permission
  → Collect FCM token
  → POST /api/users/me/push-token

Schema:
  → profiles.push_token column (migration)
  → profiles.push_platform column ('ios'|'android'|'web')

Worker: POST /api/notify (internal)
  → Accept: { user_ids[], title, body, action_url }
  → INSERT into notifications table per user
  → Batch dispatch FCM push tokens
```

**Owner:** Frontend + Backend Engineer
**Effort:** 3 days
**Risk:** Medium — FCM integration requires server key secret, platform-specific handling

---

### 3.2 — Notification Triggers (Days 17–19)
**From:** Network Activation System 10 + Retention Audit 1.3

```
Trigger 1: Community live
  On POST /api/rooms (is_live = true):
  → GET community_members WHERE community_id = room.community_id
  → Batch notify all members: "[Community] just started a room: [Title]"

Trigger 2: Creator live
  On POST /api/rooms:
  → GET follows WHERE following_id = room.host_id
  → Batch notify all followers: "[Creator] just went live: [Title]"

Trigger 3: Trending room
  In trending cron (every 5min):
  → On LGA promotion threshold crossed:
  → Notify community members: "🔥 [Room] is trending in [LGA]"

Trigger 4: Civic alert
  On POST /api/civic/rooms:
  → Notify all users in room's region (by state_id/lga_id)
  → Exempt from rate limits
  → Priority: immediate FCM dispatch

Rate limiting: max 3 in-app per user per hour; civic exempt
```

**Owner:** Backend Engineer
**Effort:** 2.5 days
**Risk:** Medium — fan-out at scale needs chunked inserts (500 per batch)

---

### 3.3 — In-App Bell Panel (Days 17–18)
**From:** Retention Audit 1.2

```
Schema:
  notifications table (migration from trust-center plan)

Frontend:
  → Bell icon onClick: open slide-down notification panel
  → Subscribe to Supabase Realtime: notifications WHERE user_id = me AND NOT is_read
  → Unread badge count on bell icon
  → "Mark all read" action
  → Notification card links to action_url (room / community)
```

**Owner:** Frontend Engineer
**Effort:** 1.5 days
**Risk:** Low

---

### 3.4 — Creator Room Stats (Days 19–21)
**From:** Network Activation System 5 + Launch Blockers P0-002

```
Worker: GET /api/creators/:userId/rooms/:roomId/stats
  → peak_listeners from room_participants
  → total_unique from room_participants
  → avg_session_min from duration_seconds
  → retention_pct from duration > 300s
  → community_reach from promotion_audit_log
  → promotion_eligible: boolean
  → promotion_message: string

Post-room notification (10min after ended_at):
  "Your room just ended — 127 people from Ikeja heard you.
   You're eligible for LGA promotion."

Me tab:
  → Real room history (replace mock data — P1-004)
  → Tap room → per-room stats panel
```

**Owner:** Backend + Frontend Engineer
**Effort:** 3 days
**Risk:** Low — data exists in room_participants, needs querying

---

### 3.5 — Host Controls (Days 20–22)
**From:** Launch Blockers P0-002 + P0-003

```
room-launch.tsx:
  → if (user.id === room.host_id): render host control panel
  → Host panel: raised hand queue, speaker list, mute participant, end room
  → Raise hand button: onClick → POST /api/rooms/:id/event {type:'raise_hand'}
  → Host sees raised hands via Supabase Realtime subscription
  → Approve hand: POST /api/rooms/:id/approve-speaker {user_id}
  → End room: PATCH /api/rooms/:id {is_live: false, ended_at: now()}
```

**Owner:** Frontend + Backend Engineer
**Effort:** 3 days
**Risk:** Medium — requires Durable Object state for speaker role management

---

**Phase 3 exit criteria:**
- [ ] Push notification received on physical device within 10s of trigger
- [ ] Bell panel renders real notifications
- [ ] Rate limiting confirmed (max 3/hour, civic exempt)
- [ ] Creator stats delivered within 15min of room ending
- [ ] Host controls panel visible and functional for host only
- [ ] Raise hand end-to-end tested (listener → host queue → approve → speaker)
- [ ] Me tab shows real room history

---

## PHASE 4 — Promotion + Civic (Days 20–28)
**"The network has quality signals and safe civic content."**

Partially parallel to Phase 3.

### 4.1 — Promotion Engine V1 (Days 20–23)
**From:** Network Activation System 6

```
Cron (every 5min): compute trending
  → Score all live rooms using traction signals
  → Apply thresholds: T1 (Community ≥10), T2 (LGA ≥50), T3 (State ≥200)
  → Upsert community_trending table
  → Expire stale entries

API:
  → GET /api/trending/lga?region=NG-LA-IKJ → returns promoted rooms
  → GET /api/trending/state?region=NG-LA → returns state trending

Frontend:
  → LGA trending strip in regional discovery
  → State trending strip in discover tab
  → Promotion notification fires when room crosses LGA threshold
```

**Owner:** Backend + Frontend Engineer
**Effort:** 3 days
**Risk:** Medium — score formula complexity, anti-gaming rules

---

### 4.2 — Civic Separation Enforcement (Days 22–25)
**From:** Civic Layer Design + Trust Center

```
Worker:
  → GET /api/rooms enforces is_civic = false
  → GET /api/civic/rooms enforces is_civic = true
  → POST /api/rooms validates creator verification tier for civic rooms
  → Auto-expire triggers for Traffic (3h), Weather (6h), Emergency (12h)

Frontend:
  → Civic tab with sub-tabs: All / Emergency / Traffic / Community / Weather
  → Civic room card: distinct visual (red/amber), information block, verification badge
  → Civic rooms never appear in entertainment feed strips
  → Civic information card: creator tier, source URL, verification level, expiry countdown
```

**Owner:** Backend + Frontend Engineer
**Effort:** 3 days
**Risk:** Medium — requires correct is_civic flag propagation from communities

---

### 4.3 — Session Tracking + Growth Metrics (Days 23–26)
**From:** Network Activation System 9 + Retention Audit 4.1

```
Frontend:
  → useSessionTracker hook: navigator.sendBeacon on page unload
  → Session event: { duration_seconds, page, room_id? }

Worker: POST /api/analytics/session
  → Write to Cloudflare Analytics Engine

Scheduled aggregations:
  → DAU: COUNT DISTINCT user_ids last 24h
  → WAU/MAU: rolling windows
  → Stickiness: DAU/MAU
  → Active Communities: communities with rooms_live in last 24h
  → Listener Retention: room_participants with duration > 300s

Dashboard:
  → RALD Control Center → Loop → Network Growth
  → All 9 metrics rendered with sparklines
  → Activation thresholds displayed
```

**Owner:** Backend + Frontend Engineer
**Effort:** 3 days
**Risk:** Low

---

### 4.4 — Empty Room Prevention — Featured Rooms Floor (Days 24–25)
**From:** Network Activation System 7

```
KV key: featured_rooms (manually managed by Loop Ops)
  → Seeded with 10 permanent anchor rooms
  → Fallback when all cascade levels return 0 results

Cascade verified end-to-end:
  → LCDA → LGA → State → National → featured_rooms → scheduled_events
  → No user ever reaches ContentFeedEmpty
```

**Owner:** Backend + Ops
**Effort:** 1 day
**Risk:** Low

---

**Phase 4 exit criteria:**
- [ ] Promotion engine running in production with correct thresholds
- [ ] Civic tab fully separated (API + UI)
- [ ] All session metrics appearing in Growth Dashboard
- [ ] Stickiness ratio visible in dashboard
- [ ] Featured rooms floor verified — no empty feed in any scenario

---

## PHASE 5 — Trust Center + Transparency (Days 26–35)
**"Users can see what Loop is doing and why."**

This phase ships the user-facing trust surfaces built on the infrastructure from Phases 0–4.

### 5.1 — Trust Center UI Shell (Days 26–28)

```
Route: /trust (registered in App.tsx)
Sections: My Trust Profile / Community Guidelines / Contact Trust Team
  → Account standing widget (reads user_trust_records)
  → Strike history (reads trust_strikes)
  → Safety report history (reads safety_reports — own only)
  → Verification status card
```

**Owner:** Frontend Engineer | **Effort:** 3 days

---

### 5.2 — Moderation History Viewer (Days 27–29)

```
Strike card renders for each trust_strikes row:
  → What happened (plain language)
  → Rule cited (rule_id → rule text)
  → Review method (automated/human/escalated)
  → Outcome + trajectory warning
  → Appeal link (active for 14 days from strike date)
```

**Owner:** Frontend Engineer | **Effort:** 2 days

---

### 5.3 — Privacy Dashboard (Days 28–31)
**Requires:** Me tab mock data removed (from Phase 3.4)

```
GET /api/users/me/privacy-summary:
  → Data categories + counts + retention periods
  → Push token status with revoke option

Frontend:
  → "What we have" section (real data)
  → "What we don't have" section (architecture-verified)
  → Controls: Export / Delete / Opt-out AI / Contact privacy team
```

**Owner:** Backend + Frontend Engineer | **Effort:** 3 days

---

### 5.4 — Feed Explanation + Trending Transparency (Days 29–31)

```
API:
  → Feed endpoint adds explanation field to all rooms
  → Trending endpoint adds signal_breakdown to all trending entries

Frontend:
  → ⓘ button on room cards → "Why am I seeing this?" sheet
  → Trending badge tappable → signal breakdown panel
```

**Owner:** Backend + Frontend Engineer | **Effort:** 2 days

---

### 5.5 — Bug Reporting + Feature Request Board (Days 30–33)

```
Trust Center → Report a Bug:
  → Auto-captures context (version, route, errors)
  → Returns ticket ID

Trust Center → Suggest a Feature:
  → Feature board with vote counts
  → User can upvote / submit new

Error boundary:
  → "Report this bug" button on all error screens
```

**Owner:** Frontend + Backend Engineer | **Effort:** 3 days

---

### 5.6 — Transparency Snapshot (Days 32–35)

```
Monthly aggregation job:
  → Compute all metrics from trust + moderation tables
  → Write to transparency_snapshots table
  → Render in Trust Center with last-updated timestamp

trust.rald.cloud:
  → Add Loop-specific data section to H2 2026 report
```

**Owner:** Backend Engineer + CTO | **Effort:** 3 days

---

**Phase 5 exit criteria:**
- All 20 Trust Center smoke tests pass
- All 6 trust launch readiness gates pass
- Prohibited phrase check: 0 occurrences in CI

---

## Master Timeline

| Phase | Days | Engineering Focus | Key Deliverable |
|-------|------|------------------|----------------|
| Phase 0: Infrastructure | Days 1–5 | DB Engineer × 1, Backend × 1 | Zero USING(true), all schemas, moderation wired |
| Phase 1: Feed Alive | Days 6–12 | Backend × 1, Frontend × 1 | No empty feed. Community system live. |
| Phase 2: Trust Baseline | Days 10–17 | Backend × 1 (parallel) | Safety reporting, NDPR compliance |
| Phase 3: Retention | Days 15–22 | Backend × 1, Frontend × 1 | Push notifications, creator stats, host controls |
| Phase 4: Promotion + Civic | Days 20–28 | Backend × 1, Frontend × 1 | Promotion engine, civic separation, growth metrics |
| Phase 5: Trust Center | Days 26–35 | Frontend × 2, Backend × 1 | Full trust UI, transparency, privacy dashboard |

**Total: 35 engineering days with 2 engineers working in parallel**
**Minimum staffing: 2 engineers (1 backend-primary, 1 frontend-primary)**
**Recommended: 3 engineers for 24-day timeline**

---

## Network + Trust Launch Gates — Combined Readiness

Loop is ready for public launch when **all of the following are simultaneously true:**

### From Network Activation Sprint (7 gates):
- [ ] Gate 1: Regional feed cascade — no empty feed
- [ ] Gate 2: Community system — communities real, auto-join working
- [ ] Gate 3: Active rooms engine — momentum scores, raise hand end-to-end
- [ ] Gate 4: Retention infrastructure — push notifications delivered
- [ ] Gate 5: Civic separation — never mixed in API or UI
- [ ] Gate 6: Creator tools — host controls, creator stats
- [ ] Gate 7: Growth metrics — all 9 metrics populated

### From Trust & Transparency Sprint (6 gates):
- [ ] Gate 1: Security foundation — zero USING(true), moderation wired
- [ ] Gate 2: Trust schema — 8 tables in production
- [ ] Gate 3: Safety reporting — case ID, tracking, notifications
- [ ] Gate 4: NDPR compliance — deletion and export functional
- [ ] Gate 5: Trust Center UI — accessible, real data, all sections
- [ ] Gate 6: Transparency baseline — explanation fields, snapshot, civic cards

### Combined: 13 gates. All 13 must pass before public launch.

**Combined smoke test:** 20 network tests + 20 trust tests = 40-point pre-launch checklist.

---

## What This Sprint Does NOT Build

To preserve focus, the following are explicitly deferred:

| Deferred | Phase | Rationale |
|---------|-------|-----------|
| Audio SDK (LiveKit) | Parallel track | Separate team capacity; does not block any of these 20 systems |
| In-app messaging | Parallel track | Loop Messenger integration is its own sprint |
| National trending | Phase 2+ | Requires moderation capacity at national scale |
| Scheduling (advance rooms) | Month 2 | Community events exist in schema — UI deferred |
| Room replay / recordings | Month 2 | Requires audio vendor to be live first |
| Deep link / share | Month 2 | Acquisition surface — not retention surface |
| Journalist/Official verification application | Month 2 | Community tier is the P1 — higher tiers are P2 |
| AI summary of rooms | Month 3 | AI pipeline complexity — separate sprint |
| Government escalation protocol | Phase 3+ | Requires signed partnership agreements |

---

## First Demonstrable Milestone

**Day 12 — First alive state:**

After Phase 0 and Phase 1 complete, Loop should feel demonstrably different:
- A new user opens the app and sees live rooms from their region
- Category chips actually filter
- Room cards show speaker count and momentum badges
- Joining a community happens automatically
- The feed has a label showing why they see what they see

This is the state the founder reviews to confirm the sprint direction before Phases 2–5 are built.

**Day 17 — Safe to invite:**

After Phase 2 completes, Loop is legally and ethically launchable to a closed group:
- Users can report safety concerns
- Users can delete their accounts
- Safety actions have appeal paths
- NDPR Article 3.1(b) and 3.1(c) rights are fulfilled

**Day 35 — Public launch ready:**

All 13 gates pass. All 40 smoke tests pass. Loop is a living regional network with a trust layer that matches its ambition.

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
