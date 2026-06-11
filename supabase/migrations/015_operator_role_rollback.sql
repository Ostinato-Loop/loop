-- ============================================================
-- Loop — Migration 015 ROLLBACK: Operator Role Column
-- OPERATOR-001 (2026-06-11)
-- ============================================================

DROP INDEX IF EXISTS public.idx_profiles_operator;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS is_operator;
