# Loop Secret Governance Report
**Date:** 2026-06-08  
**Auditor:** Infrastructure Stabilization Sprint — Phase 4  
**Scope:** Secret lifecycle, rotation policy, access control, and governance for loop production

---

## 1. Secret Classification

| Secret | Class | Owner | Rotation Policy | In Code |
|---|---|---|---|---|
| `RALD_JWT_SECRET` | Signing key | Ostinato-Loop | On compromise or quarterly | Never |
| `SUPABASE_SERVICE_ROLE_KEY` | Service credential | Supabase project | On compromise | Never |
| `CLOUDFLARE_API_TOKEN` | Deploy credential | Cloudflare account | Annually or on team changes | Never |
| `CLOUDFLARE_ACCOUNT_ID` | Account identifier | Cloudflare account | Static | Never |
| `TERMII_API_KEY` | API key | Termii account | On compromise or quarterly | Never |
| `TERMII_SENDER_ID` | Sender ID | Termii account | Static unless changed | Never |
| `LIVEKIT_API_KEY` | API key | LiveKit account | On compromise | Never |
| `LIVEKIT_API_SECRET` | Signing secret | LiveKit account | On compromise | Never |
| `SUPABASE_ANON_KEY` | Public client key | Supabase project | Low risk — public | Baked into frontend |
| `SUPABASE_URL` | Public URL | Supabase project | Static | Baked into frontend |

## 2. Secret Access Control

### GitHub Secrets
- **Org-level secrets**: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, SUPABASE_* — visible to all repos in Ostinato-Loop org.
- **Repo-level secrets**: RALD_JWT_SECRET, TERMII_*, LIVEKIT_* — scoped to `loop` repo only.
- Access: Only GitHub Actions workflows and org admins can read secrets. No developer read access.

### Cloudflare Worker Secrets
- Stored encrypted in Cloudflare KV (secret storage), not in wrangler.toml.
- Accessed only via `c.env.SECRET_NAME` in worker code.
- Not logged, not returned in API responses.

## 3. Secret Hygiene Audit

| Check | Status | Finding |
|---|---|---|
| No secrets in wrangler.toml | ✅ | wrangler.toml contains no secret values |
| No secrets in source code | ✅ | grep for hardcoded keys — none found |
| No secrets in git history | ✅ | No accidental commits detected |
| VITE_* vars are non-secret | ✅ | Only SUPABASE_ANON_KEY and URLs (both public) |
| LOOP_JWT_SECRET dead secret | ⚠️ | Repo secret exists; never used; should be deleted |
| OPENROUTER_API_KEY missing | ⚠️ | Referenced in env.ts; not in secrets; worker will fail if AI features triggered |
| RESEND_API_KEY orphaned | ⚠️ | In repo secrets; not pushed to worker; verify planned usage |

## 4. Token Lifecycle

### Loop JWT (RALD_JWT_SECRET)
- **OTP tokens**: 30-day TTL. Signed on verify-otp.
- **SSO tokens**: 7-day TTL. Issued on rald-sso POST and /silent GET.
- **Revocation**: jti stored in KV blocklist on signout. KV TTL = remaining token lifetime.
- **Silent refresh**: Client calls `GET /api/auth/silent` with `rald_session` cookie. Worker verifies cookie, issues fresh JWT.

### RALD Session Cookie
- Set by `auth.rald.cloud` (upstream RALD identity system).
- HttpOnly, Secure, SameSite=None (cross-origin).
- Not managed by Loop — Loop reads it via `parseSessionCookie()`.

## 5. Secret Rotation Runbook

### RALD_JWT_SECRET Rotation
```bash
# 1. Generate new secret (minimum 32 bytes random)
NEW_SECRET=$(openssl rand -base64 48)

# 2. Update GitHub repo secret
gh secret set RALD_JWT_SECRET --repo Ostinato-Loop/loop --body "$NEW_SECRET"

# 3. Update Cloudflare Worker secret (done automatically on next deploy)
# OR immediately:
echo "$NEW_SECRET" | wrangler secret put RALD_JWT_SECRET --env production

# 4. IMPORTANT: All existing tokens signed with old secret are immediately invalid.
# Users will be prompted to re-authenticate.
# RALD SSO users: transparent re-auth via silent cookie flow.
# OTP users: must re-enter phone + OTP.
```

### CLOUDFLARE_API_TOKEN Rotation
```bash
# 1. Create new token in Cloudflare dashboard with:
#    - Workers Scripts: Edit
#    - Cloudflare Pages: Edit
#    - Account settings: Read
# 2. Update GitHub org secret
gh secret set CLOUDFLARE_API_TOKEN --org Ostinato-Loop --body "NEW_TOKEN"
# 3. Verify next deploy succeeds
# 4. Delete old token from Cloudflare dashboard
```

## 6. Actions Required

| Action | Priority | Owner |
|---|---|---|
| Delete `LOOP_JWT_SECRET` from GitHub repo secrets | HIGH | Repo admin |
| Add `OPENROUTER_API_KEY` to repo secrets + deploy.yml | HIGH | Repo admin |
| Evaluate `RESEND_API_KEY` — keep or delete | MEDIUM | Engineering |
| Establish quarterly secret rotation calendar | MEDIUM | DevOps |
| Enable GitHub secret scanning alerts | LOW | Repo admin |

## 7. Certification

**Phase 4 Status: PASS with actions required**  
No secrets in code. Governance policies documented. Three orphaned/missing secrets need attention.

---
*Generated: 2026-06-08 | Sprint: Infrastructure Stabilization Authorization*
