# Loop Regional Belonging Truth Report
**Date:** 2026-06-08  
**Auditor:** Zero-Illusion Audit Sprint  
**Scope:** Location, regional, and community belonging features — what is real vs. claimed

---

## Location Data Architecture

### What Exists in the Database
From Supabase profiles table:
- `state_id` (text, nullable) — state or region identifier
- No `country_id`, `lga_id`, `lcda_id`, `city` fields found in current migration

### What Exists in the Worker
`GET /api/regions` — returns a list of regions/states.

### What Exists in the Frontend
- `discover.tsx`: "Near me" tab filters by `profile.state_id` via API query
- `me-launch.tsx`: Shows `profile.state_id` as location badge (MapPin icon)
- `onboarding.tsx`: No location collection step

---

## Regional Belonging Feature Audit

### Onboarding Location Collection
| Feature | Status | Evidence |
|---|---|---|
| Country selection | ❌ ABSENT | No step in 5-step onboarding |
| State selection | ❌ ABSENT | No step in onboarding |
| LGA/LCDA selection | ❌ ABSENT | No step |
| Location persistence | ❌ CANNOT PERSIST | Nothing to save if not collected |

**Truth:** No user has a `state_id` set. Every user's location is `null`.

### Near Me Discovery
| Feature | Status | Evidence |
|---|---|---|
| Near me tab | 🟡 EXISTS | discover.tsx has "Near me" tab |
| Actual proximity filter | ❌ DOES NOT FILTER | state_id is null for all users; filter returns all rooms |
| GPS/device location | ❌ ABSENT | No geolocation API calls |
| "Near me" label truth | ⚠️ MISLEADING | Shows all rooms, not nearby rooms |

**Truth:** "Near me" is effectively "All Rooms" for every user, because no one has a location set.

### Community Regional Structure
| Feature | Status | Evidence |
|---|---|---|
| Communities exist | 🟢 ALIVE | GET /api/communities returns real data |
| Community location filter | 🟡 UNKNOWN | communities.ts filter logic not fully audited |
| State-based communities | 🟡 POSSIBLE | `communities` table may have `state_id` |
| Nigeria-specific regions | 🟡 PARTIAL | Region API exists; maps Nigerian states |
| LGA/LCDA granularity | ❌ ABSENT | No LGA/LCDA field in profiles |

### Profile Location Display
| Feature | Status | Evidence |
|---|---|---|
| Location badge on profile | 🟢 ALIVE | me-launch.tsx renders MapPin + state_id |
| Actual data | ❌ EMPTY | profile.state_id is null for all users |

---

## What "Regional Belonging" Actually Delivers Today

1. **Region registry**: The worker knows Nigerian states (GET /api/regions). ✅
2. **No user location data**: Zero users have `state_id` set. ❌
3. **Near me does not filter**: All rooms returned regardless of location. ❌
4. **Community regionalization**: Possible at DB level but unverified from frontend. 🟡

---

## Required Actions (Sprint 2)

### Priority 1: Collect Location in Onboarding
Add a location step after interests:
```tsx
// Step 6: Location (after interests)
// Country → State/Region → LGA (optional)
// Save: profile.country_id, profile.state_id, profile.lga_id
```

### Priority 2: Schema Extension
```sql
ALTER TABLE profiles ADD COLUMN country_id TEXT;
ALTER TABLE profiles ADD COLUMN lga_id TEXT;
ALTER TABLE profiles ADD COLUMN city TEXT;
```

### Priority 3: Fix "Near me" Filter
Until users have location data, either:
- Rename "Near me" → "Browse All" (honest)
- Or use IP geolocation as a proxy for approximate location

### Priority 4: Profile Edit with Location
Once Edit Profile is implemented, allow location update.

---

## Verdict

Regional belonging is the most incomplete dimension of Loop V1. The infrastructure (region registry, state_id field) exists but no user-facing path to populate it. "Near me" is the most misleading feature in the product — it implies location-based filtering but does none. This should be labeled honestly ("All Rooms") until location data is collected.

**Zero-illusion compliance: ⚠️ PARTIAL**  
The "Near me" label is not honest. Everything else is honest (empty states, no fake regional data).

---
*Generated: 2026-06-08 | Sprint: Zero-Illusion Audit*
