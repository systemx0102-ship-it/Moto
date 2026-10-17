// Validates track layouts: closure, length, clearance, min radius. Writes JSON for plotting.
import { TRACKS } from '../src/track/catalog.js';
import { buildCenterline, selfClearance } from '../src/track/trackgen.js';
import fs from 'node:fs';
const out = {};
for (const t of TRACKS) {
  try {
    const c = buildCenterline(t, 2);
    const clr = selfClearance(c, 150);
    let minR = Infinity;
    for (let i = 0; i < c.N; i++) { const k = Math.abs(c.kappaSmooth[i]); if (k > 1e-6) minR = Math.min(minR, 1 / k); }
    let maxGrade = 0; for (let i = 0; i < c.N; i++) maxGrade = Math.max(maxGrade, Math.abs(c.grade[i]));
    const need = t.width + 2 * t.runoff + 8;
    console.log(`${t.id.padEnd(7)} L=${c.L.toFixed(0)}m clearance=${clr.dist.toFixed(0)}m (need>${need}) minR=${minR.toFixed(0)} maxGrade=${(maxGrade * 100).toFixed(1)}% radii=${c.fil.map((f) => f.R.toFixed(0)).join(',')}`);
    out[t.id] = { x: Array.from(c.x), z: Array.from(c.z), w: t.width + 2 * t.runoff, ci: clr.i, cj: clr.j };
  } catch (e) { console.log(t.id, 'ERROR', e.message); }
}
fs.writeFileSync(process.argv[2] || '/tmp/tracks.json', JSON.stringify(out));
