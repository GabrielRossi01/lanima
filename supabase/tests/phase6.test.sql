-- Phase 6: summaries, question bank, tests, attempts and the AI quota. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(44);

-- Privileges.
select table_privs_are('public', 'summaries', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: reads and deletes summaries');
select table_privs_are('public', 'summaries', 'anon', array[]::text[], 'anon: nothing on summaries');
select table_privs_are('public', 'questions', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: reads and deletes questions');
select column_privs_are('public', 'questions', 'batch_key', 'authenticated', array['INSERT', 'SELECT'], 'the batch of a question never changes');
select table_privs_are('public', 'tests', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: reads and deletes tests');
select table_privs_are('public', 'test_attempts', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: reads and deletes attempts');
select column_privs_are('public', 'test_attempts', 'score', 'authenticated', array['SELECT'], 'the score is never written by her');
select column_privs_are('public', 'test_attempts', 'completed', 'authenticated', array['SELECT', 'UPDATE'], 'an attempt is finished by an update');
select table_privs_are('public', 'attempt_answers', 'authenticated', array['SELECT'], 'answers are never deleted one by one');
select column_privs_are('public', 'attempt_answers', 'correct', 'authenticated', array['SELECT'], 'right or wrong is never written by her');
select table_privs_are('public', 'ai_usage', 'authenticated', array[]::text[], 'nobody reads the usage directly');
select table_privs_are('public', 'ai_limits', 'authenticated', array[]::text[], 'nor the limits');
select function_privs_are('public', 'ai_reserve', array['text', 'integer'], 'anon', array[]::text[], 'anon cannot reserve');
select function_privs_are('public', 'ai_reserve', array['text', 'integer'], 'authenticated', array['EXECUTE'], 'she can reserve');
select function_privs_are('public', 'attempt_answers_grade', array[]::text[], 'authenticated', array[]::text[], 'nobody calls the grading');
select column_privs_are('public', 'profiles', 'ai_notice_accepted_at', 'authenticated', array['SELECT', 'UPDATE'], 'the AI notice is accepted once');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'ana@p6.test', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bia@p6.test', '{}', now(), now());
insert into public.subjects (id, user_id, name, color) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bioquímica', 'rosa'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Anatomia', 'verde');
-- Bia: a file read, a summary, a question, a test.
insert into public.files (id, user_id, subject_id, name, kind, mime_type, size_bytes, storage_path, sha256) values
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'Enzimas.pdf', 'pdf', 'application/pdf', 1000, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b0000000-0000-4000-8000-000000000001', repeat('b', 64));
insert into public.documents (id, user_id, file_id) values
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001');
insert into public.summaries (id, user_id, subject_id, title, content, detail) values
  ('b2000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Enzimas', '{"titulo": "Enzimas"}', 'medio');
insert into public.questions (id, user_id, document_id, topic, difficulty, type, statement, answer, source) values
  ('b3000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b1000000-0000-4000-8000-000000000001',
   'Enzimas', 'facil', 'verdadeiro_falso', 'Enzimas aceleram reações.', '{"value": true}',
   '{"documentId": "b1000000-0000-4000-8000-000000000001", "page": 1, "excerpt": "aceleram"}');
insert into public.tests (id, user_id, title, question_ids) values
  ('b4000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Enzimas', array['b3000000-0000-4000-8000-000000000001'::uuid]);
-- Small limits, to reach them here, on a day with no other use (the E2E runs leave theirs in a
-- local database).
delete from public.ai_usage;
update public.ai_limits set per_user_summaries = 2, per_user_question_runs = 1, app_daily_requests = 5;
-- A reservation of Bia, still open.
insert into public.ai_usage (id, user_id, day, app_day, operation) values
  ('b5000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   (now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Los_Angeles')::date, 'resumo');

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

-- Ana sees nothing of Bia, and cannot use it.
select is_empty('select 1 from public.summaries', 'Ana does not see the summaries of Bia');
select is_empty('select 1 from public.questions', 'nor her questions');
select is_empty('select 1 from public.tests', 'nor her tests');
select throws_ok(
  $$ insert into public.questions (topic, difficulty, type, statement, answer, origin, subject_id) values
     ('x', 'facil', 'verdadeiro_falso', 'x', '{"value": true}', 'manual', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') $$,
  '23503', null, 'Ana cannot put a question in a subject of Bia');
select throws_ok(
  $$ insert into public.questions (topic, difficulty, type, statement, answer, source, document_id) values
     ('x', 'facil', 'verdadeiro_falso', 'x', '{"value": true}', '{"page": 1}', 'b1000000-0000-4000-8000-000000000001') $$,
  '23503', null, 'nor tie a question to a reading of Bia');
select throws_ok(
  $$ insert into public.test_attempts (test_id, mode, question_ids) values
     ('b4000000-0000-4000-8000-000000000001', 'treino', array['b3000000-0000-4000-8000-000000000001'::uuid]) $$,
  '23503', null, 'nor take a test of Bia');
select throws_ok(
  $$ insert into public.questions (topic, difficulty, type, statement, answer) values ('x', 'facil', 'verdadeiro_falso', 'x', '{"value": true}') $$,
  '23514', null, 'a generated question needs its source');

-- Her own test: one question of each kind that is graded.
insert into public.questions (id, subject_id, topic, difficulty, type, statement, options, answer, origin) values
  ('a3000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Ossos', 'facil', 'multipla_escolha', 'Quantos ossos?', '["196","206","216","226"]', '{"index": 1}', 'manual'),
  ('a3000000-0000-4000-8000-000000000002', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Ossos', 'facil', 'verdadeiro_falso', 'O fêmur é o maior osso.', null, '{"value": true}', 'manual'),
  ('a3000000-0000-4000-8000-000000000003', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Ossos', 'medio', 'associacao', 'Associe.', '{"left": ["a","b"], "right": ["B","A"]}', '{"match": [1, 0]}', 'manual'),
  ('a3000000-0000-4000-8000-000000000004', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Ossos', 'dificil', 'resposta_curta', 'O que é a diáfise?', null, '{"text": "O corpo do osso longo."}', 'manual');
insert into public.tests (id, subject_id, title, question_ids) values
  ('a4000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Ossos', array[
    'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000004']::uuid[]);
insert into public.test_attempts (id, test_id, mode, question_ids) values
  ('a6000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'prova', array[
    'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000004']::uuid[]);
insert into public.attempt_answers (attempt_id, question_id, response, self_assessment) values
  ('a6000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', '{"index": 1}', null),
  ('a6000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', '{"value": false}', null),
  ('a6000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', '{"match": [1, 0]}', null),
  ('a6000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000004', '{"text": "O corpo"}', 'parcial');

select results_eq(
  $$ select question_id::text, correct from public.attempt_answers order by question_id $$,
  $$ values ('a3000000-0000-4000-8000-000000000001', true), ('a3000000-0000-4000-8000-000000000002', false),
            ('a3000000-0000-4000-8000-000000000003', true), ('a3000000-0000-4000-8000-000000000004', null::boolean) $$,
  'the database grades each answer from the bank');
select throws_ok(
  $$ update public.attempt_answers set correct = true where question_id = 'a3000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'she cannot mark a wrong answer as right');
select lives_ok(
  $$ update public.attempt_answers set response = '{"index": "1"}' where question_id = 'a3000000-0000-4000-8000-000000000001' $$,
  'a malformed answer is accepted');
select is(
  (select correct from public.attempt_answers where question_id = 'a3000000-0000-4000-8000-000000000001'),
  false, 'but it is not right');
update public.attempt_answers set response = '{"index": 1}' where question_id = 'a3000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ update public.test_attempts set score = 100 where id = 'a6000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'she cannot write the score');
update public.test_attempts set completed = true where id = 'a6000000-0000-4000-8000-000000000001';
select is(
  (select score from public.test_attempts where id = 'a6000000-0000-4000-8000-000000000001'),
  62.50::numeric, 'score: right 1, partial 0.5, wrong 0, over all the questions');
select isnt((select finished_at from public.test_attempts where id = 'a6000000-0000-4000-8000-000000000001'), null, 'and the end is set');
select throws_ok(
  $$ update public.attempt_answers set response = '{"value": true}' where question_id = 'a3000000-0000-4000-8000-000000000002' $$,
  'LQ010', null, 'answers of a finished attempt do not change');
select throws_ok(
  $$ update public.test_attempts set completed = false where id = 'a6000000-0000-4000-8000-000000000001' $$,
  'LQ010', null, 'nor does the attempt');

-- Quota: 2 summaries and 1 question run for her, 5 requests for the whole app (1 is Bia's).
select throws_ok('select 1 from public.ai_usage', '42501', null, 'she cannot read the usage');
select isnt(set_config('test.failed', public.ai_reserve('resumo', 1)::text, true), null, 'first summary reserved');
select lives_ok($$ select public.ai_reserve('resumo', 1) $$, 'second summary reserved');
select throws_ok($$ select public.ai_reserve('resumo', 1) $$, 'LQ002', null, 'the third one is over her limit');
select results_eq('select summaries, question_runs, app_open from public.ai_remaining()', $$ values (0, 1, true) $$, 'none left today');

-- A failed generation gives it back; a closed reservation does not change any more.
select lives_ok($$ select public.ai_settle(current_setting('test.failed')::uuid, false, 'google', 'm', 1, 10, 0) $$, 'the provider failed');
select results_eq('select summaries from public.ai_remaining()', $$ values (1) $$, 'so one summary is back');
select lives_ok($$ select public.ai_settle(current_setting('test.failed')::uuid, true, 'google', 'm', 1, 10, 5) $$, 'closing it again');
select results_eq('select summaries from public.ai_remaining()', $$ values (1) $$, 'changes nothing');

-- Bia's open reservation cannot be closed by Ana.
select lives_ok($$ select public.ai_settle('b5000000-0000-4000-8000-000000000001', false, 'x', 'x', 0, 0, 0) $$, 'Ana tries to close the reservation of Bia');
reset role;
select is((select status from public.ai_usage where id = 'b5000000-0000-4000-8000-000000000001'), 'reservado', 'it stays open');
set local role authenticated;

-- The whole app: 1 (Bia) + 1 (Ana) already count; 4 more requests is over 5.
select throws_ok($$ select public.ai_reserve('questoes', 4) $$, 'LQ003', null, 'over the app limit for today');

select * from finish();
rollback;
