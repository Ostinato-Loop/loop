# AUDIT: Discovery Experience
**Phase 6 — Discovery Experience Rebuild**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Success Target
User must discover useful content within **5 seconds** of opening the Discover screen.

---

## Current State Analysis

### Tab Structure
6 tabs: All · Live now · People · Near me · Trending · Events

| Tab | Current State | Problem |
|-----|--------------|---------|
| All | Shows rooms + 3 dead sections | "Discussions/Opportunities/News coming soon" pollutes the feed |
| Live now | Shows live rooms | GOOD ✅ |
| People | Requires RALD identity | Dead for non-RALD users |
| Near me | Shows rooms for user's state | GOOD if region is set; broken if not |
| Trending | Shows all rooms (same as All) | No actual trending algorithm applied |
| Events | Always "Events coming soon" | Entire tab dead |

### Dead Sections in "All" Tab

Three permanent dead-end sections appear on the default tab:
1. **Discussions coming soon** — honest but passive, takes up screen space
2. **Opportunities coming soon** — shows a Briefcase icon with no content
3. **News & updates coming soon** — shows Newspaper icon with no content

These sections make the Discover feed feel 40% empty by default.

### People Tab — RALD Gate

Non-RALD users see:
```
Connect your RALD identity
Sign in via profiles.rald.cloud to discover people you know.
```

There is no CTA to actually set up RALD. The user has no path forward.

### Near Me — Region Gate

Shows rooms for `profile?.state_id` — but:
- If `state_id` is null, header reads "Near you" with no rooms (no region set)
- No "Set your region" CTA on this specific tab

---

## Discover in 5 Seconds — Required Fix

**Principle:** The user should see something alive, regional, and relevant within 5 seconds. Currently they might see three "coming soon" boxes and one live room.

### Fix 1 — Remove Dead Sections from "All" Tab

Replace "Discussions / Opportunities / News" coming-soon placeholders with:
- Additional live room cards
- Regional community cards
- People suggestions (if RALD identity exists)

### Fix 2 — Events Tab → Hide Until Populated

Do not show a tab whose entire content is a "coming soon" message. Remove Events from the tab bar until events data exists.

### Fix 3 — Trending Tab — Apply Algorithm

Currently Trending shows the same room list as All. Trending should:
- Sort by `audience_count` descending (highest listeners first)
- Filter to rooms that have been live > 10 minutes (sustained interest)
- Show count: "142 listening" as the primary stat

### Fix 4 — People Tab — Non-RALD CTA

Replace the dead "Connect your RALD identity" state with:
```
[Person icon]
Discover people in your area

People on Loop are verified by phone — not by algorithm.

[ Set up your RALD identity → ]
Takes 30 seconds. Your phone number stays private.
```

### Fix 5 — Near Me — Region CTA on Tab

When `state_id` is not set and user is on "Near me" tab:
```
[MapPin icon]
Set your region to see nearby rooms

[ Set my region → ]  (links to /settings)
```

Not a generic empty state — specific to the near-me context.

---

## Regional Content Surfacing

Loop's competitive advantage is regional trust. Discover must surface regional content **first**.

**Priority order for "All" tab:**
1. 🔴 Live rooms in user's state (if any)
2. 🟡 Live rooms in user's country (if none in state)
3. 🟢 All live rooms (global fallback)
4. Suggested people from user's region
5. Regional communities with active rooms

**Region header chip:**
Add a "Your area" chip to the category filter row that auto-applies the user's region filter:
```
[ For you ] [ Your area 📍 ] [ Community ] [ News ] ...
```

---

## Discovery Screen Alive Checklist

A screen "feels alive" if within 5 seconds:
- [ ] At least 1 live room card is visible above the fold
- [ ] At least 1 person card OR community card is visible (if scrolled slightly)
- [ ] The "live" indicator (pulsing dot) is visible
- [ ] No "coming soon" text is visible on the default tab
- [ ] A category or location is shown to orient the user geographically

---

## People Discovery — Full Experience

When RALD identity is connected:
1. "People you may know" — shows mutual score, connection score
2. Search bar — real-time search as user types (350ms debounce — ALREADY DONE ✅)
3. Follow/Unfollow — works correctly ✅
4. Report user — works via ReportSheet ✅

**Missing:**
- No profile detail page on tap (tapping person card opens a ⋮ menu for report only)
- Should navigate to `/profile/:userId` with full profile view

---

## Discover UX Score (Current)

| Dimension | Score |
|-----------|-------|
| Time to first live content | 6-8 seconds (loading + multiple "coming soon" | 4/10 |
| Regional relevance | Low — not surfaced first | 5/10 |
| People discovery | Blocked by RALD gate for many users | 4/10 |
| Tab utility | 2 of 6 tabs dead (Events + partial Trending) | 5/10 |
| Empty state quality | Mixed — some good, some passive | 6/10 |
| **Total** | | **24/50** |

---

## Target State

| Dimension | Target |
|-----------|--------|
| Time to first live content | < 3 seconds |
| Regional content visible on default tab | Yes — "Your area" section first |
| Events tab | Hidden until data exists |
| Discussions/Opportunities/News | Removed or replaced with live content |
| People tab non-RALD | Clear CTA to set up RALD identity |
| Near me no region | Region setup CTA inline |
