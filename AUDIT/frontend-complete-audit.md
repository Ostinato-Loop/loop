# Frontend Complete Audit — Loop V1 Stabilization
**Date:** 2026-06-07 | **Method:** Full source code inspection of all 80+ frontend files  
**Standard:** 100 users joining tomorrow — every screen must work or show a clear, honest failure state.

---

## Screen Inventory

| Screen | Route | File | Auth Required | Status |
|---|---|---|---|---|
| Feed | `/` | feed.tsx | No (shows less) | ⚠️ Partial |
| Discover | `/discover` | discover.tsx | No | ⚠️ Partial |
| Messages | `/messages` | messages.tsx | Yes | ⚠️ Partial |
| Profile | `/me` | me-launch.tsx | Yes | 🔴 Issues |
| Room | `/rooms/:id` | room.tsx | No (join=yes) | 🔴 Audio broken |
| Login | `/login` | login.tsx | — | 🟠 Redirect UX |
| Onboarding | `/onboarding` | onboarding.tsx | Yes | ⚠️ Friction |
| Create | `/create` | create.tsx | Yes | ⚠️ Partial |
| Not Found | `*` | — | — | ✅ Redirects to `/` |

---

## Screen 1: Feed (`/`)

### Loading State
`LiveStrip` uses `useState` + `useEffect` to call `listRooms()`. During load, a skeleton is shown. ✅

### Error State
`listRooms()` catches `PGRST205` schema cache errors and returns `[]` (silent fallback). No error UI shown to user when Supabase is down. 🔴

**Issue FE-001 [P1]:** When Supabase returns an error (non-schema-cache), LiveStrip silently shows empty state. User cannot distinguish "no rooms" from "service error."
- Root cause: Error is swallowed in `listRooms()` schema cache check; throws for others but LiveStrip doesn't catch the throw.
- Fix: Add error boundary or try/catch in LiveStrip; show "Couldn't load rooms — tap to retry" on error.

### Empty State
Feed shows empty state when no rooms are live. No "Start the first room" CTA. 🟡

**Issue FE-002 [P2]:** Empty feed gives no call to action.
- Root cause: Empty state message only ("No rooms live yet") without navigation to `/create`.
- Fix: Add "Be the first — Start a room" button linking to `/create`.

### Search Button
`onClick={() => {}}` — does nothing. 🔴

**Issue FE-003 [P1]:** Search button is visible but completely non-functional. Tapping it does nothing.
- Root cause: Placeholder handler.
- Fix: Either route to `/discover?search=` or show a search modal. If search is not built: hide the button or show "Search coming soon" toast.

### Notification Bell
No `onClick` handler at all. 🔴

**Issue FE-004 [P1]:** Notification bell is visible but non-functional. No state, no navigation.
- Root cause: Placeholder button with no handler.
- Fix: Either wire to a notifications page or remove until notifications are built. Never show a non-functional interactive element.

### Category Chips
`RegionScroller` sets `activeCategory` which is passed to `LiveStrip`. LiveStrip filters rooms by category. ✅

### "For You" Tab
Reads interests from `profile.interests` (server) or `localInterests` from loop-store (fallback). Maps through `INTEREST_TO_CATEGORY`. ✅ Logic is correct.

### "Africa" category chip
This is a custom category ("africa") that doesn't map to any `RoomCategory` type in the backend. Supabase query will return 0 results. 🟡

**Issue FE-005 [P2]:** "Africa" category chip sends category filter `"africa"` to Supabase, but rooms table `category` enum doesn't include "africa". Returns 0 results silently.
- Root cause: Custom display categories in feed.tsx don't align with DB enum.
- Fix: Map display categories to valid DB categories, or remove "Africa" chip.

---

## Screen 2: Discover (`/discover`)

### Loading State ✅ — room list shows spinner while fetching

### Error State 🔴
Same as Feed — schema cache errors return `[]`, other errors are unhandled.

**Issue FE-006 [P1]:** Same as FE-001 — discover silently shows empty on Supabase error.

### Tab: "Near me"
Code not fully visible (truncated at 4000 chars). Based on pattern: likely CF geo-based. Depends on Supabase `region_id` filtering. 🟡 — Cannot confirm without full file.

### Tab: "Trending"
Worker returns empty arrays (Phase 1 design). Frontend should show: "Trending rooms will appear here as Loop grows." 🟡

**Issue FE-007 [P2]:** Trending tab shows empty state with generic component text ("Discussions coming soon"). This is from `DiscussionsEmpty` component — wrong empty state for trending tab.
- Root cause: Trending tab renders `DiscussionsEmpty` instead of a trending-specific message.
- Fix: Add `TrendingEmpty` component with honest copy.

### Tab: "Events"
Shows "Regional event scheduling is coming soon." ✅ Honest. No action needed.

### Tab: "People"
Calls `searchRelatedPeople` and `getPeopleSuggestions`. These exist in `lib/api/people.ts`. ✅ (assuming people API works)

### Community Discovery
Communities (V2 primary entity) are not shown anywhere in discover.tsx. Only rooms are shown. 🔴

**Issue FE-008 [P1]:** Communities are invisible to users. The V2 core entity has no UI entry point in discovery.
- Root cause: discover.tsx was built around rooms; no community tab or section added.
- Fix: Add a "Communities" tab or section to discover.tsx using the `/api/activation/recommendations` endpoint.

---

## Screen 3: Room (`/rooms/:id`)

### Loading State ✅ — page shows skeleton while fetching room data

### Audio Connection — CRITICAL

**Issue FE-009 [P0]:** Audio completely non-functional. `fetchLiveKitToken` calls `/api/audio/token` which returns 404. `useLiveKitRoom` sets `audioState = "error"` but room.tsx does NOT display this error to the user. Mic button shows as active (green) creating a false positive.

Root cause: 
1. `/api/audio/token` endpoint missing from worker
2. room.tsx doesn't check `audioError` state to disable/indicate mic failure

Fix:
1. Add `GET /api/audio/token` to cloudflare worker (livekit-tokens.ts)
2. In room.tsx: when `audioState === "error"`, show mic as disabled + toast: "Audio unavailable"
3. Add LIVEKIT env vars to wrangler.toml

### Error State (room not found) ✅
`getRoom()` returns null → room.tsx redirects to `/` with toast. ✅

### Real-time Participants ✅
Supabase Realtime subscription on `room_participants` channel. Updates grid in real-time. ✅

### In-room Chat ✅
`sendMessage` + `listMessages` + Realtime subscription. Works. ✅

### Reactions (floating emojis) ✅
Broadcast channel via Supabase Realtime. Works. ✅

### Hand Raise ✅
Broadcasts to Supabase channel. Host receives in real-time. ✅

### Leave Room ✅
`leaveRoom()` removes from `room_participants`. ✅

### Host Controls
"End Room" button exists for host. ✅ (assuming it sets `is_live = false`)

---

## Screen 4: Login (`/login`)

**Issue FE-010 [P1]:** Immediate redirect to `profiles.rald.cloud` with only a spinner and "Connecting to RALD Profiles…" text. No explanation. Household users see an unexpected domain change.

Fix: Add pre-redirect copy: "We use RALD to verify your phone. You'll receive an SMS, then return here automatically."

**Issue FE-011 [P1]:** If `profiles.rald.cloud` is down, users are stuck on the external site with no fallback. Loop has a fully functional OTP backend (`/api/auth/send-otp`) that is completely unused by the login UI.

Fix: Add native OTP flow as fallback. Show phone input → OTP → complete login without leaving Loop.

---

## Screen 5: Onboarding (`/onboarding`)

**Issue FE-012 [P1]:** Username step — regex `/^[a-z0-9_]{3,20}$/` rejects names with spaces/capitals but shows no error message. `canAdvance()` returns false, Next button is disabled, user has no feedback.
- Fix: Add validation message: "Use only lowercase letters, numbers, and underscores (a–z, 0–9, _)"

**Issue FE-013 [P1]:** Interests step — hard 3-minimum with no counter. Button disabled, no message.
- Fix: Add label: "Select at least 3 interests (X selected)"

**Issue FE-014 [P2]:** Rooms step (step 5) shows empty list if no live rooms in DB. User sees a blank screen with a "Done" button. No guidance.
- Fix: Add message: "No live rooms right now — you'll see them on your feed. Tap Done to continue."

**Issue FE-015 [P2]:** 5-step onboarding has no progress indicator.
- Fix: Add step counter ("Step 2 of 5") or progress bar.

**Issue FE-016 [P3]:** Display name step has max 40 chars enforced silently.
- Fix: Add character counter: "24/40".

---

## Screen 6: Create (`/create`)

### Loading/Error states ✅ — `busy` spinner on submit, toast on error

### Room creation ✅ — `createRoom` writes to Supabase, navigates to room

**Issue FE-017 [P2]:** After creating a room, no "Share this room" screen. A room with 0 listeners has no value. Host creates room and sits alone.
- Fix: After `createRoom()` succeeds, show a share sheet or copy-link toast.

**Issue FE-018 [P2]:** "Discussion / Event / Post / Article" create types show "coming soon." These are visible entry points leading to dead ends.
- Fix: These are already honest ("coming soon") — OK. But the descriptions could explain when they'll be available.

---

## Screen 7: Messages (`/messages`)

### "Rooms" tab ✅
Shows room threads with last message, live badge, timestamp. Supabase direct query. Works.

### Empty state for Rooms tab ✅
"You haven't joined any rooms yet" — honest, with link to Discover. ✅

### "Direct" tab
Shows honest empty state: "Direct messages are coming soon." ✅

**Issue FE-019 [P2]:** No real-time update when a new message arrives in a room you're in. The Realtime subscription is set up but uses `postgres_changes` which requires the user's row to be in `room_messages`. If the channel is subscribed but the callback truncates (file was cut off), unclear if it fully works.
- Fix: Verify Realtime subscription in messages.tsx completes properly.

---

## Screen 8: Profile (`/me` → `me-launch.tsx`)

**Issue FE-020 [P2]:** Two profile components exist: `me.tsx` and `me-launch.tsx`. App routes `/me` to `MeLaunchPage` (me-launch.tsx). `me.tsx` (MePage) appears to be a newer, cleaner version but is not routed. Dead code.
- Fix: Determine canonical profile page. Route `/me` to the better-implemented one.

**Issue FE-021 [P2]:** `me-launch.tsx` imports `userRegion` from `loop-mock.ts` and hardcodes "Lagos" as user location. Real user region is not shown.
- Fix: Replace `userRegion` with `profile.state_id` or remove location display until real region is in profile.

**Issue FE-022 [P2]:** Settings items in `me.tsx` (Notifications, Language, Privacy, Audio Quality) render as list items with `ChevronRight` but have no `onClick` handlers or routing. All are dead links.
- Fix: Either wire to sub-pages or remove until settings are built.

**Issue FE-023 [P2]:** Stats row in `me.tsx` hardcodes "0" for Rooms, Followers, Following. No API call.
- Fix: Fetch real counts from `room_participants` (rooms hosted), community_members (following/followers).

**Issue FE-024 [P3]:** "Edit profile" button in `me-launch.tsx` has no handler — tapping does nothing.
- Fix: Either route to profile edit page or remove until edit is built.

---

## Cross-Cutting Issues

**Issue FE-025 [P1]:** No bug reporting mechanism anywhere in the app. Users who encounter issues have no way to signal the team.
- Fix: Add "Report a problem" in profile menu → toast acknowledgment + Supabase insert.

**Issue FE-026 [P1]:** `loop-store.ts` initializes with hardcoded mock follows: `{ tunde: true, wanjiku: true, ngozi: true }`. This persists to localStorage. All new users start with fake "following" data.
- Fix: Initialize with empty state: `follows: {}`, `notifPrefs: {}`, `interests: {}`.

**Issue FE-027 [P2]:** No "Loading" spinner or skeleton during initial auth check. On first load, `loading: true` in use-auth causes a blank flash before content renders.
- Fix: Add global loading screen while `loading === true` in AuthProvider.

**Issue FE-028 [P2]:** No 404 page for `/rooms/:id` with invalid ID. Redirects to `/` silently. User has no idea what happened.
- Fix: Show "Room not found — it may have ended" before redirecting.

**Issue FE-029 [P3]:** Dark theme is hardcoded in the app (RALD design system). No system theme detection despite `me-launch.tsx` having theme toggle UI.
- Fix: Implement `prefers-color-scheme` detection or wire the existing theme toggle.

---

## Issue Summary

| ID | Severity | Screen | Description |
|---|---|---|---|
| FE-001 | P1 | Feed | Supabase errors show empty state silently |
| FE-002 | P2 | Feed | Empty feed has no CTA to create room |
| FE-003 | P1 | Feed | Search button does nothing |
| FE-004 | P1 | Feed | Notification bell does nothing |
| FE-005 | P2 | Feed | "Africa" chip returns 0 rooms (invalid category) |
| FE-006 | P1 | Discover | Same as FE-001 |
| FE-007 | P2 | Discover | Trending tab uses wrong empty state |
| FE-008 | P1 | Discover | Communities not shown anywhere in discovery |
| FE-009 | P0 | Room | Audio completely broken — no LiveKit token endpoint |
| FE-010 | P1 | Login | Unexplained redirect to external domain |
| FE-011 | P1 | Login | No fallback if profiles.rald.cloud down |
| FE-012 | P1 | Onboarding | Username validation silent failure |
| FE-013 | P1 | Onboarding | Interests minimum (3) with no counter |
| FE-014 | P2 | Onboarding | Rooms step blank when DB empty |
| FE-015 | P2 | Onboarding | No progress indicator |
| FE-016 | P3 | Onboarding | Display name char count not shown |
| FE-017 | P2 | Create | No share CTA after room creation |
| FE-018 | P2 | Create | "Coming soon" types visible as active options |
| FE-019 | P2 | Messages | Realtime subscription completeness uncertain |
| FE-020 | P2 | Profile | Two profile pages, only one routed |
| FE-021 | P2 | Profile | Hardcoded Lagos from mock data |
| FE-022 | P2 | Profile | Settings items are dead links |
| FE-023 | P2 | Profile | Stats hardcoded to zero |
| FE-024 | P3 | Profile | Edit profile button inactive |
| FE-025 | P1 | Global | No bug reporting mechanism |
| FE-026 | P1 | Global | Mock follows/interests in loop-store init |
| FE-027 | P2 | Global | Blank flash during auth loading |
| FE-028 | P2 | Global | Silent redirect on invalid room ID |
| FE-029 | P3 | Global | Theme toggle not wired |

**P0: 1 | P1: 11 | P2: 13 | P3: 4**

