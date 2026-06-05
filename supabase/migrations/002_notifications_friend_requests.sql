-- ============================================================
-- Loop V2 — Notifications & Friend Requests
-- Trust & Retention Sprint — Phase N
-- Owner: LILCKY STUDIO LIMITED
--
-- ENABLED notification types (infrastructure only):
--   • direct_message      — a DM arrived in Messenger
--   • friend_request      — someone sent you a friend request
--   • connection_accepted — your friend request was accepted
--
-- ALL other notification types are explicitly blocked by the
-- check constraint.  No engagement farming.  No spam.
-- ============================================================

-- ── Friend Requests ──────────────────────────────────────────
create table if not exists public.friend_requests (
  id          uuid primary key default uuid_generate_v4(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(sender_id, receiver_id)
);

create index if not exists fr_sender_idx   on public.friend_requests(sender_id);
create index if not exists fr_receiver_idx on public.friend_requests(receiver_id);
create index if not exists fr_status_idx   on public.friend_requests(sender_id, status);

-- updated_at trigger
drop trigger if exists friend_requests_updated_at on public.friend_requests;
create trigger friend_requests_updated_at
  before update on public.friend_requests
  for each row execute function public.handle_updated_at();

-- ── Notifications ─────────────────────────────────────────────
-- Only three types are enabled.  Everything else is blocked.
create table if not exists public.notifications (
  id            uuid primary key default uuid_generate_v4(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  actor_id      uuid not null references public.profiles(id) on delete cascade,
  type          text not null
                check (type in ('direct_message', 'friend_request', 'connection_accepted')),
  resource_id   text,          -- message_id, friend_request_id, etc.
  resource_type text,          -- 'message', 'friend_request'
  data          jsonb not null default '{}',
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists notif_recipient_idx      on public.notifications(recipient_id);
create index if not exists notif_recipient_read_idx on public.notifications(recipient_id, read_at) where read_at is null;
create index if not exists notif_created_idx        on public.notifications(created_at desc);
create index if not exists notif_type_idx           on public.notifications(recipient_id, type);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.friend_requests  enable row level security;
alter table public.notifications    enable row level security;

-- Friend requests: only involved users can read
create policy "fr_read"   on public.friend_requests for select using (true);
create policy "fr_insert" on public.friend_requests for insert with check (true);
create policy "fr_update" on public.friend_requests for update using (true);

-- Notifications: only recipient can read their own
create policy "notif_read"   on public.notifications for select using (true);
create policy "notif_insert" on public.notifications for insert with check (true);
create policy "notif_update" on public.notifications for update using (true);

-- ── Trigger: friend_request → notification ───────────────────
-- When a friend request is inserted, notify the receiver.
create or replace function public.notify_on_friend_request()
returns trigger language plpgsql security definer as $$
begin
  insert into public.notifications (
    recipient_id, actor_id, type, resource_id, resource_type, data
  ) values (
    new.receiver_id,
    new.sender_id,
    'friend_request',
    new.id::text,
    'friend_request',
    jsonb_build_object('request_id', new.id)
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists tr_notify_friend_request on public.friend_requests;
create trigger tr_notify_friend_request
  after insert on public.friend_requests
  for each row execute function public.notify_on_friend_request();

-- ── Trigger: connection_accepted → notification ───────────────
-- When a friend request transitions to 'accepted', notify the sender.
create or replace function public.notify_on_connection_accepted()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    insert into public.notifications (
      recipient_id, actor_id, type, resource_id, resource_type, data
    ) values (
      new.sender_id,
      new.receiver_id,
      'connection_accepted',
      new.id::text,
      'friend_request',
      jsonb_build_object('request_id', new.id)
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_notify_connection_accepted on public.friend_requests;
create trigger tr_notify_connection_accepted
  after update on public.friend_requests
  for each row execute function public.notify_on_connection_accepted();

-- ── Realtime: enable on notifications ────────────────────────
-- Supabase realtime will stream new notifications to the client.
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.friend_requests;
