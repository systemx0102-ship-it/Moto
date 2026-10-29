// Visual QA: load a race on a track and capture chase, close-up and landscape shots.
// usage: node tools/scene-shot.mjs <outDir> [track=gp] [quality=alto] [style=anime|real] [time=auto] [weather=auto]
// Writes menu.png, chase1.png, chase2.png, side.png, front.png, wide.png into outDir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
const [out = '/tmp/shots', track = 'gp', quality = 'alto', style = 'real', time = 'auto', weather = 'auto'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const W = 1100, H = 620;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript((q) => {
  try {
    const k = 'motomitico.save.v1'; const d = JSON.parse(localStorage.getItem(k) || '{}');
    d.settings = { ...(d.settings || {}), quality: q.quality, laps: 2, camera: 0, style: q.style, timeSel: q.time, weatherSel: q.weather };
    localStorage.setItem(k, JSON.stringify(d));
  } catch (e) { /* ignore */ }
}, { quality, style, time, weather });
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/menu.png`, timeout: 240000 });
await p.evaluate((t) => { const g = window.__game; g.ui._lastTrack = t; g.ui.trackSelect('race'); }, track);
await p.waitForTimeout(800);
await p.evaluate(() => { window.__game.ui.nav[0].click(); });
await p.waitForFunction(() => window.__game.race && window.__game.state === 'race', null, { timeout: 180000 });
await p.evaluate(() => { const g = window.__game; g.engine.onUpdate = () => {}; });
const sim = (secs, keys = {}) => p.evaluate(({ secs, keys }) => {
  const g = window.__game, r = g.race, inp = window.__INPUT;
  for (let i = 0; i < secs * 60; i++) {
    const st = { throttle: 0, brake: 0, steer: 0, rearBrake: 0, nitro: false, wheelie: false, lookBack: false };
    if (keys.auto && r.phase === 'race') { r._autopilot(r.player); const pi = r.player.phys.input; Object.assign(st, { throttle: pi.throttle, brake: pi.brake, steer: pi.steer }); }
    else Object.assign(st, keys);
    Object.assign(inp.state, st);
    for (const k of Object.keys(inp.edges)) inp.edges[k] = false;
    if (keys.confirm && i === 0) inp.edges.confirm = true;
    g.engine.time += 1 / 60; g.engine.dt = 1 / 60;
    r.update(1 / 60);
    if (g.state !== 'race') break;
  }
}, { secs, keys });
const shot = async (name) => { await p.evaluate(() => window.__game.engine.render()); await p.screenshot({ path: `${out}/${name}.png`, timeout: 240000 }); };
// place the camera relative to the player bike: f = forward, r = right, u = up (metres)
const cam = (f, r, u, lf, lr, lu, fov = 50) => p.evaluate(({ f, r, u, lf, lr, lu, fov }) => {
  const g = window.__game, P = g.race.player, root = P.model.root, c = g.engine.camera;
  const h = root.rotation.y, o = root.position;
  const F = [Math.sin(h), 0, Math.cos(h)], R = [-Math.cos(h), 0, Math.sin(h)];
  c.position.set(o.x + F[0] * f + R[0] * r, o.y + u, o.z + F[2] * f + R[2] * r);
  c.fov = fov; c.updateProjectionMatrix();
  c.lookAt(o.x + F[0] * lf + R[0] * lr, o.y + lu, o.z + F[2] * lf + R[2] * lr);
  c.updateMatrixWorld();
}, { f, r, u, lf, lr, lu, fov });
await sim(0.2, { confirm: true });
await sim(6, { throttle: 0.5 });
await sim(4, { throttle: 1 });
await shot('chase1');
await sim(12, { auto: true });
await shot('chase2');
await p.addStyleTag({ content: 'html{visibility:hidden} #gl{visibility:visible}' });
await cam(0.5, 3.4, 1.0, 0.1, 0, 0.65, 40); await shot('side');
await cam(2.8, 1.5, 1.15, 0, 0, 0.75, 42); await shot('front');
await cam(-16, 4, 6.5, 40, 0, 2, 60); await shot('wide');
console.log('ERRORS:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
await b.close();
