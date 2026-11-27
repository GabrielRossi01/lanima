-- Phase 7: the notebook (sections 5, 6 and 7.2). Notebooks and pages are written on the device
-- first and sent later (lib/notebook/sync.ts), so a write may arrive long after it was made, and
-- out of order. Each one carries `edited_at`, the moment she made it on her device: the newest
-- wins (last-write-wins per page) and an older one arriving late changes nothing. `version` goes
-- up with every change the server takes, so a device knows its copy is behind.

-- ---------------------------------------------------------------------------------------------
-- notebooks
-- ---------------------------------------------------------------------------------------------
create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  edited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- Deleting the subject keeps the notebook, without subject.
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);
create index notebooks_user_edited_idx on public.notebooks (user_id, edited_at desc);
create index notebooks_subject_idx on public.notebooks (subject_id);

create trigger notebooks_set_updated_at before update on public.notebooks
for each row execute function public.set_updated_at();

alter table public.notebooks enable row level security;
create policy "notebooks: owner reads" on public.notebooks for select to authenticated
using (user_id = (select auth.uid()));
create policy "notebooks: owner inserts" on public.notebooks for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "notebooks: owner updates" on public.notebooks for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notebooks: owner deletes" on public.notebooks for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.notebooks from anon, authenticated;
grant select, delete on public.notebooks to authenticated;
grant insert (id, subject_id, title, edited_at) on public.notebooks to authenticated;
grant update (subject_id, title, edited_at) on public.notebooks to authenticated;
grant all on public.notebooks to service_role;

-- ---------------------------------------------------------------------------------------------
-- notebook_pages: strokes = [{ id, tool, color, size, points: [[x, y, pressure], …] }, …] in page
-- space (A4 1000 wide), elements = text boxes and images with their place. Both are validated by
-- the app (lib/notebook/model.ts); here only their kind and size.
-- ---------------------------------------------------------------------------------------------
create table public.notebook_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  notebook_id uuid not null,
  position integer not null check (position between 0 and 9999),
  background text not null default 'pontilhado' check (background in ('pontilhado', 'pautado', 'liso')),
  strokes jsonb not null default '[]' check (jsonb_typeof(strokes) = 'array'),
  elements jsonb not null default '[]' check (jsonb_typeof(elements) = 'array'),
  -- 1.5 MB of JSON per page: far more than 2,000 simplified strokes. The free database has 500 MB.
  check (octet_length(strokes::text) + octet_length(elements::text) <= 1572864),
  version integer not null default 1 check (version >= 1),
  edited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (notebook_id, user_id) references public.notebooks (id, user_id) on delete cascade
);
create index notebook_pages_notebook_idx on public.notebook_pages (notebook_id, position);
create index notebook_pages_user_idx on public.notebook_pages (user_id);

create trigger notebook_pages_set_updated_at before update on public.notebook_pages
for each row execute function public.set_updated_at();

-- Every change the server takes is a new version, whoever writes it.
create or replace function public.notebook_pages_bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function public.notebook_pages_bump_version() from public, anon, authenticated;

create trigger notebook_pages_bump_version before update on public.notebook_pages
for each row execute function public.notebook_pages_bump_version();

alter table public.notebook_pages enable row level security;
create policy "notebook_pages: owner reads" on public.notebook_pages for select to authenticated
using (user_id = (select auth.uid()));
create policy "notebook_pages: owner inserts" on public.notebook_pages for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "notebook_pages: owner updates" on public.notebook_pages for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notebook_pages: owner deletes" on public.notebook_pages for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.notebook_pages from anon, authenticated;
grant select, delete on public.notebook_pages to authenticated;
grant insert (id, notebook_id, position, background, strokes, elements, edited_at) on public.notebook_pages to authenticated;
-- Never the version: the trigger above raises it.
grant update (position, background, strokes, elements, edited_at) on public.notebook_pages to authenticated;
grant all on public.notebook_pages to service_role;

-- Saves a notebook made or changed on her device: created if new, changed only if this change is
-- newer than the one on the server. A clock ahead of time can't win forever: at most "now".
-- security invoker: the RLS above decides, as if she did it.
create or replace function public.save_notebook(
  p_id uuid,
  p_subject uuid,
  p_title text,
  p_edited_at timestamptz
)
returns table (saved_edited_at timestamptz, applied boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stamp timestamptz := least(p_edited_at, now());
begin
  return query
  with saved as (
    insert into public.notebooks as n (id, subject_id, title, edited_at)
    values (p_id, p_subject, p_title, stamp)
    on conflict (id) do update
      set subject_id = excluded.subject_id, title = excluded.title, edited_at = excluded.edited_at
      where n.edited_at <= excluded.edited_at
    returning n.edited_at
  )
  select s.edited_at, true from saved s
  union all
  select n.edited_at, false from public.notebooks n
  where n.id = p_id and not exists (select 1 from saved);
end;
$$;
revoke all on function public.save_notebook(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.save_notebook(uuid, uuid, text, timestamptz) to authenticated;

-- The same for a page. Returns the version the server has now and whether this write was taken
-- (false: the server has a newer one, which the device then reads).
create or replace function public.save_notebook_page(
  p_id uuid,
  p_notebook uuid,
  p_position integer,
  p_background text,
  p_strokes jsonb,
  p_elements jsonb,
  p_edited_at timestamptz
)
returns table (saved_version integer, saved_edited_at timestamptz, applied boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stamp timestamptz := least(p_edited_at, now());
begin
  return query
  with saved as (
    insert into public.notebook_pages as p (id, notebook_id, position, background, strokes, elements, edited_at)
    values (p_id, p_notebook, p_position, p_background, p_strokes, p_elements, stamp)
    on conflict (id) do update
      set position = excluded.position,
          background = excluded.background,
          strokes = excluded.strokes,
          elements = excluded.elements,
          edited_at = excluded.edited_at
      where p.edited_at <= excluded.edited_at
    returning p.version, p.edited_at
  )
  select s.version, s.edited_at, true from saved s
  union all
  select p.version, p.edited_at, false from public.notebook_pages p
  where p.id = p_id and not exists (select 1 from saved);
end;
$$;
revoke all on function public.save_notebook_page(uuid, uuid, integer, text, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.save_notebook_page(uuid, uuid, integer, text, jsonb, jsonb, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- notebook_images: pictures pasted on a page, compressed on the device. The file is in the
-- private "notebook" bucket at "<user id>/<image id>", and counts in the account's 250 MB.
-- ---------------------------------------------------------------------------------------------
create table public.notebook_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page_id uuid not null,
  mime_type text not null check (mime_type in ('image/webp', 'image/jpeg', 'image/png')),
  -- 5 MB per image (the bucket refuses more too).
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  storage_path text not null unique,
  -- Set by the app once the upload finished.
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path = user_id::text || '/' || id::text),
  foreign key (page_id, user_id) references public.notebook_pages (id, user_id) on delete cascade
);
create index notebook_images_page_idx on public.notebook_images (page_id);
create index notebook_images_user_idx on public.notebook_images (user_id);

create trigger notebook_images_set_updated_at before update on public.notebook_images
for each row execute function public.set_updated_at();

alter table public.notebook_images enable row level security;
create policy "notebook_images: owner reads" on public.notebook_images for select to authenticated
using (user_id = (select auth.uid()));
create policy "notebook_images: owner inserts" on public.notebook_images for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "notebook_images: owner updates" on public.notebook_images for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notebook_images: owner deletes" on public.notebook_images for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.notebook_images from anon, authenticated;
grant select, delete on public.notebook_images to authenticated;
grant insert (id, page_id, mime_type, size_bytes, storage_path) on public.notebook_images to authenticated;
grant update (uploaded_at) on public.notebook_images to authenticated;
grant all on public.notebook_images to service_role;

-- The 250 MB of the account are files and notebook images together. Raised as LQ001, as before.
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
  where user_id = new.user_id and (tg_table_name <> 'files' or id <> new.id);
  used := used + (
    select coalesce(sum(size_bytes), 0)
    from public.notebook_images
    where user_id = new.user_id and (tg_table_name <> 'notebook_images' or id <> new.id)
  );
  if used + new.size_bytes > 262144000 then
    raise exception 'files: storage quota exceeded' using errcode = 'LQ001',
      hint = 'Each account has 250 MB.';
  end if;
  return new;
end;
$$;
revoke all on function public.files_check_quota() from public, anon, authenticated;

create trigger notebook_images_check_quota before insert or update of size_bytes on public.notebook_images
for each row execute function public.files_check_quota();

-- What the account uses, for the "Espaço" card: files and notebook images.
create or replace function public.storage_used()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select coalesce(sum(size_bytes), 0) from public.files where user_id = (select auth.uid()))
    + (select coalesce(sum(size_bytes), 0) from public.notebook_images where user_id = (select auth.uid()));
$$;
revoke all on function public.storage_used() from public, anon;
grant execute on function public.storage_used() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notebook', 'notebook', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "notebook bucket: owner reads"
on storage.objects for select
to authenticated
using (bucket_id = 'notebook' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Only an image that was registered first (its row counts in the quota), and never over another.
create policy "notebook bucket: owner uploads registered images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'notebook'
  and (storage.foldername(objects.name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.notebook_images i
    where i.storage_path = objects.name and i.user_id = (select auth.uid())
  )
);

create policy "notebook bucket: owner deletes"
on storage.objects for delete
to authenticated
using (bucket_id = 'notebook' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------------------
-- documents: a reading is of a file or of a notebook page ("Usar no resumo": its text boxes and
-- the text of its pictures), never both.
-- ---------------------------------------------------------------------------------------------
alter table public.documents alter column file_id drop not null;
alter table public.documents add column notebook_page_id uuid unique;
alter table public.documents
  add constraint documents_notebook_page_fkey
  foreign key (notebook_page_id, user_id) references public.notebook_pages (id, user_id) on delete cascade;
alter table public.documents
  add constraint documents_one_source check (num_nonnulls(file_id, notebook_page_id) = 1);
grant insert (notebook_page_id) on public.documents to authenticated;
