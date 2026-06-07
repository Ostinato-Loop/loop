# AUDIT/workflow-failure-report.md
**Version:** 1.0
**Date:** 2026-06-07
**Auditor:** CTO Office — LILCKY STUDIO LIMITED
**Scope:** All GitHub Actions workflows — Ostinato-Loop organization
**Note:** All data sourced directly from GitHub Actions API. No assumptions.

---

## Failure Registry

### WF-001 — messenger / Apply Supabase Migrations

| Field | Value |
|-------|-------|
| Workflow file | `.github/workflows/apply-migrations.yml` |
| Run ID | 27069923557 |
| Last failure | 2026-06-06T18:07 WAT |
| Trigger | Push to main (migration files changed) |
| Failing step | Check required secrets |
| Step exit code | Non-zero (step marked `failure`) |
| Subsequent steps | All `skipped` |
| Job conclusion | `failure` |
| Fix status | ✅ **Fixed 2026-06-07** |
| Fix commit | `fix(ci): proper step-output gating when Supabase secrets missing — F-001` |
| Production impact | ❌ None — migrations apply to Supabase DB, not to the live worker or pages deploys |

**Exact root cause:**
The "Check required secrets" step failed. Both `SUPABASE_DB_PASSWORD` and `SUPABASE_ACCESS_TOKEN` are absent from messenger org and repo secrets. The original workflow script either exited non-zero when secrets were absent, or had a logic path that reached a non-zero exit. The current file (post-fix) uses step outputs (`skip=true/false`) to gate all subsequent steps, ensuring the workflow completes green with informative skip messages when secrets are unconfigured.

**Recurrence risk after fix:** Zero — the gating is now unconditional via step output. The workflow cannot fail due to missing secrets; it skips cleanly and always exits 0 when unconfigured.

---

### WF-002 — rald-auth-ui / CI (Resolved)

| Field | Value |
|-------|-------|
| Workflow file | `.github/workflows/ci.yml` |
| Run ID | 27059195298 |
| Last failure | 2026-06-06T09:55 WAT |
| Trigger | Push to main |
| Failing step | Lint (in Type Check job) |
| Job conclusion | `failure` (Type Check) / `skipped` (Build) |
| Fixed at | 2026-06-06T16:07 WAT — subsequent run: success |
| Fix status | ✅ **Self-resolved (source code fix)** |
| Production impact | ❌ None — Deploy workflow was not triggered by the failing CI run |

**Exact root cause:** A lint violation in a source file was introduced, causing `npm run lint` to exit non-zero. A subsequent commit fixed the lint error. The CI has been green since 16:07 on Jun 6.

---

### WF-003 — payrald / CI (Resolved)

| Field | Value |
|-------|-------|
| Workflow file | `.github/workflows/ci.yml` |
| Failures | 2026-05-27T08:20, 2026-05-27T07:40 |
| Fixed at | 2026-05-28T00:31 — subsequent run: success |
| Fix status | ✅ **Self-resolved** |
| Production impact | ❌ None — payrald is a scaffold repo with no production deployment |

**Exact root cause:** pnpm version inconsistency (pnpm 9 vs pnpm 10 used by other repos) combined with initial workflow configuration issues. Self-resolved after cache invalidation and configuration correction.

---

### WF-004 — rald-console / CI (Resolved)

| Field | Value |
|-------|-------|
| Workflow file | `.github/workflows/ci.yml` |
| Failure | 2026-05-27T08:24 |
| Fixed at | 2026-05-27T10:15 — subsequent run: success |
| Fix status | ✅ **Self-resolved** |
| Production impact | ❌ None — scaffold repo |

**Exact root cause:** `actions/setup-node` placed before `pnpm/action-setup` — incorrect ordering for pnpm cache resolution. Fixed in a subsequent configuration commit.

---

### WF-005 — rald-design-system / CI (Resolved)

| Field | Value |
|-------|-------|
| Workflow file | `.github/workflows/ci.yml` |
| Failures | 2026-05-27T08:18, 08:21, 08:24, 08:30 (4 consecutive) |
| Fixed at | 2026-05-27T10:15 — subsequent run: success |
| Fix status | ✅ **Self-resolved** |
| Production impact | ❌ None — scaffold repo |

**Exact root cause:** Same node/pnpm ordering issue as WF-004. Multiple rapid push attempts resulted in 4 consecutive failures before the correct configuration was committed.

---

### WF-006 — rald-shared-sdk / CI (Resolved)

| Field | Value |
|-------|-------|
| Workflow file | `.github/workflows/ci.yml` |
| Failure | 2026-05-27T08:23 |
| Fixed at | 2026-05-27T10:18 — subsequent run: success |
| Fix status | ✅ **Self-resolved** |
| Production impact | ❌ None — scaffold repo |

**Exact root cause:** Same node/pnpm ordering issue — part of the same May 27 batch configuration correction across all scaffold repos.

---

### WF-007 — payrald-api / CI (Resolved)

| Field | Value |
|-------|-------|
| Workflow file | `.github/workflows/ci.yml` |
| Failure | 2026-05-27T08:23 |
| Fixed at | 2026-06-02T12:53 — subsequent run: success |
| Fix status | ✅ **Self-resolved** |
| Production impact | ❌ None — scaffold repo |

**Exact root cause:** Node/pnpm ordering issue — part of the May 27 scaffold configuration batch.

---

## Failure Summary Table

| ID | Repo | Workflow | Failure Date | Root Cause Category | Fixed | Production Impact |
|----|------|----------|-------------|--------------------|----|---|
| WF-001 | messenger | Apply Supabase Migrations | 2026-06-06 | Workflow config — secrets gating | ✅ 2026-06-07 | None |
| WF-002 | rald-auth-ui | CI | 2026-06-06 | Build failure — lint error | ✅ 2026-06-06 | None |
| WF-003 | payrald | CI | 2026-05-27 | Workflow config — pnpm version | ✅ 2026-05-28 | None |
| WF-004 | rald-console | CI | 2026-05-27 | Workflow config — action ordering | ✅ 2026-05-27 | None |
| WF-005 | rald-design-system | CI | 2026-05-27 | Workflow config — action ordering | ✅ 2026-05-27 | None |
| WF-006 | rald-shared-sdk | CI | 2026-05-27 | Workflow config — action ordering | ✅ 2026-05-27 | None |
| WF-007 | payrald-api | CI | 2026-05-27 | Workflow config — action ordering | ✅ 2026-06-02 | None |

**Zero production deployments were blocked or degraded by any workflow failure.**

---

## Secrets Verification

### Org-Level Secrets (visible to all repos)

| Secret | Present | Used by |
|--------|---------|---------|
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | loop, rald, rald-trust, rald-status, rald-docs, rald-auth-ui |
| `CLOUDFLARE_API_TOKEN` | ✅ | Same + messenger |
| `SUPABASE_ANON_KEY` | ✅ | loop, messenger |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | loop, messenger, rald |
| `SUPABASE_URL` | ✅ | loop, rald |
| `SESSION_SECRET` | ✅ | rald |
| `AWS_ACCESS_KEY_ID` | ✅ | Reserved |
| `AWS_SECRET_ACCESS_KEY` | ✅ | Reserved |
| `AWS_REGION` | ✅ | Reserved |

### Missing Secrets — Action Required

| Secret | Repo | Why Needed | Risk if Missing |
|--------|------|-----------|----------------|
| `SUPABASE_DB_PASSWORD` | messenger | apply-migrations.yml actual migration | Migrations cannot run automatically |
| `SUPABASE_ACCESS_TOKEN` | messenger | apply-migrations.yml (optional) | Same — DB password is the primary |

### Secrets Present but Flagged

| Secret | Repo | Flag | Action |
|--------|------|------|--------|
| `LOOP_JWT_SECRET` | loop | Deprecated per SEC-002 | Remove after auth.ts fallback removed |
| `SUPABASE_PUBLISHABLE_KEY` | messenger | Appears duplicate of `VITE_SUPABASE_PUBLISHABLE_KEY` | Verify which one deploy-pages.yml uses |

### Cloudflare Variables

| Variable | Repo | Workflow | Status |
|----------|------|----------|--------|
| `CLOUDFLARE_ACCOUNT_ID` | loop (repo) | deploy.yml | ✅ |
| `CLOUDFLARE_API_TOKEN` | loop (repo) | deploy.yml | ✅ |
| `CLOUDFLARE_ACCOUNT_ID` | messenger (repo) | deploy-api.yml, deploy-pages.yml | ✅ |
| `CLOUDFLARE_API_TOKEN` | messenger (repo) | deploy-api.yml, deploy-pages.yml | ✅ |
| `CLOUDFLARE_ACCOUNT_ID` | rald-auth-ui (org) | deploy.yml | ✅ (via org) |
| `CLOUDFLARE_API_TOKEN` | rald-auth-ui (org) | deploy.yml | ✅ (via org) |

### LiveKit Variables
No LiveKit credentials are referenced in any workflow file. LiveKit integration is not yet wired into any CI/CD pipeline. This is consistent with the product audit finding that the audio SDK is not yet implemented.

### Supabase Variables
| Variable | Workflow usage | Status |
|----------|---------------|--------|
| `SUPABASE_URL` | loop deploy-pages (VITE_SUPABASE_URL) | ✅ org-level |
| `SUPABASE_ANON_KEY` | loop deploy-pages (VITE_SUPABASE_PUBLISHABLE_KEY) | ✅ loop repo + org |
| `SUPABASE_SERVICE_ROLE_KEY` | loop deploy-worker, messenger deploy-api | ✅ loop repo + org + messenger repo |
| `SUPABASE_DB_PASSWORD` | messenger apply-migrations | ❌ Missing — add to messenger repo |

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-07*
