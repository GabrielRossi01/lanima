-- Explicit table privileges for the API roles.
--
-- The earlier migrations only revoked privileges and relied on Supabase's default privileges to
-- grant the rest. Locally (and in CI) new tables in `public` are granted to anon/authenticated/
-- service_role automatically; hosted projects can have that turned off ("automatically expose new
-- tables"), and there the signed-in user got `403 · 42501` (permission denied) reading her
-- profile. Each role's privileges are now stated here, so every project ends up the same.
-- RLS still decides WHICH rows; these grants decide which operations the role may attempt at all.

grant usage on schema public to anon, authenticated, service_role;

-- profiles: read own row; update only the editable columns. Rows are created by the sign-up
-- trigger and removed with the auth user. (REVOKE ALL also drops column grants, so they are
-- granted again below.)
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (
  name,
  course,
  institution,
  semester,
  avatar_path,
  daily_focus_goal_min,
  theme,
  show_in_ranking,
  onboarding_completed_at
) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- subjects: full CRUD on her own rows (RLS).
revoke all on public.subjects from anon, authenticated;
grant select, insert, update, delete on public.subjects to authenticated;
grant all on public.subjects to service_role;
