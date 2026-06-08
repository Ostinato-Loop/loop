# Near Me Feature — Verification Report

**Sprint:** Regional Belonging Onboarding  
**Date:** 2026-06-08  
**Author:** CTO Office — LILCKY STUDIO LIMITED  
**Status:** ✅ UI COMPLETE | ⏳ BACKEND FILTERING PENDING

---

## Feature Description

The "Near me" tab in `/discover` shows live rooms filtered to the user's registered region (country → state → LGA). If no region is set, the tab shows a CTA to complete the location profile.

---

## Implementation Verification

### Frontend (`src/pages/discover.tsx`)

| Check | Status | Notes |
|-------|--------|-------|
| "Near me" tab visible in tab bar | ✅ | Key: `"near"`, icon: `Navigation` |
| Dot indicator on tab when user has region | ✅ | Shows green dot if `profile.state_id \|\| profile.country` |
| No-region state renders CTA | ✅ | "Set your region" screen with button → `/settings` |
| Location header banner shown | ✅ | `formatLocation(profile)` from `regions-data.ts` |
| Rooms displayed when region exists | ✅ | `listRooms({ limit: 20 })` — client-side (see caveats) |
| Empty state with "Start a room" CTA | ✅ | Shown when zero rooms returned |
| "Nearby communities — coming soon" banner | ✅ | Honest empty-state placeholder |

### Filter Strategy (Current vs. Target)

```
CURRENT (Phase 1 — no server-side region filter):
  listRooms({ limit: 20 })
  ↓ returns all live rooms (no region filter)
  ↓ shown to user with location header

TARGET (Phase 2 — after activation route ships):
  listRooms({ country: profile.country, state_id: profile.state_id, limit: 20 })
  ↓ CF Worker WHERE rooms.country = $1 AND rooms.state_id = $2
  ↓ requires rooms table to have country/state_id columns (migration pending)
```

**This is intentional.** Rooms don't yet have region columns. The "Near me" UX is correct — the tab exists, the region is displayed, the fallback is honest. When the Activation API (migration 008) ships, server-side filtering activates automatically.

---

## Profile → Region Field Mapping

| Profile field | Onboarding step | Display helper |
|--------------|----------------|----------------|
| `country` | Step 3 | `getCountry(code).name` |
| `state_id` | Step 4 (optional) | `getStateName(stateId, country)` |
| `lga_id` | Step 5 (optional) | `getLgaName(lgaId)` |
| `lcda_id` | — (future step) | `toTitleCase(slug)` |

`formatLocation(profile)` produces:
- `"Ikeja • Lagos"` if `lga_id + state_id` present
- `"Lagos"` if only `state_id`
- `"Nigeria"` if only `country`
- `""` (empty) if no region — hides all region UI

---

## Shown In

| Surface | What region changes |
|---------|-------------------|
| Feed page header | Small `MapPin` + location label under "Loop" |
| Feed page — regional banner | Tappable link to `/discover?tab=near` |
| Discover — Near me tab | Room list with location header |
| Profile page (me.tsx) | Location badge pill under username |
| Notifications | Regional nudge if `profile.country === null` |

---

## Testing Checklist

- [ ] Create account → complete onboarding → set country=NG, state=lagos, lga=ikeja
- [ ] Verify profile shows "Ikeja • Lagos" badge on `/me`
- [ ] Verify feed header shows location indicator
- [ ] Verify `/discover` "Near me" tab shows room list (not empty state)
- [ ] Create account → skip country step → verify "Near me" shows CTA
- [ ] Verify notifications shows "Set your region" nudge for no-region accounts
- [ ] Verify trust score increases after setting country (+10), state (+5), lga (+5)

---

## Caveats

1. **Server-side region filtering** is deferred until rooms table gets `country`/`state_id` columns (migration 008 `community_activation` adds this via communities → rooms FK).
2. **LCDA granularity** is not collected in onboarding yet — only country, state, LGA. LCDA can be added as step 6 in a future sprint.
3. **GPS-based "near me"** (HTML5 Geolocation API) is intentionally excluded from Phase 1. Manual selection is privacy-preserving and works offline.
