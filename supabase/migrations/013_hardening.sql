-- ============================================================
-- Loop — Migration 013: Infrastructure Hardening
-- HARDENING-001 (2026-06-10)
--
-- Addresses all critical and high-priority findings from the
-- pre-beta infrastructure audit:
--
--   1. Resolve follows table conflict (008 vs 011 have different PKs)
--   2. Add missing performance indexes (rooms, notifications, community_members)
--   3. Add duplicate room prevention (unique on host_id + title while live)
--   4. Add orphan cleanup for dangling community_members
--   5. Add composite index on notifications for inbox query performance
--   6. Mark push_subscriptions as OneSignal-superseded (column comment)
--   7. Add missing FK index on rooms.host_id
--   8. Add updated_at column to rooms if missing
-- ============================================================

-- ── 1. Follows table conflict resolution ──────────────────────────────
-- Migration 008 created public.follows with (id uuid, follower_id, following_id, unique(f,f))
-- Migration 011 created follows (without schema prefix) with composite PK (follower_id, following_id)
-- If 011 ran after 008, the IF NOT EXISTS skips creation — the 008 table wins.
-- If only 011 ran, we have a composite PK table without the `id` column.
-- We normalise: ensure the `id` column exists and the unique constraint exists.

DO $$ BEGIN
  -- Add id column if missing (handles case where 011 ran but 008 didn't)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'follows'
      AND column_name  = 'id'
  ) THEN
    ALTER TABLE public.follows ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
  END IF;
END $$;

-- Ensure the unique constraint exists regardless of which migration created the table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'follows_follower_id_following_id_key'
      AND conrelid = 'public.follows'::regclass
  ) THEN
    ALTER TABLE public.follows ADD CONSTRAINT follows_follower_id_following_id_key
      UNIQUE (follower_id, following_id);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Ensure self-follow constraint exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'follows_no_self_follow'
      AND conrelid = 'public.follows'::regclass
  ) THEN
    ALTER TABLE public.follows ADD CONSTRAINT follows_no_self_follow
      CHECK (follower_id <> following_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Performance indexes — rooms ────────────────────────────────────
-- The rooms.host_id FK has no index — JOIN on host_id for profile enrichment
-- does a full seq scan on every room listing.
CREATE INDEX IF NOT EXISTS idx_rooms_host_id
  ON public.rooms(host_id);

-- Composite for feed query: live rooms sorted by audience, most recent first
CREATE INDEX IF NOT EXISTS idx_rooms_live_audience
  ON public.rooms(is_live DESC, audience_count DESC, created_at DESC)
  WHERE visibility = 'public';

-- Community room listing
CREATE INDEX IF NOT EXISTS idx_rooms_community_live
  ON public.rooms(community_id, is_live DESC, created_at DESC)
  WHERE visibility = 'public';

-- ── 3. Duplicate room prevention ──────────────────────────────────────
-- A host cannot have two live rooms with the same title simultaneously.
-- Partial unique index: only applies while is_live = true.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_no_duplicate_live
  ON public.rooms(host_id, title)
  WHERE is_live = true;

-- ── 4. Performance indexes — community_members ────────────────────────
-- Membership lookup: "is this user a member of this community?"
CREATE INDEX IF NOT EXISTS idx_community_members_user_community
  ON public.community_members(user_id, community_id);

-- Role-based listing
CREATE INDEX IF NOT EXISTS idx_community_members_community_role
  ON public.community_members(community_id, role);

-- ── 5. Performance indexes — notifications ────────────────────────────
-- Inbox query: all unread for a recipient, newest first
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications(recipient_id, created_at DESC)
  WHERE read_at IS NULL;

-- Count badge query
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type
  ON public.notifications(recipient_id, type)
  WHERE read_at IS NULL;

-- ── 6. Orphan cleanup — dangling community_members ────────────────────
-- Remove community_members rows where the community no longer exists
DELETE FROM public.community_members cm
WHERE NOT EXISTS (
  SELECT 1 FROM public.communities c WHERE c.id = cm.community_id
);

-- Remove community_members rows where the user profile no longer exists
DELETE FROM public.community_members cm
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id
);

-- ── 7. Orphan cleanup — dangling room_participants ────────────────────
-- Remove participants for rooms that no longer exist
DELETE FROM public.room_participants rp
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms r WHERE r.id = rp.room_id
);

-- ── 8. rooms.updated_at — add if missing ─────────────────────────────
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION public.rooms_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rooms_updated_at ON public.rooms;
CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE PROCEDURE public.rooms_updated_at();

-- ── 9. push_subscriptions — annotation ───────────────────────────────
-- This table was created for VAPID-based Web Push (RFC 8292).
-- As of PUSH-001 (2026-06-10), Loop uses OneSignal instead.
-- OneSignal manages its own subscription registry — this table is no longer
-- written to by the application. It is retained for audit purposes.
-- Safe to drop once OneSignal adoption is confirmed in production.
COMMENT ON TABLE public.push_subscriptions IS
  'Superseded by OneSignal (PUSH-001 2026-06-10). No longer written by application. Retain for audit.';

-- ── 10. Backfill follows denorm counts ───────────────────────────────
-- If any counts are off from the conflict in 008/011, backfill them.
UPDATE public.profiles p
SET follower_count = (
  SELECT count(*) FROM public.follows f WHERE f.following_id = p.id
)
WHERE follower_count != (
  SELECT count(*) FROM public.follows f WHERE f.following_id = p.id
);

UPDATE public.profiles p
SET following_count = (
  SELECT count(*) FROM public.follows f WHERE f.follower_id = p.id
)
WHERE following_count != (
  SELECT count(*) FROM public.follows f WHERE f.follower_id = p.id
);

