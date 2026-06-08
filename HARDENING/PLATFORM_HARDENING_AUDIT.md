# PLATFORM HARDENING AUDIT
**Date:** 2026-06-08  
**Auditor:** Replit Agent — full read of all 100 Ostinato-Loop repositories  
**Scope:** loop, loop-core, rald-auth-core, rald-realtime, messenger, supabase migrations, shared infrastructure  
**Method:** Source analysis, migration audit, API route verification, dependency mapping

---

## Hardening Principle

> Do not build new features until what exists works reliably for real users on real African networks.

Every issue in this document is ranked by the question: **"Does this prevent a real user in Lagos from having a real conversation tomorrow?"**

---

## Overall Platform Score: 61 / 100

| Layer | Score | Verdict |
|-------|-------|---------|
| Auth (`rald-auth-core`) | 74/100 | Works. Needs session refresh + Clerk. |
| Audio (`rald-realtime`) | 52/100 | Backend correct. publishAudio stub must be removed. Secrets unverified. |
| Frontend (`loop` app) | 68/100 | Full social graph. Supabase-backed. LiveKit integrated. Needs hardening. |
| Messenger (`messenger`) | 55/100 | Schema applied. Worker built. Not confirmed deployed. |
| Database (Supabase) | 72/100 | 12 migrations applied. RLS active. Missing `auth_user_profiles` search. |
| Infrastructure | 48/100 | No DR plan. No unified observability. Secrets unverified. |

---

## CRITICAL — Breaks the Product (Fix Before Any External User)

### C-1 🔴 `publishAudio()` is a stub in `rald-realtime`
**File:** `rald-realtime/src/providers/livekit.ts`  
**Evidence:**
```typescript
async publishAudio(_roomId: string, userId: string): Promise<{ trackId: string }> {
  return { trackId: `lk-audio-${userId}-${Date.now()}` };  // FAKE
}
```
Same stubs exist for `publishVideo()`, `subscribeAudio()`, `subscribeVideo()`.  
**Root cause:** WebRTC negotiation must happen on the client, not the server. The server issues a token (correct). The client uses `livekit-client` SDK to connect directly.  
**Fix:** Remove all four stub methods from the server entirely. Document that audio is client-side only. The token from `POST /rooms/:id/join` is the server's complete role.  
**Impact if ignored:** Any monitoring, health check, or integration test that calls these methods will get a fake trackId and report success while no audio exists.

### C-2 🔴 Provider secrets cannot be confirmed set in production
**File:** `rald-realtime/wrangler.toml`  
**Evidence:** Only `ENVIRONMENT` and `RALD_AUTH_URL` are in `[vars]`. No secrets visible (correct — secrets should not be in files) but no deployment log confirms they were set.  
**Required secrets:**
- `RALD_JWT_SECRET` — every API call fails 401 without this
- `LIVEKIT_URL` + `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` — P2 provider
- `CALLS_APP_ID` + `CALLS_APP_SECRET` — Cloudflare RealtimeKit P1
- `TENCENT_SDK_APP_ID` + `TENCENT_SECRET_KEY` — P3 failover  

**Verify immediately:**
```bash
wrangler secret list --name rald-realtime
wrangler secret list --name rald-auth-core
```
**Impact if ignored:** All users hear nothing. All joins return 500.

### C-3 🔴 Two divergent frontends with no consolidation plan
**Evidence:**

| | `loop` repo | `loop-core` repo |
|---|---|---|
| Last push | 2026-06-08 | 2026-06-07 |
| Size | 2,208KB | 108KB |
| Backend | Supabase + Cloudflare Worker | CF Workers KV only |
| Auth | Clerk SSO + JWT | JWT guest register only |
| Communities | ✅ Full (9 migrations) | ❌ None |
| Social graph | ✅ Follows, friend requests | ❌ None |
| LiveKit | ✅ `use-livekit-room.ts` | ✅ `useLiveRoom.ts` |
| Deployed | ✅ `loop.rald.cloud` | ❌ Not on Pages |

**Decision required:** The `loop` repo is the canonical product. `loop-core` was built as a clean beta prototype. They must not diverge further.  
**Fix:** Canonicalize `loop` as source of truth. Archive or delete `loop-core`. Redirect all CI/CD, documentation, and deployment references to `loop`.

### C-4 🔴 Supabase migration `auth_user_profiles` not applied
**Evidence:** `BETA_LAUNCH_AUDIT.md` P2-1: "search returns 0 results"  
**Affected route:** `GET /search` in `rald-auth-core/src/routes/search.ts` calls `search_users_public` RPC  
**Migration file:** `rald-auth-core/supabase/migrations/20260605_search_rpc.sql` — pushed to GitHub, not confirmed applied to production Supabase.  
**Fix:** In Supabase dashboard, run the SQL in `20260605_search_rpc.sql` and `20260605_search_profile_columns.sql`.

---

## HIGH — Degrades Core Flows for Real Users

### H-1 🟠 JWT access tokens expire in 24h with no refresh
**File:** `rald-auth-core/src/lib/session.ts`  
**Evidence:** Token expiry is 24h. No `POST /auth/refresh` endpoint exists.  
**Impact:** Users active at hour 23 get silently logged out mid-session. Particularly bad during long rooms.  
**Fix:**
1. Add `POST /auth/refresh` — validate existing token, issue new one with 24h extension
2. In `loop/src/hooks/use-auth.tsx`, check token expiry on app focus and call refresh if < 2h remaining

### H-2 🟠 Termii SMS balance: 10 NGN
**Evidence:** `BETA_LAUNCH_AUDIT.md` P1-1  
**Impact:** `POST /auth/send-otp` (phone flow) fails for all users. Email OTP still works.  
**Fix:** Top up Termii account at termii.com. The API integration in `rald-auth-core/src/lib/otp.ts` is correct.  
**This is the primary registration path for Nigerian mobile users.**

### H-3 🟠 Clerk SSO not configured
**Evidence:** `BETA_LAUNCH_AUDIT.md` P1-2 — `clerk_full: false`  
**Impact:** Users who register on `profiles.rald.cloud` or via Clerk SSO cannot enter Loop. Cross-app sessions broken.  
**Fix:** Set `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` as Wrangler secrets in `rald-auth-core`, then `wrangler deploy`.

### H-4 🟠 Community migrations applied but activation not confirmed
**Files:** `loop/supabase/migrations/005_communities.sql` through `008_community_activation.sql`  
**Status:** 8 community-related migration files exist. Migration 007 has both a rollback and a v2 version — unclear which was applied last.  
**Risk:** If `007_community_v2_rollback.sql` was applied instead of `007_community_v2_schema.sql`, community data model is partially rolled back.  
**Fix:** In Supabase SQL editor, run:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```
Confirm: `communities`, `community_members`, `community_moderators`, `community_rules`, `community_rooms` all exist.

### H-5 🟠 Room creation rate limit absent in `loop` app
**Evidence:** `BETA_LAUNCH_AUDIT.md` P2-5 — "No rate limiting on POST /rooms"  
**File:** `loop/artifacts/loop/src/lib/api/rooms.ts` — creates rooms via `POST /api/rooms`  
**Risk:** One user can spam empty rooms. Discovery becomes noise. Trust erodes.  
**Fix:** Add per-user room creation limit (max 3 rooms per 24h) in `loop/artifacts/cloudflare-worker/src/routes/rooms.ts` using Cloudflare KV.

### H-6 🟠 `messenger.rald.cloud` worker not confirmed deployed
**File:** `messenger/workers/loop-messenger-api/wrangler.toml`  
**Evidence:** Worker code exists. Supabase migrations exist (`COMBINED_APPLY_TO_SUPABASE.sql` — 38KB). Deploy status unknown.  
**Impact:** All messenger routes return 404 or 503. No messages can be sent or received.  
**Fix:** 
1. Apply `messenger/workers/loop-messenger-api/supabase/migrations/COMBINED_APPLY_TO_SUPABASE.sql` to Supabase
2. `cd messenger/workers/loop-messenger-api && wrangler deploy`

---

## MEDIUM — Erodes Trust and Polish

### M-1 🟡 No Content Security Policy headers
**Impact:** XSS attacks possible. Particularly relevant for audio rooms where malicious room titles could inject scripts.  
**Fix:** Add CSP headers in `loop/artifacts/loop/vite.config.ts`:
```typescript
headers: {
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' *.rald.cloud *.supabase.co wss:; media-src blob: mediastream:; script-src 'self' 'unsafe-inline'"
}
```

### M-2 🟡 `og:image` missing from `loop.rald.cloud`
**Evidence:** `loop/artifacts/loop/public/opengraph.jpg` exists (28KB). Not confirmed referenced in `index.html`.  
**Fix:** Verify `<meta property="og:image" content="/opengraph.jpg">` in `loop/artifacts/loop/index.html`.

### M-3 🟡 `cross-app.ts` references hardcoded domain list
**File:** `loop/artifacts/loop/src/lib/cross-app.ts`  
**Risk:** Adding a new RALD subdomain requires a code change and re-deploy. Should be config-driven.

### M-4 🟡 No `404` page for deep links on Cloudflare Pages
**File:** `loop/artifacts/loop/public/_redirects` exists with SPA redirect rules.  
**Verify:** `/room/:id` deep links from push notifications must resolve to the correct React route.

### M-5 🟡 Region registry (migration 009) — 29KB SQL not confirmed applied
**File:** `loop/supabase/migrations/009_rald_region_registry.sql` (29,408 bytes)  
**Impact:** Nigerian LGA/LCDA data not populated. Community nearby detection (`GET /api/communities/nearby`) returns empty or national fallback for all users.  
**Fix:** Apply `009_rald_region_registry.sql` to Supabase. This is a one-time seed — run once, never again.

---

## Architecture Debt (Non-Blocking for Beta, Must Fix for 1,000 Users)

| ID | Issue | Risk at Scale | Effort |
|----|-------|---------------|--------|
| AD-1 | Room audio state is LiveKit-only — no fallback if LiveKit billing lapses | Total audio blackout | 1 day: health check + alerting |
| AD-2 | KV-backed rooms in `rald-realtime` expire in 24h — persistent Supabase rooms exist in `loop`, sync not implemented | Two sources of truth for rooms | 1 week |
| AD-3 | `loop/src/integrations/supabase/types.ts` (12KB auto-generated) — not confirmed in sync with current Supabase schema | Type errors in prod | Run `supabase gen types typescript` after each migration |
| AD-4 | `loop-messenger` uses its own Supabase instance — no shared user graph with `loop` | Siloed identities | Implement shared `user_id` FK |
| AD-5 | No database connection pooling (Supabase direct connection only) | Connection exhaustion at 500 concurrent users | Add Supabase Pooler (Transaction mode) |
| AD-6 | Cloudflare Worker CPU limit 10ms per request — no queue for AI summary generation | AI summaries timeout at peak | Use `ctx.waitUntil()` + Queue (already referenced in shared types) |

---

## Hardening Checklist (Ordered by Impact)

```
CRITICAL — Do these before any external user
[ ] C-1: Remove publishAudio/Video stub methods from rald-realtime
[ ] C-2: wrangler secret list on both rald-realtime and rald-auth-core — confirm all secrets set
[ ] C-3: Declare loop as canonical repo. Stop committing to loop-core.
[ ] C-4: Apply 20260605_search_rpc.sql + 20260605_search_profile_columns.sql to Supabase

HIGH — Do these in sprint 1
[ ] H-1: Add POST /auth/refresh + proactive refresh in use-auth.tsx
[ ] H-2: Top up Termii balance
[ ] H-3: Set CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY in rald-auth-core
[ ] H-4: Confirm all 9 community migration tables exist in Supabase
[ ] H-5: Add per-user room creation rate limit
[ ] H-6: Apply COMBINED_APPLY_TO_SUPABASE.sql + wrangler deploy on messenger worker

MEDIUM — Do these before 100 users
[ ] M-1: Add CSP headers
[ ] M-2: Verify og:image in index.html
[ ] M-4: Test all _redirects patterns with deep links
[ ] M-5: Apply 009_rald_region_registry.sql
```

---

*Prepared for LILCKY STUDIO LIMITED — Loop Hardening Directive — 2026-06-08*
