# Navigation Audit — Loop V1
**Date:** 2026-06-07

---

## Navigation Architecture

```
App
├── Bottom Navigation (5 items: Feed, Discover, [+Create], Chat, You)
├── Routes
│   ├── /                → Feed
│   ├── /discover        → Discover
│   ├── /messages        → Messages
│   ├── /me              → Profile (MeLaunchPage)
│   ├── /rooms/:roomId   → Room
│   ├── /login           → LoginPage (→ redirect)
│   ├── /onboarding      → OnboardingPage
│   ├── /create          → CreatePage
│   ├── /create/:kind    → CreatePage (with type preselected)
│   └── *                → Navigate to / (catch-all)
```

---

## Bottom Navigation Audit

| Tab | Icon | Route | Active Detection | Works? |
|---|---|---|---|---|
| Feed | Home | `/` | `pathname === "/"` (exact) | ✅ |
| Discover | Compass | `/discover` | `pathname.startsWith("/discover")` | ✅ |
| [+] Create | Plus | Opens `CreateSheet` | — | ✅ |
| Chat | MessageCircle | `/messages` | `pathname.startsWith("/messages")` | ✅ |
| You | User | `/me` | `pathname.startsWith("/me")` | ✅ |

**Issue NAV-001 [P2]:** When user is inside `/rooms/:roomId`, the bottom nav still renders. No nav item is active. The nav should either hide (full-screen room experience) or show the "Feed" tab as contextually active.
- Fix: In `app-shell.tsx`, suppress `BottomNav` when `pathname.startsWith("/rooms/")`. Room page should handle its own back navigation.

**Issue NAV-002 [P2]:** Room page (`/rooms/:id`) is not accessible from any navigation element. Users can only reach rooms by tapping room cards on Feed/Discover. There is no "Rooms I'm in" section in the bottom nav or profile.
- Fix: Consider adding live room indicator to bottom nav when user is in an active room.

**Issue NAV-003 [P3]:** Create button (center "+" in bottom nav) opens `CreateSheet` drawer. The drawer has options: Room, Discussion, Event, Post, Article. Three of five are "coming soon." The drawer does not route directly to `/create` — it opens a modal. This is inconsistent with the `/create` and `/create/:kind` routes.
- Fix: The `CreateSheet` and `CreatePage` should share the same flow or be consolidated.

---

## Auth Navigation Flow

```
Any protected route (user not authenticated)
    → /login
    → [spinner "Connecting to RALD Profiles…"]
    → window.location.href = profiles.rald.cloud/login?...
    → [external OTP]
    → redirect back to loop with ?rald_token=...
    → AuthProvider picks up rald_token
    → /api/auth/rald-sso called
    → JWT stored in localStorage
    → navigate("/") or navigate("/onboarding")
```

**Issue NAV-004 [P1]:** The redirect back from `profiles.rald.cloud` lands on the URL with `?rald_token=TOKEN`. This is the root `/` URL. `AuthProvider` handles the token parameter. But if the user navigates away before AuthProvider processes it, the token is lost.
- Root cause: No loading state shown during SSO token processing.
- Fix: Show "Signing you in…" overlay while `?rald_token` is being processed.

**Issue NAV-005 [P2]:** After successful login, user is navigated to `/` (feed). If user is new (`!profile.onboarded`), `onboarding.tsx` redirects them to `/onboarding`. This creates a redirect chain: `/ → /onboarding`. The home page briefly renders before redirect.
- Fix: In use-auth.tsx, after SSO completion, check `onboarded` flag and navigate directly to `/onboarding` if needed, skipping the feed flash.

---

## Deep Link Navigation

**Issue NAV-006 [P2]:** No deep linking support. If a user shares `loop.rald.cloud/rooms/abc123`, an unauthenticated visitor is redirected to login, then to feed, losing the room context.
- Fix: Store the intended destination in sessionStorage before login redirect, restore after auth completion.

---

## Back Navigation

**Issue NAV-007 [P2]:** Room page has a `← Back` button (ArrowLeft icon). On mobile, Android back gesture also navigates back. But exiting a room via back button does NOT call `leaveRoom()` on browser back — only the in-page back button calls it.
- Root cause: No `beforeunload` or `popstate` listener in room.tsx.
- Fix: Call `leaveRoom()` in the room page's cleanup `useEffect` return function (it may already do this — verify).

---

## Navigation Consistency

| Pattern | Consistent? | Notes |
|---|---|---|
| Back arrow on secondary screens | ✅ Room page has it | Other secondary screens TBD |
| Protected routes redirect to /login | ✅ All screens check auth | — |
| Loading during auth | ⚠️ Blank flash before auth resolves | FE-027 |
| 404 handling | ⚠️ Redirects to / silently | FE-028 |
| Modal vs page for create | ⚠️ Both exist, inconsistent | NAV-003 |
| Active tab highlighting | ✅ Works correctly | — |

---

## Navigation Issue Summary

| ID | Severity | Description |
|---|---|---|
| NAV-001 | P2 | Bottom nav shows during room experience |
| NAV-002 | P2 | No active room indicator in nav |
| NAV-003 | P3 | CreateSheet vs CreatePage inconsistency |
| NAV-004 | P1 | SSO token processing has no loading state |
| NAV-005 | P2 | New user flash: feed renders before onboarding redirect |
| NAV-006 | P2 | Deep links lose destination after auth |
| NAV-007 | P2 | Browser back from room doesn't call leaveRoom |

