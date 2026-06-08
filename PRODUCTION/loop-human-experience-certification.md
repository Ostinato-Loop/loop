# PRODUCTION/loop-human-experience-certification.md
**Date:** 2026-06-08
**Sprint:** LOOP HUMAN CONNECTION SPRINT
**Certified by:** RALD CTO
**Version:** Loop V1 — Human Experience Certification

---

## Certification Framework

Every screen in Loop is evaluated against one mission:

> **"A user should leave Loop saying: I found my people. Not: The app worked."**

This document certifies the current state of human experience in Loop and defines what must be true before Loop can claim its mission is achieved.

---

## Current Human Experience Score

```
╔══════════════════════════════════════════════════════════════════╗
║  HUMAN CONNECTION SCORE:   6.75 / 10                            ║
║  STATUS:  🟡  PASSING — Closed Beta Approved                    ║
║  TARGET:  8.5 / 10 for Public Beta                              ║
║  TARGET:  9.0 / 10 for Public Launch                            ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## What Loop Does Well — Do Not Break These

### 1. Room Experience (9/10)
The room is where Loop's soul lives. It answers all 5 questions:
- You can SEE who is speaking (avatars, name, role badge)
- You can LEARN about them (participant tap sheet — trust, region, rooms hosted)
- You can SPEAK to them (audio — LiveKit)
- You can REACT to them (emoji reactions, floating animations, hand raise)
- You can FIND THEM AGAIN (they appear in messages, you can follow them)

**Decision: Do not change the room UX. Protect it.**

### 2. Trust Architecture (solid foundation)
Phone verification → RALD SSO → behavioural trust score → role trust in rooms → social follow graph.
This is a genuine differentiator. No anonymous avatars. Real people. Real accountability.

### 3. Honest Empty States
Every screen has an honest empty state with a specific action. No dead ends.
This is not a connection feature but it is a trust feature — it tells users the app is real.

### 4. Notifications (post-sprint — now 8/10)
- New followers notified immediately
- **Live room from followed user now surfaces as the top notification** — this is the most valuable return trigger in the product
- Profile completion nudges guide users toward connection

---

## What Blocks "I Found My People"

In priority order:

### Gap 1: Region is not collected at onboarding (CRITICAL)
**Impact:** Near me is empty. Regional belonging is aspirational only.
**Fix:** Add region step to onboarding (country required, state optional).
**Sprint:** N+1

### Gap 2: No social proof on room cards (HIGH)
**Impact:** Users see a room title and an audience count. They don't see if anyone they know is inside.
**Fix:** Show "2 people you follow are in this room" on feed room cards.
**Sprint:** N+2 (requires following list query per card — caching needed)

### Gap 3: No "people from your area" on Discover (HIGH)
**Impact:** Users can't find people geographically. Social graph-based suggestions miss people with shared context.
**Fix:** Add "From [your country]" section to People tab once region is collected.
**Sprint:** N+2

### Gap 4: Push notifications not registered (MEDIUM)
**Impact:** Day-2 return relies on users actively opening the app. Push would bring them back passively.
**Fix:** Register a service worker. Send push when a followed user goes live.
**Sprint:** N+2

### Gap 5: Room topic/agenda not pinned (LOW)
**Impact:** Listeners don't know what's being discussed until they've heard 30 seconds.
**Fix:** Add a "What we're talking about" pinned field at the top of the room.
**Sprint:** N+3

---

## Connection Milestone Definition

Loop will have achieved its mission when a user can say:

| Statement | Current Status |
|-----------|---------------|
| "I found someone from my city in a room about something I care about" | ❌ Near me mostly empty (no onboarding region) |
| "I heard someone speak and I trusted them because I could see who they are" | ✅ Participant sheet shows identity, trust, region |
| "I came back because someone I follow started a room" | ✅ Live room notifications now implemented |
| "I follow people I met in a Loop room" | ✅ Discover → People tab + Follow from participant sheet |
| "I feel like this app knows where I'm from" | ❌ Regional belonging still weak (Gap 1) |

**3 of 5 milestones achieved.** The remaining 2 both require Gap 1 (onboarding region) to be solved first.

---

## Decisions Made in This Sprint

| Decision | Rationale |
|----------|-----------|
| "Connect" → "Follow" in Discover | "Connect" implies mutual. Follow is honest — it's one-directional. |
| Near me tab shows honest prompt when no region | Broken promises destroy trust. Honesty builds it. |
| Avatar nudge links to /settings (not external URL) | Keep users in the trust boundary of the app. |
| Live room notifications surface first | The moment someone you follow goes live is the highest-value return event. |
| Host name shown on every feed room card | A room is a PERSON talking. Show the person. |

---

## What We Will Not Build (for now)

| Feature | Reason |
|---------|--------|
| Anonymous rooms | Contradicts trust-first architecture |
| Fake trending/viral metrics | Manufactured social proof breaks trust |
| AI-generated room content | Rooms must have real humans speaking |
| DMs without room context | Direct messages without trust context are noise |
| Location GPS tracking | Region is self-declared, not tracked |

---

## Certification Verdict

Loop V1 is **certified for closed beta** with the following conditions:

1. ✅ Audio works end-to-end (LiveKit)
2. ✅ Trust visible in every room interaction
3. ✅ Real notifications — follower joins, live room alerts
4. ✅ No broken promises (Near me honest, Edit profile in-app, avatar nudge in-app)
5. ⚠️  Regional belonging requires onboarding region collection (Sprint N+1 blocker for public beta)
6. ⚠️  Push notifications required for public beta (Day-2 return)

**Human Connection Score target for public beta: 8.5/10. Gap: +1.75. Two sprints.**
