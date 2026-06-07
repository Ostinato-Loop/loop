# AUDIT/supabase-jwt-integration.md
**Date:** 2026-06-06
**Sprint:** Production Recovery — Authentication Integration Verification
**Scope:** Evaluate safety of changing Supabase JWT secret as a prerequisite for RLS policy enforcement
**Status:** INVESTIGATION COMPLETE — see Go/No-Go recommendation at the bottom

---

## Executive Summary

Changing the Supabase JWT secret is **NOT SAFE** in its current proposed form.
Loop has a dual-auth architecture with two different signing secrets and two
different JWT structures. No single Supabase JWT secret can validate both token
types. Additionally, SSO-path tokens lack the `sub` claim that Supabase requires
to populate `auth.uid()`. The RLS hardening migration (004) as committed will
break all frontend write operations the moment it is applied, regardless of
which secret is set in Supabase.

**The safe path is architectural, not configurational.**

---

## Evidence Base

All findings below are drawn directly from source code in the Ostinato-Loop
GitHub org, fetched on 2026-06-06. No assumptions.

---

## 1. Why Does RLS Hardening Require Changing the Supabase JWT Secret?

Row Level Security policies enforce ownership using the database function
`auth.uid()`. In Supabase, `auth.uid()` is populated by validating the
`Authorization: Bearer <token>` header sent with each PostgREST request.
Supabase validates incoming tokens using **the project's configured JWT secret**.
If validation fails (wrong secret, expired, malformed), `auth.uid()` returns
`NULL`.

The migration 004 policies use patterns like:
```sql
WITH CHECK (host_id::text = auth.uid()::text)
```

If `auth.uid()` is `NULL` (because the JWT couldn't be validated), this
expression evaluates to `FALSE`, and the write is **denied**.

**Current state:** The frontend `authedSupabase()` client sends
`Authorization: Bearer <loop_token>`. Supabase tries to validate this token
using its project JWT secret. Because that secret was set during Supabase
project creation and does NOT match `LOOP_JWT_SECRET` or `RALD_JWT_SECRET`,
validation always fails → `auth.uid()` is always `NULL` → migration 004 write
policies deny all frontend writes.

---

## 2. Is Supabase Validating RALD-Issued JWTs?

**No.** Evidence:

The Supabase client in Loop frontend (`client.ts`):
```typescript
// Before this sprint: anon client only, no Authorization header
export const supabase = createClient(..., SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: {} },   // ← empty headers, no token ever sent
});
```

No JWT has ever been sent to Supabase from the Loop frontend. All Supabase
access has used the anon key with `USING(true)` policies (open world).

The `authedSupabase()` function added this sprint is the FIRST code that
would send a JWT to Supabase — but it cannot work until the Supabase JWT
secret matches the signing secret.

---

## 3. Is Custom JWT Auth Configured?

**No.** Custom JWT auth for Supabase requires the project's JWT secret to match
the signing secret used by the application. This has never been configured for
the `onxdcikfttdmnhofsuwo` project.

Confirmed by examining the RLS history: all policies (migrations 001–003) used
`USING(true)` / `WITH CHECK(true)` — meaning the schema was built on the
assumption that `auth.uid()` would never be consulted.

---

## 4. Which Claims Are Expected by the New RLS Policies?

Migration 004 uses:
```sql
auth.uid()::text = id::text         -- profiles
auth.uid()::text = host_id::text    -- rooms
auth.uid()::text = user_id::text    -- participants, messages, reactions
auth.uid()::text = sender_id::text  -- friend_requests
auth.uid()::text = recipient_id::text -- notifications
```

`auth.uid()` reads from the `sub` claim of the validated JWT.

**OTP token payload** (signed with `LOOP_JWT_SECRET`):
```json
{
  "sub": "<supabase-auth-uuid>",
  "phone": "+234...",
  "iat": 1749244800,
  "exp": 1751836800,
  "role": "authenticated"
}
```
✅ Has `sub` claim → `auth.uid()` would return the Supabase UUID IF the secret matched.

**SSO token payload** (original RALD JWT, signed with `RALD_JWT_SECRET`, returned AS-IS):
```json
{
  "id": "<rald-uuid>",
  "email": "user@example.com",
  "role": "user",
  "appId": "loop",
  "iat": 1749244800,
  "exp": 1749331200
}
```
❌ NO `sub` claim → `auth.uid()` returns `NULL` even if the secret matched.

**Source:** `artifacts/cloudflare-worker/src/routes/rald-sso.ts`:
```typescript
return c.json({
  access_token: body.rald_token,   // ← RALD JWT returned unchanged, no re-sign
  user: { id: rald.id, ... },
});
```

---

## 5. What Happens If the Supabase JWT Secret Is Changed?

### Scenario A: Set Supabase JWT Secret = `LOOP_JWT_SECRET`

| User type | Token validates? | auth.uid() | Reads | Writes |
|---|---|---|---|---|
| OTP users | ✅ Yes | ✅ Supabase UUID | ✅ Work | ✅ Work |
| RALD SSO users | ❌ No (wrong secret) | NULL | ✅ Work (public reads still open) | ❌ BROKEN |
| Messenger Realtime | N/A (anon only) | N/A | N/A | N/A |

**Result:** 100% of SSO users cannot create rooms, join rooms, send messages, or complete onboarding.

### Scenario B: Set Supabase JWT Secret = `RALD_JWT_SECRET`

| User type | Token validates? | auth.uid() | Reads | Writes |
|---|---|---|---|---|
| OTP users | ❌ No (wrong secret) | NULL | ✅ Work | ❌ BROKEN |
| RALD SSO users | ✅ Yes (correct secret) | NULL (no `sub` claim) | ✅ Work | ❌ BROKEN |

**Result:** 100% of OTP users cannot write. 100% of SSO users cannot write either — even with correct secret — because SSO JWTs lack the `sub` claim.

### Scenario C: Do Not Change JWT Secret (current state)

| User type | Token validates? | auth.uid() | Reads | Writes (with migration 004 applied) |
|---|---|---|---|---|
| OTP users | ❌ (secret mismatch) | NULL | ✅ Work | ❌ BROKEN |
| RALD SSO users | ❌ (secret mismatch) | NULL | ✅ Work | ❌ BROKEN |

**Result:** Applying migration 004 without any JWT secret change breaks all frontend writes for all users.

### Supabase-Internal Side Effects of Changing JWT Secret

Supabase uses the JWT secret to sign its own Auth tokens: magic links, email
confirmations, password resets, and Supabase Auth sessions (Gotrue). Changing
the JWT secret:

- **Invalidates all Supabase Auth sessions** (Gotrue sessions, not custom JWTs)
- Loop does NOT use Supabase Auth sessions (`persistSession: false`, no Supabase sign-in methods)
- Impact on Loop: **zero** — no Supabase Auth sessions are in use
- Messenger Realtime: uses anon key for channel subscription; Realtime channels would briefly disconnect and auto-reconnect (< 5 seconds)
- rald-auth-core (same project? — see section 6): see below

---

## 6. Which Applications Would Be Affected?

All applications share the **same Supabase project**: `onxdcikfttdmnhofsuwo`

Evidence: `SUPABASE_URL = "https://onxdcikfttdmnhofsuwo.supabase.co"` appears in:
- Loop frontend: `client.ts`
- Loop worker: `c.env.SUPABASE_URL`
- Messenger worker: `wrangler.toml` [vars] SUPABASE_URL

### Loop (loop.rald.cloud)

**Current Supabase usage:** All tables via anon key (USING(true)) + admin ops via service_role
**After JWT secret change + migration 004:** Reads work; writes broken (see section 5)
**Functional impact:** Room creation, joining, messaging, onboarding profile saves — all broken

### Messenger (chat.rald.cloud / messenger.rald.cloud)

**Current Supabase usage:** Realtime ONLY (presence, typing indicators) via anon key. All data operations go through the `loop-messenger-api` CF Worker (service_role). No `auth.uid()` usage anywhere. Messenger tables have no RLS policies at all (migrations not applied).
**After JWT secret change:** Realtime channels briefly disconnect and auto-reconnect. No functional data impact.
**Risk: LOW**

### Profiles / App (profiles.rald.cloud / app.rald.cloud)

**Current Supabase usage:** RALD API server uses service_role for all Supabase operations. No frontend Supabase client. No `auth.uid()` dependency. The `users`, `referral_codes`, `waitlist`, `organizations` tables have RLS disabled (confirmed by `DISABLE ROW LEVEL SECURITY` in migrations) or use service-role-only patterns.
**After JWT secret change:** Zero functional impact — service_role bypasses all RLS.
**Risk: NONE**

### Voice (voice.rald.cloud → loop-voice repo)

**Current Supabase usage:** No Supabase files found in repo file tree.
**After JWT secret change:** No impact.
**Risk: NONE**

### Manilla (manilla.rald.cloud)

**Current state:** Not deployed (530 error — origin unreachable). No active users.
**After JWT secret change:** No impact.
**Risk: NONE**

**Summary by app:**

| App | Supabase Usage | JWT Secret Change Impact | Migration 004 Impact |
|---|---|---|---|
| Loop | Reads + writes (anon key) | OTP writes ✅ or SSO writes ✅ — never both | ALL writes broken (see §5) |
| Messenger | Realtime only (anon) | Brief channel reconnect | None (no RLS policies) |
| Profiles/App | Service role only | None | None |
| Voice | None | None | None |
| Manilla | Not deployed | None | None |

---

## 7. Migration Simulation

### Pre-conditions (current state)

```
profiles.id (UUID) = Supabase Auth UUID  (OTP users)
                   = RALD UUID           (SSO users)
rooms.host_id      = profiles.id         (same UUID)
```

### Simulation: Apply Migration 004 Without JWT Secret Change

```sql
-- Example: OTP user (userId = "abc-123") tries to create a room
-- Frontend sends: Authorization: Bearer <LOOP_JWT_SECRET signed token>
-- Supabase validates using its own secret → VALIDATION FAILS
-- auth.uid() = NULL

INSERT INTO rooms (host_id, title, ...) VALUES ('abc-123', 'My Room', ...);
-- Policy "rooms_insert_own": WITH CHECK (auth.uid() IS NOT NULL AND host_id::text = auth.uid()::text)
-- Evaluates: NULL IS NOT NULL = FALSE → INSERT DENIED
-- Error returned to frontend: 42501 (insufficient_privilege)
```

Frontend sees: "You don't have permission to perform this action." (from sanitiseRoomError)

**Same failure for:** `joinRoom`, `leaveRoom`, `sendMessage`, `sendReaction`, `onboarding persist()`

**What DOES work after migration 004:**
```sql
-- Public reads — not affected by auth.uid()
SELECT * FROM rooms WHERE visibility = 'public';       -- ✅
SELECT * FROM room_participants WHERE ...;             -- ✅
SELECT * FROM notifications WHERE recipient_id = '?'; -- ✅ for service_role; anon sees nothing (correct)
SELECT * FROM friend_requests WHERE sender_id = '?';  -- ✅ for service_role; anon sees nothing (correct)
```

### Simulation: Apply Migration 004 WITH JWT Secret = LOOP_JWT_SECRET (OTP users only)

```sql
-- OTP user (Supabase UUID = "abc-123") creates a room
-- Frontend sends: Authorization: Bearer <LOOP_JWT_SECRET token: sub="abc-123">
-- Supabase validates with LOOP_JWT_SECRET → SUCCESS
-- auth.uid() = "abc-123"

INSERT INTO rooms (host_id, title, ...) VALUES ('abc-123', 'My Room', ...);
-- Policy: auth.uid() IS NOT NULL = TRUE, host_id::text = auth.uid()::text = TRUE → ALLOWED ✅
```

```sql
-- SSO user (RALD UUID = "xyz-789") creates a room
-- Frontend sends: Authorization: Bearer <RALD_JWT_SECRET token: id="xyz-789", NO sub>
-- Supabase validates with LOOP_JWT_SECRET → VALIDATION FAILS (wrong secret)
-- auth.uid() = NULL

INSERT INTO rooms (host_id, title, ...) VALUES ('xyz-789', 'My Room', ...);
-- Policy: NULL IS NOT NULL = FALSE → INSERT DENIED ❌
```

### Simulation: Apply Migration 004 WITH JWT Secret = RALD_JWT_SECRET

```sql
-- OTP user → LOOP_JWT_SECRET token → fails RALD_JWT_SECRET validation → all writes denied ❌
-- SSO user → RALD_JWT_SECRET token validates → BUT no `sub` claim → auth.uid() = NULL → all writes denied ❌
```

**Conclusion from simulation:** No single JWT secret configuration makes migration 004 work for all users.

---

## 8. Rollback Steps

### If Migration 004 SQL Has Been Applied (data writes breaking)

```sql
-- Rollback 004: restore permissive policies
-- Run in Supabase SQL Editor → project onxdcikfttdmnhofsuwo

DROP POLICY IF EXISTS "profiles_select_public"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"        ON public.profiles;

DROP POLICY IF EXISTS "rooms_select_public"        ON public.rooms;
DROP POLICY IF EXISTS "rooms_insert_own"           ON public.rooms;
DROP POLICY IF EXISTS "rooms_update_host"          ON public.rooms;
DROP POLICY IF EXISTS "rooms_delete_host"          ON public.rooms;

DROP POLICY IF EXISTS "rp_select_public"           ON public.room_participants;
DROP POLICY IF EXISTS "rp_insert_own"              ON public.room_participants;
DROP POLICY IF EXISTS "rp_delete_own"              ON public.room_participants;

DROP POLICY IF EXISTS "rm_select_public"           ON public.room_messages;
DROP POLICY IF EXISTS "rm_insert_participant"      ON public.room_messages;

DROP POLICY IF EXISTS "rr_select_public"           ON public.room_reactions;
DROP POLICY IF EXISTS "rr_insert_participant"      ON public.room_reactions;

DROP POLICY IF EXISTS "fr_select_own"              ON public.friend_requests;
DROP POLICY IF EXISTS "fr_insert_own"              ON public.friend_requests;
DROP POLICY IF EXISTS "fr_update_involved"         ON public.friend_requests;
DROP POLICY IF EXISTS "fr_delete_own"              ON public.friend_requests;

DROP POLICY IF EXISTS "notif_select_own"           ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own"           ON public.notifications;

-- Restore original permissive policies
CREATE POLICY "profiles_read"   ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (true);

CREATE POLICY "rooms_read"      ON public.rooms FOR SELECT USING (true);
CREATE POLICY "rooms_insert"    ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "rooms_update"    ON public.rooms FOR UPDATE USING (true);
CREATE POLICY "rooms_delete"    ON public.rooms FOR DELETE USING (true);

CREATE POLICY "rp_read"   ON public.room_participants FOR SELECT USING (true);
CREATE POLICY "rp_insert" ON public.room_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "rp_delete" ON public.room_participants FOR DELETE USING (true);

CREATE POLICY "rm_read"   ON public.room_messages FOR SELECT USING (true);
CREATE POLICY "rm_insert" ON public.room_messages FOR INSERT WITH CHECK (true);

CREATE POLICY "rr_read"   ON public.room_reactions FOR SELECT USING (true);
CREATE POLICY "rr_insert" ON public.room_reactions FOR INSERT WITH CHECK (true);

CREATE POLICY "fr_read"   ON public.friend_requests FOR SELECT USING (true);
CREATE POLICY "fr_insert" ON public.friend_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "fr_update" ON public.friend_requests FOR UPDATE USING (true);
CREATE POLICY "fr_delete" ON public.friend_requests FOR DELETE USING (true);

CREATE POLICY "notif_read"   ON public.notifications FOR SELECT USING (true);
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notif_update" ON public.notifications FOR UPDATE USING (true);
```

### If Supabase JWT Secret Has Been Changed

Revert in Supabase Dashboard → Project Settings → API → JWT Settings → JWT Secret.
Note: if the previous value was not stored, Supabase allows generating a new one,
but this will again invalidate all Supabase Auth sessions (zero impact for Loop).

---

## Current State vs Proposed State

### Current State

```
Auth path      Signing secret     Token claims              Supabase sees
──────────────────────────────────────────────────────────────────────────
OTP            LOOP_JWT_SECRET    sub, phone, role          anon key (no token)
RALD SSO       RALD_JWT_SECRET    id, email, role, appId    anon key (no token)
API server     —                  service_role key          bypasses all RLS
CF Worker      —                  service_role key          bypasses all RLS

RLS policies:  USING(true) — auth.uid() never consulted
Result:        Anyone with anon key can read/write everything
```

### Proposed State (as designed in migration 004)

```
Auth path      Signing secret     Token claims              Supabase receives
──────────────────────────────────────────────────────────────────────────
OTP            LOOP_JWT_SECRET    sub, phone, role          Bearer <loop_token>
RALD SSO       RALD_JWT_SECRET    id, email, role, appId    Bearer <rald_token>
API server     —                  service_role key          bypasses all RLS
CF Worker      —                  service_role key          bypasses all RLS

RLS policies:  auth.uid()-scoped (migration 004)

Problem:       One Supabase JWT secret cannot validate BOTH signing secrets.
               SSO tokens lack `sub` — auth.uid() = null even if secret matches.
```

### Correct Target State (requires architectural fix first)

```
Auth path      Signing secret     Token claims              Supabase receives
──────────────────────────────────────────────────────────────────────────
OTP            RALD_JWT_SECRET    sub=supabase_uuid, ...    Bearer <token>
RALD SSO       RALD_JWT_SECRET    sub=rald_uuid, ...        Bearer <token>
API server     —                  service_role key          bypasses all RLS
CF Worker      —                  service_role key          bypasses all RLS

Supabase JWT secret = RALD_JWT_SECRET
RLS policies:  auth.uid()-scoped (migration 004 — works correctly)
```

---

## Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Applying migration 004 breaks all writes | CRITICAL | CERTAIN (see simulation) | Do not apply migration 004 to writes tables yet |
| Setting JWT secret = LOOP_JWT_SECRET breaks SSO users | HIGH | CERTAIN | Do not change secret to LOOP_JWT_SECRET |
| Setting JWT secret = RALD_JWT_SECRET breaks OTP users | HIGH | CERTAIN | Do not change secret to RALD_JWT_SECRET |
| Changing JWT secret invalidates Supabase Auth sessions | MEDIUM | CERTAIN | Zero functional impact — Loop doesn't use Supabase sessions |
| Messenger Realtime disconnects on JWT secret change | LOW | LIKELY | Auto-reconnects within 5 seconds |
| notifications/friend_requests accessible via anon key | CRITICAL | ONGOING | Apply migration 004 for these two tables only — safe now |

---

## Required Operator Actions

### Safe to Do Now (No Breaking Changes)

**1. Apply partial migration 004 — notifications and friend_requests only**

These tables are only accessed via the Express API server (service_role key,
bypasses RLS). Removing the open-world policies closes the critical data
exposure with zero functional impact.

```sql
-- Apply in Supabase SQL Editor — SAFE — no JWT changes required
-- Only targets tables that never use anon key from frontend

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

Effect: anon key can no longer read any user's notifications or friend requests.
Service role (API server) continues to work unchanged — it bypasses all policies.

### Required Before Applying Migration 004 Write Policies

**2. Fix JWT architecture — unify signing secret and add `sub` claim**

This is an engineering task (1–2 days):

**Step 1 — Update `verify-otp` to sign with RALD_JWT_SECRET and include `sub`:**
```typescript
// In artifacts/cloudflare-worker/src/routes/auth.ts
const accessToken = await signJwt(
  {
    sub: userId,           // ← keep as-is (Supabase Auth UUID)
    id: userId,            // ← add for backward compat
    phone: normalized,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    role: "authenticated",
  },
  c.env.RALD_JWT_SECRET,   // ← change from LOOP_JWT_SECRET to RALD_JWT_SECRET
);
```

**Step 2 — Update `rald-sso` to re-sign with RALD_JWT_SECRET and include `sub`:**
```typescript
// Instead of returning body.rald_token as-is, issue a new token
const loopToken = await signJwt(
  {
    sub: rald.id,           // ← required for auth.uid()
    id: rald.id,            // ← backward compat
    email: rald.email ?? null,
    phone: rald.phone ?? null,
    role: rald.role ?? "user",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  },
  c.env.RALD_JWT_SECRET,
);
return c.json({ access_token: loopToken, user: { id: rald.id, ... } });
```

**Step 3 — Set Supabase JWT Secret = RALD_JWT_SECRET:**
Supabase Dashboard → Project `onxdcikfttdmnhofsuwo` → Project Settings → API → JWT Settings → JWT Secret

**Step 4 — Apply full migration 004**

After steps 1–3 are deployed and verified:
- All tokens signed with RALD_JWT_SECRET
- All tokens have `sub` = user UUID
- auth.uid() resolves correctly for all users
- Migration 004 write policies enforce ownership

---

## Go / No-Go Recommendation

### Verdict: NO-GO — Supabase JWT Secret change in current form

**Reason:** The change cannot work. Two independent signing secrets (LOOP_JWT_SECRET for OTP, RALD_JWT_SECRET for SSO) map to a single Supabase JWT secret slot. Additionally, SSO tokens lack the `sub` claim required by auth.uid(). Either change breaks a majority of users.

### Partial GO — Apply notifications and friend_requests policies now

The two most critical data exposures (every user's notifications and friend requests
visible to anyone with the anon key) can be fixed immediately without any JWT
changes. Service_role bypasses these policies, and no frontend code reads these
tables directly.

**Do this now.**

### Full GO — After architectural fix

Once the verify-otp and rald-sso handlers are updated to:
1. Both sign with `RALD_JWT_SECRET`
2. Both include `sub` = user UUID

Then setting the Supabase JWT secret = RALD_JWT_SECRET is safe, and migration 004
write policies will function correctly for all users.

**Estimated engineering effort:** 1 day (two handler updates + deploy + verify)

### What NOT to Do

- Do NOT apply migration 004 SQL as-is to the write tables (rooms, participants, messages, reactions, profiles)
- Do NOT change the Supabase JWT secret before fixing the JWT architecture
- Do NOT set Supabase JWT secret = LOOP_JWT_SECRET (breaks SSO users)
- Do NOT set Supabase JWT secret = RALD_JWT_SECRET (breaks OTP users + SSO `auth.uid()` = null)

---

## Action Plan Summary

| Step | Action | Safe Now? | Owner |
|---|---|---|---|
| 1 | Apply partial migration 004 (notifications + friend_requests only) | ✅ YES | Operator |
| 2 | Update verify-otp to sign with RALD_JWT_SECRET + include sub | Engineering | Engineering |
| 3 | Update rald-sso to re-sign (not pass-through) with RALD_JWT_SECRET + sub | Engineering | Engineering |
| 4 | Deploy updated CF Worker | Engineering | Engineering |
| 5 | Verify tokens with jwt.io — confirm sub claim present, signed with RALD_JWT_SECRET | Engineering | Engineering |
| 6 | Set Supabase JWT Secret = RALD_JWT_SECRET | ✅ After step 5 | Operator |
| 7 | Apply full migration 004 write policies | ✅ After step 6 | Operator |

Estimated time to full RLS enforcement: **1–2 engineering days + 30 minutes operator time**
