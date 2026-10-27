const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.argv[2] || 'playwright');

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(pathToFileURL(path.join(__dirname, 'life-sim.html')).href);
    const results = process.argv.includes('--layout-only') ? null : await page.evaluate(() => {
      function referenceDraw(entity) {
        const radius = entity.radius * sim.blobScale;
        const gradient = ctx.createRadialGradient(entity.x, entity.y, 0, entity.x, entity.y, radius);
        for (const [stop, alpha] of [[0, 'aa'], [0.35, '4a'], [0.7, '14'], [0.9, '04'], [1, '00']]) {
          gradient.addColorStop(stop, species[entity.kind].color + alpha);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(entity.x - radius, entity.y - radius, radius * 2, radius * 2);
      }
      function draw(drawParticle) {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        ctx.globalCompositeOperation = 'lighter';
        for (const entity of sim.entities) drawParticle(entity);
      }
      function pixels() {
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      function measure(drawParticle) {
        const times = [];
        for (let i = 0; i < 12; i++) {
          const start = performance.now();
          draw(drawParticle);
          ctx.getImageData(0, 0, 1, 1);
          times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        return times[Math.floor(times.length / 2)];
      }
      const cases = [];
      for (const count of [18, 120]) {
        sim.entities = Array.from({ length: count }, (_, i) => ({
          kind: Object.keys(species)[i % 4],
          x: (i * 197 + 40) % canvas.clientWidth,
          y: (i * 131 + 70) % canvas.clientHeight,
          radius: 14 + i % 8
        }));
        draw(referenceDraw);
        const reference = pixels();
        draw(drawEntity);
        const cached = pixels();
        let difference = 0;
        let largestDifference = 0;
        for (let i = 0; i < reference.length; i += 4) {
          for (let channel = 0; channel < 3; channel++) {
            // Compare the visible premultiplied color on the black background.
            const error = Math.abs(reference[i + channel] * reference[i + 3] / 255 -
              cached[i + channel] * cached[i + 3] / 255);
            difference += error;
            largestDifference = Math.max(largestDifference, error);
          }
        }
        measure(referenceDraw);
        measure(drawEntity);
        const gradientMs = measure(referenceDraw);
        const spriteMs = measure(drawEntity);
        resetSim();
        sim.spawnCount = count;
        spawnWorld();
        const beforePhysics = performance.now();
        for (let i = 0; i < 120; i++) step(PHYSICS_STEP);
        const physicsMs = (performance.now() - beforePhysics) / 120;
        cases.push({ count, gradientMs, spriteMs, speedup: gradientMs / spriteMs,
          meanPixelError: difference / (reference.length / 4 * 3), largestDifference, physicsMs });
      }
      const sprites = Object.values(blobSprites);
      const transparentBorders = sprites.every(sprite => {
        const pixels = sprite.getContext('2d').getImageData(0, 0, sprite.width, sprite.height).data;
        for (let x = 0; x < sprite.width; x++) {
          if (pixels[x * 4 + 3] || pixels[((sprite.height - 1) * sprite.width + x) * 4 + 3]) return false;
        }
        for (let y = 0; y < sprite.height; y++) {
          if (pixels[y * sprite.width * 4 + 3] || pixels[(y * sprite.width + sprite.width - 1) * 4 + 3]) return false;
        }
        return true;
      });
      resetSim();
      return { cases, transparentBorders };
    });
    assert.deepEqual(errors, []);
    if (results) {
      assert.ok(results.transparentBorders, 'sprites must fade fully to transparent at their edges');
      for (const result of results.cases) {
        assert.ok(result.meanPixelError < 3, 'sprites must preserve the original gradient appearance');
      }
    }
    assert.equal(await page.getByRole('heading', { name: 'Welcome to the Xecon Department', exact: true }).count(), 1);
    assert.equal(await page.locator('button, input, .toolbar, .rules').count(), 0);
    assert.equal(await page.evaluate(() => sim.entities.length), 18);
    for (const viewport of [
      { width: 1280, height: 720 }, { width: 390, height: 844 },
      { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1920, height: 1080 }
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        resize();
        resetSim();
        const heading = document.querySelector('h1');
        const style = getComputedStyle(heading);
        const fits = [...heading.children].every(line => {
          const range = document.createRange();
          range.selectNodeContents(line);
          const rect = range.getBoundingClientRect();
          return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
        });
        const linksFit = [...document.querySelectorAll('.destination-link')].every(link => {
          const rect = link.getBoundingClientRect();
          return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
        });
        const before = JSON.stringify(sim.entities);
        frame(0);
        frame(1000 / 60);
        return { fits, linksFit, color: style.color, stroke: style.webkitTextStrokeWidth,
          animates: JSON.stringify(sim.entities) !== before,
          canvasFits: canvas.clientWidth === innerWidth && canvas.clientHeight === innerHeight };
      });
      assert.ok(layout.fits, `heading must fit ${viewport.width}x${viewport.height}`);
      assert.ok(layout.linksFit, `navigation must fit ${viewport.width}x${viewport.height}`);
      assert.equal(layout.color, 'rgba(0, 0, 0, 0)');
      assert.ok(parseFloat(layout.stroke) >= 1);
      assert.ok(layout.animates && layout.canvasFits);
      if (viewport.width === 1280 || viewport.width === 390) {
        await page.screenshot({ path: path.join(__dirname, `xecon-${viewport.width === 1280 ? 'desktop' : 'mobile'}.png`) });
      }
    }
    for (const [label, filename] of [['Game', 'orbital-defense.html'], ['Gallery', 'gallery.html']]) {
      await page.goto(pathToFileURL(path.join(__dirname, 'life-sim.html')).href);
      await page.getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(pathToFileURL(path.join(__dirname, filename)).href);
    }
    assert.deepEqual(errors, []);
    if (results) console.log(JSON.stringify(results, null, 2));
    console.log('Browser checks passed: hollow heading, both navigation links, animation, five viewport sizes, and no page errors.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
