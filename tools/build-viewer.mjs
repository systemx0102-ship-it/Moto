import * as esbuild from 'esbuild';
import fs from 'node:fs';
await esbuild.build({ entryPoints: ['src/dev/viewer.js'], bundle: true, format: 'iife', outfile: 'dist/viewer.js', logLevel: 'warning', define: { __DEV__: 'true' } });
fs.mkdirSync('dist', { recursive: true });
fs.copyFileSync('static/viewer.html', 'dist/viewer.html');
