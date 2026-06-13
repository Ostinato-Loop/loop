-- Migration 019: client_errors table
-- Stores client-side crash reports fired by ErrorBoundary.componentDidCatch via
-- POST /api/errors (worker route client-errors.ts, CRASH-001 2026-06-13).
-- Primary record is always Cloudflare Workers logs; this table is secondary /
-- persistent storage so crashes can be queried after log rotation.
--
-- RLS: only the service role can insert (worker does all writes).
--      No SELECT policy — crashes are internal operational data.
-- LILCKY STUDIO LIMITED

CREATE TABLE IF NOT EXISTS public.client_errors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error           text          NOT NULL,
  component_stack text,
  url             text,
  ua              text,
  app_version     text,
  ip_country      text,
  occurred_at     timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- Retention index: prune old rows by created_at in a future job
CREATE INDEX IF NOT EXISTS client_errors_created_at_idx
  ON public.client_errors (created_at DESC);

-- Row-level security: enabled, no SELECT/UPDATE/DELETE policies.
-- Only the service role (used by the worker) can insert.
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- Drop the policy first so this migration is idempotent
DROP POLICY IF EXISTS "service_role_insert" ON public.client_errors;

CREATE POLICY "service_role_insert"
  ON public.client_errors
  FOR INSERT
  TO service_role
  WITH CHECK (true);
