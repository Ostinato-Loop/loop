# Pages Routing Verification — Loop App
Generated: 2026-06-08

## Verification Method
Each page was audited for `navigate("/login")` calls, `useAuth()` guard patterns,
and any condition that would redirect an unauthenticated user away from the page.

---

## PUBLIC PAGES (must be accessible without auth)

### Feed — `/` → `feed.tsx`
- Auth guard: None ✅
- Unauthenticated behaviour: Shows rooms, trending rooms, regional banner (no login required)
- Result: PASS ✅

### Discover — `/discover` → `discover.tsx`
- Auth guard: None ✅ (guard removed in this sprint)
- Unauthenticated behaviour: Shows all/live/trending rooms; People tab shows search prompt; Near Me requires region (not auth)
- Result: PASS ✅

### Live — `/live` → `live.tsx`
- Auth guard: None ✅ (guard removed + useAuth import removed)
- Unauthenticated behaviour: Loads and displays live rooms every 30s; no user data needed
- Result: PASS ✅

### Search — `/search` → `search.tsx`
- Auth guard: None ✅ (guard + blocking condition removed)
- Unauthenticated behaviour: Shows trending rooms; room search works; people search returns [] (needs RALD token)
- Result: PASS ✅

### Communities — `/communities` → `communities.tsx`
- Auth guard: None ✅ (already correct)
- Unauthenticated behaviour: Fetches public communities; join button prompts sign-in
- Result: PASS ✅

### Room — `/rooms/:id` → `room.tsx`
- Auth guard: None for viewing; joinRoom requires user ✅
- Unauthenticated behaviour: Can view room (spectate); join/speak prompts sign-in
- Result: PASS ✅

---

## PROTECTED PAGES (redirect to /login when not authenticated)

### Notifications — `/notifications` → `notifications.tsx`
- Auth guard: `if (!loading && !user) navigate("/login")` ✅ (FIXED: now waits for loading)
- Previous bug: Redirected immediately without waiting for auth to resolve
- Result: PASS ✅

### Create — `/create` → `create.tsx`
- Auth guard: `if (!loading && !user) navigate("/login")` ✅
- Result: PASS ✅

### Messages — `/messages` → `messages.tsx`
- Auth guard: Properly waits for loading ✅
- Result: PASS ✅

### Me — `/me` → `me-launch.tsx`
- Auth guard: Present and correct ✅
- Result: PASS ✅

### Onboarding — `/onboarding` → `onboarding.tsx`
- Auth guard: `if (!loading && !user) navigate("/login")` ✅
- Result: PASS ✅

---

## SIGN-OUT FLOW

| Step | Before | After |
|------|--------|-------|
| 1 | POST /api/auth/signout (clears cookie) | POST /api/auth/signout (clears cookie) — unchanged |
| 2 | Clear localStorage | Clear localStorage — unchanged |
| 3 | ❌ Redirect to profiles.rald.cloud/logout | ✅ Redirect to window.location.origin + "/" |

Result: Sign-out now stays in Loop. ✅
