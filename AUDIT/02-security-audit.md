# AUDIT/02 — Loop Security Audit
**Date:** 2026-06-06 | **Auditor:** RALD CTO / Security Lead | **Method:** Source code inspection  
**Scope:** Worker auth routes, JWT, RLS, CORS, secrets hygiene | **Repo:** Ostinato-Loop/loop

---

## Executive Summary

Loop has multiple security issues requiring resolution before public launch. Most critical: a hardcoded dev JWT secret now public in the repo. Additional high-severity: permissive RLS (all USING(true)), service role key used for all DB ops, 30-day non-revocable tokens.

**Security posture: ORANGE — Fix ECOSEC-001 within hours.**

---

## SEC-003 — CRITICAL: Dev Secret Hardcoded in Production Code

**File:** `src/routes/auth.ts`
```typescript
const jwtSecret = c.env.LOOP_JWT_SECRET ?? "loop-dev-secret-change-in-prod";
```

"loop-dev-secret-change-in-prod" is committed to a public GitHub repository. If `LOOP_JWT_SECRET` is unset in CF Secrets (which .dev.vars.example suggests is the default), ALL production tokens are signed with this public string. Any actor who reads this repo can forge arbitrary Loop JWTs.

**Fix immediately (< 2 hours):**
```typescript
const jwtSecret = c.env.LOOP_JWT_SECRET;
if (!jwtSecret) {
  console.error("[auth] LOOP_JWT_SECRET is not configured");
  return c.json({ error: "Service configuration error" }, 500);
}
```

---

## SEC-001 — HIGH: 30-Day JWT with No Revocation

- Custom HS256 implementation using `crypto.subtle` — constant-time verify ✅ correct
- Token lifetime: **30 days** (`exp: iat + 86400 * 30`)
- No `jti` claim. No revocation endpoint. No rotation.
- A stolen/leaked token is valid for up to 30 days with no way to invalidate it.

Recommendation: Replace with `jose` or `@tsndr/cloudflare-worker-jwt`.

---

## SEC-002 — MEDIUM: Dual Secret Fallback — Old Tokens Permanently Accepted

```typescript
let payload = await verifyJwt(token, c.env.RALD_JWT_SECRET);
if (!payload && c.env.LOOP_JWT_SECRET) {
  payload = await verifyJwt(token, c.env.LOOP_JWT_SECRET);
}
```

Any LOOP_JWT_SECRET-signed token accepted indefinitely. Set removal deadline. Add warning log when fallback fires.

---

## SEC-004 — MEDIUM: CORS Configuration Risk

wrangler.toml default: `CORS_ORIGIN = "*"`  
Production: `CORS_ORIGIN = "https://loop.rald.cloud,https://loop.ostinato-loop.pages.dev"`

Risk 1: Deploy without `--env production` → wildcard CORS in production  
Risk 2: CORS middleware must parse comma-separated string. Verify it does not do exact-match comparison.

---

## SEC-005 — HIGH: All RLS Policies Are USING(true) — No Row Protection

**Evidence (supabase/migrations/003_repair_missing_tables.sql):**
```sql
CREATE POLICY "profiles_read"   ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (true);
-- Same pattern on ALL 7 tables
```

Impact:
- Any authenticated user can read ALL notifications for ALL users
- Any user can set `is_verified = true` on any profile
- Any user can delete any room (rooms table has DELETE policy USING(true))
- Private rooms (visibility='private') readable by all

**Required RLS fixes:**
```sql
-- profiles: self-update only, no trust elevation externally
DROP POLICY "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- rooms: private rooms restricted to host + participants
DROP POLICY "rooms_read" ON public.rooms;
CREATE POLICY "rooms_read" ON public.rooms FOR SELECT USING (
  visibility = 'public' OR host_id = auth.uid()
  OR EXISTS (SELECT 1 FROM room_participants WHERE room_id = rooms.id AND user_id = auth.uid())
);

-- rooms: host-only delete
DROP POLICY "rooms_delete" ON public.rooms;
CREATE POLICY "rooms_delete" ON public.rooms FOR DELETE USING (auth.uid() = host_id);

-- notifications: recipient only
DROP POLICY "notif_read" ON public.notifications;
CREATE POLICY "notif_read" ON public.notifications FOR SELECT USING (auth.uid() = recipient_id);

-- friend requests: parties only
DROP POLICY "fr_read" ON public.friend_requests;
CREATE POLICY "fr_read" ON public.friend_requests FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);
```

---

## SEC-008 — HIGH: Service Role Key Used for All Supabase Operations

```typescript
const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
```

Service role bypasses RLS entirely. Public room listings use admin-level DB access.  
If service role key leaks (error body, log scraping, etc.) → full database access.

Fix: Use `SUPABASE_ANON_KEY` for public reads. Reserve service role for auth write operations only.

---

## SEC-006 — MEDIUM: No IP Rate Limiting on OTP Endpoint

Phone-based rate limit: 5 OTPs/phone/hour ✅  
IP-based rate limit: **absent**

Attacker can spam Termii credits by requesting OTPs for unlimited phone numbers from a single IP.

Fix: Add `rate:ip:{ip}` KV key — max 10 requests/hour/IP.

---

## SEC-009 — MEDIUM: Incomplete Input Validation

| Endpoint | Gap |
|---|---|
| POST /api/auth/verify-otp | Token length not validated (should enforce 6 digits) |
| POST /api/rooms/:id/queue-summary | roomId not validated as UUID format |
| POST /api/auth/verify-otp | displayName not sanitised for length or content |

---

## SEC-010 — LOW: .dev.vars.example Misleads Developers

`RALD_JWT_SECRET` absent from example = any developer following it deploys broken RALD SSO auth.  
6 stale vars (LIVEKIT_API_KEY, MUX_TOKEN etc.) not in CloudflareEnv.

---

## Summary

| ID | Severity | Action | SLA |
|---|---|---|---|
| SEC-003 | **CRITICAL** | Remove hardcoded fallback | < 2 hours |
| SEC-001 | HIGH | Replace homegrown JWT | Before launch |
| SEC-005 | HIGH | Apply RLS policy fixes | Before public onboarding |
| SEC-008 | HIGH | Switch reads to anon key | Before launch |
| SEC-002 | MEDIUM | Set LOOP_JWT_SECRET removal deadline | This sprint |
| SEC-004 | MEDIUM | Verify CORS middleware multi-origin parsing | This sprint |
| SEC-006 | MEDIUM | Add IP rate limiting | Post-launch |
| SEC-009 | MEDIUM | Add token length + UUID validation | This sprint |
| SEC-010 | LOW | Fix .dev.vars.example | Before onboarding |
