-- 016_room_type.sql
-- Loop — Room Classification System (Civic Engine Phase 1)
-- Adds room_type ENUM (SOCIAL/CREATOR/CIVIC), verification_level, confirmation_count
-- LILCKY STUDIO LIMITED · 2026-06-11

CREATE TYPE public.room_type AS ENUM ('SOCIAL', 'CREATOR', 'CIVIC');

CREATE TYPE public.verification_level AS ENUM (
  'UNVERIFIED',
  'WITNESSED',
  'LOCALLY_VERIFIED',
  'OFFICIALLY_CONFIRMED'
);

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_type          public.room_type         NOT NULL DEFAULT 'SOCIAL',
  ADD COLUMN IF NOT EXISTS verification_level public.verification_level         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmation_count integer                  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_radius    integer                           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verified_region    text                              DEFAULT NULL;

-- Indexes for fast feed filtering per engine
CREATE INDEX IF NOT EXISTS rooms_room_type_idx     ON public.rooms(room_type);
CREATE INDEX IF NOT EXISTS rooms_type_live_idx     ON public.rooms(room_type, is_live) WHERE is_live = true;
CREATE INDEX IF NOT EXISTS rooms_civic_confirm_idx ON public.rooms(confirmation_count DESC) WHERE room_type = 'CIVIC';
CREATE INDEX IF NOT EXISTS rooms_creator_live_idx  ON public.rooms(audience_count DESC) WHERE room_type = 'CREATOR' AND is_live = true;

-- ROLLBACK:
-- ALTER TABLE public.rooms
--   DROP COLUMN IF EXISTS room_type,
--   DROP COLUMN IF EXISTS verification_level,
--   DROP COLUMN IF EXISTS confirmation_count,
--   DROP COLUMN IF EXISTS verified_radius,
--   DROP COLUMN IF EXISTS verified_region;
-- DROP TYPE IF EXISTS public.verification_level;
-- DROP TYPE IF EXISTS public.room_type;
