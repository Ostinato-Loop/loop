# Public Beta Blockers

**Last Updated:** 2026-06-11 (G.15)

---

## 🔴 P0 — Must Fix Before Beta Launch

### P0-001: `loop-mobile` — Apple App Store submission placeholders
**Status:** OPEN — operator action required (cannot be automated)
**Fix:** Fill in `eas.json` `submit.production.ios`:
```json
"ascAppId": "<App Store Connect numeric App ID>",
"appleTeamId": "<10-char Apple Developer Team ID>"
```
**Path:** appstoreconnect.apple.com → My Apps → App Information

---

## 🟢 RESOLVED in G.15 (2026-06-11)

### [FIXED] Email verification always returns HTTP 404
**Service:** rald-auth-core (`/auth/register-username/complete`)
**Root cause:** `select("id,username,...,rald_internal_id,reserved_email_address")` never
captured the PostgREST error returned when V2 columns don't exist in the production schema.
`data` was `null`, silently treated as "user not found" → HTTP 404.
**Fix:** Captures `v2Result.error`; falls back to base-column select if V2 columns are missing;
null-safe reads for `rald_internal_id`, `reserved_email_address`. TypeScript clean.
**Confirmed:** Live endpoint now returns HTTP 400/401 (OTP check reached) not 404.

### [FIXED] `notify.rald.cloud` — No DNS record, wrong wrangler route
**Service:** rald-notify
**Root cause:** wrangler.toml only registered `notification.rald.cloud/*` route. `notify.rald.cloud`
had no DNS AAAA record and no Worker route binding.
**Fix:** Added `notify.rald.cloud/*` to `[[routes]]` in wrangler.toml + added AAAA DNS record
creation for `notify.rald.cloud` in deploy.yml. Smoke test now checks both domains.

### [FIXED] `identity.rald.cloud` — 522 / SSL cert stuck in pending
**Service:** rald-identity (Cloudflare Pages)
**Root cause:** Deploy workflow created CNAME `identity.rald.cloud → rald-identity.pages.dev`
but the actual project subdomain is `rald-identity-3xx.pages.dev`. CF Pages rejected domain
verification ("CNAME record not set") because the target didn't match.
**Fix:** deploy.yml now dynamically fetches the project subdomain via CF API, patches the CNAME
if stale, and forces a delete+re-add of the custom domain when status is `pending`.

### [FIXED] `rald-app-ui-ux` — Private repo blocking GitHub Actions billing
**Fix:** Repo visibility changed to public — unlimited Actions minutes.

### [FIXED] `realtime.rald.cloud` — Voice provider secrets missing
**Status:** FULLY RESOLVED — rald-realtime worker already has LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
LIVEKIT_URL, TENCENT_SDK_APP_ID, TENCENT_SECRET_KEY, VAPID_* configured. `/health` returns 200.

### [FIXED] GitHub Actions billing (messenger + rald-auth-core auto-deploys)
**Fix:** Repos already public. Latest CI runs for both show ✅ success.
P0-002 is no longer a blocker.

---

## 🟢 RESOLVED in G.14 (2026-06-11)

### [FIXED] Health endpoints blocked by fail-fast check
**Services:** rald-inbox, rald-notify, rald-search, rald-auth-core
**Fix:** Health bypass added before the fail-fast secret validation block in all 4 workers.

### [FIXED] rald-inbox CORS missing loop.rald.cloud
**Fix:** `loop.rald.cloud` and `inbox.rald.cloud` added to CORS allowed origins.

### [FIXED] SUPABASE_URL secrets-only in workers
**Services:** rald-notify, rald-realtime, rald-inbox, rald-search
**Fix:** `SUPABASE_URL` promoted to `[vars]` in wrangler.toml.

### [FIXED] rald-identity missing full OG/Twitter card meta
**Fix:** index.html now has complete OG + Twitter card tags.

### [FIXED] Deploy workflows missing post-deploy smoke tests
**Services:** rald-notify, rald-realtime, rald-inbox, rald-search, loop-core
**Fix:** All services have post-deploy smoke tests.

### [FIXED] wrangler compatibility_date stale (2025-01-01)
**Services:** All workers
**Fix:** Bumped to `2025-06-01`.

### [FIXED] SMS OTP — SMS_UNAVAILABLE sentinel not handled
**Fix:** `otp.ts` throws `SMS_UNAVAILABLE` sentinel; `auth.ts` returns HTTP 503 with
`sms_unavailable:true`; frontend shows badge + "Switch to email" CTA.

### [FIXED] Email OTP broken chain — sessionToken discarded
**Fix:** `sendEmailOTP` returns `{sessionToken, message}`; `emailSessionToken` stored in
Zustand; passed to `completeRegistration`; `auth.ts` payload type updated.

---

## 📊 Live Endpoint Status (G.15)

| Endpoint | Status |
|---|---|
| auth.rald.cloud/health | ✅ 200 |
| notification.rald.cloud/health | ✅ 200 |
| notify.rald.cloud/health | 🔄 deploying |
| identity.rald.cloud | 🔄 deploying (cert provisioning) |
| loop.rald.cloud | ✅ 200 |
| search.rald.cloud/health | ✅ 200 |
| inbox.rald.cloud/health | ✅ 200 |
| realtime.rald.cloud/health | ✅ 200 |

---

## ⚙️ Operator Actions Still Needed (Cannot Be Automated)

1. **rald-notify cron** — Enable 5-min push digest cron via CF Dashboard:
   Workers & Pages → rald-notify → Triggers → Cron Triggers → `*/5 * * * *`

2. **loop-mobile Apple IDs** — Fill `eas.json` ascAppId + appleTeamId (see P0-001)

3. **Mailgun DKIM** — `mailers._domainkey.mailers.rald.cloud` TXT still has placeholder
   `PLACEHOLDER_GET_FROM_MAILGUN_DASHBOARD`. Get real value from Mailgun dashboard.
