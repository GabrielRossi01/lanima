-- Development data, the same examples as the mockups. Runs on `supabase db reset` (local only;
-- never on the hosted project). Sign in as maria@lanima.test with the magic link or code, which
-- arrive in Mailpit: http://127.0.0.1:54324

-- GoTrue expects empty strings, not nulls, in the token columns.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'maria@lanima.test', '', now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'email',
  '{"sub": "11111111-1111-4111-8111-111111111111", "email": "maria@lanima.test", "email_verified": true}',
  now(), now(), now()
);

-- The sign-up trigger already created the profile row.
update public.profiles
set name = 'Maria',
    course = 'Biomedicina',
    institution = 'Universidade Exemplo',
    semester = 3,
    daily_focus_goal_min = 120,
    onboarding_completed_at = now()
where id = '11111111-1111-4111-8111-111111111111';

insert into public.subjects (user_id, name, color, icon, schedule) values
  ('11111111-1111-4111-8111-111111111111', 'Anatomia Humana', 'celeste', 'person-standing', 'Seg e Qua · 08h00'),
  ('11111111-1111-4111-8111-111111111111', 'Bioquímica', 'rosa', 'flask-conical', 'Ter e Qui · 10h00'),
  ('11111111-1111-4111-8111-111111111111', 'Citologia e Histologia', 'lilas', 'microscope', 'Qua · 14h00'),
  ('11111111-1111-4111-8111-111111111111', 'Imunologia', 'verde', 'shield', 'Sex · 08h00');
