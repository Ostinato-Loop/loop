# Loop V1 — Frontend Complete Audit
Generated: 2026-06-07 | Auditor: CTO Mode | Sprint: V1 Stabilization Freeze
Scope: All 12 pages, all user-facing interactions. Treat as 100 users joining tomorrow.

---

## Coverage Matrix

| Screen | Route | Status | P0 | P1 | P2 |
|---|---|---|---|---|---|
| Feed | / | Routed | 0 | 0 | 1 |
| Discover | /discover | Routed | 0 | 2 | 1 |
| Live Now | /live | Fixed (was unrouted) | 1 fixed | 0 | 0 |
| Messages | /messages | Routed | 0 | 1 | 0 |
| Profile | /me | Routed | 0 | 2 | 1 |
| Room | /rooms/:id | Routed | 0 | 0 | 0 |
| Login | /login | Routed | 0 | 0 | 0 |
| Onboarding | /onboarding | Routed | 0 | 0 | 1 |
| Create | /create/:kind | Routed | 0 | 0 | 1 |
| Not Found | * | Fixed (was silent redirect) | 1 fixed | 0 | 0 |
| Communities | — | MISSING — V2 scope | 0 | 1 | 0 |
| Trust Center | — | MISSING — V2 scope | 0 | 1 | 0 |
| Settings | — | MISSING — V1.1 scope | 0 | 1 | 0 |

---

## FE-001 — Live Page Unrouted
**Severity:** P0-CRITICAL
**Screen:** live.tsx
**Reproduction:** Navigate to /live. App previously redirected silently to /.
**Root cause:** live.tsx existed in pages/ but was never imported or routed in App.tsx.
**Fix:** Added Route path="/live" element={LivePage} to App.tsx. FIXED.

---

## FE-002 — 404 Page Unrouted / Silent Redirect
**Severity:** P0-CRITICAL
**Screen:** not-found.tsx
**Reproduction:** Navigate to any invalid path e.g. /settings. App redirected silently to / with no feedback.
**Root cause:** App.tsx catch-all was Navigate to="/" replace — hides errors from users.
**Fix:** Changed catch-all to Route path="*" element={NotFound}. Redesigned not-found.tsx with RALD dark theme and "Back to Feed" CTA. FIXED.

---

## FE-003 — Discover Search Button Dead
**Severity:** P1-HIGH
**Screen:** discover.tsx header
**Reproduction:** Tap the search icon (top-right) in Discover. Nothing happens.
**Root cause:** Button rendered with no onClick handler.
**Fix:** onClick routes to the People tab which has full text search. FIXED.

---

## FE-004 — Discover "Near me" Hardcoded Location
**Severity:** P1-HIGH
**Screen:** discover.tsx Near me tab
**Reproduction:** Switch to "Near me" tab. Heading shows "Near Lagos" for every user.
**Root cause:** Hardcoded string literal "Near Lagos" — not parameterised.
**Fix:** Changed to "Near {profile?.state_id ?? 'you'}" using live profile data. FIXED.

---

## FE-005 — Communities Screen Missing
**Severity:** P1-HIGH
**Screen:** Not implemented
**Reproduction:** Navigate to /communities — previously silent redirect, now shows NotFound.
**Root cause:** Communities is a V2 feature. No page or route exists.
**Fix (V2):** Build communities.tsx + /communities route. Interim: NotFound page shows correctly.

---

## FE-006 — Trust Center Screen Missing
**Severity:** P1-HIGH
**Screen:** Not implemented
**Reproduction:** Trust/privacy links go to catch-all.
**Root cause:** No trust-center.tsx, no route.
**Fix (V1.1):** Build static trust-center.tsx with privacy policy + /trust route.

---

## FE-007 — Settings / Edit Profile Dead Buttons
**Severity:** P1-HIGH
**Screen:** me-launch.tsx
**Reproduction:** Tap Settings gear or "Edit profile" in profile page. No action.
**Root cause:** Buttons have no onClick. No /settings route exists.
**Fix (V1.1):** Wire Settings gear to bottom sheet. Wire Edit profile to /onboarding pre-filled.

---

## FE-008 — Discover "See All" Live Rooms Dead
**Severity:** P2-MEDIUM
**Screen:** discover.tsx Live strip
**Reproduction:** Tap "See all" next to Live now. Nothing happens.
**Root cause:** No onClick handler.
**Fix (V1.1):** onClick={() => setFeedTab("live")} or navigate("/live").

---

## FE-009 — Messages Error State Silent
**Severity:** P1-HIGH
**Screen:** messages.tsx
**Reproduction:** Network error during loadThreads — user sees empty state with no explanation.
**Root cause:** catch block calls setThreads([]) silently.
**Fix (V1.1):** Add setError state and show "Could not load messages. Tap to retry."

---

## FE-010 — Messages DMs Tab Misleading Label
**Severity:** P2-MEDIUM
**Screen:** messages.tsx
**Reproduction:** Tap "Direct" tab — empty state appears. Label implies working DMs.
**Root cause:** DM tab labelled "Direct" without clarifying V2 scope.
**Fix (V1.1):** Rename to "Direct (soon)" or add explanatory banner.

---

## FE-011 — Onboarding Final Step Button Copy
**Severity:** P2-MEDIUM
**Screen:** onboarding.tsx rooms step
**Reproduction:** On final step, button reads "Continue" — unclear this finishes setup.
**Root cause:** Generic button copy not updated for last step.
**Fix (V1.1):** Change to "Start listening" or "Enter Loop" on the final step only.

---

## FE-012 — Create Room No Post-Creation Navigation
**Severity:** P2-MEDIUM
**Screen:** create.tsx
**Reproduction:** Create a room successfully — user stays on /create with stale form.
**Root cause:** navigate() to new room not called after createRoom() resolves.
**Fix (V1.1):** navigate("/rooms/" + newRoom.id) on success.

---

## Loading States

| Screen | Skeleton | Spinner | Blank Flash | Status |
|---|---|---|---|---|
| Feed | animate-pulse cards | — | None | Pass |
| Discover | animate-pulse cards | — | None | Pass |
| Live | animate-pulse cards | — | None | Pass |
| Messages | — | Inline text only | None | Needs skeleton |
| Profile | — | — | First-render blank | Needs skeleton |
| Room | Full-screen Loader2 | — | None | Pass |
| Login | — | In button | None | Pass |
| Onboarding | — | Loader2 in button | None | Pass |
| Create | — | In submit button | None | Pass |
| Not Found | — | — | None | Pass |

---

## Error States

| Screen | Network Error | Auth Error | API Error | Status |
|---|---|---|---|---|
| Feed | Banner shown | Redirect /login | — | Pass |
| Discover | Destructive banner | Redirect /login | — | Pass |
| Room | Error state card | — | not_found card | Pass |
| Messages | Silent — shows empty | Redirect /login | — | FAIL |
| Profile | No error state | — | — | FAIL |
| Login | Toast error | — | — | Pass |

---

## Empty States

| Screen | Empty State | CTA Present | Status |
|---|---|---|---|
| Feed | "No rooms yet" | "Start a room" button | Pass |
| Discover Rooms | "No rooms yet" | None | Needs CTA |
| Discover People | "No suggestions yet" | — | Pass |
| Live | "Nothing live right now" | — | Pass |
| Messages Rooms | Honest empty state | — | Pass |
| Messages Direct | "Coming in V2" | — | Pass |
| Profile Activity | No empty state at all | — | Missing |

---

## Accessibility

| Check | Status | Notes |
|---|---|---|
| aria-label on icon buttons | Partial | Room controls missing some labels |
| Keyboard focus visible | Fail | No focus-visible ring on custom buttons |
| Touch target min 44x44px | Partial | Category chip buttons are 32x28px |
| Color contrast | Pass | Mint on dark background passes WCAG AA |
| Screen reader text | Partial | Live pulsing dot not described |
| Semantic headings | Pass | h1/h2/h3 hierarchy correct |

---

## Retry Flows

| Screen | Retry Button | Status |
|---|---|---|
| Feed | None — must reload page | Needs improvement |
| Discover | None — must reload page | Needs improvement |
| Room join | None — use back nav | Acceptable for V1 |
| Login OTP | No resend timer | P1 — add resend cooldown |

---

## Fixes Applied This Sprint

| ID | Fix | Severity | Status |
|---|---|---|---|
| FIX-001 | Route /live to LivePage in App.tsx | P0 | DONE |
| FIX-002 | NotFound catch-all + RALD dark theme | P0 | DONE |
| FIX-003 | Discover search button routes to People tab | P1 | DONE |
| FIX-004 | Discover "Near Lagos" uses profile.state_id | P1 | DONE |
