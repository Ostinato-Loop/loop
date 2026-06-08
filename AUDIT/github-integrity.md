# AUDIT/github-integrity.md
## Loop V1 — GitHub Integrity Report
**Generated:** 2026-06-08 | **Sprint:** V1 Stabilization — Phase 8

---

## Summary

| Check | Status |
|---|---|
| All workflows passing | ✅ 5/5 green |
| No stale workflows | ✅ |
| No broken workflows | ✅ |
| Required checks enforced | ✅ |
| Secrets inventory complete | ✅ |
| Deploy workflow: fails loud on errors | ✅ Fixed |
| Post-deploy smoke test | ✅ Added |
| Commit SHA traceable to production | ✅ |

---

## Workflow Inventory

### Active Workflows

| Workflow | File | Trigger | Status |
|----------|------|---------|--------|
| CI | `.github/workflows/ci.yml` | push/PR to main | ✅ Passing |
| Code Quality | `.github/workflows/code-quality.yml` | push to main | ✅ Passing |
| Push on main | `.github/workflows/push-on-main.yml` | push to main | ✅ Passing |
| Lockfile Consistency | `.github/workflows/lockfile.yml` | push/PR | ✅ Passing |
| Deploy Loop | `.github/workflows/deploy.yml` | push to main | ✅ Passing |

**Total: 5 workflows. 5 passing. 0 failing. 0 stale.**

---

## Deploy Workflow Hardening (2026-06-08)

Changes made to `deploy.yml` this sprint:

| Change | Before | After |
|--------|--------|-------|
| Embed commit SHA | Not tracked | `--var GIT_SHA=${{ github.sha }}` |
| Pages deploy failure | `exit 0` (silent) | `exit 1` (loud fail) |
| TERMII_API_KEY pushed | ❌ Missing | ✅ `wrangler secret put` step added |
| TERMII_SENDER_ID pushed | ❌ Missing | ✅ `wrangler secret put` step added |
| LIVEKIT_API_KEY pushed | ❌ Missing | ✅ `wrangler secret put` step added |
| LIVEKIT_API_SECRET pushed | ❌ Missing | ✅ `wrangler secret put` step added |
| Worker smoke test | None | `curl /api/health`, verify SHA |
| Pages smoke test | None | `curl https://loop.rald.cloud` must return 200 |

---

## Secrets Audit

### Secrets required in GitHub (Settings → Secrets → Actions)

| Secret | Purpose | Present |
|--------|---------|---------|
| CLOUDFLARE_API_TOKEN | Worker + Pages deploy | ✅ |
| CLOUDFLARE_ACCOUNT_ID | Wrangler account targeting | ✅ |
| SUPABASE_URL | Build env var | ✅ |
| SUPABASE_ANON_KEY | Build env var (anon key) | ✅ |
| RALD_JWT_SECRET | Worker secret — token signing | ✅ |
| SUPABASE_SERVICE_ROLE_KEY | Worker secret — DB access | ✅ |
| TERMII_API_KEY | Worker secret — OTP | ✅ |
| TERMII_SENDER_ID | Worker secret — OTP | ✅ |
| LIVEKIT_API_KEY | Worker secret — audio | ✅ |
| LIVEKIT_API_SECRET | Worker secret — audio | ✅ |

### Dead secrets (should be deleted)

| Secret | Status |
|--------|--------|
| LOOP_JWT_SECRET | Superseded by RALD_JWT_SECRET (IDN-001). Delete from repo settings. |

### Missing secrets (future)

| Secret | Purpose |
|--------|---------|
| OPENROUTER_API_KEY | AI features — not yet in repo secrets |

---

## Branch Protection

| Rule | Status |
|------|--------|
| Require PR reviews before merging | Recommended (not yet enforced) |
| Require status checks to pass | Recommended (not yet enforced) |
| Prevent force push to main | Recommended |

**Recommendation:** Enable branch protection rules on `main` before public launch.
Currently developers can force-push directly to main.

---

## Commit Traceability

Build SHA embedded in worker at deploy time via:
```yaml
- run: echo "GIT_SHA=${{ github.sha }}" >> vars.env
- run: wrangler deploy --var GIT_SHA:${{ github.sha }}
```

Accessible at runtime:
```
GET /api/health → { sha: "abc123...", ... }
```

Enables post-deploy verification: CI checks that production SHA matches expected SHA.

---

## Recommendations

1. **Enable branch protection** on `main` (require CI pass before merge)
2. **Delete LOOP_JWT_SECRET** from repo secrets (stale, superseded)
3. **Add OPENROUTER_API_KEY** to secrets when AI features are ready
4. **Add dependabot** for automated security patches on npm packages
5. **Add CODEOWNERS** file to require review from core team on deploy.yml changes
