-- Phase 3: structured class schedule, syllabus topics, assessments and daily goals.
-- Every table: RLS (owner only) + explicit grants (hosted projects don't grant new tables to the
-- API roles automatically; see 20261123000002_explicit_grants.sql).

-- ---------------------------------------------------------------------------------------------
-- Subjects: the free-text schedule becomes a list of classes.
-- Each slot: {"day": 1-7 (ISO, 1 = Monday), "start": "HH:MM", "lab": bool, "room": "text"?}.
-- The app writes "Seg e Qua · 08h00 · lab" from it, sorts by next class, filters labs and draws
-- the week agenda. The UI validates each slot (Zod); the database guards the overall shape.
-- ---------------------------------------------------------------------------------------------
alter table public.subjects drop column schedule;

alter table public.subjects
  add column schedule_slots jsonb not null default '[]'::jsonb
  constraint subjects_schedule_slots_shape check (
    jsonb_typeof(schedule_slots) = 'array'
    and jsonb_array_length(schedule_slots) <= 14
    and not jsonb_path_exists(
      schedule_slots,
      '$[*] ? (!(@.day >= 1 && @.day <= 7) || !(@.start like_regex "^([01][0-9]|2[0-3]):[0-5][0-9]$"))'
    )
  );

-- Lets child tables reference (subject, owner) together, so a row can never point at someone
-- else's subject: the foreign key itself enforces ownership.
alter table public.subjects add constraint subjects_id_user_key unique (id, user_id);

-- ---------------------------------------------------------------------------------------------
-- Syllabus topics ("conteúdo do plano de ensino").
-- ---------------------------------------------------------------------------------------------
create table public.subject_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  done boolean not null default false,
  -- Fractional order: moving a topic writes only that row (midpoint between its neighbours).
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);
create index subject_topics_subject_idx on public.subject_topics (subject_id, position);
create index subject_topics_user_idx on public.subject_topics (user_id);

-- ---------------------------------------------------------------------------------------------
-- Assessments.
-- ---------------------------------------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  kind text not null check (kind in ('prova', 'pratica', 'seminario', 'entrega')),
  -- Calendar day in America/Sao_Paulo (no time zone shifts).
  date date not null,
  description text check (char_length(description) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);
create index assessments_user_date_idx on public.assessments (user_id, date);
create index assessments_subject_idx on public.assessments (subject_id);

-- ---------------------------------------------------------------------------------------------
-- Daily goals ("metas do dia"). Points (5 per completed goal) are computed by the ranking in
-- phase 9 from completed_at; unchecking clears it, which undoes the points.
-- ---------------------------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 120),
  duration_min smallint check (duration_min between 5 and 600),
  -- Optional fixed time ("Reunião da extensão · 16h").
  time_of_day time,
  date date not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deleting the subject keeps the goal, without subject (PostgreSQL 15+ column list).
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);
create index goals_user_date_idx on public.goals (user_id, date);

-- ---------------------------------------------------------------------------------------------
-- updated_at, RLS and privileges for the three tables.
-- ---------------------------------------------------------------------------------------------
create trigger subject_topics_set_updated_at before update on public.subject_topics
for each row execute function public.set_updated_at();
create trigger assessments_set_updated_at before update on public.assessments
for each row execute function public.set_updated_at();
create trigger goals_set_updated_at before update on public.goals
for each row execute function public.set_updated_at();

alter table public.subject_topics enable row level security;
alter table public.assessments enable row level security;
alter table public.goals enable row level security;

create policy "subject_topics: owner reads" on public.subject_topics for select to authenticated
using (user_id = (select auth.uid()));
create policy "subject_topics: owner inserts" on public.subject_topics for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "subject_topics: owner updates" on public.subject_topics for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "subject_topics: owner deletes" on public.subject_topics for delete to authenticated
using (user_id = (select auth.uid()));

create policy "assessments: owner reads" on public.assessments for select to authenticated
using (user_id = (select auth.uid()));
create policy "assessments: owner inserts" on public.assessments for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "assessments: owner updates" on public.assessments for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "assessments: owner deletes" on public.assessments for delete to authenticated
using (user_id = (select auth.uid()));

create policy "goals: owner reads" on public.goals for select to authenticated
using (user_id = (select auth.uid()));
create policy "goals: owner inserts" on public.goals for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "goals: owner updates" on public.goals for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "goals: owner deletes" on public.goals for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.subject_topics, public.assessments, public.goals from anon, authenticated;
grant select, insert, update, delete on public.subject_topics, public.assessments, public.goals to authenticated;
grant all on public.subject_topics, public.assessments, public.goals to service_role;
