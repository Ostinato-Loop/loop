# Regional Identity — Production Certification

**Sprint:** Regional Belonging Onboarding  
**Date:** 2026-06-08  
**Author:** CTO Office — LILCKY STUDIO LIMITED  
**Environment:** Production — `loop.rald.cloud` / `loop-api.rald.cloud`

---

## Certification Scope

This document certifies the Regional Belonging Onboarding sprint for production readiness. It covers the data model, onboarding UX, regional content surfacing, and trust integration.

---

## Production Readiness Matrix

### Frontend (Deployed via GitHub Actions → Cloudflare Pages)

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Static region data | `src/lib/regions-data.ts` | ✅ CERTIFIED | 257 lines, no runtime dependencies |
| Onboarding (8 steps) | `src/pages/onboarding.tsx` | ✅ CERTIFIED | Country/State/LGA added at steps 3–5 |
| Feed — regional header | `src/pages/feed.tsx` | ✅ CERTIFIED | Location badge + near-me banner |
| Discover — Near Me tab | `src/pages/discover.tsx` | ✅ CERTIFIED | Region-gated with fallback CTA |
| Profile — location badge | `src/pages/me.tsx` | ✅ CERTIFIED | MapPin pill, taps → /settings |
| Notifications — regional nudge | `src/pages/notifications.tsx` | ✅ CERTIFIED | Shows when `profile.country === null` |

### Backend (Cloudflare Worker — `loop-api.rald.cloud`)

| Route | Status | Notes |
|-------|--------|-------|
| `GET /api/regions/search` | ⚠️ BLOCKED | `rald_regions` table not in prod DB (migration 009 needed) |
| `GET /api/regions/countries` | ⚠️ BLOCKED | Same dependency |
| `GET /api/activation/home-feed` | ⚠️ BLOCKED | Communities table not in prod DB (migration 005 needed) |
| `POST /api/activation/auto-join` | ⚠️ BLOCKED | Same |

All blocked routes return `{ error, _debug }` — frontend has graceful fallbacks for all.

---

## Production DB Migration Status

To unlock all regional features:

```sql
-- Verify what's applied:
SELECT name FROM supabase_migrations.schema_migrations ORDER BY name;

-- Expected applied: 001, 002, 003, 004
-- Missing: 005, 006, 007, 008, 009
```

### Migration 006 — Profile region columns (CRITICAL for onboarding)

```sql
-- Safe to run on production (IF NOT EXISTS guards):
-- supabase/migrations/006_profile_region_fields.sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country  text,
  ADD COLUMN IF NOT EXISTS state_id text,
  ADD COLUMN IF NOT EXISTS lga_id   text,
  ADD COLUMN IF NOT EXISTS lcda_id  text;
-- + indexes
```

### Migration 009 — rald_regions table (for API search)

```sql
-- Creates rald_regions table + seeds 106 entries + search_region() RPC
-- File: supabase/migrations/009_rald_region_registry.sql
-- Requires pg_trgm extension (already enabled in migration 001)
```

---

## Deployment Pipeline

| Pipeline | Status | Notes |
|----------|--------|-------|
| GitHub Actions `Deploy Loop` | ✅ ACTIVE | Triggered on push to `main`. Uses `pnpm exec wrangler deploy --env production` in `artifacts/cloudflare-worker`. |
| Cloudflare built-in CI | ⚠️ MISCONFIGURED | Root dir `/` (wrong — should be `artifacts/cloudflare-worker`). Does NOT affect production since GitHub Actions deploys. Fix: disable Cloudflare Pages Git integration or update root dir in Cloudflare dashboard. |

---

## Live Endpoint Verification

| Endpoint | Last Checked | Result |
|----------|-------------|--------|
| `GET /health` | 2026-06-08 | ✅ 200 `{"status":"ok"}` |
| `GET /api/rooms` | 2026-06-08 | ✅ 200 real data |
| `GET /api/trending` | 2026-06-08 | ✅ 200 |
| `CORS preflight OPTIONS /api/rooms` | 2026-06-08 | ✅ 204 correct headers |
| `GET /api/communities` | 2026-06-08 | ❌ 500 PGRST205 (migration 005 missing) |
| `GET /api/regions/search?q=lagos` | 2026-06-08 | ❌ 500 PGRST205 (migration 009 missing) |

---

## Certification Decision

**CONDITIONAL PASS**

The frontend is production-ready and deployed. Regional onboarding, Near Me UX, location badges, and regional notifications are all live and functional for users with region data.

The backend regional features (communities, region search) are **blocked on DB migrations** only. No code changes needed. Apply migrations 005–009 in the Supabase SQL editor to unlock all features.

---

## Sign-off Checklist

- [x] Static region data embedded (no DB dependency for onboarding)
- [x] Onboarding persists country/state/lga to `profiles` (migration 006 required)
- [x] Trust score awards regional fields (+25 max)
- [x] Near Me tab gated on region completion
- [x] All region UI hidden gracefully when no region set
- [x] Honest empty states — no fake data
- [ ] Apply migration 006 to production DB
- [ ] Apply migration 009 to production DB
- [ ] Verify `/api/regions/search` returns results post-migration
