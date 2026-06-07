# PRODUCTION: Cloudflare Worker Configuration Guide
**Loop API — loop-api.rald.cloud**
LILCKY STUDIO LIMITED · 2026-06-07

---

## Architecture Overview

```
loop.rald.cloud (Cloudflare Pages)
  ↓ All /api/* calls
loop-api.rald.cloud (Cloudflare Worker — this document)
  ↓ Auth/identity
auth.rald.cloud (RALD SSO)
  ↓ Data
Supabase (PostgreSQL + Realtime)
  ↓ Audio
LiveKit Cloud (WebRTC)
```

The Cloudflare Worker is the exclusive API layer for Loop. It is deployed as the `loop-api` worker in the `rald.cloud` Cloudflare account.

---

## Worker Bindings

All bindings must be configured in the Cloudflare Dashboard AND in `wrangler.toml`. A missing binding causes the worker to crash silently with a runtime error.

| Binding | Type | Name | Dashboard Status |
|---------|------|------|-----------------|
| `DB` | D1 Database | `loop-db` | Must exist and have migrations applied |
| `CACHE` | KV Namespace | (see wrangler.toml ID) | Must exist |
| `MEDIA` | R2 Bucket | `loop-media` | Must exist |
| `TASK_QUEUE` | Queue | `loop-tasks` | Must exist as producer AND consumer |
| `ROOM_SESSION` | Durable Object | `RoomSession` | Auto-created on deploy |
| `AI` | Workers AI | (global) | No setup needed |

### Verify Bindings

After deploying, call `/api/health`:

```bash
curl https://loop-api.rald.cloud/api/health
```

Expected response (all `true`):
```json
{
  "ok": true,
  "service": "loop-api",
  "version": "1.0.0",
  "environment": "production",
  "bindings": {
    "db": true,
    "cache": true,
    "media": true,
    "taskQueue": true,
    "roomSession": true,
    "ai": true
  }
}
```

If any binding shows `false`, the resource doesn't exist or isn't linked to the worker. Fix in the Cloudflare Dashboard under Workers → loop-api → Settings → Bindings.

---

## Required Secrets

The worker **fails fast with HTTP 503** if `RALD_JWT_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` are missing. This is intentional — the worker refuses to serve broken auth.

Push all secrets via:
```bash
cd artifacts/cloudflare-worker
echo "your_value" | pnpm exec wrangler secret put SECRET_NAME --env production
```

| Secret | Required | Service | Description |
|--------|----------|---------|-------------|
| `RALD_JWT_SECRET` | **CRITICAL** | RALD | Shared secret for signing/verifying Loop JWTs. Must match `auth.rald.cloud`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **CRITICAL** | Supabase | Service role key — full database access. Never expose to frontend. |
| `TERMII_API_KEY` | Required for SMS OTP | Termii | Nigerian SMS gateway. Without this, phone-based auth fails. |
| `TERMII_SENDER_ID` | Required for SMS OTP | Termii | Sender name on OTP messages (e.g., "Loop"). |
| `LIVEKIT_API_KEY` | Required for audio | LiveKit | LiveKit project API key. Without this, audio rooms fail with 503. |
| `LIVEKIT_API_SECRET` | Required for audio | LiveKit | LiveKit project API secret. |
| `LIVEKIT_URL` | Required for audio | LiveKit | `wss://your-project.livekit.cloud` |
| `OPENROUTER_API_KEY` | Optional | OpenRouter | AI room summaries. Worker degrades gracefully without it. |

### Verify Secrets Are Set

```bash
# List all secrets currently set in production
pnpm exec wrangler secret list --env production
```

Expected output should show all 7 required secrets. If any are missing, the worker will fail for requests that use that feature.

---

## Environment Variables (wrangler.toml)

These are set in `[env.production.vars]` — they are NOT secrets (values are visible in Cloudflare Dashboard):

| Variable | Value | Description |
|----------|-------|-------------|
| `ENVIRONMENT` | `production` | Controls error verbosity (prod hides internal details) |
| `SUPABASE_URL` | `https://onxdcikfttdmnhofsuwo.supabase.co` | Supabase project URL |
| `CORS_ORIGIN` | `https://loop.rald.cloud,https://loop.ostinato-loop.pages.dev` | Comma-separated allowed origins |
| `RALD_AUTH_URL` | `https://auth.rald.cloud` | RALD SSO base URL |

---

## Routes / DNS

The worker is bound to `loop-api.rald.cloud/*` via the Cloudflare route:

```toml
[[env.production.routes]]
pattern   = "loop-api.rald.cloud/*"
zone_name = "rald.cloud"
```

**Required Cloudflare DNS configuration:**
- `loop-api.rald.cloud` must be a CNAME/A record proxied through Cloudflare (orange cloud)
- If the record is DNS-only (grey cloud), the worker route won't match and all requests will 404

**Verify:**
```bash
curl -I https://loop-api.rald.cloud/api/healthz
# Must return HTTP/2 200
# Check for: server: cloudflare
```

---

## D1 Migrations

D1 migrations are NOT automatically applied by `wrangler deploy`. They must be applied separately:

```bash
# Apply all pending migrations to production D1
cd artifacts/cloudflare-worker
pnpm exec wrangler d1 migrations apply loop-db --env production

# List applied migrations
pnpm exec wrangler d1 migrations list loop-db --env production
```

**Expected migrations to be applied:**
- `001_initial_schema.sql` — profiles, rooms, basic auth
- `002_rooms_enhanced.sql` — room categories, audience count
- `003_follows.sql` — follows table, indexes
- `004_moderation.sql` — reports, blocks
- `005_communities.sql` — communities, members
- `006_notifications.sql` — notifications table
- `007_community_v2_schema.sql` — community enhancements
- `008_community_activation.sql` — activation system
- `009_rald_regions.sql` — region registry

If any migration is missing, the corresponding API routes will return 500 (Supabase will report table-not-found).

---

## KV Namespace Setup

The KV namespace stores OTP pin IDs, rate limit windows, and JWT revocation keys.

**KV ID in wrangler.toml:**
```toml
id = "3c71da01b3174d6c9353adbfde7491a3"
```

This namespace must exist in the Cloudflare account. Verify:
```bash
pnpm exec wrangler kv namespace list
# Should show namespace with above ID
```

---

## Queue Setup

The `loop-tasks` queue must exist as both a producer AND consumer binding:

```bash
# Create queue (if it doesn't exist)
pnpm exec wrangler queues create loop-tasks

# Verify
pnpm exec wrangler queues list
```

---

## CORS Configuration

The worker reads `CORS_ORIGIN` (comma-separated) to determine allowed origins.

**Production allowed origins:**
```
https://loop.rald.cloud
https://loop.ostinato-loop.pages.dev
```

**If you need to add a new allowed origin** (e.g., a custom domain):
1. Add to `CORS_ORIGIN` in `[env.production.vars]` in `wrangler.toml`
2. Re-deploy: `pnpm exec wrangler deploy --env production`

**Important:** `Access-Control-Allow-Credentials: true` is only set when `Allow-Origin` is not `*`. This is intentional — browsers reject wildcard + credentials combinations.

---

## Smoke Test Checklist

Run after every deploy:

```bash
BASE="https://loop-api.rald.cloud"

# 1. Liveness
curl -s "$BASE/api/healthz" | jq .ok
# Expected: true

# 2. Full health (bindings)
curl -s "$BASE/api/health" | jq .bindings
# Expected: all true

# 3. Auth endpoint reachable
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/send-otp" \
  -H "Content-Type: application/json" -d '{"phone":"invalid"}'
# Expected: 400 (not 503 — 503 means missing secrets)

# 4. CORS preflight
curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE/api/auth/me" \
  -H "Origin: https://loop.rald.cloud" -H "Access-Control-Request-Method: GET"
# Expected: 204

# 5. Rooms public (no auth)
curl -s "$BASE/api/rooms?limit=5" | jq .rooms
# Expected: array (may be empty, but not an error object)

# 6. Audio token requires auth
curl -s "$BASE/api/audio/token?room_id=test" | jq .error
# Expected: "Unauthorized" (not "LiveKit not configured")
```

If step 3 returns 503 with `"missing"` array → secrets not pushed.
If step 5 returns a Supabase 404 → D1 migrations not applied.
If step 6 returns `"LiveKit not configured"` → LIVEKIT_* secrets not pushed.

---

## Deployment Command Reference

```bash
# Standard deploy (runs CI pipeline)
git push origin main

# Manual deploy (skip CI)
cd artifacts/cloudflare-worker
pnpm exec wrangler deploy --env production

# Push a single secret
echo "value" | pnpm exec wrangler secret put SECRET_NAME --env production

# View worker logs (tail)
pnpm exec wrangler tail --env production

# View D1 database
pnpm exec wrangler d1 execute loop-db --env production --command "SELECT COUNT(*) FROM profiles"
```

---

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Every request returns `503 "Service misconfigured"` | `RALD_JWT_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` not set | Push missing secrets |
| `/api/audio/token` returns `503 "LiveKit not configured"` | `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` not set | Push LiveKit secrets |
| `/api/rooms` returns 500 | D1 migrations not applied | `wrangler d1 migrations apply loop-db --env production` |
| CORS error on credentialed requests | `Access-Control-Allow-Origin: *` + credentials | Fixed in cors.ts — redeploy |
| JWT signing fails for non-ASCII emails | `btoa()` Unicode bug | Fixed in jwt.ts — redeploy |
| `/api/healthz` returns 1017 or connection refused | DNS record grey-cloud (not proxied) | Set DNS to orange cloud in Cloudflare Dashboard |
| `wrangler deploy` fails with "route pattern conflict" | Another worker owns `loop-api.rald.cloud` | Check Workers → Routes in Cloudflare Dashboard |
