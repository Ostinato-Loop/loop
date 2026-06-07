# PRODUCTION/network-launch-readiness.md
**Version:** 1.0 — Network Launch Readiness
**Date:** 2026-06-07
**Auditor:** CTO Office — LILCKY STUDIO LIMITED
**Scope:** V2 Network Activation Sprint — Production gate before network launch
**Prerequisite:** `PRODUCTION/loop-readiness-v3.md` (production score: 91/100 ✅)

---

## Overview

This document is the authoritative go/no-go checklist before Loop is declared open as a living regional network. It does not re-audit infrastructure already certified in `loop-readiness-v3.md`. It audits the ten activation systems defined in `FOUNDATION/network-activation-v1.md` and confirms they are operational in production.

**A product can be technically production-ready and still not be network-ready.** This checklist closes that gap.

---

## Current State Summary

| Layer | Production Status (pre-sprint) | Network Ready |
|-------|-------------------------------|--------------|
| Infrastructure | ✅ 91/100 certified | — |
| Authentication | ✅ JWT + RALD SSO working | — |
| Rooms (basic) | ⚠️ UI only — no audio | — |
| Feed | ❌ Empty — no cascade | — |
| Communities | ❌ Not built | — |
| Notifications | ❌ Not built | — |
| Creator stats | ❌ Not built | — |
| Civic layer | ❌ No tab separation | — |
| Growth metrics | ❌ Not tracked | — |
| Retention engine | ❌ Not built | — |

**Network readiness baseline: 2/10 systems operational.**

The sprint ships the remaining 8. This checklist verifies each one before network launch is declared.

---

## Gate Structure

Seven gates must pass before network launch is declared. Gates are sequential. A gate failure halts progression. No gate can be bypassed.

```
Gate 1: Feed Cascade ──────────────────────────── No user lands on empty feed
Gate 2: Community System ───────────────────────── Communities are real and alive
Gate 3: Active Rooms Engine ────────────────────── Rooms sorted by real activity
Gate 4: Retention Infrastructure ───────────────── Users can be notified and return
Gate 5: Civic Separation ───────────────────────── Civic and entertainment never mix
Gate 6: Creator Tools ──────────────────────────── Hosts can host and see their impact
Gate 7: Growth Metrics ─────────────────────────── Platform state is measurable
```

Each gate has: certification criteria, verification commands or queries, and the responsible party.

---

## Gate 1: Feed Cascade — No Empty Feed

**Owner:** Frontend + Backend Engineer  
**Goal:** Every user who opens Loop sees at minimum 3 live room cards or 3 scheduled rooms. No user ever sees `ContentFeedEmpty` as a final state.

### Certification Criteria

- [ ] `GET /api/feed/regional` returns `{ scope, rooms[], feed_level }` for all 4 cascade levels
- [ ] `rooms.length ≥ 3` for any scope where live rooms exist
- [ ] When no live rooms at any scope: `featured_rooms` KV key is populated with ≥ 5 rooms
- [ ] When no live rooms AND no featured_rooms: scheduled rooms from `community_events` returned
- [ ] `ContentFeedEmpty` component is no longer rendered unconditionally in `feed.tsx`
- [ ] Category chips (Civic, Music, Sports, etc.) trigger re-fetch with correct category filter
- [ ] Feed label shown to user matches actual scope: "In Ojodu" / "Near Ikeja" / "Across Lagos" / "Nigeria"

### Verification

```typescript
// Test 1: LCDA scope with live rooms
fetch('/api/feed/regional', {
  headers: { Authorization: `Bearer ${testToken}` }
}).then(r => r.json()).then(d => {
  assert(d.rooms.length >= 3);
  assert(d.feed_level === 'lcda' || d.feed_level === 'lga' || ...);
});

// Test 2: Empty LCDA — must cascade to LGA
// (wipe test user's LCDA rooms, confirm lga scope returned)

// Test 3: All empty — must return featured_rooms
// (confirm KV key `featured_rooms` is populated before network launch)
```

```sql
-- Verify featured_rooms are seeded
-- (check KV via Cloudflare dashboard → Workers → KV → namespace → featured_rooms key)
-- Must not be null or empty array
```

**Gate 1 Pass Criteria:** All 7 criteria met. Zero `ContentFeedEmpty` incidents in staging smoke test.

---

## Gate 2: Community System — Communities Are Real

**Owner:** Backend Engineer + Database Engineer  
**Goal:** Communities exist in the database, are seeded with regional data, and are surfaced in the product.

### Schema Readiness

- [ ] All 7 community tables created in production Supabase (communities, community_members, community_moderators, community_rules, community_events, community_announcements, community_trending)
- [ ] RLS enabled on all 7 tables (`rowsecurity = true`)
- [ ] Member count triggers active (test: INSERT into community_members → count increases)
- [ ] Regional communities seeded for all Phase 1 launch regions

```sql
-- Verify community count
SELECT type, COUNT(*) FROM communities WHERE is_system = true GROUP BY type;
-- Expected:
-- regional_state: 5 (Lagos, Kano, Abuja FCT, Rivers, Oyo)
-- regional_lga: ≥ 89 (sum of LGAs across 5 states)
-- regional_lcda: ≥ 37 (Lagos LCDAs alone)

-- Verify RLS
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('communities','community_members','community_trending')
  AND schemaname = 'public';
-- All: rowsecurity = true

-- Verify trigger
INSERT INTO community_members (community_id, user_id) VALUES (:test_community, :test_user);
SELECT member_count FROM communities WHERE id = :test_community;
-- member_count must be +1 from prior value
DELETE FROM community_members WHERE community_id = :test_community AND user_id = :test_user;
SELECT member_count FROM communities WHERE id = :test_community;
-- member_count must return to prior value
```

### Auto-Join Readiness

- [ ] New user onboarding auto-joins state community (INSERT into `community_members` at onboarding complete)
- [ ] New user onboarding auto-joins ≥ 1 interest community matching declared interests
- [ ] Auto-join is idempotent (duplicate INSERT does not error — ON CONFLICT DO NOTHING)
- [ ] First room recommendation stored in KV within 5 seconds of onboarding complete

### Community Presence Layer

- [ ] `community_presence:{community_id}` KV key computed by cron trigger
- [ ] `members_online` field reflects users with `last_active_at > now() - interval '15 minutes'`
- [ ] Presence strip renders in community header (members online, rooms live now, newest members)
- [ ] Presence strip hidden when `members_online = 0` AND `rooms_live_now = 0`

**Gate 2 Pass Criteria:** All schema checks pass. Seeded communities verified. Auto-join confirmed on test user onboarding flow.

---

## Gate 3: Active Rooms Engine — Rooms Sorted by Activity

**Owner:** Backend Engineer  
**Goal:** The feed shows rooms in order of real momentum, not creation time.

### Momentum Score Readiness

- [ ] Cron trigger (every 60s) computes momentum score for all live rooms
- [ ] Score stored in KV: `room_momentum:{room_id}`, TTL = 90s
- [ ] Score formula correctly weights: audience_count, speaker_count, raise_hand_count, join_rate, leave_rate, room_age
- [ ] Feed query reads from KV for ordering (not from `rooms.created_at`)
- [ ] Room card renders momentum badge for rooms scoring ≥ 10

### Room Card Readiness

- [ ] `speaker_count` visible on every live room card (e.g. "4 on stage")
- [ ] `audience_count` visible on every live room card (e.g. "127 listening")
- [ ] Momentum badge renders: 🔥 Hot (≥100), 📡 Growing (≥40), ● Live (≥10), no badge (<10)
- [ ] Category emoji and gradient correct for all 8 canonical categories (P1-003 from launch-blockers is resolved)
- [ ] Room card shows community name (not just room title alone)

### Raise Hand Flow (End-to-End)

- [ ] Raise hand button has `onClick` handler in `room-launch.tsx`
- [ ] Hand raise event: `POST /api/rooms/:id/event { type: 'raise_hand' }`
- [ ] Host receives real-time notification of raised hand (Supabase Realtime or DO broadcast)
- [ ] Host sees raised hand queue in host control panel
- [ ] Host can approve or reject — approved user transitions to speaker role
- [ ] Raise hand `momentum_score` contribution: 3.0× weight — confirmed in scoring formula

**Gate 3 Pass Criteria:** End-to-end raise hand verified with 2 test users (host + listener). Momentum scores visible in Cloudflare KV. Feed ordered by score, not creation time.

---

## Gate 4: Retention Infrastructure — Users Can Return

**Owner:** Frontend Engineer + Backend Engineer  
**Goal:** Loop can send notifications to users and users have a reason to return.

### Push Notification

- [ ] FCM token collected at end of onboarding (after interests step)
- [ ] FCM token stored in `profiles.push_token` column
- [ ] FCM dispatch from Worker: `POST https://fcm.googleapis.com/v1/projects/{id}/messages:send`
- [ ] Test push sent to staging device and received within 10 seconds
- [ ] `notifications` Supabase table exists with schema from `AUDIT/retention-readiness.md`
- [ ] Bell icon in `feed.tsx` opens notification panel (slide-down sheet)
- [ ] Unread notification count badge visible on bell icon

### Notification Triggers

- [ ] Community live trigger fires: room created in joined community → INSERT into `notifications` for all members → FCM push batch dispatched
- [ ] Creator live trigger fires: room created by followed host → INSERT into `notifications` for all followers → FCM push dispatched
- [ ] Trending trigger fires: room reaches LGA trending → community members notified
- [ ] Civic alert trigger fires: civic room created → all users in region notified (exempt from rate limits)
- [ ] Rate limiting applied: max 3 in-app notifications per user per hour (except civic emergency)

### Notification Delivery Test

```typescript
// Integration test: community live trigger
await createRoom(testHostToken, { community_id: testCommunityId, is_live: true });
await sleep(5000); // allow trigger to fire
const notifications = await getNotifications(testMemberToken);
assert(notifications.some(n =>
  n.type === 'community_live' &&
  n.action_url.includes('/rooms/')
));
```

**Gate 4 Pass Criteria:** Push notification received on physical device within 10s of trigger event. In-app bell panel renders notifications. Rate limiting confirmed in staging.

---

## Gate 5: Civic Separation — Civic and Entertainment Never Mix

**Owner:** Frontend Engineer + Backend Engineer  
**Goal:** Civic content is always visually distinct and never appears in entertainment feeds. Entertainment never appears in the Civic tab.

### Civic Tab Readiness

- [ ] Civic tab (or Civic sub-navigation) exists as a distinct surface from the entertainment feed
- [ ] Civic tab renders rooms where `is_civic = true` ONLY
- [ ] Civic sub-tabs: Emergency, Traffic, Weather, Notices, Town Hall — all rendered
- [ ] Emergency rooms pinned to top of Civic tab regardless of creation time
- [ ] Civic rooms sorted by `urgency_level`, NOT `traction_score`
- [ ] Civic room card uses distinct visual design (red/amber — not entertainment gradient)

### Separation Enforcement

- [ ] `GET /api/feed/regional` returns rooms WHERE `is_civic = false` (entertainment query)
- [ ] `GET /api/civic/rooms` returns rooms WHERE `is_civic = true` ONLY
- [ ] SQL-level separation confirmed — no `OR is_civic` in entertainment queries

```sql
-- Verify: entertainment feed contains zero civic rooms
EXPLAIN ANALYZE
SELECT id, title, is_civic FROM rooms
WHERE is_live = true
  AND is_civic = false  -- entertainment query must have this constraint
ORDER BY created_at DESC LIMIT 20;
-- Verify: is_civic = false in query plan

-- Verify: civic query returns only civic
SELECT COUNT(*) FROM rooms WHERE is_live = true AND is_civic = false AND id IN (
  SELECT id FROM rooms WHERE is_live = true -- simulates civic API
);
-- Must be 0 (no entertainment rooms in civic result set)
```

- [ ] Momentum badges do NOT appear on civic room cards
- [ ] Civic alerts carry urgency icon (🚨 Emergency, 🚦 Traffic, 🌧️ Weather) not entertainment emoji

**Gate 5 Pass Criteria:** Manual QA test with 1 civic room + 1 entertainment room confirms separation in both API responses and UI rendering. Zero mixing incidents in 24-hour staging run.

---

## Gate 6: Creator Tools — Hosts Can Host and Measure

**Owner:** Frontend Engineer + Backend Engineer  
**Goal:** A room host has controls to manage their room and receives meaningful stats after the room ends.

### Host Control Panel

- [ ] `room-launch.tsx` detects `user.id === room.host_id` and renders host panel
- [ ] Host panel shows: raised hand queue, speaker list, listener count, room duration
- [ ] Host can: approve raised hand → speaker joins stage, reject raised hand, mute speaker, end room
- [ ] Listener UI does NOT show host controls (separation verified)
- [ ] Host-only "End Room" button sends `PATCH /api/rooms/:id { is_live: false, ended_at: now() }`

### Creator Room Stats

- [ ] `GET /api/creators/:userId/rooms/:roomId/stats` returns: peak_listeners, total_unique, avg_session_min, retention_pct, community_reach, promotion_eligible, promotion_message
- [ ] Post-room notification fires to host 10 minutes after `ended_at`
- [ ] Notification body includes: total listeners, community reach level, promotion eligibility
- [ ] Me tab (`me.tsx`) shows real room history (from `rooms` table, not mock data)
- [ ] Room history items are tappable → show per-room stats panel

### Creator Discovery Profile

- [ ] Host profile card in room shows: rooms_hosted, avg_listeners, verification badge (if applicable)
- [ ] Host can be followed from inside the room (not only from profile page)
- [ ] Follow action fires notification subscription (new follower → host gets in-app notification)

**Gate 6 Pass Criteria:** Host control panel tested with 2 accounts. Stats delivery confirmed on test room end. Mock data removed from Me tab.

---

## Gate 7: Growth Metrics — Platform State Is Measurable

**Owner:** Backend Engineer + CTO  
**Goal:** The Community Growth Dashboard shows real data. All 9 platform-level metrics are populated.

### Metric Collection Readiness

- [ ] DAU computed: distinct user_ids with `last_active_at > now() - interval '24h'`
- [ ] WAU/MAU computed: rolling 7-day and 30-day windows
- [ ] Stickiness (DAU/MAU) calculated and displayed
- [ ] Active Communities count: `communities WHERE active_room_count > 0 IN last 24h`
- [ ] Active Rooms: cron-sampled hourly count of `rooms WHERE is_live = true`
- [ ] Avg Session Length: `sendBeacon` events processed by Worker and aggregated
- [ ] Listener Retention: `room_participants.duration_seconds` > 300 (5 min) as %, queried daily
- [ ] Regional Spread: count of distinct `state_id` values in DAU set
- [ ] Creator Return Rate: hosts who created ≥ 2 rooms in last 7 days / total hosts last 7 days

### Dashboard Readiness

- [ ] Growth Dashboard accessible at RALD Control Center → Loop → Network Growth
- [ ] Dashboard shows current values for all 9 metrics
- [ ] Dashboard shows 7-day sparkline for DAU, Active Communities, Active Rooms
- [ ] Dashboard shows network launch threshold markers (red line at target values)
- [ ] Dashboard auto-refreshes every 60 minutes (not real-time — acceptable for growth metrics)

### Activation Threshold Display

The dashboard must display the network activation thresholds prominently:

```
DAU           [ ██░░░░░░░░ ] 47/500 (9.4%)
Stickiness    [ █░░░░░░░░░ ] 0.06/0.15
Active Comms  [ ███░░░░░░░ ] 6/20
Avg Session   [ █████░░░░░ ] 3.2/5 min
Listener Ret  [ ████░░░░░░ ] 28%/35%
```

**Gate 7 Pass Criteria:** All 9 metrics populated with real data in staging. Dashboard renders correctly in RALD Control Center. Zero metrics showing "N/A" or "—" at network launch time.

---

## Network Launch Declaration Criteria

Loop's network launch is declared — and the product transitions from "platform" to "living regional network" — when:

### Activation Thresholds (all must be met simultaneously)

| Metric | Launch Threshold | Measurement |
|--------|-----------------|-------------|
| DAU | ≥ 500 | Trailing 7-day average |
| Stickiness (DAU/MAU) | ≥ 0.15 | Trailing 14-day |
| Active Communities | ≥ 20 (across ≥ 2 states) | Any given day |
| Active Rooms (daily peak) | ≥ 10 | Any given day |
| Avg Session Length | ≥ 5 minutes | Trailing 7-day |
| Listener Retention | ≥ 35% | Trailing 7-day |
| Creator Return Rate | ≥ 40% | Trailing 14-day |
| Empty Feed Incidents | 0 | Any 7-day window |
| Civic/Entertainment Mixing Incidents | 0 | Any 7-day window |

### Gate Checklist Summary

| Gate | Status | Owner | ETA |
|------|--------|-------|-----|
| Gate 1: Feed Cascade | ❌ Not started | Frontend + Backend | TBD |
| Gate 2: Community System | ❌ Not started | Backend + DB | TBD |
| Gate 3: Active Rooms Engine | ❌ Not started | Backend | TBD |
| Gate 4: Retention Infrastructure | ❌ Not started | Frontend + Backend | TBD |
| Gate 5: Civic Separation | ❌ Not started | Frontend + Backend | TBD |
| Gate 6: Creator Tools | ❌ Not started | Frontend + Backend | TBD |
| Gate 7: Growth Metrics | ❌ Not started | Backend + CTO | TBD |

**Total gates open:** 7/7  
**Production score:** 91/100 (infrastructure — maintained)  
**Network readiness score:** 0/7 gates passed

---

## Rollback Policy

If any gate fails after partial deployment:

### Feed Cascade Rollback
- Revert `feed.tsx` to previous version (Cloudflare Pages rollback — 2 minutes)
- `ContentFeedEmpty` is restored — acceptable regression in emergency

### Community System Rollback
- Drop community tables (schema rollback SQL in `PRODUCTION/community-launch-readiness.md`)
- Only safe before any user community data is written
- After user data exists: rollback requires migration plan — escalate to CTO

### Notification System Rollback
- Delete `notifications` table
- FCM tokens in `profiles.push_token` remain (no data loss — reactivate later)
- Bell icon reverts to no-op

### Civic Separation Rollback
- Revert API query: remove `is_civic` filter
- Civic rooms would temporarily appear in entertainment feed — acceptable for < 1 hour emergency rollback

---

## Pre-Launch Smoke Test Checklist

Run this on staging 48 hours before network launch declaration.

```
[ ] 1. Create new test user → complete onboarding → confirm auto-joined to state community
[ ] 2. Confirm first room recommendation appears on feed immediately after onboarding
[ ] 3. Open Feed → confirm regional cascade: label matches user region
[ ] 4. Tap "Civic" chip → confirm only is_civic rooms shown
[ ] 5. Tap "Music" chip → confirm only music/dj-session/radio rooms shown
[ ] 6. Open a live room as listener → see speaker count and audience count
[ ] 7. Tap "Raise Hand" → host receives notification in raised hand queue
[ ] 8. Host approves hand raise → listener transitions to speaker role
[ ] 9. Host ends room → post-room notification fires to host within 15 minutes
[ ] 10. Check Me tab → room history shows real room with real stats (not mock data)
[ ] 11. Confirm bell icon opens notification panel
[ ] 12. Send test push notification to staging device → received within 10 seconds
[ ] 13. Check Growth Dashboard → all 9 metrics populated
[ ] 14. Confirm civic room card uses red/amber design, not entertainment gradient
[ ] 15. Confirm no civic room appears in Feed (entertainment) queries
[ ] 16. Wipe featured_rooms KV key → confirm feed falls back to scheduled rooms (not empty)
[ ] 17. Stickiness ratio visible in Growth Dashboard
[ ] 18. Pull-to-refresh on Feed → list refreshes
[ ] 19. Return to app after 2+ hours → feed shows "while you were away" return context
[ ] 20. Creator Discovery profile visible inside room → follow button works
```

**All 20 checks must pass. No exceptions. No deferrals.**

---

## After Network Launch

Network launch is not the end. It is the beginning of the growth cycle. After declaration:

| Week | Focus |
|------|-------|
| Week 1–2 | Creator seeding in Phase 1 LCDAs (10–20 creators per LCDA) |
| Week 2–4 | Community event seeding (5 events per LCDA — see growth model) |
| Month 1 | Monitor stickiness daily. If DAU/MAU drops below 0.10 → creator retention intervention |
| Month 2 | Expand to second LCDA set when all Phase 1 LCDAs at Stage 2 |
| Month 3 | Review National Trending readiness — requires moderation capacity |
| Month 6 | Phase 2 states: Kano + Abuja activation |

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
