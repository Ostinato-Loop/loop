# AUDIT: First User Experience
**Phase 1 — Complete User Journey Audit**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Simulation Method
Full code-path walkthrough of every screen a first-time user touches, in sequence, with notes on confusion moments, missing context, and decision points where users are likely to abandon.

---

## Journey 1 — First Install / First Open

**Route:** `→ /login`

**What happens:**
- User sees a Shield icon, the text "Signing you in", and a spinner
- After 2.2 seconds, they are redirected to `profiles.rald.cloud` — an external domain they have never heard of

**Confusion moments:**
| # | Moment | Severity |
|---|--------|----------|
| 1 | "Signing you in" implies they already chose to sign in. They haven't. | HIGH |
| 2 | Redirect to `rald.cloud` with no prior explanation of what RALD is | HIGH |
| 3 | No "Sign up" option visible — new users don't know if they have to create a RALD account first | HIGH |
| 4 | No visual identity of Loop on the login interstitial — just a Shield icon | MEDIUM |
| 5 | No fallback if RALD is down | MEDIUM |

**What a user thinks:** *"This app just sent me somewhere else. Is this a scam?"*

---

## Journey 2 — First Signup (RALD auth → return to Loop)

**Route:** `profiles.rald.cloud → /onboarding`

**What happens:**
- User completes RALD OTP, is redirected back to Loop
- Lands at `/onboarding` with a 5-step flow

**Step 1 — Username:** "Pick your handle"
- Subtext: "Lowercase letters, numbers, and underscores. 3-20 characters."
- **Confusion:** "Handle" is a Twitter-era term. Many users in the target demographic (Africa, community-first) may not know this term. Should say "Choose your username."
- Validation error appears inline — GOOD

**Step 2 — Display Name:** "What should we call you?"
- Clear. No confusion.

**Step 3 — Language:**
- Good grid selection
- **Issue:** No explanation of WHY language matters ("We'll show you rooms in this language" is present — GOOD)

**Step 4 — Interests:** "What moves you?"
- 15 interest chips, pick ≥3
- **Confusion:** Counter says "0 selected (min. 3)" — but doesn't celebrate when you reach 3. No reward signal.
- **Missing:** No regional interests (e.g., "Lagos", "Abuja", "Nairobi") — purely topical, not geographic

**Step 5 — Rooms:** "Jump into a room"
- If 0 live rooms: shows "No live rooms right now — check back soon" with Users icon
- **Critical failure:** This is the moment of maximum excitement for a new user (they just finished 4 steps) and the app offers **nothing to do**. No room = no entry point.
- The "Start exploring" button sends them to `/` (feed) — also likely empty

**Missing from onboarding:**
- No regional setup (country, state, LGA) — Loop's core differentiator
- No trust introduction ("You start at Level 1 — here's how to level up")
- No community suggestion ("Join your regional community")
- No profile photo prompt
- No explanation of what Loop actually IS before the user commits to signing up

---

## Journey 3 — First Room Join

**Route:** `/` → room card → `/rooms/:id`

**What happens:**
- User sees the feed. If rooms exist, they see a room card with title, category badge, listener count.
- Tapping takes them to `/rooms/:id`
- Room experience is LiveKit-powered audio

**Confusion moments:**
- Room card shows "X listening" but no preview of who's speaking or what the conversation sounds like
- No "Can I just listen?" reassurance visible
- No "What happens when I join?" explanation for first-timers

---

## Journey 4 — First Profile Visit

**Route:** `/me`

**What happens:**
- Cover gradient with avatar (initials only — no photo)
- Stats row: **hardcoded "0" for Rooms, Followers, Following** — even if the user just joined 3 rooms
- Interests shown as chips — GOOD
- Settings list: Notifications, Language, Privacy, Audio quality — **none of these navigate anywhere** (no onClick handlers)
- Sign out button works

**Confusion moments:**
| # | Moment | Severity |
|---|--------|----------|
| 1 | Stats are always "0 0 0" — feels broken | CRITICAL |
| 2 | No trust score visible anywhere on profile | HIGH |
| 3 | No regional identity shown | HIGH |
| 4 | Settings items are tappable-looking but do nothing | HIGH |
| 5 | No profile edit button | MEDIUM |
| 6 | No community memberships shown | MEDIUM |

---

## Journey 5 — First Community Visit

**Route:** `/communities`

**What happens:**
- Header shows regional indicator (country · state · LGA) — GOOD if region is set
- If no region: shows "Set your region" nudge with link to settings — GOOD
- If communities exist: shows community cards with member count, room count, Join button
- Join button works (POST /api/communities/:id/members)
- If no communities: shows "Communities launching soon" with "Start a community" CTA

**Issues:**
- No community detail page exists (tapping a community name does nothing beyond joining)
- Joining a community shows no next step ("You joined! Now what?")

---

## Journey 6 — First Trust Interaction

**Route:** `/trust-center` (accessed from settings or profile)

**What happens:**
- User arrives at a page called "Trust Center"
- Sees a menu of: Report a Bug, Report Abuse, Report False Info, Feature Request, Community Standards, Transparency Policy, Safety Information
- **Critical mismatch:** The user came to understand their TRUST SCORE. This page is a feedback/reporting center.
- Trust score is never shown. Trust level is never explained. There is no "here is your current trust level" UI anywhere.

**Confusion moment:** User searches for "how do I build trust" or "what's my trust score" and finds a bug reporting form.

---

## Journey 7 — First Return Session (Day 1)

**Route:** Opens app → `/`

**What happens:**
- Notifications are generated from: follower activity + synthetic nudges (profile completion)
- Bell icon in feed header navigates to `/notifications` — but **no unread badge is shown** on the bell
- User has no signal that anything happened while they were away
- Feed shows same rooms as before (no "new since your last visit" indicator)

**Missing:**
- Unread count badge on bell icon
- "New since last visit" section in feed
- Return session personalization

---

## Summary — Confusion Map

| Screen | Top Blocker | Fix Priority |
|--------|-------------|--------------|
| Login | "Signing you in" before consent; RALD redirect unexplained | P0 |
| Onboarding final step | Empty state at moment of max excitement | P0 |
| Profile stats | Hardcoded zeros | P0 |
| Profile settings | Non-functional settings items | P0 |
| Trust Center | No trust score — wrong content for the name | P1 |
| Feed bell | No unread badge | P1 |
| Onboarding | No regional setup step | P1 |
| Onboarding | No trust/level introduction | P2 |
| Communities | No detail page | P2 |
| Room join | No first-timer reassurance | P2 |

---

**Target state:** A first-time user should understand Loop within 60 seconds and take meaningful action within 120 seconds. Currently, the login redirect alone costs 30+ seconds of confusion. The onboarding empty-room state is a hard wall. The profile stats bug destroys credibility.
