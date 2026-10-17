// Build: bundles the game into a classic (non-module) script so the
// resulting folder runs by double-clicking index.html (file:// friendly).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

fs.mkdirSync(dist, { recursive: true });

function fontFace(family, file, weight) {
  const data = fs.readFileSync(path.join(root, 'node_modules', file)).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;` +
    `src:url(data:font/woff2;base64,${data}) format('woff2');}`;
}

function buildCss() {
  const fonts = [
    fontFace('Orbitron', '@fontsource/orbitron/files/orbitron-latin-500-normal.woff2', 500),
    fontFace('Orbitron', '@fontsource/orbitron/files/orbitron-latin-700-normal.woff2', 700),
    fontFace('Orbitron', '@fontsource/orbitron/files/orbitron-latin-900-normal.woff2', 900),
    fontFace('Rajdhani', '@fontsource/rajdhani/files/rajdhani-latin-400-normal.woff2', 400),
    fontFace('Rajdhani', '@fontsource/rajdhani/files/rajdhani-latin-500-normal.woff2', 500),
    fontFace('Rajdhani', '@fontsource/rajdhani/files/rajdhani-latin-600-normal.woff2', 600),
    fontFace('Rajdhani', '@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2', 700),
    fontFace('Rajdhani', '@fontsource/rajdhani/files/rajdhani-latin-ext-600-normal.woff2', 600),
  ].join('\n');
  const css = fs.readFileSync(path.join(root, 'src/ui/ui.css'), 'utf8');
  fs.writeFileSync(path.join(dist, 'style.css'), fonts + '\n' + css);
}

function copyStatic() {
  fs.copyFileSync(path.join(root, 'static/index.html'), path.join(dist, 'index.html'));
}

const options = {
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(dist, 'game.js'),
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'eof',
  logLevel: 'info',
  define: { __DEV__: dev ? 'true' : 'false' },
};

buildCss();
copyStatic();

if (watch) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{
      name: 'static',
      setup(b) { b.onEnd(() => { try { buildCss(); copyStatic(); } catch (e) { console.error(e); } }); },
    }],
  });
  await ctx.watch();
  console.log('watching…');
} else {
  await esbuild.build(options);
  const size = fs.statSync(options.outfile).size;
  console.log(`game.js ${(size / 1024).toFixed(0)} KB`);
}
