# AUDIT: Loop v2 — Product Audit
**Date:** 2026-06-06  
**Auditor:** RALD CTO  
**Method:** Full codebase read — App.tsx, all pages, all components, all API layers, mock data, store  
**Stance:** First-time user. No prior knowledge of the product assumed.

---

## Verdict

Loop is not ready for public launch.

It has a working skeleton — navigation, room entry, a real API connection — but it is not yet a product. A first-time user would open Loop, see an empty feed, find nothing to do except join a room (if any exist), and leave. There is no loop that brings them back.

---

## 1. Why Would a User Open Loop?

**Current answer: No clear reason.**

The Feed page opens to:
- A "Live now" strip (empty if no rooms are live)
- A "Discussions coming soon" placeholder
- No content, no posts, no news, no community activity

There is no pull. A user who downloads Loop today has nothing to read, watch, or react to between rooms. The retention loop does not exist.

**What's needed:** A reason to open the app when you're not joining a live room. That requires at minimum one of: posts, clips from past rooms, a discussion thread, or a news feed.

---

## 2. What Problem Does Loop Solve?

**Current answer: Unclear to a new user.**

Loop is positioned around audio rooms, but the name, visual design, and navigation suggest a broader social platform. The create sheet lists: Audio Room, Discussion, Event, Community, Post, Article — but only Audio Room works. The other five show "Soon."

A user cannot tell whether Loop is:
- A Clubhouse-style audio platform
- An African Twitter
- A community radio network
- A civic engagement tool

The onboarding collects interests (Football, Politics, Music, Tech, etc.) but those interests don't change what the user sees on the feed or in discovery. The personalization signal is collected and discarded.

---

## 3. Can a New User Understand Loop Within 30 Seconds?

**No.**

The first 30 seconds:
1. User lands on Feed
2. Sees empty "Discussions coming soon" card
3. Sees 0–N live room cards (if rooms exist in Supabase)
4. Taps "Discover" — sees rooms, People tab, Events (dead end), Near me (hardcoded Lagos)
5. Taps "+" — sees 5 greyed-out "Soon" options and 1 live option (Audio Room)
6. Taps "Chat" — redirected to external RALD Messenger app
7. Taps "You" — sees mock profile with hardcoded people data

No onboarding tooltips. No first-run guidance. No contextual prompts. No sample rooms pre-loaded for discovery.

---

## 4. Is the Room Model Intuitive?

**Partially — the join flow is clear, but the in-room experience is broken.**

**What works:**
- Room lobby (pre-join screen) is clean and readable
- "Join as listener" CTA is clear
- Host avatar and listener count are visible

**What's broken or missing:**

| Issue | Evidence |
|---|---|
| No audio | No WebRTC, no audio engine, no LiveKit/Daily/Agora integration found in codebase |
| Mute button has no effect | `setMuted()` updates local state only — no audio track to mute |
| Raise hand does nothing | Button renders, no state change, no notification to host |
| Like button does nothing | Renders, no handler |
| Only host shown in speaker grid | `grid grid-cols-3` with one speaker slot — no participant display |
| No speaker queue | Host cannot see or approve raised hands |
| No host controls | Host and listener see identical UI — no mute-others, no remove-speaker, no end-room |
| Chat is real but buried | Chat toggle is a secondary button — not visible by default |

**The room is a UI shell with no audio.**

---

## 5. Is the Experience Content-First or Room-First?

**Room-first — but there's no content to fall back on.**

The entire product assumes rooms are live and populated. When rooms are empty (which will be the default state for a new deployment):
- Feed shows one empty state card
- Discover shows empty room lists
- Events tab is dead
- Near me shows "Near Lagos" regardless of user location

There is no asynchronous content layer. No replays. No clips. No threads. If no one is live, Loop is an empty app.

---

## 6. What Would Prevent Daily Usage?

1. **Nothing to consume between rooms.** No posts, no discussions, no news feed, no clips.
2. **Messages don't work in-app.** Chat tab redirects to external Messenger. Users cannot message each other inside Loop.
3. **Notifications don't work.** Bell icon does nothing. No push notifications.
4. **Rooms have no audio.** The core feature — listening — doesn't function.
5. **Interests collected at onboarding are ignored.** The feed is the same for everyone.
6. **No follow-through after a room ends.** Room ends → user exits to feed → sees nothing.

---

## 7. What Would Prevent Creator Adoption?

1. **No creator tools.** Host UI is identical to listener UI. No ability to manage speakers, approve hand-raises, mute disruptive participants, or end the room gracefully.
2. **No room analytics.** No peak listener count, no replay view count, no audience demographics.
3. **No scheduling.** Cannot schedule a room in advance. No calendar integration. No "set a reminder" for listeners.
4. **No clip/highlight extraction.** No AI-summary display after rooms (field exists in data model but never populated in UI).
5. **No profile for hosts.** The Me page uses mock data. There is no host credibility signal — followers, room history, verified badges.
6. **No monetisation path visible.** No tips, no paid rooms, no creator fund mention.

---

## 8. What Would Prevent Radio Station Adoption?

1. **No livestream differentiation.** `visibility: "livestream"` exists in the data model but the room card and discovery treat it identically to a regular room. No broadcast-quality controls.
2. **No station identity.** No station profile, no logo, no persistent schedule, no programme guide.
3. **No embed.** Stations need a widget they can put on their own website.
4. **No listener stats.** Stations need peak concurrent, total hours listened, geographic breakdown.
5. **No automation integration.** No API for stations to push now-playing metadata, track listings, or programme schedules.

---

## Confusing Flows

| Flow | Confusion |
|---|---|
| Tapping "Chat" | Opens external Messenger, not an in-app experience. No transition explanation. |
| Tapping any "Soon" create option | Item is greyed out and tappable — it navigates to `/create/discussion` etc., but those routes redirect to the Create page which shows the same sheet again. Circular dead end. |
| Category chips on Feed | Tapping "Africa," "Civic," "Music" etc. renders a new chip state but the room list and content don't change. |
| Discover "Near me" tab | Shows "Near Lagos" hardcoded — users outside Lagos see wrong location with no explanation. |
| Discover "Events" tab | Shows "Events coming soon" — dead end with no estimated timeline. |
| Onboarding interests → Feed | User picks Football, Politics, Music — then lands on a generic empty feed. Interest selection has zero visible effect. |
| Room Mute button | Shows "Live" when unmuted and "Muted" when muted — but no audio change occurs. Misleading. |

---

## Dead Ends

| Location | Dead End |
|---|---|
| Feed → search icon | `onClick={() => {}}` — no search UI |
| Feed → bell icon | No notification panel |
| Feed → RegionScroller tabs | No filter behaviour |
| Discover → Events tab | "Coming soon" with no CTA |
| Discover → Near me | Hardcoded "Near Lagos" — no location prompt |
| Messages → Direct | Redirects externally, no in-app thread |
| Room → Raise hand | Button renders, nothing happens |
| Room → Like | Button renders, nothing happens |
| Create → 5 of 6 options | "Soon" — no timeline, no waitlist, no notification signup |
| Me page | Mock data (pravatar avatars, hardcoded names) |

---

## Missing UX

- First-run experience / tooltips / walkthrough
- Empty-state CTAs with actual actions ("Start your first room" should navigate to create)
- Pull-to-refresh on all list views
- Pagination / infinite scroll on room lists
- Error retry UX beyond a single "Retry" link
- Room end state — what happens when the host leaves?
- Back navigation from room to correct previous page

---

## Missing Navigation

- No way to navigate directly to a user's profile
- No way to navigate to a specific room category from Feed
- No way to get back to Feed from the lobby without pressing the system back button
- No "Home" shortcut from deep in Discover

---

## Missing Discovery

- No search for rooms or people
- No trending topics across the platform
- No "rooms you might like" based on interests
- No "people you might know" on the main feed
- No way to discover past rooms or recordings

---

## Missing Community Features

- No posts / text updates
- No discussions / threads
- No reactions on rooms beyond emoji floating overlays
- No comments on rooms (asynchronously, after they end)
- No groups or communities
- No events system
- No shared playlists or collaborative queues

---

## Missing Creator Features

- No host dashboard
- No speaker management
- No hand-raise approval queue
- No room scheduling
- No room recording
- No clip creation
- No analytics
- No follower notifications ("X is going live")
- No co-hosting

---

## Missing Audio Infrastructure

This is the most critical gap. Loop is an audio platform with no audio.

| Component | Status |
|---|---|
| WebRTC / audio engine | Not present |
| LiveKit / Daily / Agora SDK | Not installed |
| Microphone access / permissions | Not requested |
| Audio tracks | Not implemented |
| Speaker assignment (server-side) | Room durable object exists but audio assignment is unimplemented |
| Mute/unmute (functional) | Local state only |

---

## Summary: What Is Actually Working

| Feature | Status |
|---|---|
| Authentication (via RALD Profiles SSO) | ✅ Works |
| Onboarding (5-step flow) | ✅ Works |
| Room creation (title, category, visibility) | ✅ Works |
| Room list from Supabase | ✅ Works |
| Room join (UI, chat messages) | ✅ Works |
| Chat in room (real-time via Supabase) | ✅ Works |
| People discovery (RALD Identity) | ✅ Works |
| Navigation between main screens | ✅ Works |
| Dark/light design system | ✅ Works |

---

## Summary: What Is Not Working

| Feature | Status |
|---|---|
| Audio (listening or speaking) | ❌ Not implemented |
| Content feed (posts, discussions, news) | ❌ Not built |
| Notifications | ❌ Not implemented |
| In-app messaging | ❌ Redirected externally |
| Search | ❌ Button only |
| Host tools | ❌ Not built |
| Speaker management | ❌ Not built |
| Location detection | ❌ Hardcoded |
| Personalisation (interests → content) | ❌ Not wired |
| Events | ❌ Placeholder |
| Room recordings / replays | ❌ Not built |
| Creator analytics | ❌ Not built |
| Room scheduling | ❌ Not built |

---

## Closing Assessment

Loop has good bones: the visual design is strong, the navigation pattern is correct, the Supabase data layer is real, and the room join flow is clean. But it is a skeleton, not a product.

The gap between what Loop looks like it should do (social audio platform with community, creators, radio, and content) and what it actually does (join a chat room and see emoji fly) is large enough that launching publicly would damage trust and adoption.

**The three things that would make Loop actually launchable:**
1. Real audio — listeners must be able to hear the host
2. Something to consume when no room is live — at minimum, clips or a post feed
3. Host controls — a host must be able to manage their room

Everything else is a P1 or P2.
