# AUDIT/identity-unification-plan.md
**Date:** 2026-06-07 (revised from 2026-06-06)
**Sprint:** Identity Unification Sprint
**Status:** PHASES 1–2 IMPLEMENTED — see identity-unification-verification.md
**Depends on:** AUDIT/supabase-jwt-integration.md (prerequisite investigation)
**Claim standard:** AUDIT/jwt-claim-standard.md

---

## Mission

Unify authentication across the RALD ecosystem so that:

1. `auth.rald.cloud` is the single identity authority
2. All ecosystem JWTs use `RALD_JWT_SECRET`
3. All ecosystem JWTs carry the standard claim set: `sub`, `email`, `role`, `iss`, `aud`, `exp`
4. The dual-token architecture (`LOOP_JWT_SECRET` + `RALD_JWT_SECRET`) is eliminated

---

## Problem Statement

Loop had two parallel auth paths with incompatible JWT structures:

| Defect | OTP path (before IDN-001) | SSO path (before IDN-001) |
|--------|--------------------------|--------------------------|
| Signing secret | `LOOP_JWT_SECRET` | `RALD_JWT_SECRET` (pass-through, no re-sign) |
| `sub` claim | ✅ Present (Supabase Auth UUID) | ❌ Missing (used `id` instead) |
| `email` claim | ❌ Missing | ✅ Present |
| `role` claim | ✅ Present (`"authenticated"`) | ✅ Present |
| `iss` claim | ❌ Missing | ❌ Missing |
| `aud` claim | ❌ Missing | ❌ Missing |

Consequence: Supabase cannot validate either token type against a single JWT secret.
`auth.uid()` = NULL → RLS write policies deny all frontend writes.

---

## Current State (before IDN-001)

```
OTP login path:
  Phone → Termii OTP → verify-otp handler
    → Supabase Admin API creates user (supabase_uuid)
    → sign JWT with LOOP_JWT_SECRET: { sub: supabase_uuid, phone, role: "authenticated" }
    → return access_token
    localStorage["loop_token"] = LOOP_JWT_SECRET-signed token

RALD SSO login path:
  RALD token (auth.rald.cloud) → rald-sso handler
    → verifyRaldJwt(rald_token, RALD_JWT_SECRET) validates
    → upsert profile (id = rald.id)
    → return access_token: rald_token  ← PASS-THROUGH, not re-signed
    localStorage["loop_token"] = raw RALD token (signed by auth.rald.cloud)

/me endpoint:
    validates with RALD_JWT_SECRET → fallback to LOOP_JWT_SECRET
    reads userId = payload.id ?? payload.sub

requireAuth middleware:
    validates with RALD_JWT_SECRET only
    (OTP users FAIL middleware → cannot access protected routes!)
```

**Critical gap:** OTP users have never been able to access middleware-protected routes.
Their LOOP_JWT_SECRET tokens fail the RALD_JWT_SECRET-only middleware check silently.

---

## Target State (after IDN-001)

```
OTP login path:
  Phone → Termii OTP → verify-otp handler
    → Supabase Admin API creates user (supabase_uuid)
    → sign JWT with RALD_JWT_SECRET:
        { sub, email: null, role, iss, aud, iat, exp, id, phone, source: "otp" }
    localStorage["loop_token"] = RALD_JWT_SECRET-signed, standard claims

RALD SSO login path:
  RALD token (auth.rald.cloud) → rald-sso handler
    → verifyJwt(rald_token, RALD_JWT_SECRET) validates
    → upsert profile (id = rald.id)
    → issueLoopToken: re-sign with RALD_JWT_SECRET:
        { sub: rald.id, email, role, iss, aud, iat, exp, id, source: "rald-sso" }
    localStorage["loop_token"] = Loop-scoped token, RALD_JWT_SECRET-signed

Silent auth:
    cookie token → verify → re-sign as Loop token (source: "silent")

/me endpoint:
    validates with RALD_JWT_SECRET (primary)
    fallback: LOOP_JWT_SECRET (deprecated — for existing sessions until 2026-07-07)

requireAuth middleware:
    validates with RALD_JWT_SECRET → works for ALL users (OTP + SSO) ✅
```

---

## Implementation: Five Phases

### Phase 0 — Safe Partial RLS Now (No Engineering Required)

Apply `notifications` and `friend_requests` policies from migration 004.
These tables are only accessed via the Express API server (service_role, bypasses RLS).

**Operator action — Supabase SQL Editor (`onxdcikfttdmnhofsuwo`):**

```sql
DROP POLICY IF EXISTS "notif_read"   ON public.notifications;
DROP POLICY IF EXISTS "notif_insert" ON public.notifications;
DROP POLICY IF EXISTS "notif_update" ON public.notifications;

CREATE POLICY "notif_select_own" ON public.notifications FOR SELECT
  USING (recipient_id::text = auth.uid()::text);
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE
  USING  (recipient_id::text = auth.uid()::text)
  WITH CHECK (recipient_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "fr_read"   ON public.friend_requests;
DROP POLICY IF EXISTS "fr_insert" ON public.friend_requests;
DROP POLICY IF EXISTS "fr_update" ON public.friend_requests;
DROP POLICY IF EXISTS "fr_delete" ON public.friend_requests;

CREATE POLICY "fr_select_own" ON public.friend_requests FOR SELECT
  USING (sender_id::text = auth.uid()::text OR receiver_id::text = auth.uid()::text);
CREATE POLICY "fr_insert_own" ON public.friend_requests FOR INSERT
  WITH CHECK (sender_id::text = auth.uid()::text);
CREATE POLICY "fr_update_involved" ON public.friend_requests FOR UPDATE
  USING  (receiver_id::text = auth.uid()::text OR sender_id::text = auth.uid()::text)
  WITH CHECK (receiver_id::text = auth.uid()::text OR sender_id::text = auth.uid()::text);
CREATE POLICY "fr_delete_own" ON public.friend_requests FOR DELETE
  USING (sender_id::text = auth.uid()::text AND status = 'pending');
```

Risk: **Zero** — service_role bypasses all policies.

---

### Phase 1 — Fix `verify-otp`: Re-key to `RALD_JWT_SECRET` ✅ IMPLEMENTED

**Status:** Committed — IDN-001

**Change in `artifacts/cloudflare-worker/src/routes/auth.ts`:**
- Import `signJwt`, `verifyJwt`, `JWT_ISSUER`, `JWT_AUDIENCE`, `TTL_OTP_S` from `../lib/jwt.js`
- Remove inline `signJwt` and `verifyJwt` functions
- Switch signing from `LOOP_JWT_SECRET` → `RALD_JWT_SECRET`
- Add standard claims: `email: null`, `iss`, `aud`, retain `id` for backward-compat

**New token payload:**
```json
{
  "sub":    "<supabase-auth-uuid>",
  "email":  null,
  "role":   "authenticated",
  "iss":    "https://loop-api.rald.cloud",
  "aud":    "loop",
  "iat":    1749244800,
  "exp":    1751836800,
  "id":     "<supabase-auth-uuid>",
  "phone":  "+234...",
  "source": "otp"
}
```

**Backward compatibility:** `/me` fallback retains `LOOP_JWT_SECRET` acceptance
for existing sessions during 30-day transition. Remove 2026-07-07.

---

### Phase 2 — Fix `rald-sso`: Re-sign with Standard Claims ✅ IMPLEMENTED

**Status:** Committed — IDN-001

**Change in `artifacts/cloudflare-worker/src/routes/rald-sso.ts`:**
- Import `signJwt`, `verifyJwt` from `../lib/jwt.js`
- Remove inline `verifyRaldJwt`
- POST handler: call `issueLoopToken()` instead of returning `rald_token` as-is
- GET `/silent` handler: call `issueLoopToken()` instead of returning cookie token as-is
- Add `sub = rald.id` — CRITICAL for future `auth.uid()` resolution

**New token payload:**
```json
{
  "sub":    "<rald-uuid>",
  "email":  "user@example.com",
  "role":   "user",
  "iss":    "https://loop-api.rald.cloud",
  "aud":    "loop",
  "iat":    1749244800,
  "exp":    1749849600,
  "id":     "<rald-uuid>",
  "source": "rald-sso"
}
```

---

### Phase 3 — Set Supabase JWT Secret = `RALD_JWT_SECRET`

**Status:** PENDING OPERATOR ACTION — requires Phase 1+2 deployed and verified

**Prerequisites:**
- [ ] Phase 1 deployed to production
- [ ] Phase 2 deployed to production
- [ ] Token structure verified: OTP and SSO tokens both have `sub` and are signed with `RALD_JWT_SECRET`
- [ ] Verification document complete: AUDIT/identity-unification-verification.md

**Operator action:**
Supabase Dashboard → Project `onxdcikfttdmnhofsuwo` →
Project Settings → API → JWT Settings → JWT Secret → paste `RALD_JWT_SECRET` value

**Effect:**
- `auth.uid()` resolves for OTP users (sub = Supabase Auth UUID) ✅
- `auth.uid()` resolves for SSO users (sub = RALD UUID) ✅
- Messenger Realtime: brief reconnect (< 5 seconds) ✅
- All API server / CF Worker ops: service_role — unaffected ✅

---

### Phase 4 — Apply Full Migration 004 Write Policies

**Status:** PENDING — after Phase 3 verified

**Prerequisite:** Phase 3 must be confirmed working (test room creation for OTP + SSO users)

**Action:** Run `supabase/migrations/004_rls_hardening.sql` in Supabase SQL Editor.
Already committed to repo — no code changes needed.

---

### Phase 5 — Deprecate `LOOP_JWT_SECRET`

**Status:** SCHEDULED — 2026-07-07

**Actions:**
1. Remove `/me` LOOP_JWT_SECRET fallback block from `routes/auth.ts`
2. Remove `LOOP_JWT_SECRET?` from `types/env.ts`
3. Delete `LOOP_JWT_SECRET` from Cloudflare Worker secrets (Dashboard)
4. Remove deploy step for `LOOP_JWT_SECRET` from `.github/workflows/deploy.yml`

---

## Files Changed (Phases 1–2)

| Repo | File | Change |
|------|------|--------|
| loop | `artifacts/cloudflare-worker/src/lib/jwt.ts` | NEW — shared JWT utilities |
| loop | `artifacts/cloudflare-worker/src/middleware/auth.ts` | Use shared `verifyJwt` from `lib/jwt.ts` |
| loop | `artifacts/cloudflare-worker/src/routes/auth.ts` | IDN-001: RALD_JWT_SECRET, standard claims |
| loop | `artifacts/cloudflare-worker/src/routes/rald-sso.ts` | IDN-001: re-sign, add `sub`, standard claims |
| loop | `.github/workflows/ci.yml` | Add worker tests; explicit worker typecheck |
| loop | `.github/workflows/deploy.yml` | `LOOP_JWT_SECRET` push non-fatal; add worker tests |

---

## Rollback

### Rollback Phase 1+2 (CF Worker changes)

Cloudflare Dashboard → Workers & Pages → loop-api → Deployments →
click previous deployment → Rollback. Takes effect in < 30 seconds.

Old `LOOP_JWT_SECRET` OTP sessions continue working via `/me` fallback.
New SSO sessions: users need to re-authenticate (no functional data loss).

### Rollback Phase 3 (Supabase JWT secret)

Revert the JWT Secret in Supabase Dashboard. Store the previous value before changing.

### Rollback Phase 4 (RLS migration 004)

See rollback SQL in `AUDIT/supabase-jwt-integration.md` section 8.
