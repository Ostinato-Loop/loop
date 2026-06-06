# Loop Reality Check
**Founder feedback:** "Loop does not yet make sense."
**Audit Date:** 2026-06-06
**Auditor:** CTO Office — Independent Review
**Mandate:** Do not defend the implementation. Identify flaws with evidence.

---

## Verdict

The founder is correct. **Loop does not make sense as a product today.**

A user who downloads Loop cannot:
- Hear anyone speak
- Join a room that functions
- Send a message without leaving the app
- Filter content by interest
- Understand why they are here or who else is here

This is not a list of bugs. This is a description of a product that does not yet exist in functional form.

---

## 1. Discovery — What Happens When a User Opens the App

### What the user sees
The feed page (`feed.tsx`) renders:
- A header with a logo and search/notification icons
- A row of category chips: "For you, Africa, Civic, Music, Sports, Campus, Tech, Business"
- A live rooms strip (`LiveStrip`)
- A permanent "empty content" state below it

### What actually works
| Element | Works? | Evidence |
|---|---|---|
| Category chips | ❌ | `RegionScroller` renders buttons with no `onClick` state update. Tapping "Music" does nothing. No API call is made. |
| Live rooms strip | ⚠️ Partial | `listRooms()` is called. If rooms exist in Supabase, they appear in the horizontal strip. |
| Content feed | ❌ | `ContentFeedEmpty` is rendered unconditionally — it is not a conditional on zero results. It is always displayed. |
| Search icon | ❌ | `onClick={() => {}}` — tapping search does nothing |
| Notification icon | ❌ | No handler — tapping does nothing |

### Flaw summary
Discovery is broken at the foundational level. The primary navigation surface (category chips) is inert. The main content area shows a permanent empty state. A user has no mechanism to discover content by interest, recency, or relevance.

**Discovery score: 1/10**

---

## 2. Communities — Do They Exist?

### Finding: Communities do not exist in Loop.

There is no `communities` table in the Supabase schema (migrations 001 and 002).
There is no community route in `App.tsx`.
There is no community API endpoint in the Cloudflare Worker.
There is no community UI component anywhere in the codebase.

The word "community" appears zero times in the Loop frontend source.

Communities are a V2 design concept documented in `FOUNDATION/loop-v2-readiness.md`. They are not a V1 feature that is broken. They do not exist at all.

**When a user asks "what community is this room in?" — there is no answer.**

**Communities score: 0/10 — not built**

---

## 3. Rooms — The Core Experience

### 3.1 Joining a Room

The join flow: Feed → tap a room card → `/rooms/:roomId` → `RoomLaunchPage` (room-launch.tsx)

| Step | Works? | Evidence |
|---|---|---|
| Fetch room data | ✅ | `getRoom(roomId)` called and room data returned from Supabase |
| Show lobby screen | ✅ | Room title, host avatar, participant count displayed |
| Join room | ⚠️ | `joinRoom()` writes to `room_participants` in Supabase — DB record is created |
| Hear audio | ❌ | **No audio SDK is integrated anywhere in the codebase.** No WebRTC. No SFU. No SDK calls. Room is silent. |
| Speak | ❌ | Mic toggle exists in UI but has no underlying audio stream |

### 3.2 The Room Experience

`room.tsx` (not currently routed — see P0-007) is more complete:
- Has Supabase Realtime participant grid ✅
- Has floating reactions ✅
- Has chat messages ✅
- Has speaker avatars with role badges ✅
- **Has zero audio** ❌

The more complete room page (`room.tsx`) is not routed. Users see `room-launch.tsx` instead, which is less capable.

### 3.3 Host Controls

A host and a listener see **identical UI**. There is no:
- End room button visible to host only
- Speaker queue management
- Ability to kick a participant from the room UI
- Any visual differentiation of who is the host

### 3.4 Raise Hand

In `room-launch.tsx`: `<RaiseHandButton>` renders with no `onClick` prop. Tapping it does nothing.

In `room.tsx` (unrouted): `toggleHandRaise()` exists and shows a toast — but does not call any API or broadcast to the host.

**Rooms score: 2/10 — UI shell only, no audio, no host controls**

---

## 4. Navigation — Does the App Make Sense to Navigate?

| Tab | Works? | Evidence |
|---|---|---|
| Feed (Home) | ⚠️ Broken | Renders but content is empty, category filter inert |
| Discover | ⚠️ Broken | Search input renders but returns no results (stub) |
| + Create | ✅ Form works | Creates a room in DB — but the room has no audio |
| Messages | ❌ CRITICAL | Tapping Messages **redirects user outside the app**. In-app messaging does not exist. |
| Me (Profile) | ✅ Basic | Profile reads from Supabase. Edit returns 405 in production. |

### Navigation Verdict

The bottom navigation has 5 tabs. One tab (Messages) ejects the user from the app. One tab (Feed) shows an empty screen. One tab (Discover) has non-functional search. The core product action (joining a room) results in silence.

There is no back-flow from a room to its originating context (no community, no feed context).

**Navigation score: 2/10**

---

## 5. Onboarding — Does a New User Understand the App?

### What works
- Phone OTP authentication ✅
- Username and display name entry ✅
- Avatar setup ✅
- Interest selection (stored in Supabase) ✅

### What is broken
| Issue | Evidence |
|---|---|
| Selected interests never used | Interest data stored but never passed to room recommendation or feed filtering queries |
| No explanation of what Loop is | No onboarding copy explains that Loop is a live audio platform |
| No tutorial or first-run experience | User lands directly on the empty feed after onboarding |
| No suggested rooms or communities on first launch | Feed is empty; no seeded content for new users |

### Onboarding Verdict

Onboarding collects data it never uses. A user who completes onboarding lands on an empty, non-functional feed with no guidance on what to do next. The product does not explain itself.

**Onboarding score: 3/10 — collects data, delivers nothing**

---

## 6. The Core Product Question

**What is Loop?**

Based on the current implementation:
- It is a room listing page
- Where rooms cannot be heard
- With a messages tab that leaves the app
- And interests that go nowhere

**What Loop needs to be:**
A live audio social platform where users join communities, listen to live conversations, raise their hand to speak, and return because the community they care about has ongoing activity.

None of that exists today.

---

## 7. Honest Scorecard

| Area | Score | Evidence |
|---|---|---|
| Discovery | 1/10 | Category filter inert, feed always empty |
| Communities | 0/10 | Does not exist |
| Rooms | 2/10 | UI shell, zero audio |
| Navigation | 2/10 | One tab exits app, one broken |
| Onboarding | 3/10 | Collects data it never uses |

**Overall: 8/50 → 16/100**

---

## 8. Priority Actions to Make Loop "Make Sense"

In order of impact:

1. **Route `room.tsx`** (1 hour) — Users see the more complete room experience immediately
2. **Fix feed hydration + category filter** (1 day) — Discovery becomes functional
3. **Audio vendor selection** (decision needed) — The product cannot exist without audio
4. **In-app messaging** (1–3 weeks) — Stop ejecting users from the app
5. **Host/listener UI differentiation** (2 days) — Rooms have authority and structure
6. **Communities foundation** (V2 sprint) — The product has a reason to return to

---

*End of Loop Reality Check — this document is evidence-based. No defenses of current implementation.*
