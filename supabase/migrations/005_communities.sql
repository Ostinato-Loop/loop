-- ============================================================
-- 005_communities.sql
-- Sprint: Loop V2 — Communities Foundation
-- Date:   2026-06-07
--
-- Communities are the PRIMARY entity in Loop V2.
-- Rooms, members, and discovery all revolve around communities.
--
-- Tables:
--   communities        — the community entity
--   community_members  — membership + roles
--
-- Alterations:
--   rooms.community_id — nullable FK (room can be standalone or community-owned)
--   rooms.visibility   — ensure column exists (may have been added in Phase H)
--
-- RPCs:
--   increment_community_member_count(p_community_id uuid)
--   decrement_community_member_count(p_community_id uuid)
--   increment_community_room_count(p_community_id uuid)
--   decrement_community_room_count(p_community_id uuid)
-- ============================================================


-- ── communities ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.communities (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text        NOT NULL,
  slug          text        NOT NULL,
  description   text,
  cover_url     text,
  category      text        NOT NULL DEFAULT 'general',
  visibility    text        NOT NULL DEFAULT 'public'
                            CHECK (visibility IN ('public', 'private', 'invite_only')),
  owner_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_count  integer     NOT NULL DEFAULT 1,
  room_count    integer     NOT NULL DEFAULT 0,
  is_verified   boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS communities_slug_idx
  ON public.communities (slug);

CREATE INDEX IF NOT EXISTS communities_owner_id_idx
  ON public.communities (owner_id);

CREATE INDEX IF NOT EXISTS communities_category_idx
  ON public.communities (category);

CREATE INDEX IF NOT EXISTS communities_visibility_idx
  ON public.communities (visibility);

CREATE INDEX IF NOT EXISTS communities_fts_idx
  ON public.communities
  USING GIN (to_tsvector('english', name || ' ' || COALESCE(description, '')));


-- ── community_members ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_members (
  community_id  uuid        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          text        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('owner', 'admin', 'member')),
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_members_user_id_idx
  ON public.community_members (user_id);

CREATE INDEX IF NOT EXISTS community_members_role_idx
  ON public.community_members (community_id, role);


-- ── rooms: add community_id FK ────────────────────────────────────────────────

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS community_id uuid
  REFERENCES public.communities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rooms_community_id_idx
  ON public.rooms (community_id)
  WHERE community_id IS NOT NULL;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';


-- ── updated_at trigger ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS communities_updated_at ON public.communities;
CREATE TRIGGER communities_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── Counter RPCs ─────────────────────────────────────────────────────────────
-- Called by CF Worker after join/leave/create-room to keep denormalized counts
-- accurate without requiring a read-modify-write cycle in the Worker.

CREATE OR REPLACE FUNCTION public.increment_community_member_count(p_community_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.communities
  SET member_count = member_count + 1
  WHERE id = p_community_id;
$$;

CREATE OR REPLACE FUNCTION public.decrement_community_member_count(p_community_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.communities
  SET member_count = GREATEST(0, member_count - 1)
  WHERE id = p_community_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_community_room_count(p_community_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.communities
  SET room_count = room_count + 1
  WHERE id = p_community_id;
$$;

CREATE OR REPLACE FUNCTION public.decrement_community_room_count(p_community_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.communities
  SET room_count = GREATEST(0, room_count - 1)
  WHERE id = p_community_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_community_member_count TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_community_member_count TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_community_room_count   TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_community_room_count   TO service_role;


-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.communities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "communities_select_public"
  ON public.communities FOR SELECT
  USING (
    visibility = 'public'
    OR owner_id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = communities.id
        AND cm.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "communities_insert_own"
  ON public.communities FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id::text = auth.uid()::text
  );

CREATE POLICY "communities_update_admin"
  ON public.communities FOR UPDATE
  USING (
    owner_id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = communities.id
        AND cm.user_id::text = auth.uid()::text
        AND cm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    owner_id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = communities.id
        AND cm.user_id::text = auth.uid()::text
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "communities_delete_owner"
  ON public.communities FOR DELETE
  USING (owner_id::text = auth.uid()::text);

CREATE POLICY "community_members_select"
  ON public.community_members FOR SELECT
  USING (
    user_id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
        AND c.visibility = 'public'
    )
  );

CREATE POLICY "community_members_insert_self"
  ON public.community_members FOR INSERT
  WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "community_members_delete"
  ON public.community_members FOR DELETE
  USING (
    user_id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
        AND c.owner_id::text = auth.uid()::text
    )
  );
