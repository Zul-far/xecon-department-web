const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, 'life-sim.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function world() {
  const elements = new Map();
  const documentEvents = new Map();
  let seed = 42;
  let nextId = 0;
  let renders = 0;
  const drawing = { gradients: 0, sprites: [], images: [] };
  const math = Object.create(Math);
  math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const context = {
    setTransform() {},
    clearRect() { renders += 1; },
    fillRect() {},
    drawImage(...args) { drawing.images.push(args); },
    createRadialGradient() {
      drawing.gradients += 1;
      return { addColorStop() {} };
    }
  };
  const canvas = {
    clientWidth: 1200, clientHeight: 800, style: {},
    parentElement: { getBoundingClientRect: () => ({ width: 1200, height: 800 }) },
    getContext: () => context
  };
  elements.set('world', canvas);
  const scope = vm.createContext({
    Math: math, crypto: { randomUUID: () => String(++nextId) },
    document: {
      getElementById: id => elements.get(id),
      addEventListener(type, callback) { documentEvents.set(type, callback); },
      createElement(tag) {
        assert.equal(tag, 'canvas');
        const sprite = { getContext: () => context };
        drawing.sprites.push(sprite);
        return sprite;
      }
    },
    window: { devicePixelRatio: 1, addEventListener() {} },
    requestAnimationFrame() {}
  });
  vm.runInContext(script, scope);
  const run = code => vm.runInContext(code, scope);
  return { run, canvas, drawing, context, documentEvents, renders: () => renders };
}

test('all particles render from reusable color sprites without regenerating gradients', () => {
  const w = world();
  assert.equal(w.drawing.gradients, 4);
  w.run("sim.entities = Object.keys(species).map(kind => createEntity(kind, 1, 500, 400));");
  const before = w.run('JSON.stringify(sim.entities)');
  w.drawing.images.length = 0;
  w.run('render(); render();');
  assert.equal(w.drawing.images.length, 8);
  assert.equal(w.drawing.gradients, 4);
  assert.equal(w.context.globalCompositeOperation, 'lighter');
  for (let i = 0; i < 4; i++) {
    assert.equal(w.drawing.images[i][0], w.drawing.sprites[i]);
    assert.equal(w.drawing.images[i + 4][0], w.drawing.sprites[i]);
  }
  assert.equal(w.run('JSON.stringify(sim.entities)'), before);
});

test('resizing blobs reuses sprites and preserves particle count', () => {
  const w = world();
  w.run('sim.paused = true;');
  const before = w.run('sim.entities.length');
  const initialWidth = w.drawing.images[0][3];
  w.drawing.images.length = 0;
  w.run('sim.blobScale = 80; render();');
  assert.equal(w.drawing.images.length, before);
  assert.equal(w.drawing.images[0][3], initialWidth * 2);
  assert.equal(w.drawing.gradients, 4);
  assert.equal(w.run('sim.entities.length'), before);
  w.drawing.images.length = 0;
  w.run('for (const e of sim.entities) e.radius *= 2; render();');
  assert.equal(w.drawing.images[0][3], initialWidth * 4);
  assert.equal(w.drawing.gradients, 4);
});

test('motion is approximately doubled while age advances in seconds', () => {
  const w = world();
  const result = w.run(`(() => {
    sim.chaos = 0;
    const e = createEntity('circle', 1, 300, 300);
    e.vx = 1; e.vy = 0;
    updateEntity(e, 1 / 60);
    return { distance: e.x - 300, age: e.age };
  })()`);
  assert.ok(result.distance > 1.9 && result.distance < 2);
  assert.equal(result.age, 1 / 60);
});

test('attraction and repulsion keep equal and opposite directions', () => {
  const w = world();
  for (const other of ['square', 'triangle']) {
    const velocities = w.run(`(() => {
      const a = createEntity('circle', 1, 300, 300);
      const b = createEntity('${other}', 1, 360, 300);
      a.vx = a.vy = b.vx = b.vy = 0;
      interact(a, b);
      return [a.vx, b.vx];
    })()`);
    assert.ok(other === 'square' ? velocities[0] > 0 : velocities[0] < 0);
    assert.equal(velocities[0], -velocities[1]);
  }
});

test('both decay catalysts launch away regardless of pair ordering', () => {
  for (const [stable, unstable, child] of [['circle', 'hex', 'square'], ['square', 'triangle', 'circle']]) {
    for (const reversed of [false, true]) {
      const w = world();
      const result = w.run(`(() => {
        const s = createEntity('${stable}', 1, 300, 300);
        const u = createEntity('${unstable}', 1, 320, 300);
        s.vx = s.vy = u.vx = u.vy = 0;
        const outcome = interact(${reversed ? 'u, s' : 's, u'});
        const launchVelocity = s.vx;
        updateEntity(s, PHYSICS_STEP);
        return { launchVelocity, after: s.vx, removed: outcome.removeIds,
          stableId: s.id, unstableId: u.id, children: outcome.additions.map(e => e.kind) };
      })()`);
      assert.ok(result.launchVelocity < -3.6);
      assert.ok(result.after < -3, 'launch must survive the normal speed cap');
      assert.deepEqual(Array.from(result.removed), [result.unstableId]);
      assert.deepEqual(Array.from(result.children), [child, child]);
    }
  }
});

test('decay fragments retain the separation kick and do not bounce back together', () => {
  const w = world();
  const result = w.run(`(() => {
    sim.chaos = 0;
    const parent = createEntity('hex', 1, 500, 400);
    parent.vx = parent.vy = 0;
    const children = decayEntity(parent, 'test');
    const before = Math.hypot(children[0].x - children[1].x, children[0].y - children[1].y);
    children.forEach(e => updateEntity(e, PHYSICS_STEP));
    return { before, after: Math.hypot(children[0].x - children[1].x, children[0].y - children[1].y),
      speeds: children.map(e => Math.hypot(e.vx, e.vy)) };
  })()`);
  assert.ok(result.after > result.before + 20);
  assert.ok(result.speeds.every(speed => speed > 13));
  assert.ok(w.run(`(() => {
    sim.chaos = 0;
    const a = createEntity('circle', 1, 500, 400);
    const b = createEntity('circle', 1, 501, 400);
    a.vx = -2; b.vx = 2; a.vy = b.vy = 0;
    a.cooldown = b.cooldown = 10;
    interact(a, b);
    return a.vx < 0 && b.vx > 0;
  })()`));
});

test('decay uses the specified seconds and stable particles persist', () => {
  const w = world();
  assert.ok(w.run(`(() => {
    sim.chaos = 0;
    for (const [kind, min, max] of [['hex', 5, 10], ['triangle', 10, 20]]) {
      for (let i = 0; i < 100; i++) {
        const life = decayLifetimeSeconds(kind);
        if (life < min || life > max) return false;
      }
      const e = createEntity(kind, 1, 500, 400);
      e.age = e.decayAt - 0.1;
      if (updateEntity(e, 0.05) !== null) return false;
      if (updateEntity(e, 0.051)?.length !== 2) return false;
    }
    const stable = createEntity('circle', 1, 500, 400);
    stable.age = 100000;
    return updateEntity(stable, PHYSICS_STEP) === null;
  })()`));
});

test('30, 60, and 144 Hz run identical physics for the same elapsed time', () => {
  const snapshots = [];
  for (const hz of [30, 60, 144]) {
    const w = world();
    const initialRenders = w.renders();
    w.run(`for (let i = 0; i <= ${hz}; i++) frame(i * 1000 / ${hz});`);
    snapshots.push(w.run('JSON.stringify(sim.entities)'));
    assert.equal(w.renders() - initialRenders, hz + 1, 'render only once per displayed frame');
  }
  assert.equal(snapshots[0], snapshots[1]);
  assert.equal(snapshots[1], snapshots[2]);
});

test('animation starts with the existing defaults and handles returning to the page', () => {
  const w = world();
  assert.equal(w.run('sim.entities.length'), 18);
  assert.equal(w.run('sim.chaos'), 1.6);
  assert.equal(w.run('sim.collisionScale'), 2);
  assert.equal(w.run('sim.blobScale'), 40);
  w.run('frame(0); frame(1000 / 60);');
  const before = w.run('JSON.stringify(sim.entities)');
  w.documentEvents.get('visibilitychange')();
  w.run('frame(12000);');
  assert.equal(w.run('JSON.stringify(sim.entities)'), before, 'no time jump after returning');
  w.run('frame(12000 + 1000 / 60);');
  assert.notEqual(w.run('JSON.stringify(sim.entities)'), before);
  w.run('resetSim();');
  assert.equal(w.run('sim.paused'), false);
  assert.ok(w.run("sim.entities.every(e => stableStateOf(e.kind) === 'unstable')"));
});

test('small particles still collide during high speed launches', () => {
  const w = world();
  assert.ok(w.run(`(() => {
    sim.chaos = 0;
    sim.entities = [];
    for (let i = 0; i < 8; i++) {
      const e = createEntity('circle', 1, 100 + i * 120, 700);
      e.vx = e.vy = 0;
      sim.entities.push(e);
    }
    const a = createEntity('circle', 1, 300, 200);
    const b = createEntity('circle', 1, 320, 200);
    a.radius = b.radius = 2;
    a.burstSpeed = b.burstSpeed = 14;
    a.vx = 14; b.vx = -14; a.vy = b.vy = 0;
    sim.entities.push(a, b);
    mergeRules['circle:circle'].chance = 1;
    for (let i = 0; i < 3; i++) step(PHYSICS_STEP);
    return sim.merges === 1;
  })()`));
});
