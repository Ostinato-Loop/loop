# Loop Security Readiness — Phase 4: Security & Trust Audit
**Ecosystem:** RALD / LILCKY STUDIO LIMITED
**Repo:** Ostinato-Loop/loop
**Audit Date:** 2026-06-06
**Auditor:** CTO Office
**Status:** Required deliverable — Stabilization Program Phase 4

---

## Executive Summary

Loop has foundational authentication (Supabase OTP + HS256 JWT) but has **critical security gaps** that must be closed before any real user data is stored or public launch occurs. The most severe issue is the absence of rate limiting on the OTP endpoint, which enables SMS flooding attacks and service-cost abuse. CORS misconfiguration and incomplete RLS compound the risk.

**Security Readiness Score: 31/100**
- Authentication: 7/10 (OTP flow correct, but no rate limiting)
- Authorisation / RLS: 4/10 (incomplete, not audited)
- Rate limiting: 0/10 (absent)
- Input validation: 5/10 (Zod schemas in places, not everywhere)
- Secrets management: 6/10 (Cloudflare secrets, but HS256 single secret)
- Audit trail: 3/10 (deploy audit exists, no runtime audit log)
- Moderation: 3/10 (service exists, not wired)
- Penetration testing: 0/10 (never performed)

**Verdict: 🔴 NOT READY for production with real users.**

---

## 1. Authentication

### 1.1 OTP Flow
Supabase handles SMS OTP via Termii. Flow:
```
User phone → Termii SMS → User enters OTP → Supabase verifies → Session token
```

**Findings:**

| Finding | Severity | Detail |
|---|---|---|
| No rate limiting on `/api/otp/request` | 🔴 Critical | Attacker can spam any phone number with SMS; 1000 requests = $X Termii cost + user harassment |
| OTP expiry not confirmed | 🟠 High | Supabase default is 60s. Verify `SUPABASE_OTP_EXPIRY` is set and not overridden |
| No lockout after repeated failed OTP | 🟠 High | Brute force 6-digit OTP (1M possibilities) is feasible without lockout |
| Phone number not normalised before storage | 🟠 High | `+2348012345678` vs `08012345678` can create duplicate accounts |

**Fix (P0):** Cloudflare Rate Limiting rule: max 3 OTP requests per phone number per 10 minutes, max 10 per IP per hour.

### 1.2 JWT — HS256 Implementation
```
Supabase session → Worker issues HS256 JWT → Client stores → Worker validates
```

| Finding | Severity | Detail |
|---|---|---|
| Single shared secret | 🟠 High | If RALD_JWT_SECRET leaks, all tokens are forged. No per-user signing. |
| No secret rotation mechanism | 🟠 High | Rotating the secret instantly invalidates all active sessions |
| Deprecated `LOOP_JWT_SECRET` still in env types | 🟡 Medium | Remove after Phase H migration |
| No token revocation | 🟡 Medium | Logged-out user can replay token until expiry |

**Fix (P1):** Add token family tracking in Supabase (short KV entry per `jti` claim). On logout, add jti to revocation list. Worker checks list before accepting token.

---

## 2. Authorisation — Row Level Security

### 2.1 RLS Status

RLS is enabled on Supabase tables. However:

| Table | RLS Status | Finding |
|---|---|---|
| `rooms` | Enabled | Not audited — policy content unknown |
| `room_participants` | Enabled | Can a listener read other rooms' participant lists? |
| `profiles` | Enabled | Can unauthenticated users read all profiles? |
| `messages` | Unknown | Not confirmed |
| `notifications` | Unknown | Not confirmed |

**Required action:** Full RLS policy audit. Export all policies via `pg_policies` and verify each one.

### 2.2 Missing Authorisation Checks

| Endpoint | Missing Check |
|---|---|
| `PATCH /api/rooms/:id` | Verify caller is room host |
| `POST /api/rooms/:id/kick` | Verify caller is host, not just any authenticated user |
| `POST /api/rooms/:id/raise-hand` | Verify caller is participant, not external |
| Supabase Realtime channels | No auth check on channel subscription — anyone with a JWT can subscribe to any room channel |

---

## 3. Input Validation

| Layer | Status |
|---|---|
| Worker routes | Partial — some routes use Zod, others trust raw body |
| Room name/topic | No max length enforced — DoS via huge string |
| Phone number | No E.164 format validation |
| OTP code | Type checked but no format validation (must be 6 digits) |

**Fix:** All POST/PATCH endpoints must validate with Zod before processing. Add to ESLint rule: no untyped `req.json()` without schema parse.

---

## 4. CORS

Current CORS config reads `env.CORS_ORIGIN`. In development, this is likely `*`.

**Risk:** If `*` reaches production, any website can make authenticated requests on behalf of Loop users using their cookie/token.

**Fix:** Set `CORS_ORIGIN=https://loop.rald.cloud` in production wrangler secrets. Verify in CI.

---

## 5. Content & Moderation

### 5.1 Current State
`artifacts/cloudflare-worker/src/services/moderation.ts` exists but is **not wired to any route**. Users can:
- Set any display name (no profanity filter)
- Set any room title/description (no moderation)
- Speak audio content (no moderation possible without audio vendor)

### 5.2 Required Before Launch

| Control | Priority | Mechanism |
|---|---|---|
| Host can mute/remove speaker | P0 | DO message + Realtime broadcast |
| Host can end room | P0 | DELETE `/api/rooms/:id` — already exists |
| Report user flow | P1 | POST `/api/users/:id/report` |
| Rate limit room creation | P1 | Max 3 rooms per user per hour |
| Block list (banned users) | P1 | KV-based blocklist checked on room join |
| Audio content moderation | P2 | Requires audio vendor with server-side recording |

---

## 6. Secrets & Environment

| Secret | Storage | Risk |
|---|---|---|
| `RALD_JWT_SECRET` | CF Secrets | ✅ Correct |
| `SUPABASE_SERVICE_ROLE_KEY` | CF Secrets | ✅ Correct — but leaked to client JS would be catastrophic |
| `TERMII_API_KEY` | CF Secrets | ✅ Correct |
| `OPENROUTER_API_KEY` | CF Secrets | ✅ Correct |
| Supabase anon key | SPA bundle | ⚠️ Expected (anon key is public by design) — verify RLS covers all tables |
| Supabase URL | SPA bundle | ✅ Expected |

**Finding:** No secret has been rotated since initial setup. Establish a rotation schedule (quarterly minimum).

---

## 7. Abuse Prevention

| Threat | Current State | Fix |
|---|---|---|
| SMS flooding (OTP endpoint) | 🔴 No protection | CF Rate Limiting — P0 |
| Room squatting (hold room name) | 🟠 No expiry | Auto-close rooms with 0 participants after 30 min |
| Fake account creation | 🟠 Phone only — no additional signal | Acceptable for V1 |
| DDoS | 🟡 CF Enterprise mitigates | Enable CF Bot Management |
| Token theft via XSS | 🟡 Tokens stored in localStorage | Move to httpOnly cookie — P2 |
| Data scraping | 🟡 No auth on trending endpoint | Add auth middleware to `/api/trending` |

---

## 8. Remediation Priority

| Priority | Action | Effort |
|---|---|---|
| P0 | CF Rate Limiting on OTP endpoint | S |
| P0 | OTP brute-force lockout (3 attempts → 10 min cooldown) | S |
| P0 | Verify CORS_ORIGIN is not `*` in production | XS |
| P1 | Full RLS policy audit and fix | M |
| P1 | Add Zod validation to all Worker routes | M |
| P1 | Report user endpoint | S |
| P1 | Room auto-close for empty rooms | S |
| P2 | JWT token revocation via `jti` blocklist | M |
| P2 | HS256 → ES256 with key rotation | L |
| P2 | Move auth tokens from localStorage to httpOnly cookie | M |

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-06*
