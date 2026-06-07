# AUDIT/retention-readiness.md
**Version:** 1.0 — Retention Readiness Audit
**Date:** 2026-06-07
**Auditor:** CTO Office — LILCKY STUDIO LIMITED
**Scope:** V2 Network Activation Sprint — Retention infrastructure audit
**Method:** Evidence-based. Every finding cites the specific file, component, or table. No assumptions.

---

## Verdict

**Loop has no retention infrastructure today.**

A user who has a good first session has no mechanism to return. There are no push notifications. The bell icon does nothing. The feed on return visit is identical to the first visit — empty. No creator follow-through. No community memory. No personalisation.

Retention is not a product feature that is partially built. It is entirely absent. This audit enumerates what is missing, what exists that can be activated, and what must be built before network launch.

---

## Retention Scorecard

| Retention Mechanism | Status | Evidence |
|---------------------|--------|----------|
| Push notification registration | ❌ Not implemented | No FCM/APNs token registration in onboarding |
| In-app notification panel | ❌ Not implemented | Bell icon: `aria-label="Notifications"`, no onClick |
| Notification triggers | ❌ Not implemented | No `notifications` table in schema |
| Creator follow → notify on live | ❌ Not implemented | Follow data exists, no event fired on room create |
| Community live → notify members | ❌ Not implemented | No trigger on room creation for community members |
| Trending room alert | ❌ Not implemented | No notification on promotion milestone |
| Civic emergency alert | ❌ Not implemented | No civic alert dispatch system |
| Interest-based feed personalisation | ❌ Dead data | Interests stored at onboarding, never used in queries |
| Return visit feed context | ❌ Not implemented | Feed is identical for all users at all times |
| Creator stats (post-room) | ❌ Not implemented | No stats surfaced to host after room ends |
| Session length tracking | ❌ Not implemented | No client-side session event firing |
| Community memory ("you were here") | ❌ Not implemented | No last_visited_at or community activity summary |
| Scheduled room reminders | ❌ Not implemented | Events exist in schema, no reminder dispatch |
| "People you know joined X" | ❌ Not implemented | No social graph notification |

**Retention score: 0/14 mechanisms operational**

---

## Section 1 — Notification Infrastructure

### 1.1 Push Notification Registration

**Finding: No push token collected. No push notification is deliverable.**

Search results in `artifacts/loop/src/`:
- No `firebase-messaging` import
- No `getToken()` call from Firebase Messaging SDK
- No `serviceWorker` registration for push
- No APNs token collection
- No `notifications` permission request

**Evidence:** `artifacts/loop/src/hooks/use-auth.tsx` — handles auth state, no push token step.  
`artifacts/loop/src/App.tsx` — no notification permission request at app mount.

**Impact:** Loop cannot send push notifications to any user, on any device, for any event. This is the single most critical retention infrastructure gap.

**Fix (V1 — minimum viable push):**
1. Add Firebase Messaging to `artifacts/loop` (`firebase/messaging`)
2. Register service worker in `public/firebase-messaging-sw.js`
3. Request notification permission at the end of onboarding (after interests step)
4. Store FCM token in `profiles.push_token` column (add migration)
5. Dispatch from Cloudflare Worker via FCM HTTP v1 API on trigger events

**Note:** No new infrastructure. Firebase Messaging SDK + FCM HTTP v1 is a free-tier service. Uses existing Cloudflare Worker as the dispatch agent.

---

### 1.2 In-App Notification Panel

**Finding: Bell icon renders with no handler. No notifications table exists.**

**Evidence:**
```tsx
// feed.tsx
<button aria-label="Notifications">
  <Bell className="h-5 w-5" />
</button>
// No onClick. No badge. No panel.
```

No `notifications` table found in Supabase schema migrations (`supabase/migrations/`).

**Fix (V1):**

```sql
-- Migration: notifications table
CREATE TABLE notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL CHECK (type IN (
                                'community_live', 'creator_live',
                                'trending_room', 'civic_alert',
                                'room_invite', 'system'
                              )),
  title           TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  action_url      TEXT,       -- deep link: /rooms/:id or /communities/:id
  is_read         BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE NOT is_read;
```

Bell icon `onClick` opens a slide-down sheet subscribing to Supabase Realtime on `notifications WHERE user_id = current_user AND NOT is_read`.

---

### 1.3 Notification Trigger Events

**Finding: No trigger events fire on room creation, community activity, or trending promotion.**

**Evidence:**
- Cloudflare Worker `src/routes/rooms.ts` — no notification dispatch in POST /rooms handler
- No Supabase database trigger on `rooms` table for `is_live = true` events
- No Supabase Edge Function for notification fan-out

**Required triggers (V1):**

| Event | Trigger Location | Fan-out target |
|-------|-----------------|----------------|
| Room created (`is_live = true`) | Cloudflare Worker POST /rooms | All members of room's community |
| Room created by followed creator | Cloudflare Worker POST /rooms | All followers of host |
| Room reaches LGA trending | Trending cron trigger | All members of promoted community |
| Civic alert room created | Cloudflare Worker POST /civic/rooms | All users in room's region |

**Fan-out strategy:**

Direct fan-out to `notifications` table (INSERT per user) is acceptable at V1 scale (< 10,000 members per community). At Stage 4+ communities, switch to queue-based fan-out using RALD Event Bus.

```typescript
// Worker: dispatch community notification
async function notifyCommunityMembers(
  env: Env,
  community_id: string,
  notification: NotificationPayload
) {
  // Insert into notifications table via Supabase service role
  const members = await getCommunityMemberIds(env, community_id);
  const inserts = members.map(user_id => ({
    user_id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    action_url: notification.action_url,
  }));
  await batchInsertNotifications(env, inserts); // chunked: 500 per insert
  // Then dispatch FCM push to all stored push_tokens
  await dispatchPushBatch(env, members, notification);
}
```

---

## Section 2 — Interest Personalisation

### 2.1 Onboarding Interest Data (Collected, Never Used)

**Finding: Interest data is stored but never read by any feed, discover, or room query.**

**Evidence:**
```typescript
// onboarding.tsx — interest tags stored correctly
const { error } = await supabase
  .from('profiles')
  .update({ interests: selectedInterests })
  .eq('id', user.id);
```

```typescript
// feed.tsx — no profile.interests read
const { data: rooms } = await supabase
  .from('rooms')
  .select('*')
  .eq('is_live', true)
  .order('created_at', { ascending: false });
// No WHERE clause on category, tags, or interests
```

**Impact:** Every user sees the same feed regardless of declared interests. A user who selected "Football" and "Politics" sees the same rooms as a user who selected "Gospel" and "Tech." Personalisation is a false promise.

**Fix (V1 — minimum viable personalisation):**

```typescript
// Worker: GET /api/feed/regional — add interest boost
// After regional cascade resolves rooms, re-rank by interest match:
function applyInterestBoost(rooms: Room[], userInterests: string[]): Room[] {
  return rooms
    .map(room => ({
      ...room,
      interest_score: room.tags?.filter(t => userInterests.includes(t)).length ?? 0,
    }))
    .sort((a, b) =>
      (b.momentum_score + b.interest_score * 10) -
      (a.momentum_score + a.interest_score * 10)
    );
}
```

This re-ranks rooms within the regional cascade result. Interest-matched rooms float to the top. Non-matching rooms remain visible. No rooms are hidden.

---

### 2.2 Category Chips — Non-Functional

**Finding: Tapping "Music," "Civic," "Sports" etc. changes visual state only. Room list does not change.**

**Evidence:**
```tsx
// feed.tsx RegionScroller
const tabs = ["For you", "Africa", "Civic", "Music", "Sports", "Campus", "Tech", "Business"];
// No activeTab state. No re-fetch on tap.
```

**Fix (V1):**

```tsx
const [activeCategory, setActiveCategory] = useState<string>("for_you");

// On chip tap:
setActiveCategory(normaliseCategory(tab)); // "Music" → "music"

// Feed query includes:
const categoryFilter = activeCategory === "for_you" ? null : activeCategory;
```

The category filter is passed to the Worker `/api/feed/regional?category=music` and added to the rooms WHERE clause.

**Category mapping:**

| Chip label | rooms.category |
|-----------|----------------|
| For you | null (no filter) |
| Civic | `is_civic = true` |
| Music | `category IN ('music','dj-session','radio')` |
| Sports | `category = 'sports'` |
| Business | `category = 'business'` |
| Campus | `category = 'education'` |
| Tech | `tags @> '{tech}'` |

---

## Section 3 — Creator Retention

### 3.1 Creator Has No Signal to Return

**Finding: Room hosts receive zero information about the impact of their rooms. There is no room stats view anywhere in the product.**

**Evidence:**
- `me-launch.tsx` — profile page shows mock data, no real room history
- No `/api/rooms/:id/stats` endpoint in Worker routes
- No post-room notification to host
- `room_participants` table exists (tracks joins) but is never queried for analytics

**Impact:** A creator who hosts a room has no idea if 5 people listened or 500 people listened. They have no reason to believe Loop is working. They will not return.

**Fix (V1 — 3 steps):**

**Step 1:** Add `/api/creators/:userId/rooms/:roomId/stats` endpoint:
```typescript
// Returns: peak_listeners, total_unique, avg_session_min, retention_pct, community_reach
```

**Step 2:** Trigger post-room notification to host 10 minutes after `ended_at`:
```
"Your room just ended — 127 people from Ikeja heard you. You're eligible for LGA promotion."
```

**Step 3:** Wire `me.tsx` (Me tab) to show real room history with per-room stats.

---

### 3.2 Host and Listener UI Are Identical

**Finding: The room host cannot manage their room. No host controls exist.**

**Evidence (from AUDIT/loop-v2-launch-blockers.md P0-002):**

`room-launch.tsx` has no `if (user.id === room.host_id)` conditional anywhere.
There is no speaker queue. No mute-participant control. No hand-raise visibility.

**Impact on retention:** A host who joins their own room and sees no controls, watches a disruptive participant, and cannot moderate — will not host again. Creator retention cannot exist without host controls.

**Fix:** Implement host control panel in `room-launch.tsx`. This is a retention fix, not a product feature:
- Raised hand queue (visible to host only)
- Approve / reject speaker button
- Mute participant button
- End room button

---

## Section 4 — Session Behaviour

### 4.1 No Session Length Measurement

**Finding: No client-side session timing events are fired. Session length cannot be measured.**

**Evidence:** No `analytics` import in any page component. No `performance.now()` or `Date.now()` timing in room pages. No session_start/session_end events fired to any analytics endpoint.

**Impact:** The core growth metric — average session length — is unmeasurable. The Community Growth Dashboard (`FOUNDATION/community-growth-model.md`) cannot be populated.

**Fix (V1 — minimum viable session tracking):**

```typescript
// hooks/use-session-tracker.ts
export function useSessionTracker() {
  const sessionStart = useRef(Date.now());

  useEffect(() => {
    return () => {
      const duration_seconds = Math.round((Date.now() - sessionStart.current) / 1000);
      navigator.sendBeacon('/api/analytics/session', JSON.stringify({
        duration_seconds,
        page: window.location.pathname,
      }));
    };
  }, []);
}
```

`sendBeacon` fires on page unload without blocking navigation. Data is received by the Worker `/api/analytics/session` endpoint and written to Cloudflare Analytics Engine.

---

### 4.2 No Pull-to-Refresh

**Finding: Room lists and feeds are fetched once on mount. No pull-to-refresh gesture exists on any feed page.**

**Evidence:** No `usePullToRefresh` hook, no `onRefresh` prop on ScrollArea in `feed.tsx` or `discover.tsx`.

**Impact on retention:** A user who returns to the app and pulls down on the feed to check for new rooms finds nothing — the list is stale from their last visit. They assume Loop has no new activity and close the app.

**Fix:** Add pull-to-refresh to Feed and Discover pages. On pull: re-fire the regional cascade query and update the list.

---

## Section 5 — The Empty Return Problem

### 5.1 Return Visit Is Identical to First Visit

**Finding: Loop has no state that makes a returning user's experience different from a first-time user's.**

**Evidence:**
- No `last_visited_at` tracking per community
- No "since you were last here" query
- No personalised greeting on return
- No "X new rooms in your community since yesterday"

**This is the #1 retention killer.** The second session must feel different from the first. It must acknowledge:
1. That the user was here before
2. What happened in their community while they were away
3. Who else joined or went live

**Fix (V1 — minimum viable return context):**

```typescript
// Worker: GET /api/feed/return-context
// Returns:
type ReturnContext = {
  new_rooms_since_last_visit: number;
  community_updates: Array<{
    community_name: string;
    new_members: number;
    rooms_since_last_visit: number;
  }>;
  top_room_missed: Room | null;  // highest-traction room while user was away
};
```

Rendered on feed as: "Welcome back — while you were away, Ojodu had 3 new rooms and 12 new members joined."

---

## Section 6 — Retention Readiness Gaps — Ranked

| Priority | Gap | Blocks | Effort |
|----------|-----|--------|--------|
| P0 | Push notification registration | All notification retention | 2 days |
| P0 | `notifications` table + bell panel | In-app notification | 1 day |
| P0 | Community/creator notification triggers | Return via notification | 2 days |
| P0 | Creator post-room stats | Creator retention | 1 day |
| P1 | Interest personalisation in feed | Session satisfaction | 1 day |
| P1 | Category chip filter functional | Discovery satisfaction | 4 hours |
| P1 | Host controls (raise hand, mute, end room) | Creator retention | 3 days |
| P1 | Session length tracking | Metrics infrastructure | 4 hours |
| P1 | Pull-to-refresh on Feed + Discover | Return UX | 4 hours |
| P2 | Return context ("since you were away") | Second-session hook | 2 days |
| P2 | Community memory (last_visited_at) | Personalisation | 1 day |
| P2 | Scheduled room reminders | Habit formation | 2 days |
| P2 | Social graph notifications ("X joined") | Social pull | 3 days |

**Total V1 retention build estimate:** 10–14 engineering days

---

## Section 7 — What Can Be Activated Now (No New Build Required)

These are retention mechanisms already partially wired but not activated:

| Mechanism | Current State | Activation Step |
|-----------|--------------|-----------------|
| Follow graph exists | `follows` table is populated | Wire Creator Live notification — triggers already have the data |
| Room participants table | `room_participants` tracks joins/leaves | Query it for stats — endpoint is missing, not the data |
| Community members table | Defined in V2 schema | Auto-join on onboarding is one INSERT statement |
| Interests in profiles | Stored at onboarding | Add `tags && interests` filter to rooms query |
| community_events table | Defined in schema | Surface in Discover → Events tab — the data model is ready |

These five do not require new infrastructure. They require wiring existing data to existing or missing UI endpoints.

---

## Certification Criteria — Retention Ready

Retention readiness is declared when:

- [ ] Push notification deliverable to ≥ 80% of registered users (FCM token stored)
- [ ] In-app bell panel renders real notifications with unread badge
- [ ] Community live notification fires within 60 seconds of room creation
- [ ] Creator live notification fires within 60 seconds of room creation
- [ ] Post-room stats delivered to host within 15 minutes of room ending
- [ ] Interest personalisation changes visible feed order for users with interests set
- [ ] Category chips trigger real API re-fetch and update room list
- [ ] Session length tracked and appearing in Growth Dashboard
- [ ] Feed pull-to-refresh functional on Feed and Discover
- [ ] Zero empty-feed incidents on return visit (cascade tested and deployed)

**Current certification:** 0/10 criteria met.

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
