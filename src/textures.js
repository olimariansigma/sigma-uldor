// Procedural texture generation (canvas based) so the game ships with no image assets.
import * as THREE from 'three';

let maxAniso = 4;
export function setAnisotropy(a) { maxAniso = a; }

// ---------- helpers ----------
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Deterministic PRNG so textures look the same every launch.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise grid
function makeNoise(size, seed) {
  const r = rng(seed);
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % size) + size) % size, y0 = ((yi % size) + size) % size;
    const x1 = (x0 + 1) % size, y1 = (y0 + 1) % size;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = g[y0 * size + x0], b = g[y0 * size + x1], c = g[y1 * size + x0], d = g[y1 * size + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// Fractal noise that tiles over a canvas of size w x h with `cells` base frequency.
function fbm(w, h, cells, octaves, seed) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const f = cells * (1 << o);
    const n = makeNoise(f, seed + o * 31);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      out[y * w + x] += n((x / w) * f, (y / h) * f) * amp;
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function heightToNormal(height, w, h, strength = 2, wrap = true) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const H = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y)); }
    return height[y * w + x];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function grayToCanvas(arr, w, h, map = (v) => v) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, map(arr[i]) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const cache = {};
// HD texture pack (texpack.js) overrides the procedural surfaces when it loaded
let HD = null;
export function setPack(p) { HD = p; }
function cached(key, fn) { return cache[key] || (cache[key] = fn()); }

// ---------- Brick masonry atlas ----------
// One tile = one masonry block face (0.66 m x 0.30 m) = 3 bricks x 3 courses in running bond.
// 4 variants are stacked vertically so each block instance can pick its own look.
export function brickTextures(palette = 'red') {
  return cached('brick-' + palette, () => {
    const W = 512, TH = 232, VARIANTS = 4, H = TH * VARIANTS;
    const color = canvas(W, H), cctx = color.getContext('2d');
    const height = new Float32Array(W * H);
    const rough = new Float32Array(W * H);
    const r = rng(palette === 'red' ? 7 : 13);
    const grain = fbm(W, H, 16, 4, 99);
    const fine = fbm(W, H, 64, 2, 5);
    const pal = palette === 'red'
      ? [[150, 62, 42], [168, 76, 50], [132, 52, 36], [176, 92, 62], [120, 48, 36], [158, 70, 46], [140, 80, 60]]
      : palette === 'yellow'
        ? [[196, 160, 104], [210, 176, 120], [184, 146, 96], [204, 168, 110], [170, 136, 90]]
        : [[120, 118, 112], [132, 128, 122], [110, 108, 104], [140, 136, 128]]; // grey block
    const mortar = palette === 'grey' ? [150, 148, 142] : [176, 170, 158];
    const img = cctx.createImageData(W, H);
    const mortarPx = palette === 'grey' ? 6 : 7;
    const brickW = W / 3, courseH = TH / 3;
    // per-brick colours
    const bc = [];
    for (let v = 0; v < VARIANTS; v++) for (let row = 0; row < 3; row++) for (let k = -1; k < 4; k++) {
      const p = pal[Math.floor(r() * pal.length)];
      const j = (r() - 0.5) * 22;
      const soot = r() < 0.15 ? 0.78 : 1;
      bc.push([(p[0] + j) * soot, (p[1] + j * 0.8) * soot, (p[2] + j * 0.6) * soot, r()]);
    }
    for (let y = 0; y < H; y++) {
      const v = Math.floor(y / TH), ly = y - v * TH;
      const row = Math.min(2, Math.floor(ly / courseH));
      const offset = row === 1 ? brickW / 2 : 0;
      const yIn = ly - row * courseH;
      for (let x = 0; x < W; x++) {
        const xs = x + offset;
        const k = Math.floor(xs / brickW);
        const xIn = xs - k * brickW;
        const i = y * W + x;
        // distance to mortar joint
        const dx = Math.min(xIn, brickW - xIn), dy = Math.min(yIn, courseH - yIn);
        const d = Math.min(dx, dy);
        const g = grain[i], f = fine[i];
        let R, G, B, h, ro;
        if (d < mortarPx / 2 + (g - 0.5) * 2.5) {
          const m = 0.85 + f * 0.3;
          R = mortar[0] * m; G = mortar[1] * m; B = mortar[2] * m;
          h = 0.15 + f * 0.1; ro = 0.95;
        } else {
          const c = bc[(v * 3 + row) * 5 + (k + 1)];
          const edge = Math.min(1, (d - mortarPx / 2) / 5);
          const shade = 0.82 + g * 0.3 + (f - 0.5) * 0.12;
          const speck = f > 0.78 ? 0.75 : 1;
          R = c[0] * shade * speck; G = c[1] * shade * speck; B = c[2] * shade * speck;
          // chipped corners and edge darkening
          R *= 0.9 + 0.1 * edge; G *= 0.9 + 0.1 * edge; B *= 0.9 + 0.1 * edge;
          h = 0.55 + 0.35 * edge + (g - 0.5) * 0.25 + (f - 0.5) * 0.1;
          ro = 0.78 + (f - 0.5) * 0.2;
        }
        img.data[i * 4] = Math.max(0, Math.min(255, R));
        img.data[i * 4 + 1] = Math.max(0, Math.min(255, G));
        img.data[i * 4 + 2] = Math.max(0, Math.min(255, B));
        img.data[i * 4 + 3] = 255;
        height[i] = h; rough[i] = ro;
      }
    }
    cctx.putImageData(img, 0, 0);
    const map = toTex(color);
    const normalMap = toTex(heightToNormal(height, W, H, 3.2), { srgb: false });
    const roughnessMap = toTex(grayToCanvas(rough, W, H), { srgb: false });
    return { map, normalMap, roughnessMap, variants: VARIANTS };
  });
}

// ---------- Concrete ----------
export function concreteTextures(tint = [168, 166, 160], seed = 3) {
  if (HD && HD.concrete) return HD.concrete;
  return cached('concrete' + tint.join() + seed, () => {
    const S = 512;
    const n = fbm(S, S, 8, 5, seed), f = fbm(S, S, 96, 2, seed + 7);
    const c = canvas(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
    const h = new Float32Array(S * S);
    const r = rng(seed);
    for (let i = 0; i < S * S; i++) {
      let m = 0.78 + n[i] * 0.3 + (f[i] - 0.5) * 0.12;
      if (f[i] > 0.83) m *= 0.8; // pores
      img.data[i * 4] = tint[0] * m; img.data[i * 4 + 1] = tint[1] * m; img.data[i * 4 + 2] = tint[2] * m; img.data[i * 4 + 3] = 255;
      h[i] = n[i] * 0.4 + (f[i] > 0.83 ? 0 : 0.4) + f[i] * 0.2;
    }
    ctx.putImageData(img, 0, 0);
    // a few stains
    for (let k = 0; k < 6; k++) {
      const x = r() * S, y = r() * S, rad = 30 + r() * 90;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(60,55,45,0.10)'); g.addColorStop(1, 'rgba(60,55,45,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    }
    return { map: toTex(c), normalMap: toTex(heightToNormal(h, S, S, 1.6), { srgb: false }) };
  });
}

// ---------- Asphalt shingles (1 m x 1 m tile, 4 courses) ----------
export function shingleTextures() {
  if (HD && HD.shingles) return HD.shingles;
  return cached('shingle', () => {
    const S = 512, rows = 4, tabs = 3;
    const n = fbm(S, S, 64, 2, 41);
    const c = canvas(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
    const h = new Float32Array(S * S);
    const r = rng(77);
    const tone = [];
    for (let i = 0; i < rows * (tabs + 1); i++) tone.push(0.75 + r() * 0.4);
    const rowH = S / rows, tabW = S / tabs;
    for (let y = 0; y < S; y++) {
      const row = Math.floor(y / rowH), yIn = y - row * rowH;
      const off = (row % 2) * tabW / 2;
      for (let x = 0; x < S; x++) {
        const xs = (x + off) % S;
        const k = Math.floor(xs / tabW), xIn = xs - k * tabW;
        const i = y * S + x;
        const t = tone[row * (tabs + 1) + k];
        const gap = xIn < 3 || xIn > tabW - 3;
        const shadow = yIn / rowH; // lower edge of each course casts onto next one
        let m = t * (0.75 + n[i] * 0.5) * (0.65 + 0.35 * shadow);
        if (gap) m *= 0.35;
        const base = [58, 60, 64];
        img.data[i * 4] = base[0] * m; img.data[i * 4 + 1] = base[1] * m; img.data[i * 4 + 2] = base[2] * m; img.data[i * 4 + 3] = 255;
        h[i] = shadow * 0.8 + n[i] * 0.2 - (gap ? 0.4 : 0);
      }
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTex(c), normalMap: toTex(heightToNormal(h, S, S, 4), { srgb: false }) };
  });
}

// ---------- Wood planks ----------
export function woodTextures(kind = 'pine') {
  if (HD && kind === 'pine' && HD.pine) return HD.pine;
  if (HD && kind === 'floor' && HD.floor) return HD.floor;
  return cached('wood' + kind, () => {
    const S = 512, planks = kind === 'floor' ? 6 : 4;
    const grainN = fbm(S, S, 4, 4, kind.length * 11);
    const fine = fbm(S, S, 128, 1, 3);
    const c = canvas(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
    const h = new Float32Array(S * S);
    const r = rng(kind.length * 17);
    const base = kind === 'dark' ? [92, 60, 38] : kind === 'floor' ? [160, 112, 70] : kind === 'paint' ? [236, 234, 228] : [196, 158, 108];
    const tones = []; for (let i = 0; i < planks * 3; i++) tones.push(0.82 + r() * 0.3);
    const pw = S / planks;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const p = Math.floor(x / pw), xIn = x - p * pw;
      const seg = Math.floor(((y / S) + p * 0.37) * 2) % 3;
      const i = y * S + x;
      const ring = Math.sin((xIn * 0.09 + grainN[i] * 18) * (kind === 'paint' ? 0.2 : 1)) * 0.5 + 0.5;
      let m = tones[p * 3 + seg] * (0.85 + ring * (kind === 'paint' ? 0.04 : 0.18) + (fine[i] - 0.5) * 0.08);
      const joint = xIn < 2 || xIn > pw - 2;
      if (joint) m *= 0.45;
      img.data[i * 4] = base[0] * m; img.data[i * 4 + 1] = base[1] * m; img.data[i * 4 + 2] = base[2] * m; img.data[i * 4 + 3] = 255;
      h[i] = joint ? 0 : 0.6 + ring * 0.08;
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTex(c), normalMap: toTex(heightToNormal(h, S, S, 2.5), { srgb: false }) };
  });
}

// ---------- Ground ----------
export function grassTextures() {
  if (HD && HD.grass) return HD.grass;
  return cached('grass', () => {
    const S = 1024;
    const n = fbm(S, S, 6, 5, 11), f = fbm(S, S, 128, 2, 12);
    const c = canvas(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const m = 0.7 + n[i] * 0.45 + (f[i] - 0.5) * 0.35;
      const dry = Math.max(0, n[i] - 0.55) * 1.6;
      img.data[i * 4] = (62 + dry * 70) * m; img.data[i * 4 + 1] = (104 + dry * 30) * m; img.data[i * 4 + 2] = (42 + dry * 10) * m; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // blades
    const r = rng(5);
    for (let k = 0; k < 26000; k++) {
      const x = r() * S, y = r() * S, l = 3 + r() * 6;
      const g = 90 + r() * 80;
      ctx.strokeStyle = `rgba(${g * 0.55},${g},${g * 0.35},0.55)`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 3, y - l); ctx.stroke();
    }
    const h = fbm(S, S, 64, 2, 13);
    return { map: toTex(c), normalMap: toTex(heightToNormal(h, S, S, 2), { srgb: false }) };
  });
}

export function dirtTextures() {
  if (HD && HD.yard) return HD.yard;
  return cached('dirt', () => {
    const S = 1024;
    const n = fbm(S, S, 5, 5, 21), f = fbm(S, S, 160, 2, 22), m2 = fbm(S, S, 24, 3, 23);
    const c = canvas(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const wet = Math.max(0, m2[i] - 0.55) * 1.4;
      let m = 0.72 + n[i] * 0.4 + (f[i] - 0.5) * 0.4;
      const stone = f[i] > 0.74;
      if (stone) m *= 1.25;
      const R = (128 - wet * 40) * m, G = (114 - wet * 36) * m, B = (96 - wet * 30) * m;
      img.data[i * 4] = R; img.data[i * 4 + 1] = G; img.data[i * 4 + 2] = B; img.data[i * 4 + 3] = 255;
      h[i] = n[i] * 0.3 + (stone ? 0.6 : f[i] * 0.4);
    }
    ctx.putImageData(img, 0, 0);
    // tyre tracks
    ctx.globalAlpha = 0.07; ctx.strokeStyle = '#2a2018';
    const r = rng(9);
    for (let k = 0; k < 8; k++) {
      ctx.lineWidth = 18 + r() * 14; ctx.beginPath();
      const y0 = r() * S; ctx.moveTo(0, y0); ctx.bezierCurveTo(S * 0.3, y0 + (r() - 0.5) * 300, S * 0.6, y0 + (r() - 0.5) * 300, S, y0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return { map: toTex(c), normalMap: toTex(heightToNormal(h, S, S, 3), { srgb: false }) };
  });
}

export function asphaltTextures() {
  if (HD && HD.asphalt) return HD.asphalt;
  return cached('asphalt', () => {
    const S = 512;
    const n = fbm(S, S, 6, 4, 31), f = fbm(S, S, 200, 1, 32);
    const c = canvas(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      let m = 0.8 + n[i] * 0.3;
      const agg = f[i] > 0.7;
      if (agg) m *= 1.35 + (f[i] - 0.7);
      img.data[i * 4] = 58 * m; img.data[i * 4 + 1] = 59 * m; img.data[i * 4 + 2] = 62 * m; img.data[i * 4 + 3] = 255;
      h[i] = agg ? 0.8 : 0.3 * n[i];
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTex(c), normalMap: toTex(heightToNormal(h, S, S, 2.5), { srgb: false }) };
  });
}

export function gravelTextures() {
  if (HD && HD.dust) return HD.dust;
  return cached('gravel', () => {
    const S = 512;
    const c = canvas(S, S), ctx = c.getContext('2d');
    const h = new Float32Array(S * S);
    ctx.fillStyle = '#6d675f'; ctx.fillRect(0, 0, S, S);
    const r = rng(55);
    const hc = canvas(S, S), hctx = hc.getContext('2d', { willReadFrequently: true });
    hctx.fillStyle = '#000'; hctx.fillRect(0, 0, S, S);
    for (let k = 0; k < 5200; k++) {
      const x = r() * S, y = r() * S, rad = 2 + r() * 6;
      const g = 90 + r() * 90, warm = r() * 25;
      for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
        ctx.fillStyle = `rgb(${g + warm},${g + warm * 0.6},${g})`;
        ctx.beginPath(); ctx.ellipse(x + ox, y + oy, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2); ctx.fill();
        const hg = hctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        hg.addColorStop(0, '#fff'); hg.addColorStop(1, '#000');
        hctx.fillStyle = hg; hctx.beginPath(); hctx.arc(x + ox, y + oy, rad, 0, Math.PI * 2); hctx.fill();
      }
    }
    const hd = hctx.getImageData(0, 0, S, S).data;
    for (let i = 0; i < S * S; i++) h[i] = hd[i * 4] / 255;
    return { map: toTex(c), normalMap: toTex(heightToNormal(h, S, S, 3), { srgb: false }) };
  });
}

// ---------- Misc ----------
export function chainLinkTexture() {
  return cached('chain', () => {
    const S = 128;
    const c = canvas(S, S), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = '#c9cdd0'; ctx.lineWidth = 3.2;
    const d = S / 2;
    for (let i = -2; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * d, 0); ctx.lineTo(i * d + S, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * d + S, 0); ctx.lineTo(i * d, S); ctx.stroke();
    }
    const t = toTex(c);
    return t;
  });
}

export function corrugatedTextures(rgb = [190, 196, 200]) {
  if (HD && HD.metal) return HD.metal;
  return cached('corr' + rgb.join(), () => {
    const W = 256, H = 256;
    const n = fbm(W, H, 8, 3, 61);
    const c = canvas(W, H), ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
    const h = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wave = Math.sin((x / W) * Math.PI * 2 * 8);
      const m = 0.82 + wave * 0.08 + n[i] * 0.18;
      img.data[i * 4] = rgb[0] * m; img.data[i * 4 + 1] = rgb[1] * m; img.data[i * 4 + 2] = rgb[2] * m; img.data[i * 4 + 3] = 255;
      h[i] = wave * 0.5 + 0.5;
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTex(c), normalMap: toTex(heightToNormal(h, W, H, 6), { srgb: false }) };
  });
}

export function treadPlateTextures() {
  return cached('tread', () => {
    const S = 256;
    const c = canvas(S, S), ctx = c.getContext('2d');
    const hc = canvas(S, S), hctx = hc.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#8a8d90'; ctx.fillRect(0, 0, S, S);
    hctx.fillStyle = '#000'; hctx.fillRect(0, 0, S, S);
    const step = 32;
    for (let y = 0; y < S + step; y += step) for (let x = 0; x < S + step; x += step) {
      for (const [ox, oy, a] of [[0, 0, 0.7], [step / 2, step / 2, -0.7]]) {
        for (const [cx, cy, col] of [[x + ox, y + oy, null]]) {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.fillStyle = '#a7aaad'; ctx.fillRect(-11, -2.5, 22, 5); ctx.restore();
          hctx.save(); hctx.translate(cx, cy); hctx.rotate(a); hctx.fillStyle = '#fff'; hctx.fillRect(-11, -2.5, 22, 5); hctx.restore();
        }
      }
    }
    const hd = hctx.getImageData(0, 0, S, S).data;
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = hd[i * 4] / 255;
    return { map: toTex(c), normalMap: toTex(heightToNormal(h, S, S, 2), { srgb: false }) };
  });
}

export function hazardTexture() {
  return cached('hazard', () => {
    const c = canvas(128, 128), ctx = c.getContext('2d');
    ctx.fillStyle = '#f2b705'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#16171a';
    for (let i = -2; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64 + 32, 0); ctx.lineTo(i * 64 + 32 + 128, 128); ctx.lineTo(i * 64 + 128, 128); ctx.fill();
    }
    return toTex(c);
  });
}

export function beltTexture() {
  return cached('belt', () => {
    const c = canvas(128, 256), ctx = c.getContext('2d');
    ctx.fillStyle = '#1c1c1d'; ctx.fillRect(0, 0, 128, 256);
    const r = rng(4);
    for (let k = 0; k < 900; k++) { ctx.fillStyle = `rgba(90,85,80,${r() * 0.25})`; ctx.fillRect(r() * 128, r() * 256, 2, 2); }
    ctx.strokeStyle = '#2b2b2c'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    for (let y = 0; y < 256 + 64; y += 64) {
      ctx.beginPath(); ctx.moveTo(16, y + 24); ctx.lineTo(64, y); ctx.lineTo(112, y + 24); ctx.stroke();
    }
    return toTex(c);
  });
}

export function softSprite() {
  return cached('soft', () => {
    const c = canvas(128, 128), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    // break up the circle so dust looks billowy
    const r = rng(2);
    ctx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 30; k++) {
      const x = r() * 128, y = r() * 128, rad = 6 + r() * 16;
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g2.addColorStop(0, 'rgba(0,0,0,0.35)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, 128, 128);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}

// Text decal on a transparent (or solid) background.
export function labelTexture(text, { w = 512, h = 128, bg = null, color = '#15171a', font = '900 86px Arial', stroke = null, italic = true, align = 'center', sub = null } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.font = (italic ? 'italic ' : '') + font;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  const x = align === 'center' ? w / 2 : align === 'left' ? 16 : w - 16;
  const y = sub ? h * 0.4 : h / 2;
  if (stroke) { ctx.lineWidth = 8; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); }
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  if (sub) { ctx.font = 'bold ' + Math.round(h * 0.2) + 'px Arial'; ctx.fillText(sub, x, h * 0.8); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  return t;
}

export function grilleTexture() {
  return cached('grille', () => {
    const c = canvas(128, 128), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#111';
    for (let y = 0; y < 128; y += 16) ctx.fillRect(0, y + 4, 128, 9);
    return toTex(c);
  });
}

export function perforatedTexture() {
  return cached('perf', () => {
    const c = canvas(64, 64), ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 64, 64);
    ctx.globalCompositeOperation = 'destination-out';
    for (let y = 8; y < 64; y += 16) for (let x = 8; x < 64; x += 16) { ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill(); }
    return toTex(c);
  });
}

export function skyCloudTexture() {
  return cached('clouds', () => {
    const W = 1024, H = 256;
    const n = fbm(W, H, 6, 6, 81);
    const c = canvas(W, H), ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const fade = Math.sin((y / H) * Math.PI);
      const a = Math.max(0, n[i] - 0.48) * 3.2 * fade;
      img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = Math.min(1, a) * 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

// ---------- v2 additions ----------
// Light cast-concrete (cinder block). Kept bright so per-block paint colours read true.
export function cinderTextures() {
  if (HD && HD.cinder) return HD.cinder;
  return cached('cinder', () => {
    const S = 512;
    const n = fbm(S, S, 6, 4, 141), f = fbm(S, S, 160, 2, 142), g = fbm(S, S, 40, 2, 143);
    const c = canvas(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
    const h = new Float32Array(S * S), ro = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const pore = f[i] > 0.74 ? (f[i] - 0.74) * 4 : 0;
      let m = 0.86 + (n[i] - 0.5) * 0.16 + (g[i] - 0.5) * 0.1 - pore * 0.55;
      const v = 232 * m;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.99; img.data[i * 4 + 2] = v * 0.96; img.data[i * 4 + 3] = 255;
      h[i] = 0.6 + (g[i] - 0.5) * 0.3 - pore * 0.8;
      ro[i] = 0.82 + pore * 0.15;
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTex(c), normalMap: toTex(heightToNormal(h, S, S, 2.4), { srgb: false }), roughnessMap: toTex(grayToCanvas(ro, S, S), { srgb: false }) };
  });
}

export function faceTexture() {
  return cached('face', () => {
    const c = canvas(256, 256), x = c.getContext('2d');
    x.clearRect(0, 0, 256, 256);
    x.fillStyle = '#111';
    x.beginPath(); x.ellipse(92, 104, 13, 20, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(164, 104, 13, 20, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(96, 97, 5, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(168, 97, 5, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#111'; x.lineWidth = 9; x.lineCap = 'round';
    x.beginPath(); x.arc(128, 132, 46, 0.18 * Math.PI, 0.82 * Math.PI); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
  });
}

// Torso texture laid out as a strip: [front | right | back | left] -> used with custom UVs
export function shirtTexture(shirt = '#2f6db5', jacket = '#141416') {
  return cached('shirt' + shirt + jacket, () => {
    const W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true }); // CPU canvas: reading pixels back from a GPU canvas stalls
    const r = rng(shirt.length * 7);
    // front
    x.fillStyle = shirt; x.fillRect(0, 0, 256, 256);
    // dark graphic print on the shirt
    x.fillStyle = 'rgba(10,20,40,0.85)';
    x.save(); x.translate(128, 140);
    for (let k = 0; k < 9; k++) { x.rotate(0.7); x.beginPath(); x.ellipse(18 + r() * 14, 0, 26 + r() * 10, 6 + r() * 5, r() * 2, 0, Math.PI * 2); x.fill(); }
    x.restore();
    // open jacket over the shirt
    x.fillStyle = jacket;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(92, 0); x.lineTo(70, 90); x.lineTo(76, 256); x.lineTo(0, 256); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(256, 0); x.lineTo(164, 0); x.lineTo(186, 90); x.lineTo(180, 256); x.lineTo(256, 256); x.closePath(); x.fill();
    // collar fold + zip line + pockets
    x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(92, 0); x.lineTo(70, 90); x.lineTo(76, 256); x.stroke();
    x.beginPath(); x.moveTo(164, 0); x.lineTo(186, 90); x.lineTo(180, 256); x.stroke();
    x.beginPath(); x.moveTo(20, 170); x.lineTo(56, 170); x.stroke(); x.beginPath(); x.moveTo(200, 170); x.lineTo(236, 170); x.stroke();
    // neck
    x.fillStyle = shirt; x.beginPath(); x.moveTo(100, 0); x.quadraticCurveTo(128, 30, 156, 0); x.fill();
    // back / sides: all jacket with seams
    x.fillStyle = jacket; x.fillRect(256, 0, 256, 256);
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.beginPath(); x.moveTo(384, 0); x.lineTo(384, 256); x.stroke();
    // fabric noise
    const img = x.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) { const k = (r() - 0.5) * 14; img.data[i * 4] += k; img.data[i * 4 + 1] += k; img.data[i * 4 + 2] += k; }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
  });
}

export function pantsTexture() {
  return cached('pants', () => {
    const S = 128, c = canvas(S, S), x = c.getContext('2d');
    const n = fbm(S, S, 32, 2, 77);
    const img = x.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const m = 0.7 + n[i] * 0.6; img.data[i * 4] = 28 * m; img.data[i * 4 + 1] = 34 * m; img.data[i * 4 + 2] = 30 * m; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    return toTex(c);
  });
}

export function waterNormal() {
  return cached('waterN', () => {
    const S = 256;
    const h = fbm(S, S, 8, 4, 301);
    return toTex(heightToNormal(h, S, S, 6), { srgb: false });
  });
}

export function potholeTexture() {
  return cached('pothole', () => {
    const S = 256, c = canvas(S, S), x = c.getContext('2d');
    const n = fbm(S, S, 6, 4, 401), f = fbm(S, S, 90, 2, 402);
    const img = x.createImageData(S, S);
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      const i = yy * S + xx;
      const d = Math.hypot(xx - S / 2, yy - S / 2) / (S / 2);
      const edge = d + (n[i] - 0.5) * 0.45;
      let a = edge < 0.78 ? 1 : edge < 0.92 ? (0.92 - edge) / 0.14 : 0;
      const stone = f[i] > 0.62;
      const v = (edge < 0.7 ? 34 : 52) * (0.7 + n[i] * 0.6) * (stone ? 1.8 : 1);
      img.data[i * 4] = v * 1.02; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 0.95; img.data[i * 4 + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
    // cracks radiating outward
    const r = rng(9);
    x.strokeStyle = 'rgba(15,15,15,0.9)'; x.lineWidth = 2;
    for (let k = 0; k < 9; k++) {
      let px = S / 2, py = S / 2, a = r() * Math.PI * 2;
      x.beginPath(); x.moveTo(px + Math.cos(a) * 80, py + Math.sin(a) * 80);
      for (let s = 0; s < 6; s++) { a += (r() - 0.5) * 0.9; px += Math.cos(a) * 10; py += Math.sin(a) * 10; x.lineTo(px + Math.cos(a) * 80, py + Math.sin(a) * 80); }
      x.stroke();
    }
    const t = toTex(c, { repeat: false }); return t;
  });
}

// Smooth trowelled cement with an irregular alpha edge (tinted per patch).
// hot-mix patch material: dark binder with packed stone aggregate (light grey so the patch colour tints it)
export function asphaltMixTexture() {
  return cached('asphaltMix', () => {
    const S = 256, c = canvas(S, S), x = c.getContext('2d');
    const f = fbm(S, S, 40, 3, 611);
    const img = x.createImageData(S, S), h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) { const v = 62 + (f[i] - 0.5) * 22; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; h[i] = f[i] * 0.2; }
    // aggregate: overlapping chips of different sizes and shades (wrapped so the texture tiles)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 1300; k++) {
      const cx = rnd() * S, cy = rnd() * S, r = 1.5 + Math.pow(rnd(), 2) * 6, sh = 0.7 + rnd() * 0.6, ang = rnd() * 3, el = 0.55 + rnd() * 0.45;
      for (let yy = -8; yy <= 8; yy++) for (let xx = -8; xx <= 8; xx++) {
        const u = (xx * Math.cos(ang) + yy * Math.sin(ang)) / r, w = (-xx * Math.sin(ang) + yy * Math.cos(ang)) / (r * el);
        const d = u * u + w * w; if (d > 1) continue;
        const px = ((Math.floor(cx) + xx) % S + S) % S, py = ((Math.floor(cy) + yy) % S + S) % S, i = py * S + px;
        const v = Math.min(255, (105 + rnd() * 55) * sh * (1 - d * 0.3));
        img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.98; img.data[i * 4 + 2] = v * 0.95;
        h[i] = Math.max(h[i], 0.35 + (1 - d) * 0.5 * sh);
      }
    }
    x.putImageData(img, 0, 0);
    return { map: toTex(c, { repeat: true }), normalMap: toTex(heightToNormal(h, S, S, 2.2), { repeat: true, srgb: false }) };
  });
}

export function cementPatchTexture() {
  return cached('cementPatch', () => {
    const S = 256, c = canvas(S, S), x = c.getContext('2d');
    const n = fbm(S, S, 6, 4, 501), f = fbm(S, S, 120, 2, 502);
    const img = x.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      const i = yy * S + xx;
      const d = Math.hypot(xx - S / 2, yy - S / 2) / (S / 2);
      const edge = d + (n[i] - 0.5) * 0.4;
      const a = edge < 0.8 ? 1 : edge < 0.9 ? (0.9 - edge) / 0.1 : 0;
      const swirl = Math.sin(Math.atan2(yy - S / 2, xx - S / 2) * 3 + d * 14 + n[i] * 6) * 0.5 + 0.5;
      const v = 235 * (0.88 + swirl * 0.06 + (f[i] - 0.5) * 0.08);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = a * 255;
      h[i] = swirl * 0.3 + f[i] * 0.2;
    }
    x.putImageData(img, 0, 0);
    return { map: toTex(c, { repeat: false }), normalMap: toTex(heightToNormal(h, S, S, 1.5), { repeat: false, srgb: false }) };
  });
}
