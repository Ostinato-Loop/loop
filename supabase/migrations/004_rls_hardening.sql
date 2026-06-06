-- ============================================================
-- 004_rls_hardening.sql
-- Sprint: Loop Production Recovery — 2026-06-06
--
-- Replaces all open-world USING(true) / WITH CHECK(true) policies
-- with scoped, user-anchored policies that enforce ownership at
-- the database layer.
--
-- HOW auth.uid() WORKS HERE:
--   The Loop frontend stores the user's JWT under the key "loop_token"
--   (signed by RALD_JWT_SECRET). The authedSupabase() client helper
--   sends this token in the Authorization header. Supabase validates it
--   using the project's JWT secret, then sets auth.uid() to the
--   token's "sub" claim (the user's UUID).
--
--   REQUIRED ONE-TIME OPERATOR ACTION:
--   Supabase Dashboard → Project Settings → API → JWT Settings
--   Set "JWT Secret" to the same value as RALD_JWT_SECRET.
--   Without this, auth.uid() returns NULL and all write policies
--   will deny frontend requests (public reads remain unaffected).
--
-- SERVICE ROLE SAFETY:
--   The service_role key (used by CF Worker + Express API server)
--   always bypasses RLS entirely. No application-layer operations
--   are affected by this migration regardless of JWT secret state.
-- ============================================================


-- ── profiles ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_read"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

-- Usernames and avatars are public-facing — readable by anyone
CREATE POLICY "profiles_select_public"
  ON public.profiles FOR SELECT
  USING (true);

-- Only the owner can create their own profile row
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid()::text = id::text);

-- Only the owner can update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING  (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

-- No client-side DELETE — account deletion goes through service_role


-- ── rooms ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "rooms_read"   ON public.rooms;
DROP POLICY IF EXISTS "rooms_insert" ON public.rooms;
DROP POLICY IF EXISTS "rooms_update" ON public.rooms;
DROP POLICY IF EXISTS "rooms_delete" ON public.rooms;

-- Public and livestream rooms are discoverable by anyone (anon included)
CREATE POLICY "rooms_select_public"
  ON public.rooms FOR SELECT
  USING (
    visibility IN ('public', 'livestream')
    OR host_id::text = auth.uid()::text
  );

-- Only authenticated users can create rooms; they must own the host_id
CREATE POLICY "rooms_insert_own"
  ON public.rooms FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND host_id::text = auth.uid()::text
  );

-- Only the host can update their room
CREATE POLICY "rooms_update_host"
  ON public.rooms FOR UPDATE
  USING  (host_id::text = auth.uid()::text)
  WITH CHECK (host_id::text = auth.uid()::text);

-- Only the host can delete their room
CREATE POLICY "rooms_delete_host"
  ON public.rooms FOR DELETE
  USING (host_id::text = auth.uid()::text);


-- ── room_participants ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "rp_read"   ON public.room_participants;
DROP POLICY IF EXISTS "rp_insert" ON public.room_participants;
DROP POLICY IF EXISTS "rp_delete" ON public.room_participants;

-- Participant lists for public/livestream rooms are public
CREATE POLICY "rp_select_public"
  ON public.room_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE  r.id = room_id
      AND    r.visibility IN ('public', 'livestream')
    )
  );

-- Users can only add themselves as participants
CREATE POLICY "rp_insert_own"
  ON public.room_participants FOR INSERT
  WITH CHECK (user_id::text = auth.uid()::text);

-- Users can only remove themselves
CREATE POLICY "rp_delete_own"
  ON public.room_participants FOR DELETE
  USING (user_id::text = auth.uid()::text);


-- ── room_messages ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "rm_read"   ON public.room_messages;
DROP POLICY IF EXISTS "rm_insert" ON public.room_messages;

-- Messages in public/livestream rooms are visible to everyone
CREATE POLICY "rm_select_public"
  ON public.room_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE  r.id = room_id
      AND    r.visibility IN ('public', 'livestream')
    )
  );

-- Only in-room, authenticated users can send messages
CREATE POLICY "rm_insert_participant"
  ON public.room_messages FOR INSERT
  WITH CHECK (
    user_id::text = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE  rp.room_id = room_messages.room_id
      AND    rp.user_id::text = auth.uid()::text
    )
  );


-- ── room_reactions ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "rr_read"   ON public.room_reactions;
DROP POLICY IF EXISTS "rr_insert" ON public.room_reactions;

-- Reactions in public/livestream rooms are visible to everyone
CREATE POLICY "rr_select_public"
  ON public.room_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE  r.id = room_id
      AND    r.visibility IN ('public', 'livestream')
    )
  );

-- Only in-room, authenticated users can react
CREATE POLICY "rr_insert_participant"
  ON public.room_reactions FOR INSERT
  WITH CHECK (
    user_id::text = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE  rp.room_id = room_reactions.room_id
      AND    rp.user_id::text = auth.uid()::text
    )
  );


-- ── friend_requests ───────────────────────────────────────────────────────────
-- All access is via the Express API server (service_role key, bypasses RLS).
-- Remove the open anon policies that exposed all friend requests to any
-- unauthenticated caller with the anon key.

DROP POLICY IF EXISTS "fr_read"   ON public.friend_requests;
DROP POLICY IF EXISTS "fr_insert" ON public.friend_requests;
DROP POLICY IF EXISTS "fr_update" ON public.friend_requests;
DROP POLICY IF EXISTS "fr_delete" ON public.friend_requests;

-- Only the sender or receiver can see their requests
CREATE POLICY "fr_select_own"
  ON public.friend_requests FOR SELECT
  USING (
    sender_id::text   = auth.uid()::text
    OR receiver_id::text = auth.uid()::text
  );

-- Sender can only submit requests as themselves
CREATE POLICY "fr_insert_own"
  ON public.friend_requests FOR INSERT
  WITH CHECK (sender_id::text = auth.uid()::text);

-- Receiver can accept/decline; sender can cancel
CREATE POLICY "fr_update_involved"
  ON public.friend_requests FOR UPDATE
  USING (
    receiver_id::text = auth.uid()::text
    OR sender_id::text = auth.uid()::text
  )
  WITH CHECK (
    receiver_id::text = auth.uid()::text
    OR sender_id::text = auth.uid()::text
  );

-- Sender can retract a pending request
CREATE POLICY "fr_delete_own"
  ON public.friend_requests FOR DELETE
  USING (
    sender_id::text = auth.uid()::text
    AND status = 'pending'
  );


-- ── notifications ─────────────────────────────────────────────────────────────
-- CRITICAL: Previous policies used USING(true), exposing every user's
-- notifications to any caller with the anon key (public browser bundle).
-- All access is via the Express API server (service_role) — removing
-- anon policies has zero impact on application functionality.

DROP POLICY IF EXISTS "notif_read"   ON public.notifications;
DROP POLICY IF EXISTS "notif_insert" ON public.notifications;
DROP POLICY IF EXISTS "notif_update" ON public.notifications;

-- Only the recipient can read their own notifications
CREATE POLICY "notif_select_own"
  ON public.notifications FOR SELECT
  USING (recipient_id::text = auth.uid()::text);

-- No direct INSERT from client — notifications are created via service_role
-- triggers and API server operations only. No INSERT policy = denied for
-- anon and authenticated roles.

-- Only the recipient can mark notifications as read
CREATE POLICY "notif_update_own"
  ON public.notifications FOR UPDATE
  USING  (recipient_id::text = auth.uid()::text)
  WITH CHECK (recipient_id::text = auth.uid()::text);
