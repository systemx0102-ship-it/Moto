// Fast physics/AI simulation without rendering. usage: node tools/simtest.mjs [track] [bike] [seconds]
import { TRACK_BY_ID } from '../src/track/catalog.js';
import { BIKE_BY_ID, BIKES } from '../src/bikes/catalog.js';
import { Track } from '../src/track/Track.js';
import { BikePhysics } from '../src/game/BikePhysics.js';
import { AIController } from '../src/game/AIController.js';
const [tid = 'gp', bid = 'raptor', secs = '200', verbose = ''] = process.argv.slice(2);
const track = new Track(TRACK_BY_ID[tid]);
track._computeCurbs();
const spec = BIKE_BY_ID[bid];
const p = new BikePhysics(spec, track, { ai: true });
const ai = new AIController(p, track, { skill: 1, seed: 3, wet: track.wet });
p.place(-10, 0, 0); p.lap = -1; p._progress(p.proj); p.prevS = p.s;
const prof = ai.profile;
let mn = 1e9, mx = 0, avg = 0;
for (const v of prof) { mn = Math.min(mn, v); mx = Math.max(mx, v); avg += v; }
console.log(`${tid} L=${track.L.toFixed(0)} profile kmh min=${(mn * 3.6).toFixed(0)} max=${(mx * 3.6).toFixed(0)} avg=${(avg / prof.length * 3.6).toFixed(0)}  vTop=${(p.vTop * 3.6).toFixed(0)} mu=${p.mu.toFixed(2)} maxLean=${(p.maxLean * 57.3).toFixed(0)}`);
const DT = 1 / 120;
let t = 0, lapStart = 0, crashes = 0, wall = 0, maxD = 0;
const env = { wet: track.wet, snow: TRACK_BY_ID[tid].weather === 'snow', assist: true };
let lastLog = 0;
let accT = 0, sumV = 0, n = 0;
while (t < +secs) {
  if (Math.round(t * 120) % 2 === 0) ai.update(DT * 2, [{ phys: p }]);
  p.step(DT, env);
  for (const e of p.events) {
    if (e.type === 'crash') { crashes++; if (verbose) console.log(`  crash ${e.kind} at s=${p.s.toFixed(0)} v=${(e.v * 3.6).toFixed(0)}`); }
    if (e.type === 'land' && e.air > 0.25) console.log(`  jump air=${e.air.toFixed(2)}s impact=${e.impact.toFixed(1)} at s=${p.s.toFixed(0)} v=${(p.v*3.6).toFixed(0)}`);
    if (e.type === 'wall') { wall++; if (verbose) console.log(`  wall impact ${e.impact.toFixed(1)} at s=${p.s.toFixed(0)}`); }
    if (e.type === 'lap' && p.lap >= 1) { console.log(`  lap ${p.lap} ${(t - lapStart).toFixed(2)}s`); lapStart = t; }
    if (e.type === 'lap' && p.lap === 0) lapStart = t;
  }
  p.events.length = 0;
  maxD = Math.max(maxD, Math.abs(p.proj.d));
  sumV += p.v; n++;
  t += DT;
  if (verbose && t - lastLog > 2) { lastLog = t; console.log(`t=${t.toFixed(0)} s=${p.s.toFixed(0)} v=${(p.v * 3.6).toFixed(0)} tgt=${(prof[p.hint] * 3.6).toFixed(0)} g=${p.gear} rpm=${p.rpm.toFixed(0)} d=${p.proj.d.toFixed(1)} lean=${(p.lean * 57.3).toFixed(0)} thr=${p.input.throttle.toFixed(2)} brk=${p.input.brake.toFixed(2)} steer=${p.input.steer.toFixed(2)}`); }
}
console.log(`avg ${(sumV / n * 3.6).toFixed(0)} km/h, crashes ${crashes}, wall hits ${wall}, max |d| ${maxD.toFixed(1)} (half width ${track.halfW})`);
