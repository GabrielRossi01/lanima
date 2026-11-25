-- Focus mode preferences: sound (which is also the visual theme), volume, background animation and
-- the breathing text. Only adds columns with defaults: nothing existing changes.
alter table public.profiles
  -- Same keys as lib/focus/prefs.ts.
  add column focus_sound text not null default 'silencio'
    constraint profiles_focus_sound_check check (focus_sound in ('chuva', 'lofi', 'deep', 'silencio')),
  add column focus_volume smallint not null default 60
    constraint profiles_focus_volume_check check (focus_volume between 0 and 100),
  add column focus_animation boolean not null default true,
  add column focus_breath_text boolean not null default true;

-- profiles is updated column by column (20261123000002): the new ones need their own grant.
grant update (focus_sound, focus_volume, focus_animation, focus_breath_text) on public.profiles to authenticated;
