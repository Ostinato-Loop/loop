# RALD CI Governance Policy — Loop Enforcement Audit
**Ecosystem:** RALD / LILCKY STUDIO LIMITED  
**Repo:** Ostinato-Loop/loop  
**Audit Date:** 2026-06-06  
**Auditor:** CTO Office  
**Authority:** This document is the canonical implementation of the RALD CI Governance Policy for the Loop repository and all Ostinato-Loop repositories.

---

## Governance Mandate

> **CI is the enforcement layer of the ecosystem. Treat CI as governance infrastructure.**

The RALD CI Governance Policy exists because code quality, security, and deployment reliability are not optional. The pipeline is the gatekeeper. No human override. No exceptions.

---

## Rule 1 — No Merge on Failing CI

No pull request may be merged into any protected branch while any required CI check is failing.

This is enforced at the GitHub repository level via branch protection rules. GitHub must be configured to require all required checks to pass before a PR can be merged. The merge button is disabled until CI is green. There is no bypass permission granted to any contributor, including repository owners.

**Current state of Loop repo:** ❌ Branch protection is NOT enabled on `main`.  
**Required action:** Enable branch protection immediately (see Section 8).

---

## Rule 2 — No Deployment on Failing CI

No deployment to any environment (staging, production) may proceed unless the full CI pipeline has passed on the commit being deployed.

**Current state of Loop repo:** ❌ `deploy.yml` deploys on every push to `main` regardless of CI outcome.

```yaml
# CURRENT — VIOLATES GOVERNANCE POLICY:
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: wrangler deploy  # deploys even if typecheck failed
```

```yaml
# REQUIRED — GOVERNANCE-COMPLIANT:
on:
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run typecheck
      - run: pnpm run test
      - run: pnpm run build
      - run: pnpm audit --audit-level=high

  deploy:
    needs: [ci]          # ← DEPLOYMENT BLOCKED UNTIL CI PASSES
    if: success()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
```

**Required action:** Update `deploy.yml` immediately (see Section 7).

---

## Rule 3 — No Direct Pushes to Protected Branches

Direct pushes (force or otherwise) to the following branches are prohibited:

| Branch | Protection Level |
|---|---|
| `main` | 🔴 Protected — PR + green CI required |
| `production` | 🔴 Protected — PR + green CI + manual approval required |
| `release/*` | 🔴 Protected — PR + green CI required |

All work must flow through a Pull Request. The PR must reference the issue or audit item it resolves. The PR must pass CI before merge approval is granted.

**Current state of Loop repo:** ❌ No branch protection configured. Direct pushes to `main` are unrestricted.

---

## Required CI Checks — Every Repository

Every Ostinato-Loop repository must run the following checks. All must pass for a CI run to be considered green:

### Mandatory Checks

| Check | Command | Fails On |
|---|---|---|
| **Lint** | `pnpm run lint` | Any ESLint error or warning configured as error |
| **Typecheck** | `pnpm run typecheck` | Any TypeScript type error |
| **Tests** | `pnpm run test` | Any failing test, test timeout |
| **Build** | `pnpm run build` | Any build failure |

### Optional Checks (Run on All PRs, Non-blocking during Alpha)

| Check | Command | Note |
|---|---|---|
| Security Scan | `pnpm audit --audit-level=high` | Becomes mandatory before public launch |
| Dependency Audit | `pnpm outdated` | Informational |

### Current Loop Repo CI Status

| Check | Present | Status |
|---|---|---|
| Lint | ❌ Not configured | ESLint not installed or configured |
| Typecheck | ✅ Present | Runs on push |
| Tests | ❌ No test suite | No tests exist |
| Build | ⚠️ Partial | Only Worker build, not full SPA build |
| Security audit | ✅ Present | `pnpm audit` runs |

**Gap remediation priority:**
1. Add ESLint with shared RALD config → lint check
2. Write minimum viable test suite (auth flow, room join flow) → test check
3. Add full build step for both SPA and Worker → build check

---

## Cloudflare Policy

### Workers
- Build is required before deployment
- `wrangler deploy` must only execute after `wrangler build` succeeds
- Deployment is gated on CI (`needs: [ci]` in GitHub Actions)

### Pages
- Build is required before deployment
- `wrangler pages deploy` must only execute after `pnpm run build` succeeds in the SPA artifact
- Deployment is gated on CI

**No deployment on failure. No exceptions.**

---

## Audit Logging

Every deployment must produce an immutable audit record. The following fields must be recorded and stored permanently:

| Field | Source | Storage |
|---|---|---|
| `commit_sha` | `${{ github.sha }}` | GitHub Actions log + deployment record |
| `author` | `${{ github.actor }}` | GitHub Actions log |
| `timestamp` | `${{ github.event.head_commit.timestamp }}` | GitHub Actions log |
| `deployment_status` | Job outcome (`success` / `failure`) | GitHub Actions log |
| `environment` | `staging` or `production` | Deployment record |
| `ci_run_id` | `${{ github.run_id }}` | Links deployment to CI run |

**Implementation:** Add a `record-deployment` step as the final step in every deploy job:

```yaml
- name: Record deployment
  if: always()
  run: |
    echo "DEPLOY_RECORD: commit=${{ github.sha }} author=${{ github.actor }} ts=${{ github.event.head_commit.timestamp }} status=${{ job.status }} env=production run=${{ github.run_id }}" >> deployment.log
```

For a more robust solution, POST this record to a Cloudflare KV namespace or the RALD infrastructure logging endpoint.

---

## Standardization — All Repositories Must Use

### Node.js Version
All Ostinato-Loop repositories must use **Node.js 22 LTS**.

```yaml
# .github/workflows/ci.yml — standard setup step
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'pnpm'
```

A `.nvmrc` file containing `22` must exist at the repository root.

### Formatting
All repositories must use **Prettier** with the shared RALD config.

```json
// .prettierrc.json (shared across all repos)
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

Prettier check must run in CI: `pnpm exec prettier --check .`

### Lint Rules
All repositories must use **ESLint** with the shared RALD config.

```json
// eslint.config.js — baseline for all repos
{
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "no-console": "warn",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error"
  }
}
```

Deviations from the shared config must be documented in the repository's `AUDIT/` directory with a justification.

### CI Structure
All repositories must use a standard CI workflow structure:

```yaml
# .github/workflows/ci.yml — standard template
name: CI

on:
  push:
    branches: [main, 'release/*']
  pull_request:
    branches: [main, 'release/*']

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec prettier --check .
      - run: pnpm run lint
      - run: pnpm run typecheck
      - run: pnpm run test
      - run: pnpm run build
      - run: pnpm audit --audit-level=high
```

Any repository that cannot implement a required check (e.g., no test suite yet) must document the deviation in `AUDIT/loop-ci-governance.md` with a target date for resolution.

---

## AI Governance

AI systems (including Replit Agent, GitHub Copilot, Cursor, and any other AI code generation tool) may **propose** code changes.

**CI decides acceptance. No AI bypasses CI. No exceptions.**

This means:
1. AI-generated code is subject to the same lint, typecheck, test, and build gates as human-written code
2. AI-generated PRs must pass CI before merge
3. AI agents operating autonomously must not push directly to protected branches
4. AI agents must create a PR and wait for CI to pass before requesting merge approval
5. Audit logs must record when a commit author is an AI agent

---

## CI Dashboard — Ecosystem Readiness

A CI dashboard must track the following for every Ostinato-Loop repository:

| Repository | Build | Tests | Deploy | Uptime | Coverage |
|---|---|---|---|---|---|
| loop | ⚠️ Partial | ❌ None | 🔴 Ungated | — | 0% |
| messenger | Unknown | Unknown | Unknown | — | 0% |
| rald-auth-core | Unknown | Unknown | Unknown | — | 0% |
| rald-control-center | Unknown | Unknown | Unknown | — | 0% |
| rald-infrastructure | Unknown | Unknown | Unknown | — | 0% |
| rald-design-system | Unknown | Unknown | Unknown | — | 0% |

**Target:** 100% green ecosystem pipeline.

**Implementation options:**
1. **GitHub Actions dashboard** — native, no setup required; view from the Actions tab
2. **Shields.io badges** — embed build status badges in each repo's README
3. **Custom RALD CI dashboard** — a static page pulling GitHub Actions status via API, deployed on Cloudflare Pages

The custom RALD CI dashboard is the V2 target. Badge-based reporting is acceptable for the alpha phase.

---

## Immediate Action Items for Loop Repository

These must be completed before any P0 blocker sprint begins. CI governance is infrastructure — fix it first.

| Action | Owner | Priority | Deadline |
|---|---|---|---|
| Enable branch protection on `main` (require PR + CI) | CTO / Repo Admin | 🔴 P0 | Before next PR |
| Update `deploy.yml` to gate on CI pass | DevOps | 🔴 P0 | Before next deploy |
| Add `.nvmrc` with `22` | Any engineer | 🟡 P1 | This sprint |
| Configure ESLint | Frontend lead | 🟡 P1 | This sprint |
| Add Prettier config + CI check | Any engineer | 🟡 P1 | This sprint |
| Write first test (auth flow) | Backend lead | 🟡 P1 | This sprint |
| Add deployment audit log step | DevOps | 🟡 P1 | This sprint |
| Implement CI dashboard (badges) | Any engineer | 🟢 P2 | Next sprint |

---

## Compliance Verification

This document is reviewed and updated:
- After every sprint
- After any security incident involving CI/CD
- When a new repository is added to the Ostinato-Loop organization
- When the CI tool stack changes

**Last reviewed:** 2026-06-06  
**Next review due:** 2026-07-06  

---

*End of RALD CI Governance Policy — Loop Implementation*
