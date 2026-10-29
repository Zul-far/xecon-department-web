const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');

(async () => {
  // Expose controlled end-of-run states in the test response only.
  const original = fs.readFileSync(path.join(__dirname, 'orbital-defense.html'), 'utf8');
  const html = original.replace(/\}\)\(\);\s*<\/script>/, `window.__gameTest={end(){state='lost';totalScore=1234;score=34;wave=3;modal('SAM lost.','Test completed run','Try again');},win(){reset();state='won';totalScore=90000;wave=33;modal('SAM is secure.','All 33 waves cleared.','Play again');},shop(credits){score=credits;openShop();},reset};})();</script>`);
  assert.notEqual(html, original, 'Game test seam must be installed');
  const server = http.createServer((req, res) => {
    if (req.url === '/orbital-leaderboard.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(__dirname, 'orbital-leaderboard.js'))); }
    else { res.setHeader('Content-Type', 'text/html'); res.end(html); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    try { browser = await chromium.launch({ headless: true }); }
    catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const entries = [];
    let posts = 0, fail = false, loseResponse = false, missing = false;
    await page.route('https://mabsifxswbqhzpnjyodn.supabase.co/rest/v1/**', async route => {
      if (fail) return route.abort();
      if (missing) return route.fulfill({ status: 404, json: { code: 'PGRST205' } });
      if (route.request().method() === 'POST') {
        posts++;
        const entry = route.request().postDataJSON();
        if (entries.some(row => row.run_id === entry.run_id)) return route.fulfill({ status: 409, json: { code: '23505' } });
        entries.push(entry);
        if (loseResponse) { loseResponse = false; return route.abort(); }
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fulfill({ json: entries });
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.getByText('No scores yet.', { exact: false }).waitFor();
    assert.equal(await page.locator('#scoreEntry').isVisible(), false);
    await page.locator('#start').click();
    assert.equal(await page.locator('#ammo').textContent(), '1 / 1');
    assert.equal(await page.locator('#wave').textContent(), '01 / 33');
    const screenshotDir = path.join(require('node:os').tmpdir(), 'orbital-leaderboard-checks');
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.locator('#game').screenshot({ path: path.join(screenshotDir, 'sam-station.png') });
    await page.evaluate(() => window.__gameTest.shop(5999));
    assert.equal(await page.locator('#buySensor').isDisabled(), true);
    await page.locator('#buyReload').click();
    assert.match(await page.locator('#balance').textContent(), /5649/);
    assert.match(await page.locator('#systems').textContent(), /0.96s/);
    await page.evaluate(() => window.__gameTest.shop(6000));
    await page.locator('#buySensor').click();
    assert.equal(await page.locator('#buySensor').isDisabled(), true);
    assert.match(await page.locator('#systems').textContent(), /Sensor ON/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(screenshotDir, 'sam-upgrades-mobile.png'), fullPage: true });
    await page.locator('#start').click();
    assert.equal(await page.locator('#wave').textContent(), '02 / 33');
    await page.setViewportSize({ width: 1200, height: 1000 });
    await page.evaluate(() => window.__gameTest.end());
    await page.locator('#pilotName').fill('ace');
    assert.equal(await page.locator('#pilotName').inputValue(), 'ACE');
    await page.locator('#submitScore').click();
    await page.getByText('Score submitted!', { exact: false }).waitFor();
    assert.equal(entries[0].score, 1234, 'Use earned score, not 34 remaining credits');
    assert.equal(entries[0].wave, 3);
    assert.equal(entries[0].campaign_waves, 33);
    assert.equal(entries[0].player_name, 'ACE');
    assert.equal(await page.locator('#submitScore').isDisabled(), true);
    await page.locator('#scoreRows tr').waitFor();
    assert.equal(posts, 1);
    await page.locator('#start').click();
    assert.equal(await page.locator('#scoreEntry').isVisible(), false);
    await page.evaluate(() => window.__gameTest.end());
    await page.locator('#pilotName').fill('xyz');
    loseResponse = true;
    await page.locator('#submitScore').click();
    await page.getByRole('button', { name: 'Retry submission' }).waitFor();
    assert.equal(entries.length, 2, 'Server saved the run before the response was lost');
    await page.locator('#submitScore').click();
    await page.getByText('Score submitted!', { exact: false }).waitFor();
    assert.equal(entries.length, 2, 'Retry must not create a duplicate run');
    assert.notEqual(entries[0].run_id, entries[1].run_id);
    entries.push({ run_id: 'untrusted', player_name: '<img src=x onerror=alert(1)>', score: 0, wave: 1, outcome: 'lost' });
    await page.locator('#refreshScores').click();
    await page.waitForFunction(() => document.querySelectorAll('#scoreRows tr').length === 3);
    assert.equal(await page.locator('#scoreRows img').count(), 0, 'Names must render as text');
    missing = true;
    await page.locator('#refreshScores').click();
    await page.getByText('The leaderboard is awaiting setup.', { exact: false }).waitFor();
    assert.equal(await page.locator('#scoreRows tr').count(), 3, 'Keep prior rows on network/setup failure');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const cardFits = await page.locator('.card').evaluate(el => el.clientHeight <= el.parentElement.clientHeight);
    assert.equal(cardFits, true, 'End screen must scroll inside the small mobile overlay');
    await page.screenshot({ path: path.join(screenshotDir, 'orbital-leaderboard-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1200, height: 1000 });
    await page.screenshot({ path: path.join(screenshotDir, 'orbital-leaderboard-desktop.png'), fullPage: true });
    console.log('Screenshots:', screenshotDir);
    missing = false;
    entries.push({ run_id: 'legacy', player_name: 'OLD', score: 10000, wave: 10, campaign_waves: 10, outcome: 'won' });
    await page.evaluate(() => window.__gameTest.win());
    await page.locator('#pilotName').fill('SAM');
    await page.locator('#submitScore').click();
    await page.getByText('Score submitted!', { exact: false }).waitFor();
    assert.equal(entries.at(-1).wave, 33);
    assert.equal(entries.at(-1).campaign_waves, 33);
    await page.getByRole('cell', { name: 'Saved SAM', exact: true }).waitFor();
    await page.getByRole('cell', { name: 'Legacy win', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: game startup, completed-run score, initials, submission, reset, lost-response retry, duplicate protection, safe rendering, setup failure, mobile layout; no page errors.');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
