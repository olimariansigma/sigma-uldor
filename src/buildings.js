// Procedural cinder-block buildings. Each block has its own paint colour, which later becomes the
// colour of the dust it is crushed into.
import * as THREE from 'three';
import { box, merge, mulberry } from './pieces.js';

const L = 0.4, H = 0.2, T = 0.2;
const Y = new THREE.Vector3(0, 1, 0);
const qY = (a) => new THREE.Quaternion().setFromAxisAngle(Y, a);

export const PAINT = {
  cinder: 0xb7b6b0, dark: 0x85847f, white: 0xf3f2ee, yellow: 0xffd400, red: 0xe0301e, blue: 0x1f7ae0,
  green: 0x2fbf4a, orange: 0xff8000, purple: 0x9040d0, pink: 0xff5fa8, teal: 0x16b8b0, black: 0x2a2a2c, lime: 0xa8e010,
};
const RAINBOW = [PAINT.red, PAINT.orange, PAINT.yellow, PAINT.green, PAINT.teal, PAINT.blue, PAINT.purple, PAINT.pink];

class Builder {
  constructor(types, seed = 1) { this.types = types; this.specs = []; this.statics = []; this.decor = []; this.rnd = mulberry(seed); }
  add(type, x, y, z, sx, sy, sz, quat = null, color = null) {
    this.specs.push({ type, pos: new THREE.Vector3(x, y, z), size: new THREE.Vector3(sx, sy, sz), quat, color });
  }
  // a masonry piece of arbitrary length along local x
  block(len, x, y, z, quat, color) {
    const type = Math.abs(len - 0.4) < 0.01 ? 'cmu' : Math.abs(len - 0.2) < 0.01 ? 'cmuHalf' : 'cmuSolid';
    const jitter = 0.94 + this.rnd() * 0.1;
    const c = new THREE.Color(color).multiplyScalar(jitter);
    this.add(type, x, y, z, len, H, T, quat, c);
  }
}

function subtract(a, b, ex) {
  let segs = [[a, b]];
  for (const [e0, e1] of ex) {
    const next = [];
    for (const [s0, s1] of segs) {
      if (e1 <= s0 + 1e-6 || e0 >= s1 - 1e-6) { next.push([s0, s1]); continue; }
      if (e0 > s0) next.push([s0, e0]);
      if (e1 < s1) next.push([e1, s1]);
    }
    segs = next;
  }
  return segs.filter(([s0, s1]) => s1 - s0 > 0.05);
}

function cutSegment(s0, s1, origin, phase) {
  const cuts = [s0];
  let j = origin + phase + Math.ceil((s0 - origin - phase) / L + 1e-6) * L;
  for (; j < s1 - 1e-6; j += L) cuts.push(j);
  cuts.push(s1);
  const pcs = [];
  for (let i = 0; i < cuts.length - 1; i++) pcs.push([cuts[i], cuts[i + 1]]);
  for (let i = 0; i < pcs.length && pcs.length > 1; i++) {
    if (pcs[i][1] - pcs[i][0] < 0.15) {
      if (i > 0) { pcs[i - 1][1] = pcs[i][1]; pcs.splice(i, 1); i--; }
      else { pcs[1][0] = pcs[0][0]; pcs.splice(0, 1); i--; }
    }
  }
  return pcs;
}

/**
 * Perimeter walls with running bond, interlocking corners, openings (window/door/roller/opening) and lintels.
 * openings[wall] = [{u0,u1,c0,c1,kind}], u measured from the wall's start corner. color(c, wallName, u) -> hex
 */
function perimeterWalls(b, o) {
  const { cx, cz, W, D, base, courses, color, openings = {} } = o;
  const walls = [
    { name: 'front', axis: 'x', fixed: cz + D / 2 - T / 2, start: cx - W / 2, len: W, rot: 0 },
    { name: 'back', axis: 'x', fixed: cz - D / 2 + T / 2, start: cx - W / 2, len: W, rot: Math.PI },
    { name: 'left', axis: 'z', fixed: cx - W / 2 + T / 2, start: cz - D / 2, len: D, rot: -Math.PI / 2 },
    { name: 'right', axis: 'z', fixed: cx + W / 2 - T / 2, start: cz - D / 2, len: D, rot: Math.PI / 2 },
  ];
  for (const w of walls) {
    for (const op of openings[w.name] || []) {
      const uMid = w.start + (op.u0 + op.u1) / 2;
      const wdt = op.u1 - op.u0, hgt = (op.c1 - op.c0) * H;
      const y = base + op.c0 * H + hgt / 2;
      let type = null;
      if (op.kind === 'window') type = b.types.window(wdt, hgt, T);
      else if (op.kind === 'door') type = b.types.door(wdt, hgt);
      if (type) {
        const pos = w.axis === 'x' ? [uMid, y, w.fixed] : [w.fixed, y, uMid];
        b.add(type, ...pos, 0, 0, 0, qY(w.rot));
      } else if (op.kind === 'roller') {
        const n = Math.round(hgt / 0.3);
        for (let i = 0; i < n; i++) {
          const yy = base + op.c0 * H + (i + 0.5) * (hgt / n);
          const pos = w.axis === 'x' ? [uMid, yy, w.fixed] : [w.fixed, yy, uMid];
          b.add('slat', ...pos, wdt, hgt / n, 0.08, qY(w.axis === 'x' ? 0 : Math.PI / 2));
        }
      }
    }
  }
  for (let c = 0; c < courses; c++) {
    const y = base + c * H + H / 2;
    for (const w of walls) {
      const full = (c % 2 === 0) === (w.axis === 'x');
      const a = w.start + (full ? 0 : T), e = w.start + w.len - (full ? 0 : T);
      const ex = [];
      for (const op of openings[w.name] || []) {
        if (c >= op.c0 && c < op.c1) ex.push([w.start + op.u0, w.start + op.u1]);
        if (c === op.c1 && op.kind !== 'opening') {
          const l0 = w.start + op.u0 - 0.2, l1 = w.start + op.u1 + 0.2;
          ex.push([l0, l1]);
          const mid = (l0 + l1) / 2;
          if (w.axis === 'x') b.add('concrete', mid, y, w.fixed, l1 - l0, H, T);
          else b.add('concrete', w.fixed, y, mid, l1 - l0, H, T, qY(Math.PI / 2));
        }
      }
      const phase = (c % 2) * L / 2;
      for (const [s0, s1] of subtract(a, e, ex)) {
        for (const [p0, p1] of cutSegment(s0, s1, w.start, phase)) {
          const mid = (p0 + p1) / 2;
          const col = color(c, w.name, mid - w.start, w.len);
          if (w.axis === 'x') b.block(p1 - p0, mid, y, w.fixed, null, col);
          else b.block(p1 - p0, w.fixed, y, mid, qY(Math.PI / 2), col);
        }
      }
    }
  }
}

function innerWall(b, o) {
  const { axis, fixed, start, len, base, c0, c1, color = () => PAINT.white, openings = [] } = o;
  for (let c = c0; c < c1; c++) {
    const y = base + c * H + H / 2;
    const ex = [];
    for (const op of openings) {
      if (c >= op.c0 && c < op.c1) ex.push([start + op.u0, start + op.u1]);
      if (c === op.c1) {
        const l0 = start + op.u0 - 0.2, l1 = start + op.u1 + 0.2;
        ex.push([l0, l1]);
        if (axis === 'x') b.add('timberpost', (l0 + l1) / 2, y, fixed, l1 - l0, H, T);
        else b.add('timberpost', fixed, y, (l0 + l1) / 2, l1 - l0, H, T, qY(Math.PI / 2));
      }
    }
    for (const [s0, s1] of subtract(start, start + len, ex)) {
      for (const [p0, p1] of cutSegment(s0, s1, start, (c % 2) * L / 2)) {
        const mid = (p0 + p1) / 2;
        if (axis === 'x') b.block(p1 - p0, mid, y, fixed, null, color(c));
        else b.block(p1 - p0, fixed, y, mid, qY(Math.PI / 2), color(c));
      }
    }
  }
}

function gables(b, o) {
  const { cx, cz, W, D, top, pitch, color, c0 } = o;
  const tan = Math.tan(pitch);
  for (let g = 0; ; g++) {
    const half = D / 2 - ((g + 1) * H) / tan;
    if (half < 0.15) break;
    const y = top + g * H + H / 2;
    for (const x of [cx - W / 2 + T / 2, cx + W / 2 - T / 2]) {
      for (const [p0, p1] of cutSegment(cz - half, cz + half, cz - D / 2, ((c0 + g) % 2) * L / 2)) {
        b.block(p1 - p0, x, y, (p0 + p1) / 2, qY(Math.PI / 2), color(c0 + g));
      }
    }
  }
}

function gableRoof(b, o) {
  const { cx, cz, W, D, top, pitch, type = 'roof', ov = 0.45, ovx = 0.35, gutters = true } = o;
  const tp = 0.16;
  const cos = Math.cos(pitch), sin = Math.sin(pitch), tan = Math.tan(pitch);
  const run = D / 2 + ov;
  const slope = run / cos;
  const nR = Math.max(1, Math.ceil(slope / 1.35)), rowLen = slope / nR;
  const width = W + ovx * 2;
  const nC = Math.max(1, Math.round(width / 1.4)), colW = width / nC;
  for (const s of [1, -1]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s * pitch);
    const n = new THREE.Vector3(0, cos, s * sin);
    for (let r = 0; r < nR; r++) {
      const t = (r + 0.5) * rowLen;
      const uz = cz + s * run - s * t * cos;
      const uy = top - ov * tan + t * sin;
      for (let k = 0; k < nC; k++) b.add(type, cx - width / 2 + (k + 0.5) * colW, uy + n.y * tp / 2, uz + n.z * tp / 2, colW, tp, rowLen, q);
    }
    if (gutters) {
      const gname = b.types.gutter(colW);
      for (let k = 0; k < nC; k++) b.add(gname, cx - width / 2 + (k + 0.5) * colW, top - ov * tan - 0.02, cz + s * (run + 0.05), 0, 0, 0);
    }
  }
  const ry = top + (D / 2) * tan + tp / cos;
  for (let k = 0; k < nC; k++) b.add('ridge', cx - width / 2 + (k + 0.5) * colW, ry, cz, colW, 0.1, 0.42);
  return { ridgeY: ry };
}

function flatRoof(b, { cx, cz, W, D, top }) {
  const nx = Math.max(1, Math.round(W / 1.4)), nz = Math.max(1, Math.round(D / 1.4));
  const sx = W / nx, sz = D / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) b.add('concrete', cx - W / 2 + (i + 0.5) * sx, top + 0.1, cz - D / 2 + (j + 0.5) * sz, sx, 0.2, sz);
}

function floorPanels(b, { cx, cz, W, D, y }) {
  const x0 = cx - W / 2 + T, x1 = cx + W / 2 - T, z0 = cz - D / 2 + T, z1 = cz + D / 2 - T;
  const nx = Math.round((x1 - x0) / 1.4), nz = Math.round((z1 - z0) / 1.4);
  const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) b.add('floor', x0 + (i + 0.5) * sx, y, z0 + (j + 0.5) * sz, sx, H, sz);
}

function chimney(b, { x, z, base, topY, color }) {
  const n = Math.ceil((topY - base) / H);
  for (let c = 0; c < n; c++) {
    const y = base + c * H + H / 2;
    if (c % 2 === 0) { b.block(0.4, x, y, z - 0.1, null, color); b.block(0.4, x, y, z + 0.1, null, color); }
    else { b.block(0.4, x - 0.1, y, z, qY(Math.PI / 2), color); b.block(0.4, x + 0.1, y, z, qY(Math.PI / 2), color); }
  }
  b.add('concrete', x, base + n * H + 0.06, z, 0.56, 0.12, 0.56);
}

function foundation(b, M, cx, cz, W, D, base, extras = []) {
  b.decor.push({ geo: merge([box(W + 0.3, base, D + 0.3, cx, base / 2, cz), ...extras]), mat: M.concretePlain });
  b.statics.push({ pos: new THREE.Vector3(cx, base / 2, cz), size: new THREE.Vector3(W + 0.3, base, D + 0.3) });
}

const win = (u0, c0, w = 1.2, h = 6) => ({ u0, u1: u0 + w, c0, c1: c0 + h, kind: 'window' });

// exterior fittings on the outside of the walls (lamps, meter box, AC unit, downpipes at the corners)
function fittings(b, { cx, cz, W, D, base, top, lamps = [], meter = null, ac = null, pipes = true }) {
  const fz = cz + D / 2;
  for (const x of lamps) b.add('walllamp', cx - W / 2 + x, base + 2.3, fz + 0.11, 0, 0, 0);
  if (meter != null) b.add('meter', cx - W / 2 + meter, base + 1.25, fz + 0.08, 0, 0, 0);
  if (ac) b.add('aircon', cx + W / 2 + 0.33, 0.31, cz + ac, 0, 0, 0, qY(Math.PI / 2));
  if (pipes) for (const [x, z, r] of [[cx - W / 2 + 0.12, fz + 0.08, 0], [cx + W / 2 - 0.12, fz + 0.08, 0], [cx - W / 2 + 0.12, cz - D / 2 - 0.08, Math.PI], [cx + W / 2 - 0.12, cz - D / 2 - 0.08, Math.PI]]) {
    if (top - base > 2.4) b.add('downpipe', x, base + 1.3, z, 0, 0, 0, qY(r));
  }
}

// ---------------------------------------------------------------------------
export const BUILDINGS = [
  {
    id: 'bungalow', name: 'Cinder Bungalow', icon: '🏠', desc: 'Grey cinder blocks with a bright yellow base band and red corners.',
    build(types, M, o) {
      const b = new Builder(types, 11);
      const cx = o.x, cz = o.z, W = 10.4, D = 8.0, base = 0.15, courses = 13;
      const color = (c, wall, u, len) => {
        if (c < 1) return PAINT.dark;
        if ((u < 0.45 || u > len - 0.45) && c % 2 === 0) return PAINT.red;
        if (c >= 2 && c <= 3 && (wall === 'front' || wall === 'left')) return PAINT.yellow;
        return PAINT.cinder;
      };
      perimeterWalls(b, {
        cx, cz, W, D, base, courses, color, openings: {
          front: [win(0.8, 4), win(2.8, 4), { u0: 5.6, u1: 6.6, c0: 0, c1: 10, kind: 'door' }, win(8.0, 4, 1.6)],
          back: [win(1.2, 4, 0.8), win(4.0, 4, 1.6), win(8.0, 4)],
          left: [win(3.4, 4)],
          right: [win(1.6, 4, 0.8), win(5.6, 4, 0.8)],
        },
      });
      const top = base + courses * H;
      innerWall(b, { axis: 'z', fixed: cx - 0.6, start: cz - D / 2 + T, len: D - 2 * T, base, c0: 0, c1: courses, openings: [{ u0: D - 2.6, u1: D - 1.6, c0: 0, c1: 10 }] });
      const pitch = THREE.MathUtils.degToRad(30);
      gables(b, { cx, cz, W, D, top, pitch, color: () => PAINT.cinder, c0: courses });
      const { ridgeY } = gableRoof(b, { cx, cz, W, D, top, pitch });
      chimney(b, { x: cx + W / 2 + 0.2, z: cz - 0.8, base, topY: ridgeY + 0.6, color: PAINT.red });
      fittings(b, { cx, cz, W, D, base, top, lamps: [5.35, 9.9], meter: 7.3, ac: 1.6 });
      b.add('sofa', cx - 3.2, base + 0.425, cz + 1.8, 0, 0, 0, qY(Math.PI));
      b.add('tv', cx - 3.2, base + 0.5, cz - 1.2, 0, 0, 0);
      b.add('shelf', cx - 4.75, base + 0.95, cz - 2.6, 0, 0, 0, qY(Math.PI / 2));
      b.add('kitchen', cx + 2.4, base + 0.46, cz - D / 2 + 0.55, 0, 0, 0);
      b.add('fridge', cx + 4.3, base + 0.9, cz - D / 2 + 0.6, 0, 0, 0);
      b.add('table', cx + 2.6, base + 0.38, cz - 1.0, 0, 0, 0);
      b.add('bed', cx + 3.3, base + 0.31, cz + 2.2, 0, 0, 0, qY(Math.PI / 2));
      foundation(b, M, cx, cz, W, D, base, [box(1.6, 0.1, 0.5, cx + 1.1, 0.05, cz + D / 2 + 0.4)]);
      return b;
    },
  },
  {
    id: 'rainbow', name: 'Rainbow House', icon: '🌈', desc: 'Two storeys painted in rainbow bands, wooden upper floor and a chimney.',
    build(types, M, o) {
      const b = new Builder(types, 22);
      const cx = o.x, cz = o.z, W = 9.6, D = 7.2, base = 0.15, cps = 13, up = cps + 1;
      const color = (c) => RAINBOW[Math.floor(c / 2) % RAINBOW.length];
      perimeterWalls(b, {
        cx, cz, W, D, base, courses: cps * 2 + 1, color, openings: {
          front: [win(0.8, 4), win(2.8, 4), { u0: 4.4, u1: 5.4, c0: 0, c1: 10, kind: 'door' }, win(7.2, 4, 1.6), win(0.8, up + 4), win(4.0, up + 4, 1.6), win(7.2, up + 4, 1.6)],
          back: [win(1.2, 4, 1.6), win(6.8, 4), win(1.2, up + 4), win(6.8, up + 4)],
          left: [win(3.0, 4), win(3.0, up + 4)],
          right: [win(1.2, 4, 0.8), win(4.8, up + 4, 0.8)],
        },
      });
      floorPanels(b, { cx, cz, W, D, y: base + cps * H + H / 2 });
      const top = base + (cps * 2 + 1) * H;
      innerWall(b, { axis: 'z', fixed: cx + 0.4, start: cz - D / 2 + T, len: D - 2 * T, base, c0: 0, c1: cps, color: () => PAINT.white, openings: [{ u0: 1.2, u1: 2.2, c0: 0, c1: 10 }] });
      const pitch = THREE.MathUtils.degToRad(35);
      gables(b, { cx, cz, W, D, top, pitch, color, c0: cps * 2 + 1 });
      const { ridgeY } = gableRoof(b, { cx, cz, W, D, top, pitch });
      chimney(b, { x: cx - W / 2 - 0.2, z: cz + 2.0, base, topY: ridgeY + 0.8, color: PAINT.white });
      fittings(b, { cx, cz, W, D, base, top: base + 2.6, lamps: [4.15], meter: 6.2, ac: -1.4 });
      const fy = base + (cps + 1) * H;
      b.add('sofa', cx - 2.6, base + 0.425, cz + 1.9, 0, 0, 0, qY(Math.PI));
      b.add('kitchen', cx + 2.6, base + 0.46, cz - D / 2 + 0.55, 0, 0, 0);
      b.add('table', cx + 2.6, base + 0.38, cz + 0.6, 0, 0, 0);
      b.add('bed', cx + 2.2, fy + 0.31, cz + 0.5, 0, 0, 0);
      b.add('bed', cx - 3.0, fy + 0.31, cz - 0.8, 0, 0, 0, qY(Math.PI / 2));
      b.add('crate', cx - 3.6, fy + 0.5, cz + 2.2, 0, 0, 0);
      foundation(b, M, cx, cz, W, D, base, [box(1.6, 0.1, 0.5, cx, 0.05, cz + D / 2 + 0.4)]);
      return b;
    },
  },
  {
    id: 'warehouse', name: 'Block Warehouse', icon: '🏭', desc: 'Big grey block warehouse with blue and orange stripes, roller doors and a tin roof.',
    build(types, M, o) {
      const b = new Builder(types, 33);
      const cx = o.x, cz = o.z, W = 14.4, D = 10.4, base = 0.15, courses = 18;
      const color = (c) => (c === 12 || c === 13 ? PAINT.blue : c === 15 ? PAINT.orange : c < 1 ? PAINT.dark : PAINT.cinder);
      const hi = (u0) => ({ u0, u1: u0 + 2.0, c0: 9, c1: 12, kind: 'window' });
      perimeterWalls(b, {
        cx, cz, W, D, base, courses, color, openings: {
          front: [{ u0: 1.6, u1: 5.6, c0: 0, c1: 14, kind: 'roller' }, { u0: 7.2, u1: 8.2, c0: 0, c1: 10, kind: 'door' }, hi(9.6), { u0: 12.0, u1: 13.6, c0: 0, c1: 11, kind: 'roller' }],
          back: [hi(1.2), hi(4.8), hi(8.4), hi(12.0)],
          left: [hi(1.6), hi(6.4)],
          right: [hi(1.6), hi(6.4)],
        },
      });
      const top = base + courses * H;
      const col = types.column(top - base);
      for (const x of [-W / 4, 0, W / 4]) b.add(col, cx + x, base + (top - base) / 2, cz, 0, 0, 0);
      const pitch = THREE.MathUtils.degToRad(14);
      gables(b, { cx, cz, W, D, top, pitch, color: () => PAINT.cinder, c0: courses });
      gableRoof(b, { cx, cz, W, D, top, pitch, type: 'metalroof', ov: 0.4, ovx: 0.3 });
      fittings(b, { cx, cz, W, D, base, top, lamps: [1.4, 5.8, 7.0, 11.8], meter: 8.9, ac: 2.0 });
      for (let i = 0; i < 5; i++) b.add('pallet', cx - 5.2 + (i % 3) * 1.6, base + 0.425, cz - 3.0 + Math.floor(i / 3) * 1.5, 0, 0, 0);
      for (let i = 0; i < 6; i++) b.add('crate', cx + 2.2 + (i % 3) * 1.15, base + 0.5 + (i >= 3 ? 1.0 : 0), cz - 3.4, 0, 0, 0);
      for (let i = 0; i < 5; i++) b.add('drum', cx - 5.6 + i * 0.7, base + 0.45, cz + 4.0, 0, 0, 0);
      foundation(b, M, cx, cz, W, D, base);
      return b;
    },
  },
  {
    id: 'tower', name: 'Pixel Tower', icon: '🗼', desc: 'An 8 m tower of randomly painted blocks. Knock the bottom out and watch it fall.',
    build(types, M, o) {
      const b = new Builder(types, 44);
      const cx = o.x, cz = o.z, W = 4.0, D = 4.0, base = 0.15, courses = 40;
      const pal = [PAINT.red, PAINT.yellow, PAINT.blue, PAINT.green, PAINT.orange, PAINT.purple, PAINT.white, PAINT.pink, PAINT.teal, PAINT.black];
      const r = mulberry(7);
      const color = () => pal[Math.floor(r() * pal.length)];
      const ops = (c0) => [win(1.4, c0, 1.2, 5)];
      const openings = { front: [{ u0: 1.4, u1: 2.6, c0: 0, c1: 10, kind: 'door' }, ...ops(16), ...ops(28)], back: [...ops(6), ...ops(22)], left: [...ops(12), ...ops(30)], right: [...ops(8), ...ops(24)] };
      perimeterWalls(b, { cx, cz, W, D, base, courses, color, openings });
      floorPanels(b, { cx, cz, W, D, y: base + 20 * H + H / 2 + 0.0001 });
      flatRoof(b, { cx, cz, W, D, top: base + courses * H });
      foundation(b, M, cx, cz, W, D, base);
      return b;
    },
  },
  {
    id: 'wall', name: 'Colour Wall', icon: '🧱', desc: 'A freestanding 12 m wall in checkerboard colours with piers. Quick to smash.',
    build(types, M, o) {
      const b = new Builder(types, 55);
      const cx = o.x, cz = o.z, len = 12.0, courses = 15, base = 0.15;
      const pal = [PAINT.yellow, PAINT.blue, PAINT.red, PAINT.white, PAINT.green, PAINT.orange];
      for (let c = 0; c < courses; c++) {
        const y = base + c * H + H / 2;
        for (const [p0, p1] of cutSegment(cx - len / 2, cx + len / 2, cx - len / 2, (c % 2) * L / 2)) {
          const k = Math.floor((p0 - (cx - len / 2)) / 1.2) + Math.floor(c / 3);
          b.block(p1 - p0, (p0 + p1) / 2, y, cz, null, pal[k % pal.length]);
        }
        // piers every 2.4 m
        for (let x = cx - len / 2 + 0.2; x <= cx + len / 2 - 0.1; x += 2.4) {
          for (const s of [-1, 1]) b.block(0.4, x, y, cz + s * 0.3, qY(Math.PI / 2), PAINT.dark);
        }
      }
      foundation(b, M, cx, cz, len, 1.0, base);
      return b;
    },
  },
];
