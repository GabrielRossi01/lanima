-- Profiles: one row per auth user, created by a trigger on sign-up.
-- Column names are in English; the UI is in Portuguese (see PROMPT_CLAUDE_CODE.md, section 5).

-- Shared trigger function: keeps updated_at current on every table that has it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  course text not null default 'Biomedicina' check (char_length(course) <= 80),
  institution text not null default '' check (char_length(institution) <= 120),
  semester smallint check (semester between 1 and 12),
  -- Path inside the private "avatars" bucket; always under the owner's folder.
  avatar_path text check (avatar_path is null or avatar_path like id::text || '/%'),
  daily_focus_goal_min smallint not null default 120 check (daily_focus_goal_min between 30 and 360),
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  show_in_ranking boolean not null default true,
  -- Null until the onboarding is finished; the app routes new users to /boas-vindas.
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Lanima user profile. Group members will read a limited view of it (phase 9), never this table.';

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- New auth user -> profile row. Google sign-ups bring their name in the metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 60)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS: each user reads and edits only her own profile. Rows are created by the trigger and deleted
-- with the auth user (cascade), so there are no insert/delete policies.
alter table public.profiles enable row level security;

create policy "profiles: owner reads"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy "profiles: owner updates"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Column privileges: the id and the timestamps are never written by the client.
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant update (
  name,
  course,
  institution,
  semester,
  avatar_path,
  daily_focus_goal_min,
  theme,
  show_in_ranking,
  onboarding_completed_at
) on public.profiles to authenticated;
