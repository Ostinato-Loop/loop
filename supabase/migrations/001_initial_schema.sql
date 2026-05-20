-- ============================================================
-- Loop V1 — Initial Supabase Schema
-- Run via: supabase db push  OR  paste into Supabase SQL editor
-- ============================================================

-- ── Enable extensions ─────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ── Profiles ──────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key,
  username      text unique,
  display_name  text,
  avatar_url    text,
  bio           text,
  language      text default 'en',
  interests     text[] default '{}',
  is_creator    boolean not null default false,
  is_verified   boolean not null default false,
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Rooms ─────────────────────────────────────────────────
create table if not exists public.rooms (
  id             uuid primary key default uuid_generate_v4(),
  title          text not null,
  description    text,
  host_id        uuid not null references public.profiles(id) on delete cascade,
  category       text not null default 'general',
  language       text not null default 'en',
  is_live        boolean not null default false,
  is_private     boolean not null default false,
  audience_count integer not null default 0,
  ai_summary     text,
  cover_url      text,
  scheduled_at   timestamptz,
  ended_at       timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists rooms_host_id_idx on public.rooms(host_id);
create index if not exists rooms_is_live_idx on public.rooms(is_live);
create index if not exists rooms_category_idx on public.rooms(category);

-- ── Room participants ─────────────────────────────────────
create table if not exists public.room_participants (
  id        uuid primary key default uuid_generate_v4(),
  room_id   uuid not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'listener',
  joined_at timestamptz not null default now(),
  unique(room_id, user_id)
);

create index if not exists room_participants_room_id_idx on public.room_participants(room_id);

-- ── Room messages (chat) ──────────────────────────────────
create table if not exists public.room_messages (
  id         uuid primary key default uuid_generate_v4(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists room_messages_room_id_idx on public.room_messages(room_id);

-- ── Room reactions ────────────────────────────────────────
create table if not exists public.room_reactions (
  id         uuid primary key default uuid_generate_v4(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now()
);

-- ── RLS — enable on all tables ────────────────────────────
alter table public.profiles         enable row level security;
alter table public.rooms            enable row level security;
alter table public.room_participants enable row level security;
alter table public.room_messages    enable row level security;
alter table public.room_reactions   enable row level security;

-- Profiles: anyone can read; only owner can update
create policy "profiles_read"   on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (true);
create policy "profiles_update" on public.profiles for update using (true);

-- Rooms: public read; service role manages writes
create policy "rooms_read"   on public.rooms for select using (true);
create policy "rooms_insert" on public.rooms for insert with check (true);
create policy "rooms_update" on public.rooms for update using (true);
create policy "rooms_delete" on public.rooms for delete using (true);

-- Room participants
create policy "rp_read"   on public.room_participants for select using (true);
create policy "rp_insert" on public.room_participants for insert with check (true);
create policy "rp_delete" on public.room_participants for delete using (true);

-- Room messages
create policy "rm_read"   on public.room_messages for select using (true);
create policy "rm_insert" on public.room_messages for insert with check (true);

-- Room reactions
create policy "rr_read"   on public.room_reactions for select using (true);
create policy "rr_insert" on public.room_reactions for insert with check (true);

-- ── Trigger: update updated_at on profiles ────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();
