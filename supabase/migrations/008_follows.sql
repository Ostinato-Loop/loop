-- ============================================================
-- Loop — Migration 008: Follows (Relationship Graph)
-- FOLLOWS-001 (2026-06-09)
-- Creates the social graph: who follows whom.
-- ============================================================

-- ── follows table ─────────────────────────────────────────
create table if not exists public.follows (
  id           uuid        primary key default uuid_generate_v4(),
  follower_id  uuid        not null references public.profiles(id) on delete cascade,
  following_id uuid        not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),

  -- Cannot follow yourself
  constraint follows_no_self_follow check (follower_id <> following_id),
  -- One follow relationship per pair
  unique (follower_id, following_id)
);

-- ── Indexes ────────────────────────────────────────────────
-- Fast lookup: "who am I following?"
create index if not exists follows_follower_id_idx
  on public.follows(follower_id);

-- Fast lookup: "who follows this user?"
create index if not exists follows_following_id_idx
  on public.follows(following_id);

-- Composite: reverse lookup (used by suggestions query)
create index if not exists follows_following_follower_idx
  on public.follows(following_id, follower_id);

-- ── Row-Level Security ─────────────────────────────────────
alter table public.follows enable row level security;

-- Anyone can see who follows whom (public social graph)
create policy "follows_select_public"
  on public.follows for select
  using (true);

-- Only the follower themselves can create a follow
create policy "follows_insert_own"
  on public.follows for insert
  with check (auth.uid()::uuid = follower_id);

-- Only the follower themselves can delete (unfollow)
create policy "follows_delete_own"
  on public.follows for delete
  using (auth.uid()::uuid = follower_id);

-- ── Denormalised follower_count on profiles ────────────────
-- Maintained by triggers so we avoid expensive COUNT(*) queries at read time.
alter table public.profiles
  add column if not exists follower_count  integer not null default 0,
  add column if not exists following_count integer not null default 0;

-- Trigger: increment counts on follow
create or replace function public.follows_after_insert()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles set follower_count  = follower_count  + 1 where id = new.following_id;
  update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  return new;
end;
$$;

drop trigger if exists trg_follows_insert on public.follows;
create trigger trg_follows_insert
  after insert on public.follows
  for each row execute procedure public.follows_after_insert();

-- Trigger: decrement counts on unfollow
create or replace function public.follows_after_delete()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles set follower_count  = greatest(follower_count  - 1, 0) where id = old.following_id;
  update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  return old;
end;
$$;

drop trigger if exists trg_follows_delete on public.follows;
create trigger trg_follows_delete
  after delete on public.follows
  for each row execute procedure public.follows_after_delete();

-- ── Backfill counts for any existing rows ──────────────────
update public.profiles p
set follower_count = (
  select count(*) from public.follows f where f.following_id = p.id
);

update public.profiles p
set following_count = (
  select count(*) from public.follows f where f.follower_id = p.id
);
