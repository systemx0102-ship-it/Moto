// Dev QA: screenshot dist pages headlessly. usage: node tools/shoot.mjs out.png "viewer.html?bike=raptor" [w h]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
const [out, page = 'viewer.html', w = '1000', h = '700'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await p.goto('file://' + path.resolve('dist', page));
await p.waitForFunction(() => window.__ready, null, { timeout: 120000 }).catch(() => errors.push('timeout'));
await p.screenshot({ path: out });
console.log(await p.title());
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await b.close();
