# AUDIT/rls-validation.md
**Date:** 2026-06-07  **Auditor:** RALD CTO
**Scope:** Supabase Row-Level Security — every policy, ownership model, permission matrix

---

## Summary

RLS policies are defined and syntax-correct but are effectively bypassed for Loop API requests
because the Supabase JWT secret is not aligned to RALD_JWT_SECRET. The Worker uses the
service-role key for all DB operations (which bypasses RLS by design), providing a server-side
trust boundary. The primary risk is direct Supabase client calls from the frontend.

**RLS Production Score: 4/10 — operator action required to reach 8/10**

---

## Architecture Context

Loop uses a dual-path DB access pattern:

```
Frontend → Worker API (authenticated) → Supabase service-role → DB (RLS bypassed, trust = Worker auth)
Frontend → Supabase client (anon key)  → DB (RLS enforced, but auth.uid() may be NULL)
```

The Worker path is secure because all business logic runs through authenticated endpoints.
The Supabase client path relies on RLS — which requires JWT alignment to work correctly.

---

## Policy Audit

| Table | Policy | Condition | Status |
|-------|--------|-----------|--------|
| profiles | SELECT own profile | auth.uid() = id | ⚠️ uid=NULL if JWT not aligned |
| profiles | UPDATE own profile | auth.uid() = id | ⚠️ uid=NULL if JWT not aligned |
| rooms | SELECT public rooms | is_public = true | ✅ Works without auth |
| rooms | INSERT own room | auth.uid() = host_user_id | ⚠️ uid=NULL |
| rooms | UPDATE own room | auth.uid() = host_user_id | ⚠️ uid=NULL |
| room_participants | SELECT participants | room is public OR participant | ⚠️ uid=NULL |
| room_participants | INSERT join | auth.uid() = user_id | ⚠️ uid=NULL |
| messages | SELECT room messages | participant in room | ⚠️ uid=NULL |
| messages | INSERT message | auth.uid() = sender_id | ⚠️ uid=NULL |
| notifications | SELECT own | auth.uid() = user_id | ⚠️ uid=NULL |
| friend_requests | SELECT own | sender OR receiver = uid | ⚠️ uid=NULL |
| friend_requests | INSERT | auth.uid() = sender_id | ⚠️ uid=NULL |
| moderator_roles | SELECT | room host OR moderator | ⚠️ uid=NULL |

---

## Root Cause: auth.uid() Returns NULL

Supabase evaluates `auth.uid()` by decoding the JWT in the Authorization header using
its own JWT secret (Project Settings → API → JWT Secret). If Loop tokens are signed with
`RALD_JWT_SECRET` but Supabase is configured with a different secret, `auth.uid()` returns
NULL for all Loop JWTs.

**Impact:** All `auth.uid() = ...` policies evaluate to `NULL = <id>` which is always FALSE.
Users see empty results where they should see their own data when using the anon key directly.

---

## Current Mitigation (Server-Side Trust Boundary)

All data-mutating operations go through the Worker API, which:
1. Validates the Loop JWT (RALD_JWT_SECRET)
2. Uses SUPABASE_SERVICE_ROLE_KEY for Supabase calls (bypasses RLS server-side)
3. Enforces ownership checks in application code before any DB write

This means the Worker IS the effective trust boundary. RLS is a defence-in-depth layer that is
not currently enforced for direct client calls. Closed beta risk is low because the anon key
is not exposed for mutation operations in the frontend.

---

## Fix Required (Operator Action — B1)

```
1. Supabase Dashboard → Project Settings → API → JWT Secret
2. Change to "Custom" → paste value of RALD_JWT_SECRET
3. Re-deploy any existing refresh tokens (users must re-authenticate)
4. Verify: run SELECT auth.uid() using a Loop JWT — should return correct UUID
```

No code changes required. One-time operator action.

---

## Room Ownership Model

```
Host (creator) → can start/end room, promote speakers, remove participants
Moderator      → can raise/lower hands, mute participants
Speaker        → can publish audio (LiveKit grant)
Listener       → can subscribe to audio (read-only)
```

All role transitions go through Worker endpoints with auth checks before any Supabase write.

---

## Recommendations

| Priority | Action | Owner |
|----------|--------|-------|
| P0 | Align Supabase JWT secret = RALD_JWT_SECRET (B1) | Operator |
| P1 | After alignment: audit each policy with test user JWT | Engineer |
| P2 | Add RLS integration test suite (supabase/tests/) | Engineer |
| P3 | Restrict anon key: disable anon for mutation tables | Operator |
| P4 | Enable Supabase audit log for service-role queries | Operator |
