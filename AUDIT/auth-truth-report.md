# Loop Auth Truth Report
**Date:** 2026-06-08  
**Auditor:** Zero-Illusion Audit Sprint  
**Scope:** Authentication flows — what actually happens vs. what users expect

---

## Auth Architecture (Actual)

```
                    ┌─────────────────────────────────────────┐
                    │           RALD Identity Layer            │
                    │   auth.rald.cloud / profiles.rald.cloud  │
                    │   Sets: rald_session cookie (HttpOnly)   │
                    └───────────────────┬─────────────────────┘
                                        │ rald_session cookie
                                        ▼
┌──────────────┐    POST /api/auth/rald-sso { rald_token }    ┌──────────────────┐
│  Loop SPA    │ ─────────────────────────────────────────►  │  Loop Worker      │
│  (React)     │ ◄─────────────────────────────────────────  │  loop-api.rald.  │
│              │   { access_token: <Loop JWT>, user: {...} }  │  cloud            │
│              │                                              │                  │
│              │    GET /api/auth/silent (Cookie header)      │                  │
│              │ ─────────────────────────────────────────►  │                  │
│              │ ◄─────────────────────────────────────────  │                  │
│              │   { valid: true, access_token, user }        │                  │
└──────────────┘                                              └──────────────────┘

Loop JWT stored: localStorage["loop_token"]
RALD session: HttpOnly cookie (not accessible to JavaScript)
```

---

## Flow 1: RALD SSO Authentication

### What it does
1. User clicks "Sign in with RALD" on `/login`.
2. Redirected to `profiles.rald.cloud` (VITE_RALD_AUTH_URL).
3. User authenticates on RALD platform.
4. RALD redirects back to Loop with `?rald_token=<signed JWT>`.
5. Frontend calls `POST /api/auth/rald-sso { rald_token }`.
6. Worker: `verifyJwt(rald_token, RALD_JWT_SECRET)` — validates signature + claims.
7. Worker: `upsertProfile()` + `provisionSupabaseAuthUser()` (for Realtime).
8. Worker: `issueLoopToken()` — signs new Loop-scoped JWT (7-day TTL, sub=rald.id).
9. Returns `{ access_token, user: { id, email, role } }`.
10. Frontend stores in `localStorage["loop_token"]`. Navigates to feed.

### Token claims (Loop JWT issued by SSO)
```json
{
  "sub": "<rald.id>",
  "email": "<email or null>",
  "role": "user",
  "iss": "https://loop-api.rald.cloud",
  "aud": "loop",
  "iat": <now>,
  "exp": <now + 604800>,
  "jti": "<uuid>",
  "id": "<rald.id>",
  "source": "rald-sso"
}
```

### Truth assessment
- ✅ JWT signature verification is real (HMAC-SHA256, not just decode).
- ✅ Audience claim validated (`aud === "loop"`) — prevents cross-service token reuse.
- ✅ Token TTL enforced server-side.
- ⚠️ Redirect URL is `profiles.rald.cloud` — confirm this is the RALD auth/login page, not just profiles management.

---

## Flow 2: OTP Authentication

### What it does
1. User enters phone `+2348...`.
2. `POST /api/auth/send-otp { phone }`.
3. Worker: 5-layer rate limiting (phone, IP, global). Calls Termii API.
4. Termii sends 6-digit OTP. `pinId` stored in KV (`otp:pin:{phone}`, TTL 600s).
5. User enters code → `POST /api/auth/verify-otp { phone, code }`.
6. Worker: IP rate limit check. Retrieves `pinId` from KV.
7. Termii verify: `POST https://api.ng.termii.com/api/sms/otp/verify`.
8. On success: check Supabase auth for existing user. Create if new.
9. Issue Loop JWT (30-day TTL for OTP users, sub=Supabase user UUID).
10. Return `{ access_token, is_new_user, user }`.

### Token claims (Loop JWT issued by OTP)
```json
{
  "sub": "<supabase_user_id>",
  "email": null,
  "role": "authenticated",
  "iss": "https://loop-api.rald.cloud",
  "aud": "loop",
  "iat": <now>,
  "exp": <now + 2592000>,
  "jti": "<uuid>",
  "id": "<supabase_user_id>",
  "phone": "+2348...",
  "source": "otp"
}
```

### Truth assessment
- ✅ Termii API is real — actual SMS delivery.
- ✅ OTP stored as `pinId` (Termii handles code generation and verification).
- ✅ 5-layer rate limiting prevents abuse.
- ✅ New user created in Supabase Auth on first login.
- ⚠️ OTP user `id` is Supabase UUID, not RALD UUID. If same user later logs in via RALD SSO, they get a different `id`. No account linking is implemented.

---

## Flow 3: Silent Session Refresh

### What it does
1. On app load: `AuthProvider` calls `loadSession()`.
2. No `localStorage["loop_token"]` → tries silent: `GET /api/auth/silent`.
3. Worker reads `rald_session` cookie (HttpOnly, set by auth.rald.cloud).
4. Verifies cookie JWT → issues fresh Loop JWT (7-day TTL).
5. Returns `{ valid: true, access_token, user }`.

**Critical fix (ROUTING-FIX-001, 2026-06-08):**  
Before: This returned 404 (route was at `/api/auth/rald-sso/silent`).  
After: Route correctly lives at `GET /api/auth/silent`. ✅

### Truth assessment
- ✅ Silent auth works post-fix.
- ✅ Profile upserted on each silent refresh (cold-start recovery).
- ⚠️ Requires `rald_session` cookie — OTP-only users cannot use silent auth (no RALD session). They must re-enter OTP after localStorage is cleared.

---

## Flow 4: Token Refresh via authFetch

### What it does
1. `authFetch(path, opts)` wraps all API calls.
2. Attaches `Authorization: Bearer <token>` from localStorage.
3. On 401 response: calls `GET /api/auth/silent` to refresh.
4. On success: updates localStorage + retries original request.
5. On silent auth failure: dispatches `AUTH_EXPIRED_EVENT`. `use-auth.tsx` clears session → navigate to `/login`.

### Truth assessment
- ✅ Auth retry logic is real.
- ✅ Event-driven session expiry (no polling).
- ✅ Circular dependency avoided: silent auth uses fetch directly, not authFetch.

---

## Flow 5: Sign Out

### What it does
1. `signOut()` in `use-auth.tsx`.
2. `POST /api/auth/signout` with Bearer token.
3. Worker extracts `jti` → stores in KV blocklist (`revoked:jti:{jti}`).
4. KV TTL = remaining token lifetime.
5. `localStorage.removeItem("loop_token")`.
6. `user = null` → navigate to `/login`.

### Truth assessment
- ✅ Server-side revocation is real (jti blocklist).
- ✅ Client-side cleanup happens before server confirms.
- ⚠️ Tokens without `jti` (issued before PHD-001, 2026-06-07) expire naturally — no immediate revocation possible. All tokens issued post-2026-06-07 include jti.

---

## Auth Summary

| Flow | Functional | Notes |
|---|---|---|
| RALD SSO | ✅ | Verify redirect URL is login page, not profile page |
| OTP | ✅ | Real SMS via Termii |
| Silent refresh | ✅ | Fixed 2026-06-08 (ROUTING-FIX-001) |
| Token refresh on 401 | ✅ | authFetch retry loop |
| Sign out + revocation | ✅ | jti blocklist active |
| Account linking (OTP ↔ RALD) | ❌ | Not implemented — two separate identities |

---
*Generated: 2026-06-08 | Sprint: Zero-Illusion Audit*
