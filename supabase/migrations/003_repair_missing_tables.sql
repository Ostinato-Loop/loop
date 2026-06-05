-- ============================================================
  -- Loop × RALD — FULL DATABASE REPAIR MIGRATION
  -- Run in Supabase SQL Editor → "Run" button
  -- Safe to run multiple times (all statements are idempotent)
  -- Date: 2026-06-05 | Owner: LILCKY STUDIO LIMITED
  --
  -- What this fixes:
  --   1. Creates missing Loop tables: profiles, rooms, room_participants,
  --      room_messages, room_reactions (from migration 001)
  --   2. Creates missing trust tables: friend_requests, notifications
  --      (from migration 002)
  --   3. Wire up RLS policies and triggers
  -- ============================================================

  -- ── Extensions ────────────────────────────────────────────
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pg_trgm";

  -- ── Shared updated_at trigger function ────────────────────
  CREATE OR REPLACE FUNCTION public.handle_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- ────────────────────────────────────────────────────────────
  -- MIGRATION 001 — Loop Core Schema
  -- ────────────────────────────────────────────────────────────

  -- ── Profiles ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public.profiles (
    id            uuid PRIMARY KEY,
    username      text UNIQUE,
    display_name  text,
    avatar_url    text,
    bio           text,
    language      text DEFAULT 'en',
    interests     text[] DEFAULT '{}',
    is_creator    boolean NOT NULL DEFAULT false,
    is_verified   boolean NOT NULL DEFAULT false,
    onboarded     boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
  );

  DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
  CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

  -- ── Rooms ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public.rooms (
    id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    title          text NOT NULL,
    description    text,
    host_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category       text NOT NULL DEFAULT 'general',
    language       text NOT NULL DEFAULT 'en',
    is_live        boolean NOT NULL DEFAULT false,
    is_private     boolean NOT NULL DEFAULT false,
    audience_count integer NOT NULL DEFAULT 0,
    ai_summary     text,
    cover_url      text,
    scheduled_at   timestamptz,
    ended_at       timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS rooms_host_id_idx  ON public.rooms(host_id);
  CREATE INDEX IF NOT EXISTS rooms_is_live_idx  ON public.rooms(is_live);
  CREATE INDEX IF NOT EXISTS rooms_category_idx ON public.rooms(category);

  -- ── Room participants ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public.room_participants (
    id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id   uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role      text NOT NULL DEFAULT 'listener',
    joined_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(room_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS room_participants_room_id_idx ON public.room_participants(room_id);

  -- ── Room messages (chat) ──────────────────────────────────
  CREATE TABLE IF NOT EXISTS public.room_messages (
    id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id    uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content    text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS room_messages_room_id_idx ON public.room_messages(room_id);

  -- ── Room reactions ────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public.room_reactions (
    id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id    uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji      text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  -- ── RLS — Migration 001 ───────────────────────────────────
  ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.rooms             ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.room_messages     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.room_reactions    ENABLE ROW LEVEL SECURITY;

  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_read') THEN
      CREATE POLICY "profiles_read"   ON public.profiles FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_insert') THEN
      CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_update') THEN
      CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='rooms_read') THEN
      CREATE POLICY "rooms_read"   ON public.rooms FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='rooms_insert') THEN
      CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='rooms_update') THEN
      CREATE POLICY "rooms_update" ON public.rooms FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='rooms_delete') THEN
      CREATE POLICY "rooms_delete" ON public.rooms FOR DELETE USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='room_participants' AND policyname='rp_read') THEN
      CREATE POLICY "rp_read"   ON public.room_participants FOR SELECT USING (true);
      CREATE POLICY "rp_insert" ON public.room_participants FOR INSERT WITH CHECK (true);
      CREATE POLICY "rp_delete" ON public.room_participants FOR DELETE USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='room_messages' AND policyname='rm_read') THEN
      CREATE POLICY "rm_read"   ON public.room_messages FOR SELECT USING (true);
      CREATE POLICY "rm_insert" ON public.room_messages FOR INSERT WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='room_reactions' AND policyname='rr_read') THEN
      CREATE POLICY "rr_read"   ON public.room_reactions FOR SELECT USING (true);
      CREATE POLICY "rr_insert" ON public.room_reactions FOR INSERT WITH CHECK (true);
    END IF;
  END $$;

  -- ────────────────────────────────────────────────────────────
  -- MIGRATION 002 — Trust & Retention (Friend Requests + Notifications)
  -- ────────────────────────────────────────────────────────────

  -- ── Friend Requests ───────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public.friend_requests (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(sender_id, receiver_id)
  );

  CREATE INDEX IF NOT EXISTS fr_sender_idx   ON public.friend_requests(sender_id);
  CREATE INDEX IF NOT EXISTS fr_receiver_idx ON public.friend_requests(receiver_id);
  CREATE INDEX IF NOT EXISTS fr_status_idx   ON public.friend_requests(sender_id, status);

  DROP TRIGGER IF EXISTS friend_requests_updated_at ON public.friend_requests;
  CREATE TRIGGER friend_requests_updated_at
    BEFORE UPDATE ON public.friend_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

  -- ── Notifications ──────────────────────────────────────────
  -- Three types ONLY. No engagement farming. No spam.
  CREATE TABLE IF NOT EXISTS public.notifications (
    id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type          text NOT NULL
                  CHECK (type IN ('direct_message', 'friend_request', 'connection_accepted')),
    resource_id   text,
    resource_type text,
    data          jsonb NOT NULL DEFAULT '{}',
    read_at       timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS notif_recipient_idx      ON public.notifications(recipient_id);
  CREATE INDEX IF NOT EXISTS notif_recipient_read_idx ON public.notifications(recipient_id, read_at) WHERE read_at IS NULL;
  CREATE INDEX IF NOT EXISTS notif_created_idx        ON public.notifications(created_at DESC);
  CREATE INDEX IF NOT EXISTS notif_type_idx           ON public.notifications(recipient_id, type);

  -- ── RLS — Migration 002 ───────────────────────────────────
  ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;

  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friend_requests' AND policyname='fr_read') THEN
      CREATE POLICY "fr_read"   ON public.friend_requests FOR SELECT USING (true);
      CREATE POLICY "fr_insert" ON public.friend_requests FOR INSERT WITH CHECK (true);
      CREATE POLICY "fr_update" ON public.friend_requests FOR UPDATE USING (true);
      CREATE POLICY "fr_delete" ON public.friend_requests FOR DELETE USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notif_read') THEN
      CREATE POLICY "notif_read"   ON public.notifications FOR SELECT USING (true);
      CREATE POLICY "notif_insert" ON public.notifications FOR INSERT WITH CHECK (true);
      CREATE POLICY "notif_update" ON public.notifications FOR UPDATE USING (true);
    END IF;
  END $$;

  -- ── DB trigger: friend_request notification on INSERT ─────
  CREATE OR REPLACE FUNCTION public.notify_friend_request()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO public.notifications (recipient_id, actor_id, type, resource_id, resource_type, data)
    VALUES (NEW.receiver_id, NEW.sender_id, 'friend_request', NEW.id::text, 'friend_request', '{}')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  DROP TRIGGER IF EXISTS on_friend_request_created ON public.friend_requests;
  CREATE TRIGGER on_friend_request_created
    AFTER INSERT ON public.friend_requests
    FOR EACH ROW EXECUTE FUNCTION public.notify_friend_request();

  -- ── DB trigger: connection_accepted notification on UPDATE ─
  CREATE OR REPLACE FUNCTION public.notify_connection_accepted()
  RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, resource_id, resource_type, data)
      VALUES (NEW.sender_id, NEW.receiver_id, 'connection_accepted', NEW.id::text, 'friend_request', '{}')
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  DROP TRIGGER IF EXISTS on_friend_request_accepted ON public.friend_requests;
  CREATE TRIGGER on_friend_request_accepted
    AFTER UPDATE ON public.friend_requests
    FOR EACH ROW EXECUTE FUNCTION public.notify_connection_accepted();

  -- ── Verification query (run after migration) ─────────────
  SELECT
    table_name,
    (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS col_count
  FROM information_schema.tables t
  WHERE table_schema = 'public'
    AND table_name IN ('profiles','rooms','room_participants','room_messages','room_reactions','friend_requests','notifications')
  ORDER BY table_name;
  