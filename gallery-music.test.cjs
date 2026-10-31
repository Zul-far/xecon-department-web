const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer, listTracks } = require('./music-server.cjs');
const { chromium } = require(process.argv[2] || 'playwright');

// Silent WAV fixtures test actual browser decoding and playback without bundled music.
function wav() {
  const samples = 8000 * 20;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36);
  data.writeUInt32LE(samples * 2, 40);
  return data;
}

(async () => {
  const names = ['gallery-test-' + Date.now() + '-a #.wav', 'gallery-test-' + Date.now() + '-b.wav'];
  const files = names.map(name => path.join(__dirname, 'music', name));
  const server = createServer();
  let browser;
  try {
    fs.writeFileSync(files[0], wav(), { flag: 'wx' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    assert(listTracks().includes(names[0]));
    fs.writeFileSync(files[1], wav(), { flag: 'wx' });
    const tracks = await fetch(origin + '/api/music').then(r => r.json());
    assert(tracks.includes(names[1]), 'New files should be discovered without restarting');
    assert(!tracks.includes('tracks.js') && !tracks.includes('README.md'));
    const range = await fetch(origin + '/music/' + encodeURIComponent(names[0]), { headers: { Range: 'bytes=0-43' } });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 44);
    assert.equal((await fetch(origin + '/.git/config')).status, 403);
    assert.equal((await fetch(origin + '/music-server.cjs')).status, 404);
    try { browser = await chromium.launch({ headless: true }); }
    catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/music', route => route.fulfill({ json: names }));
    await page.goto(origin + '/gallery.html');
    assert(await page.locator('audio').evaluate(el => el.paused && !el.currentSrc), 'No autoplay');
    await page.getByRole('button', { name: 'Play a random song' }).click();
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    const first = await page.locator('audio').evaluate(el => el.currentSrc);
    await page.getByRole('button', { name: 'Pause music' }).click();
    assert(await page.locator('audio').evaluate(el => el.paused));
    await page.getByRole('button', { name: 'Play a random song' }).click();
    await page.waitForFunction(previous => {
      const el = document.querySelector('audio'); return !el.paused && el.currentSrc !== previous;
    }, first);
    const second = await page.locator('audio').evaluate(el => el.currentSrc);
    await page.locator('audio').evaluate(el => { el.currentTime = el.duration - 0.08; });
    await page.waitForFunction(previous => {
      const el = document.querySelector('audio'); return !el.paused && el.currentSrc !== previous;
    }, second);
    await page.locator('#music-volume').fill('0.2');
    assert.equal(await page.locator('audio').evaluate(el => el.volume), 0.2);
    await page.screenshot({ path: path.join(__dirname, 'gallery-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const boxes = await page.evaluate(() => {
      const player = document.querySelector('.music-player').getBoundingClientRect();
      const back = document.querySelector('.back').getBoundingClientRect();
      return { inside: player.left >= 0 && player.right <= innerWidth, separate: player.top >= back.bottom };
    });
    assert(boxes.inside && boxes.separate, 'Mobile controls must fit without overlap');
    await page.screenshot({ path: path.join(__dirname, 'gallery-mobile.png') });
    await page.getByRole('button', { name: 'Pause music' }).click();
    await page.unroute('**/api/music');
    await page.route('**/api/music', route => route.fulfill({ json: [] }));
    await page.getByRole('button', { name: 'Play a random song' }).click();
    await page.waitForFunction(() => document.querySelector('#music-status').textContent.includes('Add songs'));
    assert(await page.getByRole('button', { name: 'Play a random song' }).isEnabled());
    // A static host has no directory endpoint; use the generated playlist.
    await page.unroute('**/api/music');
    await page.route('**/api/music', route => route.fulfill({ status: 404 }));
    await page.route('**/music/tracks.js', route => route.fulfill({
      contentType: 'text/javascript', body: 'window.GALLERY_TRACKS = ' + JSON.stringify([names[0]]) + ';'
    }));
    await page.reload();
    await page.getByRole('button', { name: 'Play a random song' }).click();
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    await page.getByRole('button', { name: 'Pause music' }).click();
    await page.getByRole('button', { name: 'Play a random song' }).click();
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    assert.deepEqual(errors, []);
    console.log('Passed: real audio playback, random selection, pause, automatic next song, single-song playback, volume, live folder discovery, static playlist fallback, empty folder, byte ranges, and mobile layout.');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    for (const file of files) if (fs.existsSync(file)) fs.unlinkSync(file);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
