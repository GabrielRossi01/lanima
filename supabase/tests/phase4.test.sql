-- Phase 4: focus sessions. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

select table_privs_are('public', 'focus_sessions', 'authenticated', array['SELECT', 'INSERT'], 'authenticated: reads and adds sessions, never edits');
select table_privs_are('public', 'focus_sessions', 'anon', array[]::text[], 'anon: nothing on focus_sessions');
select table_privs_are('public', 'focus_days', 'authenticated', array['SELECT'], 'authenticated: reads focus_days');
select table_privs_are('public', 'focus_days', 'anon', array[]::text[], 'anon: nothing on focus_days');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'ana@p4.test', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bia@p4.test', '{}', now(), now());
insert into public.subjects (id, user_id, name, color) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bioquímica', 'rosa'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Anatomia', 'verde');
insert into public.focus_sessions (user_id, started_at, ended_at, planned_min, actual_min) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-11-25 12:00Z', '2026-11-25 12:25Z', 25, 25);

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

select is_empty('select 1 from public.focus_sessions', 'Ana does not see the sessions of Bia');
select is_empty('select 1 from public.focus_days', 'nor her days');
select throws_ok(
  $$ insert into public.focus_sessions (user_id, started_at, ended_at, planned_min, actual_min)
     values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-11-25 13:00Z', '2026-11-25 13:25Z', 25, 25) $$,
  '42501', null, 'Ana cannot add a session as Bia');
select throws_ok(
  $$ insert into public.focus_sessions (subject_id, started_at, ended_at, planned_min, actual_min)
     values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '2026-11-25 13:00Z', '2026-11-25 13:25Z', 25, 25) $$,
  '23503', null, 'nor point to a subject of Bia');
select lives_ok(
  $$ insert into public.focus_sessions (subject_id, started_at, ended_at, planned_min, actual_min)
     values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '2026-11-25 13:00Z', '2026-11-25 13:40Z', 25, 25) $$,
  'a session with a pause in the middle');
select lives_ok(
  $$ insert into public.focus_sessions (started_at, ended_at, planned_min, actual_min)
     values ('2026-11-25 13:00Z', '2026-11-25 13:40Z', 25, 25) on conflict (user_id, started_at) do nothing $$,
  'sending it again is fine');
select is((select count(*)::int from public.focus_sessions), 1, 'and adds nothing');
select throws_ok(
  $$ insert into public.focus_sessions (started_at, ended_at, planned_min, actual_min)
     values ('2026-11-25 15:00Z', '2026-11-25 15:10Z', 25, 25) $$,
  '23514', null, '25 minutes do not fit in 10');
select throws_ok(
  $$ insert into public.focus_sessions (started_at, ended_at, planned_min, actual_min)
     values ('2026-11-25 15:00Z', '2026-11-25 20:00Z', 25, 50) $$,
  '23514', null, 'nor more than planned');
select throws_ok('update public.focus_sessions set actual_min = 1', '42501', null, 'a session cannot be edited');
select throws_ok('delete from public.focus_sessions', '42501', null, 'nor deleted');

-- 02:10Z on the 27th is still the 26th in São Paulo.
insert into public.focus_sessions (started_at, ended_at, planned_min, actual_min)
values ('2026-11-27 01:20Z', '2026-11-27 02:10Z', 50, 50);
select results_eq(
  'select day, minutes from public.focus_days order by day',
  $$ values ('2026-11-25'::date, 25), ('2026-11-26'::date, 50) $$,
  'focus_days adds up by São Paulo day');

delete from public.subjects where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select is((select count(*)::int from public.focus_sessions where subject_id is null), 2, 'deleting the subject keeps the session');

select * from finish();
rollback;
