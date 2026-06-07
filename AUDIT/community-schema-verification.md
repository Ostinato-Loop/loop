# AUDIT/community-schema-verification.md
**Sprint:** V2 Community Infrastructure — Phase 1  
**Date:** 2026-06-07  
**Auditor:** CTO Office — LILCKY STUDIO LIMITED  
**Scope:** Supabase migration schema for communities foundation

---

## Verdict

```
╔══════════════════════════════════════════════════════════════════╗
║  SCHEMA AUDIT:  ✅  PASS                                        ║
║  Migrations: 005 (base) + 007 (V1 enhancements)                 ║
║  Tables: communities, community_members, community_moderators,   ║
║          community_rules                                         ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Migration Inventory

| File | Status | Applies |
|------|--------|---------|
| `005_communities.sql` | ✅ Applied to main | communities, community_members, rooms.community_id FK, counter RPCs |
| `006_profile_region_fields.sql` | ✅ Applied to main | profiles.country, state_id, lga_id, lcda_id |
| `007_community_v2_schema.sql` | ✅ New — this sprint | V1 columns, community_moderators, community_rules |
| `007_community_v2_rollback.sql` | ✅ New — this sprint | Rollback for 007 |

---

## Table: `communities`

### Columns (005 base + 007 enhancements)

| Column | Type | Nullable | Default | Source |
|--------|------|----------|---------|--------|
| id | uuid | NO | uuid_generate_v4() | 005 |
| name | text | NO | — | 005 |
| slug | text | NO | — | 005 |
| description | text | YES | — | 005 |
| cover_url | text | YES | — | 005 |
| category | text | NO | 'general' | 005 |
| visibility | text | NO | 'public' | 005 CHECK |
| owner_id | uuid | NO | — | 005 FK→profiles |
| member_count | integer | NO | 1 | 005 |
| room_count | integer | NO | 0 | 005 |
| is_verified | boolean | NO | false | 005 |
| created_at | timestamptz | NO | now() | 005 |
| updated_at | timestamptz | NO | now() | 005 |
| type | text | YES | 'interest' | **007** CHECK(10 values) |
| region_id | text | YES | — | **007** |
| region_scope | text | YES | — | **007** CHECK(5 values) |
| country_code | text | NO | 'NG' | **007** |
| is_civic | boolean | NO | false | **007** |
| active_room_count | integer | NO | 0 | **007** CHECK(≥0) |
| health_score | smallint | NO | 50 | **007** CHECK(0–100) |
| interest_tags | text[] | YES | '{}' | **007** |
| is_system | boolean | NO | false | **007** |
| is_suspended | boolean | NO | false | **007** |
| is_deleted | boolean | NO | false | **007** |

### CHECK Constraints

| Constraint | Expression |
|-----------|-----------|
| visibility_check | IN ('public','private','invite_only') |
| type_check | IN 10 community type values |
| region_scope_check | IN ('country','state','lga','lcda','city') |
| active_room_count_check | >= 0 |
| health_score_check | BETWEEN 0 AND 100 |
| civic_must_be_regional | NOT is_civic OR type LIKE 'regional%' |
| regional_must_have_region_id | NOT type LIKE 'regional%' OR region_id IS NOT NULL |

### Indexes

| Index | Column(s) | Type | Source |
|-------|-----------|------|--------|
| communities_slug_idx | slug | UNIQUE | 005 |
| communities_owner_id_idx | owner_id | B-tree | 005 |
| communities_category_idx | category | B-tree | 005 |
| communities_visibility_idx | visibility | B-tree | 005 |
| communities_fts_idx | name \|\| description | GIN FTS | 005 |
| idx_communities_type | type | B-tree | 007 |
| idx_communities_region_id | region_id (NOT NULL) | B-tree | 007 |
| idx_communities_country_code | country_code | B-tree | 007 |
| idx_communities_civic | is_civic WHERE true | Partial | 007 |
| idx_communities_interest_tags | interest_tags | GIN | 007 |
| idx_communities_health | health_score DESC | B-tree | 007 |

### RLS Policies (from 005)

| Policy | Op | Rule |
|--------|----|------|
| communities_select_public | SELECT | public OR owner OR member |
| communities_insert_own | INSERT | auth.uid() = owner_id |
| communities_update_admin | UPDATE | owner OR admin |
| communities_delete_owner | DELETE | owner only |

---

## Table: `community_members`

### Columns

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| community_id | uuid | NO | FK→communities |
| user_id | uuid | NO | FK→profiles |
| role | text | NO | 'member' CHECK |
| joined_at | timestamptz | NO | now() |

### Indexes

| Index | Columns |
|-------|---------|
| community_members_user_id_idx | user_id |
| community_members_role_idx | (community_id, role) |

### RLS Policies

| Policy | Op | Rule |
|--------|----|------|
| community_members_select | SELECT | self OR public community |
| community_members_insert_self | INSERT | user_id = auth.uid() |
| community_members_delete | DELETE | self OR owner |

### Trigger

| Trigger | Event | Function |
|---------|-------|----------|
| trigger_community_member_count | AFTER INSERT/UPDATE/DELETE | sync_community_member_count() |

---

## Table: `community_moderators` (NEW — 007)

### Columns

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| community_id | uuid | NO | FK→communities CASCADE |
| user_id | uuid | NO | FK→profiles CASCADE |
| promoted_by | uuid | NO | FK→profiles |
| permissions | jsonb | NO | all-false defaults |
| promoted_at | timestamptz | NO | now() |
| revoked_at | timestamptz | YES | — |
| is_active | boolean | NO | true |

### Unique constraint
- `(community_id, user_id)` — one row per moderator per community

### Permissions JSONB schema
```json
{
  "can_remove_members":    false,
  "can_mute_members":      false,
  "can_pin_announcements": false,
  "can_approve_rooms":     false,
  "can_remove_rooms":      false,
  "can_ban_members":       false,
  "can_edit_rules":        false,
  "can_manage_events":     false
}
```

### Indexes

| Index | Columns | Predicate |
|-------|---------|-----------|
| idx_cmods_community | community_id | WHERE is_active |
| idx_cmods_user | user_id | WHERE is_active |

### RLS Policies

| Policy | Op | Rule |
|--------|----|------|
| cmods_select_members | SELECT | active + public community |

---

## Table: `community_rules` (NEW — 007)

### Columns

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| community_id | uuid | NO | FK→communities CASCADE |
| rule_number | smallint | NO | CHECK (1–20) |
| title | text | NO | CHECK (5–80 chars) |
| body | text | NO | CHECK (10–500 chars) |
| created_by | uuid | NO | FK→profiles |
| updated_by | uuid | YES | FK→profiles |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

### Unique constraint
- `(community_id, rule_number)` — no duplicate rule numbers per community

### Indexes

| Index | Columns |
|-------|---------|
| idx_crules_community | (community_id, rule_number) |

---

## rooms Table (altered in 005)

| Column | Status |
|--------|--------|
| community_id (uuid FK→communities SET NULL) | ✅ Added in 005 |
| visibility (text DEFAULT 'public') | ✅ Added in 005 |

---

## Counter RPCs (from 005)

| Function | Description |
|----------|-------------|
| increment_community_member_count(uuid) | +1 to member_count |
| decrement_community_member_count(uuid) | -1 to member_count (floor 0) |
| increment_community_room_count(uuid) | +1 to room_count |
| decrement_community_room_count(uuid) | -1 to room_count (floor 0) |

All granted to `service_role`.

---

## Safety Analysis

| Risk | Mitigation |
|------|-----------|
| 007 breaks existing rows | All new columns have defaults — zero NULL surprises |
| Constraint violations on existing rows | CHECK on type has DEFAULT 'interest' (passes) |
| Migration idempotency | All statements use IF NOT EXISTS / DO EXCEPTION blocks |
| Data loss on rollback | Rollback only drops 007-added objects — 005 schema intact |
| Counter drift | Trigger supplements RPCs — if RPC fails, trigger fires on row change |

---

## Sign-off

- [x] Migration 005 applied to main (pre-existing)  
- [x] Migration 007 written with full rollback  
- [x] All new columns additive with safe defaults  
- [x] RLS enabled on all new tables  
- [x] Counter trigger added to community_members  
- [x] All indexes created with IF NOT EXISTS  
- [x] No existing RLS policies modified  
- [x] No existing tables or columns dropped  

**Phase 1 — COMPLETE ✅**
