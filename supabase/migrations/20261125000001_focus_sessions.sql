-- Focus sessions (section 5). The app records each completed session: written on the device first,
-- then sent here (lib/focus/sessions.ts). Sessions are facts: they can be added and read, not edited.
create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  kind text not null default 'foco' check (kind in ('foco', 'pausa')),
  started_at timestamptz not null,
  -- When the time was up, pauses included: not when the app noticed it.
  ended_at timestamptz not null,
  planned_min smallint not null check (planned_min between 1 and 180),
  actual_min smallint not null check (actual_min between 0 and 180),
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (actual_min <= planned_min),
  -- The time focused fits between start and end (1 s of tolerance).
  check (extract(epoch from (ended_at - started_at)) >= actual_min * 60 - 1),
  -- One session per start: sending again (two tabs, a lost answer) changes nothing.
  unique (user_id, started_at),
  -- Deleting the subject keeps the session, without subject (PostgreSQL 15+ column list).
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);
create index focus_sessions_user_ended_idx on public.focus_sessions (user_id, ended_at);
create index focus_sessions_subject_idx on public.focus_sessions (subject_id);

create trigger focus_sessions_set_updated_at before update on public.focus_sessions
for each row execute function public.set_updated_at();

alter table public.focus_sessions enable row level security;
create policy "focus_sessions: owner reads" on public.focus_sessions for select to authenticated
using (user_id = (select auth.uid()));
create policy "focus_sessions: owner inserts" on public.focus_sessions for insert to authenticated
with check (user_id = (select auth.uid()));

revoke all on public.focus_sessions from anon, authenticated;
grant select, insert on public.focus_sessions to authenticated;
grant all on public.focus_sessions to service_role;

-- One row per day (São Paulo) with focus, for the streak. security_invoker: the RLS above applies.
create view public.focus_days with (security_invoker = true) as
select
  user_id,
  (ended_at at time zone 'America/Sao_Paulo')::date as day,
  sum(actual_min)::integer as minutes
from public.focus_sessions
where kind = 'foco' and completed
group by user_id, (ended_at at time zone 'America/Sao_Paulo')::date;

revoke all on public.focus_days from anon, authenticated;
grant select on public.focus_days to authenticated;
grant select on public.focus_days to service_role;
