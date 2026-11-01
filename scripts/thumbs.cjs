// Generates the art used by the menus (run after `npm run build`, then build again):
//   public/thumbs/m_<machine>.webp  transparent studio renders of every machine (spawn menu)
//   public/thumbs/b_<building>.jpg  photos of every building on its plot
//   public/img/logo.png             3D logo        public/img/title.jpg  title / loading background
// Needs Playwright + Chromium.  node scripts/thumbs.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
(async () => {
  fs.mkdirSync(path.join(ROOT, 'public/thumbs'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'public/img'), { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.setDefaultTimeout(900000);
  await page.goto('file://' + path.join(ROOT, 'dist/index.html') + '?q=' + (process.env.Q || 'medium') + '&thumbs=1');
  await page.waitForSelector('#titleMenu:not(.hidden)', { timeout: 240000 });
  const save = (rel, dataUrl) => { fs.writeFileSync(path.join(ROOT, 'public', rel), Buffer.from(dataUrl.split(',')[1], 'base64')); console.log('wrote', rel); };
  const only = process.argv[2] || 'all';

  if (only === 'all' || only === 'logo') {
    const font = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/russo.typeface.json'), 'utf8'));
    save('img/logo.png', await page.evaluate(([f]) => window.__game.makeLogo(f, 1500, 640), [font]));
  }
  if (only === 'all' || only === 'machines') {
    const th = await page.evaluate(() => window.__game.makeThumbs(480, 300));
    for (const [id, url] of Object.entries(th)) save(`thumbs/m_${id}.webp`, url);
  }
  await page.click('#playBtn');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { for (const id of ['hud', 'touch']) document.getElementById(id).style.display = 'none'; });
  if (only === 'all' || only === 'buildings') {
    await page.setViewportSize({ width: 960, height: 600 });
    const defs = await page.evaluate(() => window.__game.buildingDefs());
    for (const id of defs) {
      await page.evaluate((id) => {
        const g = window.__game, V = g.player.pos.constructor;
        for (const k of [...g.machines.keys()]) g.destroyMachine(k);
        g.act('spawnBuilding', { def: id, plot: 0 });
        g.player.teleport(new V(-40, 0, 30));
        const b = g.demo.buildings[g.plots[0]];
        let x0 = 1e9, x1 = -1e9, y1 = 0, z0 = 1e9, z1 = -1e9;
        for (let i = b.start; i < b.start + b.count; i++) { const p = g.demo.pieces[i]; x0 = Math.min(x0, p.pos.x); x1 = Math.max(x1, p.pos.x); z0 = Math.min(z0, p.pos.z); z1 = Math.max(z1, p.pos.z); y1 = Math.max(y1, p.pos.y); }
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = Math.max(x1 - x0, z1 - z0, y1 * 1.4) * 0.5 + 2;
        g.debugCam = [[cx + r * 1.2, y1 * 0.4 + r * 0.35, cz + r * 1.85], [cx, y1 * 0.38, cz]];
      }, id);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(ROOT, `public/thumbs/b_${id}.jpg`), type: 'jpeg', quality: 80 });
      console.log('wrote building', id);
    }
    await page.evaluate(() => window.__game.act('newWorld', {}));
    await page.waitForTimeout(1500);
  }
  if (only === 'all' || only === 'title') {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.evaluate(() => {
      const g = window.__game, V = g.player.pos.constructor;
      for (const k of [...g.machines.keys()]) g.destroyMachine(k);
      const tx = g.createMachine('tx330', 1, new V(-62, 0, -63), Math.PI + 0.25); tx.boom = -0.75; tx.stickA = 1.1; tx.swing = 0.1; tx.pose();
      const hr = g.createMachine('hr450', 2, new V(-84, 0, -62), Math.PI - 0.15); hr.boom = -1.3; hr.stickA = 0.6; hr.pose();
      g.createMachine('wl950', 3, new V(-44, 0, -58), -2.3);
      g.createMachine('bg90', 4, new V(-52, 0, -48), Math.PI + 0.6);
      g.player.teleport(new V(-47, 0.2, -47));
      g.debugCam = [[-36, 4.2, -40], [-70, 6.5, -80]];
    });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(ROOT, 'public/img/title.jpg'), type: 'jpeg', quality: 82 });
    console.log('wrote img/title.jpg');
  }
  await browser.close();
})();
