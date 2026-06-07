# AUDIT: Loop Feels Alive
**Phase 11 — Aliveness Audit**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Target
User must see meaningful activity within **10 seconds** of opening the app.

---

## What "Alive" Means

A screen feels alive when the user sees:
1. **People** — real humans, not placeholder data
2. **Activity** — something is happening right now
3. **Movement** — visual indicators that the platform is active (pulsing dots, listener counts, timestamps)
4. **Recency** — content that was posted/started recently, not hours ago

---

## Aliveness Timer — Current Experience

### Scenario A: User with region set, rooms active (best case)

| Second | What user sees |
|--------|----------------|
| 0.0 | App opens — blank screen while auth resolves |
| 0.5 | Auth resolves — Feed starts loading |
| 1.0 | Loading skeleton (3 pulse rectangles) ✅ |
| 2.5 | Feed renders — category chips appear |
| 3.0 | Room cards appear with "LIVE" badge + listener count ✅ |
| 3.0 | "Picked for you" section if interests match ✅ |

**Time to first alive content: ~3 seconds** ✅ (acceptable in best case)

---

### Scenario B: User with no region, no matching interest rooms

| Second | What user sees |
|--------|----------------|
| 0.0 | App opens |
| 0.5 | Auth resolves |
| 1.0 | Loading skeleton |
| 3.0 | Feed: shows all rooms (no regional filter) — may or may not have content |
| 3.0 | If rooms exist: alive ✅ |
| 3.0 | If no rooms: Radio icon + "No live rooms right now" ❌ |

**Time to first alive content: 3 seconds IF rooms exist; dead if not** ⚠️

---

### Scenario C: New user, no rooms live (worst case — most common for early users)

| Second | What user sees |
|--------|----------------|
| 0.0 | App opens |
| 0.5 | Auth resolves |
| 1.0 | Loading skeleton |
| 3.0 | "No live rooms right now. Be the first — start a room" |
| 3.0 | **Dead screen.** No activity, no people, no movement |

**Time to first alive content: NEVER** ❌

---

### Scenario D: Discover page (user taps Discover tab)

| Second | What user sees |
|--------|----------------|
| 0.0 | Navigate to /discover |
| 0.3 | Header renders |
| 0.5 | Loading skeleton |
| 2.0 | Rooms load — if any: alive ✅ |
| 2.0 | "For you" section: alive (same rooms) ✅ |
| 2.0 | "Discussions coming soon" — dead ❌ |
| 2.0 | "Opportunities coming soon" — dead ❌ |
| 2.0 | "News coming soon" — dead ❌ |

**Visual aliveness at 2 seconds: 40% of screen is dead**

---

## Aliveness Signals — Inventory

### Currently Present

| Signal | Where | Quality |
|--------|-------|---------|
| Pulsing red dot on "LIVE" badge in room cards | Feed, Discover | ✅ Strong |
| "X listening" listener count on room cards | Feed, Discover | ✅ Good |
| `animate-pulse` skeleton during loading | All pages | ✅ Good |
| Follower notifications in real-time | Notifications | ✅ Good |
| "Picked for you" section (interest-matched) | Feed | ✅ Good |

### Currently Missing

| Signal | Where Needed | Priority |
|--------|-------------|---------|
| Pulsing dot / unread badge on bell icon | Feed header | P0 |
| "New since last visit" indicator | Feed | P1 |
| People activity (X following you, X joined a room) | Feed sidebar / Notifications | P1 |
| Regional activity counter | Feed header | P2 |
| "Rooms started today in your area" | Discover / Feed | P1 |
| Live listener count updating in real-time | Room cards | P2 |
| Community activity indicator (N new rooms) | Communities | P2 |
| Trust score progress bar (visual movement) | Profile / Trust Center | P1 |

---

## Room-Level Aliveness

Room cards currently show static `audience_count`. To make them feel alive:

1. **Pulsing listener indicator:** Small green dot next to count that pulses every 3 seconds
2. **Trending label:** If `audience_count` > 50 and growing: add "Trending" badge
3. **Duration:** Show how long the room has been live: "Live 24 min"

Example enhanced room card:
```
[ LIVE · 24 min ] [ Community ]  Lagos, Nigeria
The future of tech in West Africa
● 142 listening   Trending ↑
```

---

## Feed Aliveness When Empty

When no rooms are live, the feed must still feel alive via:

1. **Community activity:** Show posts or recent discussions from communities the user joined
2. **People activity:** Show "Tobi started following you" / "3 people viewed your profile"
3. **Trust milestone:** "You're 8 points from Verified Voice — host a room to level up"
4. **Regional news placeholder:** Show trending topics in the user's region (text only, links to room creation pre-seeded with the topic)

Currently: empty feed = complete silence. This is the biggest aliveness failure.

---

## 10-Second Aliveness Test Results

| Scenario | Time to alive content | Pass/Fail |
|----------|----------------------|-----------|
| Best case (rooms live, region set) | ~3 seconds | ✅ PASS |
| Medium case (rooms live, no region) | ~3 seconds | ✅ PASS |
| Worst case (no rooms live) | Never | ❌ FAIL |
| Discover page (all tabs) | 2s for rooms, forever for 3 dead sections | ⚠️ PARTIAL |
| Profile page | Instant but 0/0/0 dead | ❌ FAIL |
| Notifications (nothing yet) | ~1s (empty state loads fast) | ✅ PASS (good empty state) |
| Trust Center | Instant — but wrong content | ❌ FAIL |

---

## Fixes to Hit 10-Second Target in All Scenarios

| Fix | Impact | Effort |
|-----|--------|--------|
| When no rooms: show community activity + people activity | HIGH | Medium |
| Remove "coming soon" sections from Discover | HIGH | Small |
| Unread bell badge | HIGH | Small |
| Room cards: add "Live X min" duration | MEDIUM | Small |
| Feed: "New since last visit" section | MEDIUM | Medium |
| Real profile stats | HIGH | Small |
| Community digest in notifications | MEDIUM | Medium |
