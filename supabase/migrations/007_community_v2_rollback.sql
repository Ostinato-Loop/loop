-- ============================================================
-- 007_community_v2_rollback.sql
-- Rollback for: 007_community_v2_schema.sql
-- Date:   2026-06-07
--
-- USAGE: Run this ONLY to revert 007_community_v2_schema.sql.
--        Run BEFORE any dependent migrations are applied.
--
-- ORDER OF OPERATIONS (reverse of migration):
--   1. Drop triggers on new tables
--   2. Drop trigger functions
--   3. Drop RLS policies on new tables
--   4. Drop new tables (CASCADE handles FK refs)
--   5. Drop new indexes on communities
--   6. Drop new constraints on communities
--   7. Drop new columns from communities
-- ============================================================

-- Step 1: Drop triggers
DROP TRIGGER IF EXISTS trigger_community_member_count ON public.community_members;
DROP TRIGGER IF EXISTS community_rules_updated_at     ON public.community_rules;
DROP TRIGGER IF EXISTS community_moderators_updated_at ON public.community_moderators;

-- Step 2: Drop trigger function (keep handle_updated_at — it's system-wide)
DROP FUNCTION IF EXISTS public.sync_community_member_count();

-- Step 3: Drop RLS policies on new tables
DROP POLICY IF EXISTS "cmods_select_members" ON public.community_moderators;
DROP POLICY IF EXISTS "crules_select_public" ON public.community_rules;

-- Step 4: Drop new tables
DROP TABLE IF EXISTS public.community_moderators CASCADE;
DROP TABLE IF EXISTS public.community_rules      CASCADE;

-- Step 5: Drop new indexes on communities
DROP INDEX IF EXISTS idx_communities_type;
DROP INDEX IF EXISTS idx_communities_region_id;
DROP INDEX IF EXISTS idx_communities_country_code;
DROP INDEX IF EXISTS idx_communities_civic;
DROP INDEX IF EXISTS idx_communities_interest_tags;
DROP INDEX IF EXISTS idx_communities_health;

-- Step 6: Drop new constraints on communities
ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS civic_must_be_regional,
  DROP CONSTRAINT IF EXISTS regional_must_have_region_id;

-- Step 7: Drop new columns from communities (safe — all additive in migration)
ALTER TABLE public.communities
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS region_id,
  DROP COLUMN IF EXISTS region_scope,
  DROP COLUMN IF EXISTS country_code,
  DROP COLUMN IF EXISTS is_civic,
  DROP COLUMN IF EXISTS active_room_count,
  DROP COLUMN IF EXISTS health_score,
  DROP COLUMN IF EXISTS interest_tags,
  DROP COLUMN IF EXISTS is_system,
  DROP COLUMN IF EXISTS is_suspended,
  DROP COLUMN IF EXISTS is_deleted;

-- Verification query — should return 0 rows after rollback:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'communities' AND column_name IN
--   ('type','region_id','region_scope','country_code','is_civic',
--    'active_room_count','health_score','interest_tags','is_system',
--    'is_suspended','is_deleted');
