# Loop Public Beta Scorecard

**Assessment Date:** 2026-06-11  
**Assessed By:** CTO Agent (G.13 session)

---

## Overall Score: 8/10 Services GREEN — 2 Blockers Remain

| Service | URL | Status | Notes |
|---------|-----|--------|-------|
| Loop Web App | loop.rald.cloud | ✅ **200** | SPA serving correctly |
| Loop API | loop-api.rald.cloud/api/health | ✅ **200** | `{"ok":true}` |
| Auth | auth.rald.cloud/health | ✅ **200** | JWT auth live |
| Messenger | messenger.rald.cloud | ✅ **200** | v1.2.1 |
| Notification | notification.rald.cloud/health | ✅ **200** | Push notifications live |
| Search | search.rald.cloud/health | ✅ **200** | Fixed this session |
| Inbox | inbox.rald.cloud/health | ⚠️ **404** | Worker up; no /health route |
| Realtime | realtime.rald.cloud/health | 🔴 **503** | Missing provider secret |
| Identity | identity.rald.cloud | 🟡 **522** | Pages SSL provisioning (~30 min) |
| Alternate Domain | messenger.ostloop.name.ng | ✅ **200** | Serving correctly |

---

## Blocking Items

### 🔴 P0: `realtime.rald.cloud` — missing provider secret
Add `CALLS_APP_SECRET` (Cloudflare Calls) or LiveKit/Tencent creds to org secrets, then redeploy.

### 🟡 P1: `identity.rald.cloud` — SSL cert provisioning
Self-heals. `rald-identity.pages.dev` → 200 (origin healthy). Custom domain registered.

---

## Infra Health

| Component | Status |
|-----------|--------|
| GitHub Actions (most repos) | ✅ Deploying |
| rald-auth-core CI | 🔴 Billing quota exceeded (0-step failures) |
| Cloudflare Workers routing | ✅ All routes active |
| DNS (rald.cloud zone) | ✅ All subdomains resolve |
| Supabase | ✅ Connected (URL in all workers) |
| RALD_JWT_SECRET | ✅ Pushed to org + all workers |

---

## Mobile Readiness

| Item | Status |
|------|--------|
| Deep links (Android intentFilters) | ✅ Configured |
| Universal links (associatedDomains) | ✅ loop.rald.cloud |
| react-navigation linking config | ✅ loop:// scheme |
| Expo app.json | ✅ Updated |

---

## Remaining User Actions (Ordered by Priority)

1. **Add one provider secret** to org: `CALLS_APP_SECRET` (Cloudflare Calls) — fixes realtime
2. **Fix GitHub billing** for Ostinato-Loop org — unblocks rald-auth-core CI deploys
3. **Merge PR#16** (this scorecard PR) — optional docs merge
