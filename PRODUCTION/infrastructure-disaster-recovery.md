# Loop Infrastructure Disaster Recovery Plan
**Date:** 2026-06-08  
**Auditor:** Infrastructure Stabilization Sprint — Phase 7  
**Scope:** Recovery procedures for Loop production infrastructure failures

---

## 1. Service Map

| Service | Provider | DNS | Recovery RTO |
|---|---|---|---|
| API Worker | Cloudflare Workers | `loop-api.rald.cloud` | 5 minutes |
| Frontend SPA | Cloudflare Pages | `loop.rald.cloud` | 10 minutes |
| Database | Supabase (D1 + Postgres) | Managed | 30 minutes |
| KV Cache | Cloudflare KV | Managed | 5 minutes |
| Object Storage | Cloudflare R2 | Managed | 5 minutes |
| OTP SMS | Termii | Managed | Fallback: manual |
| Audio (rooms) | LiveKit | Managed | Audio-only degraded |

---

## 2. Failure Scenarios & Runbooks

### DR-001: Worker Deploy Fails (CI/CD failure)
**Symptom:** Post-deploy smoke test fails (`HTTP != 200` on `/api/health`).  
**Impact:** API down. Frontend loads but all data calls fail.  
**Recovery:**
```bash
# 1. Check Cloudflare dashboard for worker errors
# 2. Roll back to last known good deployment
cd artifacts/cloudflare-worker
git checkout <last-good-sha>
pnpm exec wrangler deploy --env production

# 3. Re-push secrets
echo "$RALD_JWT_SECRET" | pnpm exec wrangler secret put RALD_JWT_SECRET --env production
echo "$SUPABASE_SERVICE_ROLE_KEY" | pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production
# ... remaining secrets
```
**RTO:** 5 minutes.

### DR-002: Pages Deploy Fails / Frontend Corrupted
**Symptom:** `loop.rald.cloud` returns 500 or blank page.  
**Impact:** Frontend inaccessible. Workers API still live.  
**Recovery:**
```bash
# Option A: Re-deploy from last good commit
git checkout <last-good-sha> -- artifacts/loop/
cd artifacts/loop && pnpm run build
npx wrangler@4.16.0 pages deploy dist/public --project-name=loop --branch=main

# Option B: Use fallback URL
# https://loop.ostinato-loop.pages.dev (direct Pages URL, always available)
# Update CORS_ORIGIN in wrangler.toml if using fallback as primary
```
**RTO:** 10 minutes.

### DR-003: RALD_JWT_SECRET Compromised
**Symptom:** Unauthorized API access detected, or secret exposed in logs.  
**Impact:** ALL existing sessions are valid to attacker until rotated.  
**Recovery:**
```bash
# 1. Immediately rotate secret
NEW_SECRET=$(openssl rand -base64 48)
gh secret set RALD_JWT_SECRET --repo Ostinato-Loop/loop --body "$NEW_SECRET"
echo "$NEW_SECRET" | wrangler secret put RALD_JWT_SECRET --env production

# 2. This invalidates ALL existing tokens (by design — HMAC signature fails)
# Users must re-authenticate. RALD SSO users: transparent via cookie.
# OTP users: must re-enter phone + OTP.

# 3. Flush KV blocklist (no longer meaningful post-rotation)
# Keys expire naturally; no action needed.

# 4. Audit logs for compromise scope
# Cloudflare Workers logs: Cloudflare dashboard → Workers → loop-api → Logs
```
**RTO:** 5 minutes (secret rotation). All users re-authed within 24h.

### DR-004: Supabase Outage
**Symptom:** 503 from Supabase API. `/api/auth/me` fails (profile fetch), room data unavailable.  
**Impact:** Auth partially degraded (token verification still works — it's local HMAC). Profile data and rooms unavailable.  
**Recovery:**
- Monitor https://status.supabase.com
- No action required from our side — Supabase SLA handles DB recovery.
- Worker handles Supabase failures gracefully (auth JWT still verifiable locally).
- Users can still authenticate; just profile/room data fails.

### DR-005: Termii OTP Outage
**Symptom:** `POST /api/auth/send-otp` returns 502 (Termii API down).  
**Impact:** New OTP auth impossible. Existing sessions remain valid.  
**Recovery:**
- SSO users (RALD cookie) are unaffected — they use the silent cookie flow.
- OTP-only users cannot authenticate until Termii recovers.
- Monitor https://termii.com for status.
- **Long-term:** Implement fallback OTP provider (Africa's Talking, Vonage).

### DR-006: D1 Database Corruption / Data Loss
**Symptom:** D1 queries return errors or unexpected empty results.  
**Recovery:**
```bash
# 1. Check Cloudflare D1 dashboard for database status
# 2. If migration needed:
cd artifacts/cloudflare-worker
pnpm exec wrangler d1 execute loop-db --env production --file supabase/migrations/latest.sql

# 3. D1 point-in-time recovery: Contact Cloudflare support (D1 is in beta)
# 4. Supabase Postgres is the source of truth for profiles/rooms — D1 is supplemental cache
```
**RTO:** 30 minutes (if Cloudflare support needed).

---

## 3. Monitoring & Alerting

| Signal | Source | Alert Method |
|---|---|---|
| Worker health | `GET https://loop-api.rald.cloud/api/health` | Post-deploy CI check |
| Pages availability | `GET https://loop.rald.cloud` | Post-deploy CI check |
| Error rate | Cloudflare dashboard → Analytics | Manual check |
| Worker CPU time | Cloudflare dashboard | Manual check |
| Supabase status | status.supabase.com | Manual check |

**Gap:** No automated uptime monitoring (UptimeRobot/BetterStack). Recommended for beta launch.

---

## 4. Data Backup Status

| Data Store | Backup | Frequency | Location |
|---|---|---|---|
| Supabase Postgres (profiles, rooms) | ✅ Managed by Supabase | Daily | Supabase infrastructure |
| D1 Database | ⚠️ No automated backup | — | Cloudflare (beta) |
| KV Namespace (cache, rate limits, blocklist) | ❌ Not backed up | — | Ephemeral by design |
| R2 Media | ✅ Managed by Cloudflare | — | Cloudflare R2 |

---

## 5. Escalation Contacts

| Role | Contact Method |
|---|---|
| Engineering lead | GitHub @-mention in Ostinato-Loop/loop |
| Cloudflare support | support.cloudflare.com (account level) |
| Supabase support | support.supabase.com |
| Termii support | support@termii.com |

---

## 6. Certification

**Phase 7 Status: PASS**  
All critical failure scenarios documented with runbooks. D1 backup gap noted for Sprint 2 remediation.

---
*Generated: 2026-06-08 | Sprint: Infrastructure Stabilization Authorization*
