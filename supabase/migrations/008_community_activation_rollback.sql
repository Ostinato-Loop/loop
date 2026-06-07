-- ============================================================
-- 008_community_activation_rollback.sql
-- Rollback for: 008_community_activation.sql
-- Date:   2026-06-07
-- ============================================================

-- Step 1: Drop triggers
DROP TRIGGER IF EXISTS community_creator_momentum_updated_at ON public.community_creator_momentum;

-- Step 2: Drop RLS policies
DROP POLICY IF EXISTS "badges_select_public"             ON public.community_leader_badges;
DROP POLICY IF EXISTS "civic_verifications_select_public" ON public.civic_verifications;
DROP POLICY IF EXISTS "activation_events_select_own"     ON public.community_activation_events;
DROP POLICY IF EXISTS "momentum_select_public"           ON public.community_creator_momentum;

-- Step 3: Drop RPC functions
DROP FUNCTION IF EXISTS public.auto_join_regional_communities(UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_community_pulse(UUID);

-- Step 4: Drop indexes
DROP INDEX IF EXISTS idx_badges_community;
DROP INDEX IF EXISTS idx_badges_user;
DROP INDEX IF EXISTS idx_badges_type;
DROP INDEX IF EXISTS idx_civic_community;
DROP INDEX IF EXISTS idx_civic_profile;
DROP INDEX IF EXISTS idx_civic_type;
DROP INDEX IF EXISTS idx_activation_event_type;
DROP INDEX IF EXISTS idx_activation_user;
DROP INDEX IF EXISTS idx_activation_community;
DROP INDEX IF EXISTS idx_activation_daily;
DROP INDEX IF EXISTS idx_momentum_community;
DROP INDEX IF EXISTS idx_momentum_level;
DROP INDEX IF EXISTS idx_momentum_user;

-- Step 5: Drop tables (reverse dependency order)
DROP TABLE IF EXISTS public.community_creator_momentum  CASCADE;
DROP TABLE IF EXISTS public.community_activation_events CASCADE;
DROP TABLE IF EXISTS public.civic_verifications         CASCADE;
DROP TABLE IF EXISTS public.community_leader_badges     CASCADE;
