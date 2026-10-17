// Headless end-to-end check: boot -> menu -> track select -> race -> simulated driving.
// Rendering in software is slow, so simulation is advanced by calling update() directly.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
const out = process.argv[2] || '/tmp';
const track = process.argv[3] || 'gp';
const quality = process.argv[4] || 'bajo';
const simSeconds = +(process.argv[5] || 60);
const W = 960, H = 540;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript((q) => { try { const k = 'motomitico.save.v1'; const d = JSON.parse(localStorage.getItem(k) || '{}'); d.settings = { ...(d.settings || {}), quality: q }; localStorage.setItem(k, JSON.stringify(d)); } catch (e) {} }, quality);
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/s1_menu.png` });
await p.evaluate((t) => { const g = window.__game; g.ui._lastTrack = t; g.ui.trackSelect('race'); }, track);
await p.waitForTimeout(1000);
await p.screenshot({ path: `${out}/s2_tracks.png` });
await p.evaluate(() => { window.__game.ui.nav[0].click(); });
const t0 = Date.now();
await p.waitForFunction(() => window.__game.race && window.__game.state === 'race', null, { timeout: 180000 });
console.log('race loaded in', Date.now() - t0, 'ms');
await p.waitForTimeout(1000);
await p.screenshot({ path: `${out}/s3_intro.png` });
// pause the engine loop and drive the simulation manually
await p.evaluate(() => { const g = window.__game; g._origUpdate = g.engine.onUpdate; g.engine.onUpdate = () => {}; });
const sim = async (secs, keys = {}) => p.evaluate(({ secs, keys }) => {
  const g = window.__game, r = g.race;
  const I = g.__input || (g.__input = window.__game.race && null);
  for (let i = 0; i < secs * 60; i++) {
    // fake keyboard state
    const st = { throttle: 0, brake: 0, steer: 0, rearBrake: 0, nitro: false, wheelie: false, lookBack: false };
    if (keys.auto && r.phase === 'race') { r._autopilot(r.player); Object.assign(st, { throttle: r.player.phys.input.throttle, brake: r.player.phys.input.brake, steer: r.player.phys.input.steer, nitro: r.player.phys.input.nitro }); }
    else Object.assign(st, keys);
    const inp = window.__INPUT;
    Object.assign(inp.state, st);
    for (const k of Object.keys(inp.edges)) inp.edges[k] = false;
    if (keys.confirm && i === 0) inp.edges.confirm = true;
    r.update(1 / 60);
    if (g.state !== 'race') break;
  }
  const ph = r.player.phys;
  return { phase: r.phase, t: r.time.toFixed(1), kmh: (ph.v * 3.6).toFixed(0), gear: ph.gear, rpm: ph.rpm.toFixed(0), lap: ph.lap, s: ph.s.toFixed(0), d: ph.proj.d.toFixed(1), pos: r.order.indexOf(r.player) + 1, crashed: ph.crashed,
    ai: r.bikes.filter((b) => b.ai).map((b) => `${b.spec.short}:${(b.phys.v * 3.6).toFixed(0)}/L${b.phys.lap}${b.phys.crashed ? 'X' : ''}`).join(' ') };
}, { secs, keys });
console.log('skip intro', JSON.stringify(await sim(0.2, { confirm: true })));
console.log('countdown', JSON.stringify(await sim(6, { throttle: 0.5 })));
console.log('full gas', JSON.stringify(await sim(5, { throttle: 1 })));
await p.evaluate(() => window.__game.engine.render());
await p.screenshot({ path: `${out}/s4_race1.png` });
let last;
for (let k = 0; k < simSeconds / 15; k++) { last = await sim(15, { auto: true }); console.log(`auto ${k}`, JSON.stringify(last)); if (last.phase !== 'race') break; }
await p.evaluate(() => window.__game.engine.render());
await p.screenshot({ path: `${out}/s5_race2.png` });
console.log('ERRORS:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
await b.close();
