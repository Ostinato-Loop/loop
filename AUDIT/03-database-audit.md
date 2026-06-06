# AUDIT/03 — Loop Database Audit
**Date:** 2026-06-06 | **Auditor:** RALD CTO | **Method:** Migration file inspection  
**Scope:** Supabase PostgreSQL schema, migrations, D1, RLS, indexing | **Repo:** Ostinato-Loop/loop

---

## Supabase Instance
| Parameter | Value |
|---|---|
| Project URL | https://onxdcikfttdmnhofsuwo.supabase.co |
| Pool | aws-0-eu-west-1.pooler.supabase.com:6543 |
| Region | eu-west-1 (Ireland) |
| Status | Live ✅ (Worker successfully queries it) |

---

## Migration State

| File | Description | Applied |
|---|---|---|
| 001_initial_schema.sql | profiles, rooms, participants, messages, reactions + RLS | Inferred applied |
| 002_notifications_friend_requests.sql | friend_requests, notifications, triggers | Inferred applied |
| 003_repair_missing_tables.sql | Full idempotent repair of all tables + RLS | **Explicitly: "APPLIED TO PRODUCTION 2026-06-05"** |

Migration 003 includes `DROP TABLE IF EXISTS notifications CASCADE` — all prior notification data was wiped on application.

No automated migration runner in CI — no verification that all migrations are applied before deploy.

---

## Tables (all confirmed applied via migration 003)

| Table | PK | FK | Triggers | Indexes | RLS |
|---|---|---|---|---|---|
| profiles | User-provided UUID (= RALD ID) | None | handle_updated_at | username UNIQUE | ⚠️ USING(true) |
| rooms | Generated UUID | profiles(id) host_id | handle_updated_at | 4 indexes | ⚠️ USING(true) |
| room_participants | Generated UUID | rooms(id), profiles(id) | None | 2 + UNIQUE | ⚠️ USING(true) |
| room_messages | Generated UUID | rooms(id), profiles(id) | None | 1 index | ⚠️ USING(true) |
| room_reactions | Generated UUID | rooms(id), profiles(id) | None | 1 index | ⚠️ USING(true) |
| friend_requests | Generated UUID | profiles(id) x2 | handle_updated_at + 2 notify triggers | 2 + UNIQUE | ⚠️ USING(true) |
| notifications | Generated UUID | profiles(id) x2 | None | 4 indexes | ⚠️ USING(true) |

Extensions: `uuid-ossp` ✅ | `pg_trgm` ✅ (installed, no trigram indexes applied yet)

---

## DB-003 — MEDIUM: rooms.category CHECK Mismatches Frontend Phase H Categories

**Schema CHECK constraint:**
```sql
CHECK (category IN ('sports','civic','music','entertainment','news','general'))
```

**Frontend Phase H categories (from audit blockers report):**
`community | news | commentary | radio | dj-session | education | business | general`

Only `news` and `general` overlap. Creating a room with category `commentary`, `radio`, `dj-session`, `education`, `community`, or `business` will return HTTP 400 from Supabase.

**Required migration:**
```sql
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_category_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_category_check
  CHECK (category IN (
    'sports','civic','music','entertainment','news','general',
    'community','commentary','radio','dj-session','education','business'
  ));
```

---

## DB-001 — MEDIUM: Potential Duplicate Notification Triggers

Migration 002 creates: `tr_notify_friend_request`, `tr_notify_connection_accepted`  
Migration 003 creates: `on_friend_request_created`, `on_friend_request_accepted`  
Migration 003 only drops its own names — 002 triggers may still be active.

**Result: Double notifications on every friend request and acceptance.**

Verify in Supabase SQL editor:
```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
```
If 4 triggers appear on friend_requests → immediately drop the 002 triggers:
```sql
DROP TRIGGER IF EXISTS tr_notify_friend_request ON public.friend_requests;
DROP TRIGGER IF EXISTS tr_notify_connection_accepted ON public.friend_requests;
```

---

## DB-002 — LOW: Cloudflare D1 (loop-db) Provisioned But Unused

| Parameter | Value |
|---|---|
| Database Name | loop-db |
| Database ID | 4616fcac-96e0-4150-a42f-3d020f45cd1d |
| In CloudflareEnv | Yes (`DB: D1Database`) |
| Routes that use `env.DB` | **None** |
| Schema applied | **None** — no D1 migration files in repo |
| Cost | Monthly D1 storage cost incurred |

Recommendation: Remove binding from wrangler.toml or define explicit purpose and apply schema.

---

## DB-004 — MEDIUM: No Migration Verification in CI

ci.yml runs: lint, typecheck, tests, security-audit. No migration step.  
Risk: schema change committed but not applied → runtime errors in production with no pre-deploy warning.

Recommended CI step:
```yaml
- name: Check Pending Migrations
  run: supabase db push --dry-run
  env:
    SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
    SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
```

---

## DB-005 — MEDIUM: Realtime Publication Not Fully Verified

Migration 002 adds `notifications` + `friend_requests` to `supabase_realtime`.  
room_messages, room_participants, room_reactions must also be in the publication for room.tsx to receive events.

**Verify:** Supabase Dashboard → Database → Replication → supabase_realtime → Tables.

---

## PERF-005: audience_count Never Updated (Functional Bug)

`rooms.audience_count` is the primary sort column in GET /api/rooms but is never updated by any code path.  
All rooms perpetually show `audience_count = 0`. Room discovery ordering is meaningless.

**Fix — Supabase trigger:**
```sql
CREATE OR REPLACE FUNCTION public.update_room_audience_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.rooms SET audience_count = (
    SELECT COUNT(*) FROM public.room_participants
    WHERE room_id = COALESCE(NEW.room_id, OLD.room_id)
  ) WHERE id = COALESCE(NEW.room_id, OLD.room_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_participant_change ON public.room_participants;
CREATE TRIGGER on_participant_change
  AFTER INSERT OR DELETE ON public.room_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_room_audience_count();
```

---

## Missing Indexes

| Table | Missing Index | Impact |
|---|---|---|
| room_messages | (room_id, created_at DESC) | Pagination will full-scan at scale |
| room_messages | user_id | Per-user message history slow |
| rooms | scheduled_at | Upcoming rooms query slow |

---

## RLS Status

All policies: `USING (true)` — no effective row-level protection on any table.  
See AUDIT/02 SEC-005 for full analysis and required policy replacements.

**Note:** The Worker uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS regardless.  
RLS only matters when frontend uses anon key + user session (standard Supabase pattern).  
Currently the frontend uses the Supabase client — if configured with anon key, these policies fire.
