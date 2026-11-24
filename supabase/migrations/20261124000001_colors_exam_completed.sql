-- Five more subject colors, the "exame" (make-up exam) kind and completed assessments.
-- Only widens what is accepted: no existing row changes, and the app version already published
-- keeps working while this is applied.

-- Same keys as lib/subjects/colors.ts.
alter table public.subjects drop constraint subjects_color_check;
alter table public.subjects add constraint subjects_color_check check (
  color in (
    'amarelo', 'rosa', 'verde', 'celeste', 'lilas',
    'pessego', 'lima', 'turquesa', 'indigo', 'orquidea'
  )
);

-- "exame": the make-up exam ("prova de recuperação"). Same keys as lib/subjects/subjects.ts.
alter table public.assessments drop constraint assessments_kind_check;
alter table public.assessments add constraint assessments_kind_check check (
  kind in ('prova', 'pratica', 'exame', 'seminario', 'entrega')
);

-- Checked by the student, like goals.completed_at. Null: still to do.
-- Table-level grants and RLS from 20261123000003 already cover the new column.
alter table public.assessments add column completed_at timestamptz;
