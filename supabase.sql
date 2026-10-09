-- 龙没有耳朵 · 通讯
-- 在 Supabase Dashboard → SQL Editor 中完整执行一次。
-- 前端只使用 publishable/anon key；service_role 永远不要放进 config.js。

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(btrim(username)) between 1 and 32),
  avatar_color text not null default '#63c8aa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 48),
  description text not null default '',
  is_public boolean not null default true,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists messages_room_created_at_idx on public.messages(room_id, created_at);
create index if not exists room_members_user_id_idx on public.room_members(user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(coalesce(new.email, '新朋友'), '@', 1)), 32)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;

revoke all on table public.profiles, public.rooms, public.room_members, public.messages from anon;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.rooms to authenticated;
grant select, insert, delete on table public.room_members to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
for select to authenticated using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "rooms_select_visible" on public.rooms;
create policy "rooms_select_visible" on public.rooms
for select to authenticated
using (
  is_public
  or owner_id = (select auth.uid())
  or exists (
    select 1 from public.room_members rm
    where rm.room_id = rooms.id and rm.user_id = (select auth.uid())
  )
);

drop policy if exists "rooms_insert_owner" on public.rooms;
create policy "rooms_insert_owner" on public.rooms
for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "rooms_update_owner" on public.rooms;
create policy "rooms_update_owner" on public.rooms
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "rooms_delete_owner" on public.rooms;
create policy "rooms_delete_owner" on public.rooms
for delete to authenticated using (owner_id = (select auth.uid()));

-- 当前版本允许用户为自己加入公共会话；私密成员管理可以在后续扩展。
drop policy if exists "room_members_select_self" on public.room_members;
create policy "room_members_select_self" on public.room_members
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "room_members_insert_self" on public.room_members;
create policy "room_members_insert_self" on public.room_members
for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "room_members_delete_self" on public.room_members;
create policy "room_members_delete_self" on public.room_members
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "messages_select_visible_room" on public.messages;
create policy "messages_select_visible_room" on public.messages
for select to authenticated
using (
  exists (
    select 1 from public.rooms r
    where r.id = messages.room_id
      and (
        r.is_public
        or r.owner_id = (select auth.uid())
        or exists (
          select 1 from public.room_members rm
          where rm.room_id = r.id and rm.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "messages_insert_self_visible_room" on public.messages;
create policy "messages_insert_self_visible_room" on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.rooms r
    where r.id = messages.room_id
      and (
        r.is_public
        or r.owner_id = (select auth.uid())
        or exists (
          select 1 from public.room_members rm
          where rm.room_id = r.id and rm.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "messages_update_self" on public.messages;
create policy "messages_update_self" on public.messages
for update to authenticated
using (sender_id = (select auth.uid()))
with check (sender_id = (select auth.uid()));

drop policy if exists "messages_delete_self" on public.messages;
create policy "messages_delete_self" on public.messages
for delete to authenticated using (sender_id = (select auth.uid()));

-- 将消息表加入 Realtime 发布列表。重复执行也不会报错。
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

alter table public.messages replica identity full;
