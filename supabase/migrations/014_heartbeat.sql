-- ============================================================
-- Loop — Migration 014: Room Heartbeat Column
-- DISCONNECT-001 (2026-06-10)
--
-- Adds last_heartbeat_at to rooms so the backup cron job
-- (and any monitoring query) can identify stale live rooms.
--
-- The Durable Object alarm is the primary recovery mechanism.
-- This column is the fallback for the cron belt-and-suspenders.
-- ============================================================

-- Add last_heartbeat_at to rooms
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

-- Index for the cron query: "live rooms with stale heartbeat"
CREATE INDEX IF NOT EXISTS idx_rooms_stale_live
  ON public.rooms(is_live, last_heartbeat_at)
  WHERE is_live = true;

-- Backfill: set last_heartbeat_at = created_at for all existing live rooms
-- (treats them as "just heartbeated" at creation time to avoid mass cleanup)
UPDATE public.rooms
SET last_heartbeat_at = created_at
WHERE is_live = true AND last_heartbeat_at IS NULL;
