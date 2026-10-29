const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'orbital-defense.html'), 'utf8');
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const nodes = new Map();
const context2d = new Proxy({}, { get: (o, k) => o[k] || (() => {}) });
const document = { addEventListener() {}, getElementById(id) {
  if (!nodes.has(id)) nodes.set(id, { textContent: '', value: '', hidden: false, disabled: false, addEventListener() {}, focus() {}, getContext: () => context2d });
  return nodes.get(id);
}};
const scope = { document, window: {}, requestAnimationFrame() {}, console };
vm.createContext(scope);
const hook = `window.test={reset,update,nextWave,openShop,buyUpgrade,draw,positionBodies,fire,
  get:()=>({state,wave,score,totalScore,ammo,maxAmmo,reloadUpgrades,hasSensor,reloadTime:reloadSeconds(),rocks,shots,blasts,health,bodies,waveLayouts}),
  shop:(credits)=>{state='shop';score=credits;refreshShop();},
  clear:()=>{rocks=[];spawned=3+wave;clearedAt=time-2;},
  scene:(sensor)=>{reset();hasSensor=sensor;spawnAt=999;shots=[{x:500,y:50,vx:0,vy:0,life:0,trail:[]}];rocks=[rock(540,50,0,0,64),rock(620,50,0,0,1),rock(720,50,0,0,1)];},
  emptyAmmo:()=>{ammo=0;reload=0;spawnAt=999;},
  hurt:()=>{health=0;}
};`;
vm.runInContext(source.replace(/\}\)\(\);\s*$/, hook + '})();'), scope);
const g = scope.window.test;
g.reset();
assert.equal(g.get().ammo, 1);
assert.equal(g.get().reloadTime, 1.2);
g.shop(5999);g.buyUpgrade('sensor');assert.equal(g.get().hasSensor, false);assert.equal(g.get().score, 5999);
g.shop(6000);g.buyUpgrade('sensor');assert.equal(g.get().hasSensor, true);assert.equal(g.get().score, 0);
g.shop(6000);g.buyUpgrade('sensor');assert.equal(g.get().score, 6000, 'No repeated sensor purchase');
g.shop(100000);for(let i=0;i<6;i++)g.buyUpgrade('reload');
assert.ok(g.get().reloadTime < .32);
const credits = g.get().score;g.buyUpgrade('reload');assert.equal(g.get().score, credits);
g.nextWave();g.emptyAmmo();g.update(.30);assert.equal(g.get().ammo, 0);g.update(.02);assert.equal(g.get().ammo, 1);
g.reset();assert.equal(g.get().reloadUpgrades, 0);assert.equal(g.get().hasSensor, false);
g.scene(false);g.update(1/120);assert.equal(g.get().shots.length, 1);assert.equal(g.get().rocks.length, 3);
g.scene(true);g.update(1/120);
assert.equal(g.get().shots.length, 0);assert.equal(g.get().blasts.length, 1);
assert.ok(g.get().rocks.some(a => a.x > 700 && a.m === 1), 'Outside blast survives');
assert.ok(!g.get().rocks.some(a => a.m === 64), 'Large asteroid takes blast damage');
assert.ok(g.get().rocks.filter(a => a.m === 16).length >= 1, 'New fragments do not get hit again by the same blast');
assert.ok(g.get().rocks.length <= 3, 'No four-way fragmentation');
assert.ok(!g.get().rocks.some(a => a.x > 600 && a.x < 650), 'Small asteroid inside blast vanishes');
assert.equal(g.get().health, 100, 'Sensor blast does not damage SAM');g.draw();
g.reset();
for(let wave=1;wave<=33;wave++){
  assert.equal(g.get().wave,wave);g.positionBodies();g.draw();
  const b=g.get().bodies;
  assert.ok(Math.hypot(b[1].x-b[2].x,b[1].y-b[2].y)>b[1].r+b[2].r);
  for(const body of b.slice(1))assert.ok(Math.hypot(body.x-b[0].x,body.y-b[0].y)>body.r+b[0].r+30);
  g.clear();g.update(1/120);
  assert.equal(g.get().state,wave===33?'won':'shop');
  if(wave<33)g.nextWave();
}
assert.equal(new Set(g.get().waveLayouts.map(JSON.stringify)).size,33);
assert.equal(g.get().bodies[1].name,'Celone');assert.equal(g.get().bodies[2].name,'Celegon');
g.reset();g.hurt();g.update(1/120);assert.equal(g.get().state,'lost');
console.log('PASS: all 33 waves, unique safe body layouts, final victory/loss, reload timing and cap, sensor price and single purchase, proximity trigger, area damage, fragment survival, reset and rendering.');
