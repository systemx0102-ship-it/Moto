import * as esbuild from 'esbuild';
import fs from 'node:fs';
fs.mkdirSync('dist', { recursive: true });
for (const n of ['viewer', 'trackview', 'vegview']) {
  await esbuild.build({ entryPoints: [`src/dev/${n}.js`], bundle: true, format: 'iife', outfile: `dist/${n}.js`, logLevel: 'warning', define: { __DEV__: 'true' } });
  fs.copyFileSync(`static/${n}.html`, `dist/${n}.html`);
}
