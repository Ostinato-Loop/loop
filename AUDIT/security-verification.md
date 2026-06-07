# AUDIT/security-verification.md
**Service:** Loop — Full Security Re-Audit
**Owner:** LILCKY STUDIO LIMITED — CTO
**Date:** 2026-06-07
**Sprint:** Production Stabilization Sprint — Phase E
**Scope:** JWT chain, session revocation, OTP protection, service role usage, RLS

---

## 1. JWT Chain Audit

### 1.1 Token Issuance

| Control | Status | Evidence |
|---------|--------|---------|
| Single signing secret (`RALD_JWT_SECRET`) | ✅ | All token issuance routes use `signJwt(payload, RALD_JWT_SECRET)` |
| Standard claims present (`sub`, `iss`, `aud`, `iat`, `exp`) | ✅ | `artifacts/cloudflare-worker/src/lib/jwt.ts` — verified in signJwt |
| Issuer locked to `https://loop-api.rald.cloud` | ✅ | `iss: "https://loop-api.rald.cloud"` hardcoded in signJwt |
| Audience locked to `loop` | ✅ | `aud: "loop"` hardcoded in signJwt |
| Appropriate TTL (30d OTP, 7d SSO) | ✅ | OTP: `exp: now + 30d`, SSO: `exp: now + 7d` |
| No sensitive data in JWT payload | ✅ | Payload contains only: `id`, `sub`, `email`, `role`, `iss`, `aud`, `iat`, `exp` |
| `LOOP_JWT_SECRET` legacy fallback removed | ⚠️ | `/me` endpoint retains fallback — scheduled cleanup PHD-001 (2026-07-07) |

**Gaps:**
- `jti` claim absent — no per-token unique identifier → token revocation impossible per-token
- `aud` claim not validated in `verifyJwt` (only `iss` and `exp` checked)
- Supabase JWT secret not aligned to `RALD_JWT_SECRET` → `auth.uid()` returns NULL

### 1.2 Token Verification

| Control | Status | Evidence |
|---------|--------|---------|
| `requireAuth` middleware validates HMAC signature | ✅ | `verifyJwt(token, RALD_JWT_SECRET)` in auth middleware |
| Expired tokens rejected | ✅ | `exp` check in `verifyJwt` |
| Malformed tokens rejected | ✅ | try/catch on `crypto.subtle.verify` — returns null on failure |
| Worker does NOT trust Supabase JWT format | ✅ | All auth goes through `requireAuth` using `RALD_JWT_SECRET` |
| Audience validation on verify | ❌ | `verifyJwt` does not enforce `aud` claim |

**Risk assessment:** Medium. Without `aud` validation, a token issued by a different RALD service (if one shares the same `RALD_JWT_SECRET`) could authenticate against Loop. Mitigation: secrets are currently Loop-exclusive.

---

## 2. Session Revocation Audit

| Control | Status | Evidence |
|---------|--------|---------|
| Server-side signout endpoint | ❌ | `POST /api/auth/signout` not implemented; client clears localStorage only |
| Token blocklist (KV-based) | ❌ | No blocklist implemented |
| `jti` claim for per-token identification | ❌ | `jti` absent from all issued tokens |
| Token rotation / sliding session | ❌ | No refresh token pattern |
| Silent re-auth (SSO only) | ✅ | `GET /api/auth/silent` re-signs SSO tokens |

**Risk:** HIGH. A stolen OTP token is valid for 30 days with no server-side invalidation path. Emergency mitigation: rotate `RALD_JWT_SECRET` (invalidates ALL sessions).

**Remediation roadmap (Phase 3 Sprint):**
1. Add `jti` (UUID v4) to all issued tokens
2. Implement `POST /api/auth/signout` → writes `jti` to KV blocklist with TTL = remaining token TTL
3. Add blocklist check to `requireAuth` middleware
4. Add test coverage for blocklist enforcement

---

## 3. OTP Protection Audit

| Control | Status | Evidence |
|---------|--------|---------|
| Per-phone rate limit (5 sends/hour) | ✅ | `artifacts/cloudflare-worker/src/routes/auth.ts` — KV sliding window |
| Per-IP send rate limit (10/hour) | ✅ | KV key: `ratelimit:ip:send:{ip}` |
| Per-IP verify rate limit (20/hour) | ✅ | KV key: `ratelimit:ip:verify:{ip}` |
| Global daily rate limit (100/day) | ✅ | KV key: `ratelimit:global:daily` |
| OTP PIN stored with 10-minute TTL | ✅ | KV key: `otp:{phone}` — TTL = 600 s |
| OTP PIN deleted on successful verify | ✅ | `env.CACHE.delete(otpKey)` after verify |
| Hardcoded fallback secret removed | ✅ | SEC-003 resolved — no `"loop-dev-secret-change-in-prod"` in codebase |
| Abuse logging (no PII) | ✅ | Phone suffix-only logged: `phone.slice(-4)` |
| Unit tests: 13 rate-limit scenarios | ✅ | `artifacts/cloudflare-worker/src/routes/communities.test.ts` — all passing |

**Gaps:**
- No per-OTP attempt limit (brute-force 6-digit PIN within per-IP limit of 20 attempts)
- No Termii webhook validation (OTP delivery status unverified)
- No persistent login audit trail (successful auths logged to console only, 72h retention)

**Risk:** LOW. Per-IP limit of 20 attempts on a 6-digit PIN = 0.002% success per attempt. Acceptable for current scale. Escalate before 10K users.

---

## 4. Service Role Usage Audit

| Location | Usage | Is it correct? |
|----------|-------|---------------|
| `artifacts/api-server/src/routes/*.ts` | `SUPABASE_SERVICE_ROLE_KEY` for all DB ops | ✅ — server-side only, not exposed to client |
| `artifacts/cloudflare-worker/src/routes/communities.ts` | `SUPABASE_SERVICE_ROLE_KEY` via worker secret | ✅ — CF Worker secret, not in source code |
| `artifacts/cloudflare-worker/src/routes/rooms.ts` | `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| `artifacts/cloudflare-worker/src/routes/auth.ts` | `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| Frontend (`artifacts/loop/src/`) | `VITE_SUPABASE_ANON_KEY` only | ✅ — service role key never in frontend build |
| Cloudflare Pages | No server-side code | ✅ — static only, anon key via env var |

**Finding:** Service role key correctly confined to server-side Worker and API server. Anon key used correctly on client side.

**Gap:** Anon key with `USING(true)` RLS = anon key can read all public rows. Acceptable until RLS policies are applied.

---

## 5. Row Level Security (RLS) Audit

### Current RLS State

| Table | RLS Enabled | Policy State | Risk |
|-------|-------------|--------------|------|
| profiles | ✅ | `USING(true)` — open read; write restricted to owner | MEDIUM |
| rooms | ✅ | `USING(true)` — open read; write to host | MEDIUM |
| room_participants | ✅ | `USING(true)` — open | HIGH |
| notifications | ✅ | `USING(true)` — open | HIGH |
| friend_requests | ✅ | `USING(true)` — open | HIGH |
| communities | ✅ | `USING(true)` — open | MEDIUM |
| community_members | ✅ | `USING(true)` — open | MEDIUM |

**Root cause of open policies:** `auth.uid()` returns NULL for all users because the Supabase project's JWT secret is not aligned to `RALD_JWT_SECRET`. User-scoped policies cannot function until this is resolved.

**Migration 004 (`rls-hardening.sql`) status:** Written and committed to repo — NOT YET APPLIED. This migration contains full write-side RLS policies.

**Immediate risk:** Supabase Realtime (anon key) subscribers can see all row changes. This means any client that knows the project URL can subscribe to real-time updates for notifications/friend_requests of any user.

### Remediation Priority Order

```
1. [OPERATOR] Align Supabase JWT secret to RALD_JWT_SECRET → auth.uid() resolves
2. [OPERATOR] Apply migration 004 (rls-hardening.sql) to production
3. [ENGINEER] Add per-user read policies to notifications, friend_requests, room_participants
4. [ENGINEER] Test RLS policies with anon-key client to verify isolation
```

---

## 6. Security Findings Summary

| ID | Finding | Severity | Status | Remediation |
|----|---------|----------|--------|------------|
| SEC-001 | No token revocation / signout | HIGH | Open | Phase 3: jti + KV blocklist |
| SEC-002 | RLS open-world (auth.uid() NULL) | HIGH | Open | Operator: align JWT secret |
| SEC-003 | Hardcoded fallback JWT secret | CRITICAL | ✅ Resolved | Removed 2026-06-05 |
| SEC-004 | aud not validated in verifyJwt | MEDIUM | Open | Add aud check to verifyJwt |
| SEC-005 | LOOP_JWT_SECRET fallback in /me | LOW | Open | PHD-001 cleanup 2026-07-07 |
| SEC-006 | No per-OTP attempt limit | LOW | Open | Phase 3: 3-attempt max per jti |
| SEC-007 | No Termii webhook validation | LOW | Open | Phase 3 |
| SEC-008 | console.log in production (auth events) | INFO | Open | requestLogger middleware added |

**Critical/High unresolved:** 2 (SEC-001, SEC-002)
**Medium unresolved:** 1 (SEC-004)
**Low unresolved:** 3

---

## 7. Positive Security Controls (Evidence of Maturity)

- Multi-layer OTP rate limiting with 4 independent KV counters
- HMAC-SHA256 JWT signing (not symmetric with weak key — 64-byte random)
- Service role key never appears in frontend bundle (verified via `grep -r "service_role" artifacts/loop/src` — 0 results)
- No secrets in source code (all via `process.env["..."]` or `c.env.*`)
- Post-deploy smoke test on every CI deploy (PHD-001)
- Structured abuse logging with phone suffix-only (no full PII)
- Security audit runs on every CI push (`pnpm audit --audit-level=high`)
- Worker strict mode TypeScript (`strict: true` in worker tsconfig)
