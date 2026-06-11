# Loop Public Beta — Active Blockers

**Last updated:** 2026-06-11 (session G.13 — CTO agent run)

## 🔴 P0 — Must Fix Before Beta Launch

### P0-001: `realtime.rald.cloud` — Missing provider secret
**Status:** 503 — `{"error":"Service misconfigured","missing":["CALLS_APP_SECRET or LIVEKIT_API_SECRET or TENCENT_SECRET_KEY (at least one provider)"]}`
**Fix:** Add ONE of the following to GitHub org secrets (Ostinato-Loop → Settings → Secrets → Actions):
- `CALLS_APP_SECRET` (Cloudflare Calls)
- `LIVEKIT_API_SECRET` + `LIVEKIT_API_KEY` + `LIVEKIT_URL` (LiveKit)
- `TENCENT_SECRET_KEY` + `TENCENT_SDK_APP_ID` (Tencent TRTC)

Then trigger: `gh workflow run deploy.yml -R Ostinato-Loop/rald-realtime`

**Owner:** CTO / ops — requires secret from provider dashboard.

---

### P0-002: `rald-auth-core` — Deploy CI fails with 0 steps (billing)
**Status:** Every deploy run fails in <5 seconds with 0 steps executed (GitHub Actions billing quota exceeded).
**Impact:** Auth worker IS live and healthy (`auth.rald.cloud` → 200). But automated deploys can't run.
**Fix:** GitHub org → Settings → Billing & Plans → add/update payment method, or increase Actions spending limit.

**Workaround:** `wrangler deploy` can be run manually from the rald-auth-core repo with a CF API token.

---

## 🟡 P1 — Self-Healing / In Progress

### P1-001: `identity.rald.cloud` — Cloudflare Pages SSL cert provisioning
**Status:** 522 (connection timeout). `rald-identity.pages.dev` returns 200 (origin is healthy).
**Cause:** Pages custom domain SSL cert takes 10-30 minutes to provision after registration.
**Fix:** Wait — auto-heals. Custom domain `identity.rald.cloud` is registered on the Pages project. CNAME DNS record exists.

---

### P1-002: `inbox.rald.cloud` — No `/health` route (404)
**Status:** Worker is deployed and reachable. API endpoints work. `/health` returns 404.
**Impact:** Monitoring only. Core inbox API is functional.
**Fix (nice-to-have):** Add `app.get('/health', ...)` to rald-inbox.

---

## ✅ Resolved This Session

| Service | Was | Now | Fix Applied |
|---------|-----|-----|-------------|
| notification.rald.cloud | 503 (RALD_JWT_SECRET) | **200** | RALD_JWT_SECRET pushed to org + worker |
| search.rald.cloud | 503 (RALD_JWT_SECRET) | **200** | RALD_JWT_SECRET pushed to org + worker |
| inbox.rald.cloud | NXDOMAIN | **404** (worker up) | DNS AAAA 100:: proxied created; deploy.yml restored+fixed |
| auth.rald.cloud | deploy failures (SUPABASE_URL) | **200 live** | SUPABASE_URL in wrangler.toml vars |
| identity.rald.cloud | Error 1016 | Pages SSL provisioning | deploy.yml fixed; Pages is CF Pages not Workers |
| notification.rald.cloud | cron + SUPABASE_URL | **200** | cron removed from wrangler.toml; SUPABASE_URL pushed |
| loop.rald.cloud | — | **200** | PR#15 merged |
| loop-api.rald.cloud | — | **200** | PR#15 merged |
| messenger.rald.cloud | — | **200** | PR#15 merged |
| auth.rald.cloud | — | **200** | PR#15 merged |

## Actions Required from You

1. **[CRITICAL] Add one provider secret** to org secrets:
   - `CALLS_APP_SECRET` (from Cloudflare Calls dashboard) — simplest option
   - OR `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` (LiveKit dashboard)
   - Then re-trigger `rald-realtime` deploy

2. **[HIGH] Fix GitHub Actions billing** — deploys failing for rald-auth-core specifically. Go to Ostinato-Loop org → Settings → Billing & Plans.

3. **[OPTIONAL] Merge messenger PR#16** — scorecard docs PR (no code change).
