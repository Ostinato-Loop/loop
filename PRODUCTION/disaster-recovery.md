# PRODUCTION/disaster-recovery.md
**Service:** Loop (loop-api + loop Pages + Supabase + LiveKit)
**Owner:** LILCKY STUDIO LIMITED — CTO
**Last updated:** 2026-06-07
**RTO target:** < 30 minutes for P0 incidents
**RPO target:** < 5 minutes data loss

---

## 1. JWT Secret Rotation

**When:** Suspected secret compromise, mandatory quarterly rotation, or after engineer offboarding.

**Impact:** Rotates ALL active sessions for ALL users (everyone must re-authenticate).

### Procedure

```
1. Generate new secret (on a secure machine):
   openssl rand -hex 64

2. Update GitHub secret RALD_JWT_SECRET:
   GitHub → Ostinato-Loop org → Settings → Secrets → Actions → RALD_JWT_SECRET → Update

3. Push worker secret to Cloudflare:
   echo "NEW_SECRET" | wrangler secret put RALD_JWT_SECRET --env production

4. Verify secret accepted:
   wrangler secret list --env production | grep RALD_JWT_SECRET

5. Trigger redeployment:
   Cloudflare Dashboard → Workers & Pages → loop-api → Deployments → Redeploy latest
   OR: push a no-op change to main via GitHub UI

6. Monitor auth failure rate for 5 minutes:
   wrangler tail --env production --format json | jq 'select(.statusCode == 401) | .path'
```

**Verification:** Old tokens return 401; newly issued tokens return 200.
**Rollback:** Not possible — old sessions are intentionally invalidated. Users re-authenticate.

---

## 2. Supabase Recovery

### 2.1 Connection Pool Exhaustion

**Symptoms:** 500 errors on all data routes; Supabase logs show "remaining connection slots reserved".

```sql
-- Kill idle connections (run in Supabase Dashboard → Database → Query Editor)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND query_start < now() - interval '5 minutes';

-- Verify connections freed
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

**Medium-term fix:** Switch all service clients to Supabase Pooler (port 6543) instead of direct (port 5432).

### 2.2 Data Corruption / Accidental Deletion

**Supabase PITR (Point-in-Time Recovery):**

```
1. Identify last-known-good timestamp (check incident timeline)
2. Dashboard → Project → Backups → Point In Time
3. Select timestamp BEFORE corruption event
4. Click "Restore" — creates a NEW project; old project remains intact
5. Update worker secrets (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) to new project
6. Re-apply any migrations run AFTER the restore point
7. Verify /api/health → supabase.ok = true
```

**RPO:** Supabase Pro PITR = 1 second granularity. Free tier = daily backup only.

### 2.3 Supabase Service Outage

```
1. Confirm outage at: https://status.supabase.com
2. Enable maintenance mode:
   Worker: return 503 with Retry-After: 300 for all /api/* data routes
   Pages: show maintenance banner (KV feature flag: MAINTENANCE_MODE=1)
3. Monitor status page for resolution
4. On recovery: verify /api/health supabase probe, then disable maintenance mode
```

---

## 3. Cloudflare Recovery

### 3.1 Worker Deploy Failure

```
1. Check which deploy is active:
   wrangler deployments list --env production

2. Roll back to last-known-good:
   wrangler rollback --env production [deployment-id]
   OR: CF Dashboard → Workers & Pages → loop-api → Deployments → Rollback

3. Verify recovery:
   curl -sf https://loop-api.rald.cloud/api/healthz | jq '.status'
   # Expected: "ok"
```

### 3.2 Cloudflare Pages Outage (loop.rald.cloud)

```
1. Check CF Dashboard → Workers & Pages → loop → Deployments
2. Manual redeploy: push a no-op file change via GitHub UI to trigger new build
3. Emergency fallback: point loop.rald.cloud CNAME → loop.pages.dev
   (CF Dashboard → DNS → loop.rald.cloud → edit CNAME target)
```

### 3.3 KV Data Loss (rate limits / OTP store)

**Impact:** Rate limits reset — OTP abuse briefly possible. OTP sessions lost (users re-request).
**KV is ephemeral by design** — no recovery needed.

```
- Rate limits self-heal within 1 hour (TTL expiry)
- OTP sessions self-heal within 10 minutes (OTP TTL = 600 s)
- No persistent user data is stored in KV
- No action required beyond monitoring abuse logs
```

### 3.4 DNS / rald.cloud Zone Issue

```
1. CF Dashboard → DNS → rald.cloud zone
2. Verify CNAME records:
   loop.rald.cloud     → loop.pages.dev
   loop-api.rald.cloud → loop-api.ostinato-loop.workers.dev

3. Emergency: if zone is corrupted, restore from backup zone export
   (maintain a zone file export in rald-infrastructure repo, updated on each DNS change)

4. Emergency fallback while DNS propagates:
   Point loop.rald.cloud → loop.pages.dev direct (bypass custom domain)
```

---

## 4. LiveKit Outage Procedure

### 4.1 LiveKit Cloud Partial Degradation

**Impact:** New room joins fail; existing connected participants maintain audio (ICE holds).

```
1. Check https://status.livekit.io
2. Worker health: GET /api/health → livekit.ok = false
3. Disable room creation:
   Worker: POST /api/rooms → return 503 {"error": "Audio rooms temporarily unavailable"}
   Pages: show maintenance banner for rooms section
4. Monitor LiveKit status for recovery
5. On recovery: re-enable rooms, verify /api/health shows livekit.ok = true
```

### 4.2 LiveKit API Key Compromise

```
1. Rotate in LiveKit Cloud Dashboard:
   Project → Settings → API Keys → Revoke compromised key → Create new key

2. Update GitHub secrets in Ostinato-Loop org:
   LIVEKIT_API_KEY → new value
   LIVEKIT_API_SECRET → new value

3. Push to Cloudflare Worker:
   echo "NEW_API_KEY" | wrangler secret put LIVEKIT_API_KEY --env production
   echo "NEW_SECRET"  | wrangler secret put LIVEKIT_API_SECRET --env production

4. Redeploy via CF Dashboard: Workers & Pages → loop-api → Deployments → Redeploy

5. Impact: all existing room tokens are immediately invalid (embed old key)
   Users must rejoin rooms — acceptable trade-off for security
```

---

## 5. Full Service Rollback Procedure

**When:** A deploy introduces a critical bug that cannot be hot-patched.

```
1. Identify last-good deploy:
   wrangler deployments list --env production

2. Roll back Worker immediately (< 1 min):
   wrangler rollback --env production

3. Roll back Pages (CF Dashboard UI):
   Workers & Pages → loop → Deployments → select previous → Rollback

4. If a migration was applied: DO NOT ROLL BACK the migration
   Migrations are forward-only. Old code tolerates new nullable columns.
   Schedule a forward-fix migration for the next deploy.

5. Verify rollback:
   curl -sf https://loop-api.rald.cloud/api/healthz | jq '.status'
   # Expected: "ok"

6. Open GitHub issue with: commit SHA, impact, root cause, fix ETA
```

---

## 6. RTO / RPO Summary

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Worker deploy failure | < 5 min | 0 (stateless) | wrangler rollback |
| JWT secret compromise | < 15 min | 0 (sessions reset) | Rotate + redeploy |
| Supabase connection exhaustion | < 10 min | 0 | Kill idle connections |
| Supabase data corruption | < 60 min | < 5 min (PITR) | PITR restore |
| Supabase service outage | Until resolved | 0 (CDN cached) | Maintenance mode |
| LiveKit outage | Until resolved | 0 (rooms close) | Disable room creation |
| CF Pages outage | Until resolved | 0 (static) | Fallback URL |
| KV data loss | 0 (self-healing) | N/A | No action needed |
| DNS zone corruption | < 30 min | 0 | Zone restore |

---

## 7. Backup Inventory

| Data | Method | Frequency | Location |
|------|--------|-----------|----------|
| Supabase database | PITR (Pro) / Daily (Free) | Continuous | Supabase managed |
| Worker source code | Git | Every push | Ostinato-Loop/loop |
| Worker secrets | GitHub Secrets + CF Secrets | Manual rotation | GitHub + CF Dashboard |
| DNS zone file | Manual export | Before each change | rald-infrastructure repo |
| wrangler.toml | Git | Every push | Ostinato-Loop/loop |
| Supabase migrations | Git | Every migration | Ostinato-Loop/loop/supabase/ |
