-- ============================================================
-- Migration 011: Relationship Graph — Follows
-- Loop User Reality Sprint — Relationship Graph API
-- ============================================================
-- Tracks who follows whom on Loop.
-- Composite primary key (follower_id, following_id) prevents duplicates.
-- RLS: counts are public; follow/unfollow requires auth as the follower.
-- LILCKY STUDIO LIMITED · 2026-06-07

CREATE TABLE IF NOT EXISTS follows (
  follower_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower  ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);
CREATE INDEX IF NOT EXISTS idx_follows_created   ON follows (created_at DESC);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Anyone can see follow counts (needed for public profile stats)
CREATE POLICY "follows_select_public"
  ON follows FOR SELECT
  USING (true);

-- Only the authenticated follower can insert their own follows
CREATE POLICY "follows_insert_own"
  ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- Only the authenticated follower can delete their own follows
CREATE POLICY "follows_delete_own"
  ON follows FOR DELETE
  USING (auth.uid() = follower_id);
