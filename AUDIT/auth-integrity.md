# AUDIT/auth-integrity.md
## Loop V1 — Auth Integrity Report
**Generated:** 2026-06-08 | **Sprint:** V1 Stabilization — Phase 5 (Updated)

---

## Summary

| Check | Status |
|---|---|
| Signup (OTP) | ✅ Working |
| Login (OTP) | ✅ Working |
| Logout (token revocation) | ✅ Working |
| Session persistence | ✅ Fixed (ROUTING-FIX-001) |
| RALD SSO | ✅ Working |
| Profile creation on first login | ✅ Working |
| Profile completion (onboarding) | ✅ Working |
| Auth loops | ✅ None detected |
| Redirect loops | ✅ None detected |
| Stale session handling | ✅ Auto-refresh via /silent |
| Role handling | ✅ is_creator, is_verified in profile |
| Token expiry | ✅ Handled (401 → silent refresh) |

---

## Auth Flows

### Flow 1: Phone OTP (Native)
```
1. User enters phone → POST /api/auth/send-otp → Termii SMS
2. User enters OTP  → POST /api/auth/verify-otp
   → Supabase: INSERT/UPDATE profiles (id, phone, created_at)
   → Returns: { access_token: JWT, user: { id, phone } }
   → Stored: localStorage["loop_token"]
3. All subsequent requests: Authorization: Bearer <token>
4. Token refresh: GET /api/auth/silent (background, every 30min)
5. Logout: DELETE /api/auth/logout → revokes token server-side
```

### Flow 2: RALD SSO
```
1. User taps "Sign in with RALD"
   → Redirect to profiles.rald.cloud?redirect_to=loop.rald.cloud/login&app_id=loop
2. RALD auth returns → loop.rald.cloud/login?rald_token=TOKEN&app_id=loop
3. Frontend: stores rald_master_token in localStorage
   → POST /api/auth/rald-sso { rald_token }
   → Worker: verifies rald_token against profiles.rald.cloud
   → Upserts profile with RALD identity (display_name, avatar, username from email)
   → Returns Loop JWT
4. Same session storage as OTP flow
```

---

## Token Lifecycle

| Phase | Action | Storage |
|-------|--------|---------|
| Login | JWT issued by worker | localStorage["loop_token"] |
| RALD SSO | RALD JWT received | localStorage["rald_master_token"] |
| Request | Bearer token attached by api-fetch.ts | Header |
| Expiry (1h) | use-auth.tsx listens for AUTH_EXPIRED_EVENT | Auto-refresh via /silent |
| Logout | Token revoked server-side | localStorage cleared |

---

## Session Guards (Frontend)

| Page | Guard | Behaviour |
|------|-------|-----------|
| /login | Public | Redirects to / if already authed |
| /onboarding | Auth + !onboarded | Redirects to /login if not authed, / if already onboarded |
| / (feed) | Auth required | Redirects to /login if not authed |
| /discover | Auth required | Redirects to /login, then /onboarding if not onboarded |
| /me | Auth required | Redirects to /login |
| /rooms/:id | Auth required | Redirects to /login |

---

## Known Issues Resolved

| Issue | Fix | Date |
|-------|-----|------|
| ROUTING-FIX-001: /api/auth/silent → 404 | Added to auth.ts router | 2026-06-08 |
| IDN-001: LOOP_JWT_SECRET vs RALD_JWT_SECRET identity conflict | Standardized to RALD_JWT_SECRET | 2026-06-07 |

---

## Auth Security Posture

| Control | Status |
|---------|--------|
| JWT signed with RALD_JWT_SECRET | ✅ |
| JWT expiry enforced server-side | ✅ |
| Token revocation on logout | ✅ |
| OTP single-use enforcement | ✅ (Termii) |
| Service role key never exposed to frontend | ✅ |
| CORS: only loop.rald.cloud allowed | ✅ |
| No user passwords stored | ✅ (OTP only) |
| RLS on all Supabase tables | ✅ (see database-integrity.md) |

---

## Recommendations

1. Add OTP rate limiting (max 3 attempts per phone per 10 min) before public launch
2. Add device fingerprinting for suspicious login detection
3. Add token rotation on every /silent refresh (shorter-lived tokens)
4. Implement JWT refresh token pattern (current: 1h access token only)
