-- Phase 6: summaries and tests (sections 5, 7.5 and 7.12). The AI is called by the app Route
-- Handlers with her session, so RLS decides here as everywhere; the daily quota is reserved by
-- functions of this file, which she cannot skip.

-- ---------------------------------------------------------------------------------------------
-- summaries: a summary in topics, made from one or more documents. `content` is validated by the
-- app (lib/ai/schemas.ts); here only its kind and size.
-- ---------------------------------------------------------------------------------------------
create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- No foreign key on an array: a deleted file leaves its id here, and the screen says it is gone.
  document_ids uuid[] not null default '{}' check (cardinality(document_ids) <= 50),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 524288),
  detail text not null check (detail in ('curto', 'medio', 'completo')),
  focus text check (char_length(focus) <= 200),
  -- SHA-256 of what was asked (texts + options): the same request does not spend quota again.
  input_key text check (input_key ~ '^[0-9a-f]{64}$'),
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 80),
  edited_by_user boolean not null default false,
  version integer not null default 1 check (version between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);
create index summaries_user_created_idx on public.summaries (user_id, created_at desc);
create index summaries_user_key_idx on public.summaries (user_id, input_key);
create index summaries_subject_idx on public.summaries (subject_id);

create trigger summaries_set_updated_at before update on public.summaries
for each row execute function public.set_updated_at();

alter table public.summaries enable row level security;
create policy "summaries: owner reads" on public.summaries for select to authenticated
using (user_id = (select auth.uid()));
create policy "summaries: owner inserts" on public.summaries for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "summaries: owner updates" on public.summaries for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "summaries: owner deletes" on public.summaries for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.summaries from anon, authenticated;
grant select, delete on public.summaries to authenticated;
grant insert (id, subject_id, title, document_ids, content, detail, focus, input_key, provider, model)
  on public.summaries to authenticated;
grant update (subject_id, title, document_ids, content, detail, focus, input_key, provider, model, edited_by_user, version)
  on public.summaries to authenticated;
grant all on public.summaries to service_role;

-- ---------------------------------------------------------------------------------------------
-- questions: the question bank. Reused between tests; flagged ones are never suggested again.
--   multipla_escolha, caso_clinico: options = ["…", …] (4 or 5), answer = {"index": n}
--   verdadeiro_falso:               options = null,            answer = {"value": true|false}
--   associacao:                     options = {"left": […], "right": […]}, answer = {"match": [j, …]}
--                                   (left item i goes with right item match[i])
--   resposta_curta:                 options = null,            answer = {"text": "…"}
-- ---------------------------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  document_id uuid,
  summary_id uuid,
  topic text not null check (char_length(btrim(topic)) between 1 and 120),
  difficulty text not null check (difficulty in ('facil', 'medio', 'dificil')),
  type text not null check (type in ('multipla_escolha', 'verdadeiro_falso', 'associacao', 'caso_clinico', 'resposta_curta')),
  statement text not null check (char_length(btrim(statement)) between 1 and 4000),
  options jsonb check (options is null or (jsonb_typeof(options) in ('array', 'object') and pg_column_size(options) <= 16384)),
  answer jsonb not null check (jsonb_typeof(answer) = 'object' and pg_column_size(answer) <= 4096),
  explanation text not null default '' check (char_length(explanation) <= 2000),
  -- {"documentId": "…", "page": n, "excerpt": "…"}; null only for questions she wrote.
  source jsonb check (source is null or (jsonb_typeof(source) = 'object' and pg_column_size(source) <= 4096)),
  status text not null default 'gerada' check (status in ('gerada', 'aprovada', 'descartada', 'sinalizada')),
  origin text not null default 'ia' check (origin in ('ia', 'manual')),
  -- Same request, same questions (no quota spent again).
  batch_key text check (batch_key ~ '^[0-9a-f]{64}$'),
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (origin = 'manual' or source is not null),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete set null (document_id),
  foreign key (summary_id, user_id) references public.summaries (id, user_id) on delete set null (summary_id)
);
create index questions_user_status_idx on public.questions (user_id, status);
create index questions_user_batch_idx on public.questions (user_id, batch_key);
create index questions_subject_idx on public.questions (subject_id);
create index questions_document_idx on public.questions (document_id);
create index questions_summary_idx on public.questions (summary_id);

create trigger questions_set_updated_at before update on public.questions
for each row execute function public.set_updated_at();

alter table public.questions enable row level security;
create policy "questions: owner reads" on public.questions for select to authenticated
using (user_id = (select auth.uid()));
create policy "questions: owner inserts" on public.questions for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "questions: owner updates" on public.questions for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "questions: owner deletes" on public.questions for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.questions from anon, authenticated;
grant select, delete on public.questions to authenticated;
grant insert (id, subject_id, document_id, summary_id, topic, difficulty, type, statement, options, answer,
  explanation, source, status, origin, batch_key, provider, model) on public.questions to authenticated;
grant update (subject_id, topic, difficulty, type, statement, options, answer, explanation, status)
  on public.questions to authenticated;
grant all on public.questions to service_role;

-- ---------------------------------------------------------------------------------------------
-- tests: a saved test (title, subject, options and its questions in order), redone at will.
-- ---------------------------------------------------------------------------------------------
create table public.tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- {difficulties, types, topics, count, mode, timeLimitMin, shuffle, sources: {documentIds, summaryIds}}
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 32768),
  question_ids uuid[] not null check (cardinality(question_ids) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);
create index tests_user_created_idx on public.tests (user_id, created_at desc);
create index tests_subject_idx on public.tests (subject_id);

create trigger tests_set_updated_at before update on public.tests
for each row execute function public.set_updated_at();

alter table public.tests enable row level security;
create policy "tests: owner reads" on public.tests for select to authenticated
using (user_id = (select auth.uid()));
create policy "tests: owner inserts" on public.tests for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "tests: owner updates" on public.tests for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "tests: owner deletes" on public.tests for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.tests from anon, authenticated;
grant select, delete on public.tests to authenticated;
grant insert (id, subject_id, title, config, question_ids) on public.tests to authenticated;
grant update (subject_id, title, config, question_ids) on public.tests to authenticated;
grant all on public.tests to service_role;

-- ---------------------------------------------------------------------------------------------
-- test_attempts and attempt_answers. Made on the device (also offline) and sent later. Whether an
-- answer is right and the final score are worked out here, from the bank, so the points of the
-- ranking (phase 9) cannot be typed in.
-- ---------------------------------------------------------------------------------------------
create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  test_id uuid not null,
  mode text not null check (mode in ('treino', 'prova')),
  -- The order she saw (a redo of the wrong ones is a new test; this keeps a shuffle).
  question_ids uuid[] not null check (cardinality(question_ids) between 1 and 60),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score numeric(5, 2) check (score between 0 and 100),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not completed or (finished_at is not null and score is not null)),
  check (finished_at is null or finished_at >= started_at),
  unique (id, user_id),
  foreign key (test_id, user_id) references public.tests (id, user_id) on delete cascade
);
create index test_attempts_test_idx on public.test_attempts (test_id, started_at desc);
create index test_attempts_user_finished_idx on public.test_attempts (user_id, finished_at desc);

create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  attempt_id uuid not null,
  question_id uuid not null,
  -- Same shape as questions.answer: {"index"}, {"value"}, {"match"} or {"text"}. Null: left blank.
  response jsonb check (response is null or (jsonb_typeof(response) = 'object' and pg_column_size(response) <= 8192)),
  -- Set by the database (attempt_answers_grade). Short answers: from her self-assessment.
  correct boolean,
  time_ms integer not null default 0 check (time_ms between 0 and 86400000),
  self_assessment text check (self_assessment in ('acertei', 'parcial', 'errei')),
  -- "Marcar para revisar" on the question map.
  marked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id),
  foreign key (attempt_id, user_id) references public.test_attempts (id, user_id) on delete cascade,
  foreign key (question_id, user_id) references public.questions (id, user_id) on delete cascade
);
create index attempt_answers_user_idx on public.attempt_answers (user_id);
create index attempt_answers_question_idx on public.attempt_answers (question_id);

create trigger test_attempts_set_updated_at before update on public.test_attempts
for each row execute function public.set_updated_at();
create trigger attempt_answers_set_updated_at before update on public.attempt_answers
for each row execute function public.set_updated_at();

-- Right or wrong, from the bank. Answers of a finished attempt do not change.
create or replace function public.attempt_answers_grade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
  done boolean;
begin
  select completed into done from public.test_attempts where id = new.attempt_id;
  if done then
    raise exception 'attempt_answers: the attempt is finished' using errcode = 'LQ010';
  end if;
  select type, answer into q from public.questions where id = new.question_id and user_id = new.user_id;

  new.correct := case
    when q.type = 'resposta_curta' then
      case new.self_assessment when 'acertei' then true when 'errei' then false else null end
    when new.response is null then null
    when q.type in ('multipla_escolha', 'caso_clinico') then
      jsonb_typeof(new.response -> 'index') = 'number' and (new.response -> 'index') = (q.answer -> 'index')
    when q.type = 'verdadeiro_falso' then
      jsonb_typeof(new.response -> 'value') = 'boolean' and (new.response -> 'value') = (q.answer -> 'value')
    when q.type = 'associacao' then
      jsonb_typeof(new.response -> 'match') = 'array' and (new.response -> 'match') = (q.answer -> 'match')
    else null
  end;
  return new;
end;
$$;
revoke all on function public.attempt_answers_grade() from public, anon, authenticated;

create trigger attempt_answers_grade before insert or update on public.attempt_answers
for each row execute function public.attempt_answers_grade();

-- Score when the attempt is finished: right = 1, "parcial" = 0.5, wrong or blank = 0, over every
-- question of the attempt. A finished attempt does not change any more.
create or replace function public.test_attempts_finish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  credit numeric;
begin
  if tg_op = 'UPDATE' and old.completed then
    raise exception 'test_attempts: the attempt is finished' using errcode = 'LQ010';
  end if;
  if not new.completed then
    new.score := null;
    return new;
  end if;
  new.finished_at := coalesce(new.finished_at, now());
  if new.finished_at < new.started_at then
    new.finished_at := new.started_at;
  end if;
  select coalesce(sum(case
      when a.correct then 1
      when a.self_assessment = 'parcial' then 0.5
      else 0
    end), 0)
  into credit
  from public.attempt_answers a
  where a.attempt_id = new.id and a.question_id = any (new.question_ids);
  new.score := round(100 * credit / cardinality(new.question_ids), 2);
  return new;
end;
$$;
revoke all on function public.test_attempts_finish() from public, anon, authenticated;

create trigger test_attempts_finish before insert or update on public.test_attempts
for each row execute function public.test_attempts_finish();

alter table public.test_attempts enable row level security;
create policy "test_attempts: owner reads" on public.test_attempts for select to authenticated
using (user_id = (select auth.uid()));
create policy "test_attempts: owner inserts" on public.test_attempts for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "test_attempts: owner updates" on public.test_attempts for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "test_attempts: owner deletes" on public.test_attempts for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.test_attempts from anon, authenticated;
grant select, delete on public.test_attempts to authenticated;
-- Created open; finished by an update after its answers (the score is worked out then).
grant insert (id, test_id, mode, question_ids, started_at) on public.test_attempts to authenticated;
grant update (finished_at, completed) on public.test_attempts to authenticated;
grant all on public.test_attempts to service_role;

alter table public.attempt_answers enable row level security;
create policy "attempt_answers: owner reads" on public.attempt_answers for select to authenticated
using (user_id = (select auth.uid()));
create policy "attempt_answers: owner inserts" on public.attempt_answers for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "attempt_answers: owner updates" on public.attempt_answers for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.attempt_answers from anon, authenticated;
grant select on public.attempt_answers to authenticated;
grant insert (id, attempt_id, question_id, response, time_ms, self_assessment, marked) on public.attempt_answers to authenticated;
grant update (response, time_ms, self_assessment, marked) on public.attempt_answers to authenticated;
grant all on public.attempt_answers to service_role;

-- ---------------------------------------------------------------------------------------------
-- AI quota (section 7.12). The free Gemini quota is per Google project, so it is shared by
-- everyone: besides her own limit per day (São Paulo), the app has one for the whole project per
-- day (Pacific, when Google resets it). Nobody reads or writes these tables directly.
-- ---------------------------------------------------------------------------------------------
create table public.ai_limits (
  id boolean primary key default true check (id),
  per_user_summaries integer not null check (per_user_summaries between 0 and 1000),
  per_user_question_runs integer not null check (per_user_question_runs between 0 and 1000),
  -- Requests to the provider, for everyone together.
  app_daily_requests integer not null check (app_daily_requests between 0 and 100000),
  updated_at timestamptz not null default now()
);
insert into public.ai_limits (per_user_summaries, per_user_question_runs, app_daily_requests)
values (10, 15, 400);

create trigger ai_limits_set_updated_at before update on public.ai_limits
for each row execute function public.set_updated_at();

alter table public.ai_limits enable row level security;
revoke all on public.ai_limits from anon, authenticated;
grant all on public.ai_limits to service_role;

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  app_day date not null,
  operation text not null check (operation in ('resumo', 'questoes')),
  status text not null default 'reservado' check (status in ('reservado', 'ok', 'falhou')),
  requests integer not null default 1 check (requests between 0 and 100),
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 80),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage (user_id, day);
create index ai_usage_app_day_idx on public.ai_usage (app_day);

create trigger ai_usage_set_updated_at before update on public.ai_usage
for each row execute function public.set_updated_at();

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant all on public.ai_usage to service_role;

-- What counts: done, or still running (a reservation older than 10 minutes was lost).
create or replace function public.ai_usage_counts(u public.ai_usage)
returns boolean
language sql
stable
set search_path = ''
as $$
  select u.status = 'ok' or (u.status = 'reservado' and u.created_at > now() - interval '10 minutes');
$$;
revoke all on function public.ai_usage_counts(public.ai_usage) from public, anon, authenticated;

-- Reserves one summary or one question run before calling the provider. Errors:
-- LQ002 her limit for today; LQ003 the app limit for today. Returns the reservation id, which
-- only the server sees.
create or replace function public.ai_reserve(p_operation text, p_requests integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  limits public.ai_limits;
  sp_day date := (now() at time zone 'America/Sao_Paulo')::date;
  google_day date := (now() at time zone 'America/Los_Angeles')::date;
  used integer;
  allowed integer;
  app_used integer;
  reserved uuid;
begin
  if uid is null then
    raise exception 'ai_reserve: not signed in' using errcode = '42501';
  end if;
  if p_operation not in ('resumo', 'questoes') or p_requests not between 1 and 100 then
    raise exception 'ai_reserve: invalid arguments' using errcode = '22023';
  end if;
  -- One at a time: two requests cannot both squeeze under a limit.
  perform pg_advisory_xact_lock(hashtextextended('ai_usage', 0));
  select * into limits from public.ai_limits where id;

  select count(*) into used from public.ai_usage u
  where u.user_id = uid and u.day = sp_day and u.operation = p_operation and public.ai_usage_counts(u);
  if p_operation = 'resumo' then
    allowed := limits.per_user_summaries;
  else
    allowed := limits.per_user_question_runs;
  end if;
  if used >= allowed then
    raise exception 'ai_reserve: daily limit reached' using errcode = 'LQ002';
  end if;

  select coalesce(sum(u.requests), 0) into app_used from public.ai_usage u
  where u.app_day = google_day and public.ai_usage_counts(u);
  if app_used + p_requests > limits.app_daily_requests then
    raise exception 'ai_reserve: app limit reached' using errcode = 'LQ003';
  end if;

  insert into public.ai_usage (user_id, day, app_day, operation, requests)
  values (uid, sp_day, google_day, p_operation, p_requests)
  returning id into reserved;
  return reserved;
end;
$$;
revoke all on function public.ai_reserve(text, integer) from public, anon;
grant execute on function public.ai_reserve(text, integer) to authenticated;

-- Closes a reservation, once: done (counts) or failed (gives the generation back).
create or replace function public.ai_settle(
  p_id uuid,
  p_ok boolean,
  p_provider text,
  p_model text,
  p_requests integer,
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_usage
  set status = case when p_ok then 'ok' else 'falhou' end,
      provider = left(p_provider, 40),
      model = left(p_model, 80),
      requests = least(greatest(coalesce(p_requests, requests), 0), 100),
      input_tokens = greatest(p_input_tokens, 0),
      output_tokens = greatest(p_output_tokens, 0)
  where id = p_id and user_id = auth.uid() and status = 'reservado';
end;
$$;
revoke all on function public.ai_settle(uuid, boolean, text, text, integer, integer, integer) from public, anon;
grant execute on function public.ai_settle(uuid, boolean, text, text, integer, integer, integer) to authenticated;

-- "Restam N gerações hoje".
create or replace function public.ai_remaining()
returns table (summaries integer, question_runs integer, app_open boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with l as (select * from public.ai_limits where id),
  mine as (
    select u.operation, count(*)::integer as n from public.ai_usage u
    where u.user_id = auth.uid()
      and u.day = (now() at time zone 'America/Sao_Paulo')::date
      and public.ai_usage_counts(u)
    group by u.operation
  ),
  app as (
    select coalesce(sum(u.requests), 0)::integer as n from public.ai_usage u
    where u.app_day = (now() at time zone 'America/Los_Angeles')::date and public.ai_usage_counts(u)
  )
  select
    greatest(l.per_user_summaries - coalesce((select n from mine where operation = 'resumo'), 0), 0),
    greatest(l.per_user_question_runs - coalesce((select n from mine where operation = 'questoes'), 0), 0),
    (select n from app) < l.app_daily_requests
  from l
  where auth.uid() is not null;
$$;
revoke all on function public.ai_remaining() from public, anon;
grant execute on function public.ai_remaining() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- profiles: the AI privacy notice is shown once ("Entendi"), on any device.
-- ---------------------------------------------------------------------------------------------
alter table public.profiles add column ai_notice_accepted_at timestamptz;
grant update (ai_notice_accepted_at) on public.profiles to authenticated;
