-- Loop D1 — Retention Score Computation Views
-- Sprint: Hardening Phase 11 · 2026-06-12
-- SQLite-compatible views for room quality, host reliability, community health.
-- LILCKY STUDIO LIMITED

-- ── room_quality_scores (VIEW) ────────────────────────────────────────────────
-- Computed from room_analytics_summary. Normalized 0.0–1.0.
-- Weight: replay (30%) + peak listeners (30%) + duration/hr (20%) + shares (20%)
CREATE VIEW IF NOT EXISTS room_quality_scores AS
SELECT
  room_id,
  host_user_id,
  community_id,
  country,
  started_at,
  peak_listeners,
  duration_seconds,
  replay_count,
  share_count,
  -- Normalized components (max assumed values for normalization)
  MIN(1.0, CAST(peak_listeners AS REAL) / 100.0) AS listener_score,
  MIN(1.0, CAST(duration_seconds AS REAL) / 7200.0) AS duration_score,  -- max 2hr
  MIN(1.0, CAST(replay_count AS REAL) / 500.0) AS replay_score,
  MIN(1.0, CAST(share_count AS REAL) / 100.0) AS share_score,
  -- Composite quality score
  ROUND(
    (MIN(1.0, CAST(peak_listeners AS REAL) / 100.0) * 0.30) +
    (MIN(1.0, CAST(duration_seconds AS REAL) / 7200.0) * 0.20) +
    (MIN(1.0, CAST(replay_count AS REAL) / 500.0) * 0.30) +
    (MIN(1.0, CAST(share_count AS REAL) / 100.0) * 0.20),
  3) AS quality_score,
  -- Tier
  CASE
    WHEN (
      (MIN(1.0, CAST(peak_listeners AS REAL) / 100.0) * 0.30) +
      (MIN(1.0, CAST(duration_seconds AS REAL) / 7200.0) * 0.20) +
      (MIN(1.0, CAST(replay_count AS REAL) / 500.0) * 0.30) +
      (MIN(1.0, CAST(share_count AS REAL) / 100.0) * 0.20)
    ) >= 0.70 THEN 'top'
    WHEN (
      (MIN(1.0, CAST(peak_listeners AS REAL) / 100.0) * 0.30) +
      (MIN(1.0, CAST(duration_seconds AS REAL) / 7200.0) * 0.20) +
      (MIN(1.0, CAST(replay_count AS REAL) / 500.0) * 0.30) +
      (MIN(1.0, CAST(share_count AS REAL) / 100.0) * 0.20)
    ) >= 0.45 THEN 'good'
    WHEN (
      (MIN(1.0, CAST(peak_listeners AS REAL) / 100.0) * 0.30) +
      (MIN(1.0, CAST(duration_seconds AS REAL) / 7200.0) * 0.20) +
      (MIN(1.0, CAST(replay_count AS REAL) / 500.0) * 0.30) +
      (MIN(1.0, CAST(share_count AS REAL) / 100.0) * 0.20)
    ) >= 0.20 THEN 'average'
    ELSE 'low'
  END AS quality_tier
FROM room_analytics_summary
WHERE ended_at IS NOT NULL;

-- ── host_reliability_scores (TABLE) ───────────────────────────────────────────
-- Computed aggregate per host. Updated via background job (retention analytics worker).
CREATE TABLE IF NOT EXISTS host_reliability_scores (
  host_user_id    TEXT NOT NULL PRIMARY KEY,
  rooms_hosted    INTEGER NOT NULL DEFAULT 0,
  avg_peak_listeners  REAL NOT NULL DEFAULT 0.0,
  avg_duration_min    REAL NOT NULL DEFAULT 0.0,
  top_room_ratio      REAL NOT NULL DEFAULT 0.0,  -- fraction of rooms with quality_tier='top'
  audience_return_rate REAL NOT NULL DEFAULT 0.0,  -- % who come back to same host
  reliability_score   REAL NOT NULL DEFAULT 0.0,  -- 0.0–1.0 composite
  reliability_tier    TEXT NOT NULL DEFAULT 'new'
                        CHECK (reliability_tier IN ('new','emerging','reliable','top','elite')),
  last_computed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS host_reliability_score_idx ON host_reliability_scores(reliability_score DESC);
CREATE INDEX IF NOT EXISTS host_reliability_tier_idx  ON host_reliability_scores(reliability_tier);

-- ── community_health_scores (TABLE) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_health_scores (
  community_id    TEXT NOT NULL PRIMARY KEY,
  total_members   INTEGER NOT NULL DEFAULT 0,
  weekly_active   INTEGER NOT NULL DEFAULT 0,
  rooms_per_week  REAL NOT NULL DEFAULT 0.0,
  new_members_per_week REAL NOT NULL DEFAULT 0.0,
  d7_retention    REAL NOT NULL DEFAULT 0.0,   -- fraction of members active in 7 days
  flags_per_room  REAL NOT NULL DEFAULT 0.0,   -- content flag rate (penalty)
  health_score    REAL NOT NULL DEFAULT 0.0,   -- 0.0–1.0 composite
  health_tier     TEXT NOT NULL DEFAULT 'inactive'
                    CHECK (health_tier IN ('inactive','low','healthy','vibrant','thriving')),
  last_computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS community_health_score_idx ON community_health_scores(health_score DESC);
CREATE INDEX IF NOT EXISTS community_health_tier_idx  ON community_health_scores(health_tier);

-- ── retention_by_pillar (VIEW) ────────────────────────────────────────────────
-- Civic / Entertainment / Business breakdown using community tags
CREATE VIEW IF NOT EXISTS retention_by_pillar AS
SELECT
  COALESCE(
    CASE
      WHEN r.platform = 'civic'         THEN 'civic'
      WHEN r.platform = 'business'      THEN 'business'
      ELSE 'entertainment'
    END,
    'entertainment'
  ) AS pillar,
  COUNT(*)                          AS user_count,
  AVG(r.d1_retained)                AS avg_d1_retention,
  AVG(r.d7_retained)                AS avg_d7_retention,
  AVG(r.d30_retained)               AS avg_d30_retention,
  AVG(r.session_count)              AS avg_sessions,
  AVG(r.rooms_joined)               AS avg_rooms_joined,
  r.country
FROM retention_metrics r
GROUP BY pillar, r.country
ORDER BY pillar, r.country;
