# FOUNDATION: Swipe Experience
**Phase 3 — Swipe-First Mobile Experience**
Loop V1 UX Dominance Sprint · LILCKY STUDIO LIMITED · 2026-06-07

---

## Current Swipe Inventory

Loop currently has **zero implemented swipe gestures**. All navigation is tap-based. The bottom nav is 5 columns (tap). All list items are tap links. No swipeable drawers, no swipeable cards, no horizontal scroll that triggers navigation.

---

## Swipe Opportunity Audit

### 1. Feed Navigation — Horizontal Category Swipe

**Current:** Category chips scroll horizontally via `overflow-x-auto`. User must tap each chip.

**Opportunity:** Swipe the main feed content left/right to switch categories — like Instagram Reels tabs.

**Spec:**
- Swipe left → next category
- Swipe right → previous category
- Category chip scrolls to match active category automatically
- Snap animation (spring, 300ms)
- Threshold: 40px minimum swipe distance before triggering

**Accidental trigger prevention:**
- Vertical scroll must take priority over horizontal swipe (detect gesture angle first)
- Minimum velocity: 0.3 px/ms before registering as intentional swipe

**Implementation approach:**
```tsx
// Use @use-gesture/react or Framer Motion drag
import { useGesture } from '@use-gesture/react'

const bind = useGesture({
  onDrag: ({ direction: [dx], velocity: [vx], distance: [dist] }) => {
    if (dist > 40 && Math.abs(vx) > 0.3) {
      dx > 0 ? prevCategory() : nextCategory()
    }
  }
}, { drag: { axis: 'x', filterTaps: true } })
```

**Priority:** HIGH — most-used screen, highest daily touchpoints

---

### 2. Room Cards — Swipe to Join

**Current:** Tap room card to navigate to `/rooms/:id`.

**Opportunity:** Swipe right on a room card to join instantly (without navigating away from feed). Swipe left to dismiss/hide that room.

**Spec:**
- Swipe right (≥80px): highlight in primary color → join the room as listener → show floating mini-player
- Swipe left (≥80px): card animates out, room hidden for session
- Partial swipe: card springs back to position (rubber-band feel)
- Card shows action hint icon as you swipe (microphone on right, X on left)

**Accidental trigger prevention:**
- Require 80px threshold (not 40px) — room joining is consequential
- Show visual indicator at 50px so user understands what will happen
- Require slow settle animation so user can cancel

**Priority:** MEDIUM — differentiating feature, adds delight

---

### 3. Profile Navigation — Swipe Between Sections

**Current:** Profile (`/me`) is a single scrolling page. Trust Center is a separate route.

**Opportunity:** Swipeable tabs within the profile:
- **Profile** (current)
- **Activity** (rooms hosted/joined, trust events)
- **Community** (memberships + badges)

**Spec:**
- Horizontal paging — full-screen swipe
- Tab indicator follows finger as it drags (not just snapping)
- Velocity-based: fast swipe commits, slow swipe returns if threshold not met

**Priority:** MEDIUM — adds depth without cluttering the main profile screen

---

### 4. Notifications — Swipe to Dismiss

**Current:** Notifications can only be marked read by tapping (via `markRead`).

**Opportunity:** Swipe left on a notification → reveal "Mark read" action. Swipe fully left → dismiss.

**Spec:**
- Partial swipe left (50-100px): reveals red "Dismiss" button on the right
- Full swipe left (>120px): auto-dismisses with spring exit animation
- Swipe right: marks as read (if unread), subtle green flash

**Accidental trigger prevention:**
- Vertical scrolling takes priority (detect gesture intent within first 8px of movement)
- If the scroll direction is ambiguous, lock to vertical

**Priority:** MEDIUM — standard mobile pattern, users expect it

---

### 5. Discovery Tabs — Swipe Between Feed Tabs

**Current:** 6 feed tabs (All, Live now, People, Near me, Trending, Events) accessed by tapping only.

**Opportunity:** Swipe left/right to navigate between tabs.

**Spec:**
- Same approach as Feed Category swipe
- Tab bar scrolls to keep active tab visible
- Page transition: slide + fade (not full slide — current content fades slightly)

**Accidental trigger prevention:**
- Content within tabs (room cards, people cards) also have vertical scroll — must detect gesture angle
- Use 15° angle threshold: if swipe is within 15° of horizontal, treat as tab swipe; otherwise, pass to vertical scroll

**Priority:** HIGH — Discover is the second most-visited screen

---

### 6. Messages — Swipe to Reply / Swipe to Archive

**Current:** Messages page (`/messages`) not reviewed in detail — future enhancement.

**Spec (future):**
- Swipe right on a conversation thread → mark as unread
- Swipe left → archive/mute thread
- Standard iOS Messages / WhatsApp pattern

**Priority:** LOW — messages not fully built

---

### 7. Communities — Swipe to Join

**Current:** Communities have an explicit "Join community" button in the card.

**Opportunity:** Swipe right on a community card to join instantly (with haptic feedback equivalent — visual pulse).

**Priority:** LOW — Join button is already clear

---

## One-Hand Usability Requirements

All swipe targets must be reachable from the bottom 60% of the screen. For screens with:

- **Content at top** (feed header, discover header): ensure swipeable cards are in the bottom 70% of the viewport
- **Bottom nav**: bottom nav must not interfere with vertical swipe on content above it — use `touch-action: pan-y` on content areas
- **Safe areas**: all swipe thresholds must account for `env(safe-area-inset-bottom)` — the bottom 34px on iPhone should never be a swipe target

## Gesture Priority Stack

When multiple gestures are possible, priority order:
1. Vertical scroll (always wins in ambiguous cases)
2. System gestures (iOS back swipe from left edge — never override)
3. Loop swipe gestures (only trigger after clear horizontal intent)

## Implementation Library Recommendation

- **@use-gesture/react** — lightweight, works with Framer Motion
- **Framer Motion drag constraints** — for card swipe with spring physics
- Do NOT use raw `touchstart`/`touchmove` — too brittle across devices

## Accidental Trigger Prevention Checklist

- [ ] Minimum distance threshold: 40px (navigation), 80px (consequential actions like join)
- [ ] Minimum velocity: 0.3 px/ms
- [ ] Angle detection: horizontal swipe only registers if angle < 30° from horizontal
- [ ] Vertical scroll always takes priority
- [ ] Visual preview shown before action commits (user sees what will happen)
- [ ] All swipes can be cancelled by reversing direction before threshold
- [ ] Never override system back gesture (left edge swipe on iOS/Android)
