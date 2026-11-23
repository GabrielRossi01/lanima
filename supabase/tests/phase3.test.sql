-- Phase 3: topics, assessments, goals and the structured schedule. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

-- Exact privileges (independent of the project's default privileges).
select table_privs_are('public', 'subject_topics', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: CRUD on subject_topics');
select table_privs_are('public', 'assessments', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: CRUD on assessments');
select table_privs_are('public', 'goals', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: CRUD on goals');
select table_privs_are('public', 'subject_topics', 'anon', array[]::text[], 'anon: nothing on subject_topics');
select table_privs_are('public', 'assessments', 'anon', array[]::text[], 'anon: nothing on assessments');
select table_privs_are('public', 'goals', 'anon', array[]::text[], 'anon: nothing on goals');

-- Two users; Bia owns a subject with a topic, an assessment and a goal.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'ana@p3.test', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bia@p3.test', '{}', now(), now());

insert into public.subjects (id, user_id, name, color) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bioquímica', 'rosa'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Anatomia', 'celeste');
insert into public.subject_topics (id, user_id, subject_id, title) values
  ('c1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Enzimas');
insert into public.assessments (id, user_id, subject_id, title, kind, date) values
  ('c2000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'P1', 'prova', current_date + 6);
insert into public.goals (id, user_id, subject_id, title, date) values
  ('c3000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Revisar enzimas', current_date);

-- Ana signs in.
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

select is_empty($$ select 1 from public.subject_topics $$, 'Ana sees no topics of Bia');
select is_empty($$ select 1 from public.assessments $$, 'Ana sees no assessments of Bia');
select is_empty($$ select 1 from public.goals $$, 'Ana sees no goals of Bia');

select throws_ok(
  $$ insert into public.subject_topics (subject_id, title) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Intrusa') $$,
  '23503', null, 'a topic cannot hang on someone else''s subject (foreign key on subject + owner)'
);
select throws_ok(
  $$ insert into public.subject_topics (user_id, subject_id, title) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Intrusa') $$,
  '42501', null, 'Ana cannot create rows owned by Bia'
);
select throws_ok(
  $$ insert into public.goals (subject_id, title, date) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Intrusa', current_date) $$,
  '23503', null, 'a goal cannot point at someone else''s subject'
);

update public.subject_topics set done = true;
update public.goals set completed_at = now();
delete from public.assessments;

select lives_ok(
  $$ insert into public.subject_topics (subject_id, title, position) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Sistema esquelético', 1) $$,
  'Ana adds a topic to her own subject'
);
select lives_ok(
  $$ insert into public.goals (subject_id, title, duration_min, date) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Revisar ossos', 30, current_date) $$,
  'Ana adds a goal'
);
select throws_ok(
  $$ insert into public.assessments (subject_id, title, kind, date) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'P1', 'quiz', current_date) $$,
  '23514', null, 'assessment kind is one of prova, pratica, seminario, entrega'
);
select throws_ok(
  $$ update public.subjects set schedule_slots = '[{"day": 9, "start": "08:00", "lab": false}]' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  '23514', null, 'class day is 1 (Monday) to 7'
);
select throws_ok(
  $$ update public.subjects set schedule_slots = '[{"day": 1, "start": "8h", "lab": false}]' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  '23514', null, 'class time is HH:MM'
);
select lives_ok(
  $$ update public.subjects set schedule_slots = '[{"day": 1, "start": "08:00", "lab": false, "room": "Sala 204"}, {"day": 3, "start": "14:00", "lab": true}]' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  'a valid schedule is saved'
);

-- Deleting her subject: topics go with it, the goal stays without subject.
delete from public.subjects where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select is_empty($$ select 1 from public.subject_topics $$, 'topics are deleted with the subject');
select results_eq(
  $$ select title, subject_id from public.goals $$,
  $$ values ('Revisar ossos'::text, null::uuid) $$,
  'the goal stays, without subject'
);

-- Back as the owner of the database: Bia's rows are untouched.
reset role;
select is((select done from public.subject_topics where id = 'c1000000-0000-4000-8000-000000000001'), false, 'Bia''s topic was not changed');
select is((select completed_at from public.goals where id = 'c3000000-0000-4000-8000-000000000001'), null, 'Bia''s goal was not changed');
select is((select count(*)::int from public.assessments where id = 'c2000000-0000-4000-8000-000000000001'), 1, 'Bia''s assessment was not deleted');

select * from finish();
rollback;
