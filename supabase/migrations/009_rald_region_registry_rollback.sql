-- ============================================================
-- 009_rald_region_registry_rollback.sql
-- Rollback for: 009_rald_region_registry.sql
-- Date: 2026-06-07
-- ============================================================

DROP POLICY   IF EXISTS "rald_regions_public_read" ON public.rald_regions;
DROP FUNCTION IF EXISTS public.search_region(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.get_region_by_id(UUID);
DROP INDEX    IF EXISTS idx_rald_regions_name_trgm;
DROP INDEX    IF EXISTS idx_rald_regions_label_trgm;
DROP INDEX    IF EXISTS idx_rald_regions_region;
DROP INDEX    IF EXISTS idx_rald_regions_type;
DROP TABLE    IF EXISTS public.rald_regions CASCADE;
-- Note: pg_trgm extension is NOT dropped — it may be used by other tables.
