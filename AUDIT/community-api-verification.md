# AUDIT/community-api-verification.md
**Sprint:** V2 Community Infrastructure — Phase 2  
**Date:** 2026-06-07  
**Auditor:** CTO Office — LILCKY STUDIO LIMITED  
**Scope:** CF Worker communities route — `/api/communities`

---

## Verdict

```
╔══════════════════════════════════════════════════════════════════╗
║  API AUDIT:  ✅  PASS — 19 routes verified                      ║
║  Auth: requireAuth() middleware on all write operations          ║
║  Error handling: structured logging with traceId on all routes   ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Route Inventory

### Discovery (no auth required)

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | /api/communities/nearby | ❌ Public | ✅ | CF geo-header based discovery |
| GET | /api/communities/interests | ❌ Public | ✅ | Interest-tag matched communities |
| GET | /api/communities/state/:stateId | ❌ Public | ✅ | State-level communities by region_id |

### CRUD

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | /api/communities | ✅ JWT | ✅ | Create community |
| GET | /api/communities | ❌ Public | ✅ | List communities |
| GET | /api/communities/:slug | ❌ Public | ✅ | Get by slug or UUID |
| PATCH | /api/communities/:id | ✅ JWT | ✅ | Update (owner or admin) |
| DELETE | /api/communities/:id | ✅ JWT | ✅ | Delete (owner only) |

### Membership

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | /api/communities/:id/members | ❌ Public | ✅ | List members with profiles |
| DELETE | /api/communities/:id/members/:userId | ✅ JWT | ✅ | Remove member (owner/mod) |
| POST | /api/communities/:id/join | ✅ JWT | ✅ | Join community |
| DELETE | /api/communities/:id/leave | ✅ JWT | ✅ | Leave community |
| POST | /api/communities/:id/leave | ✅ JWT | ✅ | Leave (POST alias — spec compliance) |

### Moderators

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | /api/communities/:id/moderators | ✅ JWT | ✅ | Appoint moderator (owner only) |
| DELETE | /api/communities/:id/moderators/:userId | ✅ JWT | ✅ | Remove moderator (owner only) |

### Rules

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | /api/communities/:id/rules | ❌ Public | ✅ | List community rules |
| POST | /api/communities/:id/rules | ✅ JWT | ✅ | Upsert rule (owner or mod with can_edit_rules) |

### Community Rooms

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | /api/communities/:id/rooms | ❌ Public | ✅ | List rooms in community |
| POST | /api/communities/:id/rooms | ✅ JWT | ✅ | Create room in community |

---

## Route-by-Route Detail

### GET /api/communities/nearby
- Uses CF headers: `CF-IPCountry`, `CF-IPRegion`, `CF-IPCity`
- Builds `region_id` filter (e.g. `NG-LAG` for Lagos)
- Merge levels: `lcda` → `lga` → `state` → `national` → `interest`
- Falls back to interest communities if region returns 0 results
- Response includes `detected_region`, `merge_level`, `count`
- **No auth required** — read-only discovery

### GET /api/communities/interests
- Query param `tags` (comma-separated, max 10 tags, max 40 chars each)
- Uses Supabase array overlap filter (`cs.{...}`)
- Falls back to all interest-type communities if no tags provided
- Response includes matched `tags`, `count`

### GET /api/communities/state/:stateId
- Validates format: `^[A-Z]{2}-[A-Z]{2,4}$` (e.g. `NG-LA`)
- Returns 400 for malformed stateId
- Optional `civic=true` query param filters to civic communities

### POST /api/communities
- **Validation:**
  - name: 2–80 chars (required)
  - slug: 3–48 chars, auto-generated if omitted
  - category: must be one of 11 valid values
  - visibility: public | private | invite_only (default: public)
  - type: must be one of 10 valid CommunityType values
  - regional types require region_id
  - interest_tags: up to 10 tags
- Slug uniqueness check before insert
- Auto-enrolls creator as `owner` in `community_members`
- Structured audit log: communityId, slug, ownerId, type, traceId, timestamp

### GET /api/communities/:slug
- Accepts both URL slug and UUID in `:slug` parameter
- UUID detected by regex pattern
- Best-effort membership check (decodes JWT without full verify — informational only)
- Returns: community + is_member + member_role

### PATCH /api/communities/:id
- Requires owner or admin role in community_members
- Updatable fields: name, description, cover_url, category, visibility, interest_tags
- Rejects updates with 0 valid fields
- Validates category and visibility values

### DELETE /api/communities/:id
- Owner only
- Structured deletion audit log

### DELETE /api/communities/:id/members/:userId
- Prevents self-removal (use /leave instead)
- Actor must be owner, admin, or moderator with `can_remove_members`
- Cannot remove owner
- Admins cannot remove other admins (owner-only operation)
- Fires `decrement_community_member_count` RPC

### POST /api/communities/:id/join
- Checks community exists, not deleted, not suspended
- Blocks join on `invite_only` communities (403)
- Returns 409 if already a member
- Fires `increment_community_member_count` RPC

### DELETE + POST /api/communities/:id/leave
- Both methods delegate to shared `leaveCommunity()` helper (zero code duplication)
- Owner cannot leave (must transfer/delete)
- Fires `decrement_community_member_count` RPC

### POST /api/communities/:id/moderators
- Owner only
- Target must be an existing community member
- Cannot appoint self as moderator
- Upserts (reactivates if previously revoked)
- Returns 201 with moderator row

### DELETE /api/communities/:id/moderators/:userId
- Owner only
- Soft-revoke: sets `is_active=false`, records `revoked_at`
- Returns 404 if user is not an active moderator

### POST /api/communities/:id/rules
- Owner always allowed
- Members: must be active moderator with `can_edit_rules=true`
- Validates: rule_number 1–20, title 5–80 chars, body 10–500 chars
- Upsert by (community_id, rule_number) — owner can update existing rules

---

## Validation Coverage

| Concern | Handled |
|---------|---------|
| Input validation | ✅ All required fields validated before Supabase call |
| Auth on writes | ✅ requireAuth() on all mutation routes |
| Permission checks | ✅ Role checked after auth on every mutation |
| Supabase error propagation | ✅ Status + structured log on all error paths |
| Race conditions (join) | ✅ Membership check before insert (idempotent 409) |
| Owner protection | ✅ Owner cannot be removed by any route |
| Counter drift | ✅ RPC fires on every join/leave/remove |
| traceId | ✅ All routes emit traceId in structured logs |

---

## Route Discovery Conflict Analysis

Discovery routes (`/nearby`, `/interests`, `/state/:stateId`) are registered **before** the parameterized `/:slug` route. This prevents Hono from capturing "nearby", "interests", or "state" as a slug value.

Route registration order in communities.ts:
1. GET /nearby ← registered first
2. GET /interests ← registered first
3. GET /state/:stateId ← registered first
4. POST / ← CRUD
5. GET / ← CRUD
6. GET /:slug ← parameterized (after all named paths)
7. PATCH /:id, DELETE /:id ← CRUD
8. Membership routes
9. Moderator routes
10. Rules routes
11. Room routes

No conflicts detected.

---

## Sign-off

- [x] 19 routes verified (3 discovery, 5 CRUD, 5 membership, 2 moderator, 2 rules, 2 rooms)
- [x] All write routes require JWT auth
- [x] All routes have structured error logging with traceId
- [x] Discovery routes registered before parameterized /:slug
- [x] POST /leave added as alias alongside DELETE /leave
- [x] GET /:slug accepts both slug and UUID
- [x] No auth, JWT, or health endpoints modified

**Phase 2 — COMPLETE ✅**
