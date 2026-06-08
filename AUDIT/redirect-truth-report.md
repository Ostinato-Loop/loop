# Loop Redirect Truth Report
**Date:** 2026-06-08  
**Auditor:** Zero-Illusion Audit Sprint  
**Scope:** All navigation redirects in the Loop SPA — where they actually go

---

## SPA Route Map (App.tsx)

```
/                → <Navigate to="/feed" />
/login           → LoginPage
/onboarding      → OnboardingPage (requireAuth guard)
/feed            → FeedPage (requireAuth guard)
/discover        → DiscoverPage (requireAuth guard)
/create          → CreatePage (requireAuth guard)
/room/:id        → RoomPage (requireAuth guard)
/messages        → MessagesPage (requireAuth guard)
/me              → MeLaunchPage (requireAuth guard)
/*               → <Navigate to="/feed" />  (catch-all)
```

## Auth Guard Behavior (requireAuth)

All protected routes check `user !== null` from `useAuth()`.

```
If user === null (not loaded yet):
  → Shows nothing (AuthProvider sets loading state)

If user === null (auth failed):
  → navigate("/login", { replace: true })

If user exists:
  → Renders the page
```

**Truth:** No infinite redirect loops possible. `AuthProvider` resolves before any route check.

---

## Redirect Inventory

| Trigger | From | To | Conditions |
|---|---|---|---|
| App root | `/` | `/feed` | Always |
| Unknown route | `/*` | `/feed` | Always |
| Not authenticated | Any protected route | `/login` | `user === null` after load |
| RALD SSO complete (new user) | `/login` | `/onboarding` | `is_new_user === true` |
| RALD SSO complete (returning) | `/login` | `/feed` | `is_new_user === false` |
| OTP complete (new user) | `/login` | `/onboarding` | `is_new_user === true` |
| OTP complete (returning) | `/login` | `/feed` | `is_new_user === false` |
| Onboarding complete | `/onboarding` | `/feed` | On form submit |
| Auth expired (AUTH_EXPIRED_EVENT) | Any route | `/login` | Token refresh failed |
| Sign out | `/me` | `/login` | After signOut() |
| RALD SSO button | `/login` | `profiles.rald.cloud` | External redirect |
| "Manage on RALD" link | `/me` | `profiles.rald.cloud` | External link (new tab) |

---

## External Redirects (leave the SPA)

| Trigger | Destination | Relationship |
|---|---|---|
| "Sign in with RALD" button | `${VITE_RALD_AUTH_URL}` (default: `https://profiles.rald.cloud`) | RALD identity platform |
| "Manage on profiles.rald.cloud" | `https://profiles.rald.cloud` | RALD identity platform |

**Finding:** The RALD auth button redirects to `profiles.rald.cloud`. This should be the login page (which then redirects back to Loop). Verify that `profiles.rald.cloud` handles the Loop app redirect correctly (callback URL, return_to parameter).

---

## Dead End Analysis

| Route | Dead End? | Notes |
|---|---|---|
| `/login` (no auth) | No — valid destination | ✅ |
| `/feed` (empty) | No — empty state shown | ✅ |
| `/discover` (empty) | No — empty state shown | ✅ |
| `/create` → "Video Room" | Minor dead end — toast, stays on /create | ⚠️ |
| `/create` → "Social Room" | Minor dead end — toast, stays on /create | ⚠️ |
| `/me` → "Edit profile" | Dead end — button does nothing | ⚠️ |
| `/messages` → "Direct" tab | Honest placeholder — visible coming-soon | ✅ |
| `/room/:id` (invalid ID) | Shows loading then error state | ✅ |

---

## URL Parameter Handling

| Parameter | Route | Handler |
|---|---|---|
| `?rald_token=...` | `/login` | Detected in useEffect, triggers SSO exchange |
| `:id` | `/room/:id` | Used to fetch room data from API |

---

## Verdict

Redirect architecture is clean. No loops, no silent failures. The two notable dead ends ("Edit profile" button, coming-soon room types) are not true dead ends — one is a silent no-op and the others show toasts. The RALD external redirect needs verification that `profiles.rald.cloud` correctly handles the OAuth/SSO callback.

---
*Generated: 2026-06-08 | Sprint: Zero-Illusion Audit*
