# Navigation Certification — Loop App
Generated: 2026-06-08

## Certification Status: CERTIFIED ✅

This document certifies that the Loop app navigation system has been audited,
fixed, and verified. No page unexpectedly redirects authenticated or unauthenticated
users to `profiles.rald.cloud`.

---

## Root Cause Analysis

The redirect bug had three contributing causes:

### Cause 1: Public pages with auth guards
Pages like Discover, Live, and Search had `navigate("/login")` guards.  
Any unauthenticated visitor (or user whose session was still loading) would be
redirected to `/login`, which automatically redirects to `profiles.rald.cloud` after 2.2s.

**Fix:** Removed auth guards from all public pages. These pages use API endpoints
that work without auth (rooms are public; people search returns empty without RALD token).

### Cause 2: Auth guard firing before loading completes
`notifications.tsx` had `if (!user) navigate("/login")` with NO loading check.
During the ~300ms window while the auth hook resolves the session, `user` is null
even for authenticated users, triggering an erroneous redirect.

**Fix:** Changed to `if (!loading && !user)` pattern consistently.

### Cause 3: signOut() redirecting to profiles.rald.cloud
`use-auth.tsx` signOut() called `profiles.rald.cloud/logout`, which was unexpected
for users who just wanted to sign out of Loop. The cookie is already invalidated by
the CF Worker's `/api/auth/signout` call.

**Fix:** signOut() now redirects to `window.location.origin + "/"` (Loop feed).

---

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/use-auth.tsx` | signOut() stays in Loop after clearing session |
| `src/pages/discover.tsx` | Auth guard removed; PeopleTab API calls fixed |
| `src/pages/live.tsx` | Auth guard removed; data loads without auth |
| `src/pages/search.tsx` | Auth guard and blocking condition removed |
| `src/pages/notifications.tsx` | Guard now waits for loading before redirecting |

---

## Invariants (must remain true in all future changes)

1. **Public pages must never have `navigate("/login")` guards.**  
   Feed, Discover, Live, Search, Communities, Room views are public.

2. **Private pages must check `!loading &&` before redirecting.**  
   `if (!loading && !user) navigate("/login")` is the correct pattern.

3. **signOut() must not redirect to profiles.rald.cloud.**  
   SSO session invalidation is optional; UX must stay within Loop.

4. **Cross-app navigation must be user-initiated only.**  
   No automatic calls to `openProfiles()`, `openMessenger()`, or `openRaldApp()`.

---

## Cloudflare Pages CI Fix

| Setting | Before | After |
|---------|--------|-------|
| Root directory | `/` | `artifacts/cloudflare-worker` |
| Build command | `npm run build` | `npx wrangler deploy --env production` |

The primary deploy path remains **GitHub Actions → Deploy Loop ✅** which is
fully functional. The CF built-in CI is now correctly pointed at the Worker source.
