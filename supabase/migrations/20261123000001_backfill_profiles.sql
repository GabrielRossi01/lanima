-- Repair: every auth user has a profile. Accounts created before the profiles migration reached a
-- project (or while the trigger was missing) have none, and the app can't load them (the error
-- screen shows "perfil: 406 · PGRST116"). Idempotent: running it again changes nothing.
insert into public.profiles (id, name)
select
  u.id,
  left(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), 60)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
