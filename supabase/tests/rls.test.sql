-- RLS: a user never reads or changes another user's profile, subjects or avatar.
-- Run with `npm run test:db` (supabase test db). Everything runs in a transaction and is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- Exact privileges per role, independent of the project's default privileges (hosted projects may
-- not grant new tables to the API roles; relying on that gave "403 · 42501" in production).
select table_privs_are('public', 'profiles', 'authenticated', array['SELECT'], 'authenticated: profiles is SELECT only (plus column UPDATE)');
select table_privs_are('public', 'profiles', 'anon', array[]::text[], 'anon: no access to profiles');
select table_privs_are('public', 'subjects', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated: CRUD on subjects');
select table_privs_are('public', 'subjects', 'anon', array[]::text[], 'anon: no access to subjects');
select column_privs_are('public', 'profiles', 'name', 'authenticated', array['SELECT', 'UPDATE'], 'authenticated may read and update the name column');
select column_privs_are('public', 'profiles', 'created_at', 'authenticated', array['SELECT'], 'authenticated may read but not update created_at');

-- Two users. The sign-up trigger creates their profiles.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'ana@rls.test', '{"full_name": "Ana Souza"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   'bia@rls.test', '{}', now(), now());

select is(
  (select name from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'Ana Souza',
  'sign-up trigger creates the profile with the Google name'
);
select is(
  (select course from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'Biomedicina',
  'course defaults to Biomedicina'
);

insert into public.subjects (id, user_id, name, color)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bioquímica', 'rosa');

insert into storage.objects (bucket_id, name, owner_id)
values ('avatars', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/avatar-1.webp', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- Anonymous visitors see nothing.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.subjects', '42501', null, 'anon cannot read subjects');
select is_empty($$ select 1 from storage.objects where bucket_id = 'avatars' $$, 'anon cannot list avatars');

-- From here on, Ana is signed in.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

select results_eq(
  'select id from public.profiles',
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid) $$,
  'Ana sees only her own profile'
);
select is_empty(
  $$ select 1 from public.subjects where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  'Ana does not see Bia''s subjects'
);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'avatars' $$,
  'Ana does not see Bia''s avatar'
);

-- Writes to Bia's rows silently match nothing (RLS filters them out).
update public.profiles set name = 'Invadido' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.subjects set name = 'Invadido' where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
delete from public.subjects where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
-- The Storage API sets this flag for its deletes (storage.protect_delete); RLS still applies.
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'avatars';

-- Inserting rows owned by someone else is rejected.
select throws_ok(
  $$ insert into public.subjects (user_id, name, color) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Intrusa', 'verde') $$,
  '42501', null, 'Ana cannot create a subject for Bia'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('avatars', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/x.webp', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  '42501', null, 'Ana cannot upload into Bia''s avatar folder'
);
select throws_ok(
  $$ insert into public.profiles (id) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd') $$,
  '42501', null, 'profiles are only created by the sign-up trigger'
);
select throws_ok(
  $$ delete from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'profiles cannot be deleted by the client'
);
select throws_ok(
  $$ update public.profiles set created_at = now() - interval '1 year' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'created_at is not writable'
);
select throws_ok(
  $$ update public.profiles set id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'id is not writable'
);

-- Her own rows work normally.
select lives_ok(
  $$ update public.profiles set name = 'Ana', semester = 3, daily_focus_goal_min = 90, theme = 'dark' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'Ana updates her own profile'
);
select lives_ok(
  $$ insert into public.subjects (name, color) values ('Anatomia Humana', 'celeste') $$,
  'Ana creates a subject (user_id defaults to her)'
);
select throws_ok(
  $$ insert into public.subjects (name, color) values ('  anatomia humana ', 'verde') $$,
  '23505', null, 'duplicate active subject names are rejected'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('avatars', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/avatar-1.webp', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'Ana uploads into her own avatar folder'
);
select throws_ok(
  $$ update public.profiles set avatar_path = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/avatar-1.webp' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'avatar_path must point to her own folder'
);
select throws_ok(
  $$ update public.profiles set daily_focus_goal_min = 400 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'daily focus goal stays between 30 min and 6 h'
);
select throws_ok(
  $$ insert into public.subjects (name, color) values ('Genética', 'preto') $$,
  '23514', null, 'subject color must be one of the five pastels'
);

-- Back as the database owner: Bia's data is untouched.
reset role;
select is(
  (select name from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '',
  'Bia''s profile was not changed'
);
select is(
  (select name from public.subjects where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'Bioquímica',
  'Bia''s subject was neither renamed nor deleted'
);
select is(
  (select count(*)::int from storage.objects where name like 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/%'),
  1,
  'Bia''s avatar was not deleted'
);
select is(
  (select theme from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'dark',
  'Ana''s own update was saved'
);
select isnt(
  (select updated_at from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  null,
  'updated_at is maintained'
);

select * from finish();
rollback;
