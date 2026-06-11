-- 017_civic_engine.sql
-- Loop — Civic Engine tables
-- civic_confirmations: witness confirmations for civic rooms
-- civic_trust_scores: per-user civic trust score
-- LILCKY STUDIO LIMITED · 2026-06-11

CREATE TABLE IF NOT EXISTS public.civic_confirmations (
  id            uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id       uuid         NOT NULL REFERENCES public.rooms(id)    ON DELETE CASCADE,
  confirmer_id  uuid         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  confirmed_at  timestamptz  NOT NULL DEFAULT now(),
  region        text,
  UNIQUE(room_id, confirmer_id)
);

CREATE INDEX IF NOT EXISTS civic_conf_room_idx      ON public.civic_confirmations(room_id);
CREATE INDEX IF NOT EXISTS civic_conf_confirmer_idx ON public.civic_confirmations(confirmer_id);

CREATE OR REPLACE FUNCTION public.sync_confirmation_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.rooms SET confirmation_count = confirmation_count + 1 WHERE id = NEW.room_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.rooms SET confirmation_count = GREATEST(0, confirmation_count - 1) WHERE id = OLD.room_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_confirmation_count ON public.civic_confirmations;
CREATE TRIGGER trg_sync_confirmation_count
  AFTER INSERT OR DELETE ON public.civic_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.sync_confirmation_count();

CREATE TABLE IF NOT EXISTS public.civic_trust_scores (
  user_id              uuid    PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  score                integer NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  confirmations_given  integer NOT NULL DEFAULT 0,
  accurate_reports     integer NOT NULL DEFAULT 0,
  abuse_reports        integer NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.civic_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.civic_trust_scores  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "civic_conf_select" ON public.civic_confirmations FOR SELECT USING (true);
CREATE POLICY "civic_conf_insert" ON public.civic_confirmations FOR INSERT
  WITH CHECK (confirmer_id = auth.uid());
CREATE POLICY "civic_conf_delete" ON public.civic_confirmations FOR DELETE
  USING (confirmer_id = auth.uid());

CREATE POLICY "civic_trust_select" ON public.civic_trust_scores FOR SELECT USING (true);
CREATE POLICY "civic_trust_service" ON public.civic_trust_scores FOR ALL
  USING (auth.role() = 'service_role');

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.civic_trust_scores;
-- DROP TABLE IF EXISTS public.civic_confirmations;
-- DROP FUNCTION IF EXISTS public.sync_confirmation_count();
