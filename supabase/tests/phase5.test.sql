-- Phase 5: files, documents, chunks and the files bucket. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

-- Privileges: table-wide, then the only columns she may write.
select table_privs_are('public', 'files', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: reads and deletes files');
select table_privs_are('public', 'files', 'anon', array[]::text[], 'anon: nothing on files');
select column_privs_are('public', 'files', 'name', 'authenticated', array['INSERT', 'SELECT', 'UPDATE'], 'the name can be changed');
select column_privs_are('public', 'files', 'subject_id', 'authenticated', array['INSERT', 'SELECT', 'UPDATE'], 'and the subject');
select column_privs_are('public', 'files', 'size_bytes', 'authenticated', array['INSERT', 'SELECT'], 'never the size');
select column_privs_are('public', 'files', 'user_id', 'authenticated', array['SELECT'], 'nor the owner');
select table_privs_are('public', 'documents', 'authenticated', array['SELECT'], 'authenticated: reads documents, never deletes them');
select table_privs_are('public', 'documents', 'anon', array[]::text[], 'anon: nothing on documents');
select column_privs_are('public', 'documents', 'excluded_pages', 'authenticated', array['SELECT', 'UPDATE'], 'chooses the pages left out');
select table_privs_are('public', 'document_chunks', 'authenticated', array['SELECT', 'DELETE'], 'authenticated: reads and deletes chunks');
select table_privs_are('public', 'document_chunks', 'anon', array[]::text[], 'anon: nothing on document_chunks');
select function_privs_are('public', 'save_extraction', array['uuid', 'text', 'integer', 'boolean', 'boolean', 'jsonb'], 'anon', array[]::text[], 'anon cannot save a reading');
select function_privs_are('public', 'files_check_quota', array[]::text[], 'authenticated', array[]::text[], 'nobody calls the quota check');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'ana@p5.test', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bia@p5.test', '{}', now(), now());
insert into public.subjects (id, user_id, name, color) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bioquímica', 'rosa'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Anatomia', 'verde');
-- Bia's file, with a reading.
insert into public.files (id, user_id, subject_id, name, kind, mime_type, size_bytes, storage_path, sha256) values
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'Enzimas.pdf', 'pdf', 'application/pdf', 1000, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b0000000-0000-4000-8000-000000000001', repeat('b', 64)),
  ('b0000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null,
   'Ainda não lido.pdf', 'pdf', 'application/pdf', 1000, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b0000000-0000-4000-8000-000000000002', repeat('f', 64));
insert into public.documents (id, user_id, file_id) values
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001');
insert into public.document_chunks (user_id, document_id, position, page, text) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b1000000-0000-4000-8000-000000000001', 0, 1, 'Enzimas aceleram reações.');
insert into storage.objects (bucket_id, name, owner_id) values
  ('files', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

-- Ana sees nothing of Bia.
select is_empty('select 1 from public.files', 'Ana does not see the files of Bia');
select is_empty('select 1 from public.documents', 'nor the readings');
select is_empty('select 1 from public.document_chunks', 'nor the text');
select is_empty($$ select 1 from storage.objects where bucket_id = 'files' $$, 'nor the stored files');
select throws_ok(
  $$ insert into public.files (id, subject_id, name, kind, mime_type, size_bytes, storage_path, sha256) values
     ('a0000000-0000-4000-8000-000000000009', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'x.pdf', 'pdf', 'application/pdf', 10,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a0000000-0000-4000-8000-000000000009', repeat('9', 64)) $$,
  '23503', null, 'Ana cannot put a file in a subject of Bia');
select throws_ok(
  $$ insert into public.documents (file_id) values ('b0000000-0000-4000-8000-000000000002') $$,
  '23503', null, 'nor read a file of Bia');
select throws_ok(
  $$ select public.save_extraction('b1000000-0000-4000-8000-000000000001', repeat('e', 64), 1, false, false,
       '[{"position": 0, "page": 1, "text": "trocado"}]') $$,
  'P0002', null, 'nor overwrite the reading of Bia');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('files', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/novo', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  '42501', null, 'nor upload into the folder of Bia');

-- Her own file: registered first, then uploaded.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('files', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  '42501', null, 'a file that was not registered cannot be uploaded');
select lives_ok(
  $$ insert into public.files (id, subject_id, name, kind, mime_type, size_bytes, storage_path, sha256) values
     ('a0000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Esqueleto.pdf', 'pdf', 'application/pdf', 4000000,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a0000000-0000-4000-8000-000000000001', repeat('a', 64)) $$,
  'Ana registers a file in her subject');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('files', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'and uploads it');
select throws_ok(
  $$ insert into public.files (id, name, kind, mime_type, size_bytes, storage_path, sha256) values
     ('a0000000-0000-4000-8000-000000000002', 'De novo.pdf', 'pdf', 'application/pdf', 10,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a0000000-0000-4000-8000-000000000002', repeat('a', 64)) $$,
  '23505', null, 'the same file is not stored twice');
select throws_ok(
  $$ insert into public.files (id, name, kind, mime_type, size_bytes, storage_path, sha256) values
     ('a0000000-0000-4000-8000-000000000003', 'Outro.pdf', 'pdf', 'application/pdf', 10,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/qualquer', repeat('3', 64)) $$,
  '23514', null, 'the path is always <owner>/<file id>');
select throws_ok(
  $$ insert into public.files (id, name, kind, mime_type, size_bytes, storage_path, sha256) values
     ('a0000000-0000-4000-8000-000000000004', 'Velho.doc', 'documento', 'application/msword', 10,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a0000000-0000-4000-8000-000000000004', repeat('4', 64)) $$,
  '23514', null, 'only the accepted types');

-- Quota: 250 MB in all. 4 MB are used; 20 MB files until it is full.
select lives_ok(
  $$ insert into public.files (id, name, kind, mime_type, size_bytes, storage_path, sha256)
     select id, 'Parte ' || n || '.pdf', 'pdf', 'application/pdf', 20000000, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || id, lpad(n::text, 64, '0')
     from (select n, ('a0000000-0000-4000-8000-1000000000' || lpad(n::text, 2, '0'))::uuid as id from generate_series(1, 12) n) s $$,
  '244 MB fit');
select throws_ok(
  $$ insert into public.files (id, name, kind, mime_type, size_bytes, storage_path, sha256) values
     ('a0000000-0000-4000-8000-000000000005', 'Cheio.pdf', 'pdf', 'application/pdf', 20000000,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a0000000-0000-4000-8000-000000000005', repeat('5', 64)) $$,
  'LQ001', null, 'over 250 MB is refused');
select throws_ok(
  $$ update public.files set size_bytes = 1 where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'and the size cannot be faked later');

-- Reading: saved in one go, again from scratch.
insert into public.documents (id, file_id) values ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.save_extraction('a1000000-0000-4000-8000-000000000001', repeat('c', 64), 2, false, false,
       '[{"position": 0, "page": 1, "text": "Fêmur"}, {"position": 1, "page": 2, "text": "Tíbia"}]') $$,
  'Ana saves the reading of her file');
select lives_ok(
  $$ select public.save_extraction('a1000000-0000-4000-8000-000000000001', repeat('d', 64), 3, false, true,
       '[{"position": 0, "page": 3, "text": "Patela"}]') $$,
  'and reads it again');
select results_eq(
  'select position, page, text from public.document_chunks order by position',
  $$ values (0, 3, 'Patela') $$,
  'only the new text is left');
select results_eq(
  'select status, page_count, used_ocr from public.documents',
  $$ values ('pronto'::text, 3, true) $$,
  'and the document says so');
select lives_ok(
  $$ select public.save_extraction('a1000000-0000-4000-8000-000000000001', repeat('d', 64), 1, false, true, '[]') $$,
  'a photo without text');
select is((select status from public.documents), 'sem_texto', 'is "sem texto legível"');

-- Deleting the file takes the reading with it.
delete from public.files where id = 'a0000000-0000-4000-8000-000000000001';
select is_empty('select 1 from public.documents', 'deleting the file deletes its reading');

select * from finish();
rollback;
