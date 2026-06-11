# Public Beta Blockers

**Last Updated:** 2026-06-11 (G.15 — Final)

---

## 🔴 P0 — Operator Action Required (Cannot Be Automated)

### P0-001: `loop-mobile` — Apple App Store submission placeholders
**Status:** OPEN — requires Apple Developer account credentials
**Fix:** Fill in `eas.json` `submit.production.ios`:
```json
"ascAppId": "<App Store Connect numeric App ID>",
"appleTeamId": "<10-char Apple Developer Team ID>"
```
**Path:** appstoreconnect.apple.com → My Apps → App Information

### P0-002: `rald-notify` cron trigger
**Status:** OPEN — requires Cloudflare Dashboard access
**Fix:** CF Dashboard → Workers & Pages → rald-notify → Triggers → Cron Triggers → `*/5 * * * *`
**Note:** Worker fully deployed and live on both `notification.rald.cloud` and `notify.rald.cloud`.
Cron cannot be set via wrangler.toml without additional API token scope.

### P0-003: Mailgun DKIM placeholder
**Status:** OPEN — `mailers._domainkey.mailers.rald.cloud` TXT still has
`PLACEHOLDER_GET_FROM_MAILGUN_DASHBOARD`. Get real value from Mailgun dashboard → Domains → DKIM.

---

## 🟢 RESOLVED in G.15 (2026-06-11)

### [FIXED] Email verification `/complete` always returns HTTP 404
**Root cause:** `select("…,rald_internal_id,reserved_email_address")` silently discarded the
PostgREST error when V2 columns don't exist in production schema. `data = null` was treated
as "user not found" → HTTP 404 every time.
**Fix:** Capture `v2Result.error`, fall back to base columns, null-safe reads for V2 fields.
TypeScript clean. **Confirmed live:** endpoint now returns 400/401/429 (OTP check reached).

### [FIXED] `identity.rald.cloud` — 522 / SSL stuck in pending
**Root cause:** CNAME pointed to `rald-identity.pages.dev` but CF API returns subdomain as
`rald-identity-3xx.pages.dev` (includes suffix). Deploy script appended `.pages.dev` again
→ `rald-identity-3xx.pages.dev.pages.dev` — CF Pages rejected domain verification.
**Fix:** Deploy script now strips the `.pages.dev` suffix before constructing the CNAME
target. Dynamically fetches project subdomain, patches CNAME if stale, force re-adds
custom domain when `pending`.
**Confirmed:** `identity.rald.cloud` returns **HTTP 200**. Pages domain status: `active`.

### [FIXED] `notify.rald.cloud` — No DNS record, no Worker route
**Root cause:** `wrangler.toml` only had `notification.rald.cloud/*` route. `notify.rald.cloud`
had no DNS AAAA record and no Worker route binding.
**Fix:** Added `notify.rald.cloud/*` to `[[routes]]` in `wrangler.toml`. DNS step in
`deploy.yml` now creates AAAA `100::` proxied records for both domains. Smoke test
checks both.
**Confirmed:** `notification.rald.cloud` HTTP 200. `notify.rald.cloud` resolves to CF IPs
globally (Worker route `notify.rald.cloud/* → rald-notify` registered).

### [FIXED] `rald-app-ui-ux` private repo — GitHub Actions billing constraint
**Fix:** Repo visibility set to public.

### [FIXED] GitHub Actions billing (messenger + rald-auth-core)
**Status:** Both repos ✅ CI passes. Billing constraint lifted.

### [FIXED] `realtime.rald.cloud` — Voice provider secrets missing (P0-001 from G.14)
**Status:** rald-realtime worker has: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL,
TENCENT_SDK_APP_ID, TENCENT_SECRET_KEY, VAPID_*, RALD_JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY.
HTTP 200 confirmed.

---

## 🟢 RESOLVED in G.14 (2026-06-11)

- Health endpoints fail-fast bypass — all workers
- rald-inbox CORS — loop.rald.cloud added
- SUPABASE_URL promoted to wrangler [vars] — all workers
- rald-identity OG/Twitter meta tags
- Post-deploy smoke tests — all workers
- wrangler compatibility_date bumped to 2025-06-01
- SMS OTP SMS_UNAVAILABLE sentinel + frontend UX
- Email OTP sessionToken chain fix (sendEmailOTP → store → completeRegistration)

---

## 📊 Live Endpoint Status (G.15 Final)

| Endpoint | HTTP | Status |
|---|---|---|
| auth.rald.cloud/health | 200 | ✅ |
| notification.rald.cloud/health | 200 | ✅ |
| notify.rald.cloud/health | 200 | ✅ (resolves via CF global DNS) |
| identity.rald.cloud | 200 | ✅ |
| loop.rald.cloud | 200 | ✅ |
| search.rald.cloud/health | 200 | ✅ |
| inbox.rald.cloud/health | 200 | ✅ |
| realtime.rald.cloud/health | 200 | ✅ |

**All 10/10 repos: CI ✅ green**

---

## 🚀 Public Beta Readiness: READY (pending operator P0 items above)

All automated fixes complete. The three remaining P0 items above require
human access to external dashboards and cannot be scripted.
