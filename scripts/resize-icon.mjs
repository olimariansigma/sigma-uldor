// Resizes the launcher icon using headless Chromium (no native image libraries required).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
const [src, size, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
const data = await p.evaluate(async ({ url, size }) => {
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, size, size);
  return c.toDataURL('image/png');
}, { url: 'data:image/png;base64,' + fs.readFileSync(src).toString('base64'), size: +size });
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
await b.close();
