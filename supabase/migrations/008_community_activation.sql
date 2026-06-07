-- ============================================================
-- 008_community_activation.sql
-- Sprint: V2 Community Activation — Phases 1–7
-- Date:   2026-06-07
-- Author: CTO Office — LILCKY STUDIO LIMITED
--
-- WHAT THIS MIGRATION DOES:
--   1. community_leader_badges  — Reporter/DJ/Host/Volunteer/Artist
--   2. civic_verifications      — Community/Loop/Official verification marks
--   3. community_activation_events — activation metric event log
--   4. community_creator_momentum  — creator promotion ladder tracking
--   5. auto_join_regional_communities() RPC — auto-join on onboarding
--   6. get_community_pulse() RPC — daily community pulse data
--   7. Indexes + RLS for all new tables
--
-- SAFETY:
--   • All CREATE TABLE use IF NOT EXISTS — idempotent
--   • All CREATE INDEX use IF NOT EXISTS — idempotent
--   • No existing tables, columns, or policies touched
--   • Rollback: 008_community_activation_rollback.sql
-- ============================================================


-- ── 1. community_leader_badges ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_leader_badges (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id    UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  badge_type      TEXT        NOT NULL
    CHECK (badge_type IN ('reporter','dj','host','volunteer','artist')),
  awarded_by      UUID        REFERENCES public.profiles(id),
  awarded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  UNIQUE (community_id, user_id, badge_type)
);

COMMENT ON TABLE  public.community_leader_badges IS 'Community Leader Program badges awarded by community owners/moderators.';
COMMENT ON COLUMN public.community_leader_badges.badge_type IS 'reporter=Community Reporter, dj=Community DJ, host=Community Host, volunteer=Community Volunteer, artist=Community Artist';

CREATE INDEX IF NOT EXISTS idx_badges_community
  ON public.community_leader_badges(community_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_badges_user
  ON public.community_leader_badges(user_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_badges_type
  ON public.community_leader_badges(badge_type) WHERE is_active;


-- ── 2. civic_verifications ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.civic_verifications (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id      UUID        REFERENCES public.communities(id) ON DELETE CASCADE,
  profile_id        UUID        REFERENCES public.profiles(id)    ON DELETE CASCADE,
  verification_type TEXT        NOT NULL
    CHECK (verification_type IN ('community','loop','official')),
  verified_by       UUID        REFERENCES public.profiles(id),
  verified_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  CONSTRAINT civic_target_required
    CHECK (community_id IS NOT NULL OR profile_id IS NOT NULL)
);

COMMENT ON TABLE  public.civic_verifications IS 'Civic Trust UI — verification marks for communities and profiles.';
COMMENT ON COLUMN public.civic_verifications.verification_type IS 'community=Community Verified (owner-granted), loop=Loop Verified (platform), official=Official Verified (government/institution)';

CREATE INDEX IF NOT EXISTS idx_civic_community
  ON public.civic_verifications(community_id) WHERE community_id IS NOT NULL AND is_active;

CREATE INDEX IF NOT EXISTS idx_civic_profile
  ON public.civic_verifications(profile_id) WHERE profile_id IS NOT NULL AND is_active;

CREATE INDEX IF NOT EXISTS idx_civic_type
  ON public.civic_verifications(verification_type) WHERE is_active;


-- ── 3. community_activation_events ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_activation_events (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type      TEXT        NOT NULL
    CHECK (event_type IN (
      'community_join',
      'first_room_join',
      'daily_active_listener',
      'community_retention',
      'creator_promotion',
      'badge_awarded',
      'room_created',
      'room_attended',
      'auto_join_triggered',
      'first_room_cascade_used'
    )),
  user_id         UUID        REFERENCES public.profiles(id)    ON DELETE SET NULL,
  community_id    UUID        REFERENCES public.communities(id) ON DELETE SET NULL,
  room_id         TEXT,  -- stored as text to avoid FK constraint on rooms UUID type
  session_id      TEXT,  -- trace/session for analytics correlation
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.community_activation_events IS 'Append-only activation metric event log. Used for DAL, retention, and conversion funnel tracking.';

CREATE INDEX IF NOT EXISTS idx_activation_event_type
  ON public.community_activation_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activation_user
  ON public.community_activation_events(user_id, event_type, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activation_community
  ON public.community_activation_events(community_id, event_type, created_at DESC)
  WHERE community_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activation_daily
  ON public.community_activation_events(created_at DESC);


-- ── 4. community_creator_momentum ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_creator_momentum (
  user_id             UUID        NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  community_id        UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  promotion_level     TEXT        NOT NULL DEFAULT 'community'
    CHECK (promotion_level IN ('community','lcda','lga','state','national')),
  listeners_count     INTEGER     NOT NULL DEFAULT 0 CHECK (listeners_count >= 0),
  rooms_hosted        INTEGER     NOT NULL DEFAULT 0 CHECK (rooms_hosted >= 0),
  retention_score     SMALLINT    NOT NULL DEFAULT 0 CHECK (retention_score BETWEEN 0 AND 100),
  momentum_score      INTEGER     NOT NULL DEFAULT 0,
  last_promoted_at    TIMESTAMPTZ,
  promotion_threshold INTEGER     NOT NULL DEFAULT 100,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, community_id)
);

COMMENT ON TABLE  public.community_creator_momentum IS 'Creator promotion ladder. Tracks per-community engagement for Rising in LCDA/LGA/State/National promotion.';
COMMENT ON COLUMN public.community_creator_momentum.promotion_level IS 'Current promotion tier: community → lcda → lga → state → national';
COMMENT ON COLUMN public.community_creator_momentum.momentum_score IS 'Computed score from listeners + retention + rooms. Compared against promotion_threshold.';

CREATE INDEX IF NOT EXISTS idx_momentum_community
  ON public.community_creator_momentum(community_id, momentum_score DESC);

CREATE INDEX IF NOT EXISTS idx_momentum_level
  ON public.community_creator_momentum(promotion_level, momentum_score DESC);

CREATE INDEX IF NOT EXISTS idx_momentum_user
  ON public.community_creator_momentum(user_id);


-- ── 5. auto_join_regional_communities() RPC ───────────────────────────
-- Called from CF Worker after user completes location onboarding.
-- Finds communities matching the user's region and auto-joins them.
-- Returns the list of community IDs joined.

CREATE OR REPLACE FUNCTION public.auto_join_regional_communities(
  p_user_id    UUID,
  p_country    TEXT DEFAULT 'NG',
  p_state_id   TEXT DEFAULT NULL,
  p_lga_id     TEXT DEFAULT NULL,
  p_lcda_id    TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_community     RECORD;
  v_joined        UUID[]  := '{}';
  v_skipped       UUID[]  := '{}';
  v_region_id     TEXT;
BEGIN
  -- Try each regional scope from most specific to broadest
  FOR v_community IN
    SELECT DISTINCT c.id, c.type, c.region_id
    FROM public.communities c
    WHERE c.visibility IN ('public','private')
      AND NOT c.is_deleted
      AND NOT c.is_suspended
      AND c.type IN ('regional_state','regional_lga','regional_lcda','regional_city')
      AND (
        -- LCDA match
        (p_lcda_id IS NOT NULL AND c.region_id = upper(p_country || '-' || p_state_id || '-' || p_lcda_id))
        OR
        -- LGA match
        (p_lga_id IS NOT NULL AND c.region_id = upper(p_country || '-' || p_state_id || '-' || p_lga_id))
        OR
        -- State match
        (p_state_id IS NOT NULL AND c.region_id = upper(p_country || '-' || p_state_id))
      )
    ORDER BY c.type ASC
    LIMIT 10
  LOOP
    -- Skip if already a member
    IF EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = v_community.id AND user_id = p_user_id
    ) THEN
      v_skipped := array_append(v_skipped, v_community.id);
      CONTINUE;
    END IF;

    -- Insert membership
    INSERT INTO public.community_members (community_id, user_id, role)
    VALUES (v_community.id, p_user_id, 'member')
    ON CONFLICT (community_id, user_id) DO NOTHING;

    v_joined := array_append(v_joined, v_community.id);
  END LOOP;

  -- Log activation event
  INSERT INTO public.community_activation_events (event_type, user_id, metadata)
  VALUES (
    'auto_join_triggered',
    p_user_id,
    jsonb_build_object(
      'joined_count', array_length(v_joined, 1),
      'skipped_count', array_length(v_skipped, 1),
      'country', p_country,
      'state_id', p_state_id,
      'lga_id', p_lga_id,
      'lcda_id', p_lcda_id
    )
  );

  RETURN jsonb_build_object(
    'joined',  to_jsonb(v_joined),
    'skipped', to_jsonb(v_skipped),
    'total_joined', COALESCE(array_length(v_joined, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_join_regional_communities TO service_role;


-- ── 6. get_community_pulse() RPC ──────────────────────────────────────
-- Returns daily pulse data for a community:
--   active room count, total members, recent badges, civic status

CREATE OR REPLACE FUNCTION public.get_community_pulse(
  p_community_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_community     RECORD;
  v_active_rooms  INTEGER;
  v_badges        JSONB;
  v_verifications JSONB;
BEGIN
  -- Get community basics
  SELECT member_count, room_count, active_room_count, health_score, is_suspended
  INTO v_community
  FROM public.communities
  WHERE id = p_community_id AND NOT is_deleted;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Community not found');
  END IF;

  -- Count live rooms
  SELECT COUNT(*)::integer INTO v_active_rooms
  FROM public.rooms
  WHERE community_id = p_community_id AND is_live = true AND visibility = 'public';

  -- Recent badges (last 7 days)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', b.user_id,
    'badge_type', b.badge_type,
    'awarded_at', b.awarded_at
  ) ORDER BY b.awarded_at DESC), '[]'::jsonb)
  INTO v_badges
  FROM public.community_leader_badges b
  WHERE b.community_id = p_community_id
    AND b.is_active
    AND b.awarded_at > now() - interval '7 days';

  -- Active civic verifications
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'verification_type', v.verification_type,
    'verified_at', v.verified_at,
    'expires_at', v.expires_at
  )), '[]'::jsonb)
  INTO v_verifications
  FROM public.civic_verifications v
  WHERE v.community_id = p_community_id
    AND v.is_active
    AND (v.expires_at IS NULL OR v.expires_at > now());

  RETURN jsonb_build_object(
    'community_id',      p_community_id,
    'member_count',      v_community.member_count,
    'room_count',        v_community.room_count,
    'active_room_count', COALESCE(v_active_rooms, v_community.active_room_count),
    'health_score',      v_community.health_score,
    'is_suspended',      v_community.is_suspended,
    'recent_badges',     v_badges,
    'verifications',     v_verifications,
    'generated_at',      now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_pulse TO service_role;


-- ── 7. RLS for new tables ─────────────────────────────────────────────

ALTER TABLE public.community_leader_badges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.civic_verifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_activation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_creator_momentum  ENABLE ROW LEVEL SECURITY;

-- Badges: anyone can see active badges on public communities
CREATE POLICY "badges_select_public"
  ON public.community_leader_badges FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_leader_badges.community_id
        AND c.visibility = 'public'
        AND NOT c.is_deleted
    )
  );

-- Civic verifications: public readable
CREATE POLICY "civic_verifications_select_public"
  ON public.civic_verifications FOR SELECT
  USING (is_active = true);

-- Activation events: users can see their own events only
CREATE POLICY "activation_events_select_own"
  ON public.community_activation_events FOR SELECT
  USING (user_id::text = auth.uid()::text);

-- Creator momentum: public readable (leaderboard data)
CREATE POLICY "momentum_select_public"
  ON public.community_creator_momentum FOR SELECT
  USING (true);


-- ── updated_at triggers ───────────────────────────────────────────────

DROP TRIGGER IF EXISTS community_creator_momentum_updated_at ON public.community_creator_momentum;
CREATE TRIGGER community_creator_momentum_updated_at
  BEFORE UPDATE ON public.community_creator_momentum
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
