# AUDIT: Empty State Elimination
**Phase 9 — Empty State Elimination**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Classification

| Type | Definition | Treatment |
|------|-----------|-----------|
| **Dead empty** | No content + no action. User has nowhere to go. | ELIMINATE — always provide a primary CTA |
| **Passive empty** | Has text explaining the emptiness, but no next step | REPLACE with action |
| **Honest empty** | Explains what will appear here + provides a relevant CTA | KEEP and refine |
| **Coming soon** | Placeholder for unbuilt features | REMOVE or hide the section entirely |

---

## Full Empty State Inventory

### `/` — Feed Page

| State | Current | Type | Fix |
|-------|---------|------|-----|
| No live rooms | Radio icon + "No live rooms right now" + "Start a room →" (small link) | PASSIVE | Make "Start a room" a full-width primary button; add "Or browse communities →" secondary |
| Category filter + no rooms | "[Category]: no live [category] rooms right now" + "Try different category" | HONEST | KEEP — good ✅ |
| Loading | 3 pulse skeletons | HONEST | KEEP ✅ |
| Error | Red box + "Try again" link | HONEST | KEEP ✅ |

---

### `/discover` — Discover Page

| State | Current | Type | Fix |
|-------|---------|------|-----|
| All tab: Discussions | "Discussions coming soon" | COMING SOON | REMOVE — show community room cards instead |
| All tab: Opportunities | "Opportunities coming soon" with Briefcase | COMING SOON | REMOVE — show business-category rooms |
| All tab: News | "News & updates coming soon" with Newspaper | COMING SOON | REMOVE — show recent room recaps or remove section |
| Events tab | "Events coming soon" (entire tab) | COMING SOON | HIDE TAB until data exists |
| People tab (no RALD) | "Connect your RALD identity" with no action | DEAD | Add "Set up RALD identity →" CTA button |
| People tab (no suggestions) | "No suggestions yet — join rooms and connect" | PASSIVE | Add: "Explore rooms to find people →" CTA |
| People search: no results | "No results — try different name or handle" | HONEST | KEEP ✅ |
| Rooms: no rooms for filter | (uses Skeleton/EmptyState) | HONEST | Ensure CTA links to create |

---

### `/me` — Profile Page

| State | Current | Type | Fix |
|-------|---------|------|-----|
| Stats "0 0 0" | Hardcoded zeros — always shown | DEAD | Wire to real API |
| No bio | Bio section just hidden | DEAD | Show "Add a bio →" placeholder |
| No avatar | Initials gradient shown (reasonable fallback) | HONEST | KEEP but add "Add photo →" link |
| Settings items | Tappable but no action | DEAD | Wire to real screens or remove |
| No trust score | Not shown at all | DEAD | Add trust score card |
| No rooms hosted | Activity section doesn't exist | DEAD | Add empty state: "Host your first room →" |

---

### `/communities` — Communities Page

| State | Current | Type | Fix |
|-------|---------|------|-----|
| No communities + no search | "Communities launching soon" + "Start a community" | HONEST | KEEP — good CTA ✅ |
| No communities + community rooms exist | Shows room cards as fallback | HONEST | KEEP ✅ |
| No communities + no rooms | "No community rooms yet — Start one" button | HONEST | KEEP ✅ |
| Search: no results | "No communities found for [query]" | HONEST | KEEP ✅ |
| No region set | "Set your region" nudge with link to settings | HONEST | KEEP ✅ |
| After join: no next step | Nothing — user just sees the card | DEAD | Add: "Explore [Community Name]'s rooms →" toast/modal |

---

### `/notifications` — Notifications Page

| State | Current | Type | Fix |
|-------|---------|------|-----|
| No notifications | Bell icon + "Nothing yet" + "Join rooms, connect..." + 2 CTAs | HONEST | KEEP — good ✅ |

---

### `/trust-center` — Trust Center

| State | Current | Type | Fix |
|-------|---------|------|-----|
| No trust score shown | Trust Center never shows score | DEAD | Redesign — score FIRST |
| No trust events | Trust activity not shown | DEAD | Show: "Your trust journey starts here — here's what earns points" |

---

### `/onboarding` — Final Step (Rooms)

| State | Current | Type | Fix |
|-------|---------|------|-----|
| No live rooms | "No live rooms right now — check back soon" Users icon | DEAD | Show 3 alternative actions (see below) |

**Replacement for dead onboarding final state:**
```
No live rooms right now — but here's where to start:

[Primary]  Join your regional community →
[Secondary] Complete your profile (earn trust points) →
[Tertiary]  Invite someone you know to Loop
```

---

### `/search` — Search Page

*(Not reviewed in detail — assumed standard pattern)*

Required states:
- Default (no query): "Search for rooms, people, or communities"
- Loading: skeleton
- No results: "Nothing found — try a different search" + "Browse all rooms →" CTA
- Error: retry CTA

---

### `/rooms/:id` — Room Page

*(Not reviewed — LiveKit-powered audio)*

Required states:
- Room not found: "This room has ended" + "Browse live rooms →" CTA
- Room ended: "Room ended — start your own" + CTA
- Loading: show room title + skeleton speakers list

---

## Empty State Design Rules

1. **Every empty state must have exactly one primary CTA** — a full-width button or a prominent link
2. **The CTA must be specific** — "Browse communities" not "Go back"
3. **Never use "coming soon"** as user-facing copy — either show alternative content or hide the section
4. **Passive loading states must have a skeleton** — never a blank white screen
5. **Error states must have a retry button** — never just an error message with no action
6. **"No results" after search** must show related alternatives, not just "nothing found"

---

## Priority Order

| Fix | Screen | Priority |
|-----|--------|----------|
| Remove "coming soon" sections from Discover | `/discover` | P0 |
| Onboarding final step — 3 alternative CTAs | `/onboarding` | P0 |
| Wire profile stats to real API | `/me` | P0 |
| Trust Center — show trust score first | `/trust-center` | P0 |
| People tab RALD gate — add setup CTA | `/discover` | P1 |
| Post-join community CTA | `/communities` | P1 |
| Hide Events tab until data exists | `/discover` | P1 |
| Profile bio/avatar add prompts | `/me` | P2 |
| Room not found / ended states | `/rooms/:id` | P2 |
