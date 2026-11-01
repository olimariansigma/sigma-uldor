// Bundles the game into dist/ as a single classic script so it runs from file://
// (Electron and the Android WebView both load it straight from local files).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'public'))) {
  fs.cpSync(path.join(root, 'public', f), path.join(dist, f), { recursive: true });
}
// fonts must be inlined: browsers refuse font files fetched from file:// pages (Electron / Android WebView)
{
  const css = path.join(dist, 'style.css');
  let text = fs.readFileSync(css, 'utf8');
  text = text.replace(/url\((fonts\/[^)]+\.woff2)\)/g, (m, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(root, 'public', f)).toString('base64')})`);
  fs.writeFileSync(css, text);
}
// HD textures: browsers won't hand local image files to WebGL, but local scripts load fine everywhere (Electron,
// Android WebView, file://). So each texture ships as a tiny script holding it as a data URL (src/texpack.js).
{
  const texDir = path.join(dist, 'tex');
  if (fs.existsSync(texDir)) {
    for (const f of fs.readdirSync(texDir)) {
      if (!f.endsWith('.jpg')) continue;
      const b64 = fs.readFileSync(path.join(texDir, f)).toString('base64');
      const key = f.replace(/\.jpg$/, '');
      fs.writeFileSync(path.join(texDir, key + '.js'), `(window.__TEX=window.__TEX||{})[${JSON.stringify(key)}]="data:image/jpeg;base64,${b64}";`);
      fs.rmSync(path.join(texDir, f));
    }
  }
}
// Recorded sound effects (public/sfx, made by tools/make_sfx.py): one script holding every clip as base64 plus the
// one-shot bank offsets, for the same reason as the textures (fetching local files is blocked on file://).
{
  const sfxDir = path.join(dist, 'sfx');
  if (fs.existsSync(sfxDir)) {
    const out = { clips: {}, banks: {} };
    for (const f of fs.readdirSync(sfxDir)) {
      if (f.endsWith('.ogg')) out.clips[f.replace(/\.ogg$/, '')] = fs.readFileSync(path.join(sfxDir, f)).toString('base64');
      if (f === 'banks.json') out.banks = JSON.parse(fs.readFileSync(path.join(sfxDir, f), 'utf8'));
      fs.rmSync(path.join(sfxDir, f));
    }
    fs.writeFileSync(path.join(sfxDir, 'sfx.js'), `window.__SFX=${JSON.stringify(out)};`);
  }
}
await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['chrome90'],
  outfile: path.join(dist, 'game.js'),
  logLevel: 'info',
});
console.log('Built to', dist);

if (process.argv.includes('--serve')) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  http.createServer((req, res) => {
    const p = path.join(dist, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(8080, () => console.log('Serving on http://localhost:8080'));
}
