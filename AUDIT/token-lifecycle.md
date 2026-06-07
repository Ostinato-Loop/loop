# AUDIT/token-lifecycle.md
**Date:** 2026-06-07
**Sprint:** Production Hardening Sprint — Phase 1
**Scope:** All token types in the Loop × RALD ecosystem
**Evidence:** Source code inspection — artifacts/cloudflare-worker/src/, AUDIT/jwt-claim-standard.md, AUDIT/identity-unification-plan.md

---

## 1. Token Types in Use

### 1.1 Loop Access Token (OTP path)

| Property | Value |
|----------|-------|
| Type | HS256 JWT |
| Signing secret | `RALD_JWT_SECRET` (CF Worker secret) |
| Issued by | `POST /api/auth/verify-otp` |
| Storage | `localStorage["loop_token"]` (client) |
| TTL | **30 days** (`TTL_OTP_S = 2_592_000`) |
| Required claims | `sub` (Supabase Auth UUID), `email: null`, `role: "authenticated"`, `iss`, `aud`, `iat`, `exp`, `jti` |
| Optional claims | `id` (= sub), `phone`, `source: "otp"` |
| Revocable | ✅ Yes (PHD-001: `jti` → KV blocklist on signout) |
| Refresh mechanism | None — OTP re-authentication required at expiry |

### 1.2 Loop Access Token (RALD SSO path)

| Property | Value |
|----------|-------|
| Type | HS256 JWT |
| Signing secret | `RALD_JWT_SECRET` (CF Worker secret) |
| Issued by | `POST /api/auth/rald-sso` (re-signs upstream RALD token) |
| Storage | `localStorage["loop_token"]` (client) |
| TTL | **7 days** (`TTL_SSO_S = 604_800`) |
| Required claims | `sub` (RALD UUID), `email`, `role`, `iss`, `aud`, `iat`, `exp`, `jti` |
| Optional claims | `id` (= sub), `source: "rald-sso"` |
| Revocable | ✅ Yes (PHD-001: `jti` → KV blocklist on signout) |
| Refresh mechanism | Silent auth cookie → `GET /api/auth/silent` re-issues new token |

### 1.3 Loop Silent Auth Token

| Property | Value |
|----------|-------|
| Type | HS256 JWT |
| Signing secret | `RALD_JWT_SECRET` |
| Issued by | `GET /api/auth/silent` (re-signs on valid cookie) |
| Storage | `localStorage["loop_token"]` (client replaces old token) |
| TTL | **7 days** (`TTL_SSO_S`) |
| Source | Only available for SSO users (no OTP equivalent) |
| Revocable | ✅ Yes (PHD-001) |

### 1.4 RALD Session Cookie

| Property | Value |
|----------|-------|
| Type | Cookie value (contains RALD JWT) |
| Signing | `RALD_JWT_SECRET` (signed by auth.rald.cloud) |
| Set by | `auth.rald.cloud` (upstream identity provider) |
| Read by | `GET /api/auth/silent` via `parseSessionCookie()` |
| TTL | Determined by auth.rald.cloud (varies) |
| Flags | `HttpOnly`, `Secure`, `SameSite=None` (assumed — not verified in this audit) |
| Revocable | No — Loop has no control over auth.rald.cloud cookie lifecycle |

### 1.5 Messenger RALD Token

| Property | Value |
|----------|-------|
| Type | RALD JWT (pass-through from auth.rald.cloud) |
| Storage | `localStorage["messenger_rald_token"]` (Messenger client) |
| Used for | Messenger identity (Supabase Realtime channel auth) |
| Managed by | Ostinato-Loop/messenger repo (independent) |
| Revocable | No — Loop signout does NOT revoke Messenger token |
| Coordination | ❌ None — Loop and Messenger sessions are independent |

---

## 2. Current TTLs

| Token | TTL | Rationale | Configurable? |
|-------|-----|-----------|---------------|
| OTP access token | 30 days | Phone users rarely re-auth; no refresh flow | `TTL_OTP_S` constant in `lib/jwt.ts` |
| SSO access token | 7 days | Aligned with RALD upstream session lifecycle | `TTL_SSO_S` constant in `lib/jwt.ts` |
| Silent auth token | 7 days | Same as SSO (re-issue on valid cookie) | `TTL_SSO_S` |
| RALD session cookie | Unknown | Set by auth.rald.cloud | Not controllable |
| KV OTP PIN | 10 minutes | Termii: 10-minute OTP window | Hard-coded in `send-otp` handler |
| KV rate-limit windows | 1 hour (send/verify) / 24 hours (global) | OTP abuse prevention | Constants in `auth.ts` |
| KV revocation entries | `exp - now` seconds | Match remaining token lifetime exactly | Computed at signout |

---

## 3. Logout Behavior

### 3.1 Current logout (pre-PHD-001)

```
Client calls: POST /api/auth/signout
→ Endpoint NOT REGISTERED (no handler exists)
→ Client receives 404
→ Client ignores response
→ Client clears localStorage["loop_token"]
→ Result: client-side logout only
→ Old token remains valid on server for full remaining TTL
```

**Risk:** Client that clears storage is "logged out" but the token can be reused by any actor who captured it.

### 3.2 Logout after PHD-001 (implemented in this sprint)

```
Client calls: POST /api/auth/signout  (Authorization: Bearer <token>)
→ requireAuth middleware validates token
→ Middleware checks KV blocklist (jti not present → passes)
→ signout handler extracts jti from token payload
→ Computes TTL = exp - now (remaining token lifetime)
→ KV.put("revoked:jti:<jti>", "1", { expirationTtl: TTL })
→ Returns { ok: true, revoked: true }
→ Client clears localStorage["loop_token"]
→ All subsequent requests with this token → middleware checks blocklist → 401
```

**Limitation:** Tokens issued before PHD-001 have no `jti` claim. They cannot be server-revoked. They expire naturally (OTP: 30d, SSO: 7d). signout returns `{ ok: true, revoked: false }` for pre-PHD-001 tokens.

---

## 4. Session Invalidation Behavior

| Scenario | Current behavior | After PHD-001 |
|----------|-----------------|---------------|
| User clicks "logout" | Client clears localStorage only | Token jti added to KV blocklist |
| Stolen OTP token (30d) | Valid for 30 days, no kill switch | Revocable via jti blocklist if user reports and session is known |
| Stolen SSO token (7d) | Valid for 7 days, no kill switch | Revocable via jti blocklist |
| RALD_JWT_SECRET rotation | All sessions invalidated simultaneously | All sessions invalidated simultaneously (no change) |
| Supabase service role key rotation | No effect on client tokens | No effect on client tokens |
| User account deletion | Token remains valid (no user check in middleware) | Token remains valid until TTL (no user check) |
| Admin force-logout (single user) | Impossible — no mechanism | Possible if jti is known (requires admin tooling not yet built) |
| Admin force-logout (all users) | Rotate `RALD_JWT_SECRET` | Rotate `RALD_JWT_SECRET` |

**Missing:** No admin endpoint to revoke all tokens for a specific user (`sub`). Requires either:
- KV key `revoked:sub:<userId>:<iat>` (revoke all tokens issued before a timestamp)
- OR maintain a `session_version` per user in D1 and increment on forced logout

---

## 5. Cross-App SSO Behavior

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RALD SSO Architecture                            │
│                                                                      │
│  auth.rald.cloud                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Identity authority — issues RALD master JWTs               │    │
│  │  Sets HttpOnly cookie: rald_session                         │    │
│  │  RALD JWT: { id, email, role, iat, exp } + RALD_JWT_SECRET │    │
│  └───────────────────────┬─────────────────────────────────────┘    │
│                          │                                           │
│              rald_session cookie (browser)                          │
│                          │                                           │
│       ┌──────────────────┼──────────────────┐                       │
│       ▼                  ▼                  ▼                       │
│  loop-api.rald.cloud  messenger.rald.cloud  profiles.rald.cloud     │
│  (CF Worker)          (Supabase Realtime)   (separate service)      │
│                                                                      │
│  Loop flow:                                                          │
│    GET /api/auth/silent                                             │
│    → parseSessionCookie(cookie)                                     │
│    → verifyJwt(cookie_token, RALD_JWT_SECRET)                       │
│    → issueLoopToken() [re-signs, adds sub + iss + aud + jti]       │
│    → returns Loop-scoped JWT (localStorage["loop_token"])           │
│                                                                      │
│  Messenger flow:                                                     │
│    Independent — reads localStorage["messenger_rald_token"]         │
│    No Loop API involvement                                          │
│                                                                      │
│  RALD SSO direct flow:                                              │
│    POST /api/auth/rald-sso { rald_token }                          │
│    → verifyJwt(rald_token, RALD_JWT_SECRET)                         │
│    → issueLoopToken() [re-signs]                                    │
│    → returns Loop-scoped JWT                                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Cross-app session state:** Each app maintains its own token independently. There is no shared session store, no cross-app revocation bus, and no single logout that terminates all app sessions simultaneously.

---

## 6. auth.rald.cloud Interaction

| Interaction | Direction | Mechanism | Frequency |
|-------------|-----------|-----------|-----------|
| Issue RALD JWT | auth.rald.cloud → client | Set-Cookie + response body | On login to any RALD app |
| Validate RALD JWT | CF Worker ← client | `verifyJwt(token, RALD_JWT_SECRET)` — local, no HTTP call | Per API request via rald-sso or silent |
| Revoke RALD JWT | No mechanism | N/A | N/A |
| Token refresh | auth.rald.cloud → client (cookie) | Handled by auth.rald.cloud cookie lifecycle | Transparent |

**Key architectural property:** The CF Worker validates RALD JWTs **locally** using the shared `RALD_JWT_SECRET`. No HTTP call to `auth.rald.cloud` is made per request. This is fast and reliable but means the worker cannot check if auth.rald.cloud has revoked the upstream session.

---

## 7. Loop Interaction

### Token Issuance Endpoints

| Endpoint | Auth | Issues | TTL |
|----------|------|--------|-----|
| `POST /api/auth/verify-otp` | None (OTP code) | OTP access token | 30d |
| `POST /api/auth/rald-sso` | RALD JWT in body | SSO access token | 7d |
| `GET /api/auth/silent` | RALD session cookie | Silent access token | 7d |

### Token Consumption Endpoints

| Endpoint | Middleware | Token check |
|----------|-----------|-------------|
| `GET /api/auth/me` | None (manual check) | `verifyJwt` + KV blocklist |
| `POST /api/auth/signout` | `requireAuth` | `verifyJwt` + KV blocklist |
| `GET /api/rooms` | None (public) | No token required |
| `GET /api/rooms/recommendations` | `requireAuth` | `verifyJwt` + KV blocklist |
| `POST /api/rooms/:id/queue-summary` | `requireAuth` | `verifyJwt` + KV blocklist |
| `GET /api/rooms/recommendations` | `requireAuth` | `verifyJwt` + KV blocklist |
| Durable Object routes | None (internal) | No token check |

---

## 8. Messenger Interaction

Messenger (Ostinato-Loop/messenger) is a separate application that shares the RALD identity layer.

| Property | Value |
|----------|-------|
| Auth mechanism | RALD JWT stored as `localStorage["messenger_rald_token"]` |
| Where token comes from | auth.rald.cloud (direct, not via Loop API) |
| Supabase access | Anon key + Realtime subscription (no auth.uid() dependency) |
| Loop token used? | No — Messenger does not use Loop access tokens |
| Logout coordination | None — Loop `POST /signout` does NOT notify Messenger |
| Session lifetime | Tied to RALD JWT TTL (auth.rald.cloud-controlled) |

**Gap:** A user who logs out of Loop remains logged into Messenger (and vice versa). Cross-app signout requires a coordination mechanism not yet designed.

---

## 9. Profiles Interaction

| Property | Value |
|----------|-------|
| Profile store | Supabase `profiles` table (project `onxdcikfttdmnhofsuwo`) |
| Read path | `GET /api/auth/me` → Supabase REST API (service role) |
| Write path | OTP: `POST /api/auth/verify-otp` → creates profile on new user; SSO: `POST /api/auth/rald-sso` → upsert profile |
| Auth for writes | Service role key (CF Worker) — bypasses RLS |
| Auth for reads | Service role key (CF Worker) — bypasses RLS |
| Profile id | OTP: Supabase Auth UUID; SSO: RALD UUID (`rald.id`) |
| RLS state | `USING(true)` — open-world (no user-scoped protection) |

---

## 10. Failure Scenarios

| Scenario | Current behavior | Impact | Mitigation |
|----------|-----------------|--------|------------|
| `RALD_JWT_SECRET` env var missing | `verifyJwt` throws / returns null → all auth fails | P0 — complete auth outage | CF Worker secret required; deploy checks for it |
| Termii API unreachable | `POST /send-otp` returns 502 | OTP login unavailable | No fallback; consider SMS provider redundancy |
| Supabase unreachable | `verify-otp` user create/list fails → 503 | OTP login unavailable | No retry logic; manual recovery |
| KV unreachable | Sliding-window check fails → `checkSlidingWindow` throws | Rate limits bypass (attacker gets unlimited OTPs) | Wrap in try/catch; fail open on rate limits |
| Expired token presented | `verifyJwt` returns null → 401 | User must re-authenticate | Expected behavior |
| Token `jti` in blocklist | Middleware returns null → 401 | User must re-login (expected post-signout) | Expected behavior |
| KV blocklist entry missing (TTL expired after token TTL) | Token was already expired → verifyJwt returns null anyway | No risk — expiry enforced independently | By design: KV TTL = token remaining TTL |
| CORS misconfiguration | Requests from loop.rald.cloud blocked | All client requests fail | `CORS_ORIGIN` env var; verify on deploy |
| `crypto.randomUUID()` unavailable | `jti` generation fails → runtime error | Token issuance fails | Available in all CF Workers environments (V8) |

---

## Summary: Lifecycle Diagram

```
OTP LOGIN:
  Client → POST /send-otp (phone)
         ← 200 { ok, pinId → KV }

  Client → POST /verify-otp (phone, code)
    CF Worker → Termii verify API
    CF Worker → Supabase: upsert Auth user
    CF Worker → signJwt({ sub, jti, ...claims }, RALD_JWT_SECRET)
         ← 200 { access_token }          [30d TTL]
  Client stores: localStorage["loop_token"] = access_token

SSO LOGIN:
  auth.rald.cloud → Set-Cookie: rald_session (HttpOnly)
  Client → POST /api/auth/rald-sso { rald_token }
    CF Worker → verifyJwt(rald_token, RALD_JWT_SECRET)
    CF Worker → Supabase: upsert profile (id = rald.id)
    CF Worker → issueLoopToken({ sub: rald.id, jti, ...claims })
         ← 200 { access_token }          [7d TTL]
  Client stores: localStorage["loop_token"] = access_token

AUTHENTICATED REQUEST:
  Client → GET /api/rooms/recommendations (Authorization: Bearer <token>)
    requireAuth → verifyJwt(token, RALD_JWT_SECRET)
               → KV.get("revoked:jti:<jti>")  [blocklist check]
               → sets c.var.user = { id, email, role }
    handler runs → 200 { rooms }

SIGNOUT:
  Client → POST /api/auth/signout (Authorization: Bearer <token>)
    requireAuth → validate token
    handler    → KV.put("revoked:jti:<jti>", "1", { expirationTtl: remaining TTL })
               ← 200 { ok: true, revoked: true }
  Client clears: localStorage["loop_token"] = null
  Any subsequent request with old token → requireAuth → KV blocklist hit → 401
```
