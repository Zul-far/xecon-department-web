-- Run once in Supabase SQL Editor BEFORE publishing the 33-wave game.
-- Safe to rerun. Existing scores are retained as 10-wave legacy runs.
begin;
alter table public.orbital_scores add column if not exists campaign_waves smallint not null default 10;
-- Cached older clients omit this field; the updated game explicitly sends 33.
alter table public.orbital_scores alter column campaign_waves set default 10;
alter table public.orbital_scores drop constraint if exists orbital_scores_wave_check;
alter table public.orbital_scores drop constraint if exists orbital_winning_wave;
alter table public.orbital_scores drop constraint if exists orbital_scores_score_check;
alter table public.orbital_scores drop constraint if exists orbital_campaign_waves;
alter table public.orbital_scores add constraint orbital_scores_wave_check check (wave between 1 and campaign_waves);
alter table public.orbital_scores add constraint orbital_campaign_waves check (campaign_waves in (10,33));
alter table public.orbital_scores add constraint orbital_winning_wave check (outcome <> 'won' or wave = campaign_waves);
alter table public.orbital_scores add constraint orbital_scores_score_check check (score between 0 and 5000000);
grant insert (campaign_waves) on public.orbital_scores to anon;
notify pgrst, 'reload schema';
commit;
