-- ============================================================
-- Loop — Migration 009: Push Subscriptions
-- PUSH-001 (2026-06-10)
-- Web Push (RFC 8292 / RFC 8291) subscription storage.
-- Also extends notifications.type to include room_live + new_follower.
-- ============================================================

-- ── push_subscriptions ────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id         uuid        primary key default uuid_generate_v4(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  endpoint   text        not null,
  p256dh     text        not null,  -- Base64url subscriber public key
  auth       text        not null,  -- Base64url auth secret
  platform   text        not null default 'web'
             check (platform in ('web', 'ios', 'android')),
  user_agent text,
  created_at timestamptz not null default now(),
  -- One subscription per endpoint (browser tab can register the same SW once)
  unique (user_id, endpoint)
);

create index if not exists push_sub_user_id_idx   on public.push_subscriptions(user_id);
create index if not exists push_sub_endpoint_idx  on public.push_subscriptions(endpoint);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.push_subscriptions enable row level security;

-- Users can manage only their own subscriptions
create policy "push_sub_select_own"
  on public.push_subscriptions for select
  using (auth.uid()::uuid = user_id);

create policy "push_sub_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid()::uuid = user_id);

create policy "push_sub_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid()::uuid = user_id);

-- Service role can read all (for dispatch)
-- Service role bypasses RLS by default — no additional policy needed.

-- ── Extend notification types ──────────────────────────────────────────
-- Add room_live and new_follower to the existing check constraint.
-- Drop + recreate the constraint (PostgreSQL requires this for check constraints).
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'direct_message',
    'friend_request',
    'connection_accepted',
    'room_live',
    'new_follower'
  ));
