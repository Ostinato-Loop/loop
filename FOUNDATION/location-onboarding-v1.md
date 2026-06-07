# FOUNDATION/location-onboarding-v1.md
**Sprint:** V3 Frictionless Onboarding — Phase 2  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED

---

## Mission

Collect location in ONE action. Derive country + state + LGA + LCDA automatically. No government forms.

---

## Screen: "Where are you usually?"

### UI

Single search field with placeholder examples:
```
Ikeja · Yaba · Lekki · Abuja · Kano · Accra · Nairobi
```

User types a neighbourhood, area, or city name.

### Auto-Derivation

```
User types "Ojodu"
          ↓
Lookup in RALD region registry (future)
OR
Fuzzy match against known LCDA/LGA/State list
          ↓
Auto-derive:
  country = "NG"
  state_id = "lagos"
  lga_id = "ikeja"
  lcda_id = "ojodu"
          ↓
Show confirmation: "Ojodu, Ikeja, Lagos" ✓
```

### Geolocation (Optional Enhancement)

If user grants location permission:
- Use browser `navigator.geolocation`
- Reverse-geocode via free API (nominatim/OpenStreetMap)
- Pre-fill search field with result
- User can edit before confirming

Geolocation is NEVER required. Search always available.

### Data Flow

```
User confirms location
        ↓
POST /api/activation/auto-join {
  country: "NG",
  state_id: "lagos",
  lga_id: "ikeja",
  lcda_id: "ojodu",
  interests: [/* from step 1 */]
}
        ↓
PATCH /api/profiles {
  country: "NG",
  state_id: "lagos",
  lga_id: "ikeja",
  lcda_id: "ojodu"
}
```

### Fallback

If location search fails or is skipped:
- CF geo-headers used as silent fallback
- Auto-join runs at country/state level only
- User can update region later in profile settings

**Phase 2 — COMPLETE ✅**
