# AUDIT: Retention Experience
**Phase 8 — Retention Experience**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Retention Simulation by Day

### Day 0 — First Session (Install → Onboarding → First Action)

**Current experience:**
1. Install → Login redirect (RALD) → 2.2s interstitial
2. OTP verification → Return to Loop
3. Onboarding: 5 steps (username, name, language, interests, rooms)
4. If no live rooms at onboarding end: stuck with "No live rooms right now"
5. Feed shows rooms or empty state
6. User may join a room, or may just look around and close the app

**Retention risk on Day 0:**
- If no live rooms during onboarding: user closes app with nothing meaningful done
- Profile stats show 0/0/0 — feels empty
- No sense of belonging established (no community joined, no follow made)

**Day 0 retention target:** User must complete ONE meaningful action:
- Join a room OR
- Follow one person OR
- Join one community

**What drives return:** The "NotificationPrompt" (push permission banner) on the Me page is wired in Part 19. GOOD — but only appears on Me page after full onboarding. Should appear earlier.

---

### Day 1 — First Return

**What should happen:**
- Push notification: "[Name] from Lagos started a room about [topic]"
- OR: "3 new rooms in your area this morning"
- App opens to feed showing new rooms since last visit

**Current state:**
- Push permission prompt exists (`use-push-permission.ts`, `notification-prompt.tsx`) ✅
- No "new since last visit" indicator in feed ❌
- No day-1 personalization of content ❌
- Bell icon has no unread badge ❌

**Day 1 retention kill factors:**
1. User opens app → same feed as yesterday → nothing feels new → close
2. No notification received because push permission never shown during natural flow

**Fix:**
- Move push permission prompt to onboarding final step (before "Start exploring")
- Add "New since you left" section at top of feed on return sessions
- Add unread count badge on bell icon

---

### Day 7 — First Week

**What should keep user coming back:**
- Trust score progress: "You're 12 points from Verified Voice"
- Community activity: rooms started by people they follow
- Regional events: "Big match tonight — rooms starting soon"
- Social: "Chidi followed you" notifications

**Current state:**
- Trust score nudge appears if score < 60 in notifications ✅
- Follower notifications fetch from API ✅
- No community activity notifications (community rooms not tied to membership) ❌
- No "milestone approaching" celebration (e.g., "You're close to Level 3!") ❌

**Day 7 retention drivers to add:**
1. Weekly trust recap: "This week you earned +18 pts — you're now Verified Voice"
2. Community digest: "2 new rooms in Lagos Tech Community this week"
3. Social nudge: "4 people you followed hosted rooms this week"

---

### Day 30 — Habit Formation

**Loop becomes a habit when:**
1. User hosts their own room (becomes a producer, not just consumer)
2. User has ≥3 regular rooms they join (daily schedule)
3. User has ≥1 community they feel ownership of
4. User has enough trust score to feel "invested"

**Current tools available:**
- Room creation via `/create` ✅
- Community joining ✅
- Trust score system ✅
- Notification system (push + in-app) ✅

**Missing:**
- No "host your first room" onboarding prompt ❌
- No "you haven't visited in X days" winback notification ❌
- No "your community had activity while you were away" digest ❌
- No streak or engagement metric shown to user ❌

---

## Retention Features — Priority Matrix

| Feature | Day 0 | Day 1 | Day 7 | Day 30 | Priority |
|---------|-------|-------|-------|--------|----------|
| Push permission during onboarding | ✅ Fix | ✅ | ✅ | ✅ | P0 |
| Unread badge on bell icon | — | ✅ Fix | ✅ | ✅ | P0 |
| "New since last visit" feed section | — | ✅ Fix | ✅ | ✅ | P1 |
| Trust milestone notifications | — | — | ✅ Fix | ✅ | P1 |
| Community activity digest | — | — | ✅ Fix | ✅ | P1 |
| "Host your first room" nudge | ✅ Fix | — | — | — | P1 |
| Weekly trust recap | — | — | ✅ Fix | ✅ | P2 |
| Social nudge (follows + room activity) | — | ✅ | ✅ | ✅ | P2 |
| Winback notification (X days inactive) | — | — | — | ✅ Fix | P2 |
| Streak / engagement metric | — | — | — | ✅ Fix | P3 |

---

## Notification Strategy

### Day 0 (onboarding)
- Prompt for push permission at onboarding final screen
- Text: "Loop happens live. Turn on notifications so you never miss a room in your area."
- Button: "Turn on" / "Maybe later"

### Day 1 (morning of)
- "Good morning! 3 new rooms in Lagos this morning" (if rooms exist in region)
- OR: "Complete your profile to get noticed in your community" (if no rooms)

### Day 3
- If trust score < 40: "You're [X] points from [next level]. Host your first room to level up."
- If trust score ≥ 40: "You're [X] points from Verified Voice — keep going!"

### Day 7
- Weekly recap: "This week on Loop: [N] rooms in your area, [N] new followers, trust score [+N]"

### Day 30
- If active: "You've been on Loop for a month. Here's what you've built: [summary]"
- If inactive (not opened in 7 days): "Your Loop community misses you. 5 new rooms in [region] this week."

---

## Reasons Users Return — Current vs Target

| Reason | Current Support | Target |
|--------|----------------|--------|
| Live rooms I care about | Partial (no personalization) | Regional + interest-based feed |
| People I follow are active | Partial (follower notifications) | + Activity notifications |
| Community I belong to has activity | ❌ None | Community digest |
| My trust score is progressing | Partial (in-app nudge only) | Push notifications + profile milestone |
| I want to host a room | ❌ Not prompted | Nudge in notifications + onboarding |
| Something new happened in my region | ❌ None | Regional activity digest |

---

## Would a Family Continue Using Loop?

See Phase 10 (household-readiness.md) for full simulation. Short answer: currently, a first-session family household with no live rooms and zero regional content shown would not retain past Day 1. The trust system, community joining, and regional identity fixes are the enablers.
