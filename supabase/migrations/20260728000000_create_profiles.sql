-- Profiles: one row per auth user, holding app-level profile data.
-- auth.users itself is owned by GoTrue and must not be modified directly.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile for each auth user. Created automatically by handle_new_user().';

alter table public.profiles enable row level security;

-- A user may read only their own profile.
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- A user may update only their own profile. The WITH CHECK clause stops them from
-- reassigning the row to somebody else.
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert or delete policy: rows are created by the trigger below and removed by the
-- cascade from auth.users. Without a policy, RLS denies those operations by default.

-- Auto-create a profile whenever a user signs up.
--
-- SECURITY DEFINER so the insert runs as the function owner and bypasses RLS; the
-- empty search_path prevents a malicious schema on the caller's path from hijacking
-- unqualified name resolution.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- OAuth providers supply a name; email sign-ups do not, so this may be null.
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
