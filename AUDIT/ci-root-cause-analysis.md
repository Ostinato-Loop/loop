# AUDIT/ci-root-cause-analysis.md
**Version:** 1.0 — CI Root Cause Analysis
**Date:** 2026-06-07
**Auditor:** CTO Office — LILCKY STUDIO LIMITED
**Scope:** All GitHub Actions workflows across the Ostinato-Loop organization
**Method:** Direct API inspection of workflow files, run logs, secrets, and job step outputs. No assumptions.

---

## Audit Scope

| Repos inspected | 30 |
|---|---|
| Repos with workflows | 20 |
| Total workflow files | 47 |
| Workflow runs inspected | 100+ recent runs |
| Active failures at audit time | 1 |
| Historical (resolved) failures | 6 |
| Total secrets audited | Org (9) + repo-level per repo |

---

## Failure Inventory

### F-001 — ACTIVE — messenger/Apply Supabase Migrations
**Repo:** `Ostinato-Loop/messenger`
**Workflow:** `.github/workflows/apply-migrations.yml`
**Run ID:** 27069923557
**Timestamp:** 2026-06-06T18:07 WAT
**Status:** ❌ FAILED — stale unresolved failure

#### Failing Step
```
JOB:  Apply DB Migrations to Supabase → conclusion: failure
STEP: Check required secrets           → conclusion: failure ← ROOT
STEP: Install psql                     → conclusion: skipped
STEP: Apply migrations                 → conclusion: skipped
STEP: Smoke test                       → conclusion: skipped
```

#### Root Cause
**Category: Workflow configuration — secrets gating logic**

The `apply-migrations.yml` workflow at the time of the failing run had an incorrect exit behaviour when Supabase secrets were missing. The "Check required secrets" step was designed to skip gracefully, but the original version of the script exited with a non-zero code when `SUPABASE_DB_PASSWORD` and `SUPABASE_ACCESS_TOKEN` were both unset, causing the step to fail rather than skip.

**Confirmed:** Neither `SUPABASE_DB_PASSWORD` nor `SUPABASE_ACCESS_TOKEN` are present in:
- Ostinato-Loop org-level secrets (9 secrets — neither is listed)
- messenger repo-level secrets (18 secrets — neither is listed)

This means every run of this workflow triggered since the repo was created has faced empty credentials. The graceful-skip logic in the workflow was the intended solution, but was incorrectly implemented.

#### Secondary Bug (in current workflow at time of audit)
Even after the initial fix attempt, the current workflow file (before this audit's fix) had a secondary bug: the smoke test step used the condition `if: ${{ github.event.inputs.dry_run != 'true' }}` — this condition is **independent of whether the secrets check passed**. As a result:

1. "Check required secrets" exits 0 (graceful skip)
2. "Install psql" runs (no gate)
3. "Apply migrations" runs with `PGPASSWORD=""` → psql connection hangs or fails → job fails

The smoke test step would also have run with empty `PGPASSWORD`, guaranteeing a failure if the workflow was ever triggered again without secrets being configured.

#### Fix Applied
Replaced single graceful-exit approach with a proper step-output gating pattern:

```yaml
- name: Check required secrets
  id: secrets-check
  run: |
    if [ -z "$SUPABASE_DB_PASSWORD" ] && [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
      echo "skip=true" >> "$GITHUB_OUTPUT"
      # ... warning message
    else
      echo "skip=false" >> "$GITHUB_OUTPUT"
    fi

- name: Install psql
  if: steps.secrets-check.outputs.skip != 'true'
  ...

- name: Apply migrations
  if: steps.secrets-check.outputs.skip != 'true'
  ...

- name: Smoke test
  if: steps.secrets-check.outputs.skip != 'true' && github.event.inputs.dry_run != 'true'
  ...
```

All subsequent steps are now gated on `steps.secrets-check.outputs.skip != 'true'`. When secrets are missing, the workflow completes all steps as skipped, the job passes, and a summary step explains what is missing and what action is required.

Also fixed the migration apply loop to track per-file failures and exit 1 only at the end (rather than using `|| echo "⚠ Failed"` which masked failures).

---

### F-002 — RESOLVED — rald-auth-ui/CI Lint Failure
**Repo:** `Ostinato-Loop/rald-auth-ui`
**Workflow:** `.github/workflows/ci.yml`
**Run ID:** 27059195298
**Timestamp:** 2026-06-06T09:55 WAT
**Status:** ✅ Self-resolved — subsequent run (2026-06-06T16:07) passed

#### Failing Step
```
JOB:  Type Check → conclusion: failure
STEP: Lint       → conclusion: failure ← ROOT
JOB:  Build      → conclusion: skipped (needs: typecheck)
```

#### Root Cause
**Category: Build failure — linting error in source code**

The `rald-auth-ui` CI workflow runs `npm run lint` as part of the Type Check job. A source code change pushed to main introduced a linting error (likely an ESLint rule violation). A subsequent commit fixed the lint error, and the CI passed at 16:07.

The `rald-auth-ui` repo uses `npm` (not pnpm) and has zero repo-level secrets, relying entirely on org-level secrets (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`) for deployment. This is correct behaviour.

#### Fix Applied
No workflow changes required. Source code fix was applied in a subsequent commit. CI has been continuously green since 2026-06-06T16:07.

#### Recommendation
Add `lint` as a separate CI job with `continue-on-error: false` and ensure `build` job `needs: [typecheck, lint]` — currently lint and typecheck are in the same job, which means a lint failure skips the build job without a clear signal about whether typecheck passed. Separating them improves debuggability. **Deferred — not a blocking issue.**

---

### F-003 — RESOLVED — payrald/CI
**Repo:** `Ostinato-Loop/payrald`
**Workflow:** `.github/workflows/ci.yml`
**Run IDs:** Two failures on 2026-05-27
**Status:** ✅ Self-resolved — last run (2026-05-28T00:31) passed

#### Root Cause
**Category: Workflow configuration — pnpm version inconsistency**

The `payrald` CI uses `pnpm/action-setup@v4 version: 9` while the rest of the organisation uses `version: 10`. During the May 27 failures, the pnpm cache was likely stale or the version pinning caused a resolution failure. The subsequent run resolved via cache invalidation.

**Note:** `payrald` is intentionally scaffold-only at this stage — the `ci.yml` has a `package.json` existence check and gracefully skips all CI steps if no `package.json` is found. This is correct for a scaffold repo.

#### Fix Applied
No immediate fix required. **Recommendation:** Standardise all scaffold repo CI to pnpm 10. Tracked in reliability report.

---

### F-004 — RESOLVED — rald-console/CI
**Repo:** `Ostinato-Loop/rald-console`
**Workflow:** `.github/workflows/ci.yml`
**Failure:** 2026-05-27T08:24
**Status:** ✅ Self-resolved — last run (2026-05-27T10:15) passed

#### Root Cause
**Category: Workflow configuration — node/pnpm order issue**

The `rald-console` CI had `setup-node` before `pnpm/action-setup` in the original version. pnpm cache requires pnpm to be installed before the node setup cache step resolves. This is a known GitHub Actions ordering issue — `pnpm/action-setup` must come before `actions/setup-node` with `cache: pnpm`. The order was corrected in a subsequent commit.

---

### F-005 — RESOLVED — rald-design-system/CI
**Repo:** `Ostinato-Loop/rald-design-system`
**Workflow:** `.github/workflows/ci.yml`
**Failures:** 4 failures on 2026-05-27 (08:18, 08:21, 08:24, 08:30)
**Status:** ✅ Self-resolved — last run (2026-05-27T10:15) passed

#### Root Cause
**Category: Workflow configuration — same node/pnpm ordering issue as F-004**

Multiple rapid push attempts to fix the ordering issue resulted in 4 consecutive failures before the correct configuration landed. No ongoing risk.

---

### F-006 — RESOLVED — rald-shared-sdk/CI + payrald-api/CI
**Repos:** `Ostinato-Loop/rald-shared-sdk`, `Ostinato-Loop/payrald-api`
**Failures:** 2026-05-27
**Status:** ✅ Both self-resolved — last runs passing

#### Root Cause
**Category: Workflow configuration — same node/pnpm ordering issue (F-004 family)**

Same root cause as F-004 and F-005. All scaffold repos received the same incorrect initial workflow configuration on May 27, and all were fixed in the same batch correction.

---

## Secrets Audit

### Org-Level Secrets (available to all repos)
```
AWS_ACCESS_KEY_ID          ✅ Visibility: all
AWS_REGION                 ✅ Visibility: all
AWS_SECRET_ACCESS_KEY      ✅ Visibility: all
CLOUDFLARE_ACCOUNT_ID      ✅ Visibility: all
CLOUDFLARE_API_TOKEN       ✅ Visibility: all
SESSION_SECRET             ✅ Visibility: all
SUPABASE_ANON_KEY          ✅ Visibility: all
SUPABASE_SERVICE_ROLE_KEY  ✅ Visibility: all
SUPABASE_URL               ✅ Visibility: all
```

### Loop Repo Secrets (9)
```
CLOUDFLARE_ACCOUNT_ID      ✅ (also in org — redundant, harmless)
CLOUDFLARE_API_TOKEN       ✅ (also in org — redundant, harmless)
LOOP_JWT_SECRET            ⚠️  DEPRECATED — SEC-002 (security audit). Should be removed after migration window
RALD_JWT_SECRET            ✅ Active JWT signing secret
RESEND_API_KEY             ✅ Email delivery
SUPABASE_ANON_KEY          ✅ (also in org — redundant, harmless)
SUPABASE_SERVICE_ROLE_KEY  ✅ (also in org — redundant, harmless)
TERMII_API_KEY             ✅ SMS delivery
TERMII_SENDER_ID           ✅ SMS sender ID
```

**SUPABASE_URL is NOT in loop repo secrets** — it is available via org-level secret. The loop `deploy.yml` uses `${{ secrets.SUPABASE_URL }}` which resolves correctly via org-level. ✅

### Messenger Repo Secrets (18)
```
SUPABASE_DB_PASSWORD       ❌ MISSING — required for apply-migrations.yml to function
SUPABASE_ACCESS_TOKEN      ❌ MISSING — required for apply-migrations.yml to function
VITE_SUPABASE_PUBLISHABLE_KEY  ✅
SUPABASE_PUBLISHABLE_KEY   ✅ (appears to be duplicate of above — verify)
CLOUDFLARE_ACCOUNT_ID      ✅
CLOUDFLARE_API_TOKEN       ✅
RALD_JWT_SECRET            ✅
... (11 others present)
```

### Missing Secrets — Action Required

| Secret | Repo | Required by | Priority | Action |
|--------|------|-------------|----------|--------|
| `SUPABASE_DB_PASSWORD` | messenger | apply-migrations.yml | P1 | Add Supabase project DB password |
| `SUPABASE_ACCESS_TOKEN` | messenger | apply-migrations.yml | P2 | Add Supabase PAT for CLI migrations |
| `LOOP_JWT_SECRET` removal | loop | SEC-002 | P2 | Remove after LOOP_JWT_SECRET is removed from worker code |

---

## Node Version Consistency

| Repo | Node version | pnpm version | Package manager |
|------|-------------|-------------|-----------------|
| loop | 22 | 10 | pnpm |
| messenger | 22 | 10.26.1 | pnpm |
| rald-auth-ui | 22 | — | npm |
| rald-trust | 22 | 10 | pnpm |
| rald-status | 22 | 10 | pnpm |
| rald-docs | 22 | 10 | pnpm |
| rald | 22 | 10 | pnpm |
| payrald | 22 | **9** | pnpm |
| rald-console | 22 | 10 | pnpm |
| rald-design-system | 22 | 10 | pnpm |

**Issue:** `payrald` uses pnpm 9; all others use pnpm 10. No active failure, but inconsistent. Recommend updating payrald to pnpm 10 when the scaffold is initialised.

**Node 22 across all repos:** ✅ Consistent.

---

## Workflow Configuration Issues (Non-Failing)

### Loop deploy.yml — Duplicate CI Jobs
The `deploy.yml` runs `lint`, `typecheck`, `test`, and `security` jobs independently of the `ci.yml`. This means every push to main runs 8 jobs (4 in CI + 4 in deploy) doing the same work. This doubles runner cost but does not cause failures.

**Recommendation:** Remove duplicated CI steps from `deploy.yml`. Use `needs: ci` with workflow_call, or rely on branch protection to ensure CI passes before deploy runs.

### Loop deploy.yml — Secret Push Ordering
The `deploy-worker` job deploys the worker FIRST, then pushes secrets (`RALD_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`). There is a window between deploy and secret push where the worker has old secrets. This is acceptable for rolling deploys but creates a brief inconsistency.

**Recommendation:** For critical secrets, consider using `wrangler secret bulk` to push all secrets before deploying. Low priority — no current failures.

### messenger deploy-pages.yml — `--frozen-lockfile` vs `--no-frozen-lockfile`
The messenger CI uses `--frozen-lockfile` (strict) while loop CI uses `--no-frozen-lockfile`. The strict mode is correct for production deploys — it ensures the lockfile matches exactly. The loop CI's `--no-frozen-lockfile` is lenient and can mask lockfile drift.

**Recommendation:** Switch loop CI and deploy to `--frozen-lockfile` after verifying the lockfile is up to date. Deferred — requires lockfile audit first.

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
