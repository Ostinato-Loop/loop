-- Loop D1 — Retention Engine Schema
-- Sprint: Hardening Phase 11 · 2026-06-12
-- D1 (SQLite) tables for retention metrics.
-- Computes D1/D7/D30 retention for rooms, communities, users.
-- CleanupCoordinator Durable Object handles room cleanup.
-- LILCKY STUDIO LIMITED

-- ── retention_metrics — computed per-user retention state ────────────────────
CREATE TABLE IF NOT EXISTS retention_metrics (
  user_id         TEXT NOT NULL PRIMARY KEY,
  first_session   TEXT NOT NULL,          -- ISO timestamp
  last_session    TEXT,                    -- ISO timestamp
  session_count   INTEGER NOT NULL DEFAULT 1,
  rooms_joined    INTEGER NOT NULL DEFAULT 0,
  rooms_created   INTEGER NOT NULL DEFAULT 0,
  messages_sent   INTEGER NOT NULL DEFAULT 0,
  follows_count   INTEGER NOT NULL DEFAULT 0,
  d1_retained     INTEGER NOT NULL DEFAULT 0,  -- 1 if returned on day 1
  d7_retained     INTEGER NOT NULL DEFAULT 0,
  d30_retained    INTEGER NOT NULL DEFAULT 0,
  country         TEXT,
  platform        TEXT,  -- ios, android, web
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS retention_metrics_last_session_idx ON retention_metrics(last_session);
CREATE INDEX IF NOT EXISTS retention_metrics_country_idx      ON retention_metrics(country);

-- ── daily_active_users — aggregated DAU for analytics ────────────────────────
CREATE TABLE IF NOT EXISTS daily_active_users (
  date            TEXT NOT NULL,           -- YYYY-MM-DD
  country         TEXT NOT NULL DEFAULT 'ALL',
  platform        TEXT NOT NULL DEFAULT 'ALL',
  dau             INTEGER NOT NULL DEFAULT 0,
  new_users       INTEGER NOT NULL DEFAULT 0,
  returning_users INTEGER NOT NULL DEFAULT 0,
  rooms_created   INTEGER NOT NULL DEFAULT 0,
  rooms_joined    INTEGER NOT NULL DEFAULT 0,
  messages_sent   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, country, platform)
);

CREATE INDEX IF NOT EXISTS daily_active_users_date_idx    ON daily_active_users(date DESC);
CREATE INDEX IF NOT EXISTS daily_active_users_country_idx ON daily_active_users(country);

-- ── room_analytics_summary — aggregated per-room stats ───────────────────────
CREATE TABLE IF NOT EXISTS room_analytics_summary (
  room_id           TEXT NOT NULL PRIMARY KEY,
  peak_listeners    INTEGER NOT NULL DEFAULT 0,
  total_listeners   INTEGER NOT NULL DEFAULT 0,
  duration_seconds  INTEGER NOT NULL DEFAULT 0,
  replay_count      INTEGER NOT NULL DEFAULT 0,
  share_count       INTEGER NOT NULL DEFAULT 0,
  country           TEXT,
  community_id      TEXT,
  host_user_id      TEXT,
  started_at        TEXT,
  ended_at          TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS room_analytics_community_idx ON room_analytics_summary(community_id);
CREATE INDEX IF NOT EXISTS room_analytics_host_idx      ON room_analytics_summary(host_user_id);
CREATE INDEX IF NOT EXISTS room_analytics_started_idx   ON room_analytics_summary(started_at DESC);

-- ── cleanup_schedule — room cleanup queue for CleanupCoordinator ─────────────
CREATE TABLE IF NOT EXISTS cleanup_schedule (
  id            TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  room_id       TEXT NOT NULL UNIQUE,
  scheduled_at  TEXT NOT NULL,           -- when to clean up
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS cleanup_schedule_status_idx    ON cleanup_schedule(status, scheduled_at);

-- ── content_flags — moderation queue ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_flags (
  id            TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  content_type  TEXT NOT NULL CHECK (content_type IN ('room','message','community','user','profile')),
  content_id    TEXT NOT NULL,
  reporter_id   TEXT,
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','reviewed','actioned','dismissed')),
  reviewed_by   TEXT,
  reviewed_at   TEXT,
  action_taken  TEXT,
  metadata      TEXT NOT NULL DEFAULT '{}',  -- JSON
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS content_flags_status_idx      ON content_flags(status, created_at);
CREATE INDEX IF NOT EXISTS content_flags_content_idx     ON content_flags(content_type, content_id);
