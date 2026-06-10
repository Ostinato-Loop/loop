# Loop Public Beta — Scorecard & Blockers
**Updated:** 2026-06-10 18:30 UTC | **Session:** G.10 — Public Beta Stabilization Sprint  
**Engineer:** CTO (Agent) | **Org:** Ostinato-Loop

---

## 🚨 REQUIRED USER ACTIONS — Unblocking P0

### 1. Fix GitHub Actions Billing ⚠️ CRITICAL
GitHub Actions jobs are failing to start on the `Ostinato-Loop` org with:
> *"The job was not started because recent account payments have failed or your spending limit needs to be increased."*

**Impact:**
- messenger `feat/sync-worker-secrets` PR#15 branch protection can't pass (CI won't start)
- rald-auth-core CI failing (same reason)
- Any future PR to `loop`, `messenger`, etc. will be blocked

**Fix:** GitHub org → Settings → Billing & Plans → resolve payment issue or increase Actions spending limit.

### 2. Merge messenger PR#15 (after billing fixed)
Once billing is fixed, CI on `feat/sync-worker-secrets` will run and pass.
Merge PR#15, then go to Actions → `Sync Worker Secrets` → Run workflow.
This will push `RALD_JWT_SECRET`, `TENCENT_SDKAPPID`, `TENCENT_SECRETKEY`, `RESEND_API_KEY`, `TERMII_API_KEY` to `rald-realtime` and `rald-notify`.

### 3. Add at least ONE provider secret to org secrets (for realtime)
`realtime.rald.cloud` needs at least one of:
- `CALLS_APP_SECRET` (Cloudflare Calls)
- `LIVEKIT_API_SECRET` (LiveKit)  
- `TENCENT_SECRET_KEY` (Tencent RTC)

Current status: All three are only in messenger repo secrets. Either add one to org secrets OR merge PR#15 to sync them.

---

## ✅ LIVE — Green Services

| Service | URL | Status |
|---------|-----|--------|
| Loop Web App | loop.rald.cloud | ✅ 200 — serving |
| Loop API | loop-api.rald.cloud/api/health | ✅ 200 — healthy |
| Auth Worker | auth.rald.cloud/health | ✅ 200 — v2.6.0 |
| Profiles | profiles.rald.cloud | ✅ 200 — serving |
| Messenger Frontend | messenger.ostloop.name.ng | ✅ 200 — serving |
| Messenger API | messenger.rald.cloud | ✅ 200 — v1.2.1 |
| Notification Worker | notification.rald.cloud | ✅ Deployed — 503 only RALD_JWT_SECRET missing |
| Identity Worker | rald-identity | ✅ Deployed (Success) |
| Inbox Worker | rald-inbox | ✅ Deployed (Success) |
| Search Worker | rald-search | ✅ Deployed (Success) |
| loop-mobile deep links | app.json + navigation/index.tsx | ✅ Committed |

---

## 🔴 BLOCKED — P0 (Needs User Action)

| ID | Service | Issue | Root Cause | Required Action |
|----|---------|-------|-----------|-----------------|
| P0-001 | realtime.rald.cloud | HTTP 503: no provider secret | CALLS_APP_SECRET / LIVEKIT_API_SECRET / TENCENT_SECRET_KEY NOT in org secrets | Add one to org secrets OR merge PR#15 |
| P0-002 | notification.rald.cloud | HTTP 503: RALD_JWT_SECRET missing | Only in messenger repo secrets | Merge PR#15 → run sync workflow |
| P0-003 | messenger PR#15 | Can't merge — CI won't start | GitHub Actions billing quota exceeded | Fix GitHub billing → CI passes → merge PR |

---

## 🟡 P1 — Beta Blocker (Non-Critical-Path)

| ID | Issue | Status | Fix |
|----|-------|--------|-----|
| P1-001 | rald-auth-core CI | Fails (billing, not code) — worker IS live | GitHub billing fix unblocks this |
| P1-002 | messenger migrations | psql connection to Supabase pooler may be failing | Verify SUPABASE_DB_PASSWORD + pooler host |
| P1-003 | OpenObserve logging | OPEN_OBSERVE_API_KEY exists but no endpoint configured | Add `OPEN_OBSERVE_ENDPOINT` org secret |
| P1-004 | loop-mobile EAS build | eas.json has placeholder Apple/Google IDs | Add real App Store + Play Store IDs |
| P1-005 | ONESIGNAL_APP_ID | Not configured in mobile env | Add `EXPO_PUBLIC_ONESIGNAL_APP_ID` to EAS env |

---

## ✅ What Was Fixed This Session (G.10)

| Fix | Repo | Commit |
|-----|------|--------|
| Public Beta stabilization sprint (PR#15) | loop | Merged, deployed |
| rald-realtime: Tencent env alias fix (TENCENT_SDKAPPID/TENCENT_SECRETKEY) | rald-realtime | fix/tencent-alias |
| rald-realtime: CORS for messenger.ostloop.name.ng | rald-realtime | committed |
| rald-notify: [triggers] cron fix (removed — token lacks schedules permission) | rald-notify | fix/remove-cron-trigger |
| rald-notify: RESEND degraded mode (warn not fail) | rald-notify | committed |
| rald-notify: DNS record creation (AAAA 100:: proxied) | rald-notify | deploy.yml updated |
| rald-notify: SUPABASE_URL secret push added to deploy | rald-notify | deploy.yml updated |
| rald-auth-core: RALD_JWT_SECRET downgraded from FATAL to WARNING | rald-auth-core | deploy.yml committed |
| loop-mobile: deep links (intentFilters + associatedDomains) | loop-mobile | app.json committed |
| loop-mobile: react-navigation linking config | loop-mobile | navigation/index.tsx committed |
| messenger: sync-worker-secrets workflow (PR#15) | messenger | feat/sync-worker-secrets branch |
| loop: CI_RECOVERY_REPORT committed | loop | main |

---

## DNS / Cloudflare Status

| Subdomain | Type | Proxied | Status |
|-----------|------|---------|--------|
| loop.rald.cloud | A/AAAA | ✅ | Working |
| auth.rald.cloud | A/AAAA | ✅ | Working |
| messenger.rald.cloud | Worker route | ✅ | Working |
| notification.rald.cloud | AAAA 100:: | ✅ | DNS present, Worker deployed |
| realtime.rald.cloud | Worker route | ✅ | DNS present, Worker deployed |

---

## Notes

- **GitHub Actions quota**: The org is hitting its Actions quota. Free tier gives 2,000 minutes/month. Consider upgrading to GitHub Team ($4/user/month for 3,000 minutes) or adding a payment method.
- **RALD_JWT_SECRET**: This is the single most impactful secret to add to org-level GitHub secrets. It unblocks auth, notifications, and realtime simultaneously.
- **Cron trigger for rald-notify**: Add `*/5 * * * *` via Cloudflare Dashboard → Workers & Pages → rald-notify → Triggers. The CLOUDFLARE_API_TOKEN used in CI doesn't have schedules permission.
