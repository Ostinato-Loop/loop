-- ============================================================
-- Loop — Analytics Events Schema
-- Migration: 012_analytics.sql
-- Simple, reliable event tracking. No dashboards yet — just capture.
-- LILCKY STUDIO LIMITED — 2026-06-08
-- ============================================================

CREATE TABLE IF NOT EXISTS loop_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event       TEXT        NOT NULL,
  properties  JSONB       NOT NULL DEFAULT '{}',
  session_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the queries we'll actually run
CREATE INDEX IF NOT EXISTS idx_loop_events_user_created ON loop_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loop_events_event        ON loop_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loop_events_created      ON loop_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loop_events_session      ON loop_events (session_id) WHERE session_id IS NOT NULL;

-- RLS
ALTER TABLE loop_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "events_insert_own"
  ON loop_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own events
CREATE POLICY "events_select_own"
  ON loop_events FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can read all (for dashboards later)
CREATE POLICY "events_service_role_all"
  ON loop_events
  USING (auth.role() = 'service_role');

-- ── Daily Active Users view (simple count) ─────────────────────────
CREATE OR REPLACE VIEW daily_active_users AS
SELECT
  date_trunc('day', created_at) AS day,
  COUNT(DISTINCT user_id)       AS dau
FROM loop_events
GROUP BY 1
ORDER BY 1 DESC;

-- ── Signup funnel view ─────────────────────────────────────────────
CREATE OR REPLACE VIEW signup_funnel AS
SELECT
  date_trunc('day', created_at) AS day,
  event,
  COUNT(DISTINCT user_id)       AS users
FROM loop_events
WHERE event IN ('login', 'onboarding_complete', 'room_join', 'room_create')
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- ── Retention: did user return next day? ──────────────────────────
CREATE OR REPLACE VIEW d1_retention AS
WITH first_seen AS (
  SELECT user_id, MIN(date_trunc('day', created_at)) AS first_day
  FROM loop_events
  GROUP BY user_id
),
next_day AS (
  SELECT DISTINCT e.user_id
  FROM loop_events e
  JOIN first_seen f ON e.user_id = f.user_id
  WHERE date_trunc('day', e.created_at) = f.first_day + INTERVAL '1 day'
)
SELECT
  f.first_day,
  COUNT(*) AS cohort_size,
  COUNT(n.user_id) AS returned_next_day,
  ROUND(COUNT(n.user_id)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS d1_retention_pct
FROM first_seen f
LEFT JOIN next_day n ON f.user_id = n.user_id
GROUP BY 1
ORDER BY 1 DESC;
