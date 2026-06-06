# RALD Ecosystem CI Dashboard
**Ecosystem:** RALD / LILCKY STUDIO LIMITED
**Repo:** Ostinato-Loop (all repositories)
**Generated:** 2026-06-06
**Auditor:** CTO Office
**Instruction source:** RALD CI Governance Policy — "Create ecosystem readiness dashboard. Track: build status, deploy status, test status, coverage, uptime for all RALD repositories."

---

## How to Read This Dashboard

- 🟢 **Green** — CI passing, deployment healthy
- 🔴 **Red** — CI failing or deployment broken
- 🟠 **Orange** — CI exists but has gaps (no tests, no lint, fake steps)
- ⚫ **Black** — No CI configured
- ❓ **Unknown** — Private repo, CI not accessible with current PAT scope

This dashboard is generated from evidence collected on 2026-06-06. It must be regenerated on each governance sprint or whenever a repo CI changes.

---

## Tier 1 — Production / Active Repos

| Repo | CI | Lint | Tests | Build | Deploy Gate | Status |
|---|---|---|---|---|---|---|
| `loop` | ✅ ci.yml | ✅ ESLint | ✅ 71 tests | ✅ vite build | ✅ requires CI | 🟢 **Compliant** |
| `rald-auth-core` | ✅ exists | ❓ | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-auth-ui` | 🔴 FAILING | ❓ | ❓ | 🔴 failing | 🔴 deployed anyway | 🔴 **Rule 2 Violation** |
| `rald-infrastructure` | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-identity` | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-inbox` | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ Needs audit |
| `messenger` | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-control-center` | 🟠 fake CI | 🟠 `echo "CI green ✓"` | 🟠 fake | 🟠 fake | ⚫ none | 🔴 **Fake CI** |
| `loop-crm` | ✅ exists | ❓ biome | ❓ | ❓ | ❓ | 🟠 Partial |
| `rald-realtime` | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-notify` | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-search` | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-trust` | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-status` | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ Needs audit |

---

## Tier 2 — Partial / Early-Stage Repos

| Repo | CI | Lint | Tests | Status |
|---|---|---|---|---|
| `rald-auth-sdk` | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-auth-server` | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-api-core` | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-shared-sdk` | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-design` | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-docs` | ❓ | ❓ | ❓ | ❓ Needs audit |
| `bbc-core` | ❓ | ❓ | ❓ | ❓ Needs audit |
| `rald-ai` | ❓ | ❓ | ❓ | ❓ Needs audit |
| `sekani-core` | ❓ | ❓ | ❓ | ❓ Needs audit |
| `gitrald-*` (7 repos) | ⚫ stubs | ⚫ | ⚫ | ⚫ No CI (stubs only) |

---

## Tier 3 — Confirmed Stubs (no code, no CI required yet)

Repos with only `README.md` + `BRAND.md` — no application code. CI not required until implementation begins.

| Product Group | Repos | Count |
|---|---|---|
| PayRald | payrald-core, payrald-wallet, payrald-cards, payrald-checkout, payrald-api, payrald-merchant, payrald-settlements, payrald-risk, payrald-admin | 9 |
| RALDtics | raldtics-core, raldtics-ai, raldtics-growth, raldtics-events, raldtics-insights | 5 |
| SDK | rald-sdk-messaging, rald-sdk-payments, rald-sdk-logistics, rald-sdk-auth, rald-sdk-react-native, rald-sdk-react, rald-sdk-nextjs | 7 |
| Loop sub-apps | loop-core, loop-admin, loop-meta-cloud, loop-logistics, loop-business, loop-domains, loop-storefronts, loop-dispatch, loop-voice, loop-admin, loop-crm (active), loop-audio-ui-ux | 12 |
| GitRald | gitrald-core, gitrald-runner, gitrald-security, gitrald-monitor, gitrald-ai, gitrald-observability, gitrald-deploy, gitrald-memory, gitrald-ui-ux | 9 |
| Other | dunarald, wizmac-core, rald-workflows, rald-status | 4 |

**Total confirmed stubs: ~46 repos.** These repos must have CI added before any implementation code is merged.

---

## Governance Compliance Summary

| Metric | Count | % |
|---|---|---|
| Total repos in Ostinato-Loop org | ~100 | — |
| Repos with real application code | ~25 | 25% |
| Repos with CI (any kind) | ~12 | 48% of active |
| Repos with **real** CI (not fake) | ~8 | 32% of active |
| Repos with lint in CI | ~3 | 12% of active |
| Repos with tests in CI | 1 (`loop`) | 4% of active |
| Repos with deploy gate on CI | 1 (`loop`) | 4% of active |
| Repos with branch protection | 1 (`loop`) | 4% of active |

**Ecosystem CI compliance: 4% — target: 100%**

---

## Violations Summary

### Active Rule Violations (as of 2026-06-06)

| Rule | Repo | Violation |
|---|---|---|
| Rule 2 — No deploy on failing CI | `rald-auth-ui` | CI FAILING. Product deployed to `rald-auth-ui.pages.dev` anyway. |
| Rule 1 — No merge on failing CI | `rald-auth-ui` | Branch protection not confirmed on this repo. |
| Rule 1 + Rule 2 | `rald-control-center` | Fake CI (`echo "CI green ✓"`). Deploy proceeds unconditionally. |
| Rule 1 + Rule 2 | `dunarald` | Fake CI. Same pattern. |
| Standardization | All active repos | Node version not standardised. Lint rules differ (ESLint vs Biome vs none). |

---

## Standardization Status

Per the CI Governance Policy: **All repos must use the same Node version, formatting rules, lint rules, and CI structure. Document deviations.**

| Standard | `loop` | Other active repos | Status |
|---|---|---|---|
| Node version | 22 (from ci.yml) | Mixed — not audited | 🔴 Not standardised |
| Formatter | ESLint flat config | Biome (`loop-crm`), none (others) | 🔴 Not standardised |
| Lint rules | TypeScript + React Hooks | Unknown | 🔴 Not standardised |
| CI structure | 4 jobs (lint/typecheck/tests/security) | 0–2 jobs | 🔴 Not standardised |
| Branch protection | ✅ `loop` main | Not confirmed elsewhere | 🔴 Not standardised |

**Documented deviations:**
- `loop-crm` uses Biome instead of ESLint. Biome is acceptable as an alternative; the deviation is intentional and documented here.
- `rald-auth-core` likely uses its own CI inherited from its initial setup — audit required.

---

## Required Actions to Reach 100% Compliance

1. **Immediate (this sprint):**
   - Fix `rald-auth-ui` CI — identify root cause of build failure and fix
   - Remove fake CI from `rald-control-center` and `dunarald`

2. **Short-term (next 2 sprints):**
   - Audit all 25 active repos and document actual CI state
   - Apply standardised CI template to all active repos without it
   - Enable branch protection on all active repos

3. **Medium-term (governance quarter):**
   - Create shared GitHub Actions reusable workflow in `rald-workflows` repo
   - All active repos reference the shared workflow (single source of truth)
   - Enforce standardisation via the shared workflow — Node version pinned, lint config shared

---

## Live Status Badges

When GitHub Actions is configured correctly, embed these in the repo README:

```markdown
[![CI](https://github.com/Ostinato-Loop/loop/actions/workflows/ci.yml/badge.svg)](https://github.com/Ostinato-Loop/loop/actions/workflows/ci.yml)
[![Deploy](https://github.com/Ostinato-Loop/loop/actions/workflows/deploy.yml/badge.svg)](https://github.com/Ostinato-Loop/loop/actions/workflows/deploy.yml)
```

For a real-time dashboard across all repos, implement one of:
- **GitHub's built-in:** Org-level Actions summary (available on GitHub Team/Enterprise)
- **Self-hosted:** Deploy `rald-status` as a Cloudflare Worker that calls GitHub API and renders status badges
- **Third-party:** Shields.io badges + a static status page on `status.rald.cloud`

**Recommended:** Build the status page into `rald-status` repo as a Cloudflare Pages site. It already exists as a stub — it needs implementation.

---

*CTO Office — LILCKY STUDIO LIMITED — 2026-06-06*
