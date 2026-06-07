# Loop V1 — Navigation Audit
Generated: 2026-06-07 | Sprint: V1 Stabilization Freeze

---

## Route Inventory

| Route | Component | Auth Required | Onboarding Required | Status |
|---|---|---|---|---|
| / | FeedPage | Yes | Yes | Active |
| /discover | DiscoverPage | Yes | Yes | Active |
| /live | LivePage | Yes | — | Fixed — was unrouted |
| /messages | MessagesPage | Yes | — | Active |
| /me | MeLaunchPage | Yes | — | Active |
| /rooms/:id | RoomPage | Yes | — | Active |
| /login | LoginPage | Public | — | Active |
| /onboarding | OnboardingPage | Yes | — | Active |
| /create | CreatePage | Yes | — | Active |
| /create/:kind | CreatePage | Yes | — | Active |
| * | NotFound | Public | — | Fixed — was Navigate |

**Dead code (not routed, retained for reference):**
- room-launch.tsx — legacy, superseded by room.tsx
- me.tsx — superseded by me-launch.tsx

---

## NAV-001 — /live Not in BottomNav
**Severity:** P2-MEDIUM
**Finding:** Live page is now routed at /live but has no entry in the bottom navigation bar.
**Root cause:** Live was not routed during V1 build; BottomNav was not updated.
**Fix (V1.1):** Replace "Discover" or add a fifth "Live" tab, or add a "Live now" pill in the Feed header that navigates to /live.

---

## NAV-002 — Catch-all Was Silent Redirect
**Severity:** P0 — FIXED
**Reproduction:** Type /trust or /settings in URL bar. User was redirected to / silently with no explanation.
**Fix:** NotFound page now shown for all unknown routes with "Back to Feed" CTA.

---

## NAV-003 — Settings Dead Button
**Severity:** P1-HIGH
**Screen:** me-launch.tsx Settings gear (top-right of profile banner)
**Reproduction:** Tap gear icon — no action whatsoever.
**Root cause:** No onClick handler. No /settings route.
**Fix (V1.1):** Implement settings bottom sheet or route /settings.

---

## NAV-004 — Edit Profile Dead Button
**Severity:** P1-HIGH
**Screen:** me-launch.tsx "Edit profile" button
**Reproduction:** Tap "Edit profile" — no action.
**Root cause:** No onClick handler.
**Fix (V1.1):** navigate("/onboarding") with pre-populated profile data, or open inline edit sheet.

---

## NAV-005 — Communities / Trust Center / Settings All 404
**Severity:** P1-HIGH — Documented gap
**Root cause:** These are V2 features. No pages exist.
**Fix:** NotFound now displays for all unknown routes — users see clear "Page not found" with back link. Full screens are V2 scope.

---

## NAV-006 — Bottom Navigation Coverage
**Severity:** P1
**Items:** Feed (/) | Discover (/discover) | + Create | Chat (/messages) | You (/me)
**Missing from nav:** Live (/live) — now routed but no nav shortcut.
**Fix (V1.1):** Add Live entry to BottomNav or surface via Feed header pill.

---

## NAV-007 — Discover "See All" Dead
**Severity:** P2-MEDIUM
**Screen:** discover.tsx Live strip "See all" button
**Reproduction:** Tap "See all" next to the Live now section — nothing happens.
**Root cause:** No onClick. No navigation target.
**Fix (V1.1):** navigate("/live") or setFeedTab("live").

---

## NAV-008 — Back Navigation in Rooms
**Severity:** P2
**Screen:** room.tsx
**Finding:** Android back button navigates to / correctly. iOS swipe-back works.
**Status:** Acceptable for V1.

---

## NAV-009 — Onboarding Back Navigation
**Severity:** P2
**Screen:** onboarding.tsx
**Finding:** Steps 2+ allow back. Step 1 does not allow escape (intentional — must complete onboarding).
**Status:** Correct — onboarding is a required flow.

---

## NAV-010 — Create Sheet vs Create Page Consistency
**Severity:** P2
**Finding:** FAB (+) opens CreateSheet bottom drawer. /create opens CreatePage full-screen. Sheet navigates into Page for actual creation.
**Status:** Acceptable — sheet is entry point, page is the form. Consistent flow.

---

## Deep Link Readiness

| Flow | Deep-linkable | Status |
|---|---|---|
| Room | /rooms/:id | Yes |
| Login | /login | Yes |
| Onboarding | /onboarding | Yes |
| Profile | /me | Yes (own only) |
| Discover | /discover | Yes |
| Live | /live | Yes — now routed |
| Communities | /communities | NotFound (V2) |
| Settings | /settings | NotFound (V2) |
| Trust Center | /trust | NotFound (V2) |
