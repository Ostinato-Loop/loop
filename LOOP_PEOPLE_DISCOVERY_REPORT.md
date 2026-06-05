# Loop People Discovery Report
**Date:** 2026-06-05
**Author:** RALD Agent — LILCKY STUDIO LIMITED
**Scope:** Integrating `GET /search/related` (rald-auth-core) into the Loop SPA as a native People discovery surface

---

## Executive Summary

Loop now has a live **People tab** in the Discover feed backed by two rald-auth-core endpoints:

| Surface | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| Search box in People tab | `GET /search/related?q=&limit=` | RALD master token | Ranked people search: shared chats → contacts → mutual connections → shared rooms |
| "People you may know" | `GET /graph/suggestions?limit=` | RALD master token | Friends-of-friends ranked by aggregated `connection_score` |

**Two files shipped to the Loop repo:**
1. `artifacts/loop/src/lib/api/people.ts` — typed API client for both endpoints
2. `artifacts/loop/src/pages/discover.tsx` — updated Discover page with People tab

---

## rald-auth-core Endpoint Reference

### `GET /search/related`

**Base URL:** `https://auth.rald.cloud/search/related`
**Auth:** `Authorization: Bearer <rald_master_token>`

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `q` | string | — | — | Search prefix (username / display_name) |
| `limit` | integer | 20 | 50 | Max results returned |

**Ranking algorithm (as implemented in `src/routes/search.ts`):**

```
score = 0
if user is a mutual connection:      score += 10 + connection_score
if username.startsWith(query):       score += 3
if display_name.startsWith(query):   score += 2
results sorted by score DESC
```

**Response shape:**
```json
{
  "results": [
    {
      "user_id": "uuid",
      "username": "ade_olusegun",
      "display_name": "Ade Olusegun",
      "avatar_url": "https://...",
      "is_verified": true,
      "connection_score": 14,
      "rald_id": "RALD-3F2A..."
    }
  ],
  "count": 1,
  "query": "ade"
}
```

**Error cases:**
- `401` — missing or expired RALD master token
- `400` — missing `q` parameter
- `500` — Supabase query error (logged server-side)

---

### `GET /graph/suggestions`

**Base URL:** `https://auth.rald.cloud/graph/suggestions`
**Auth:** `Authorization: Bearer <rald_master_token>`

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | integer | 10 | 50 | Max suggestions returned |

**Algorithm (as implemented in `src/routes/graph.ts`):**

```
1. Fetch the current user's existing connections → existingIds
2. Fetch all connections of those connections (friends of friends)
   — filtered to exclude existingIds
3. Aggregate connection_score across all paths to each candidate
4. Sort by aggregated score DESC, take top N
5. Hydrate with auth_user_profiles
```

**Response shape:**
```json
{
  "suggestions": [
    {
      "user_id": "uuid",
      "username": "maya_ok",
      "display_name": "Maya Okonkwo",
      "avatar_url": "https://...",
      "is_verified": false,
      "mutual_score": 23,
      "rald_id": "RALD-7C1B..."
    }
  ],
  "count": 1
}
```

**Returns empty array when:**
- User has no connections yet (new user)
- None of their connections have further connections
- No RALD master token available

---

## What Was Built

### 1. `artifacts/loop/src/lib/api/people.ts`

A typed API client that:
- Reads `rald_master_token` from `localStorage` (set by cross-app SSO flow in `use-auth.tsx`)
- Reads `VITE_RALD_CORE_URL` env var with fallback to `https://auth.rald.cloud`
- Exports `searchRelatedPeople(query, limit)` → `PersonResult[]`
- Exports `getPeopleSuggestions(limit)` → `PersonSuggestion[]`
- Exports `hasRaldIdentity()` → `boolean` (guards against calling with no token)
- Returns empty arrays (not throws) when no token — safe to call unconditionally

All network errors propagate as `Error` objects with the endpoint path and HTTP status.

### 2. `artifacts/loop/src/pages/discover.tsx`

Updated to include a **People tab** (`FeedTab = "people"`) alongside the existing All / Live / Near me / Trending / Events tabs.

**People tab behaviour:**

| State | What renders |
|-------|-------------|
| No RALD identity token | Prompt to sign in via `profiles.rald.cloud` |
| No query, suggestions loading | `PeopleSkeleton` (4× animated placeholders) |
| No query, suggestions loaded | "People you may know" list from `/graph/suggestions` |
| No query, no suggestions | Empty state: "Join rooms and connect with more people" |
| Query typed (350ms debounce) | Searching… skeleton |
| Query complete, results | Ranked list from `/search/related` |
| Query complete, no results | Empty state: "Try a different name or @handle" |

**`PersonCard` component (inline):**
- Gradient avatar fallback (derived from `user_id` seed for consistency)
- `BadgeCheck` icon for verified users
- `Connect` button (wired to future `POST /graph/connect` — currently renders the UI)
- `connection_score` or `mutual_score` displayed as a caption

**Category filter row hidden on People tab** (not relevant to people search).

---

## Token Flow

```
User lands on loop.rald.cloud
         │
         ▼ (RALD SSO redirect)
profiles.rald.cloud
         │ → auth.rald.cloud/sso/exchange
         │ ← issues RALD JWT
         │
         ▼ (redirect back to loop.rald.cloud?rald_token=TOKEN)
use-auth.tsx AuthProvider
         │ localStorage.setItem("rald_master_token", TOKEN)
         │ → /api/auth/rald-sso → issues Loop JWT
         │ localStorage.setItem("loop_token", LOOP_JWT)
         │
         ▼
people.ts getRaldToken()
         → localStorage.getItem("rald_master_token")
         → Authorization: Bearer <RALD_JWT>
         → auth.rald.cloud/search/related   ✅
         → auth.rald.cloud/graph/suggestions ✅
```

---

## Environment Variables Required

| Variable | Used In | Value (prod) | Fallback |
|----------|---------|--------------|----------|
| `VITE_RALD_CORE_URL` | `people.ts` | `https://auth.rald.cloud` | `https://auth.rald.cloud` |
| `VITE_RALD_AUTH_URL` | `use-auth.tsx` | `https://profiles.rald.cloud` | `https://profiles.rald.cloud` |
| `VITE_API_BASE_URL` | `use-auth.tsx` | `https://loop.rald.cloud` | `""` (relative) |

> `VITE_RALD_CORE_URL` does not yet exist in the Loop Cloudflare Pages config. It defaults safely to `https://auth.rald.cloud` in the current fallback.
> Add it explicitly to Pages → Settings → Environment Variables to make it override-able without a deploy.

---

## What "Connect" Does (Current State vs. Roadmap)

The `Connect` button is rendered in `PersonCard` but currently does not call an API.

**Existing endpoint to wire it to:**
```
POST https://auth.rald.cloud/graph/connect
Authorization: Bearer <rald_master_token>
Content-Type: application/json

{ "target_user_id": "<uuid>", "type": "follow" }
```

This endpoint already exists in `rald-auth-core/src/routes/graph.ts`. Wiring it up requires:
1. Adding `connectToPerson(targetUserId)` to `people.ts`
2. Adding loading state + optimistic UI to `PersonCard`
3. Removing connected users from the suggestions list

This is the natural next step for Sprint 02.

---

## Limitations & Known Issues

| Issue | Detail | Resolution |
|-------|--------|------------|
| `rald_connections` table required | `/search/related` and `/graph/suggestions` both join `rald_connections` in auth.rald.cloud's Supabase. This table is seeded by room activity (`+2/session`), DMs (`+3/thread`), and contact matches (`+5`). New users will see empty results until activity accumulates. | Expected — no action required. |
| Loop API not deployed to production | `loop.rald.cloud/api` returns no response. The RALD SSO exchange (`/api/auth/rald-sso`) cannot complete in production. This means `rald_master_token` is never stored in prod, so people discovery returns empty arrays. | Blocked on **Incident #005** (see CI Recovery Report). Deploy the Loop API Worker to unblock. |
| People search is RALD-graph-only | Only users who have been connected at least once via `rald_connections` rank highly. Brand-new RALD users with no connections get generic text-match results only (`score=0`). | Acceptable for Sprint 01. RALD profile completeness score can be added to ranking in Sprint 02. |
| Suggestion deduplication across pages | If the user scrolls to bottom, there is no pagination yet. | Sprint 02: add cursor-based pagination to `getPeopleSuggestions`. |

---

## Files Shipped

```
loop (Ostinato-Loop/loop):
  artifacts/loop/src/lib/api/people.ts          — NEW: people API client
  artifacts/loop/src/pages/discover.tsx          — UPDATED: People tab added
```

---

## Test Checklist

Manual tests to run once Loop API is deployed to production:

- [ ] People tab appears in the Discover feed tab bar
- [ ] Category chip row hidden when People tab is active
- [ ] "No RALD identity" empty state shown when `rald_master_token` is absent
- [ ] "People you may know" loads from `/graph/suggestions` on mount
- [ ] Skeleton renders during suggestion load
- [ ] Empty state shows when no suggestions
- [ ] Typing in search box triggers `/search/related` after 350ms debounce
- [ ] Clear button (✕) in search box resets results and shows suggestions
- [ ] Verified badge icon shown for `is_verified: true` users
- [ ] `connection_score` / `mutual_score` caption renders correctly
- [ ] Connect button renders and is tappable (no API call yet — Sprint 02)
- [ ] Switching away from People tab and back resets search query
- [ ] No stale error state persists across query changes

---

*Loop People Discovery Report — Ostinato-Loop — June 2026 — LILCKY STUDIO LIMITED*
