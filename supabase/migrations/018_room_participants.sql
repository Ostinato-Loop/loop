-- 018_room_participants.sql
-- LIVEKIT-ROLES-001 (2026-06-13)
-- room_participants: tracks each user's role within a LiveKit room.
-- Required by role-based canPublish token issuance in audio.ts.
-- Roles: listener (read-only) | speaker | host | moderator | admin
-- See: https://github.com/Ostinato-Loop/rald/blob/main/SECURITY/hardening/LIVEKIT_ROLE_MODEL.md

create table if not exists public.room_participants (
  room_id     text        not null,
  user_id     uuid        not null references public.loop_profiles(id) on delete cascade,
  role        text        not null default 'listener'
                          check (role in ('listener', 'speaker', 'host', 'moderator', 'admin')),
  joined_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Indexes
create index if not exists room_participants_room_idx
  on public.room_participants (room_id);

-- updated_at trigger (reuses existing set_updated_at() if present, otherwise creates it)
create or replace function public.set_rp_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists room_participants_updated_at on public.room_participants;
create trigger room_participants_updated_at
  before update on public.room_participants
  for each row execute function public.set_rp_updated_at();

-- Row-level security
alter table public.room_participants enable row level security;

-- Participants in a room can see each other's roles (needed for UI)
create policy "room_participants_select"
  on public.room_participants for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.room_participants rp2
      where rp2.room_id = room_participants.room_id
        and rp2.user_id = auth.uid()
    )
  );

-- All writes go through the worker (service role key bypasses RLS)
-- No direct client writes allowed.

-- Seed: when a room is created, the creator becomes host
-- This is handled in the worker rooms.ts route, not via migration.
-- Migration is schema-only.
