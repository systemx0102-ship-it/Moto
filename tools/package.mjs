// Packages the production build into a ready-to-play zip with launchers.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = 'MotoMitico';
const stage = path.join(root, 'release', name);
fs.rmSync(path.join(root, 'release'), { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const f of ['index.html', 'game.js', 'style.css']) fs.copyFileSync(path.join(root, 'dist', f), path.join(stage, f));
const crlf = (s) => s.replace(/\n/g, '\r\n');
fs.writeFileSync(path.join(stage, 'JUGAR (Windows).bat'), crlf(`@echo off\r
title MOTO MITICO\r
cd /d "%~dp0"\r
rem Abre el juego en el navegador predeterminado (Chrome, Edge o Firefox)\r
start "" "%~dp0index.html"\r
`));
fs.writeFileSync(path.join(stage, 'JUGAR (Mac).command'), `#!/bin/bash\ncd "$(dirname "$0")"\nopen "index.html"\n`, { mode: 0o755 });
fs.writeFileSync(path.join(stage, 'jugar-linux.sh'), `#!/bin/bash\ncd "$(dirname "$0")"\nxdg-open "index.html" >/dev/null 2>&1 || sensible-browser "index.html"\n`, { mode: 0o755 });
fs.copyFileSync(path.join(root, 'static', 'LEEME.txt'), path.join(stage, 'LEEME.txt'));
const zip = path.join(root, 'release', `${name}.zip`);
execSync(`cd "${path.join(root, 'release')}" && zip -r -9 -q "${zip}" "${name}"`);
console.log('zip:', zip, (fs.statSync(zip).size / 1024 / 1024).toFixed(2), 'MB');
