-- For My Sons / Wanko Cloud
-- Run once in the Supabase SQL editor after creating the project.
-- Then enable Email auth (and email confirmation if desired).

create table if not exists public.wankos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  creator text not null default 'paint',
  image_path text not null,
  stats jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wankos_user_created_idx
  on public.wankos (user_id, created_at desc);

alter table public.wankos enable row level security;
revoke all on table public.wankos from anon, authenticated;
grant select, insert, update on table public.wankos to authenticated;

drop policy if exists "wankos_select_own" on public.wankos;
create policy "wankos_select_own"
  on public.wankos for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "wankos_insert_own" on public.wankos;
create policy "wankos_insert_own"
  on public.wankos for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "wankos_update_own" on public.wankos;
create policy "wankos_update_own"
  on public.wankos for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create table if not exists public.wanko_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_wanko_id uuid references public.wankos(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.wanko_profiles enable row level security;
revoke all on table public.wanko_profiles from anon, authenticated;
grant select, insert, update on table public.wanko_profiles to authenticated;

drop policy if exists "wanko_profiles_select_own" on public.wanko_profiles;
create policy "wanko_profiles_select_own"
  on public.wanko_profiles for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "wanko_profiles_insert_own" on public.wanko_profiles;
create policy "wanko_profiles_insert_own"
  on public.wanko_profiles for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "wanko_profiles_update_own" on public.wanko_profiles;
create policy "wanko_profiles_update_own"
  on public.wanko_profiles for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wanko-images', 'wanko-images', false, 5242880, array['image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wanko_images_insert_own" on storage.objects;
create policy "wanko_images_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wanko-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and storage.extension(name) = 'png'
  );

drop policy if exists "wanko_images_update_own" on storage.objects;
create policy "wanko_images_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'wanko-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'wanko-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and storage.extension(name) = 'png'
  );

drop policy if exists "wanko_images_select_own" on storage.objects;
create policy "wanko_images_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'wanko-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
