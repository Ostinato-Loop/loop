# AUDIT/jwt-claim-standard.md
**Version:** 1.0
**Date:** 2026-06-07
**Status:** ACTIVE — applies to all Loop tokens issued after IDN-001 deploy
**Source of truth:** `artifacts/cloudflare-worker/src/lib/jwt.ts`

---

## Overview

All RALD ecosystem JWTs used within Loop must conform to this standard.
Single signing secret. Single issuer. Required claim set.
This document is the specification; `src/lib/jwt.ts` is the implementation.

---

## Standard Ecosystem JWT Schema

```typescript
interface LoopJwt {
  // ── Required ──────────────────────────────────────────────────────
  sub:    string;       // User UUID — populates Supabase auth.uid()
  email:  string|null; // User email; null on OTP (phone-only) path
  role:   string;       // User role
  iss:    string;       // Issuer URL
  aud:    string;       // Audience
  iat:    number;       // Issued-at (Unix seconds)
  exp:    number;       // Expiry (Unix seconds)

  // ── Optional (backward-compat + context) ──────────────────────────
  id?:     string;      // = sub — for /me fallback (payload.id ?? payload.sub)
  phone?:  string;      // OTP path only
  source?: string;      // Token origin: "otp" | "rald-sso" | "silent"
}
```

---

## Required Claims

| Claim | Type | Description | Valid values |
|-------|------|-------------|-------------|
| `sub` | `string` | Subject — user UUID. The value `auth.uid()` reads once Supabase JWT secret is aligned | UUID v4 |
| `email` | `string \| null` | User email. `null` is a valid value for OTP (phone-only) users | Valid email or `null` |
| `role` | `string` | User role within the ecosystem | `"authenticated"`, `"user"`, `"admin"` |
| `iss` | `string` | Issuer — the service that signed the token | See Issuer Rules |
| `aud` | `string` | Audience — the application the token is intended for | See Audience Rules |
| `iat` | `number` | Issued-at timestamp (Unix seconds, no milliseconds) | `Math.floor(Date.now() / 1000)` |
| `exp` | `number` | Expiry timestamp (Unix seconds). Verified on every decode | `iat + TTL_*_S` |

All seven required claims MUST be present. A token missing any required claim is invalid
and must be rejected at the point of verification.

---

## Optional Claims

| Claim | Type | When present | Description |
|-------|------|-------------|-------------|
| `id` | `string` | Always (transition period until 2026-07-07) | Mirrors `sub`. Enables `/me` backward-compat: `payload.id ?? payload.sub` |
| `phone` | `string` | OTP path only | E.164 normalized phone number (`+234...`) |
| `source` | `string` | Always | Signing path: `"otp"`, `"rald-sso"`, or `"silent"` |

---

## Claim Ownership

| Claim | Who sets it | Source of truth |
|-------|------------|-----------------|
| `sub` | Loop CF Worker | OTP: Supabase Admin API (`newUser.id`); SSO: RALD payload (`rald.id`) |
| `email` | Loop CF Worker | OTP: always `null`; SSO: RALD payload (`rald.email`) |
| `role` | Loop CF Worker | OTP: hardcoded `"authenticated"`; SSO: RALD payload (`rald.role`) |
| `iss` | Loop CF Worker | Constant `JWT_ISSUER` in `lib/jwt.ts` |
| `aud` | Loop CF Worker | Constant `JWT_AUDIENCE` in `lib/jwt.ts` |
| `iat` | Loop CF Worker | `Math.floor(Date.now() / 1000)` at signing time |
| `exp` | Loop CF Worker | `iat + TTL_OTP_S` or `iat + TTL_SSO_S` depending on path |
| `id` | Loop CF Worker | = `sub` (backward-compat bridge) |
| `phone` | Termii → Loop CF Worker | Normalized from OTP request |
| `source` | Loop CF Worker | `"otp"` \| `"rald-sso"` \| `"silent"` |

---

## Issuer Rules

```
iss = "https://loop-api.rald.cloud"
```

All tokens issued by the Loop CF Worker use this issuer, regardless of which
upstream identity provider authenticated the user.

**Rationale:** The issuer identifies the signer — the entity whose private
key (or shared secret) signed the JWT. The Loop CF Worker signs all Loop JWTs.
`auth.rald.cloud` is the upstream identity authority (it validates who the user is),
but it is not the issuer of Loop JWTs. These are different concerns:

```
auth.rald.cloud   → validates identity → "this user is rald.id = xyz"
loop-api.rald.cloud → issues token    → "here is a Loop-scoped JWT for rald.id = xyz"
```

---

## Audience Rules

```
aud = "loop"
```

All Loop application tokens use the `"loop"` audience.

**Future extension:** Other RALD apps (Messenger, Profiles) may issue their own
app-scoped tokens with different `aud` values (`"messenger"`, `"profiles"`).
Cross-app token acceptance requires explicit `aud` validation. The Loop worker
does NOT currently validate `aud` on incoming tokens — this is safe because all
incoming tokens are issued by Loop itself.

---

## TTL Rules

| Auth path | Source | Token TTL | Constant | Rationale |
|-----------|--------|-----------|----------|-----------|
| OTP (phone) | `verify-otp` handler | **30 days** | `TTL_OTP_S` | Phone users do not re-authenticate frequently; no refresh token flow |
| RALD SSO | `rald-sso` POST handler | **7 days** | `TTL_SSO_S` | Aligned with RALD upstream session lifecycle |
| Silent auth | `rald-sso` GET `/silent` handler | **7 days** | `TTL_SSO_S` | Silent re-signs SSO-origin tokens; same lifecycle |

Constants defined in `src/lib/jwt.ts`:
```typescript
export const TTL_OTP_S = 60 * 60 * 24 * 30; // 2_592_000
export const TTL_SSO_S = 60 * 60 * 24 * 7;  //   604_800
```

---

## Signing Secret

```
RALD_JWT_SECRET   (required, non-optional in CloudflareEnv)
```

Single unified secret across the entire Loop auth surface.
Validates: verify-otp tokens, rald-sso tokens, silent auth tokens, requireAuth middleware.

**Deprecated:**
```
LOOP_JWT_SECRET   (@deprecated in CloudflareEnv; optional)
```
Was used to sign OTP tokens before IDN-001 (2026-06-07).
The `/me` endpoint retains a fallback for existing LOOP_JWT_SECRET sessions during the
30-day transition window. Remove this fallback and the secret on **2026-07-07**.

---

## Example Tokens (decoded payloads)

### OTP Token (phone authentication)
```json
{
  "sub":    "a1b2c3d4-1234-5678-abcd-ef0123456789",
  "email":  null,
  "role":   "authenticated",
  "iss":    "https://loop-api.rald.cloud",
  "aud":    "loop",
  "iat":    1749244800,
  "exp":    1751836800,
  "id":     "a1b2c3d4-1234-5678-abcd-ef0123456789",
  "phone":  "+2348012345678",
  "source": "otp"
}
```

### SSO Token (RALD SSO authentication)
```json
{
  "sub":    "e5f6g7h8-abcd-1234-5678-ef0123456789",
  "email":  "user@example.com",
  "role":   "user",
  "iss":    "https://loop-api.rald.cloud",
  "aud":    "loop",
  "iat":    1749244800,
  "exp":    1749849600,
  "id":     "e5f6g7h8-abcd-1234-5678-ef0123456789",
  "source": "rald-sso"
}
```

### Silent Token (cookie-based silent auth)
```json
{
  "sub":    "e5f6g7h8-abcd-1234-5678-ef0123456789",
  "email":  "user@example.com",
  "role":   "user",
  "iss":    "https://loop-api.rald.cloud",
  "aud":    "loop",
  "iat":    1749244800,
  "exp":    1749849600,
  "id":     "e5f6g7h8-abcd-1234-5678-ef0123456789",
  "source": "silent"
}
```

---

## Implementation Reference

### Signing
```typescript
import { signJwt, JWT_ISSUER, JWT_AUDIENCE, TTL_OTP_S, TTL_SSO_S } from "../lib/jwt.js";

const now = Math.floor(Date.now() / 1000);
const token = await signJwt(
  {
    sub:    userId,
    email:  userEmail ?? null,
    role:   userRole,
    iss:    JWT_ISSUER,
    aud:    JWT_AUDIENCE,
    iat:    now,
    exp:    now + TTL_OTP_S,   // or TTL_SSO_S
    id:     userId,             // backward-compat
    source: "otp",              // or "rald-sso" | "silent"
  },
  env.RALD_JWT_SECRET,
);
```

### Verification
```typescript
import { verifyJwt } from "../lib/jwt.js";

const payload = await verifyJwt(token, env.RALD_JWT_SECRET);
if (!payload) { /* invalid or expired — reject request */ }
const userId = (payload.id ?? payload.sub) as string;
```

---

## Deprecation Schedule

| Item | Deprecated | Remove by | Action |
|------|-----------|-----------|--------|
| Signing OTP tokens with `LOOP_JWT_SECRET` | 2026-06-07 | 2026-07-07 | Done — now uses `RALD_JWT_SECRET` |
| `/me` `LOOP_JWT_SECRET` fallback | 2026-06-07 | 2026-07-07 | Remove fallback block from `routes/auth.ts` |
| `LOOP_JWT_SECRET` CF Worker secret | 2026-06-07 | 2026-07-07 | Delete from Cloudflare Worker secrets dashboard |
| `LOOP_JWT_SECRET?` in `CloudflareEnv` | 2026-06-07 | 2026-07-07 | Remove field from `types/env.ts` |
