-- ============================================================
-- Loop V2 — Profile Region Fields
-- Region-First Discovery Engine — Phase 1
-- Owner: LILCKY STUDIO LIMITED
-- Applied: 2026-06-07
--
-- Adds four geographic columns to public.profiles:
--   country   — ISO-3166-1 alpha-2 (e.g. 'NG', 'GH', 'ZA')
--   state_id  — state/province slug (e.g. 'lagos', 'abuja-fct')
--   lga_id    — Local Government Area slug (e.g. 'alimosho')
--   lcda_id   — Local Council Development Area slug (e.g. 'mosan-okunola')
--
-- All columns nullable — existing rows unaffected. Populated during onboarding.
--
-- Index strategy: partial indexes (WHERE NOT NULL) keep sizes minimal.
-- Composite indexes cover the core discovery query pattern:
--   WHERE country = $1 [AND state_id = $2 [AND lga_id = $3 [AND lcda_id = $4]]]
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country  text,
  ADD COLUMN IF NOT EXISTS state_id text,
  ADD COLUMN IF NOT EXISTS lga_id   text,
  ADD COLUMN IF NOT EXISTS lcda_id  text;

-- country (broadest filter — mandatory for any regional discovery)
CREATE INDEX IF NOT EXISTS profiles_country_idx
  ON public.profiles (country)
  WHERE country IS NOT NULL;

-- country + state (state-level discovery pages)
CREATE INDEX IF NOT EXISTS profiles_region_state_idx
  ON public.profiles (country, state_id)
  WHERE country IS NOT NULL AND state_id IS NOT NULL;

-- country + state + lga (hyperlocal discovery)
CREATE INDEX IF NOT EXISTS profiles_region_lga_idx
  ON public.profiles (country, state_id, lga_id)
  WHERE country IS NOT NULL AND lga_id IS NOT NULL;

-- country + state + lga + lcda (finest grain)
CREATE INDEX IF NOT EXISTS profiles_region_lcda_idx
  ON public.profiles (country, state_id, lga_id, lcda_id)
  WHERE country IS NOT NULL AND lcda_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.country  IS 'ISO-3166-1 alpha-2 country code. Root of region-first discovery hierarchy.';
COMMENT ON COLUMN public.profiles.state_id IS 'State/province slug for regional scoping (e.g. lagos, abuja-fct).';
COMMENT ON COLUMN public.profiles.lga_id   IS 'Local Government Area slug for hyperlocal discovery (e.g. alimosho).';
COMMENT ON COLUMN public.profiles.lcda_id  IS 'Local Council Development Area slug — finest geographic grain.';
