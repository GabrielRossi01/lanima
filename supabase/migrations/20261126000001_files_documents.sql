-- Phase 5: files and the text read from them (sections 5 and 7.9). The text is read on the device
-- (lib/extract) and saved here in chunks, each with its page, for summaries and tests (phase 6).

-- ---------------------------------------------------------------------------------------------
-- files: what she uploaded. The file itself is in the private "files" bucket, at
-- "<user id>/<file id>"; photos are compressed on the device first.
-- ---------------------------------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  kind text not null check (kind in ('pdf', 'foto', 'documento', 'slides')),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'image/webp',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )),
  -- 25 MB per file (the bucket refuses more too).
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  storage_path text not null unique,
  -- SHA-256 of the file she picked (before compression): the same file isn't stored twice.
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Set by the app once the upload finished; null means it was interrupted.
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path = user_id::text || '/' || id::text),
  unique (user_id, sha256),
  unique (id, user_id),
  -- Deleting the subject keeps the file, without subject.
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);
create index files_user_created_idx on public.files (user_id, created_at desc);
create index files_subject_idx on public.files (subject_id);

create trigger files_set_updated_at before update on public.files
for each row execute function public.set_updated_at();

-- 250 MB per account: the Free plan has 1 GB of Storage for everyone. Raised as LQ001.
create or replace function public.files_check_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  used bigint;
begin
  -- Two uploads at the same time can't both squeeze under the limit.
  perform pg_advisory_xact_lock(hashtextextended('files_quota:' || new.user_id::text, 0));
  select coalesce(sum(size_bytes), 0) into used
  from public.files
  where user_id = new.user_id and id <> new.id;
  if used + new.size_bytes > 262144000 then
    raise exception 'files: storage quota exceeded' using errcode = 'LQ001',
      hint = 'Each account has 250 MB.';
  end if;
  return new;
end;
$$;
revoke all on function public.files_check_quota() from public, anon, authenticated;

create trigger files_check_quota before insert or update of size_bytes on public.files
for each row execute function public.files_check_quota();

alter table public.files enable row level security;
create policy "files: owner reads" on public.files for select to authenticated
using (user_id = (select auth.uid()));
create policy "files: owner inserts" on public.files for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "files: owner updates" on public.files for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "files: owner deletes" on public.files for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.files from anon, authenticated;
grant select, delete on public.files to authenticated;
grant insert (id, subject_id, name, kind, mime_type, size_bytes, storage_path, sha256) on public.files to authenticated;
-- Renaming, moving and marking the upload done; the file itself never changes.
grant update (name, subject_id, uploaded_at) on public.files to authenticated;
grant all on public.files to service_role;

-- ---------------------------------------------------------------------------------------------
-- documents: the reading of one file. Phase 7 adds notebook pages as another source.
-- ---------------------------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_id uuid not null unique,
  status text not null default 'extraindo' check (status in ('extraindo', 'pronto', 'sem_texto', 'erro')),
  -- SHA-256 of the text read: the same text doesn't cost AI quota twice (phase 6).
  content_hash text check (content_hash ~ '^[0-9a-f]{64}$'),
  language text not null default 'por',
  page_count integer check (page_count between 0 and 5000),
  -- Word without page marks: the pages are blocks of text, shown as "pág. ≈2".
  pages_approx boolean not null default false,
  used_ocr boolean not null default false,
  -- Pages left out of summaries and tests (cover, references), chosen in the preview.
  excluded_pages integer[] not null default '{}' check (cardinality(excluded_pages) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('pronto', 'sem_texto') or (content_hash is not null and page_count is not null)),
  unique (id, user_id),
  foreign key (file_id, user_id) references public.files (id, user_id) on delete cascade
);

create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();

alter table public.documents enable row level security;
create policy "documents: owner reads" on public.documents for select to authenticated
using (user_id = (select auth.uid()));
create policy "documents: owner inserts" on public.documents for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "documents: owner updates" on public.documents for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.documents from anon, authenticated;
grant select on public.documents to authenticated;
grant insert (id, file_id) on public.documents to authenticated;
grant update (status, content_hash, page_count, pages_approx, used_ocr, excluded_pages) on public.documents to authenticated;
grant all on public.documents to service_role;

-- ---------------------------------------------------------------------------------------------
-- document_chunks: the text, in pieces of up to ~1,500 tokens, each from one page.
-- ---------------------------------------------------------------------------------------------
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null,
  position integer not null check (position between 0 and 9999),
  page integer not null check (page between 1 and 5000),
  text text not null check (char_length(text) between 1 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, position),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);
create index document_chunks_user_idx on public.document_chunks (user_id);

create trigger document_chunks_set_updated_at before update on public.document_chunks
for each row execute function public.set_updated_at();

alter table public.document_chunks enable row level security;
create policy "document_chunks: owner reads" on public.document_chunks for select to authenticated
using (user_id = (select auth.uid()));
create policy "document_chunks: owner inserts" on public.document_chunks for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "document_chunks: owner deletes" on public.document_chunks for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.document_chunks from anon, authenticated;
grant select, delete on public.document_chunks to authenticated;
grant insert (document_id, position, page, text) on public.document_chunks to authenticated;
grant all on public.document_chunks to service_role;

-- Saves a reading in one go: the old chunks go, the new ones come, the document is updated.
-- security invoker: the RLS above decides, as if she did each step.
create or replace function public.save_extraction(
  p_document uuid,
  p_content_hash text,
  p_page_count integer,
  p_pages_approx boolean,
  p_used_ocr boolean,
  p_chunks jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  total integer;
begin
  if jsonb_typeof(p_chunks) is distinct from 'array' or jsonb_array_length(p_chunks) > 10000 then
    raise exception 'save_extraction: chunks must be an array of up to 10000' using errcode = '22023';
  end if;
  select coalesce(sum(char_length(c ->> 'text')), 0) into total from jsonb_array_elements(p_chunks) c;
  if total > 3000000 then
    raise exception 'save_extraction: text too long' using errcode = '22023';
  end if;

  update public.documents
  set status = case when jsonb_array_length(p_chunks) = 0 then 'sem_texto' else 'pronto' end,
      content_hash = p_content_hash,
      page_count = p_page_count,
      pages_approx = p_pages_approx,
      used_ocr = p_used_ocr
  where id = p_document;
  if not found then
    raise exception 'save_extraction: document not found' using errcode = 'P0002';
  end if;

  delete from public.document_chunks where document_id = p_document;
  insert into public.document_chunks (document_id, position, page, text)
  select p_document, (c ->> 'position')::integer, (c ->> 'page')::integer, c ->> 'text'
  from jsonb_array_elements(p_chunks) c;
end;
$$;
revoke all on function public.save_extraction(uuid, text, integer, boolean, boolean, jsonb) from public, anon;
grant execute on function public.save_extraction(uuid, text, integer, boolean, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage: private bucket, 25 MB per file, only the accepted types.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 26214400, array[
  'application/pdf',
  'image/webp',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "files bucket: owner reads"
on storage.objects for select
to authenticated
using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Only a file that was registered first (its row counts in the quota), and never over another.
create policy "files bucket: owner uploads registered files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'files'
  and (storage.foldername(objects.name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.files f
    where f.storage_path = objects.name and f.user_id = (select auth.uid())
  )
);

create policy "files bucket: owner deletes"
on storage.objects for delete
to authenticated
using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
