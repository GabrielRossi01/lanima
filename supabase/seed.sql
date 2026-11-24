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

-- Subjects, classes, topics, assessments and goals as in Materias.html, Materia.html and
-- Inicio.html. Dates are relative to today, so the seed always looks like the mockups.
insert into public.subjects (id, user_id, name, color, icon, professor, schedule_slots) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Anatomia Humana', 'celeste', 'person-standing', 'Prof. Ricardo Lima',
   '[{"day": 1, "start": "08:00", "lab": false, "room": "Sala 204"}, {"day": 3, "start": "08:00", "lab": false, "room": "Sala 204"}]'),
  ('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Bioquímica', 'rosa', 'flask-conical', 'Profa. Helena Duarte',
   '[{"day": 2, "start": "10:00", "lab": false}, {"day": 4, "start": "10:00", "lab": false}]'),
  ('a0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Citologia e Histologia', 'lilas', 'microscope', null,
   '[{"day": 1, "start": "14:00", "lab": true, "room": "Lab 3"}]'),
  ('a0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Fisiologia', 'amarelo', 'heart-pulse', null,
   '[{"day": 3, "start": "08:00", "lab": false}, {"day": 5, "start": "08:00", "lab": false}]'),
  ('a0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Imunologia', 'verde', 'shield', null,
   '[{"day": 2, "start": "14:00", "lab": false}]'),
  ('a0000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'Microbiologia', 'celeste', 'bug', null,
   '[{"day": 4, "start": "14:00", "lab": true, "room": "Lab 1"}]');

insert into public.subject_topics (user_id, subject_id, title, done, position)
select '11111111-1111-4111-8111-111111111111', t.subject_id::uuid, t.title, t.done, t.position
from (values
  ('a0000000-0000-4000-8000-000000000001', 'Introdução e planos anatômicos', true, 1),
  ('a0000000-0000-4000-8000-000000000001', 'Sistema esquelético', true, 2),
  ('a0000000-0000-4000-8000-000000000001', 'Articulações', true, 3),
  ('a0000000-0000-4000-8000-000000000001', 'Sistema muscular', false, 4),
  ('a0000000-0000-4000-8000-000000000001', 'Sistema nervoso', false, 5),
  ('a0000000-0000-4000-8000-000000000001', 'Sistema cardiovascular', false, 6),
  ('a0000000-0000-4000-8000-000000000002', 'Aminoácidos e proteínas', true, 1),
  ('a0000000-0000-4000-8000-000000000002', 'Enzimas e cinética', false, 2),
  ('a0000000-0000-4000-8000-000000000002', 'Metabolismo de carboidratos', false, 3),
  ('a0000000-0000-4000-8000-000000000005', 'Imunidade inata', false, 1),
  ('a0000000-0000-4000-8000-000000000005', 'Imunidade adaptativa', false, 2)
) as t (subject_id, title, done, position);

insert into public.assessments (user_id, subject_id, title, kind, date, description) values
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'Prova teórica 1', 'prova', current_date + 14, null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'Prova prática (lab)', 'pratica', current_date + 21, null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000002', 'P1', 'prova', current_date + 6, 'enzimas e metabolismo'),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004', 'Seminário', 'seminario', current_date + 9, null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000006', 'Exame final', 'exame', current_date + 3, 'todo o conteúdo');

insert into public.goals (user_id, subject_id, title, duration_min, time_of_day, date, completed_at) values
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'Revisar sistema esquelético', 30, null, current_date, now()),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000002', 'Fazer teste de enzimas (nível médio)', 20, null, current_date, null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000005', 'Ler artigo sobre imunidade inata', 40, null, current_date, null),
  ('11111111-1111-4111-8111-111111111111', null, 'Reunião do projeto de extensão', null, '16:00', current_date, null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000003', 'Rever lâminas de tecido epitelial', 30, null, current_date - 1, null);
