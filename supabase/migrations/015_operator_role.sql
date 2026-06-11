-- ============================================================
-- Loop — Migration 015: Operator Role Column
-- OPERATOR-001 (2026-06-11)
--
-- Adds is_operator to profiles so the Loop Cloudflare Worker
-- can gate /api/metrics/* to internal operators without
-- requiring a special JWT role claim.
--
-- Access resolution in requireOperator() middleware:
--   1. JWT role === "operator"          (zero I/O)
--   2. KV cache operator:<user-id>      (~1 ms, TTL 5 min)
--   3. profiles.is_operator = true      (~50 ms, then cached)
--
-- To grant operator access:
--   UPDATE public.profiles
--   SET is_operator = true
--   WHERE id = '<user-id>';
--
-- To revoke (KV cache clears within 5 min):
--   UPDATE public.profiles
--   SET is_operator = false
--   WHERE id = '<user-id>';
-- ============================================================

-- Add is_operator column (safe: no-op if already exists)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_operator boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_operator IS
  'Grants access to /api/metrics/* operator dashboard. '
  'Set via direct SQL — not exposed to end-user UI.';

-- Partial index — only indexes the rare rows where is_operator = true,
-- so the Worker lookup (WHERE id = X AND is_operator = true) stays fast
-- even with millions of profile rows.
CREATE INDEX IF NOT EXISTS idx_profiles_operator
  ON public.profiles(id)
  WHERE is_operator = true;
