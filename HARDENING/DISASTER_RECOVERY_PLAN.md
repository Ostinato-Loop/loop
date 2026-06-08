# DISASTER RECOVERY PLAN
**Date:** 2026-06-08  
**Scope:** All production services backing loop.rald.cloud  
**Owner:** LILCKY STUDIO LIMITED  
**RTO (Recovery Time Objective):** < 30 minutes for audio, < 4 hours for data  
**RPO (Recovery Point Objective):** < 15 minutes for messages, < 1 hour for rooms

---

## Production Service Map

| Service | Host | URL | Backing Store | Deploy Command |
|---------|------|-----|---------------|----------------|
| Loop Web App | Cloudflare Pages | `loop.rald.cloud` | — | Git push to `loop` main |
| Auth Worker | Cloudflare Worker | `auth.rald.cloud` | Supabase | `wrangler deploy` in `rald-auth-core/` |
| Realtime Worker | Cloudflare Worker | `realtime.rald.cloud` | CF KV | `wrangler deploy` in `rald-realtime/` |
| Messenger Worker | Cloudflare Worker | `messenger.rald.cloud` | Supabase | `wrangler deploy` in `messenger/workers/loop-messenger-api/` |
| Loop Database | Supabase | `onxdcikfttdmnhofsuwo.supabase.co` | Postgres | Migrations via `supabase db push` |
| Messenger Database | Supabase | (same project) | Postgres | Migrations via SQL |
| Audio Providers | LiveKit (P2) → RealtimeKit (P1) → Tencent (P3) | Provider-managed | — | Failover is automatic |
| Design System | Cloudflare Pages | `design.rald.cloud` | — | Git push to `rald-design` main |

---

## Failure Scenarios and Recovery Procedures

---

### Scenario 1: Cloudflare Worker goes down (auth.rald.cloud or realtime.rald.cloud)

**Probability:** Low. Cloudflare SLA is 99.99%.  
**Impact:** All logins fail (auth). All rooms fail to join (realtime).  
**Detection:** `GET /health` returns non-200 OR push alerts from observability (see OBSERVABILITY_PLAN.md)

**Recovery:**
```bash
# 1. Check Cloudflare status
open https://www.cloudflarestatus.com

# 2. If Worker crashed (not platform issue), redeploy:
cd rald-auth-core && wrangler deploy
cd rald-realtime && wrangler deploy

# 3. If secrets were lost (rare, during account changes):
wrangler secret put RALD_JWT_SECRET --name rald-auth-core
wrangler secret put LIVEKIT_API_KEY --name rald-realtime
wrangler secret put LIVEKIT_API_SECRET --name rald-realtime
# (keep the full secret list in a private secure document — NOT in GitHub)

# 4. Verify recovery:
curl https://auth.rald.cloud/health
curl https://realtime.rald.cloud/health
```

**Time to recovery:** 5–10 minutes.

---

### Scenario 2: Supabase database outage

**Probability:** Low–Medium. Supabase has had incidents in 2024–2025.  
**Impact:** Login fails. Room lists empty. Profiles unavailable. Messenger down.  
**Detection:** Auth requests start returning 500. Supabase dashboard shows degraded status.

**Recovery:**
```
1. Check https://status.supabase.com
2. If Supabase is degraded: wait. There is no self-hosted fallback currently.
3. If data loss is suspected after recovery:
   - Check Supabase Point-in-Time Recovery (enabled on Pro plan)
   - Contact Supabase support with project ID: onxdcikfttdmnhofsuwo
4. If specific table data is corrupted:
   - Restore from the most recent migration backup (see backup procedure below)
```

**Backup procedure (must be scheduled):**
```bash
# Add to a weekly cron (Supabase Edge Function or GitHub Action):
supabase db dump --db-url $SUPABASE_DB_URL > backup-$(date +%Y%m%d).sql
# Upload to Cloudflare R2 bucket: loop-backups
```

**Time to recovery:** 15 minutes (if Supabase recovers) to 4 hours (if data restoration needed).

---

### Scenario 3: LiveKit audio provider down

**Probability:** Medium. LiveKit is managed infrastructure.  
**Impact:** All room joins fail. Existing rooms go silent.  
**Detection:** `GET /health/providers` on `realtime.rald.cloud` returns LiveKit latency error.

**Recovery (automatic):**  
The provider failover chain in `rald-realtime/src/lib/router.ts` handles this:
```
LiveKit (P2) → fails → Cloudflare RealtimeKit (P1) → fails → Tencent TRTC (P3)
```
Failover is automatic. **This only works if all provider secrets are set.** See C-2 in PLATFORM_HARDENING_AUDIT.md.

**Manual verification:**
```bash
curl https://realtime.rald.cloud/health/providers
# Expected: { livekit: { ok: true, latencyMs: 45 }, ... }
# If livekit.ok is false, confirm LIVEKIT_API_KEY and LIVEKIT_API_SECRET are set
```

**Recovery if all providers fail:**  
This is a complete audio blackout. Immediate action:
1. Post status update to Loop's official community
2. Contact LiveKit support (primary provider)
3. Verify Tencent TRTC account — it is the final fallback

---

### Scenario 4: Cloudflare Pages deployment breaks the frontend

**Probability:** Low–Medium. Build failures happen.  
**Impact:** loop.rald.cloud shows a broken page or blank screen.  
**Detection:** Cloudflare Pages deployment log shows error. Users report blank screen.

**Recovery:**
```
1. Open Cloudflare Pages dashboard
2. Navigate to loop.rald.cloud deployment history
3. Click on the last successful deployment
4. Click "Rollback to this deployment"
```
**Time to recovery:** 2 minutes.

**Prevention:**
```yaml
# .github/workflows/deploy.yml (in loop repo)
# Add a smoke test before deploying:
- name: Smoke test
  run: curl -f https://loop.rald.cloud/health || exit 1
```

---

### Scenario 5: GitHub repository becomes inaccessible or corrupted

**Probability:** Very low.  
**Impact:** Cannot deploy new code. CI/CD stops.

**Recovery:**
```bash
# Each developer should have a local clone of all critical repos:
# loop, rald-auth-core, rald-realtime, messenger

# Replit workspace is a live copy — push directly from Replit if needed:
git remote add github https://github.com/Ostinato-Loop/loop.git
git push github main
```

---

### Scenario 6: KV data loss (room state in rald-realtime)

**Probability:** Low. Cloudflare KV has durability guarantees.  
**Impact:** Active rooms disappear. Users in rooms lose session.  
**Note:** KV-backed rooms have 24h TTL by design. This is acceptable — rooms are ephemeral.

**Recovery:** None needed. Users create a new room. Recommend migrating room state to Supabase (see PLATFORM_HARDENING_AUDIT.md AD-2) for rooms longer than 24h.

---

### Scenario 7: Termii SMS service disrupted

**Probability:** Medium. Termii balance is currently 10 NGN (near zero).  
**Impact:** Phone-based OTP fails. Nigerian mobile users cannot register.  
**Recovery:**
1. Top up Termii account immediately (see H-2 in PLATFORM_HARDENING_AUDIT.md)
2. Email OTP (Resend) remains as fallback — ensure Resend API key is set

**No code change required.** `rald-auth-core/src/lib/otp.ts` has both channels.

---

## Backup and Recovery Checklist (Run Monthly)

```
Database
[ ] Supabase automatic backups enabled (verify in dashboard)
[ ] Point-in-Time Recovery enabled on Supabase Pro plan
[ ] Manual backup script tested: supabase db dump > backup.sql
[ ] Backup stored in Cloudflare R2 or secure offsite storage

Secrets
[ ] All Cloudflare Worker secrets documented in a private secure document (not GitHub)
[ ] At least two people in the organization know where the secrets document is
[ ] wrangler secret list run on all workers — output saved and dated
[ ] Supabase service role key backed up in secure document

Code
[ ] All developers have local clones of: loop, rald-auth-core, rald-realtime, messenger
[ ] Replit workspace confirmed as live working copy of loop repo

Deployments
[ ] Last known good deployment SHA recorded for each Cloudflare Pages project
[ ] Rollback procedure tested at least once per quarter
```

---

## Communication Plan During Incidents

When production is down for > 15 minutes:

1. **Internal:** WhatsApp message to all team members with status
2. **Users:** Post in Loop's primary community (in-app, if accessible) and on Twitter/X
3. **Template:**
```
Loop is experiencing a technical issue. Audio rooms are temporarily unavailable.
Our team is working on it. We expect to be back in [X] minutes.
RALD ID: RALD-XXXXX (post your ID in replies to report your issue)
```

4. **Post-incident:** Write a brief post-mortem in `loop/AUDIT/` within 24 hours. Include: what happened, how long it lasted, what was fixed, what will prevent recurrence.

---

## Scale-Specific Risks

### At 100 users
- Supabase free tier connection limit (100 concurrent). **Solution:** Upgrade to Pro before hitting 80 concurrent users.
- Cloudflare Worker requests: 100,000/day on free tier. At 100 users × 100 requests/day = 10,000. Safe.

### At 1,000 users
- Supabase connection pooling required (Pooler in Transaction mode)
- LiveKit concurrent participants — verify plan limits
- Cloudflare Workers paid plan required (~$5/month, 10M requests)
- KV reads become expensive. Migrate room state to Supabase.

### At 10,000 users
- Supabase database size and query performance audit required
- Cloudflare R2 for media storage (avatars, room covers) — migrate from Supabase Storage
- LiveKit dedicated project or self-hosted instance required
- Cloudflare Workers Standard plan ($0.30/million requests after 10M)
- Consider read replicas for Supabase (Supabase Enterprise)

---

*Prepared for LILCKY STUDIO LIMITED — Loop Hardening Directive — 2026-06-08*
