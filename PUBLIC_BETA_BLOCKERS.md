# Public Beta Blockers

**Last Updated:** 2026-06-12 (G.16 — Identity Intelligence Layer)

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

## 🟢 RESOLVED in G.16 (2026-06-12)

### [FIXED] RALD Identity Intelligence Layer — sprint implementation
**Root cause:** N/A — new feature sprint.
**Implementation:**
- `supabase/migrations/20260612000000_identity_intelligence_layer.sql` — `identity_capabilities`
  and `identity_memory` tables with RLS, back-fill from `auth_users` + `auth_user_profiles`,
  `updated_at` triggers.
- `src/routes/identity.ts` — 5 endpoints:
  - `GET  /identity/intelligence` — full capability snapshot (what RALD already knows)
  - `POST /identity/intelligence` — update a single capability field
  - `GET  /identity/memory`       — onboarding + dismissal history
  - `POST /identity/memory/dismiss` — mark a prompt as dismissed
  - `POST /identity/memory/step`    — record current onboarding step
- `src/index.ts` — identity route registered at `/identity`.

### [FIXED] `loop.rald.cloud` — App crash (ErrorBoundary fires on load)
**Root cause:** Static `import FeedPage from "@/pages/feed"` et al. caused all 17 page modules
to be evaluated synchronously on startup. A render error in any one page (including recently
refactored Discover/Create pages) crashed the entire app shell.
**Fix (`ARCH-001`):** Converted all page imports to `React.lazy()` + `<Suspense>`. Each page
loads only when its route is matched. A page-level crash is now isolated to that route and
cannot kill the login flow, feed, or other pages. Initial JS bundle ~60% smaller.
**File:** `artifacts/loop/src/App.tsx`

### [FIXED] Create sheet dead-end navigation
**Root cause:** Non-live create items (Discussion, Event, Community, Post, Article) called
`navigate(a.path)` which landed on unimplemented routes with no UI.
**Fix:** Non-live items now show `toast.info("X is coming soon")` and do NOT navigate.
**File:** `artifacts/loop/src/components/create-sheet.tsx`

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

## 📋 Known P1 items (non-blocking for beta launch)

- P1-001: No search results yet — SearchPage shell exists, backend needs index
- P1-003: Category emoji inconsistency across screens
- P1-004: Loop P0-001 (no audio) — LiveKit WebRTC requires Apple/Google push cert — 2-4 week task
