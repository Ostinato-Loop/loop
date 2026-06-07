# AUDIT/identity-unification-verification.md
**Date:** 2026-06-07
**Sprint:** Identity Unification Sprint — IDN-001
**Status:** IMPLEMENTATION COMPLETE — operator verification required before Phase 3

---

## Before Architecture (Pre-IDN-001)

```
┌─────────────────────────────────────────────────────────────────────┐
│ OTP Auth Path                                                        │
│                                                                      │
│  Phone → Termii OTP → verify-otp                                     │
│    signing:  LOOP_JWT_SECRET                    ← DIFFERENT SECRET   │
│    claims:   { sub, phone, role, iat, exp }     ← MISSING iss/aud/email │
│    userId:   Supabase Auth UUID                                      │
│                                                                      │
│  requireAuth middleware → validates RALD_JWT_SECRET → REJECTS OTP    │
│  tokens → OTP users CANNOT access protected routes                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ RALD SSO Auth Path                                                   │
│                                                                      │
│  auth.rald.cloud → rald_token → rald-sso handler                    │
│    signing:  RALD_JWT_SECRET (but NOT re-signed)  ← PASS-THROUGH    │
│    claims:   { id, email, role, iat, exp }        ← MISSING sub/iss/aud │
│    userId:   RALD UUID                                               │
│                                                                      │
│  rald_token returned as-is as access_token                          │
│  auth.uid() → NULL (no sub claim) even if secret matches            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Supabase RLS State                                                   │
│                                                                      │
│  JWT secret: default (project creation)                             │
│  Validation: fails for ALL tokens (wrong secret)                    │
│  auth.uid(): NULL for all users                                      │
│  Policies:   USING(true) — open world (migration 004 NOT applied)   │
└─────────────────────────────────────────────────────────────────────┘
```

### Pre-IDN-001 Problem Matrix

| Check | OTP users | SSO users | Status |
|-------|-----------|-----------|--------|
| `/me` resolves | ✅ (RALD + LOOP fallback) | ✅ (RALD primary) | Partial |
| `requireAuth` middleware | ❌ FAILS | ✅ Works | Broken for OTP |
| `auth.uid()` resolves | ❌ (wrong secret) | ❌ (no `sub`) | Broken |
| Protected routes (rooms, etc.) | ❌ 401 | ✅ Works | Broken for OTP |
| Standard claim set | ❌ Missing iss/aud/email | ❌ Missing sub/iss/aud | Non-conformant |

---

## After Architecture (Post-IDN-001)

```
┌─────────────────────────────────────────────────────────────────────┐
│ OTP Auth Path (FIXED)                                                │
│                                                                      │
│  Phone → Termii OTP → verify-otp                                     │
│    signing:  RALD_JWT_SECRET              ← UNIFIED                 │
│    claims:   { sub, email: null, role,                              │
│               iss, aud, iat, exp,                                   │
│               id, phone, source: "otp" } ← STANDARD + backward-compat │
│    userId:   Supabase Auth UUID                                      │
│                                                                      │
│  requireAuth middleware → validates RALD_JWT_SECRET → ACCEPTS ✅    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ RALD SSO Auth Path (FIXED)                                           │
│                                                                      │
│  auth.rald.cloud → rald_token → rald-sso handler                    │
│    validates:  verifyJwt(rald_token, RALD_JWT_SECRET)               │
│    re-signs:   issueLoopToken() with RALD_JWT_SECRET                │
│    claims:     { sub: rald.id, email, role,                         │
│                 iss, aud, iat, exp,                                  │
│                 id, source: "rald-sso" } ← STANDARD                 │
│    userId:     RALD UUID                                             │
│                                                                      │
│  Loop token returned (not raw rald_token)                           │
│  auth.uid() → rald.id (once Supabase JWT secret aligned)            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Silent Auth Path (FIXED)                                             │
│                                                                      │
│  Cookie → verifyJwt(RALD_JWT_SECRET) → issueLoopToken()            │
│  Returns Loop-scoped token (source: "silent"), not cookie pass-thru │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Shared JWT Library (NEW)                                             │
│                                                                      │
│  src/lib/jwt.ts                                                      │
│    signJwt()   — HMAC-SHA256 signing                                │
│    verifyJwt() — HMAC-SHA256 verification + expiry check            │
│    JWT_ISSUER  = "https://loop-api.rald.cloud"                      │
│    JWT_AUDIENCE = "loop"                                             │
│    TTL_OTP_S  = 2_592_000  (30 days)                                │
│    TTL_SSO_S  =   604_800  (7 days)                                 │
│                                                                      │
│  Replaces: inline signJwt in routes/auth.ts                         │
│  Replaces: inline verifyJwt in routes/auth.ts                       │
│  Replaces: inline verifyRaldJwt in routes/rald-sso.ts               │
│  Replaces: inline verifyRaldJwt in middleware/auth.ts               │
└─────────────────────────────────────────────────────────────────────┘
```

### Post-IDN-001 State Matrix

| Check | OTP users | SSO users | Status |
|-------|-----------|-----------|--------|
| `/me` resolves | ✅ (RALD primary, LOOP fallback) | ✅ (RALD primary) | ✅ |
| `requireAuth` middleware | ✅ RALD_JWT_SECRET token | ✅ RALD_JWT_SECRET token | ✅ FIXED |
| `auth.uid()` (pending Phase 3) | ✅ sub present | ✅ sub present | Ready for Phase 3 |
| Protected routes (rooms, etc.) | ✅ Works | ✅ Works | ✅ FIXED |
| Standard claim set (sub/email/role/iss/aud) | ✅ All present | ✅ All present | ✅ Conformant |
| Existing LOOP_JWT_SECRET sessions | ✅ /me fallback | N/A | ✅ Backward-compat |

---

## Backward Compatibility Verification

### Session Continuity

| Session type | Impact after IDN-001 deploy |
|-------------|----------------------------|
| Existing OTP sessions (LOOP_JWT_SECRET tokens) | `/me` continues working via fallback. Protected routes (createRoom, joinRoom, etc.) fail with 401 — users re-authenticate via OTP → receive new RALD_JWT_SECRET token → all routes work |
| Existing SSO sessions (raw RALD tokens) | `/me` continues working (RALD_JWT_SECRET validates). Users who re-authenticate via SSO receive the new re-signed Loop token. New token has `sub` — critical for Phase 3 |
| New OTP sessions (post-deploy) | Full RALD_JWT_SECRET token. All routes work immediately |
| New SSO sessions (post-deploy) | Full Loop-scoped token with sub. All routes work immediately |

### API Compatibility

| Endpoint | Before | After | Breaking? |
|----------|--------|-------|-----------|
| `POST /api/auth/verify-otp` | Returns LOOP_JWT_SECRET token | Returns RALD_JWT_SECRET token | No — same shape `{ ok, access_token, is_new_user, user }` |
| `POST /api/auth/rald-sso` | Returns raw rald_token | Returns Loop-scoped token | No — same shape `{ access_token, user }` |
| `GET /api/auth/silent` | Returns raw cookie token | Returns Loop-scoped token | No — same shape `{ valid, user, access_token }` |
| `GET /api/auth/me` | Works | Works (primary + fallback) | No |
| `requireAuth` middleware | Fails for OTP | Works for all | No (OTP was already broken) |

### JWT Claim Backward Compatibility

Old consumers of the JWT payload read `payload.id ?? payload.sub` for the user ID.
Both `id` and `sub` are present in new tokens — the fallback reads the same value.
No breaking change.

---

## Test Protocol

**Before Phase 3 (Supabase JWT secret change) — all tests must pass:**

### Test 1: OTP Token Structure

```bash
# 1. Sign in via OTP (POST /api/auth/verify-otp)
# 2. Copy access_token from response
# 3. Decode at jwt.io

# Verify:
# ✅ alg: HS256
# ✅ sub: present (UUID format)
# ✅ email: null
# ✅ role: "authenticated"
# ✅ iss: "https://loop-api.rald.cloud"
# ✅ aud: "loop"
# ✅ exp: iat + 2592000 (30 days)
# ✅ id: same value as sub
# ✅ phone: "+234..."
# ✅ source: "otp"
# ✅ Signature verifies with RALD_JWT_SECRET
# ❌ Signature must NOT verify with LOOP_JWT_SECRET alone
```

### Test 2: SSO Token Structure

```bash
# 1. Sign in via RALD SSO (POST /api/auth/rald-sso with rald_token)
# 2. Copy access_token from response

# Verify:
# ✅ alg: HS256
# ✅ sub: present (RALD UUID)
# ✅ email: user's email (not null)
# ✅ role: "user" (or user's RALD role)
# ✅ iss: "https://loop-api.rald.cloud"
# ✅ aud: "loop"
# ✅ exp: iat + 604800 (7 days, NOT 24h RALD TTL)
# ✅ id: same value as sub
# ✅ source: "rald-sso"
# ✅ Signature verifies with RALD_JWT_SECRET
# ✅ Token is DIFFERENT from the input rald_token (re-signed, not pass-through)
```

### Test 3: /me Endpoint — Both User Types

```bash
curl -H "Authorization: Bearer <otp_token>" https://loop-api.rald.cloud/api/auth/me
# Expected: 200 { user: { id, phone, role }, profile: { ... } }

curl -H "Authorization: Bearer <sso_token>" https://loop-api.rald.cloud/api/auth/me
# Expected: 200 { user: { id, email, role }, profile: { ... } }
```

### Test 4: requireAuth Middleware — OTP User (was broken before)

```bash
# With new OTP token (RALD_JWT_SECRET-signed):
curl -X POST https://loop-api.rald.cloud/api/rooms \
  -H "Authorization: Bearer <new_otp_token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Room"}'
# Expected: 200 or 201 (NOT 401)
# Before IDN-001 this would return 401 — confirms the fix
```

### Test 5: Silent Auth

```bash
curl -H "Cookie: rald_session=<rald_cookie>" \
  https://loop-api.rald.cloud/api/auth/silent
# Expected: { valid: true, user: { ... }, access_token: "<new_loop_token>" }
# Verify access_token is DIFFERENT from the cookie value (re-signed)
# Verify access_token has sub, iss, aud, source: "silent"
```

### Test 6: Old LOOP_JWT_SECRET Token — /me Backward Compat

```bash
# Take a token issued before IDN-001 deploy (signed with LOOP_JWT_SECRET)
curl -H "Authorization: Bearer <old_loop_jwt_secret_token>" \
  https://loop-api.rald.cloud/api/auth/me
# Expected: 200 (fallback accepts it)
# After 2026-07-07: Expected 401 (fallback removed)
```

---

## Phase 3 Readiness Checklist

Do NOT proceed to Phase 3 (Supabase JWT secret change) until all items below are checked:

- [ ] Test 1 passed: OTP token has standard claims, signed with RALD_JWT_SECRET
- [ ] Test 2 passed: SSO token has standard claims + `sub`, signed with RALD_JWT_SECRET, different from input rald_token
- [ ] Test 3 passed: `/me` works for both OTP and SSO users
- [ ] Test 4 passed: OTP user can create a room (requireAuth middleware fixed)
- [ ] Test 5 passed: Silent auth returns re-signed Loop token
- [ ] No error spike in Cloudflare Worker logs after deploy (monitor for 15 minutes)
- [ ] Messenger Realtime confirmed working (presence/typing indicators active)

---

## Phase 3 Operator Action (After Checklist Complete)

**DO NOT EXECUTE until all Phase 3 Readiness items are checked.**

1. Open Supabase Dashboard → Project `onxdcikfttdmnhofsuwo`
2. Navigate to: Project Settings → API → JWT Settings
3. Set JWT Secret = `RALD_JWT_SECRET` value
4. Save

**Immediate effects:**
- All RALD_JWT_SECRET-signed tokens now validate in Supabase
- `auth.uid()` = sub claim value (Supabase Auth UUID for OTP users, RALD UUID for SSO users)
- Messenger Realtime: brief channel reconnect (< 5s), auto-recovers

**After Phase 3, run Phase 4 (migration 004 full write policies).**

---

## Rollback Procedure

### If Phase 1+2 Deploy Causes Issues

**Symptoms:** `POST /api/auth/verify-otp` returns errors, `/api/auth/rald-sso` returns errors

**Action:** Cloudflare Dashboard → Workers & Pages → loop-api → Deployments →
select previous deployment → Rollback. Takes effect in < 30 seconds.

**User impact:** Existing sessions unaffected. Users who tried to re-authenticate
during the bad deploy need to retry.

### If Phase 3 Causes Issues

**Symptoms:** Frontend writes fail, users see permission errors

**Action:** Revert Supabase JWT Secret in Dashboard. Store old value before changing.

**Note:** This is also the rollback for migration 004 if applied. See
`AUDIT/supabase-jwt-integration.md` section 8 for the rollback SQL.

---

## CI Governance Fixes (Included in IDN-001)

The deploy workflow was failing because `LOOP_JWT_SECRET` was not set in GitHub secrets,
but the deploy step hard-failed on its absence despite it being `@deprecated` (optional)
in `CloudflareEnv`. Additionally, the worker test suite was not run in CI — only
the frontend tests were.

**Fixed in this sprint:**

| Fix | File | Change |
|-----|------|--------|
| Worker tests added to CI | `.github/workflows/ci.yml` | Added `working-directory: artifacts/cloudflare-worker` test step |
| Worker tests added to Deploy | `.github/workflows/deploy.yml` | Added worker test step before deploy |
| `LOOP_JWT_SECRET` push non-fatal | `.github/workflows/deploy.yml` | `exit 1` → `echo NOTICE ... (skip)` |
| Worker typecheck explicit | `.github/workflows/ci.yml` | Added explicit `artifacts/cloudflare-worker` typecheck step |
