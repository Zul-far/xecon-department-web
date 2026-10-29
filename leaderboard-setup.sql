-- Run this entire file in your Supabase project's SQL Editor.
-- Project: mabsifxswbqhzpnjyodn. This creates only Orbital Defense objects.
begin;

create table if not exists public.orbital_scores (
  run_id uuid primary key,
  player_name text not null check (player_name ~ '^[A-Z]{3}$'),
  score integer not null check (score between 0 and 5000000),
  campaign_waves smallint not null default 33 constraint orbital_campaign_waves check (campaign_waves in (10,33)),
  wave smallint not null constraint orbital_scores_wave_check check (wave between 1 and campaign_waves),
  outcome text not null check (outcome in ('won', 'lost')),
  created_at timestamptz not null default now(),
  constraint orbital_winning_wave check (outcome <> 'won' or wave = campaign_waves)
);

create index if not exists orbital_scores_ranking
  on public.orbital_scores (score desc, wave desc, created_at asc, run_id asc);

alter table public.orbital_scores enable row level security;
revoke all on public.orbital_scores from public, anon, authenticated;
grant usage on schema public to anon;
grant select on public.orbital_scores to anon;
-- Visitors cannot choose a timestamp, update a score, or delete another run.
grant insert (run_id, player_name, score, wave, outcome, campaign_waves)
  on public.orbital_scores to anon;

drop policy if exists orbital_scores_public_read on public.orbital_scores;
create policy orbital_scores_public_read on public.orbital_scores
  for select to anon using (true);
drop policy if exists orbital_scores_public_submit on public.orbital_scores;
create policy orbital_scores_public_submit on public.orbital_scores
  for insert to anon with check (true);

notify pgrst, 'reload schema';
commit;

-- This is a casual, client-reported leaderboard. Constraints validate the
-- format and bounds; they do not prove a run is genuine or prevent spam.
