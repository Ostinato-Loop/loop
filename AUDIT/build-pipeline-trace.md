# Loop Build Pipeline Trace
**Date:** 2026-06-08  
**Auditor:** Infrastructure Stabilization Sprint — Phase 3  
**Scope:** Full CI/CD pipeline from commit to production for Ostinato-Loop/loop

---

## 1. Pipeline Overview

```
Developer pushes to main
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│  GitHub Actions: "Deploy Loop"                           │
│                                                          │
│  Job 1: Lint      ──┐                                    │
│  Job 2: Typecheck ──┼──► Job 5: deploy-worker           │
│  Job 3: Tests     ──┤         ├── wrangler deploy        │
│  Job 4: Security  ──┘         ├── push secrets (6x)      │
│                               └── smoke test /api/health │
│                          Job 6: deploy-pages             │
│                               ├── vite build             │
│                               ├── wrangler pages deploy  │
│                               └── smoke test loop.rald.cloud│
└──────────────────────────────────────────────────────────┘
```

## 2. Step-by-Step Trace

### Step 1: Checkout
```yaml
uses: actions/checkout@v4
```
Full shallow clone of `main`.

### Step 2: pnpm Setup
```yaml
uses: pnpm/action-setup@v4
  with: { version: 10 }
```
pnpm 10 installed. Workspace: `pnpm-workspace.yaml` with catalog feature.

### Step 3: Node.js Setup
```yaml
uses: actions/setup-node@v4
  with: { node-version: 22, cache: pnpm }
```
Node 22 LTS. pnpm cache keyed to lockfile hash.

### Step 4: Install
```yaml
run: pnpm install --no-frozen-lockfile
```
**Note:** `--no-frozen-lockfile` is intentional — the pnpm `catalog:` feature in pnpm-workspace.yaml can cause lockfile drift warnings under `--frozen-lockfile`. Accepted tradeoff, documented.

### Step 5: Lint (Job 1)
```bash
cd artifacts/loop && pnpm run lint
```
ESLint on frontend source. Worker has no separate lint step (TypeScript strict mode serves as lint).

### Step 6: Typecheck (Job 2)
```bash
cd artifacts/cloudflare-worker && pnpm exec tsc --noEmit
cd artifacts/loop && pnpm exec tsc --noEmit
```
Both worker and frontend typechecked. `tsconfig.json` in each workspace.

### Step 7: Tests (Job 3)
```bash
cd artifacts/cloudflare-worker && pnpm run test
cd artifacts/loop && pnpm run test
```
Worker tests use Vitest with `@cloudflare/vitest-pool-workers`. Frontend tests use Vitest + jsdom.

### Step 8: Security Audit (Job 4)
```bash
pnpm audit --audit-level=high
```
Hard fail on HIGH or CRITICAL vulnerabilities. Currently passing.

### Step 9: Deploy Worker (Job 5) — needs Jobs 1-4
```bash
cd artifacts/cloudflare-worker
pnpm exec wrangler deploy --env production --var "COMMIT_SHA:${{ github.sha }}"
```
Deploys Hono worker to `loop-api.rald.cloud`. SHA embedded via `--var`.

### Step 10: Push Secrets (Job 5 continued)
```bash
echo "$SECRET" | pnpm exec wrangler secret put SECRET_NAME --env production
```
Pushes in order:
1. RALD_JWT_SECRET (FATAL if missing)
2. SUPABASE_SERVICE_ROLE_KEY (FATAL if missing)
3. TERMII_API_KEY (FATAL if missing)
4. TERMII_SENDER_ID (FATAL if missing)
5. LIVEKIT_API_KEY (WARNING if missing — audio degraded)
6. LIVEKIT_API_SECRET (WARNING if missing — audio degraded)

### Step 11: Worker Smoke Test (Job 5 continued)
```bash
sleep 5
curl -sf https://loop-api.rald.cloud/api/health → must return HTTP 200
# SHA extracted from response and compared to github.sha
```

### Step 12: Frontend Build (Job 6) — needs Jobs 1-4
```bash
cd artifacts/loop && pnpm run build
```
Vite 6 build with:
- `VITE_API_BASE_URL=https://loop-api.rald.cloud`
- `VITE_SUPABASE_PUBLISHABLE_KEY` from secret
- `VITE_SUPABASE_URL` from secret
- `VITE_COMMIT_SHA=${{ github.sha }}`
- Output: `artifacts/loop/dist/public/`

### Step 13: Pages Deploy (Job 6 continued)
```bash
npx wrangler@4.16.0 pages deploy dist/public --project-name=loop --branch=main
```
Deploys to `loop.rald.cloud`.

### Step 14: Pages Smoke Test (Job 6 continued) — added 2026-06-08
```bash
sleep 10
curl -sf https://loop.rald.cloud → must return HTTP 200
```

## 3. Build Artifacts

| Artifact | Location | Size (approx) |
|---|---|---|
| Worker JS bundle | Cloudflare edge | ~150KB |
| Frontend SPA | `artifacts/loop/dist/public/` | ~2MB |
| Sourcemaps | `dist/public/assets/*.js.map` | Not uploaded to Cloudflare |

## 4. Known Issues / Tradeoffs

| Item | Notes |
|---|---|
| `--no-frozen-lockfile` | pnpm catalog compatibility; accepted |
| Worker deploy before secrets push | Window where worker runs without new secrets (~5s). Acceptable for non-breaking secret rotations. |
| `sleep 5` / `sleep 10` propagation wait | Cloudflare propagation can take up to 30s globally. Current waits may be insufficient in high-traffic edge nodes. |

## 5. Certification

**Phase 3 Status: PASS**  
Pipeline trace complete. All steps verified. SHA embedding active.

---
*Generated: 2026-06-08 | Sprint: Infrastructure Stabilization Authorization*
