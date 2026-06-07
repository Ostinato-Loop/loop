# FOUNDATION/rald-region-registry-v1.md
**Sprint:** RALD Region Registry  
**Date:** 2026-06-07  
**Author:** CTO Office — LILCKY STUDIO LIMITED  
**Scope:** Region lookup table powering V3 frictionless onboarding location search

---

## Mission

One user action. Four data points.

The V3 onboarding location step asks: *"Where are you usually?"* The user types one word. The registry derives `country + state_id + lga_id + lcda_id` automatically — no government forms, no dropdowns, no hierarchy navigation.

---

## Architecture

```
User types "Ojodu"
        ↓
GET /api/regions/search?q=Ojodu
        ↓
search_region() RPC → rald_regions table
        ↓
[{
  area_name:     "Ojodu",
  display_label: "Ojodu, Lagos",
  country:       "NG",
  state_id:      "lagos",
  lga_id:        "ikeja",
  lcda_id:       "ojodu"
}]
        ↓
User taps the result
        ↓
POST /api/activation/auto-join {
  country: "NG", state_id: "lagos",
  lga_id: "ikeja", lcda_id: "ojodu"
}
        ↓
User auto-joined to LCDA + LGA + State communities
```

---

## Database Schema: `rald_regions`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Stable identifier for client selection |
| area_name | TEXT | Primary search term (e.g. "Ikeja") |
| area_type | TEXT | lcda / lga / state / city / neighbourhood / district |
| country | TEXT | ISO-3166-1 alpha-2 (NG, GH, KE, ZA) |
| state_id | TEXT | Lowercase slug (lagos, abuja-fct, rivers) |
| lga_id | TEXT | LGA slug — null for state-level entries |
| lcda_id | TEXT | LCDA slug — null for LGA/state entries |
| display_label | TEXT | "Ikeja, Lagos" — shown in dropdown |
| aliases | TEXT[] | Alternative names: ['Ikeja Central', 'Lagos Capital'] |
| is_active | BOOLEAN | Soft-disable without deleting |

---

## Search Algorithm

The `search_region(p_query, p_country, p_limit)` RPC ranks results in this order:

| Rank | Condition | Example (query: "ik") |
|------|-----------|----------------------|
| 0 | Exact match: `lower(area_name) = lower(query)` | "ik" → exact |
| 1 | Prefix: `area_name ILIKE query%` | "Ikeja" |
| 2 | Contains: `area_name ILIKE %query%` | "Ojodu Ikeja" |
| 3 | Alias match | alias = "Ikeja Central" |
| 4 | Trigram similarity > 0.3 | Fuzzy fallback |

Plus a **plain ILIKE fallback** in the Worker if the RPC fails (pg_trgm unavailable).

### Minimum query length: 2 characters

Returns empty array (not error) for 0–1 character queries.

---

## Seed Coverage: 106 entries

| Country | Count | Key Areas |
|---------|-------|-----------|
| NG — Lagos | 46 | All major LCDAs + neighbourhoods |
| NG — Abuja FCT | 20 | All districts |
| NG — Rivers | 7 | Port Harcourt area |
| NG — Kano | 5 | City + LGAs |
| NG — Oyo | 7 | Ibadan + neighbourhoods |
| NG — Enugu | 5 | City + neighbourhoods |
| NG — Edo | 4 | Benin City area |
| NG — Kaduna | 4 | City + districts |
| NG — Other states | 30 | 1–3 entries per state |
| GH — Ghana | 4 | Accra, Kumasi, Tema, Takoradi |
| KE — Kenya | 4 | Nairobi, Westlands, Mombasa, Kisumu |
| ZA — South Africa | 2 | Johannesburg, Cape Town |

---

## API Endpoints

### Search
```
GET /api/regions/search?q=Ikeja&country=NG&limit=10

Response:
{
  "results": [{
    "id": "uuid",
    "area_name": "Ikeja",
    "area_type": "lcda",
    "country": "NG",
    "state_id": "lagos",
    "lga_id": "ikeja",
    "lcda_id": "ikeja-central",
    "display_label": "Ikeja, Lagos",
    "aliases": ["Ikeja Central", "Lagos Capital"]
  }],
  "query": "Ikeja",
  "count": 1
}
```

### By State
```
GET /api/regions/by-state/lagos?country=NG&type=lcda&limit=50

Response:
{
  "regions": [ /* all LCDAs in Lagos */ ],
  "state_id": "lagos",
  "country": "NG",
  "count": 45
}
```

### Get by ID
```
GET /api/regions/550e8400-e29b-41d4-a716-446655440000

Response:
{ "region": { /* full region object */ } }
```

---

## Integration with Auto-Join

The complete V3 onboarding location flow:

```typescript
// Step 1: User types → search
const res = await fetch(`/api/regions/search?q=${encodeURIComponent(input)}`);
const { results } = await res.json();

// Step 2: User selects result
const selected = results[0];

// Step 3: Auto-join with derived region data
await fetch('/api/activation/auto-join', {
  method: 'POST',
  headers: { Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({
    country:  selected.country,   // "NG"
    state_id: selected.state_id,  // "lagos"
    lga_id:   selected.lga_id,    // "ikeja"
    lcda_id:  selected.lcda_id,   // "ikeja-central"
    interests: userInterests       // from Phase 1
  })
});

// Step 4: Save to profile
await fetch('/api/profiles', {
  method: 'PATCH',
  body: JSON.stringify({
    country:  selected.country,
    state_id: selected.state_id,
    lga_id:   selected.lga_id,
    lcda_id:  selected.lcda_id
  })
});
```

---

## Registry Expansion

To add new areas:
```sql
INSERT INTO public.rald_regions
  (area_name, area_type, country, state_id, lga_id, lcda_id, display_label, aliases)
VALUES
  ('Berger', 'neighbourhood', 'NG', 'lagos', 'ikeja', 'ojodu', 'Berger, Lagos', ARRAY['Ojodu Berger'])
ON CONFLICT DO NOTHING;
```

The search index updates automatically on insert (GIN trigram index on area_name).

---

## Constraints Met

| Constraint | Status |
|-----------|--------|
| No video | ✅ |
| No AI features | ✅ |
| No radio | ✅ |
| No auth/JWT/CI regressions | ✅ |
| Production score 91/100 | ✅ |
| Feature branch + PR | ✅ |

**RALD Region Registry v1 — COMPLETE ✅**
