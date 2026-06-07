-- ============================================================
-- 007_community_v2_schema.sql
-- Sprint: V2 Community Infrastructure — Phase 1
-- Date:   2026-06-07
-- Author: CTO Office — LILCKY STUDIO LIMITED
--
-- WHAT THIS MIGRATION DOES:
--   1. Enhances the existing `communities` table with V1 architecture
--      columns (type, region, civic flag, health score, interest tags)
--   2. Creates `community_moderators` — granular permission JSONB
--   3. Creates `community_rules` — numbered rules per community
--   4. Adds performance indexes for all new query patterns
--   5. Enables RLS and adds policies for new tables
--   6. Adds member count TRIGGER (supplements existing RPC functions)
--
-- SAFETY GUARANTEES:
--   • All ALTER TABLE use ADD COLUMN IF NOT EXISTS — idempotent
--   • All CREATE TABLE use IF NOT EXISTS — idempotent
--   • All CREATE INDEX use IF NOT EXISTS — idempotent
--   • All new columns have sensible defaults — no NULL constraint surprises
--   • No existing tables dropped, no existing columns modified
--   • No existing RLS policies touched (004_rls_hardening.sql unchanged)
--   • Rollback: run 007_community_v2_rollback.sql
-- ============================================================

-- ── Step 1: Enhance communities table with V1 architecture columns ────

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'interest'
    CHECK (type IN (
      'regional_state', 'regional_lga', 'regional_lcda', 'regional_city',
      'interest', 'creator_artist', 'creator_dj', 'creator_radio',
      'creator_podcaster', 'creator_sports'
    )),
  ADD COLUMN IF NOT EXISTS region_id TEXT,
  ADD COLUMN IF NOT EXISTS region_scope TEXT
    CHECK (region_scope IN ('country','state','lga','lcda','city')),
  ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'NG',
  ADD COLUMN IF NOT EXISTS is_civic BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active_room_count INTEGER NOT NULL DEFAULT 0
    CHECK (active_room_count >= 0),
  ADD COLUMN IF NOT EXISTS health_score SMALLINT NOT NULL DEFAULT 50
    CHECK (health_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS interest_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Constraint: civic communities must be regional
DO $$
BEGIN
  ALTER TABLE public.communities
    ADD CONSTRAINT civic_must_be_regional
    CHECK (NOT is_civic OR type LIKE 'regional%');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Constraint: regional communities must have a region_id
DO $$
BEGIN
  ALTER TABLE public.communities
    ADD CONSTRAINT regional_must_have_region_id
    CHECK (NOT (type LIKE 'regional%') OR region_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Step 2: community_moderators ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_moderators (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id    UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  promoted_by     UUID        NOT NULL REFERENCES public.profiles(id),
  permissions     JSONB       NOT NULL DEFAULT '{
    "can_remove_members": false,
    "can_mute_members": false,
    "can_pin_announcements": false,
    "can_approve_rooms": false,
    "can_remove_rooms": false,
    "can_ban_members": false,
    "can_edit_rules": false,
    "can_manage_events": false
  }'::jsonb,
  promoted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE (community_id, user_id)
);

COMMENT ON TABLE  public.community_moderators IS 'Community moderators with granular permission sets. One row per active moderator per community.';
COMMENT ON COLUMN public.community_moderators.permissions IS 'JSONB permissions object. All keys default false. Owner grants individual keys on appointment.';


-- ── Step 3: community_rules ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_rules (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id    UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  rule_number     SMALLINT    NOT NULL CHECK (rule_number BETWEEN 1 AND 20),
  title           TEXT        NOT NULL CHECK (length(title) BETWEEN 5 AND 80),
  body            TEXT        NOT NULL CHECK (length(body) BETWEEN 10 AND 500),
  created_by      UUID        NOT NULL REFERENCES public.profiles(id),
  updated_by      UUID        REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, rule_number)
);

COMMENT ON TABLE public.community_rules IS 'Community rules numbered 1-20. Owners and permitted moderators may edit.';


-- ── Step 4: Performance indexes ───────────────────────────────────────

-- communities: V1 discovery patterns
CREATE INDEX IF NOT EXISTS idx_communities_type
  ON public.communities(type) WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_communities_region_id
  ON public.communities(region_id) WHERE region_id IS NOT NULL AND NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_communities_country_code
  ON public.communities(country_code) WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_communities_civic
  ON public.communities(is_civic) WHERE is_civic = true AND NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_communities_interest_tags
  ON public.communities USING gin(interest_tags);

CREATE INDEX IF NOT EXISTS idx_communities_health
  ON public.communities(health_score DESC)
  WHERE NOT is_deleted AND NOT is_suspended;

-- community_moderators: permission lookups
CREATE INDEX IF NOT EXISTS idx_cmods_community
  ON public.community_moderators(community_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_cmods_user
  ON public.community_moderators(user_id) WHERE is_active;

-- community_rules: community feed
CREATE INDEX IF NOT EXISTS idx_crules_community
  ON public.community_rules(community_id, rule_number);


-- ── Step 5: RLS for new tables ─────────────────────────────────────────

ALTER TABLE public.community_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_rules      ENABLE ROW LEVEL SECURITY;

-- community_moderators: members of the community can see who the mods are
CREATE POLICY "cmods_select_members"
  ON public.community_moderators FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_moderators.community_id
        AND c.visibility = 'public'
        AND NOT c.is_deleted
    )
  );

-- Only owners can appoint moderators (via service_role in Worker)
-- No direct INSERT policy — all writes go through CF Worker (service_role bypasses RLS)

-- community_rules: public readable for non-deleted communities
CREATE POLICY "crules_select_public"
  ON public.community_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_rules.community_id
        AND c.visibility = 'public'
        AND NOT c.is_deleted
    )
  );

-- No direct INSERT/UPDATE/DELETE policies for rules — CF Worker uses service_role


-- ── Step 6: Member count trigger (supplements existing RPC functions) ─

CREATE OR REPLACE FUNCTION public.sync_community_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role != 'banned' THEN
    UPDATE public.communities
    SET member_count = GREATEST(0, member_count + 1), updated_at = now()
    WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' AND OLD.role != 'banned' THEN
    UPDATE public.communities
    SET member_count = GREATEST(0, member_count - 1), updated_at = now()
    WHERE id = OLD.community_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Transition from active → banned: decrement
    IF OLD.role != 'banned' AND NEW.role = 'banned' THEN
      UPDATE public.communities
      SET member_count = GREATEST(0, member_count - 1), updated_at = now()
      WHERE id = NEW.community_id;
    -- Transition from banned → active: increment
    ELSIF OLD.role = 'banned' AND NEW.role != 'banned' THEN
      UPDATE public.communities
      SET member_count = GREATEST(0, member_count + 1), updated_at = now()
      WHERE id = NEW.community_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_community_member_count ON public.community_members;
CREATE TRIGGER trigger_community_member_count
  AFTER INSERT OR UPDATE OR DELETE ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_community_member_count();

-- updated_at trigger for community_rules
DROP TRIGGER IF EXISTS community_rules_updated_at ON public.community_rules;
CREATE TRIGGER community_rules_updated_at
  BEFORE UPDATE ON public.community_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- updated_at trigger for community_moderators
DROP TRIGGER IF EXISTS community_moderators_updated_at ON public.community_moderators;
CREATE TRIGGER community_moderators_updated_at
  BEFORE UPDATE ON public.community_moderators
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── Step 7: Grant service_role execute on trigger functions ───────────

GRANT EXECUTE ON FUNCTION public.sync_community_member_count TO service_role;
