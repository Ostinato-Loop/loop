# Regional Onboarding Readiness — Audit Report

**Sprint:** Regional Belonging Onboarding  
**Date:** 2026-06-08  
**Author:** CTO Office — LILCKY STUDIO LIMITED  
**Status:** ✅ READY (Frontend) | ⏳ PENDING (Backend migrations)

---

## Executive Summary

The frontend onboarding flow now collects Country → State → LGA across 8 steps. Data is persisted to `public.profiles` using the columns added in migration 006. The backend region search API (`/api/regions/search`) is implemented but blocked on production DB migration 009 (`rald_regions` table).

---

## Onboarding Flow — Step Audit

| # | Step | Field Persisted | Required | Notes |
|---|------|----------------|----------|-------|
| 1 | Username | `profiles.username` | ✅ Yes | Regex validated `[a-z0-9_]{3,20}` |
| 2 | Display Name | `profiles.display_name` | ✅ Yes | 2–40 chars |
| 3 | Country | `profiles.country` | ✅ Yes | ISO-3166-1 alpha-2 (e.g. `NG`) |
| 4 | State | `profiles.state_id` | ⚠️ Optional | Skippable. Slug (e.g. `lagos`) |
| 5 | LGA/LCDA | `profiles.lga_id` | ⚠️ Optional | Skippable. Slug (e.g. `ikeja`) |
| 6 | Language | `profiles.language` | ✅ Yes | BCP-47 code |
| 7 | Interests | `profiles.interests` | ✅ Yes | Min 3 required |
| 8 | Rooms | `profiles.onboarded` | ✅ Yes | Final step — sets `onboarded: true` |

---

## DB Schema Audit

### Migration 006 — `profiles` columns (REQUIRED for onboarding)

| Column | Type | Index | Status |
|--------|------|-------|--------|
| `country` | `TEXT` | `profiles_country_idx (WHERE NOT NULL)` | ✅ In migration file |
| `state_id` | `TEXT` | `profiles_region_state_idx` | ✅ In migration file |
| `lga_id` | `TEXT` | `profiles_region_lga_idx` | ✅ In migration file |
| `lcda_id` | `TEXT` | `profiles_region_lcda_idx` | ✅ In migration file |

**Production status:** Migration 006 may not be applied. Verify with:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name IN ('country','state_id','lga_id','lcda_id');
```

### Migration 009 — `rald_regions` table (REQUIRED for API search)

**Production status:** ❌ NOT applied (confirmed: `PGRST205` from `/api/regions/search`).  
**Workaround:** Frontend uses `src/lib/regions-data.ts` (static bundle, 257 lines). Onboarding works fully without migration 009.

---

## Data Fallback Strategy

```
User types "Lagos" in state picker
         │
         ▼
[STATIC] regions-data.ts → instant results
         │
         ▼ (when migration 009 is applied)
[API]   /api/regions/search?q=lagos&country=NG → rald_regions table
```

The static data covers:
- 20 African countries
- 37 Nigerian states (36 + FCT)
- 44 Nigerian LGAs across 9 major states
- 3 Ghanaian regions
- 3 Kenyan counties
- South African provinces

---

## Trust Score Integration

`computeTrustScore()` awards:
- `+10` for `country` set
- `+5` for `state_id` set
- `+5` for `lga_id` set
- `+5` for `lcda_id` set

Max regional contribution: **25 points** of 100 total.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration 006 not applied to prod DB | 🔴 HIGH | Run `supabase db push` or apply manually via SQL editor |
| Migration 009 not applied to prod DB | 🟡 MEDIUM | Static fallback active, API search deferred |
| `rald_regions` seed incomplete | 🟡 MEDIUM | 106 entries cover priority markets; LGAs added iteratively |
| Country field resets on state change | 🟢 LOW | Handled: `setStateId(""); setLgaId("")` on country change |

---

## Next Steps

1. **Apply migration 006** to production Supabase via SQL editor (or `supabase db push`)
2. **Apply migration 009** to unlock `/api/regions/search` RPC
3. Add Nigeria-only LCDA data (Lagos 37 LCDAs, Abuja 6 FCT area councils)
4. Wire `/api/regions/search` endpoint into onboarding step 5 (LGA) when migration is live
