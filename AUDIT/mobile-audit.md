# Loop V1 — Mobile Audit
Generated: 2026-06-07 | Sprint: V1 Stabilization Freeze
Devices: iPhone 14 Pro (390x844), Pixel 7 (412x915), Galaxy S21 (360x800)

---

## MOB-001 — Safe Area Insets
**Severity:** P1
**Finding:** BottomNav uses pb-[env(safe-area-inset-bottom)] — correct for iOS notched devices.
**Status:** Pass.

---

## MOB-002 — Touch Target Sizes
**Severity:** P1
**Standard:** Minimum 44x44px (Apple HIG) / 48x48dp (Material Design).
| Element | Approx Size | Status |
|---|---|---|
| BottomNav icon buttons | 22x22px icon in 64px bar | Pass |
| FAB + button | 56x56px | Pass |
| Feed tab chips | ~36x28px | FAIL — too small |
| Category filter chips | ~32x26px | FAIL — too small |
| Room reaction emojis | ~36x36px | Borderline |
| PersonCard Connect button | ~80x30px | Too short vertically |

**Fix (V1.1):** Add min-h-[44px] to chip rows. Increase chip py from py-1 to py-2.5.

---

## MOB-003 — Horizontal Scroll on Discover Tabs
**Severity:** P2
**Finding:** Feed tabs use overflow-x-auto hide-scrollbar. All 6 tabs accessible on 360px with side scroll.
**Status:** Acceptable. Scroll indicator correctly hidden.

---

## MOB-004 — Viewport Zoom on Input Focus (iOS)
**Severity:** P1
**Reproduction:** On iOS Safari, tapping any input zooms the viewport when font-size < 16px.
**Affected:** Onboarding username input, Discover people search, Report problem form.
**Fix (V1.1):** Add font-size: 16px to all input elements in global CSS, or add text-base class.

---

## MOB-005 — Keyboard Pushes Content (iOS)
**Severity:** P1
**Reproduction:** Open text input on iOS — virtual keyboard appears — fixed bottom elements may overlap input.
**Finding:** Room page chat input uses fixed positioning — will overlap keyboard on iOS Safari.
**Fix (V1.1):** Use dvh units or env(keyboard-inset-height) on room layout container.

---

## MOB-006 — Swipe Gestures
**Severity:** P2
**Finding:** No custom swipe gestures. React Router handles browser swipe-back natively.
**Status:** Acceptable for V1.

---

## MOB-007 — Room Mic Button Thumb Zone
**Severity:** P1
**Finding:** Mute/unmute button rendered lower-center — within natural thumb zone on up to 6.7" devices.
**Status:** Good placement. Pass.

---

## MOB-008 — Landscape Mode
**Severity:** P2
**Finding:** App uses max-w-md mx-auto. Landscape content is centred. Room layout not optimised for landscape.
**Fix (V2):** Add landscape media query for room participant grid.

---

## MOB-009 — Offline Banner
**Severity:** P1 — FIXED in previous sprint
**Finding:** main.tsx now shows "You're offline" banner using window.offline/online events.
**Status:** Pass.

---

## MOB-010 — Text Overflow on Long Names
**Severity:** P2
**Finding:** PersonCard uses truncate on name. RoomCard truncates room title. Feed header is fixed width.
**Status:** Truncation applied correctly. Pass.

---

## MOB-011 — Audio Permissions on iOS
**Severity:** P0 — Tracked
**Finding:** iOS Safari requires user gesture to start AudioContext. LiveKit SDK handles this.
**Current state:** room.tsx shows "Audio unavailable" badge when audioState is error. Mic shows disabled with red colour.
**Status:** Error state visible. Acceptable for V1.
**Full fix (V1.1):** Show explicit "Tap to allow microphone" prompt before joining with audio.

---

## MOB-012 — Font Loading on Low Bandwidth
**Severity:** P2
**Finding:** Custom font-display class implies a loaded webfont. No font-display: swap confirmed in @font-face.
**Fix (V1.1):** Verify font-display: swap in global CSS to prevent FOIT on slow connections.

---

## MOB-013 — Avatar Images No Lazy Loading
**Severity:** P2
**Finding:** Avatar img elements have no loading="lazy" attribute. All avatars in a feed load on mount.
**Fix (V1.1):** Add loading="lazy" to all avatar img tags across room-card.tsx, person-card, profile.

---

## MOB-014 — Pull to Refresh
**Severity:** P2
**Finding:** No pull-to-refresh implemented on Feed or Discover. Users must reload page.
**Fix (V2):** Implement via touch events or a library.

---

## MOB-015 — Haptic Feedback
**Severity:** P3
**Finding:** No haptic feedback on mic toggle, reactions, or primary CTAs.
**Fix (V2):** navigator.vibrate(10) on primary actions.

---

## Mobile Readiness Score

| Category | Score | Notes |
|---|---|---|
| Safe areas | 9/10 | env() used correctly |
| Touch targets | 6/10 | Chips too small |
| Keyboard handling | 6/10 | iOS zoom and keyboard push |
| Offline handling | 9/10 | Banner implemented |
| Audio permissions | 7/10 | Error state visible |
| Performance | 7/10 | No lazy images yet |
| Overall | 7.3/10 | V1 acceptable; V1.1 chips |
