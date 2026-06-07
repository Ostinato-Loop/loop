# AUDIT: Action UI
**Phase 2 — Action-First UI Audit**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Principle
Every screen must answer:
1. What is this?
2. Why should I care?
3. What should I do next?

Passive UI = information without invitation. Action UI = every state has a next step.

---

## Screen-by-Screen CTA Audit

### `/login` — Login Page

| Current | Problem | Action Fix |
|---------|---------|------------|
| "Signing you in" | Passive, pre-supposes intent | "Continue with your phone number" |
| Shield icon (generic) | No Loop brand identity | Loop logo + "Join your region's conversation" |
| No sign-up path visible | New users confused | Add "New to Loop? Create an account" below |

**Verdict:** PASSIVE. Rewrites required.

---

### `/onboarding` — Step 1 (Username)

| Current | Problem | Action Fix |
|---------|---------|------------|
| "Pick your handle" | "Handle" is jargon | "Choose your username" |
| "Lowercase letters, numbers..." | Technical rules upfront | Move to inline validation only |
| "Continue" button (disabled until valid) | Good — keep | ✅ Keep |

**Verdict:** MINOR issues. Terminology fix needed.

---

### `/onboarding` — Step 4 (Interests)

| Current | Problem | Action Fix |
|---------|---------|------------|
| "0 selected (min. 3)" | No positive reinforcement | At 3+: "✓ Great start — add more!" |
| No progress celebration | Dead at minimum | Animate chips on selection |
| Generic topics only | No regional relevance | Add regional interest chips |

**Verdict:** PASSIVE after minimum met. Add reward signal.

---

### `/onboarding` — Step 5 (Rooms / Final)

| Current | Problem | Action Fix |
|---------|---------|------------|
| "No live rooms right now — check back soon" | Dead end at moment of peak excitement | Replace with 3 alternatives (see below) |
| "Start exploring" | Vague | "Explore your region" |

**When no live rooms, show:**
```
Option A: Join your regional community →
Option B: Complete your profile (earn trust points) →  
Option C: Invite someone you know to Loop →
```

**Verdict:** CRITICAL failure. Needs complete replacement.

---

### `/` — Feed (Empty State)

| Current | Problem | Action Fix |
|---------|---------|------------|
| "No live rooms right now" | Passive | "Be the first in your region tonight" |
| "Be the first — start a room" (small link) | Buried, not prominent | Large primary CTA button |
| No secondary action | Single option | Add "Browse communities while you wait" |

**Verdict:** PASSIVE. Needs hierarchy fix.

---

### `/` — Feed (Has Rooms)

| Current | Action | Verdict |
|---------|--------|---------|
| Room cards link to room | ✅ | Good |
| "Picked for you" section | ✅ | Good |
| Category filter chips | ✅ | Good |
| No "Start a room" persistent CTA | ❌ | Add FAB or header button |

**Verdict:** GOOD. Add persistent create CTA.

---

### `/discover` — Discover Page

| Current | Problem | Action Fix |
|---------|---------|------------|
| "Discussions coming soon" | Passive dead section | Remove or replace with live content |
| "Opportunities coming soon" | Passive dead section | Replace with real rooms tagged as "Business" |
| "News & updates coming soon" | Passive dead section | Replace with community rooms or trending |
| Events tab: "Events coming soon" | Entire tab dead | Hide tab until populated |
| People tab: "Connect your RALD identity" | Dead for non-RALD users | Add CTA: "Set up your identity in 30 seconds →" |
| "No rooms yet — tap + below" | Passive | "Start the first room in your area →" |

**Verdict:** SIGNIFICANT passive sections. Three "coming soon" dead zones must be replaced with live content or removed.

---

### `/me` — Profile Page

| Current | Problem | Action Fix |
|---------|---------|------------|
| Stats: "0 0 0" (hardcoded) | Broken credibility | Wire to real API data |
| No edit button | Can't improve profile | Add "Edit profile" → profiles.rald.cloud |
| Settings list: all non-functional | Looks interactive, does nothing | Either wire or remove |
| No trust score | Core feature invisible | Add Trust Score card |
| No contribution history | Empty identity | Add "Your rooms" list |
| No community memberships | No belonging shown | Add "Your communities" section |

**Verdict:** CRITICAL. Profile is the identity anchor — currently broken.

---

### `/trust-center` — Trust Center

| Current | Problem | Action Fix |
|---------|---------|------------|
| Opens to bug/abuse report menu | Wrong content for name | Redesign first screen to show trust score |
| No trust score displayed | Core promise unmet | Add score + level + progress bar |
| No "how to improve" guidance | Trust feels mysterious | Add "Ways to earn trust" list |
| Reports hidden in submenus | Can't find | Keep but reorder: score first, reporting second |

**Verdict:** NAME-CONTENT MISMATCH. Trust Center should be about the user's trust — not just reporting.

---

### `/communities` — Communities Page

| Current | Action | Verdict |
|---------|--------|---------|
| Join community button | ✅ Works | Good |
| "Start a community" CTA when empty | ✅ Good | Good |
| Search bar | ✅ | Good |
| Regional indicator in header | ✅ | Good |
| No post-join next step | ❌ | After join: "Explore this community's rooms →" |
| No community detail page | ❌ | Add detail view |

**Verdict:** GOOD foundation. Post-join flow incomplete.

---

### `/notifications` — Notifications Page

| Current | Action | Verdict |
|---------|--------|---------|
| Real follower notifications | ✅ | Good |
| Trust nudge for low score | ✅ | Good |
| "Grow your network" card | ✅ | Good |
| Empty state has 2 CTAs | ✅ | Good |
| No bell badge on feed header | ❌ | Critical visibility gap |

**Verdict:** GOOD content. Bell badge missing creates discoverability failure.

---

## Passive → Action Replacements

| Location | Passive Text | Action Replacement |
|----------|-------------|-------------------|
| Onboarding rooms step (no rooms) | "No live rooms right now — check back soon" | "Join your regional community while you wait →" |
| Feed empty | "No live rooms right now" | "Your region is quiet tonight — be the first voice" + [Start a Room] button |
| Discover / Discussions | "Discussions coming soon" | Remove or show community room cards |
| Discover / Opportunities | "Opportunities coming soon" | Show business-category rooms |
| Discover / Events | "Events coming soon" | Hide tab |
| Profile stats | "0 · 0 · 0" | Real data from API |
| Profile settings | Non-functional list items | Wire to real settings or remove |
| Trust Center | Bug report menu | Trust score dashboard |
| Communities (post-join) | (nothing) | "Explore [Community Name]'s rooms →" |

---

## CTA Hierarchy Rules (for all screens)

1. **One primary action per screen** — full-width, high contrast
2. **One secondary action** — outline/ghost style
3. **Tertiary links** — plain text, bottom of screen
4. Empty states must always have a primary CTA — never orphan the user
5. "Coming soon" is never an acceptable empty state — replace with available alternative or hide entirely
