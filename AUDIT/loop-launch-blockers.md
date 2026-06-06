# Loop Launch Blockers — Phase 2: Go/No-Go Criteria
**Ecosystem:** RALD / LILCKY STUDIO LIMITED  
**Repo:** Ostinato-Loop/loop  
**Audit Date:** 2026-06-06  
**Auditor:** CTO Office  
**Status:** SUPERSEDES loop-v2-launch-blockers.md  

---

## Executive Summary

Loop cannot ship to users in its current state. This document defines the precise go/no-go gate for each launch-blocking issue. Every P0 item on this list must be resolved, reviewed, and CI-green before any public launch. No exceptions.

**Current launch status: 🔴 NO-GO — 7 P0 blockers open**

---

## Go/No-Go Gate Definition

A blocker is **resolved** when all of the following are true:
1. Code change is merged to `main` via a reviewed Pull Request
2. All required CI checks pass (lint, typecheck, build, tests)
3. The fix is deployed to the staging environment
4. A human QA pass confirms the user flow works end-to-end
5. No regression in any other P0 flow

---

## P0 Blockers — Must Fix Before Launch

### P0-001 · No Audio SDK
**Impact:** The core product does not function. Users cannot hear or speak in rooms.  
**Root cause:** No audio vendor SDK is integrated anywhere in the codebase. `room-launch.tsx` navigates to `/room` with no audio session, no token, no WebRTC negotiation.  
**Messenger repo signal:** `Ostinato-Loop/messenger` has Tencent RTC integrated. This must be evaluated: adopt Tencent RTC for Loop, or select an alternative (Agora, Livekit, Daily).  

**Resolution criteria:**
- [ ] Audio vendor selected and decision documented in `/FOUNDATION/loop-v2-readiness.md`
- [ ] SDK installed and audio session initialized on room join
- [ ] Host receives publish token; listener receives subscribe token
- [ ] Audio plays in Safari iOS, Chrome Android (the two primary targets)
- [ ] Room ends cleanly when host leaves (no zombie sessions)
- [ ] CI build passes with SDK included

**Owner:** Audio/Platform team  
**Effort estimate:** XL (2–3 weeks)

---

### P0-002 · Host and Listener Have Identical UI
**Impact:** Host cannot manage the room. There is no way to mute participants, manage the speaker queue, or end the session with authority.  
**Root cause:** `room-launch.tsx` renders the same component tree regardless of the `role` field returned by the join API.  

**Resolution criteria:**
- [ ] Role is read from the join API response and stored in room state
- [ ] Host UI shows: mic toggle, end room, speaker queue management, kick participant
- [ ] Listener UI shows: raise hand, reaction, leave
- [ ] Co-host role (P1) is stubbed but not required for launch
- [ ] Role is enforced server-side — the Worker rejects role-escalation requests

**Owner:** Frontend team  
**Effort estimate:** L (1 week)

---

### P0-003 · Raise Hand Has No Handler
**Impact:** Listeners cannot request to speak. The speaker queue system is non-functional.  
**Root cause:** `<RaiseHandButton>` in `room-launch.tsx` has no `onClick` prop. No store action or API call backs it.  

**Resolution criteria:**
- [ ] `onClick` wired to a `raiseHand()` store action
- [ ] Store action calls `POST /rooms/:id/raise-hand` on the Worker
- [ ] Worker broadcasts the event to all room participants via the Durable Object
- [ ] Host sees the raised-hand indicator and can approve/deny
- [ ] Hand is lowered automatically when speaker is approved or when listener leaves

**Owner:** Frontend + Backend team  
**Effort estimate:** S (2–3 days)

---

### P0-004 · Feed Empty State — Permanent
**Impact:** New and returning users see nothing on the home screen. The product appears broken on first launch.  
**Root cause:** The room list is fetched from the API correctly but state hydration fails — the empty-state branch renders unconditionally due to a missing conditional check in `feed.tsx`.  

**Resolution criteria:**
- [ ] Room list hydrates correctly on mount
- [ ] Loading skeleton shows during fetch
- [ ] Empty state only shows when API returns zero results (not during or after a failed fetch)
- [ ] Error state shows on network failure with a retry CTA

**Owner:** Frontend team  
**Effort estimate:** M (1–2 days)

---

### P0-005 · Messages Redirects Outside the App
**Impact:** Tapping Messages ejects the user from the Loop experience entirely. This is a critical retention break.  
**Root cause:** `messages.tsx` performs a redirect to an external URL — no in-app messaging is implemented.  

**Resolution criteria (Minimum for launch):**
- [ ] Messenger experience is embedded in the app — no external redirect
- [ ] 1:1 text messaging functional (audio DMs are a V2 feature)
- [ ] Message history persists across sessions
- [ ] Unread badge shows on bottom nav
- [ ] **Decision gate:** Adopt Tencent RTC from `messenger` repo OR re-implement with a different stack — this decision must be made before sprint planning

**Owner:** Platform team  
**Effort estimate:** XL (2–4 weeks depending on vendor decision)

---

### P0-006 · Category Chip Filter Broken
**Impact:** Users cannot filter rooms by topic — the primary discovery mechanism is non-functional.  
**Root cause:** `setActiveCategory` updates local state but the room fetch query is never re-executed with the new filter parameter.  

**Resolution criteria:**
- [ ] Category selection triggers a fresh API call with `?category=` query param
- [ ] Worker's `GET /rooms` handles the `category` filter and queries Supabase accordingly
- [ ] Selected chip is visually highlighted
- [ ] "All" chip resets to the unfiltered room list

**Owner:** Frontend + Backend team  
**Effort estimate:** S (1–2 days)

---

### P0-007 · `room.tsx` Not Routed — Complete Component Unused
**Impact:** The more complete room experience (Supabase Realtime participant grid, floating reactions) is invisible to users because it is not in the router.  
**Root cause:** `App.tsx` routes `/room/:id` to `room-launch.tsx`. The more complete `room.tsx` was built but never connected.  

**Resolution criteria:**
- [ ] Audit the capabilities of `room.tsx` vs `room-launch.tsx`
- [ ] Merge the best of both into a single canonical room component
- [ ] `App.tsx` routes `/room/:id` to the canonical room component
- [ ] Dead component removed from codebase

**Owner:** Frontend team  
**Effort estimate:** S (1–2 days, excluding audio work tracked in P0-001)

---

## P1 Pre-Launch Requirements
These are not day-one blockers but must be resolved before the product reaches more than 100 concurrent users or handles real user data.

| ID | Issue | Deadline |
|---|---|---|
| P1-001 | OTP endpoint has no rate limiting | Before 100 users |
| P1-002 | CORS allows all origins (`*`) | Before launch |
| P1-003 | Durable Object single-region | Before 500 concurrent users |
| P1-004 | Audio vendor decision documented | Before P0-001 sprint starts |

---

## CI Gate for Each Blocker

Every P0 fix must pass the following CI pipeline before the PR can be merged:

```
[ lint ] → [ typecheck ] → [ build ] → [ tests ] → [ security scan ]
                                                         ↓
                                                   [ deploy to staging ]
                                                         ↓
                                                   [ QA sign-off ]
                                                         ↓
                                                   [ merge to main ]
```

No merge without green CI. No deployment without merge. No exceptions per RALD CI Governance Policy.

---

## Launch Readiness Tracker

| Blocker | Status | Owner | Target Date |
|---|---|---|---|
| P0-001 Audio SDK | 🔴 Open | — | TBD |
| P0-002 Host/Listener UI | 🔴 Open | — | TBD |
| P0-003 Raise Hand Handler | 🔴 Open | — | TBD |
| P0-004 Feed Empty State | 🔴 Open | — | TBD |
| P0-005 Messages Redirect | 🔴 Open | — | TBD |
| P0-006 Category Filter | 🔴 Open | — | TBD |
| P0-007 room.tsx Not Routed | 🔴 Open | — | TBD |

**Launch gate:** All rows must be 🟢 Resolved before any public launch announcement.

---

*End of Phase 2 — Launch Blockers*
