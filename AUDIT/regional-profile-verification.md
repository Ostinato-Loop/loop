# AUDIT/regional-profile-verification.md
**Sprint:** V2 Regional Discovery & Onboarding — Phase 1  
**Date:** 2026-06-07  
**Auditor:** CTO Office — LILCKY STUDIO LIMITED

---

## Verdict: ✅ PASS

Regional profile fields are implemented and indexed. Migration 006 applied to main.

---

## Profile Region Fields

| Column | Type | Source Migration | Purpose |
|--------|------|-----------------|---------|
| country | text (ISO-3166-1 alpha-2) | 006 | Root of geo-discovery hierarchy |
| state_id | text (slug) | 006 | State-level scoping (e.g. 'lagos') |
| lga_id | text (slug) | 006 | LGA hyperlocal discovery |
| lcda_id | text (slug) | 006 | Finest geographic grain |

All nullable — existing profiles unaffected. Populated during onboarding.

## Index Strategy

| Index | Columns | Type |
|-------|---------|------|
| profiles_country_idx | country | Partial (WHERE NOT NULL) |
| profiles_region_state_idx | (country, state_id) | Partial (WHERE both NOT NULL) |
| profiles_region_lga_idx | (country, state_id, lga_id) | Partial |
| profiles_region_lcda_idx | (country, state_id, lga_id, lcda_id) | Partial |

## Data Collection Rules

| Rule | Implementation |
|------|---------------|
| Geolocation optional | CF geo headers used as suggestion only |
| Manual selection available | Location search field (V3 onboarding) |
| Editable later | PATCH /api/profiles with region fields |
| Privacy-first | Region fields NOT shown to other users by default |
| No government forms | Single location search → auto-derive hierarchy |

## Validation

- country: ISO-3166-1 alpha-2 uppercase (NG, GH, ZA, KE)
- state_id: lowercase slug (lagos, abuja-fct, rivers)
- lga_id: lowercase slug (ikeja, alimosho)
- lcda_id: lowercase slug (ojodu, mosan-okunola)

**Phase 1 — COMPLETE ✅**
