# AUDIT: Trust Experience
**Phase 5 — Trust Experience Rebuild**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Current State

### What Exists

**Trust score logic** exists in `use-auth.tsx` via:
- `computeTrustScore(profile)` — computes a score from profile fields
- `getTrustLevel(score)` — returns level name, next level, next score threshold

**Trust is referenced in:**
- Notifications page: synthetic nudge shows score + level if score < 60
- Notifications page: bottom card if score < 40: "Build your trust score"

**Trust is NOT shown on:**
- Profile page
- Trust Center (the page literally named after trust)
- Feed
- Discover
- Any room-related UI

### The Trust Center is Misnamed

`/trust-center` currently renders:
- Report a Bug
- Report Abuse
- Report False Info
- Feature Request
- Community Standards
- Transparency Policy
- Safety Information

This is a **feedback and moderation center**. It should be renamed `Help & Safety` or `Report & Policies`. The Trust Center name should belong to a screen that actually shows the user's trust state.

---

## What `computeTrustScore` Computes (from code)

The function examines profile fields and assigns points. Based on the notification nudges in the code:
- Having a `avatar_url` contributes points
- Having a `bio` contributes points
- Having `country` set contributes points
- Implicit: phone verification, room hosting, follows, etc.

Score maps to levels via `getTrustLevel(score)`:
- Score 0-19: Level 1 (New Voice)
- Score 20-39: Level 2
- Score 40-59: Level 3
- Score 60-79: Verified Voice
- Score 80+: Community Pillar

*(Exact thresholds pending `use-auth.tsx` full review — placeholders used above)*

---

## Required: Trust Center Redesign

### New Trust Center — First Screen

Replace the current bug-report menu with a trust dashboard:

```
┌─────────────────────────────────────────────┐
│  Your Trust Score                           │
│                                             │
│      [Avatar]  Emeka O.                     │
│      ██████████████░░░░░░  68 / 100         │
│                                             │
│  Level: Verified Voice                      │
│  Next:  Community Pillar  (+12 pts)         │
│                                             │
│  [ How to earn more → ]                     │
└─────────────────────────────────────────────┘
```

---

### Trust Activity Feed

Below the score card:

```
Recent trust events
─────────────────────────────────
🛡️  Profile photo added      +5 pts   2d ago
📍  Region set (Lagos)        +8 pts   3d ago
✅  Phone verified           +20 pts   5d ago
🎙️  Hosted first room        +15 pts   6d ago
👤  Account created          +10 pts   7d ago
```

If no events yet: "You're just getting started. Here's how to earn your first trust points."

---

### How to Earn Trust Points

Visible list of trust-earning actions with point values:

| Action | Points | Status |
|--------|--------|--------|
| Verify phone number | +20 | ✅ Done |
| Add profile photo | +5 | → Do it |
| Write a bio | +5 | → Do it |
| Set your region | +8 | ✅ Done |
| Host your first room | +15 | → Do it |
| Get 5 followers | +10 | → 3 more |
| Join a community | +5 | ✅ Done |

Each uncompleted item has a CTA link to complete it.

---

### Trust Levels Table

Show the full ladder so users understand the system:

| Level | Score | What You Can Do |
|-------|-------|-----------------|
| New Voice | 0–19 | Join rooms, follow people |
| Community Member | 20–39 | Create rooms |
| Active Voice | 40–59 | Create communities |
| Verified Voice | 60–79 | Badge on profile |
| Community Pillar | 80–99 | Moderation access |
| Loop Leader | 100 | Full platform trust |

---

### Reporting (keep, but secondary)

Move the current reporting/policy content to a **secondary section** below the trust dashboard, labelled:

```
Safety & Reporting
─────────────────
Report a Bug
Report Abuse
Report False Info
Feature Request
Community Standards
Transparency Policy
Safety Information
```

---

## Trust Visibility Rules (for V1)

Trust score must appear in:
1. `/trust-center` — primary screen (first thing user sees) ← HIGHEST PRIORITY
2. `/me` — trust card section below stats ← HIGH PRIORITY
3. `/notifications` — trust nudge already exists ← ALREADY DONE ✅
4. Onboarding final screen — "You start at Level 1. Here's how to level up" ← MEDIUM PRIORITY

Trust score must NOT appear in:
- Room cards (irrelevant to room discovery)
- Feed category filters (irrelevant)
- Community search results (confusing)

---

## Trust Must Feel Earned

**Current:** Trust score exists but is invisible. Users never know their score.

**Required state:** User opens app, sees their score on profile, understands exactly:
- Where they are now
- What the next level is
- The 1 action that will get them there fastest

**Example nudge (show on first open after onboarding):**
```
You're at Level 1 — New Voice
Add your region to earn +8 pts and unlock your first community →
```

---

## Summary

| Item | Status | Priority |
|------|--------|----------|
| Trust Center shows score first | ❌ Missing | P0 |
| Trust score on profile | ❌ Missing | P0 |
| Trust activity feed | ❌ Missing | P1 |
| How-to-earn list | ❌ Missing | P1 |
| Trust levels table | ❌ Missing | P1 |
| Trust Center rename to Help & Safety | Partial | P1 |
| Reporting moved to secondary | Not done | P2 |
| Onboarding trust introduction | ❌ Missing | P2 |
