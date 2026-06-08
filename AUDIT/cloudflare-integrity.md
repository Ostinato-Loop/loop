# AUDIT/cloudflare-integrity.md
## Loop V1 — Cloudflare Integrity Report
**Generated:** 2026-06-08 | **Sprint:** V1 Stabilization — Phase 9

---

## Summary

| Check | Status |
|---|---|
| Worker deployed and serving | ✅ |
| Pages deployed and serving | ✅ |
| DNS routing correct | ✅ |
| Build SHA traceable | ✅ |
| Build SHA = Production SHA | ✅ (verified post-deploy) |
| All worker secrets pushed | ✅ (fixed 2026-06-08) |
| wrangler.toml valid | ✅ |
| Pages build config valid | ✅ |
| Post-deploy smoke test | ✅ Added to deploy.yml |

---

## Services

### Cloudflare Worker — loop-api.rald.cloud

| Property | Value |
|----------|-------|
| Name | loop-worker |
| Routes | `loop-api.rald.cloud/*` |
| Runtime | Cloudflare Workers (V8 isolate) |
| Framework | Hono v4 |
| Deployment method | `wrangler deploy` via GitHub Actions |
| Compatibility date | Set in wrangler.toml |
| CPU time limit | 50ms (free), 30s (paid) |
| Memory limit | 128MB |

### Cloudflare Pages — loop.rald.cloud

| Property | Value |
|----------|-------|
| Project | loop-frontend |
| Routes | `loop.rald.cloud/*` |
| Build command | `pnpm run build` (Vite) |
| Output directory | `dist/` |
| Node version | 18 |
| Deployment method | Pages direct upload via `wrangler pages deploy` |
| SPA routing | `_redirects`: `/* /index.html 200` |

---

## DNS Verification

| Domain | Type | Target | Status |
|--------|------|--------|--------|
| loop.rald.cloud | CNAME | Cloudflare Pages | ✅ |
| loop-api.rald.cloud | CNAME / Worker Route | Cloudflare Worker | ✅ |

---

## Worker Environment Variables

### Set at deploy time (via `wrangler.toml` vars)
| Variable | Value |
|----------|-------|
| GIT_SHA | ${{ github.sha }} (injected at deploy) |
| ENVIRONMENT | production |

### Set as secrets (via `wrangler secret put` in deploy.yml)
| Secret | Status |
|--------|--------|
| RALD_JWT_SECRET | ✅ Pushed |
| SUPABASE_SERVICE_ROLE_KEY | ✅ Pushed |
| TERMII_API_KEY | ✅ Pushed (added 2026-06-08) |
| TERMII_SENDER_ID | ✅ Pushed (added 2026-06-08) |
| LIVEKIT_API_KEY | ✅ Pushed (added 2026-06-08) |
| LIVEKIT_API_SECRET | ✅ Pushed (added 2026-06-08) |

### Previously missing (fixed 2026-06-08)
TERMII_API_KEY, TERMII_SENDER_ID, LIVEKIT_API_KEY, LIVEKIT_API_SECRET were only set via local `wrangler secret put` — not pushed from CI. Any re-deploy from CI (without local setup) would lose these secrets.

---

## Build SHA Traceability

**Problem before fix:** Production code had no way to verify which commit was running.
**Fix:** Commit SHA injected at build time, exposed via `/api/health`.

Verification chain:
```
1. GitHub Actions: export GIT_SHA=${{ github.sha }}
2. wrangler deploy --var GIT_SHA:$GIT_SHA
3. Worker: GET /api/health → { sha: process.env.GIT_SHA }
4. CI smoke test: curl /api/health | check sha matches ${{ github.sha }}
```

**Current status:** ✅ SHA matches production. Last verified: 2026-06-08.

---

## Pages Smoke Test

Added to deploy.yml post-deploy:
```bash
curl -s -o /dev/null -w "%{http_code}" https://loop.rald.cloud
# Must return 200. If not, deploy is marked failed.
```

**Previous behaviour:** Pages deploy could silently fail (wrangler returned 0 exit code even on error). Fixed with `exit 1` on non-200.

---

## Wrangler.toml Audit

| Field | Status |
|-------|--------|
| `name` = "loop-worker" | ✅ |
| `main` = correct entry point | ✅ |
| `compatibility_date` set | ✅ |
| `route` = loop-api.rald.cloud/* | ✅ |
| `[vars]` block | ✅ (ENVIRONMENT, GIT_SHA) |

---

## Recommendations

1. **Enable Cloudflare Analytics** on both Worker and Pages for traffic visibility.
2. **Set CPU time alert** — alert when Worker P99 latency > 500ms.
3. **Add Cloudflare WAF rules** for rate limiting on /api/auth/* before public launch.
4. **Enable cache on GET /api/rooms** (short TTL, 10s) to reduce Supabase load under traffic.
5. **Add Pages preview deployments** for PR branches — enables staging review without affecting production.
6. **Worker error tracking** — integrate Sentry or Cloudflare Workers Logpush for error monitoring.
