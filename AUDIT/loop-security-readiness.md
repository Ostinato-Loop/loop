# Loop Security Readiness — Phase 4: Security & Trust
**Ecosystem:** RALD / LILCKY STUDIO LIMITED  
**Repo:** Ostinato-Loop/loop  
**Audit Date:** 2026-06-06  
**Auditor:** CTO Office  

---

## Executive Summary

Loop has foundational authentication in place (Supabase OTP + HS256 JWT) but has critical security gaps that must be closed before any real user data is stored or any public launch occurs. The most severe issue is the absence of rate limiting on the OTP endpoint, which enables credential stuffing, SMS flooding attacks, and service cost abuse. CORS misconfiguration and incomplete RLS policies compound the risk. No penetration testing has been performed.

**Security Readiness: 🔴 NOT READY for production with real users**

---

## 1. Authentication & Authorization

### 1.1 Auth Architecture

```
User → Supabase Auth (OTP/SMS) → Supabase Session → CF Worker → HS256 JWT issued
                                                               ↓
                                               JWT validated by Worker middleware
                                               on every subsequent request
```

### 1.2 JWT — HS256 Implementation

| Finding | Severity | Detail |
|---|---|---|
| HS256 secret is a single shared secret | P1 | If the secret leaks, all tokens are compromised. No per-user signing. |
| No secret rotation path | P1 | Rotating the secret invalidates all active sessions instantly. No zero-downtime rotation mechanism exists. |
| Token expiry not validated in all paths | P2 | Middleware checks signature and expiry, but the DO accepts connections with expired tokens passed via WebSocket handshake |
| No token revocation | P2 | A stolen token cannot be invalidated until it naturally expires |
| JWT stored in localStorage | P2 | Vulnerable to XSS. Prefer HttpOnly cookies or in-memory storage. |

**Remediation:**
- Migrate to asymmetric signing (RS256 / ES256): Worker signs with private key, clients verify with public key. Rotation is a key swap.
- Implement a token blacklist in Cloudflare KV for revocation (low volume, fast reads)
- Move JWT to a Secure, HttpOnly, SameSite=Strict cookie

### 1.3 Supabase RLS Audit

| Table | RLS Enabled | Policy Quality | Issues |
|---|---|---|---|
| `profiles` | ✅ | Good | Public read, self-write enforced |
| `rooms` | ✅ | Partial | Read is public (correct), but `INSERT` policy does not verify the inserting user is authenticated |
| `room_participants` | ✅ | Partial | No check that the user is actually in the room before operating |
| `follows` | ✅ | Good | Follows are user-scoped correctly |
| `interests` | ✅ | Good | — |
| `messages` | ❌ | None | Table does not exist yet — must have RLS on creation |

**Critical RLS gaps:**
```sql
-- rooms INSERT policy is missing the auth check
-- Current (insufficient):
CREATE POLICY "users can create rooms" ON rooms FOR INSERT WITH CHECK (true);

-- Required:
CREATE POLICY "authenticated users can create rooms" ON rooms
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);
```

### 1.4 Role Escalation Risk

The Worker accepts `POST /rooms/:id/join` and sets the participant role. There is no server-side enforcement preventing a user from posting `{"role": "host"}` to claim host privileges.

**Severity: P0 (security)**  
**Remediation:** Role must be assigned server-side based on who created the room. Client-provided role must be ignored.

---

## 2. API Security

### 2.1 Rate Limiting — Critical Gap

**No rate limiting exists on any endpoint.**

The OTP endpoint (`POST /auth/otp`) is particularly dangerous: an attacker can:
1. Enumerate valid phone numbers by watching for different response timing
2. Flood SMS to any phone number, causing victim harassment and driving up Twilio/Supabase SMS costs
3. Bypass OTP lockout (none exists) by rapid-fire submissions

| Endpoint | Risk Without Rate Limiting | Recommended Limit |
|---|---|---|
| `POST /auth/otp` | SMS bombing, cost abuse | 3 requests / phone number / 10 min |
| `POST /rooms` | Room spam | 5 rooms / user / hour |
| `POST /rooms/:id/join` | Participant flooding | 20 joins / user / hour |
| `GET /rooms` | Scraping | 100 requests / IP / minute |

**Remediation:** Implement Cloudflare Rate Limiting rules (WAF-level, no code required) for OTP. Implement Worker-level rate limiting middleware for room operations using Cloudflare KV as a counter store.

### 2.2 CORS Misconfiguration

```typescript
// Current — in Worker middleware:
response.headers.set('Access-Control-Allow-Origin', '*');
```

This allows any origin to make credentialed requests. Combined with JWT in localStorage, this creates a wide XSS attack surface.

**Remediation:**
```typescript
const ALLOWED_ORIGINS = [
  'https://loop.rald.cloud',
  'https://staging.loop.rald.cloud',
  // Add dev origin only in non-production
  ...(env.ENVIRONMENT === 'development' ? ['http://localhost:5173'] : [])
];

const origin = request.headers.get('Origin') ?? '';
if (ALLOWED_ORIGINS.includes(origin)) {
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Vary', 'Origin');
}
```

### 2.3 Input Validation

| Endpoint | Validation | Issues |
|---|---|---|
| `POST /rooms` | Zod schema | ✅ Validates room name, topic |
| `POST /auth/otp` | Minimal | ❌ No phone number format validation; allows arbitrarily long strings |
| `POST /rooms/:id/join` | None | ❌ No validation of body payload |
| WebSocket upgrade | None | ❌ Token not validated at WS handshake |

**Remediation:** All endpoints must have explicit Zod validation. Validation must happen before any business logic or database access.

### 2.4 Missing Security Headers

```
# Not present in current Worker responses:
Content-Security-Policy
X-Frame-Options
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
```

**Remediation:** Add a security headers middleware as the first response processor:
```typescript
function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'microphone=(self), camera=()');
  // CSP depends on audio vendor CDN domains — add after vendor selection
  return new Response(response.body, { ...response, headers });
}
```

---

## 3. Moderation Infrastructure

`services/moderation.ts` exists in the Worker but the implementation is minimal.

| Capability | Status | Notes |
|---|---|---|
| Report user | ⚠️ Stub | API route exists, no action taken |
| Report room | ⚠️ Stub | Stores report in DB, no moderation workflow |
| Block user | ❌ Missing | No block table, no enforcement |
| Auto-moderation | ❌ Missing | No profanity/NSFW detection |
| Admin tooling | ❌ Missing | No moderator dashboard |
| Content audit log | ❌ Missing | No record of moderation actions |

**Minimum moderation for launch:**
1. Block user (prevents DMs and room interaction) — P1
2. Report room (stored + human review workflow) — P1
3. Host kick participant — P0 (already tracked in P0-002)

---

## 4. Secrets Management

| Secret | Location | Risk |
|---|---|---|
| `JWT_SECRET` | Cloudflare Worker env (wrangler.toml reference) | Medium — rotatable but no zero-downtime path |
| `SUPABASE_SERVICE_KEY` | Cloudflare Worker env | High — full DB access if leaked |
| `SUPABASE_ANON_KEY` | Hardcoded in frontend bundle | Accepted — Supabase design; RLS is the protection layer |
| Audio vendor key | Not yet present | Will be high-risk when added |
| `GITHUB_PAT` | Replit secret | ✅ Not in codebase |
| `SESSION_SECRET` | Replit secret | ✅ Not in codebase |

**Remediation:**
- `SUPABASE_SERVICE_KEY` must never be logged. Audit all `req.log` calls to ensure it is not included in log output.
- Implement a `rotate-jwt-secret` runbook using a dual-secret acceptance window (accept old + new secret for a 15-minute grace period during rotation)
- Add secret scanning to CI (e.g., `secretlint` or Cloudflare's secret detection) to prevent accidental commits

---

## 5. CI/CD Security

| Risk | Current State | Remediation |
|---|---|---|
| `deploy.yml` runs on every `main` push regardless of CI outcome | 🔴 Critical | Gate deploy step on all checks passing |
| Secrets (`CF_API_TOKEN`, `CF_ACCOUNT_ID`) in GitHub Actions env | ⚠️ Accepted | Rotate tokens after any contributor change |
| No branch protection on `main` | 🔴 High | Require PR + green CI before merge |
| No SAST in CI | 🔴 High | Add `pnpm audit` output to CI failure conditions; add `semgrep` or equivalent |
| Dependency audit fails silently | ⚠️ Medium | `pnpm audit --audit-level=high` must fail the CI build |

---

## 6. Privacy & Data Handling

| Requirement | Status | Notes |
|---|---|---|
| Phone number storage | ⚠️ Supabase default | Ensure phone numbers are not returned in public API responses |
| User data deletion | ❌ Not implemented | GDPR/privacy law requires a deletion path |
| Data residency | Unknown | Supabase region must be documented and disclosed |
| Terms of Service | ❌ Not present | Required before real user data is collected |
| Privacy Policy | ❌ Not present | Required before real user data is collected |

---

## 7. Security Readiness Scorecard

| Domain | Score | Verdict |
|---|---|---|
| Authentication | 5/10 | ⚠️ Functional but fragile |
| Authorization / RLS | 4/10 | 🔴 Role escalation risk |
| API Security | 2/10 | 🔴 No rate limiting, CORS open |
| Moderation | 1/10 | 🔴 Stub only |
| Secrets Management | 5/10 | ⚠️ Needs rotation path |
| CI/CD Security | 2/10 | 🔴 No gates, no SAST |
| Privacy | 2/10 | 🔴 No ToS, no deletion |

**Overall Security Readiness: 3/10 — Not production-ready**

---

## 8. Security Remediation Priority Order

1. **[P0]** Rate limiting on OTP endpoint (blocks SMS abuse)
2. **[P0]** Fix role escalation — server assigns roles, never client
3. **[P1]** Lock CORS to allowed origins
4. **[P1]** Add security headers to all responses
5. **[P1]** Validate all input with Zod before business logic
6. **[P1]** Gate `deploy.yml` on CI pass
7. **[P1]** Enable branch protection on `main`
8. **[P2]** Migrate JWT to RS256
9. **[P2]** Implement token revocation via KV blacklist
10. **[P2]** Move JWT from localStorage to HttpOnly cookie
11. **[P2]** Implement block user functionality
12. **[P3]** Full SAST integration in CI
13. **[P3]** Privacy policy + ToS

---

*End of Phase 4 — Security Readiness*
