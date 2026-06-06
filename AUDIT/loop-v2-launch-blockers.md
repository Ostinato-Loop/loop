# AUDIT: Loop v2 — Launch Blockers
**Date:** 2026-06-06  
**Auditor:** RALD CTO  
**Method:** Full codebase read — evidence-based findings only  
**Policy:** No assumptions. Every finding cites the specific file and line or behaviour.

---

## Priority Definitions

| Level | Definition |
|---|---|
| **P0** | Blocks launch entirely. The app is broken or fraudulent without this. |
| **P1** | Severely degrades the product. Users will notice and stop using Loop. |
| **P2** | Meaningful gap that hurts growth and retention but does not break the experience. |

---

## P0 — Launch Blockers (Must Fix Before Any Public Launch)

---

### P0-001 — No Audio

**Evidence:**  
No WebRTC library, no audio SDK (LiveKit, Daily, Agora, Twilio), no browser `getUserMedia` call exists anywhere in the `artifacts/loop/` directory.

**Behaviour:**  
The mute/unmute button in `room-launch.tsx` calls `setMuted((m) => !m)` — this toggles local React state only. No audio track exists to mute. The Mic icon switches to MicOff. Nothing else happens.

**Impact:**  
Loop is an audio platform. A user joins a room and hears nothing. This is the single most critical failure.

**Fix required:**  
Integrate a real-time audio SDK (LiveKit is the most appropriate given the existing Cloudflare Worker infrastructure). Wire `getUserMedia`, create publisher/subscriber tracks, connect the room durable object to audio session state.

---

### P0-002 — Host and Listener UIs Are Identical

**Evidence:**  
`room-launch.tsx` has no conditional rendering based on whether `user.id === room.host_id`. The joined state renders the same controls for host and listener.

**Behaviour:**  
The host cannot: mute a participant, approve a raised hand, remove a speaker, end the room, or identify themselves as host beyond their avatar having a Mic badge.

**Impact:**  
A host cannot manage their room. Any disruptive participant cannot be removed. Any raised hand request is invisible to the host. The room degrades immediately with more than 2–3 people.

**Fix required:**  
Check `user.id === room.host_id` in `room-launch.tsx`. Render a separate host control panel: see raised hands queue, approve/reject speakers, mute participants, end session, transfer host.

---

### P0-003 — Raise Hand Does Nothing

**Evidence:**  
`room-launch.tsx` — the "Raise hand" button:
```tsx
<button className="flex flex-col items-center gap-0.5">
  <Hand className="h-6 w-6" />
  <span className="text-[9px]">Raise hand</span>
</button>
```
No `onClick` handler. No state mutation. No API call. No server event.

**Impact:**  
Listeners cannot request to speak. The stated feature ("You can raise your hand to speak anytime," shown on the lobby screen) is a false promise.

**Fix required:**  
Implement hand-raise: `onClick` → API call → server event → notify host → host sees queue → host approves → listener becomes speaker.

---

### P0-004 — Feed Is Empty — No Reason to Open Loop

**Evidence:**  
`feed.tsx` `ContentFeedEmpty()` component:
```tsx
<p className="text-sm font-semibold text-foreground">Discussions coming soon</p>
```
This is the only content shown below the live strip. There are no posts, no discussions, no news, no clips.

**Impact:**  
A user who opens Loop when no room is live sees a loading spinner → empty room strip → "Discussions coming soon." They have no reason to stay, no reason to return. Daily active usage is impossible.

**Fix required:**  
Provide at minimum one asynchronous content type before launch. Recommended first step: room clip highlights or a curated post feed. Even 3–5 pinned "featured rooms" from the past week would break the dead-end feeling.

---

### P0-005 — In-App Messaging Redirects to External App

**Evidence:**  
`messages.tsx`:
```tsx
<button onClick={() => openMessenger("/chats")} ...>
  Open Messenger <ExternalLink className="h-3.5 w-3.5" />
</button>
```
The "Chat" nav tab — a primary navigation destination — sends users out of Loop entirely to RALD Messenger.

**Impact:**  
Users who tap the second most prominent nav item (Messages / Chat) immediately leave Loop. On iOS this requires returning to the home screen and finding the Messenger app. The session is broken. Most users will not return.

The "Rooms" sub-tab in Messages shows "Once you join or host a room, your room chats will appear here" — but room chats live inside the room, not here. This is also inaccurate.

**Fix required:**  
Either: (a) remove the Messages nav item before launch and redirect to an honest waitlist state, or (b) implement basic DM threading in-app. Redirecting to an external app from a primary nav item is not acceptable UX for a public launch.

---

### P0-006 — Category Chips and Filters Are Non-Functional

**Evidence:**  
`feed.tsx` `RegionScroller()`:
```tsx
const tabs = ["For you", "Africa", "Civic", "Music", "Sports", "Campus", "Tech", "Business"];
// ...
<button className={cn(...)}>
  {t}
</button>
```
No `onClick` that changes state or re-fetches rooms. Tapping any chip other than "For you" changes the visual active state only. Room list does not change.

**Impact:**  
Users attempt to filter by interest. Nothing happens. The feature is visually present and functionally absent. This is worse than having no chips — it creates a broken expectation.

**Fix required:**  
Either remove the chips before launch or wire them to a real category filter on the `listRooms` API call.

---

## P1 — Severe Quality Gaps (Fix Before Soft Launch)

---

### P1-001 — No Search

**Evidence:**  
`feed.tsx` header search button: `onClick={() => {}}` — empty handler.  
`discover.tsx` search button renders with no handler either.

**Impact:**  
Users cannot find a specific room, person, or topic. On a platform with growing content, this makes Loop unusable for anyone with an intent beyond browsing.

---

### P1-002 — Onboarding Interests Are Ignored

**Evidence:**  
`onboarding.tsx` saves `interests: string[]` to the Supabase `profiles` table. The `discover.tsx` and `feed.tsx` pages never read `profile.interests` to filter or rank content. The feed is identical for all users regardless of selected interests.

**Impact:**  
Users spend time selecting interests in onboarding expecting personalisation. The experience they see is generic. Trust in the product is immediately broken.

---

### P1-003 — Room Card Emoji/Gradient Mismatch with Phase H Categories

**Evidence:**  
`room-card.tsx`:
```ts
const categoryGradient: Record<string, string> = {
  sports: "...", civic: "...", music: "...", entertainment: "...", news: "...", general: "...",
};
const categoryEmoji: Record<string, string> = {
  sports: "⚽", civic: "🏛️", music: "🎧", entertainment: "🎬", news: "📡", general: "🎙️",
};
```
Phase H canonical categories are: `community | news | commentary | radio | dj-session | education | business | general`

Only `news` and `general` have mappings. `community`, `commentary`, `radio`, `dj-session`, `education`, `business` all fall through to the `general` gradient and `🎙️` emoji. Every room card looks identical.

**Impact:**  
The visual identity of room categories — a key trust and discovery signal — is broken for 6 of 8 categories.

---

### P1-004 — Me / Profile Page Uses Mock Data

**Evidence:**  
`me-launch.tsx` imports `MeLaunchPage` and the component renders mock people (hardcoded names, pravatar avatars). The following/followers tabs show hardcoded person arrays, not real data from the social graph API.

**Impact:**  
A user's profile page shows fake people. If they tap "Following" and see "Adaeze Okafor" who they've never heard of, trust is broken.

---

### P1-005 — Location Hardcoded to Lagos

**Evidence:**  
`discover.tsx`:
```tsx
<h2 className="font-display text-sm font-bold uppercase tracking-wider">Near Lagos</h2>
```
No `navigator.geolocation` call. No user location from profile. Always "Near Lagos."

**Impact:**  
Users in Nairobi, Accra, London, or Atlanta see "Near Lagos" rooms. Location-based discovery is a stated differentiator for Loop. Hardcoding it to one city is embarrassing at launch.

---

### P1-006 — Room Speaker Grid Is Incomplete

**Evidence:**  
`room-launch.tsx` joined state renders:
```tsx
<div className="grid grid-cols-3 gap-3">
  <div className="flex flex-col items-center gap-2">
    {/* host only */}
  </div>
</div>
```
Only the host is rendered. No participant/listener grid. In a room with 100 listeners, you see one person.

**Impact:**  
Audio rooms are social. Users want to see who's in the room. The empty grid creates an uncanny, isolated feeling.

---

### P1-007 — No Notifications

**Evidence:**  
`feed.tsx` bell icon: `aria-label="Notifications"` — no onClick, no badge, no panel. No push notification registration anywhere in the codebase. No Supabase subscription to a notifications table on the client.

**Impact:**  
Users have no way to know when someone they follow goes live, when someone replies to their message, or when they're invited to speak. Without notifications, Loop cannot generate return visits.

---

### P1-008 — Create Sheet: 5 Dead Ends Presented as Active Options

**Evidence:**  
`create-sheet.tsx` — Discussion, Event, Community, Post, Article items:
```tsx
className={"... " + (a.live ? "..." : "opacity-60 cursor-pointer")}
```
These items are tappable (cursor-pointer), navigate to routes, and those routes resolve back to the create page. A user tapping "Discussion" loops back to the same sheet.

**Impact:**  
The create sheet communicates that Loop is a broad platform, then immediately disappoints. A first-time creator taps "Discussion," goes nowhere, taps "Event," goes nowhere, eventually finds "Audio Room." The experience communicates unfinished product, not future roadmap.

**Fix:** Either remove non-live items from the sheet entirely before launch, or show a proper coming-soon state on the target page with a notification signup.

---

## P2 — Meaningful Gaps (Address in First Month Post-Launch)

---

### P2-001 — No Room Replay / Recordings

Rooms end and disappear. No replay, no clip, no summary email to participants. There is an `ai_summary` field in the Room type but it is never populated in the UI.

---

### P2-002 — No Room Scheduling

Hosts cannot create a scheduled room in advance. Listeners cannot set reminders. The Events tab is a dead end. Radio stations with programming schedules have no way to communicate them.

---

### P2-003 — No Host Analytics

No peak listener count, no audience country breakdown, no average session duration, no follower growth from rooms. Creators cannot evaluate performance.

---

### P2-004 — No Deep Link / Share

There is no "Share room" button in the room experience. No Open Graph meta tags generated per room. Rooms cannot be shared to WhatsApp, Twitter, or Instagram — the primary acquisition channels for an African social product.

---

### P2-005 — No Pull-to-Refresh

Room lists are fetched once and cached. The Live page auto-refreshes every 30s, but Feed and Discover have no pull-to-refresh gesture. A user sees stale room data with no way to manually refresh.

---

### P2-006 — No Offline / Poor Connection State

No offline detection. No graceful degradation on slow connections. No retry UX beyond a single inline "Retry" text link.

---

### P2-007 — Discover "Events" Tab — No Timeline

The Events tab shows "Events coming soon" with no estimated date, no ability to submit an event, no waitlist CTA. This is a dead end that erodes confidence.

---

### P2-008 — Room Category Mismatch Between Feed and Create

`feed.tsx` RegionScroller tabs: `["For you", "Africa", "Civic", "Music", "Sports", "Campus", "Tech", "Business"]`  
`create.tsx` room categories: `community | news | commentary | radio | dj-session | education | business | general`

Feed filter tabs don't map to create categories. A user creates a "commentary" room but the Feed has no "Commentary" filter chip. Discovery is incoherent.

---

### P2-009 — No Verified Host Badge in Room

The `is_verified` field exists on the host profile object and is rendered on room cards via `BadgeCheck`. Inside the actual room view, there is no verification badge on the host avatar. Host credibility is invisible in the moment that matters most.

---

### P2-010 — AI Summary Field Never Rendered

`room-card.tsx`:
```tsx
{room.ai_summary && !compact && (
  <p className="text-xs text-muted-foreground line-clamp-2">{room.ai_summary}</p>
)}
```
The field is rendered in the card — but it is never populated. The Cloudflare Worker has a `recommendations.ts` and `translation.ts` service but no summary generation pipeline. AI summary is displayed only when it exists; it never exists.

---

## Ranked Summary

| ID | Priority | Title | Blocks |
|---|---|---|---|
| P0-001 | P0 | No audio | Core feature |
| P0-002 | P0 | Host = listener (no controls) | Core feature |
| P0-003 | P0 | Raise hand does nothing | Core feature |
| P0-004 | P0 | Feed is empty | Daily retention |
| P0-005 | P0 | Messages redirects externally | Navigation trust |
| P0-006 | P0 | Category chips non-functional | Discovery |
| P1-001 | P1 | No search | Discovery |
| P1-002 | P1 | Interests ignored | Personalisation |
| P1-003 | P1 | Category emoji/gradient mismatch | Visual identity |
| P1-004 | P1 | Profile uses mock data | Trust |
| P1-005 | P1 | Location hardcoded to Lagos | Discovery |
| P1-006 | P1 | Speaker grid shows host only | Social presence |
| P1-007 | P1 | No notifications | Retention |
| P1-008 | P1 | Create sheet has 5 dead ends | Creator trust |
| P2-001 | P2 | No replay/recordings | Creator value |
| P2-002 | P2 | No room scheduling | Radio adoption |
| P2-003 | P2 | No host analytics | Creator adoption |
| P2-004 | P2 | No share / deep link | Acquisition |
| P2-005 | P2 | No pull-to-refresh | Polish |
| P2-006 | P2 | No offline state | Reliability |
| P2-007 | P2 | Events dead end | Discovery |
| P2-008 | P2 | Category mismatch (feed vs create) | Coherence |
| P2-009 | P2 | No verified badge inside room | Trust |
| P2-010 | P2 | AI summary never populated | Differentiation |

---

## Minimum Viable Launch Criteria

To launch Loop publicly with any confidence, P0 items must be resolved and at least P1-001 (search), P1-003 (categories), and P1-007 (notifications) must be addressed.

**P0 resolution estimate:** Audio integration (P0-001) is a 2–4 week engineering task. All other P0 items are UI/logic changes achievable in 1 week.

**Recommended sequence:**
1. Fix all P0 non-audio items (1 week) → soft launch with a small invite cohort
2. Integrate audio SDK (2–4 weeks) → closed beta
3. Ship one async content type — posts or clips (2 weeks) → open beta
4. Address P1 items (2–3 weeks) → public launch
