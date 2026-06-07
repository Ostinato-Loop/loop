-- ============================================================
-- Migration 010: Feedback / Bug Reports Table
-- Loop V1 Stabilization — P0-FIX-003
-- ============================================================
-- Stores user-submitted bug reports from the "Report a problem" UI.
-- Inserted by the Cloudflare Worker via service role key.
-- RLS restricts SELECT to the submitting user only.

CREATE TABLE IF NOT EXISTS feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  message     text        NOT NULL CHECK (char_length(message) BETWEEN 5 AND 2000),
  page        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id    ON feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users can read their own submissions
CREATE POLICY "feedback_select_own"
  ON feedback FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT is performed exclusively by the Worker using the service_role key,
-- which bypasses RLS — no INSERT policy needed here.
