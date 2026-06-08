# Redirect Inventory — Loop App
Generated: 2026-06-08

## Summary
Complete inventory of all navigation redirects in the Loop codebase.  
Redirects to `profiles.rald.cloud` from public pages have been eliminated.

---

## 1. INTENDED REDIRECTS (by design — user-initiated)

### `login.tsx`
- **Trigger:** User visits `/login` (unauthenticated)  
- **Destination:** `{RALD_AUTH_UI{'}'}/login?app_id=loop&redirect_to=…` (profiles.rald.cloud)  
- **Reason:** Loop uses RALD SSO. The login page IS the SSO redirect entry point.  
- **Status:** ✅ Correct. Users who explicitly navigate to /login expect to be taken to sign-in.

### `cross-app.ts → openRaldApp()`
- **Trigger:** User explicitly clicks a cross-app link (e.g. "Open in Messenger")
- **Destination:** Target RALD app URL with SSO token, or profiles.rald.cloud if no token
- **Status:** ✅ Correct. User-initiated only. No automatic calls.

### `settings.tsx` (anchor links)
- **Trigger:** User clicks "Manage on profiles.rald.cloud" or "Delete account"
- **Destination:** profiles.rald.cloud, opens in `target="_blank"`
- **Status:** ✅ Correct. Opens new tab. Does not navigate current app.

---

## 2. FIXED REDIRECTS (bugs — now resolved)

### `use-auth.tsx → signOut()`
- **Was:** After sign-out, redirected to `profiles.rald.cloud/logout`
- **Fix:** Now redirects to `window.location.origin + "/"` (stays in Loop)
- **Impact:** Signing out no longer takes users to profiles.rald.cloud

### `discover.tsx` — DiscoverPage
- **Was:** `useEffect(() => { if (!user) navigate("/login"); }, [user, navigate])`
- **Problem:** No loading check → fired immediately on mount before auth resolved
- **Fix:** Guard removed entirely. Discover is a public page.

### `live.tsx`
- **Was:** `useEffect(() => { if (!loading && !user) navigate("/login"); })`
- **Fix:** Guard removed entirely. Live rooms are public content.

### `search.tsx`
- **Was:** Auth guard `navigate("/login")` + blocking `if (loading || !user) return …`
- **Fix:** Both removed. Search is a public page; rooms are public, people search returns [] without auth.

### `notifications.tsx`
- **Was:** `useEffect(() => { if (!user) navigate("/login"); }, [user, navigate])` — no loading check
- **Fix:** `useEffect(() => { if (!loading && !user) navigate("/login"); }, [loading, user, navigate])`
- **Reason:** Notifications is private (requires auth), but must wait for loading to complete before redirecting.

---

## 3. PAGES BY AUTH REQUIREMENT

| Page | Route | Requires Auth | Guard Type |
|------|-------|---------------|------------|
| Feed | `/` | ❌ Public | None |
| Discover | `/discover` | ❌ Public | None (FIXED) |
| Live | `/live` | ❌ Public | None (FIXED) |
| Search | `/search` | ❌ Public | None (FIXED) |
| Communities | `/communities` | ❌ Public | None |
| Room view | `/rooms/:id` | ❌ Public (spectate) | None |
| Onboarding | `/onboarding` | ✅ Private | Waits for loading |
| Create | `/create` | ✅ Private | Waits for loading |
| Messages | `/messages` | ✅ Private | Waits for loading |
| Notifications | `/notifications` | ✅ Private | Waits for loading (FIXED) |
| Me | `/me` | ✅ Private | Waits for loading |
| Settings | `/settings` | ✅ Private | None (uses conditional render) |
| Login | `/login` | N/A | SSO redirect (by design) |
