-- Subjects ("matérias"). Phase 2 creates them from the onboarding chips; topics, assessments and
-- the rest of the CRUD arrive in phase 3.

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  -- Portuguese keys, shared with lib/subjects/colors.ts.
  color text not null check (color in ('amarelo', 'rosa', 'verde', 'celeste', 'lilas')),
  -- lucide icon name (kebab-case), e.g. "person-standing".
  icon text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$'),
  schedule text check (char_length(schedule) <= 80),
  professor text check (char_length(professor) <= 80),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subjects_user_id_idx on public.subjects (user_id);
-- No two active subjects with the same name (also makes the onboarding safe to resubmit).
create unique index subjects_user_name_active_key on public.subjects (user_id, lower(trim(name))) where not archived;

create trigger subjects_set_updated_at
before update on public.subjects
for each row execute function public.set_updated_at();

alter table public.subjects enable row level security;

create policy "subjects: owner reads"
on public.subjects for select
to authenticated
using (user_id = (select auth.uid()));

create policy "subjects: owner inserts"
on public.subjects for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "subjects: owner updates"
on public.subjects for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "subjects: owner deletes"
on public.subjects for delete
to authenticated
using (user_id = (select auth.uid()));

revoke all on public.subjects from anon;
