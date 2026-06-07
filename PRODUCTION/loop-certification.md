# PRODUCTION/loop-certification.md
**Date:** 2026-06-07
**Certified by:** RALD CTO / Release Manager
**Scope:** Ostinato-Loop/loop — Cloudflare Worker (loop-api), Pages (loop), Supabase (onxdcikfttdmnhofsuwo), Messenger (Ostinato-Loop/messenger)
**Sprint:** Production Hardening Sprint — pre-implementation baseline certification
**Previous cert:** AUDIT/06-production-readiness.md (2026-06-06, 34/100)

---

## Verdict

```
╔══════════════════════════════════════════════════════════════════╗
║  PRODUCTION READINESS:  60 / 100                                ║
║  STATUS:  ⚠️  CONDITIONAL — Closed Beta Eligible               ║
║  PUBLIC LAUNCH:  ❌  NO-GO                                       ║
╚══════════════════════════════════════════════════════════════════╝
```

**Score trajectory:**
```
34/100  →  54/100  →  60/100  →  [target: 80/100]
Jun-06     Phase H    IDN-001    After Hardening Sprint
(pre-audio) (audio+   (identity
             LiveKit)  unified)
```

---

## Scoring Breakdown

| Dimension | Max | Score | Δ IDN-001 | Status |
|-----------|-----|-------|-----------|--------|
| Auth chain | 15 | 11 | +4 | ⚠️ |
| JWT trust chain | 10 | 7 | +3 | ⚠️ |
| RLS enforcement | 10 | 3 | 0 | ❌ |
| OTP protections | 10 | 8 | 0 | ✅ |
| Session management | 10 | 3 | 0 | ❌ |
| Audio readiness | 10 | 8 | 0 | ✅ |
| Messaging readiness | 10 | 6 | 0 | ⚠️ |
| Monitoring readiness | 10 | 4 | 0 | ❌ |
| CI governance | 10 | 8 | +3 | ✅ |
| Deployment governance | 5 | 2 | 0 | ❌ |
| **TOTAL** | **100** | **60** | **+6** | |

---

## Dimension Verdicts

### Auth Chain — 11/15 ⚠️

**What works (post-IDN-001):**
- OTP users can access all `requireAuth`-protected routes (was broken before IDN-001)
- SSO users continue to work via `requireAuth`
- `/me` resolves for both user types
- Shared `requireAuth` middleware validates via `RALD_JWT_SECRET` — single path, no divergence

**What is broken or missing:**
- `LOOP_JWT_SECRET` fallback still present in `/me` (cleanup scheduled 2026-07-07, not yet removed)
- Supabase JWT secret NOT aligned to `RALD_JWT_SECRET` (Phase 3 operator action PENDING)
- `auth.uid()` = NULL for all users → Supabase RLS cannot evaluate user-scoped policies
- No token revocation: a stolen token is valid for its full TTL (30d OTP, 7d SSO)
- No session refresh / silent re-auth for OTP users (cookie-based silent only works for SSO)

**Remaining for 15/15:**
- Phase 3: Supabase JWT secret alignment → `auth.uid()` resolves (+2)
- PHD-001 cleanup: Remove `LOOP_JWT_SECRET` fallback from `/me` (+1)
- Token revocation (Phase 3 implementation) (+1)

---

### JWT Trust Chain — 7/10 ⚠️

**What works (post-IDN-001):**
- Single signing secret: `RALD_JWT_SECRET` for all new tokens
- Standard claims present on all tokens: `sub`, `email`, `role`, `iss`, `aud`, `iat`, `exp`
- `iss = "https://loop-api.rald.cloud"` — Loop CF Worker is the declared issuer
- `aud = "loop"` — audience correctly scoped
- `sub` present on both OTP tokens (Supabase UUID) and SSO tokens (RALD UUID)
- Claim standard documented: `AUDIT/jwt-claim-standard.md`
- TTL appropriate: 30d OTP, 7d SSO

**What is broken or missing:**
- `jti` claim absent — no unique token identifier → revocation impossible per-token
- `LOOP_JWT_SECRET` fallback in `/me` makes trust chain non-exclusive until cleanup
- Supabase does not yet validate these tokens (JWT secret misaligned — Phase 3 pending)
- No `aud` validation on verification (`verifyJwt` does not enforce audience)
- No token rotation / refresh token pattern

**Remaining for 10/10:**
- Add `jti` to all issued tokens (Phase 3 impl) (+1)
- Supabase JWT alignment (Phase 3 operator) (+1)
- Enforce `aud` in `verifyJwt` (+0.5, minor)
- Remove `LOOP_JWT_SECRET` fallback (+0.5)

---

### RLS Enforcement — 3/10 ❌

**Current state:**
- All tables: `USING(true)` — open-world read/write for any authenticated user
- `auth.uid()` = NULL (Supabase JWT secret misaligned) → no row-level user scoping possible
- Migration 004 (`rls-hardening.sql`) written and committed to repo — NOT applied
- Phase 0 policies (notifications, friend_requests) available as SQL — NOT applied

**Risk:**
- Any authenticated user can read/write any row in any table
- This is the highest-priority security risk remaining in the codebase
- Service-role key in CF Worker bypasses all RLS — low risk there, but frontend Realtime (anon key) has no protection

**Remaining for 10/10:**
- Phase 3 operator: Supabase JWT secret → `auth.uid()` resolves (+3)
- Phase 4: Apply migration 004 full write policies (+4)
- Phase 0: Apply notifications/friend_requests policies immediately (+0)

---

### OTP Protections — 8/10 ✅

**What works:**
- 5-layer rate limiting: phone (5/h), IP send (10/h), IP verify (20/h), global daily (100/d), cold-start handled
- Sliding-window algorithm with KV persistence — accurate, resistant to burst attacks
- Abuse logging: structured JSON to `console.warn` with `[LOOP/ABUSE]` prefix, phone-suffix only (no PII)
- OTP PIN stored in KV with 10-minute TTL — cleaned up on verify
- Hardcoded fallback secret SEC-003 **removed** (was `"loop-dev-secret-change-in-prod"`)
- 13 unit tests covering all rate-limit scenarios

**What is missing:**
- No per-code attempt tracking (brute-force a 6-digit PIN within the per-IP limit: 20 attempts = 0.002% success per attempt, but statistically non-trivial over 20 attempts)
- No Termii webhook validation (OTP delivery confirmation is unverified)
- No audit trail for successful logins beyond console.log

**Remaining for 10/10:**
- Limit OTP verify attempts per-pinId to 3 (Termii does this server-side — verify behavior) (+1)
- Persist successful login audit to KV or D1 for post-incident forensics (+1)

---

### Session Management — 3/10 ❌

**Current state:**
- `POST /api/auth/signout` — NOT IMPLEMENTED (endpoint not registered; client clears `localStorage` only)
- No token revocation mechanism (no `jti`, no blocklist)
- No token refresh / sliding session
- A stolen OTP token is valid for 30 days with no server-side invalidation possible
- A stolen SSO token is valid for 7 days with no server-side invalidation possible
- Silent auth (`GET /api/auth/silent`) re-signs SSO tokens — this is the only session continuation mechanism and it's SSO-only

**Impact:**
- Compromised credential cannot be killed without rotating `RALD_JWT_SECRET` (which invalidates ALL sessions for ALL users)
- Users who "log out" are still fully authenticated server-side for up to 30 days
- No way to remotely invalidate a specific device/session

**Remaining for 10/10:**
- Implement `jti` in all issued tokens (+2)
- Implement `POST /api/auth/signout` with KV blocklist (+2)
- Add blocklist check to `requireAuth` middleware and `/me` (+1)
- Add blocklist check tests (+1)
- Add abuse monitoring (login from new IP, rapid sign-out cycles) (+1)

---

### Audio Readiness — 8/10 ✅

**Current state:**
- LiveKit SDK integrated — audio rooms functional
- Room creation, joining, host controls implemented
- Hand-raise queue via Durable Object (`RoomSession`) — functional scaffold
- `queue-summary` endpoint for post-room AI summaries via CF Queue
- Room recommendation engine (`recommendations.ts`) in place

**What is missing:**
- No LiveKit health check in `/api/health` endpoint — binding availability not verified
- No graceful room cleanup on participant disconnect (timeout/retry not documented)
- No room recording / replay integration
- No audio quality monitoring (packet loss, jitter alerts)
- `RoomSession` DO is scaffold only — `audience_count` not authoritative from DO yet

**Remaining for 10/10:**
- Add LiveKit health probe to `/api/health` (+1)
- Document DO→Supabase audience_count sync path (+1)

---

### Messaging Readiness — 6/10 ⚠️

**Current state:**
- Supabase Realtime (anon key) powers Messenger — functional for direct messages
- Presence and typing indicators via Realtime channels
- `messenger_rald_token` stored in `localStorage` — used for RALD identity in Messenger
- Separate repo (Ostinato-Loop/messenger) — no shared auth code

**What is missing:**
- Messenger has no token revocation path (uses RALD JWT pass-through independently)
- No message delivery receipts (sent ≠ delivered ≠ read tracking)
- No push notifications for offline users
- Messenger auth is not coordinated with Loop logout — a Loop signout does NOT revoke the Messenger session
- No rate limiting on message sends (spam protection absent)
- Anon key exposed client-side — mitigated by RLS, but RLS is currently open-world (see RLS enforcement)

**Remaining for 10/10:**
- Cross-app revocation: Loop signout should invalidate Messenger RALD token (+2)
- Message delivery receipt tracking (+1)
- Push notification integration (+1)

---

### Monitoring Readiness — 4/10 ❌

**Current state:**
- `GET /api/health` — returns worker status, environment, binding availability (boolean)
- CF Worker logs: `console.log` / `console.error` available in CF Logs dashboard
- `[LOOP/ABUSE]` structured prefix for rate-limit abuse events
- Auth events logged with `JSON.stringify` (userId, source, timestamp) — not structured/indexed

**Critical gaps:**
- No readiness probe (health endpoint does not check actual binding connectivity — only `typeof binding !== "undefined"`)
- No Supabase health check in health endpoint
- No LiveKit health check in health endpoint
- No KV health check in health endpoint (read/write probe)
- No error rate monitoring (no aggregated 5xx alerting)
- No p99 latency tracking
- No audit log persistence (auth events go to CF Logs, not queryable)
- No Supabase slow-query monitoring
- No budget alerts (CF Workers invocation cost, Supabase egress)

**Remaining for 10/10:**
- Deep health endpoint (Supabase ping, KV read probe, LiveKit status) (+2)
- Structured log schema (level, service, traceId, userId, latencyMs) (+2)
- Error rate alerting via CF Workers Analytics (+1)
- Audit log persistence to D1 or KV (+1)

---

### CI Governance — 8/10 ✅

**Current state (post-IDN-001 CI fixes):**
- `ci.yml`: lint, typecheck (worker + frontend), test (worker + frontend), security audit
- `deploy.yml`: lint → typecheck → worker tests → frontend tests → security → deploy
- Worker tests run in CI (was missing before IDN-001)
- `LOOP_JWT_SECRET` push step non-fatal (was breaking deploy)
- `pnpm audit --audit-level=high` blocks deploy on high-severity CVEs
- Branch protection assumed (not verified)

**What is missing:**
- No staging environment / preview deploy on PRs
- No E2E tests (Playwright or similar) — only unit tests
- No smoke test after deploy (post-deploy health check)
- No performance regression detection
- Test coverage not tracked

**Remaining for 10/10:**
- Post-deploy smoke test (curl /api/health after wrangler deploy) (+1)
- E2E test for critical paths (OTP flow, room creation) (+1)

---

### Deployment Governance — 2/5 ❌

**Current state:**
- Wrangler deploy to Cloudflare Workers production — functional
- CF Pages deploy for frontend — functional
- Deployment audit logged to CI console (`AUDIT LOG: service= commit= author= timestamp= status=`)
- Manual rollback via CF Dashboard (Workers Deployments tab)

**What is missing:**
- No automated rollback trigger (failed health check → revert)
- No canary deployment (100% traffic to new deploy immediately)
- No deployment runbook (documented rollback steps, escalation contact)
- Deployment audit goes to CI console only — not persisted or queryable
- No secret rotation runbook documented

**Remaining for 5/5:**
- Post-deploy smoke test that fails CI on unhealthy response (+1)
- Runbook: rollback procedure, secret rotation, escalation path (+2)

---

## Blocker Matrix — What Prevents Score Improvement

| ID | Blocker | Dimension | Action Required | Who | Points |
|----|---------|-----------|-----------------|-----|--------|
| BLK-001 | `auth.uid()` = NULL (Supabase JWT secret misaligned) | Auth, RLS, JWT | Operator: Supabase Dashboard → JWT Secret = `RALD_JWT_SECRET` | Operator | +5 |
| BLK-002 | RLS open-world (`USING(true)`) | RLS | Operator: Apply migration 004 (after BLK-001) | Operator | +5 |
| BLK-003 | No token revocation (`jti`, blocklist, signout endpoint) | Session | Engineer: Phase 3 implementation | Engineer | +5 |
| BLK-004 | No deep health checks | Monitoring | Engineer: Supabase + KV + LiveKit probes | Engineer | +2 |
| BLK-005 | No structured logging | Monitoring | Engineer: Structured log middleware | Engineer | +2 |
| BLK-006 | `LOOP_JWT_SECRET` fallback in `/me` | Auth, JWT | Engineer: Cleanup (scheduled 2026-07-07) | Engineer | +2 |
| BLK-007 | No post-deploy smoke test | CI, Deploy | Engineer: Add health-check step to deploy.yml | Engineer | +2 |
| BLK-008 | No deployment runbook | Deploy | Engineer/Operator: Write runbook | Both | +2 |
| BLK-009 | Messenger logout not coordinated with Loop | Messaging | Engineer: Cross-app revocation | Engineer | +1 |

**Total recoverable points: +26 → Target: 86/100**

---

## Dependency Graph — Required Order

```
BLK-003 (jti + revocation impl)
  └─→ BLK-006 (LOOP_JWT_SECRET cleanup — removes last trust chain gap)

BLK-001 (Supabase JWT alignment) — OPERATOR ACTION
  └─→ BLK-002 (RLS migration 004) — OPERATOR ACTION

BLK-004 (deep health) ─┐
BLK-005 (structured log)├─→ BLK-007 (post-deploy smoke test)
BLK-007              ─┘

BLK-003 ─→ BLK-009 (cross-app revocation needs jti first)
```

**Critical path to 80/100:**
1. Engineer implements PHD-001 (revocation, BLK-003 + BLK-006) — unblocks BLK-009
2. Engineer implements monitoring (BLK-004, BLK-005, BLK-007)
3. Operator aligns Supabase JWT (BLK-001) — use Phase 3 checklist in `AUDIT/identity-unification-verification.md`
4. Operator applies migration 004 (BLK-002) — after BLK-001 verified

---

## Go / No-Go Decision

### ❌ NO-GO — General Public Launch

**Conditions not met:**
- RLS open-world → any authenticated user can read/modify any row
- No token revocation → stolen credentials valid for 30 days with no kill switch
- `auth.uid()` NULL → user-scoped data isolation is not enforced

### ⚠️ CONDITIONAL-GO — Closed Beta (Invite-Only, Trusted Users)

**Acceptable risk in closed beta:**
- RLS open-world: closed beta users are known, risk of internal data access is low
- No revocation: 30-day sessions for known users is tolerable
- Open-world Messenger: messages only visible to beta participants

**Conditions for CONDITIONAL-GO:**
- [ ] IDN-001 deployed to production ✅ (committed 2026-06-07)
- [ ] OTP auth works end-to-end for beta users ✅ (verified via Test 4 in identity-unification-verification.md)
- [ ] SSO auth works end-to-end for beta users ✅
- [ ] Audio rooms functional (LiveKit integration) ✅
- [ ] Beta user list limited to < 50 known users (mitigates open-world RLS risk)
- [ ] On-call contact designated for incident response

### Certification Upgrade Path

| Score | Status | Conditions |
|-------|--------|------------|
| 60/100 | Closed Beta | ✅ Current state |
| 70/100 | Soft Launch | BLK-003 + BLK-006 + BLK-004 + BLK-005 + BLK-007 implemented |
| 80/100 | Public Launch | All above + BLK-001 + BLK-002 (operator) |
| 86/100 | Production Certified | All blockers resolved |

---

## Certification Conditions Before Hardening Sprint Proceeds

The following must be verified before engineer time is spent on hardening:

1. **IDN-001 production health** — no elevated error rate in CF Worker logs since deploy
2. **OTP login confirmed working** — at least one successful OTP login post-IDN-001 deploy
3. **SSO login confirmed working** — at least one successful SSO login post-IDN-001 deploy
4. **Room create confirmed working for OTP user** — confirms `requireAuth` middleware fix is effective
5. **`/api/health` returns `ok: true`** — worker bindings healthy

If all 5 are confirmed, proceed with Production Hardening Sprint in this order:
- Phase 1: Token Lifecycle Audit (`AUDIT/token-lifecycle.md`)
- Phase 2: Token Revocation Architecture (`FOUNDATION/token-revocation-architecture.md`)
- Phase 3: Implement Revocation (engineer) + BLK-006 cleanup
- Phase 4: Monitoring & Observability
- Phase 5: Service Role Audit
- Re-certify → target score 75-80/100
- Phase 3 Operator: Supabase JWT alignment
- Phase 4 Operator: Apply migration 004
- Final certification → target score 80+/100

---

## Audit Trail

| Date | Event | Score | Delta |
|------|-------|-------|-------|
| 2026-06-06 | Initial audit (AUDIT/06-production-readiness.md) | 34/100 | baseline |
| 2026-06-06 | Phase H audio + LiveKit integration | 54/100 | +20 |
| 2026-06-07 | IDN-001 Identity Unification Sprint | 60/100 | +6 |
| 2026-06-07 | Production Hardening Sprint (target) | 80/100 | +20 |
