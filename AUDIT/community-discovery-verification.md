# AUDIT/community-discovery-verification.md
**Sprint:** V2 Community Infrastructure — Phase 4  
**Date:** 2026-06-07  
**Auditor:** CTO Office — LILCKY STUDIO LIMITED  
**Scope:** Community discovery engine — nearby, interest, state endpoints

---

## Verdict

```
╔══════════════════════════════════════════════════════════════════╗
║  DISCOVERY AUDIT:  ✅  PASS                                     ║
║  Implemented: nearby, interests, state — no auth required        ║
║  NOT implemented: ranking, trending, civic hierarchy             ║
║  (per sprint scope: only Phase 4 foundations)                   ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Discovery Endpoints

### 1. GET /api/communities/nearby

**Purpose:** Return communities geographically near the requester.  
**Detection method:** Cloudflare geo-injection headers (passive — no user location requested).

#### CF Headers Used

| Header | Value example | Maps to |
|--------|---------------|---------|
| CF-IPCountry | NG | country_code filter |
| CF-IPRegion | Lagos State | region_id construction |
| CF-IPCity | Lagos | label for detected_region |

#### Merge-Level Waterfall

The discovery engine attempts the most specific match first, cascading to broader scopes if results are sparse:

```
CF-IPCity → [lcda] → [lga] → state (CF-IPRegion) → national → interest
```

Current implementation uses state-level precision (CF-IPRegion → stateId mapping).  
Sub-state (LGA, LCDA) merge levels are reserved for Phase 5+ with enriched region data.

#### Geo-ID Construction

```
CF-IPCountry="NG", CF-IPRegion="Lagos State"
→ stateSlug = "LAG" (first 3 chars, uppercase, " State" stripped)
→ region_id filter = "NG-LAG"
```

> Note: CF region names are locale-specific. The current heuristic (first 3 chars) works for Nigerian state names. A full mapping table (RALD region registry) will replace this heuristic in Phase 5.

#### Fallback Behaviour

| Condition | Response |
|-----------|----------|
| region_id match returns 0 results | Falls back to type='interest', merge_level='interest' |
| CF-IPRegion missing | Uses CF-IPCountry only, merge_level='national' |
| CF-IPCountry missing | Defaults to 'NG', merge_level='national' |
| Supabase error | Returns 500 with trace |

#### Response Shape

```json
{
  "communities": [ /* Community[] */ ],
  "detected_region": "Lagos",
  "merge_level": "state",
  "count": 12
}
```

#### Optional Filters

| Param | Type | Description |
|-------|------|-------------|
| limit | number | Max results (default 20, max 50) |
| civic | boolean | "true" to filter to civic communities only |

---

### 2. GET /api/communities/interests

**Purpose:** Return communities matching one or more interest tags.  
**No auth required** — public discovery endpoint.

#### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| tags | string | Comma-separated interest tags (e.g. "music,tech,sports") |
| limit | number | Max results (default 20, max 50) |

#### Tag Processing

- Split on comma, trim whitespace, lowercase
- Filter: max 40 chars per tag, max 10 tags, non-empty only
- Supabase array overlap filter: `interest_tags=cs.{"music","tech"}`
- If no tags provided: returns all `type='interest'` communities ordered by member_count

#### Response Shape

```json
{
  "communities": [ /* Community[] */ ],
  "tags": ["music", "tech"],
  "count": 5
}
```

---

### 3. GET /api/communities/state/:stateId

**Purpose:** Return communities for a specific Nigerian state (or country-level scope).  
**No auth required** — public discovery endpoint.

#### stateId Format

Validates: `^[A-Z]{2}-[A-Z]{2,4}$` (case-insensitive input, uppercased internally)

Valid examples:
- `NG-LA` — Lagos State
- `NG-AB` — Abia State  
- `NG-FC` — Federal Capital Territory
- `NG-RV` — Rivers State

Invalid: `lagos`, `NG`, `NG-Lagos`, `NG-1A` → returns 400

#### Response Shape

```json
{
  "communities": [ /* Community[] */ ],
  "state_id": "NG-LA",
  "count": 3
}
```

#### Optional Filters

| Param | Type | Description |
|-------|------|-------------|
| limit | number | Max results (default 20, max 50) |
| civic | boolean | "true" to filter to civic communities only |

---

## Route Registration Order (Conflict Prevention)

Discovery routes are registered **before** the parameterized `/:slug` route in the Hono router:

```typescript
communities.get("/nearby", ...)         // ← registered 1st
communities.get("/interests", ...)      // ← registered 2nd
communities.get("/state/:stateId", ...) // ← registered 3rd
// ... CRUD routes ...
communities.get("/:slug", ...)          // ← registered after all named routes
```

This prevents Hono from matching "nearby" or "interests" as a `:slug` parameter.

---

## What Is NOT Implemented (Per Sprint Scope)

| Feature | Reason Not Included |
|---------|---------------------|
| Trending communities | Not in Phase 4 scope. No ranking. |
| AI-assisted discovery | Phase 6+ |
| LGA/LCDA sub-state matching | Requires RALD region registry data (Phase 5) |
| Civic hierarchy (LGA council communities) | Phase 5+ |
| State ranking (NG-LA top communities) | Not in scope — no ranking |
| Creator community discovery | Phase 5+ |

---

## Data Requirements for Discovery

Discovery endpoints query the `communities` table using V1 columns added in migration 007:

| Column | Used By | Required |
|--------|---------|----------|
| type | /interests, /nearby | Yes — interest communities filtered by type='interest' |
| region_id | /nearby, /state/:stateId | Yes — geo matching |
| country_code | /nearby | Yes — national fallback |
| interest_tags | /interests | Yes — array overlap |
| is_civic | /nearby, /state/:stateId | Yes — civic filter |
| is_deleted | All discovery | Yes — exclude soft-deleted |
| is_suspended | All discovery | Yes — exclude suspended |

> Communities created before migration 007 have `type='interest'`, `country_code='NG'` by default. They will appear in `/interests` but not in `/nearby` or `/state/:stateId` (region_id is NULL).

---

## Sign-off

- [x] GET /api/communities/nearby — CF geo-header detection, merge-level waterfall, fallback
- [x] GET /api/communities/interests — tag matching, no-tag fallback, max 10 tags
- [x] GET /api/communities/state/:stateId — format validation, civic filter
- [x] All discovery routes: no auth required (public read)
- [x] Discovery routes registered before /:slug (no Hono conflict)
- [x] No ranking, no trending implemented (per scope)
- [x] Fallback for missing geo data (graceful degradation to national/interest)

**Phase 4 — COMPLETE ✅**
