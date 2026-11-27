-- Phase 7: notebooks, pages, pictures, the notebook bucket and readings of pages. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(53);

-- Privileges: table-wide, then the only columns she may write.
select table_privs_are('public', 'notebooks', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: reads and deletes notebooks');
select table_privs_are('public', 'notebooks', 'anon', array[]::text[], 'anon: nothing on notebooks');
select table_privs_are('public', 'notebook_pages', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: reads and deletes pages');
select table_privs_are('public', 'notebook_pages', 'anon', array[]::text[], 'anon: nothing on notebook_pages');
select column_privs_are('public', 'notebook_pages', 'strokes', 'authenticated', array['INSERT', 'SELECT', 'UPDATE'], 'the strokes are written');
select column_privs_are('public', 'notebook_pages', 'version', 'authenticated', array['SELECT'], 'never the version');
select column_privs_are('public', 'notebook_pages', 'user_id', 'authenticated', array['SELECT'], 'nor the owner');
select table_privs_are('public', 'notebook_images', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: reads and deletes pictures');
select table_privs_are('public', 'notebook_images', 'anon', array[]::text[], 'anon: nothing on notebook_images');
select column_privs_are('public', 'notebook_images', 'size_bytes', 'authenticated', array['INSERT', 'SELECT'], 'the size of a picture never changes');
select function_privs_are('public', 'save_notebook', array['uuid', 'uuid', 'text', 'timestamp with time zone'], 'anon', array[]::text[], 'anon cannot save a notebook');
select function_privs_are('public', 'save_notebook_page', array['uuid', 'uuid', 'integer', 'text', 'jsonb', 'jsonb', 'timestamp with time zone'], 'anon', array[]::text[], 'nor a page');
select function_privs_are('public', 'storage_used', array[]::text[], 'anon', array[]::text[], 'nor read the space used');
select function_privs_are('public', 'notebook_pages_bump_version', array[]::text[], 'authenticated', array[]::text[], 'nobody calls the version trigger');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'ana@p7.test', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bia@p7.test', '{}', now(), now());
insert into public.subjects (id, user_id, name, color) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bioquímica', 'rosa'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Anatomia', 'verde');
-- Bia's notebook, with a page and a picture.
insert into public.notebooks (id, user_id, subject_id, title) values
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Enzimas');
insert into public.notebook_pages (id, user_id, notebook_id, position, strokes) values
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001', 0,
   '[{"id": "s1", "tool": "caneta", "color": "grafite", "size": 2, "points": [[10, 10, 0.5]]}]');
insert into public.notebook_images (id, user_id, page_id, mime_type, size_bytes, storage_path) values
  ('b2000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b1000000-0000-4000-8000-000000000001',
   'image/webp', 1000, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b2000000-0000-4000-8000-000000000001');
insert into storage.objects (bucket_id, name, owner_id) values
  ('notebook', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b2000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

-- Ana sees nothing of Bia, and can't write over it.
select is_empty('select 1 from public.notebooks', 'Ana does not see the notebooks of Bia');
select is_empty('select 1 from public.notebook_pages', 'nor the pages');
select is_empty('select 1 from public.notebook_images', 'nor the pictures');
select is_empty($$ select 1 from storage.objects where bucket_id = 'notebook' $$, 'nor the stored pictures');
select throws_ok(
  $$ select * from public.save_notebook('b0000000-0000-4000-8000-000000000001', null, 'Trocado', now()) $$,
  '42501', null, 'Ana cannot overwrite the notebook of Bia');
select throws_ok(
  $$ select * from public.save_notebook('a0000000-0000-4000-8000-000000000009', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'X', now()) $$,
  '23503', null, 'nor put a notebook in a subject of Bia');
select throws_ok(
  $$ select * from public.save_notebook_page('a1000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000001',
       0, 'liso', '[]', '[]', now()) $$,
  '23503', null, 'nor add a page to a notebook of Bia');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('notebook', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/novo', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  '42501', null, 'nor upload into the folder of Bia');

-- Her notebook, made on the device and sent later.
select results_eq(
  $$ select applied from public.save_notebook('a0000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
       'Aula 07', '2026-11-27 10:00:00+00') $$,
  $$ values (true) $$,
  'Ana saves a new notebook');
select results_eq(
  $$ select applied from public.save_notebook('a0000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
       'Nome antigo', '2026-11-27 09:00:00+00') $$,
  $$ values (false) $$,
  'an older change arriving late is not taken');
select is((select title from public.notebooks), 'Aula 07', 'and the newer title stays');

-- Pages: the newest write wins, an older one changes nothing, the version goes up.
select results_eq(
  $$ select saved_version, applied from public.save_notebook_page('a1000000-0000-4000-8000-000000000001',
       'a0000000-0000-4000-8000-000000000001', 0, 'pontilhado', '[]', '[]', '2026-11-27 10:00:00+00') $$,
  $$ values (1, true) $$,
  'a new page starts at version 1');
select results_eq(
  $$ select saved_version, applied from public.save_notebook_page('a1000000-0000-4000-8000-000000000001',
       'a0000000-0000-4000-8000-000000000001', 0, 'pautado',
       '[{"id": "s1", "tool": "caneta", "color": "grafite", "size": 2, "points": [[1.5, 2.5, 0.5]]}]', '[]',
       '2026-11-27 10:05:00+00') $$,
  $$ values (2, true) $$,
  'a newer write is taken, at version 2');
select results_eq(
  $$ select saved_version, applied from public.save_notebook_page('a1000000-0000-4000-8000-000000000001',
       'a0000000-0000-4000-8000-000000000001', 0, 'liso', '[]', '[]', '2026-11-27 10:01:00+00') $$,
  $$ values (2, false) $$,
  'an older write (another device, offline) is not');
select results_eq(
  $$ select background, jsonb_array_length(strokes) from public.notebook_pages $$,
  $$ values ('pautado'::text, 1) $$,
  'the page keeps the newest content');
select throws_ok(
  $$ select * from public.save_notebook_page('b1000000-0000-4000-8000-000000000001',
       'a0000000-0000-4000-8000-000000000001', 1, 'liso', '[]', '[]', now()) $$,
  '42501', null, 'the id of a page of Bia cannot be taken over');
select lives_ok(
  $$ select * from public.save_notebook_page('a1000000-0000-4000-8000-000000000002',
       'a0000000-0000-4000-8000-000000000001', 1, 'liso', '[]', '[]', now() + interval '1 year') $$,
  'a page from a clock ahead of time');
select ok(
  (select edited_at <= now() from public.notebook_pages where id = 'a1000000-0000-4000-8000-000000000002'),
  'counts as now');
select throws_ok(
  $$ update public.notebook_pages set version = 99 $$,
  '42501', null, 'the version cannot be written');
select lives_ok(
  $$ update public.notebook_pages set background = 'liso' where id = 'a1000000-0000-4000-8000-000000000001' $$,
  'any other change of a page');
select is(
  (select version from public.notebook_pages where id = 'a1000000-0000-4000-8000-000000000001'), 3,
  'raises the version too');
select throws_ok(
  $$ select * from public.save_notebook_page('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
       2, 'liso', jsonb_build_array(repeat('x', 1600000)), '[]', now()) $$,
  '23514', null, 'a page over 1.5 MB is refused');
select throws_ok(
  $$ select * from public.save_notebook_page('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
       2, 'liso', '{}', '[]', now()) $$,
  '23514', null, 'the strokes are a list');
select throws_ok(
  $$ select * from public.save_notebook_page('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
       2, 'quadriculado', '[]', '[]', now()) $$,
  '23514', null, 'only the three backgrounds');

-- Pictures: registered first, then uploaded; files and pictures share the 250 MB.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('notebook', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  '42501', null, 'a picture that was not registered cannot be uploaded');
select lives_ok(
  $$ insert into public.notebook_images (id, page_id, mime_type, size_bytes, storage_path) values
     ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'image/webp', 5000000,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2000000-0000-4000-8000-000000000001') $$,
  'Ana registers a picture of 5 MB');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('notebook', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'and uploads it');
select throws_ok(
  $$ insert into public.notebook_images (id, page_id, mime_type, size_bytes, storage_path) values
     ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'image/webp', 10,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/qualquer') $$,
  '23514', null, 'the path is always <owner>/<picture id>');
select throws_ok(
  $$ insert into public.notebook_images (id, page_id, mime_type, size_bytes, storage_path) values
     ('a2000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'image/webp', 10,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2000000-0000-4000-8000-000000000003') $$,
  '23503', null, 'nor on a page of Bia');
select lives_ok(
  $$ insert into public.files (id, name, kind, mime_type, size_bytes, storage_path, sha256)
     select id, 'Parte ' || n || '.pdf', 'pdf', 'application/pdf', 20000000, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || id, lpad(n::text, 64, '0')
     from (select n, ('a3000000-0000-4000-8000-1000000000' || lpad(n::text, 2, '0'))::uuid as id from generate_series(1, 12) n) s $$,
  '240 MB of files fit with the picture');
select throws_ok(
  $$ insert into public.files (id, name, kind, mime_type, size_bytes, storage_path, sha256) values
     ('a3000000-0000-4000-8000-000000000001', 'Grande.pdf', 'pdf', 'application/pdf', 18000000,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a3000000-0000-4000-8000-000000000001', repeat('1', 64)) $$,
  'LQ001', null, 'a file over the 250 MB counts the pictures');
select lives_ok(
  $$ insert into public.files (id, name, kind, mime_type, size_bytes, storage_path, sha256) values
     ('a3000000-0000-4000-8000-000000000002', 'Menor.pdf', 'pdf', 'application/pdf', 15000000,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a3000000-0000-4000-8000-000000000002', repeat('2', 64)) $$,
  'a smaller one fits');
select throws_ok(
  $$ insert into public.notebook_images (id, page_id, mime_type, size_bytes, storage_path) values
     ('a2000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'image/webp', 5000000,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2000000-0000-4000-8000-000000000004') $$,
  'LQ001', null, 'and a picture over the 250 MB counts the files');
select is(public.storage_used(), 260000000::bigint, 'the space used is files plus pictures');

-- Readings of a page ("Usar no resumo"): of a file or of a page, never both, never of Bia.
select lives_ok(
  $$ insert into public.documents (id, notebook_page_id) values
     ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001') $$,
  'a page can be read like a file');
select throws_ok(
  $$ insert into public.documents (file_id, notebook_page_id) values
     ('a3000000-0000-4000-8000-100000000001', 'a1000000-0000-4000-8000-000000000002') $$,
  '23514', null, 'a reading is of one source');
select throws_ok(
  $$ insert into public.documents (id) values ('a4000000-0000-4000-8000-000000000002') $$,
  '23514', null, 'and of at least one');
select throws_ok(
  $$ insert into public.documents (notebook_page_id) values ('b1000000-0000-4000-8000-000000000001') $$,
  '23503', null, 'never of a page of Bia');

-- Deleting the notebook takes its pages, pictures and readings.
delete from public.notebooks where id = 'a0000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select 1 from public.notebook_pages union all select 1 from public.notebook_images
     union all select 1 from public.documents where notebook_page_id is not null $$,
  'deleting the notebook deletes its pages, pictures and readings');

select * from finish();
rollback;
