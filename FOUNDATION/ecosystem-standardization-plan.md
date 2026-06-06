# RALD Ecosystem Standardization Plan
**Ecosystem:** RALD / LILCKY STUDIO LIMITED
**Date:** 2026-06-06
**Auditor:** CTO Office
**Instruction source:** RALD CI Governance Policy — "All repos must use: same Node version, same formatting rules, same lint rules, same CI structure. Document deviations."

---

## Current State vs Target

| Standard | Current State | Target |
|---|---|---|
| Node version | Mixed (unverified across repos) | Node 22 LTS everywhere |
| Package manager | pnpm (`loop`), npm/yarn elsewhere | pnpm everywhere |
| Formatter | ESLint (loop), Biome (loop-crm), none (others) | ESLint flat config (Biome allowed where intentional) |
| Lint rules | TypeScript + React Hooks (loop only) | Shared `@rald/eslint-config` |
| CI structure | 4 jobs in loop, fake/absent elsewhere | Shared reusable workflow |
| Branch protection | loop only | All active repos |
| Test requirement | loop only (71 tests) | All active repos (min coverage TBD) |

---

## Phase 1 — Standardize Loop (DONE)

- ✅ ESLint flat config (`eslint.config.mjs`)
- ✅ 4-job CI (lint / typecheck / tests / security)
- ✅ Branch protection on `main`
- ✅ pnpm workspace

---

## Phase 2 — Create Shared Tooling in `rald-workflows`

The `rald-workflows` repo is the designated CI/CD orchestration hub. The following must be created there:

### 2.1 Shared Reusable Workflow

Create `.github/workflows/rald-ci.yml` in `rald-workflows`:

```yaml
# rald-workflows/.github/workflows/rald-ci.yml
# Shared reusable workflow — all RALD repos reference this
name: RALD Shared CI
on:
  workflow_call:
    inputs:
      node-version:
        required: false
        type: string
        default: '22'
      working-directory:
        required: false
        type: string
        default: '.'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ inputs.node-version }}' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
        working-directory: ${{ inputs.working-directory }}

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ inputs.node-version }}' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
        working-directory: ${{ inputs.working-directory }}

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ inputs.node-version }}' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test
        working-directory: ${{ inputs.working-directory }}

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ inputs.node-version }}' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high
        working-directory: ${{ inputs.working-directory }}
```

### 2.2 Shared ESLint Config

Create `packages/eslint-config/` in `rald-workflows` (or a dedicated `rald-shared` repo):

```json
// @rald/eslint-config — index.js
{
  "extends": [
    "@typescript-eslint/recommended",
    "plugin:react-hooks/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "no-console": ["warn", {"allow": ["warn", "error"]}]
  }
}
```

Each repo's `eslint.config.mjs` then imports `@rald/eslint-config`.

---

## Phase 3 — Apply to Active Repos (Priority Order)

| Repo | Priority | Rationale |
|---|---|---|
| `rald-auth-ui` | P0 | CI is currently FAILING — fix first |
| `rald-auth-core` | P1 | Core auth infrastructure |
| `rald-control-center` | P1 | Has fake CI — replace |
| `messenger` | P1 | Has Tencent RTC — audio reference for Loop |
| `rald-infrastructure` | P1 | Gateway for all traffic |
| `loop-crm` | P2 | Active, uses Biome (deviation documented) |
| `rald-identity` | P2 | Active |
| `rald-realtime` | P2 | Active |
| `rald-notify` | P2 | Active |

---

## Phase 4 — Stub Repos

For repos in Tier 3 (stubs — no application code yet): a minimal CI guard must be in place **before** any implementation PR is opened. The guard needs only 2 jobs: `lint` (once there is code to lint) and `security` (dependency audit).

Add to each stub repo's `.github/workflows/ci.yml`:
```yaml
on: [pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          if [ -f package.json ]; then
            npm audit --audit-level=high
          else
            echo "No package.json — skipping audit"
          fi
```

This is a one-time operation across ~46 repos. Can be automated via GitHub API + the PAT.

---

## Deviation Register

Documented deviations from the standard (per Governance Policy requirement):

| Repo | Standard | Deviation | Reason | Approved |
|---|---|---|---|---|
| `loop-crm` | ESLint | Biome | Biome chosen for performance (single-tool lint+format) | ✅ CTO Office |
| `rald-auth-core` | pnpm | Unknown | Pre-dates standardisation | Pending audit |
| `messenger` | pnpm | npm | Pre-dates standardisation | Pending migration |

---

## Timeline

| Phase | Target | Owner |
|---|---|---|
| Phase 1 (loop) | DONE | ✅ |
| Phase 2 (shared tooling) | Sprint +1 (2026-06-20) | CTO Office |
| Phase 3 (active repos) | Sprint +2 to +4 (2026-07-15) | Per-repo engineering |
| Phase 4 (stubs) | Before first implementation PR per repo | Per-repo engineering |
| Full compliance | 2026-09-01 | CTO Office |

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-06*
