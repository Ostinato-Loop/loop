# Mobile Audit — Loop V1
**Date:** 2026-06-07 | **Target device:** Android mid-range (360px–414px wide), iOS Safari

---

## Layout Architecture

`AppShell` wraps all pages with `max-w-md mx-auto` — max 448px centered. ✅ Correct for mobile-first.

`min-h-screen` on AppShell ensures full height. Bottom nav uses `pb-[env(safe-area-inset-bottom)]` for iOS home indicator. ✅

---

## Touch Target Audit

**Issue MOB-001 [P1]:** Search button in feed header: `h-9 w-9` = 36×36px. iOS HIG minimum is 44×44px. Fails touch target.
- Fix: `h-11 w-11` (44px).

**Issue MOB-002 [P1]:** Notification bell: same `h-9 w-9` = 36px. Fails.
- Fix: `h-11 w-11`.

**Issue MOB-003 [P2]:** Category chips in feed: height not specified in visible code. If padding is small, touch target may be under 44px.
- Fix: Ensure `min-h-11` on all chips.

**Issue MOB-004 [P1]:** Bottom nav items: `h-16` container with 4 tap areas in a 5-column grid. Each item is 20% of max-md = ~89px wide — fine. Height could be extended to the bottom. ✅ Width OK. Height is full nav height ✅.

**Issue MOB-005 [P2]:** Create FAB button: `h-14 w-14` = 56px ✅ — meets minimum. Positioned with `-mt-7` raising it above nav. ✅

---

## Text Size Audit

All body text appears to use `text-sm` (14px) or `text-xs` (12px). Category badge labels and nav labels use `text-[10px]` (10px).

**Issue MOB-006 [P2]:** `text-[10px]` is below WCAG minimum readable size for mobile. Nav labels and stats labels use this size.
- Fix: Use `text-xs` (12px) minimum. Remove `text-[10px]`.

---

## Scroll Behavior

**Issue MOB-007 [P2]:** Feed category chips scroll horizontally (`RegionScroller`). No visual indicator that chips are scrollable (no fade/gradient at edges). User may not discover hidden categories.
- Fix: Add right-edge fade gradient on the chip scroll container.

**Issue MOB-008 [P2]:** Room page has multiple scroll areas (participant grid, chat). On small screens (360px), these may conflict. Chat input is sticky at bottom — may be obscured by keyboard.
- Root cause: No `@supports` CSS for keyboard viewport on mobile Chrome.
- Fix: Use `dvh` units or keyboard visual viewport API to adjust chat input position.

---

## Safe Area Handling

**Issue MOB-009 [P2]:** Bottom nav uses `pb-[env(safe-area-inset-bottom)]` ✅. But main content area `pb-24` may overlap nav on iPhone with 34px home indicator (total nav ≈ 90px = 64px nav + 26px inset). `pb-24` = 96px — barely adequate but should be verified.
- Fix: Change `pb-24` to `pb-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)]` for precision.

**Issue MOB-010 [P2]:** Room page has no safe area handling at the top for notch (iPhone 14 Pro Dynamic Island). Status bar overlaps fixed header elements.
- Fix: Add `pt-[env(safe-area-inset-top)]` to room page header.

---

## Input Fields on Mobile

**Issue MOB-011 [P1]:** Chat input in room.tsx — when keyboard opens on iOS Safari, the input field may be obscured. No `scrollIntoView` call after focus.
- Fix: On input focus, scroll chat container to bottom. Use `visualViewport` API on iOS.

**Issue MOB-012 [P2]:** Onboarding username input — autocorrect and autocapitalize should be disabled.
- Fix: Add `autoCapitalize="none" autoCorrect="off" spellCheck={false}` to username Input.

---

## Image Handling

**Issue MOB-013 [P2]:** `loop-mock.ts` uses `pravatar.cc` URLs for speaker avatars. These are external CDN URLs. On slow Nigerian networks (3G), these may time out.
- Fix: Replace mock data with initials-based avatars (already done in room.tsx for real users). Remove pravatar references.

---

## Network Resilience (Critical for Nigeria)

**Issue MOB-014 [P0]:** No offline detection or handling. When user loses connectivity mid-room, the app silently fails. No "You're offline" banner.
- Fix: Add `window.addEventListener("offline", ...)` with a toast/banner. On reconnect, refresh room state.

**Issue MOB-015 [P1]:** `listRooms()` has no timeout. On slow 3G, fetch may hang indefinitely with no user feedback.
- Fix: Add `AbortController` with 10s timeout to all Supabase fetch calls.

**Issue MOB-016 [P1]:** No retry button after failed room load. Error state shows nothing interactive.
- Fix: Add "Tap to retry" button in error state.

---

## Accessibility

**Issue MOB-017 [P2]:** No `role` attributes on custom interactive elements (chip buttons, avatar buttons, reaction buttons).

**Issue MOB-018 [P2]:** Floating reaction animations use `aria-hidden` — ✅ correct. But reaction send buttons have no accessible label. Fix: `aria-label="React with 🔥"`.

**Issue MOB-019 [P3]:** Color contrast — neon green (`#00FF88` approx) on dark background. Need to verify contrast ratio ≥ 4.5:1 for WCAG AA.

**Issue MOB-020 [P2]:** No `prefers-reduced-motion` support. Floating emoji animations, spin animations, and pulse effects will play for users who have this preference enabled.
- Fix: Wrap animation classes in `@media (prefers-reduced-motion: no-preference)`.

---

## Mobile Summary

| ID | Severity | Description |
|---|---|---|
| MOB-001 | P1 | Search button too small (36px vs 44px min) |
| MOB-002 | P1 | Notification bell too small |
| MOB-003 | P2 | Category chips min-height unverified |
| MOB-004 | P1 | (verified OK) |
| MOB-005 | P2 | (OK) |
| MOB-006 | P2 | text-[10px] below readable minimum |
| MOB-007 | P2 | Horizontal chip scroll has no overflow indicator |
| MOB-008 | P2 | Chat input obscured by keyboard |
| MOB-009 | P2 | pb-24 may not cover all iOS safe areas precisely |
| MOB-010 | P2 | No top safe area in room page |
| MOB-011 | P1 | Chat input obscured on keyboard open |
| MOB-012 | P2 | Username input needs autocorrect/autocapitalize off |
| MOB-013 | P2 | Mock pravatar URLs on slow networks |
| MOB-014 | P0 | No offline detection |
| MOB-015 | P1 | No fetch timeout — hangs on slow 3G |
| MOB-016 | P1 | No retry button on error |
| MOB-017 | P2 | Missing ARIA roles on interactive elements |
| MOB-018 | P2 | Reaction buttons lack accessible labels |
| MOB-019 | P3 | Contrast ratio unverified |
| MOB-020 | P2 | No prefers-reduced-motion support |

