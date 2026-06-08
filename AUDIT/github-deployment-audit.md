# Loop GitHub Deployment Audit
**Date:** 2026-06-08  
**Auditor:** Infrastructure Stabilization Sprint — Phase 1  
**Scope:** Ostinato-Loop/loop repository — GitHub settings, branch protection, secrets, CI/CD workflows

---

## 1. Repository Configuration

| Item | Status | Detail |
|---|---|---|
| Repo name | ✅ | `Ostinato-Loop/loop` |
| Default branch | ✅ | `main` |
| Visibility | ✅ | Private |
| Org | ✅ | `Ostinato-Loop` |

## 2. CI/CD Workflow Inventory

| Workflow | File | Trigger | Status |
|---|---|---|---|
| CI | `.github/workflows/ci.yml` | push (all branches) | ✅ Active |
| Deploy Loop | `.github/workflows/deploy.yml` | push to `main`, `workflow_dispatch` | ✅ Active |
| Lockfile Consistency | Separate workflow | push | ✅ Active |
| Code Quality | Separate workflow | push | ✅ Active |

**Latest run (2026-06-08):** All 4 workflows green on commit `918ff42e`.

## 3. Deploy Pipeline — Job Graph

```
lint ──┐
       ├──→ deploy-worker (Cloudflare Worker)
typecheck ──┤    ↳ push RALD_JWT_SECRET
            ├──→ push SUPABASE_SERVICE_ROLE_KEY (2026-06-08 fix: +TERMII, +LIVEKIT)
test ───────┤    ↳ smoke test /api/health
            ↓
security ───→ deploy-pages (Cloudflare Pages)
                 ↳ build frontend (Vite)
                 ↳ wrangler pages deploy
                 ↳ smoke test https://loop.rald.cloud (added 2026-06-08)
```

## 4. Secrets Inventory

### Org-Level Secrets (visibility: all repos)
| Secret | Purpose |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS (not used by loop worker) |
| `AWS_REGION` | AWS (not used by loop worker) |
| `AWS_SECRET_ACCESS_KEY` | AWS (not used by loop worker) |
| `CLOUDFLARE_ACCOUNT_ID` | Worker + Pages deploy |
| `CLOUDFLARE_API_TOKEN` | Worker + Pages deploy |
| `SESSION_SECRET` | Legacy/shared |
| `SUPABASE_ANON_KEY` | Frontend build |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker (server-side Supabase) |
| `SUPABASE_URL` | Worker + Frontend build |

### Repo-Level Secrets (loop repo)
| Secret | Purpose | Pushed to Worker |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Override org-level | — |
| `CLOUDFLARE_API_TOKEN` | Override org-level | — |
| `LIVEKIT_API_KEY` | LiveKit audio | ✅ (added 2026-06-08) |
| `LIVEKIT_API_SECRET` | LiveKit audio | ✅ (added 2026-06-08) |
| `LIVEKIT_URL` | LiveKit server URL | via wrangler.toml vars |
| `LOOP_JWT_SECRET` | ⚠️ Legacy — superseded by RALD_JWT_SECRET | Not pushed |
| `RALD_JWT_SECRET` | Token signing (OTP + SSO) | ✅ |
| `RESEND_API_KEY` | Email (not yet used in worker) | Not pushed |
| `SUPABASE_ANON_KEY` | Override org-level | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Override org-level | ✅ |
| `TERMII_API_KEY` | OTP SMS (Termii) | ✅ (added 2026-06-08) |
| `TERMII_SENDER_ID` | OTP sender ID | ✅ (added 2026-06-08) |
| `VITE_LIVEKIT_URL` | Frontend LiveKit URL | VITE build var |

### Findings & Remediations
- **LOOP_JWT_SECRET**: Repo secret exists but is never pushed to the worker. The worker now uses `RALD_JWT_SECRET` for all token signing (IDN-001, 2026-06-07). `LOOP_JWT_SECRET` is dead weight — can be deleted from repo secrets.
- **RESEND_API_KEY**: Present in repo secrets but not in env.ts or deployed to worker. Verify if email is planned for Sprint 2; if not, delete.
- **TERMII + LIVEKIT**: Were absent from deploy.yml secret-push steps prior to 2026-06-08 fix. Now included.

## 5. Deployment Hardening Findings

| Issue | Severity | Status |
|---|---|---|
| Pages deploy `exit 0` on missing token — stale content silently serves | HIGH | ✅ Fixed 2026-06-08 → `exit 1` |
| TERMII_API_KEY/TERMII_SENDER_ID not pushed to worker | HIGH | ✅ Fixed 2026-06-08 |
| LIVEKIT_API_KEY/LIVEKIT_API_SECRET not pushed to worker | MEDIUM | ✅ Fixed 2026-06-08 |
| No Pages smoke test after deploy | MEDIUM | ✅ Fixed 2026-06-08 |
| No SHA verification post-deploy | LOW | ✅ Partial — SHA embedded in health endpoint |
| `--no-frozen-lockfile` allows lockfile drift | LOW | Accepted — pnpm catalog feature requires this; documented |
| LOOP_JWT_SECRET dead secret in repo | INFO | Action required: delete |

## 6. Branch Protection Assessment

- CI gates on main: ✅ (lint, typecheck, test, security required before deploy)
- `concurrency: cancel-in-progress: true` prevents overlapping deploys: ✅
- Direct push to main: Requires manual review (no PR bypass observed)

## 7. Certification

**Phase 1 Status: PASS with findings**  
All HIGH findings remediated. Two INFO items remain (secret cleanup). CI pipeline is green.

---
*Generated: 2026-06-08 | Sprint: Infrastructure Stabilization Authorization*
