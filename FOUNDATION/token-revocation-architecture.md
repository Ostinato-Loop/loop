# FOUNDATION/token-revocation-architecture.md
**Date:** 2026-06-07
**Sprint:** Production Hardening Sprint — Phase 2
**Status:** APPROVED — implementation in Phase 3
**Depends on:** AUDIT/token-lifecycle.md (Phase 1)
**Implemented in:** AUDIT/token-revocation-report.md (Phase 3)

---

## Problem Statement

Loop JWTs are stateless bearer tokens. Once issued, they are valid until expiry with no server-side mechanism to invalidate them. This creates three unacceptable risk scenarios:

1. **Stolen credential:** An attacker who captures a 30-day OTP token has 30 days of unrestricted API access with no kill switch.
2. **Lost device:** A user who loses a phone cannot invalidate their session remotely.
3. **Logout is cosmetic:** `POST /api/auth/signout` (not yet implemented) would only clear client-side state. The token remains valid server-side.

The Loop CF Worker has `CACHE` (KV Namespace) as a first-class binding — already in use for OTP rate limiting. This is the correct primitive for a token blocklist.

---

## Design Constraints

| Constraint | Rationale |
|-----------|-----------|
| Must work on Cloudflare Workers | No Redis, no Node.js session stores |
| Must not break existing sessions on deploy | Backward-compat: tokens without `jti` are ignored by blocklist, expire naturally |
| Must have minimal latency impact | KV reads are < 5ms — acceptable per-request overhead |
| Must self-clean | KV entries must expire automatically (no cron required) |
| Must not require a database write per request | Blocklist is write-on-signout, read-on-verify — not write-on-verify |
| Must survive KV outage gracefully | Fail-open on KV read error (token passes) rather than fail-closed (auth outage) |

---

## Strategy Comparison

### Option A: JTI Blocklist (Selected ✅)

**Mechanism:** Every token gets a unique `jti` (UUID v4) at issuance. On signout, the `jti` is written to KV with TTL = remaining token lifetime. Every `requireAuth` check reads KV to verify the `jti` is not blocked.

**KV key schema:** `revoked:jti:<UUID>`
**KV value:** `"1"` (presence check, value irrelevant)
**KV TTL:** `exp - floor(Date.now() / 1000)` seconds (matches remaining token lifetime)

**Advantages:**
- Per-token granularity: revoke a single session without affecting others
- Self-expiring: KV entries expire with the token — no cleanup required
- Minimal storage: only revoked tokens are stored (not all active sessions)
- Backward-compatible: tokens without `jti` skip blocklist check

**Disadvantages:**
- KV read on every authenticated request (+3–5ms)
- Cannot revoke "all sessions for a user" without knowing all jtis

**Storage estimate:** KV entry size ~50 bytes. 10,000 concurrent revoked tokens = ~500KB. Well within KV limits.

---

### Option B: Session Version Counter (Not selected)

**Mechanism:** D1 table `session_versions(user_id, version)`. Token includes `sv` claim. On every request, query D1 for current version. On force-logout, increment version. Tokens with old `sv` rejected.

**Advantages:** Supports "revoke all sessions for a user" (increment version)

**Disadvantages:**
- D1 read on every authenticated request (higher latency than KV)
- Requires DB migration and schema change
- Overkill for current scale (< 1000 DAU)
- Complex migration: all tokens re-issued on version increment

**Verdict:** Appropriate for Phase 2 at 10k+ DAU. Design preserved here for future adoption.

---

### Option C: Short-lived Tokens + Refresh Tokens (Not selected)

**Mechanism:** Access token TTL = 15 minutes. Separate refresh token (30 days). On each request, client sends access token. On expiry, client exchanges refresh token for new access token. Server can revoke refresh tokens.

**Advantages:** Industry-standard OAuth2 pattern; access tokens are short-lived (15-minute blast radius on theft)

**Disadvantages:**
- Requires implementing refresh token endpoint, storage, rotation
- Client must handle 401 → refresh → retry silently
- Doubles token infrastructure complexity
- OTP users have no email/social for re-authentication — refresh expiry means OTP re-auth required

**Verdict:** Correct long-term architecture. Defer to Phase 6 (post-certification). JTI blocklist is the pragmatic immediate fix.

---

### Option D: KV Sub-Blocklist (Not selected)

**Mechanism:** `revoked:sub:<userId>:<iat_epoch>` — revoke all tokens for a user issued before a timestamp.

**Advantages:** "Force-logout all sessions" without knowing individual jtis

**Disadvantages:** Requires querying all KV keys with prefix (KV doesn't support prefix scans efficiently)

**Verdict:** Combine with JTI blocklist in a future version if admin force-logout is required.

---

## Selected Architecture: JTI Blocklist

### Token Issuance (signJwt callsites)

All three token issuance paths add `jti: crypto.randomUUID()`:

```typescript
// routes/auth.ts — verify-otp
const token = await signJwt({
  sub, email: null, role, iss, aud, iat, exp,
  jti: crypto.randomUUID(),   // ← PHD-001
  id: userId,
  phone, source: "otp",
}, env.RALD_JWT_SECRET);

// routes/rald-sso.ts — issueLoopToken()
return signJwt({
  sub: rald.id, email, role, iss, aud, iat, exp,
  jti: crypto.randomUUID(),   // ← PHD-001
  id: rald.id,
  source,
}, env.RALD_JWT_SECRET);
```

### Token Verification (middleware + /me)

After signature and expiry checks pass, verify `jti` is not in KV blocklist:

```typescript
// middleware/auth.ts — extractUser()
const jti = payload.jti as string | undefined;
if (jti) {
  const revoked = await cache.get(`revoked:jti:${jti}`);
  if (revoked) return null;  // Rejected: token has been revoked
}
```

```typescript
// routes/auth.ts — GET /me
const jti = payload.jti as string | undefined;
if (jti) {
  const revoked = await c.env.CACHE.get(`revoked:jti:${jti}`);
  if (revoked) return c.json({ error: "Token has been revoked" }, 401);
}
```

### Signout Endpoint

```typescript
// routes/auth.ts — POST /api/auth/signout
auth.post("/signout", requireAuth(), async (c) => {
  const token = c.req.header("Authorization")!.slice(7);
  const payload = await verifyJwt(token, c.env.RALD_JWT_SECRET);
  const jti = payload?.jti as string | undefined;

  if (jti) {
    const exp = payload?.exp as number;
    const ttl = Math.max(exp - Math.floor(Date.now() / 1000), 1);
    await c.env.CACHE.put(`revoked:jti:${jti}`, "1", { expirationTtl: ttl });
  }

  // Structured audit log
  console.log("[auth/signout]", JSON.stringify({
    userId: c.get("user").id, jti, revoked: !!jti,
    timestamp: new Date().toISOString(),
  }));

  return c.json({ ok: true, revoked: !!jti });
});
```

---

## Secret Rotation Safety

`RALD_JWT_SECRET` rotation invalidates ALL tokens simultaneously (signature verification fails).

**Rotation procedure:**
1. Issue new secret value
2. Set new value in CF Worker secrets (via wrangler or CI)
3. Deploy worker
4. All users are logged out immediately — must re-authenticate
5. All KV blocklist entries become irrelevant (tokens they reference are now invalid by signature)
6. KV entries self-expire (no manual cleanup needed)

**Communication:** Secret rotation must be announced as a forced-logout event. All platform apps (Loop, Messenger) must notify users.

**Recommendation:** Rotate `RALD_JWT_SECRET` quarterly or immediately if suspected compromise.

---

## Session Expiration

Token expiry is enforced in `verifyJwt` independently of the blocklist:

```typescript
// lib/jwt.ts — verifyJwt
const payload = JSON.parse(atob(parts[1]));
const now = Math.floor(Date.now() / 1000);
if (typeof payload.exp === "number" && payload.exp < now) {
  return null;  // Expired — reject before blocklist check
}
```

Order of checks:
1. Signature verification (cryptographic)
2. Expiry check (`exp < now`)
3. KV blocklist check (`jti` in `revoked:jti:*`)

This order is important: expired tokens are rejected without a KV read (performance optimization).

---

## Cross-App Revocation Design (Future)

**Problem:** Loop signout does not revoke the Messenger RALD token or the auth.rald.cloud session cookie.

**Future architecture (not implemented in this sprint):**

```
POST /api/auth/signout
  → Loop: KV.put(revoked:jti:<loop_jti>)  ← implemented now
  → Emit revocation event to RALD event bus (KV or D1 pub/sub)
  → Messenger: polls event bus → clears messenger_rald_token
  → auth.rald.cloud: revocation webhook → invalidates session cookie
```

**Interim mitigation:** Document in user-facing help that "log out" clears Loop session only. Messenger session expires independently on RALD JWT TTL.

---

## Abuse Logging Strategy

Every signout is logged as a structured event:

```json
{
  "event": "auth.signout",
  "userId": "<sub>",
  "jti": "<uuid>",
  "revoked": true,
  "source": "otp|rald-sso|silent",
  "timestamp": "2026-06-07T12:00:00Z",
  "service": "loop-api"
}
```

**Future:** Aggregate signout patterns in CF Analytics to detect:
- Rapid sign-in/sign-out cycles (credential stuffing indicator)
- Signouts from unexpected geographies
- Bulk revocations (potential breach scenario)

---

## KV Storage Budget

| Metric | Value |
|--------|-------|
| Entry size | ~50 bytes (`revoked:jti:<36-char-UUID>` + `"1"`) |
| Max concurrent revoked tokens | 10,000 |
| Max KV storage for blocklist | ~500KB |
| KV free tier | 1GB storage |
| KV cost at 1M signouts/month | ~$0 (well within free tier) |
| Cleanup | Automatic (TTL expiry) — no cron required |

---

## Implementation Checklist (Phase 3)

- [ ] Add `jti: crypto.randomUUID()` to `verify-otp` token payload (`routes/auth.ts`)
- [ ] Add `jti: crypto.randomUUID()` to `issueLoopToken()` (`routes/rald-sso.ts`)
- [ ] Add KV blocklist check to `extractUser()` in `middleware/auth.ts`
- [ ] Add KV blocklist check to `GET /me` in `routes/auth.ts`
- [ ] Implement `POST /api/auth/signout` with KV write and structured log
- [ ] Add tests: fresh token not in blocklist, revoked jti blocks access, different jtis independent, TTL equals remaining lifetime
- [ ] Remove `LOOP_JWT_SECRET` fallback from `GET /me` (cleanup)
- [ ] Remove `LOOP_JWT_SECRET?` from `CloudflareEnv` (`types/env.ts`)
- [ ] Remove `LOOP_JWT_SECRET` deploy step from `deploy.yml`
