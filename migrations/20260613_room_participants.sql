-- LIVEKIT-ROLES-001 (2026-06-13)
-- room_participants table: tracks each user's role in a room.
-- Required by Loop LiveKit role-based token issuance.
-- See: SECURITY/hardening/LIVEKIT_ROLE_MODEL.md

create table if not exists room_participants (
  room_id     text        not null,
  user_id     uuid        not null,
  role        text        not null default 'listener'
                          check (role in ('listener', 'speaker', 'host', 'moderator', 'admin')),
  joined_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Index for fast token lookups (room_id + user_id PK covers it, but explicit for clarity)
create index if not exists room_participants_room_user_idx
  on room_participants (room_id, user_id);

-- Index so hosts can list all participants in a room quickly
create index if not exists room_participants_room_idx
  on room_participants (room_id);

-- Auto-update updated_at on row change
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists room_participants_updated_at on room_participants;
create trigger room_participants_updated_at
  before update on room_participants
  for each row execute function set_updated_at();

-- Row-level security
alter table room_participants enable row level security;

-- Service role bypasses RLS (worker uses service role key)
-- Authenticated users can only see participants in rooms they are in
create policy "participants_select_own_rooms"
  on room_participants for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from room_participants rp2
      where rp2.room_id = room_participants.room_id
        and rp2.user_id = auth.uid()
    )
  );

-- Only service role can insert/update/delete (done via worker with service key)
-- No direct client-side mutations allowed
