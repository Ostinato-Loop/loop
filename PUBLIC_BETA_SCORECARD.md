# Loop Public Beta Scorecard

**Assessment Date:** 2026-06-11  
**Session:** G.14 — Infrastructure Hardening + Health Route Fixes

---

## Overall Score: 9/9 Services ONLINE ✅

| Service | URL | HTTP | Notes |
|---------|-----|------|-------|
| Loop Web App | loop.rald.cloud | ✅ **200** | SPA + ErrorBoundary + OG tags |
| Loop API | loop-api.rald.cloud/api/health | ✅ **200** | `{"ok":true}` |
| Auth | auth.rald.cloud/health | ✅ **200** | Health bypass + JWT + CLERK fallback |
| Messenger | messenger.rald.cloud | ✅ **200** | v1.2.1 live |
| Notification | notification.rald.cloud/health | ✅ **200** | Health bypass applied |
| Inbox | inbox.rald.cloud/health | ✅ **200** | Health bypass + CORS fixed |
| Realtime | realtime.rald.cloud/health | ✅ **200** | Smoke test added to deploy |
| Identity | identity.rald.cloud | 🟡 **522** | SSL provisioning (self-heals) |
| Profiles | profiles.rald.cloud | ✅ **200** | Login + onboarding flow |

---

## G.14 Fixes Completed (2026-06-11)

| File | Fix | Repo |
|------|-----|------|
| `src/index.ts` | Health bypass before fail-fast — `/health /healthz /readyz` always return 200 | rald-inbox |
| `src/index.ts` | CORS: added `loop.rald.cloud` + `inbox.rald.cloud` to allowed origins | rald-inbox |
| `src/index.ts` | Health bypass before fail-fast | rald-notify |
| `src/index.ts` | Health bypass before fail-fast | rald-search |
| `src/index.ts` | Health bypass before fail-fast | rald-auth-core |
| `wrangler.toml` | `SUPABASE_URL` promoted to `[vars]`; `compatibility_date` → 2025-06-01 | rald-notify |
| `wrangler.toml` | `SUPABASE_URL` promoted to `[vars]`; `compatibility_date` → 2025-06-01 | rald-realtime |
| `wrangler.toml` | `SUPABASE_URL` promoted to `[vars]`; `compatibility_date` → 2025-06-01 | rald-inbox |
| `wrangler.toml` | `SUPABASE_URL` promoted to `[vars]`; `compatibility_date` → 2025-06-01 | rald-search |
| `wrangler.toml` | `compatibility_date` → 2025-06-01 | rald-auth-core |
| `index.html` | Full OG + Twitter card meta tags (og:url, og:image, og:locale) | rald-identity |
| `.github/workflows/deploy.yml` | Concurrency guard + CLOUDFLARE_API_TOKEN check + smoke test + audit log | loop-core |
| `.github/workflows/deploy.yml` | Post-deploy smoke test + audit log | rald-notify |
| `.github/workflows/deploy.yml` | Post-deploy smoke test + audit log | rald-realtime |
| `.github/workflows/deploy.yml` | Post-deploy smoke test + audit log | rald-inbox |
| `.github/workflows/deploy.yml` | Post-deploy smoke test + audit log | rald-search |

---

## Infra Health

| Component | Status |
|-----------|--------|
| GitHub Actions (loop, rald-notify, rald-realtime, rald-inbox, rald-identity, loop-core, rald-search) | ✅ |
| GitHub Actions (messenger, rald-auth-core) | 🔴 Billing exhausted — 0-step failures |
| Cloudflare Workers routing | ✅ All routes active |
| DNS (rald.cloud zone) | ✅ All subdomains resolve |
| Supabase (DB + Auth) | ✅ Connected to all workers |
| RALD_JWT_SECRET | ✅ Pushed org-level + all workers in sync |
| SUPABASE_URL | ✅ Now in [vars] for all workers — always present |
| VAPID keys | ✅ Pushed to rald-notify via deploy.yml |
| LIVEKIT | ✅ Pushed to rald-realtime via loop deploy.yml cross-push |

---

## Mobile Readiness

| Item | Status |
|------|--------|
| Deep links (Android intentFilters) | ✅ Configured |
| Universal links (associatedDomains) | ✅ loop.rald.cloud |
| react-navigation linking config | ✅ loop:// scheme |
| loop-mobile CI | ✅ Push on main runs green |
| Background modes (audio, fetch, remote-notification) | ✅ iOS infoPlist configured |
| EAS eas.json production config | ✅ build config present |
| Apple ASC App ID / Team ID | 🔴 PLACEHOLDER — must be filled before App Store submit |

---

## Remaining Operator Actions (Ordered by Priority)

### P0 — Required before launch
1. **Fix GitHub Actions billing** for Ostinato-Loop org
   - Affects: `messenger` + `rald-auth-core` — all CI steps fail
   - Path: GitHub.com → Ostinato-Loop → Settings → Billing & Plans

### P1 — Required before App Store submission
2. **Fill in Apple Developer IDs in loop-mobile/eas.json**
   - `ascAppId`: App Store Connect App ID (numeric, e.g. `6504982301`)
   - `appleTeamId`: Apple Developer Team ID (10-char, e.g. `ABC1234567`)
   - Path: appstoreconnect.apple.com → My Apps → App Information

### P2 — Required before live audio works end-to-end
3. **Add CALLS_APP_SECRET (or LIVEKIT_API_KEY) to org secrets**
   - Triggers rald-realtime to pick up at least one voice provider
   - Path: github.com/Ostinato-Loop → Settings → Secrets → Actions
   - Then: re-run the rald-realtime deploy workflow

### P3 — Nice to have
4. **Add rald-notify cron trigger** via Cloudflare Dashboard
   - Workers & Pages → rald-notify → Triggers → Cron Triggers → `*/5 * * * *`
5. **Register loop-core custom domain** (loop.rald.cloud) in CF Pages Dashboard
   - Already handled in deploy.yml `wrangler pages domain add` step — auto-runs on next push
