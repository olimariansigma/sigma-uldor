// Builds the website for static hosting (Vercel free tier, or any static host): the landing page from site/ at the
// root and the browser game at /play/. The web build uses the 1024 px texture pack in site/tex (about 7 MB instead
// of the 2048 px desktop pack's 100 MB) so visits stay quick and well inside free bandwidth. No server, no keys.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'site-dist');
execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'dist'), path.join(out, 'play'), { recursive: true });
// web texture pack: same data-URL scripts as the desktop build (src/texpack.js), from the smaller JPEGs
const tex = path.join(out, 'play', 'tex');
fs.rmSync(tex, { recursive: true, force: true }); fs.mkdirSync(tex);
for (const f of fs.readdirSync(path.join(root, 'site', 'tex'))) {
  if (!f.endsWith('.jpg')) continue;
  const key = f.replace(/\.jpg$/, ''), b64 = fs.readFileSync(path.join(root, 'site', 'tex', f)).toString('base64');
  fs.writeFileSync(path.join(tex, key + '.js'), `(window.__TEX=window.__TEX||{})[${JSON.stringify(key)}]="data:image/jpeg;base64,${b64}";`);
}
// landing page and its images
for (const f of fs.readdirSync(path.join(root, 'site'))) if (f !== 'tex') fs.cpSync(path.join(root, 'site', f), path.join(out, f), { recursive: true });
let bytes = 0; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else bytes += s.size; } };
walk(out);
console.log(`Website built to ${out} (${(bytes / 1e6).toFixed(1)} MB): landing page at /, game at /play/`);
