# Public Beta Blockers

**Last Updated:** 2026-06-11 (G.14)

---

## 🔴 P0 — Must Fix Before Beta Launch

### P0-001: `realtime.rald.cloud` — Missing provider secret
**Status:** PARTIALLY RESOLVED — SUPABASE_URL + JWT in place; still needs ONE voice provider
**Fix:** Add ONE of the following to GitHub org secrets (Ostinato-Loop → Settings → Secrets → Actions):
- `CALLS_APP_SECRET` + `CALLS_APP_ID` (Cloudflare Calls — preferred)
- `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` (LiveKit)
- `TENCENT_SDK_APP_ID` + `TENCENT_SECRET_KEY` (Tencent TRTC)

**Note:** loop/deploy.yml has cross-push stubs for all three — add to `loop` repo secrets to auto-deploy.

### P0-002: `rald-auth-core` + `messenger` — GitHub Actions billing exhausted
**Status:** OPEN — operator action required
**Fix:** GitHub.com → Ostinato-Loop → Settings → Billing & Plans → add payment method or increase Actions spending limit.
**Impact:** Auth worker IS live and healthy. But future code changes cannot deploy automatically until billing is resolved.

---

## 🟢 RESOLVED in G.14 (2026-06-11)

### [FIXED] Health endpoints blocked by fail-fast check
**Services:** rald-inbox, rald-notify, rald-search, rald-auth-core  
**Fix:** Health bypass added before the fail-fast secret validation block in all 4 workers.  
`/health`, `/healthz`, `/healthcheck`, `/readyz` now always return 200.

### [FIXED] rald-inbox CORS missing loop.rald.cloud
**Fix:** `loop.rald.cloud` and `inbox.rald.cloud` added to CORS allowed origins.  
The main Loop app can now call inbox API endpoints cross-origin.

### [FIXED] SUPABASE_URL secrets-only in workers
**Services:** rald-notify, rald-realtime, rald-inbox, rald-search  
**Fix:** `SUPABASE_URL` promoted to `[vars]` in wrangler.toml so it's always present as an environment variable even before a `wrangler secret put` completes.

### [FIXED] rald-identity missing full OG/Twitter card meta
**Fix:** index.html now has `og:url`, `og:image`, `og:image:width/height`, `og:locale`, `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`, `robots: index,follow`.

### [FIXED] loop-core deploy.yml missing smoke test + concurrency guard
**Fix:** Added concurrency group, CLOUDFLARE_API_TOKEN fail-fast, custom domain registration step, post-deploy smoke test, and audit log line.

### [FIXED] Deploy workflows missing post-deploy smoke tests
**Services:** rald-notify, rald-realtime, rald-inbox, rald-search  
**Fix:** All four now have a post-deploy smoke test hitting `<service>.rald.cloud/health` after deploy.

### [FIXED] wrangler compatibility_date stale (2025-01-01)
**Services:** rald-notify, rald-realtime, rald-auth-core, rald-inbox, rald-search  
**Fix:** Bumped to `2025-06-01` in all wrangler.toml files.

---

## 🟡 P1 — Self-Healing / Pending

### P1-001: `identity.rald.cloud` — Cloudflare Pages SSL cert provisioning
**Status:** 522 (connection timeout). `rald-identity.pages.dev` returns 200 (origin healthy).  
**Fix:** Wait — auto-heals within 10–30 minutes of custom domain registration.

### P1-002 [MONITOR]: `inbox.rald.cloud/health` 
**Status:** Health route now present AND bypasses fail-fast. Should return 200.  
**Verification:** Next deploy will confirm via the new smoke test step in deploy.yml.

---

## 📱 Mobile — Pre-Submission Blockers

### M-001: loop-mobile eas.json has PLACEHOLDER Apple IDs
**Status:** OPEN — operator action required  
**Fix:** Fill in `eas.json` `submit.production.ios`:
```json
"ascAppId": "<App Store Connect numeric App ID>",
"appleTeamId": "<10-char Apple Developer Team ID>"
```
**Path:** appstoreconnect.apple.com → My Apps → App Information
