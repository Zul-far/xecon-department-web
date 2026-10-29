# Orbital Defense leaderboard

The game is configured for Supabase project `mabsifxswbqhzpnjyodn`.
Only its browser-safe publishable key is included in the website.

## Activate the database

1. Open this project in the Supabase dashboard.
2. Open **SQL Editor → New query**.
3. Paste all of `leaderboard-setup.sql` and click **Run**. It creates
   `public.orbital_scores`, an index, explicit grants, and Row Level Security policies.
4. Leave the Data API enabled with `public` exposed (the standard configuration).
5. Use **Refresh scores** in the game. An empty database should show
   “No scores yet,” not a connection error.

The publishable key cannot create tables or policies. This SQL must be run by
the project owner; no database password or secret key belongs in the website.
The script can be rerun for this schema without deleting existing scores.

## Publish the website changes

Commit and push `orbital-defense.html` and `orbital-leaderboard.js` to the branch
that GitHub Pages publishes. Keep both files in the same published directory.
The SQL and this guide can be kept in the repository for reference, but SQL is
not executed by GitHub Pages or by merely linking the repository to Supabase.

Live game: https://zul-far.github.io/xecon-department-web/orbital-defense.html

## Verify it

1. Open the live game and check that the leaderboard loads.
2. Finish or lose a run; enter three letters and submit once.
3. Open the page in another browser or device. The submitted score should appear
   if it ranks in the top 20. All runs are stored even when outside the top 20.
4. Refreshing/retrying the same submission must not add a duplicate run.
5. Check a new run starts with an empty submission form and one nuke slot.

Ranking uses total earned points, including points spent on upgrades. Ties use
wave reached, then the earliest submission. Three-letter names may repeat.
The browser generates one UUID per completed run to make retries idempotent.

This is a casual leaderboard: visitors may read and insert valid entries, but
cannot update/delete rows or supply timestamps. The database validates names,
numeric limits, and outcomes. It does not verify gameplay or rate-limit anonymous
submissions. Stronger abuse prevention requires a server-validated submission
endpoint. No personal information or player account is required.

Connection failures do not stop gameplay. A failed submission can be retried
while its end-of-run screen is open; restarting or reloading discards unsent runs.
