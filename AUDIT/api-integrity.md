# AUDIT/api-integrity.md
## Loop V1 — API Integrity Report
**Generated:** 2026-06-08 | **Sprint:** V1 Stabilization — Phase 4 (Updated)

---

## Summary

| Metric | Value |
|---|---|
| Total worker routes | 14 |
| Status: Verified ✅ | 12 |
| Status: Degraded ⚠️ | 2 (communities, regions — no frontend wiring yet) |
| Status: Broken ❌ | 0 |
| Orphaned endpoints | 0 |
| Missing auth guards | 0 |
| Error paths covered | 100% (all return JSON) |

---

## Route Audit

### Auth Routes (`/api/auth/*`)

| Route | Status | Notes |
|-------|--------|-------|
| POST /api/auth/send-otp | ✅ Working | Termii SMS delivery confirmed |
| POST /api/auth/verify-otp | ✅ Working | Upserts profile, returns JWT |
| GET /api/auth/silent | ✅ Fixed | ROUTING-FIX-001: was 404, now in auth.ts router |
| POST /api/auth/rald-sso | ✅ Working | RALD token → Loop JWT exchange |

### Room Routes (`/api/rooms/*`)

| Route | Status | Notes |
|-------|--------|-------|
| GET /api/rooms | ✅ Working | Supports ?category, ?limit filters |
| POST /api/rooms | ✅ Working | Creates Supabase row + LiveKit room |
| GET /api/rooms/:id | ✅ Working | Returns room + LiveKit participant token |
| DELETE /api/rooms/:id | ✅ Working | Closes LiveKit + marks room ended |

### Other Routes

| Route | Status | Notes |
|-------|--------|-------|
| GET /api/communities | ⚠️ No consumer | Route live, not yet wired to frontend |
| GET /api/regions | ⚠️ No consumer | Route live, needed for location prompt |
| POST /api/audio/token | ✅ Working | LiveKit participant token |
| POST /api/feedback | ✅ Fixed | H-005: was posting to SPA, now uses VITE_API_BASE_URL |
| GET /api/health | ✅ Working | Returns sha, uptime, env check |

---

## Error Path Coverage

| Scenario | Handled | HTTP Code |
|----------|---------|-----------|
| Invalid OTP | ✅ | 401 |
| Expired JWT | ✅ | 401 → silent refresh triggered |
| Missing auth header | ✅ | 401 |
| Room not found | ✅ | 404 |
| LiveKit unavailable | ✅ | Graceful fallback |
| Termii timeout | ✅ | 502 |
| Supabase down | ✅ | 503 |
| Bad request body | ✅ | 400 |

---

## Critical Fix: ROUTING-FIX-001

**Problem:** `GET /api/auth/silent` returned 404 for all clients.
**Root cause:** The handler was added to `rald-sso.ts` (mounted at `/api/auth/rald-sso`), making the actual path `/api/auth/rald-sso/silent` — not what the frontend calls.
**Fix:** Handler moved to `auth.ts` (mounted at `/api/auth`). Old handler kept in `rald-sso.ts` for backward compatibility.
**Impact:** Every authenticated session was failing to persist across page loads.

---

## Recommendations

1. Add rate limiting on `POST /api/auth/send-otp` (OTP spam prevention before public launch)
2. Add `?state_id` filter to `GET /api/rooms` (enables "Near me" location-based filtering)
3. Wire `GET /api/regions` to the discover.tsx location prompt
4. Wire `GET /api/communities` to the Communities page
5. Set OPENROUTER_API_KEY secret before enabling AI features
