# Loop Public Beta — Remaining Blockers
**Updated:** 2026-06-10 | **Sprint:** G.10

## P0 — Must Resolve Before Beta Launch

### BLOCKER-001: GitHub Actions Billing
- **Symptom**: CI jobs fail to start with billing error
- **Repos affected**: messenger, rald-auth-core, loop (any PR)
- **Fix**: GitHub.com → Org Settings → Billing & Plans → resolve payment / increase spending limit

### BLOCKER-002: RALD_JWT_SECRET not in org secrets
- **Symptom**: notification.rald.cloud → 503; auth JWT validation fails without it
- **Current location**: messenger repo secrets only
- **Fix option A**: Add `RALD_JWT_SECRET` as org-level GitHub secret
- **Fix option B**: Fix billing → merge messenger PR#15 → run sync-worker-secrets workflow

### BLOCKER-003: No real-time provider secret in org
- **Symptom**: realtime.rald.cloud → 503 (needs CALLS_APP_SECRET or LIVEKIT_API_SECRET or TENCENT_SECRET_KEY)
- **Fix option A**: Add one of those three as org-level GitHub secret, then re-trigger rald-realtime deploy
- **Fix option B**: Merge messenger PR#15 (syncs TENCENT_SDKAPPID + TENCENT_SECRETKEY from messenger repo)

## P1 — Should Fix for Quality Beta

### BLOCKER-004: loop-mobile production build config
- `eas.json` has placeholder values for Apple Team ID, Expo project ID
- `EXPO_PUBLIC_ONESIGNAL_APP_ID` not set — push notifications won't work
- Fix: Add real EAS + App Store credentials

### BLOCKER-005: Supabase migrations (messenger)
- `apply-migrations.yml` may fail if pooler host is wrong
- Current host: `aws-0-eu-west-1.pooler.supabase.com`
- Fix: Verify this matches your Supabase project region

### BLOCKER-006: OpenObserve logging endpoint missing
- `OPEN_OBSERVE_API_KEY` exists but no endpoint configured
- Fix: Add `OPEN_OBSERVE_ENDPOINT` org secret (e.g. `https://cloud.openobserve.ai/api/{org}/logs/_json`)

## One-Click Actions After Billing Fixed

1. GitHub: Merge messenger PR#15 (`feat/sync-worker-secrets`)
2. GitHub: Actions → Sync Worker Secrets → Run workflow (workflow_dispatch)
3. Cloudflare Dashboard: Workers → rald-notify → Triggers → Add cron `*/5 * * * *`
4. GitHub: Add `RALD_JWT_SECRET` to org secrets (if not done via PR#15)
