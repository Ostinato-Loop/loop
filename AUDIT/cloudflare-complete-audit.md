# Loop Cloudflare Infrastructure Audit
**Date:** 2026-06-08  
**Auditor:** Infrastructure Stabilization Sprint — Phase 2  
**Scope:** Cloudflare Worker (loop-api), Pages (loop), D1, KV, R2, Queue, Durable Objects

---

## 1. Worker Configuration

| Item | Value |
|---|---|
| Worker name | `loop-api` |
| Deploy route | `loop-api.rald.cloud/*` |
| Zone | `rald.cloud` |
| Compatibility date | `2024-11-01` |
| Entrypoint | `src/index.ts` |
| Environment | `production` |

## 2. Bindings Inventory

| Binding | Type | ID / Name | Status |
|---|---|---|---|
| `DB` | D1 Database | `4616fcac-96e0-4150-a42f-3d020f45cd1d` (loop-db) | ✅ Configured |
| `CACHE` | KV Namespace | `3c71da01b3174d6c9353adbfde7491a3` | ✅ Configured |
| `MEDIA` | R2 Bucket | `loop-media` | ✅ Configured |
| `TASK_QUEUE` | Queue | `loop-tasks` | ✅ Configured |
| `ROOM_SESSION` | Durable Object | `RoomSession` (self-referenced) | ✅ Configured |
| `AI` | Workers AI | `@cf/meta/llama-3-8b-instruct` | ✅ Configured |

## 3. Environment Variables (non-secret)

| Variable | Production Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `SUPABASE_URL` | Set via wrangler secret |
| `CORS_ORIGIN` | `https://loop.rald.cloud,https://loop.ostinato-loop.pages.dev` |
| `LIVEKIT_URL` | Set via wrangler.toml vars |
| `COMMIT_SHA` | Injected at deploy time via `--var` flag (added 2026-06-08) |

## 4. Secrets (pushed via deploy pipeline)

| Secret | Pushed By | Status |
|---|---|---|
| `RALD_JWT_SECRET` | deploy.yml | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | deploy.yml | ✅ |
| `TERMII_API_KEY` | deploy.yml (added 2026-06-08) | ✅ |
| `TERMII_SENDER_ID` | deploy.yml (added 2026-06-08) | ✅ |
| `LIVEKIT_API_KEY` | deploy.yml (added 2026-06-08) | ✅ |
| `LIVEKIT_API_SECRET` | deploy.yml (added 2026-06-08) | ✅ |
| `OPENROUTER_API_KEY` | ⚠️ Not in deploy.yml or repo secrets | Missing |

## 5. Worker Route Inventory

| Route | Handler | Auth |
|---|---|---|
| `GET /api/health` | health.ts | None |
| `POST /api/auth/send-otp` | auth.ts | None |
| `POST /api/auth/verify-otp` | auth.ts | None |
| `GET /api/auth/me` | auth.ts | Bearer JWT |
| `GET /api/auth/silent` | auth.ts (ROUTING-FIX-001, 2026-06-08) | Cookie |
| `POST /api/auth/signout` | auth.ts | Bearer JWT |
| `POST /api/auth/rald-sso` | rald-sso.ts | RALD JWT body |
| `GET /api/auth/rald-sso/silent` | rald-sso.ts | Cookie (legacy path) |
| `GET/POST /api/rooms/*` | rooms.ts | Bearer JWT |
| `GET/POST /api/communities/*` | communities.ts | Bearer JWT |
| `GET /api/regions` | regions.ts | None |
| `POST /api/audio/*` | audio.ts | Bearer JWT |
| `POST /api/feedback` | feedback.ts | Optional Bearer |
| `POST /api/activation` | activation.ts | Bearer JWT |

## 6. CORS Configuration

```
Origin allowlist:
  - https://loop.rald.cloud
  - https://loop.ostinato-loop.pages.dev

Methods: GET, POST, PUT, DELETE, OPTIONS
Headers: Content-Type, Authorization
Credentials: true (required for Cookie-based silent auth)
```

## 7. Cloudflare Pages Configuration

| Item | Value |
|---|---|
| Project name | `loop` |
| Production branch | `main` |
| Build command | `pnpm run build` |
| Output directory | `dist/public` |
| Production URL | `https://loop.rald.cloud` |
| Fallback URL | `https://loop.ostinato-loop.pages.dev` |

## 8. Findings & Remediations

| Finding | Severity | Status |
|---|---|---|
| GET /api/auth/silent 404 — route was at /rald-sso/silent | CRITICAL | ✅ Fixed 2026-06-08 (ROUTING-FIX-001) |
| OPENROUTER_API_KEY missing from repo secrets + deploy pipeline | HIGH | Open — add to repo secrets + deploy.yml |
| SHA not embedded in health response for post-deploy validation | MEDIUM | ✅ Fixed 2026-06-08 (`sha` field in /api/health) |
| Pages deploy silently skipped on missing token | HIGH | ✅ Fixed 2026-06-08 (exit 1) |
| No Pages smoke test | MEDIUM | ✅ Fixed 2026-06-08 |
| LIVEKIT audio rooms degraded without secrets | MEDIUM | ✅ Fixed 2026-06-08 (secrets now pushed) |

## 9. Certification

**Phase 2 Status: PASS with one open finding**  
OPENROUTER_API_KEY is missing from deployment pipeline. All other HIGH/CRITICAL findings remediated.

---
*Generated: 2026-06-08 | Sprint: Infrastructure Stabilization Authorization*
