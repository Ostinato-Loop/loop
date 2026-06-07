# AUDIT/identity-unification-plan.md
**Date:** 2026-06-06
**Sprint:** Production Recovery — Identity Architecture
**Status:** PLAN — ready for engineering execution
**Depends on:** AUDIT/supabase-jwt-integration.md (prerequisite investigation)

---

## Problem Statement

The RALD ecosystem currently has **two incompatible identity systems running in
parallel** within the same application (Loop). Each system issues JWTs signed
with a different secret, uses a different UUID namespace, and stores a different
claim structure. This makes it impossible to enforce ownership at the Supabase
RLS layer, because Supabase can only validate JWTs against one configured secret.

**The three structural defects:**

| Defect | OTP path | SSO path |
|---|---|---|
| Signing secret | `LOOP_JWT_SECRET` | `RALD_JWT_SECRET` |
| User UUID namespace | Supabase Auth UUID | RALD UUID |
| `sub` claim present | ✅ Yes | ❌ No (`id` used instead) |

**Impact:** `auth.uid()` is either wrong secret (can't validate) or wrong claim
(no `sub`), so RLS cannot enforce ownership regardless of policy configuration.

---

## Identity Landscape — Evidence

### OTP Auth Path (verify-otp)

Source: `artifacts/cloudflare-worker/src/routes/auth.ts`

```
Phone → Termii OTP → verify → Supabase Admin creates user → get supabase_uuid
→ upsert profile (id = supabase_uuid)
→ sign JWT with LOOP_JWT_SECRET:
  { sub: supabase_uuid, phone, iat, exp, role: "authenticated" }
→ return access_token
```

Stored in `localStorage` as: `loop_token`

### RALD SSO Path (rald-sso)

Source: `artifacts/cloudflare-worker/src/routes/rald-sso.ts`

```
rald_token (RALD JWT, signed by RALD_JWT_SECRET) arrives from auth.rald.cloud
→ verifyRaldJwt(token, RALD_JWT_SECRET) validates it
→ upsert profile (id = rald.id — RALD UUID)
→ return access_token: rald_token  ← THE TOKEN IS NOT RE-SIGNED
```

Stored in `localStorage` as: `loop_token`

The `rald_token` payload:
```json
{ "id": "<rald-uuid>", "email": "...", "role": "user", "appId": "loop", "iat": ..., "exp": ... }
```
No `sub` claim. Signed with `RALD_JWT_SECRET`.

### /me Endpoint — Dual-Secret Validation

```typescript
let payload = await verifyJwt(token, c.env.RALD_JWT_SECRET);    // try SSO first
if (!payload && c.env.LOOP_JWT_SECRET) {
  payload = await verifyJwt(token, c.env.LOOP_JWT_SECRET);       // fallback to OTP
}
const userId = (payload.id ?? payload.sub) as string;            // handles both claim shapes
```

The `/me` handler uses a deliberate fallback chain to accept both token types.
This works for API calls through the worker (which has access to both secrets),
but Supabase (which has only ONE JWT secret) cannot replicate this logic.

### Supabase Usage

Both user types write the same tables with the same column shapes. The UUID
stored in `profiles.id` differs by auth path:

| Auth path | `profiles.id` value |
|---|---|
| OTP | Supabase Auth UUID (e.g., `"a1b2c3d4-..."`) |
| SSO | RALD UUID (e.g., `"e5f6a7b8-..."`) |

Both are valid UUIDs. They are in different namespaces — a user who signs in
via OTP and later via SSO would have **two separate profile rows** if the phone
and email don't share a UUID.

---

## Unification Strategy

### Chosen Approach: Unify on `RALD_JWT_SECRET` + Re-sign All Tokens

**Why RALD_JWT_SECRET and not LOOP_JWT_SECRET:**
- RALD is the canonical identity authority across the ecosystem
- `RALD_JWT_SECRET` is already shared with auth.rald.cloud, the Messenger, and the API server
- `LOOP_JWT_SECRET` is a Loop-local secret that was introduced as a workaround
- Long-term: LOOP_JWT_SECRET should be deprecated once token TTL is shortened

**What changes:**

| Component | Before | After |
|---|---|---|
| OTP token signing secret | `LOOP_JWT_SECRET` | `RALD_JWT_SECRET` |
| SSO token | Pass-through (not re-signed) | Re-signed with `RALD_JWT_SECRET` |
| SSO token `sub` claim | ❌ Missing | ✅ Added (`sub = rald.id`) |
| OTP token `id` claim | ❌ Missing | ✅ Added (`id = supabase_uuid`) for backward compat |
| Supabase JWT secret | Unknown/default | `RALD_JWT_SECRET` |

**What does NOT change:**
- `profiles.id` values in the database — no data migration required
- The `/me` fallback chain — stays backward-compatible until all old tokens expire
- The frontend `getLoopToken()` / `authedSupabase()` — no changes needed
- SSO users' RALD UUID stays as their profile identity
- OTP users' Supabase Auth UUID stays as their profile identity

---

## Implementation Plan

### Phase 0 — Apply Safe Partial RLS Now (No Engineering Required)

Apply `notifications` and `friend_requests` policies from migration 004.
These tables are never accessed via the anon key — service_role bypasses all
policies. Closes the critical private data exposure immediately.

**Operator action** (Supabase SQL Editor — `onxdcikfttdmnhofsuwo`):

```sql
-- SAFE TO RUN NOW — no JWT changes needed
-- Closes: every user's notifications readable by anyone with the anon key

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

**Risk:** Zero — service_role bypasses all of these.

---

### Phase 1 — Fix `verify-otp`: Re-key to `RALD_JWT_SECRET`

**File:** `artifacts/cloudflare-worker/src/routes/auth.ts`

**Change:** In the `verify-otp` handler, switch the JWT signing secret from
`LOOP_JWT_SECRET` to `RALD_JWT_SECRET` and add the `id` claim for backward
compatibility with the `/me` fallback chain.

**Before:**
```typescript
const jwtSecret = c.env.LOOP_JWT_SECRET;
if (!jwtSecret) {
  console.error("[auth/verify-otp] LOOP_JWT_SECRET is not configured ...");
  return c.json({ error: "Service configuration error. Please try again later." }, 500);
}
const accessToken = await signJwt(
  {
    sub: userId,
    phone: normalized,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    role: "authenticated",
  },
  jwtSecret,
);
```

**After:**
```typescript
const jwtSecret = c.env.RALD_JWT_SECRET;
if (!jwtSecret) {
  console.error("[auth/verify-otp] RALD_JWT_SECRET is not configured ...");
  return c.json({ error: "Service configuration error. Please try again later." }, 500);
}
const accessToken = await signJwt(
  {
    sub: userId,           // Supabase Auth UUID — required by Supabase auth.uid()
    id: userId,            // backward compat with /me fallback (payload.id ?? payload.sub)
    phone: normalized,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    role: "authenticated",
  },
  jwtSecret,
);
```

**Backward compatibility:** The `/me` handler tries `RALD_JWT_SECRET` first,
so newly issued tokens will validate immediately. Old tokens (signed with
`LOOP_JWT_SECRET`) continue to validate via the fallback until they expire
(30-day TTL → fully cleared by 2026-07-06).

**Supabase compatibility:** Once Supabase JWT secret = `RALD_JWT_SECRET` (Phase 3),
all OTP tokens will be validated and `auth.uid()` = Supabase Auth UUID.

---

### Phase 2 — Fix `rald-sso`: Re-sign with `RALD_JWT_SECRET` + Add `sub`

**File:** `artifacts/cloudflare-worker/src/routes/rald-sso.ts`

**Problem:** The handler currently returns `body.rald_token` as-is. This is the
raw RALD JWT from auth.rald.cloud. It contains `id` but not `sub`, and its
expiry is 24 hours (RALD session TTL). Loop users expect longer-lived tokens.

**Change:** After validating the RALD token, issue a new Loop-scoped JWT signed
with `RALD_JWT_SECRET` that includes `sub`, a Loop-appropriate TTL, and both
`id` and `sub` claims.

**Before:**
```typescript
return c.json({
  access_token: body.rald_token,   // ← pass-through, not re-signed
  user: { id: rald.id, email: rald.email ?? null, phone: rald.phone ?? null, role: rald.role ?? "user" },
});
```

**After:**
```typescript
const jwtSecret = c.env.RALD_JWT_SECRET;
if (!jwtSecret) {
  return c.json({ error: "Service configuration error." }, 500);
}
const loopToken = await signLoopJwt(
  {
    sub: rald.id,                  // RALD UUID — required by Supabase auth.uid()
    id: rald.id,                   // backward compat
    email: rald.email ?? null,
    phone: rald.phone ?? null,
    role: rald.role ?? "user",
    source: "rald-sso",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7-day Loop session
  },
  jwtSecret,
);
return c.json({
  access_token: loopToken,         // ← Loop-signed, 7 days, has sub
  user: { id: rald.id, email: rald.email ?? null, phone: rald.phone ?? null, role: rald.role ?? "user" },
});
```

The `signLoopJwt` function is the existing `signJwt` function — same code, just
called from rald-sso.ts. Import it from a shared helper or duplicate the inline
implementation.

**TTL decision:** 7 days for SSO tokens (down from RALD's 24-hour TTL — users
don't re-auth on every Loop visit, but shorter than OTP's 30 days to align with
RALD session lifecycle).

**Silent auth compatibility:** The `GET /auth/silent` handler validates the
cookie token against `RALD_JWT_SECRET`. After Phase 2, the cookie contains the
RALD token (as before — silent auth reads from cookie, not localStorage). The
new Loop token is stored in localStorage. These are two separate tokens:
- Cookie: RALD master token (24h, signed by auth.rald.cloud with RALD_JWT_SECRET) → silent auth
- localStorage `loop_token`: Loop-issued token (7d, signed by loop-api with RALD_JWT_SECRET) → Supabase RLS

This is the correct separation of concerns.

---

### Phase 3 — Set Supabase JWT Secret = `RALD_JWT_SECRET`

**When:** After Phase 1 and Phase 2 are deployed and verified (at least 15 minutes
of live traffic to confirm tokens are correct in production).

**How:** Supabase Dashboard → Project `onxdcikfttdmnhofsuwo` →
Project Settings → API → JWT Settings → JWT Secret → paste `RALD_JWT_SECRET` value

**Effect:**
- Supabase validates `Authorization: Bearer <token>` headers using `RALD_JWT_SECRET`
- OTP tokens (Phase 1): `sub` = Supabase Auth UUID → `auth.uid()` resolves ✅
- SSO tokens (Phase 2): `sub` = RALD UUID → `auth.uid()` resolves ✅
- Messenger Realtime: brief disconnect, auto-reconnects in < 5 seconds ✅
- All API server / CF Worker ops: service_role, bypasses RLS → unaffected ✅
- Old `LOOP_JWT_SECRET`-signed tokens still in localStorage: fail Supabase validation
  → writes denied for those users → they re-authenticate via OTP/SSO → get new token ✅
  (tokens have 30-day TTL; graceful degradation over ~30 days)

---

### Phase 4 — Apply Full Migration 004 Write Policies

**When:** After Phase 3 is confirmed working (verify with a test room creation
from both an OTP user and an SSO user).

**How:** Supabase SQL Editor → run `supabase/migrations/004_rls_hardening.sql`
(already committed to the `loop` repo — no code changes needed).

**Effect:** All write operations (createRoom, joinRoom, sendMessage,
sendReaction, onboarding persist) now enforced at the database layer.
Any attempt to write as a different user is rejected at the DB level,
regardless of application-layer bypasses.

---

### Phase 5 — Deprecate `LOOP_JWT_SECRET`

**When:** 2026-07-06 (30 days after Phase 1 deploy — all OTP tokens issued
before the change will have expired).

**How:** 
1. Remove the `/me` fallback: `if (!payload && c.env.LOOP_JWT_SECRET) ...`
2. Remove `LOOP_JWT_SECRET` from CF Worker secrets (Cloudflare Dashboard)
3. Update the `CloudflareEnv` type definition to remove `LOOP_JWT_SECRET`

**Effect:** Single signing secret across the entire ecosystem. `/me` validates
with `RALD_JWT_SECRET` only.

---

## UUID Namespace Analysis

After unification, Loop will still have two UUID namespaces in `profiles.id`:

| User type | `profiles.id` value | Source |
|---|---|---|
| OTP users (existing) | Supabase Auth UUID | Created by Supabase Admin API during OTP verify |
| SSO users (existing) | RALD UUID | Set by rald-sso handler from `rald.id` |
| OTP users (future) | Supabase Auth UUID | Unchanged |
| SSO users (future) | RALD UUID | Unchanged |

**This is acceptable** as long as one user never authenticates via BOTH methods
with the same real-world identity (same phone + same email from different systems).
If they do, they get two separate Loop profiles.

### Future Consideration: Identity Linking

To allow the same real person to use both OTP and SSO without creating duplicate
profiles, a future identity linking layer would be needed:

```sql
CREATE TABLE profile_identity_links (
  profile_id    UUID REFERENCES profiles(id),
  provider      TEXT NOT NULL,   -- 'rald-sso' | 'otp'
  provider_id   TEXT NOT NULL,   -- the UUID from that provider
  linked_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (provider, provider_id)
);
```

This is out of scope for the recovery sprint. Document it as a Phase H+
architectural item.

---

## Token Lifecycle After Unification

```
OTP Login:
  Phone + OTP → verify-otp → signs with RALD_JWT_SECRET
    { sub: supabase_uuid, id: supabase_uuid, phone, role: "authenticated", exp: +30d }
  Stored as: localStorage["loop_token"]
  Supabase sees: auth.uid() = supabase_uuid ✅

SSO Login:
  rald_token arrives → rald-sso validates → re-signs with RALD_JWT_SECRET
    { sub: rald_uuid, id: rald_uuid, email, role, source: "rald-sso", exp: +7d }
  Stored as: localStorage["loop_token"]
  rald_token stored as: localStorage["rald_master_token"] (unchanged)
  Supabase sees: auth.uid() = rald_uuid ✅

Silent Auth (cookie):
  rald_session cookie → /auth/silent → validates with RALD_JWT_SECRET
    → returns new loop_token (re-signed, 7d)
  Supabase sees: auth.uid() = rald_uuid ✅

/me endpoint:
  Validates with RALD_JWT_SECRET → reads (payload.id ?? payload.sub)
  Both claim shapes resolve correctly ✅
```

---

## Testing Protocol

### Before Phase 3 (JWT secret change) — Engineering Gate

All tests must pass with the updated CF Worker deployed to production.

**Test 1: OTP token structure**
```bash
# Sign in with phone OTP, capture the access_token
# Decode at jwt.io — verify:
# 1. alg: HS256
# 2. sub: present (UUID format)
# 3. id: present (same UUID as sub)
# 4. role: "authenticated"
# 5. Signature verifies with RALD_JWT_SECRET (not LOOP_JWT_SECRET)
```

**Test 2: SSO token structure**
```bash
# Sign in via RALD SSO, capture access_token from rald-sso response
# Decode at jwt.io — verify:
# 1. alg: HS256
# 2. sub: present (RALD UUID)
# 3. id: present (same UUID as sub)
# 4. source: "rald-sso"
# 5. Signature verifies with RALD_JWT_SECRET
# 6. exp is 7 days from now (NOT 24h RALD token TTL)
```

**Test 3: /me endpoint**
```bash
curl -H "Authorization: Bearer <otp_token>" https://loop-api.rald.cloud/api/auth/me
# Expect: { user: { id: <uuid>, phone: "..." }, profile: { ... } }

curl -H "Authorization: Bearer <sso_token>" https://loop-api.rald.cloud/api/auth/me
# Expect: { user: { id: <uuid>, email: "..." }, profile: { ... } }
```

**Test 4: Supabase write with authedSupabase() (pre-phase 3 baseline)**
```bash
# With Supabase JWT secret still default (not RALD_JWT_SECRET)
# Create a room from the frontend — should FAIL with 42501
# This confirms migration 004 write policies are active and blocking
```

### After Phase 3 — Functional Verification

**Test 5: Room creation — OTP user**
```bash
# Sign in via OTP → create room → verify:
# 1. Room appears in listRooms() response
# 2. host_id matches user.id
# 3. profile_id matches room host_id
```

**Test 6: Room creation — SSO user**
```bash
# Sign in via RALD SSO → create room → same verification as Test 5
```

**Test 7: Join room as different user — should enforce ownership**
```bash
# User A creates room
# User B tries to setRoomLive(roomId, false) — should get 42501
# This confirms UPDATE policy is enforced
```

**Test 8: Notification isolation**
```bash
# Fetch notifications with anon key (no Bearer token)
SELECT * FROM notifications WHERE recipient_id = '<any-uuid>';
# Expected: 0 rows (policy requires auth.uid() match)
```

**Test 9: Messenger Realtime**
```bash
# After JWT secret change — verify typing indicators and presence
# still work in Messenger (should auto-reconnect within 5 seconds)
```

---

## Rollback Plan

### Rollback Phase 1 or 2 (CF Worker changes)

Cloudflare Dashboard → Workers & Pages → loop-api → Deployments →
click the previous deployment → Rollback. Takes effect in < 30 seconds.

Old `LOOP_JWT_SECRET`-signed tokens in users' localStorage continue to work
via the `/me` fallback chain until expiry.

### Rollback Phase 3 (Supabase JWT secret change)

Supabase Dashboard → Project Settings → API → JWT Settings → JWT Secret →
restore previous value (store it before changing).

Supabase Auth sessions (not used by Loop) would be briefly invalidated and
then re-established on next login — zero user-visible impact.

### Rollback Phase 4 (RLS migration 004 write policies)

Run the rollback SQL from `AUDIT/supabase-jwt-integration.md` (section 8)
in Supabase SQL Editor. Restores `USING(true)` on all write tables.
Takes effect immediately — no redeploy required.

---

## Risk Register

| Risk | Severity | Phase | Probability | Mitigation |
|---|---|---|---|---|
| Old LOOP_JWT_SECRET tokens fail Supabase writes during 30-day transition | MEDIUM | 3 | HIGH (certain) | Graceful: reads still work; users re-auth on next write |
| SSO 7-day token TTL breaks silent auth flow | LOW | 2 | LOW | Silent auth uses cookie (RALD 24h token), not loop_token |
| Supabase JWT secret rotation invalidates Supabase Auth sessions | LOW | 3 | CERTAIN | Loop does not use Supabase Auth sessions; zero user impact |
| Messenger Realtime disconnects briefly | LOW | 3 | LIKELY | Auto-reconnects < 5s; presence/typing indicators recover |
| OTP + SSO same user gets two profiles | MEDIUM | ongoing | LOW (requires same user on both paths) | Acceptable for recovery sprint; identity linking is Phase H+ |
| RALD_JWT_SECRET not set in CF Worker | CRITICAL | 1 | POSSIBLE | Hard fail with 500 error already coded in verify-otp |

---

## Execution Timeline

| Phase | Action | Owner | Effort | Dependency |
|---|---|---|---|---|
| 0 | Apply partial RLS (notifications + friend_requests) | Operator | 5 min | None — safe now |
| 1 | Update verify-otp to sign with RALD_JWT_SECRET + add `id` claim | Engineering | 30 min | None |
| 1 | Deploy CF Worker | Engineering | 10 min | Phase 1 code |
| 1 | Verify OTP token in jwt.io (Test 1 + 3) | Engineering | 15 min | Phase 1 deploy |
| 2 | Update rald-sso to re-sign with RALD_JWT_SECRET + add `sub` | Engineering | 30 min | None (parallel with 1) |
| 2 | Deploy CF Worker (with both 1 + 2 changes) | Engineering | 10 min | Phase 1+2 code |
| 2 | Verify SSO token in jwt.io (Test 2 + 3) | Engineering | 15 min | Phase 2 deploy |
| 3 | Set Supabase JWT secret = RALD_JWT_SECRET | Operator | 2 min | Phase 1+2 verified |
| 3 | Run Tests 5–9 | Engineering | 30 min | Phase 3 set |
| 4 | Apply migration 004 full SQL | Operator | 5 min | Phase 3 verified |
| 4 | Run Tests 5–8 again (confirm RLS active) | Engineering | 15 min | Phase 4 applied |
| 5 | Remove LOOP_JWT_SECRET fallback from /me | Engineering | 20 min | 2026-07-06 (30d after Phase 1) |
| 5 | Remove LOOP_JWT_SECRET from CF secrets | Operator | 5 min | Phase 5 code deployed |

**Total engineering time:** ~2.5 hours across 2 sessions
**Total operator time:** ~30 minutes
**Calendar time to full RLS enforcement:** 1–2 days

---

## Files to Change

| Repo | File | Phase | Change |
|---|---|---|---|
| loop | `artifacts/cloudflare-worker/src/routes/auth.ts` | 1 | Sign with RALD_JWT_SECRET, add `id` claim |
| loop | `artifacts/cloudflare-worker/src/routes/rald-sso.ts` | 2 | Re-sign instead of pass-through, add `sub`, 7d TTL |
| loop | `supabase/migrations/004_rls_hardening.sql` | 4 | Apply to DB (already committed — no code change) |
| loop | `artifacts/cloudflare-worker/src/routes/auth.ts` | 5 | Remove LOOP_JWT_SECRET fallback from /me |

---

## Definition of Done

- [ ] Phase 0: `notifications` + `friend_requests` have scoped RLS policies applied
- [ ] Phase 1: All OTP tokens signed with `RALD_JWT_SECRET`, contain both `sub` and `id`
- [ ] Phase 2: All SSO tokens re-signed, contain `sub = rald.id`, 7-day TTL
- [ ] Phase 3: Supabase JWT secret = `RALD_JWT_SECRET`; `auth.uid()` resolves correctly for both user types
- [ ] Phase 4: Migration 004 applied; room creation, join, message confirmed working for OTP + SSO users
- [ ] Phase 4: Cross-user write rejected (Test 7 passes)
- [ ] Phase 5 (2026-07-06): `LOOP_JWT_SECRET` removed from codebase and CF secrets
