# AUDIT: Profile Experience
**Phase 4 — Profile Experience Rebuild**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Current State Assessment

### What Exists (`/me`)
- Cover gradient (decorative)
- Avatar (initials only — no photo support despite `avatar_url` in profile schema)
- Display name + username
- Verification badge (`is_verified`) + Creator star (`is_creator`)
- Stats row: Rooms · Followers · Following (hardcoded to "0")
- Interests chips
- Settings list (4 items — non-functional)
- Sign out button

### Critical Failures

| Issue | Impact | Code Location |
|-------|--------|---------------|
| Stats hardcoded to "0 0 0" | Destroys credibility — user just joined 3 rooms and sees 0 | `me.tsx:92` — hardcoded array |
| Settings items have no `onClick` | Tappable but dead | `me.tsx:119-138` — no handler |
| No trust score visible | Core feature invisible | Entire trust system absent from profile |
| No regional identity | Loop's differentiator missing from the most personal screen | No country/state/LGA on profile |
| No community memberships | No sense of belonging | Not fetched or displayed |
| No contribution history | No "room you've been in" history | Not implemented |
| Avatar `avatar_url` exists in schema but never rendered | Profile feels placeholder | `me.tsx:70-76` — only initials gradient |

---

## Profile Rebuild Specification

### Section 1 — Identity Header

**Current:** Cover gradient → Avatar (initials) → Name + handle

**Required:**
```
[Cover photo or gradient — from regional flag color or custom]
  [Avatar — real photo if avatar_url set, initials gradient fallback]
  [Display name] [Verified badge] [Creator badge]
  [@username]
  [Bio — 1-2 lines, with "Add bio →" if empty]
  [Edit profile button → profiles.rald.cloud/edit]
```

**Regional identity under name:**
```
📍 Lagos, Lagos State, Nigeria   ← country + state + LGA assembled
```

---

### Section 2 — Trust Identity Card

**New section — HIGH PRIORITY**

Loop's trust system is its core differentiator. It must be visible on every profile.

```
┌─────────────────────────────────────┐
│  🛡️ Trust Score                     │
│  ████████░░░░  68/100               │
│  Level: Verified Voice              │
│  Next: Community Pillar (80 pts)    │
│  +12 pts away                       │
└─────────────────────────────────────┘
```

Fields required:
- Computed trust score (via `computeTrustScore(profile)` — already in `use-auth.tsx`)
- Current level name
- Next level name + points required
- Progress bar (animated on page load)
- Tap → navigates to Trust Center (redesigned)

---

### Section 3 — Real Stats Row

**Current:** Hardcoded `[["0", "Rooms"], ["0", "Followers"], ["0", "Following"]]`

**Required API calls:**
- `GET /api/follows/me` → follower count, following count
- `GET /api/rooms?host_id=:userId` → rooms hosted count
- All three must hydrate from real data with skeleton loading state

```tsx
// Correct stat row
const [stats, setStats] = useState({ rooms: null, followers: null, following: null })
// fetch on mount, show skeleton until loaded
```

---

### Section 4 — Activity Timeline

**New section**

Chronological feed of user's Loop activity:
- Rooms hosted (with date, listener count)
- Rooms joined (with date, duration if available)
- Communities joined
- Trust events earned ("Profile completed +10 pts", "First room hosted +15 pts")
- Connections made (follows)

Display as a minimal timeline list, newest first. Cap at 20 items.

---

### Section 5 — Community Badges

**New section**

Show communities the user has joined:
```
Your communities:
[ Nigeria Tech  ] [ Lagos Community ] [ Afrobeats ]
                              + Join a community →
```

Tap badge → navigate to `/communities`
If no communities: "Join your regional community →" CTA

---

### Section 6 — Creator Badges (if `is_creator`)

Only shown if `profile.is_creator === true`:
- "Verified Creator" badge
- Rooms hosted this week
- Total audience reached

---

### Section 7 — Interests (existing — keep)

No changes needed. Display correctly.

---

### Section 8 — Settings (wire or remove)

Current items: Notifications, Language & commentary, Privacy, Audio quality

**Options:**
1. Wire each to its real settings screen (preferred)
2. If settings screens don't exist yet: remove this list entirely — dead UI is worse than missing UI

**Recommended:** Remove settings list from `/me`. Add a settings icon (⚙) in the header that navigates to `/settings`.

---

## Who Am I? — Profile Completeness Score

Users should see how complete their profile is:

```
Profile completeness: 3/6
[ ] Profile photo
[✓] Username
[✓] Display name  
[ ] Bio
[ ] Region (country, state, LGA)
[ ] At least 1 room hosted
```

Each incomplete item links to its fix. Completeness ≥ 5/6 unlocks the "Trusted" badge.

---

## Where Am I? — Regional Identity

Every profile should show:
- Country (e.g., Nigeria)
- State (e.g., Lagos State)
- LGA (e.g., Ikeja) if set
- LCDA if set

If region not set: show "Set your region to see nearby rooms →" (links to `/settings`)

Regional identity appears:
1. Under the username in the header
2. In the trust identity card ("Regional Verified Voice — Lagos")
3. In community badges (regional communities)

---

## Why Am I Trusted? — Trust Activity

Trust events should surface on the profile:
- "Completed profile → +10 pts" (2 days ago)
- "Hosted first room → +15 pts" (1 day ago)
- "Verified phone number → +20 pts" (3 days ago)

This makes trust feel EARNED, not algorithmic and mysterious.

---

## Summary — Profile Rebuild Priority

| Item | Priority | Effort |
|------|----------|--------|
| Fix hardcoded stats (real API data) | P0 | Small |
| Wire trust score card | P0 | Medium |
| Show regional identity under name | P0 | Small |
| Show real avatar from avatar_url | P1 | Small |
| Add profile completeness score | P1 | Medium |
| Wire settings to real screens or remove | P1 | Small |
| Add community badges | P2 | Medium |
| Add trust activity timeline | P2 | Medium |
| Add creator badges | P3 | Medium |
