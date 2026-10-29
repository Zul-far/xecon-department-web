/* Browser-safe publishable key. Database access is restricted by leaderboard-setup.sql. */
(() => {
  'use strict';
  const API = 'https://mabsifxswbqhzpnjyodn.supabase.co/rest/v1/orbital_scores';
  const KEY = 'sb_publishable_RG3tkIgtQakVAvc1v-thaA_c-df0IAz';
  const $ = id => document.getElementById(id);
  $('start').before($('scoreEntryTemplate').content.cloneNode(true));
  let run = null;
  let latestId = null;
  let loading = false;

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        ...options, signal: controller.signal,
        headers: { apikey: KEY, ...options.headers }, cache: 'no-store'
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw Object.assign(new Error('Leaderboard request failed'), { code: error.code, status: response.status });
      }
      const body = await response.text();
      return body ? JSON.parse(body) : null;
    } finally { clearTimeout(timeout); }
  }

  function errorMessage(error) {
    if (['PGRST205', '42P01', '42501'].includes(error.code)) return 'The leaderboard is awaiting setup. You can still play; please try again later.';
    if (error.status === 429) return 'Too many requests. Please wait a moment and retry.';
    return 'Could not connect to the leaderboard. Check your connection and retry.';
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    $('refreshScores').disabled = true;
    $('leaderboardStatus').textContent = 'Loading scores…';
    try {
      const entries = await request(API + '?select=run_id,player_name,score,wave,outcome&order=score.desc,wave.desc,created_at.asc,run_id.asc&limit=20');
      const rows = document.createDocumentFragment();
      entries.forEach((entry, index) => {
        const row = document.createElement('tr');
        if (entry.run_id === latestId) row.dataset.latest = 'true';
        [index + 1, entry.player_name, Number(entry.score).toLocaleString(), entry.wave + ' / 10', entry.outcome === 'won' ? 'Saved Earth' : 'Lost'].forEach(value => {
          const cell = document.createElement('td');
          cell.textContent = String(value);
          row.append(cell);
        });
        rows.append(row);
      });
      $('scoreRows').replaceChildren(rows);
      $('leaderboardStatus').textContent = entries.length ? 'Shared scores · refresh to see the latest runs.' : 'No scores yet. Be the first pilot on the board.';
    } catch (error) {
      $('leaderboardStatus').textContent = errorMessage(error) + ($('scoreRows').children.length ? ' Previously loaded scores are still shown.' : '');
    } finally {
      loading = false;
      $('refreshScores').disabled = false;
    }
  }

  function reset() {
    run = null;
    $('scoreEntry').hidden = true;
    $('submitStatus').textContent = '';
    $('submitScore').disabled = false;
    $('pilotName').disabled = false;
    $('pilotName').value = '';
  }

  function finish(result) {
    if (run) return;
    run = { ...result, run_id: crypto.randomUUID(), pending: false, submitted: false, payload: null };
    $('scoreEntry').hidden = false;
    $('runScore').textContent = 'Leaderboard score: ' + result.score.toLocaleString();
    $('submitStatus').textContent = 'Submitting makes your initials and score public.';
    $('submitScore').textContent = 'Submit score';
    $('pilotName').focus();
  }

  $('pilotName').addEventListener('input', event => {
    event.target.value = event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3);
  });
  $('scoreEntry').addEventListener('submit', async event => {
    event.preventDefault();
    const current = run;
    if (!current || current.pending || current.submitted) return;
    const name = $('pilotName').value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(name)) {
      $('submitStatus').textContent = 'Enter exactly three letters, such as ACE.';
      $('pilotName').focus();
      return;
    }
    // Keep the same ID and payload on retries, including after a lost response.
    current.payload ||= { run_id: current.run_id, player_name: name, score: current.score, wave: current.wave, outcome: current.outcome };
    current.pending = true;
    $('submitScore').disabled = true;
    $('pilotName').disabled = true;
    $('submitStatus').textContent = 'Submitting score…';
    try {
      try {
        await request(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(current.payload) });
      } catch (error) {
        if (error.code !== '23505') throw error;
        // A retry may find that the earlier request already saved this run.
      }
      current.submitted = true;
      latestId = current.run_id;
      if (run === current) {
        $('submitStatus').textContent = 'Score submitted! Your run is saved to the shared leaderboard.';
        $('submitScore').textContent = 'Submitted';
      }
      await refresh();
    } catch (error) {
      if (run === current) {
        $('submitStatus').textContent = errorMessage(error);
        $('submitScore').textContent = 'Retry submission';
        $('submitScore').disabled = false;
      }
    } finally { current.pending = false; }
  });
  $('refreshScores').addEventListener('click', refresh);
  window.OrbitalLeaderboard = { finish, reset };
  refresh();
})();
