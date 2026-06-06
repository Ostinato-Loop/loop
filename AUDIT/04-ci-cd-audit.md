# AUDIT/04 — Loop CI/CD Audit
**Date:** 2026-06-06 | **Auditor:** RALD CTO / DevOps Lead  
**Method:** GitHub Actions API (live) + branch protection API | **Repo:** Ostinato-Loop/loop

---

## CI Status (Live — verified 2026-06-06)

| Run ID | Workflow | Branch | Status | Conclusion | Date |
|---|---|---|---|---|---|
| 27067771617 | CI | feat/governance-2026-06-06 | completed | **success ✅** | 2026-06-06 |
| 27067771428 | CI | feat/governance-2026-06-06 | completed | **success ✅** | 2026-06-06 |
| 27067771032 | CI | feat/governance-2026-06-06 | completed | cancelled | 2026-06-06 |

**All 4 CI gates passing: Lint ✅ | TypeCheck ✅ | Tests ✅ | Security Audit (npm audit) ✅**

Cancellations are normal — superseded by re-push.

---

## Branch Protection (Post-Governance Sprint 2026-06-06)

| Rule | Value | Assessment |
|---|---|---|
| required_approving_review_count | 0 | Pragmatic for solo team; restore to 1 when second engineer onboards |
| enforce_admins | false | Admins can bypass branch protection |
| required_status_checks | lint, typecheck, tests, security-audit | ✅ 4 gates enforced |
| strict | true | Branch must be up-to-date before merge ✅ |

---

## Open PRs
**PR #1 (feat/governance-2026-06-06 → main):** All CI green. 0 approvals required. **Mergeable — merge now.**

---

## Missing CI Gates

| Gate | Risk | Priority |
|---|---|---|
| Verify `--env production` in wrangler deploy | CORS wildcard + wrong env in production | **P0** |
| Assert RALD_JWT_SECRET is set | Auth silently broken for all RALD SSO users | **P0** |
| Verify CF Pages VITE_API_BASE_URL | Frontend hits wrong API endpoint | **P0** |
| Migration dry-run (supabase db push) | Schema drift discovered at runtime | P1 |
| Post-deploy health check | Silent broken deploy ships to users | P1 |
| rooms.category CHECK compatibility | Room creation 400s silently | P1 |
| Worker bundle size | Performance regression | P2 |

---

## CICD-001 — No Staging Environment

Changes: feature branch → main → **production** — no staging.  
A broken deploy goes immediately to all users.

Required additions:
1. `[env.staging]` block in wrangler.toml pointing to staging Supabase project
2. Staging CF Pages project at `loop-staging.pages.dev`
3. Staging deploy triggered automatically on merge to main
4. Production deploy as manual-approval step OR on tag push

---

## CICD-002 — No Post-Deploy Health Check

Required GitHub Actions addition after `wrangler deploy`:
```yaml
- name: Verify Worker Health
  run: |
    sleep 15
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://loop-api.rald.cloud/health)
    if [ "$STATUS" != "200" ]; then
      echo "Deploy failed: health endpoint returned HTTP $STATUS"
      exit 1
    fi
    echo "Worker healthy: HTTP $STATUS"
```

---

## CICD-003 — No Rollback Procedure

Cloudflare Workers supports instant rollback:
```bash
# List recent deployments
wrangler deployments list

# Roll back to previous deployment
wrangler rollback [deployment-id]
```

Action: Capture previous deployment ID in CI log. Document in RUNBOOK.md.

---

## CICD-004 — CF Pages Environment Variables Unverified

Variables required in CF Pages dashboard (Production environment):

| Variable | Required Value |
|---|---|
| VITE_API_BASE_URL | https://loop-api.rald.cloud |
| VITE_SUPABASE_URL | https://onxdcikfttdmnhofsuwo.supabase.co |
| VITE_SUPABASE_ANON_KEY | [from Supabase dashboard — Project Settings → API] |

If `VITE_API_BASE_URL` is missing or wrong, all frontend API calls fail silently in production.  
**Action:** Verify in CF Pages dashboard → loop → Settings → Environment Variables → Production.

---

## CICD-005 — Deploy Flag Unknown

`wrangler.toml` has `[env.production]` block that sets correct CORS_ORIGIN and ENVIRONMENT.  
If `deploy.yml` runs `wrangler deploy` without `--env production`:
- `CORS_ORIGIN = "*"` (wildcard) is active in production
- `ENVIRONMENT = "development"`

**Action:** Read deploy.yml and confirm the deploy command includes `--env production`.

---

## Required deploy.yml Additions (Priority Order)

```yaml
# 1. Ensure production environment
- run: wrangler deploy --env production

# 2. Assert RALD_JWT_SECRET is configured
- name: Verify Required Secrets
  run: |
    SECRETS=$(wrangler secret list --env production 2>&1)
    echo "$SECRETS" | grep -q "RALD_JWT_SECRET" || (echo "RALD_JWT_SECRET not configured!" && exit 1)

# 3. Post-deploy health check
- name: Health Check
  run: |
    sleep 15
    curl -sf https://loop-api.rald.cloud/health || exit 1

# 4. Capture deployment ID for rollback
- name: Get Deployment ID
  run: wrangler deployments list --env production | head -3
```
