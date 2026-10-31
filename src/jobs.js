// Procedural building generators. Each produces a list of piece specs + static decoration (foundation etc.)
import * as THREE from 'three';
import { box, merge } from './pieces.js';
import { SITE } from './world.js';

const L = 0.66, H = 0.3;
const Y = new THREE.Vector3(0, 1, 0);
const qY = (a) => new THREE.Quaternion().setFromAxisAngle(Y, a);

class Builder {
  constructor(types) { this.types = types; this.specs = []; this.statics = []; this.decor = []; }
  add(type, x, y, z, sx, sy, sz, quat = null) {
    this.specs.push({ type, pos: new THREE.Vector3(x, y, z), size: new THREE.Vector3(sx, sy, sz), quat });
  }
}

// subtract intervals from [a,b]
function subtract(a, b, ex) {
  let segs = [[a, b]];
  for (const [e0, e1] of ex) {
    const next = [];
    for (const [s0, s1] of segs) {
      if (e1 <= s0 || e0 >= s1) { next.push([s0, s1]); continue; }
      if (e0 > s0) next.push([s0, e0]);
      if (e1 < s1) next.push([e1, s1]);
    }
    segs = next;
  }
  return segs.filter(([s0, s1]) => s1 - s0 > 0.06);
}

// cut a segment at running-bond joints
function cutSegment(s0, s1, origin, phase) {
  const cuts = [s0];
  let j = origin + phase + Math.ceil((s0 - origin - phase) / L + 1e-6) * L;
  for (; j < s1 - 1e-6; j += L) cuts.push(j);
  cuts.push(s1);
  // merge too-short pieces into neighbours
  const pcs = [];
  for (let i = 0; i < cuts.length - 1; i++) pcs.push([cuts[i], cuts[i + 1]]);
  for (let i = 0; i < pcs.length && pcs.length > 1; i++) {
    if (pcs[i][1] - pcs[i][0] < 0.22) {
      if (i > 0) { pcs[i - 1][1] = pcs[i][1]; pcs.splice(i, 1); i--; }
      else { pcs[1][0] = pcs[0][0]; pcs.splice(0, 1); i--; }
    }
  }
  return pcs;
}

/**
 * Perimeter masonry walls with openings, lintels, windows and doors.
 * openings[wall] = [{u0,u1,c0,c1,kind:'window'|'door'|'opening'}] with u measured from the wall's start corner.
 */
function perimeterWalls(b, o) {
  const T = 0.3;
  const { cx, cz, W, D, base, courses, mat, openings = {} } = o;
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
      if (op.kind === 'window') type = b.types.window(wdt, hgt);
      else if (op.kind === 'door') type = b.types.door(wdt, hgt);
      if (type) {
        const pos = w.axis === 'x' ? [uMid, y, w.fixed] : [w.fixed, y, uMid];
        b.add(type, ...pos, 0, 0, 0, qY(w.rot));
      } else if (op.kind === 'roller') {
        const slatH = 0.3, n = Math.round(hgt / slatH);
        for (let i = 0; i < n; i++) {
          const yy = base + op.c0 * H + (i + 0.5) * (hgt / n);
          const pos = w.axis === 'x' ? [uMid, yy, w.fixed + (w.rot === 0 ? 0.05 : -0.05)] : [w.fixed, yy, uMid];
          b.add('slat', ...pos, wdt, hgt / n, 0.1, qY(w.axis === 'x' ? 0 : Math.PI / 2));
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
          if (w.axis === 'x') b.add(mat, mid, y, w.fixed, p1 - p0, H, T);
          else b.add(mat, w.fixed, y, mid, p1 - p0, H, T, qY(Math.PI / 2));
        }
      }
    }
  }
}

function innerWall(b, o) {
  const T = 0.2;
  const { axis, fixed, start, len, base, c0, c1, mat = 'plaster', openings = [] } = o;
  for (let c = c0; c < c1; c++) {
    const y = base + c * H + H / 2;
    const ex = [];
    for (const op of openings) {
      if (c >= op.c0 && c < op.c1) ex.push([start + op.u0, start + op.u1]);
      if (c === op.c1) {
        const l0 = start + op.u0 - 0.15, l1 = start + op.u1 + 0.15;
        ex.push([l0, l1]);
        if (axis === 'x') b.add('timberpost', (l0 + l1) / 2, y, fixed, l1 - l0, H, T);
        else b.add('timberpost', fixed, y, (l0 + l1) / 2, l1 - l0, H, T, qY(Math.PI / 2));
      }
    }
    for (const [s0, s1] of subtract(start, start + len, ex)) {
      for (const [p0, p1] of cutSegment(s0, s1, start, (c % 2) * L / 2)) {
        const mid = (p0 + p1) / 2;
        if (axis === 'x') b.add(mat, mid, y, fixed, p1 - p0, H, T);
        else b.add(mat, fixed, y, mid, p1 - p0, H, T, qY(Math.PI / 2));
      }
    }
  }
}

// Stepped gable masonry on the two side (x) walls
function gables(b, o) {
  const { cx, cz, W, D, top, pitch, mat } = o;
  const T = 0.3, tan = Math.tan(pitch);
  for (let g = 0; ; g++) {
    const half = D / 2 - ((g + 1) * H) / tan;
    if (half < 0.25) break;
    const y = top + g * H + H / 2;
    for (const x of [cx - W / 2 + T / 2, cx + W / 2 - T / 2]) {
      for (const [p0, p1] of cutSegment(cz - half, cz + half, cz - D / 2, ((g + 1) % 2) * L / 2)) {
        b.add(mat, x, y, (p0 + p1) / 2, p1 - p0, H, T, qY(Math.PI / 2));
      }
    }
  }
}

// Pitched roof made of panels; ridge runs along x.
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
      for (let k = 0; k < nC; k++) {
        const x = cx - width / 2 + (k + 0.5) * colW;
        b.add(type, x, uy + n.y * tp / 2, uz + n.z * tp / 2, colW, tp, rowLen, q);
      }
    }
    if (gutters) {
      const gname = b.types.gutter(colW);
      const ez = cz + s * (run + 0.05), ey = top - ov * tan - 0.02;
      for (let k = 0; k < nC; k++) b.add(gname, cx - width / 2 + (k + 0.5) * colW, ey, ez, 0, 0, 0);
    }
  }
  // ridge caps
  const ry = top + (D / 2) * tan + tp / cos;
  for (let k = 0; k < nC; k++) b.add('ridge', cx - width / 2 + (k + 0.5) * colW, ry, cz, colW, 0.1, 0.42);
  return { ridgeY: ry };
}

function floorPanels(b, o) {
  const { cx, cz, W, D, y, T = 0.3 } = o;
  const x0 = cx - W / 2 + T, x1 = cx + W / 2 - T, z0 = cz - D / 2 + T, z1 = cz + D / 2 - T;
  const nx = Math.round((x1 - x0) / 1.4), nz = Math.round((z1 - z0) / 1.4);
  const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) b.add('floor', x0 + (i + 0.5) * sx, y, z0 + (j + 0.5) * sz, sx, H, sz);
}

function chimney(b, o) {
  const { x, z, base, topY, mat } = o;
  const n = Math.ceil((topY - base) / H);
  for (let c = 0; c < n; c++) {
    const y = base + c * H + H / 2;
    if (c % 2 === 0) { b.add(mat, x, y, z - 0.165, 0.66, H, 0.33); b.add(mat, x, y, z + 0.165, 0.66, H, 0.33); }
    else { b.add(mat, x - 0.165, y, z, 0.33, H, 0.66); b.add(mat, x + 0.165, y, z, 0.33, H, 0.66); }
  }
  b.add('concrete', x, base + n * H + 0.06, z, 0.8, 0.12, 0.8);
}

function foundation(b, M, cx, cz, W, D, base, extras = []) {
  const parts = [box(W + 0.3, base, D + 0.3, cx, base / 2, cz), ...extras];
  b.decor.push({ geo: merge(parts), mat: M.concretePlain });
  b.statics.push({ pos: new THREE.Vector3(cx, base / 2, cz), size: new THREE.Vector3(W + 0.3, base, D + 0.3) });
}

// ---------------------------------------------------------------------------
export const JOBS = [
  {
    id: 'bungalow', name: 'Maple St. Bungalow', bonus: 750, cost: 0, desc: 'A small single-storey brick bungalow. A good first job.',
    build(types, M) {
      const b = new Builder(types);
      const cx = SITE.houseCenter.x, cz = SITE.houseCenter.z;
      const W = 16 * L, D = 12 * L, base = 0.15, courses = 9;
      const win = (u0, w = 1.32) => ({ u0, u1: u0 + w, c0: 3, c1: 7, kind: 'window' });
      perimeterWalls(b, {
        cx, cz, W, D, base, courses, mat: 'brick', openings: {
          front: [win(1.0), win(3.0), { u0: W / 2 + 0.6, u1: W / 2 + 1.6, c0: 0, c1: 7, kind: 'door' }, win(W - 2.6, 1.6)],
          back: [win(1.3, 1.0), win(4.2, 1.6), win(W - 3.0, 1.32)],
          left: [win(D / 2 - 0.66)],
          right: [win(1.5, 1.0), win(D - 2.6, 1.0)],
        },
      });
      const top = base + courses * H;
      innerWall(b, { axis: 'z', fixed: cx - 0.6, start: cz - D / 2 + 0.3, len: D - 0.6, base, c0: 0, c1: courses, openings: [{ u0: D - 2.4, u1: D - 1.5, c0: 0, c1: 7 }] });
      innerWall(b, { axis: 'x', fixed: cz - 0.8, start: cx + 0.6 + 0.1, len: W / 2 - 1.0, base, c0: 0, c1: courses, openings: [{ u0: 0.8, u1: 1.7, c0: 0, c1: 7 }] });
      const pitch = THREE.MathUtils.degToRad(32);
      gables(b, { cx, cz, W, D, top, pitch, mat: 'brick' });
      const { ridgeY } = gableRoof(b, { cx, cz, W, D, top, pitch });
      chimney(b, { x: cx + W / 2 + 0.33, z: cz - 0.6, base, topY: ridgeY + 0.6, mat: 'brick' });
      // furniture
      b.add('sofa', cx - 3.4, base + 0.425, cz + 1.8, 0, 0, 0, qY(Math.PI));
      b.add('tv', cx - 3.4, base + 0.5, cz - 1.0, 0, 0, 0);
      b.add('shelf', cx - 4.75, base + 0.95, cz - 2.8, 0, 0, 0, qY(Math.PI / 2));
      b.add('kitchen', cx + 2.6, base + 0.46, cz - D / 2 + 0.65, 0, 0, 0);
      b.add('fridge', cx + 4.4, base + 0.9, cz - D / 2 + 0.7, 0, 0, 0);
      b.add('table', cx + 2.8, base + 0.38, cz - 2.1, 0, 0, 0);
      b.add('bed', cx + 3.3, base + 0.31, cz + 1.6, 0, 0, 0, qY(Math.PI / 2));
      // front steps + path
      foundation(b, M, cx, cz, W, D, base, [box(1.6, 0.1, 0.5, cx + 1.1, 0.05, cz + D / 2 + 0.4)]);
      return b;
    },
  },
  {
    id: 'twostorey', name: 'Oak Ave. Family House', bonus: 2400, cost: 2000, desc: 'Two storeys of buff brick, wooden floors and a big chimney.',
    build(types, M) {
      const b = new Builder(types);
      const cx = SITE.houseCenter.x, cz = SITE.houseCenter.z;
      const W = 17 * L, D = 13 * L, base = 0.15, cps = 9;
      const win = (u0, c0, w = 1.32) => ({ u0, u1: u0 + w, c0, c1: c0 + 4, kind: 'window' });
      const up = cps + 1;
      perimeterWalls(b, {
        cx, cz, W, D, base, courses: cps * 2 + 1, mat: 'brickY', openings: {
          front: [win(0.9, 3), win(2.9, 3), { u0: W / 2 - 0.5, u1: W / 2 + 0.5, c0: 0, c1: 7, kind: 'door' }, win(W - 4.2, 3, 1.6), win(W - 2.2, 3, 1.32),
            win(0.9, up + 3), win(3.2, up + 3), win(W / 2 - 0.5, up + 3, 1.0), win(W - 4.4, up + 3), win(W - 2.2, up + 3)],
          back: [win(1.2, 3, 1.6), win(5.0, 3, 1.0), win(W - 2.6, 3), { u0: W / 2 - 0.2, u1: W / 2 + 0.7, c0: 0, c1: 7, kind: 'door' }, win(1.2, up + 3), win(W - 2.6, up + 3, 1.6)],
          left: [win(D / 2 - 0.66, 3), win(D / 2 - 0.66, up + 3)],
          right: [win(1.5, 3, 1.0), win(D - 2.5, up + 3, 1.0)],
        },
      });
      floorPanels(b, { cx, cz, W, D, y: base + cps * H + H / 2 });
      const top = base + (cps * 2 + 1) * H;
      innerWall(b, { axis: 'z', fixed: cx + 0.5, start: cz - D / 2 + 0.3, len: D - 0.6, base, c0: 0, c1: cps, openings: [{ u0: 1.2, u1: 2.1, c0: 0, c1: 7 }] });
      innerWall(b, { axis: 'z', fixed: cx - 1.0, start: cz - D / 2 + 0.3, len: D - 0.6, base, c0: up, c1: cps * 2 + 1, openings: [{ u0: D - 2.6, u1: D - 1.7, c0: up, c1: up + 7 }] });
      const pitch = THREE.MathUtils.degToRad(36);
      gables(b, { cx, cz, W, D, top, pitch, mat: 'brickY' });
      const { ridgeY } = gableRoof(b, { cx, cz, W, D, top, pitch });
      chimney(b, { x: cx - W / 2 - 0.33, z: cz - 2.4, base, topY: ridgeY + 0.8, mat: 'brick' });
      const fy = base + (cps + 1) * H;
      b.add('sofa', cx - 2.8, base + 0.425, cz + 1.9, 0, 0, 0, qY(Math.PI));
      b.add('tv', cx - 2.8, base + 0.5, cz - 1.4, 0, 0, 0);
      b.add('shelf', cx - 5.05, base + 0.95, cz + 0.2, 0, 0, 0, qY(Math.PI / 2));
      b.add('kitchen', cx + 3.0, base + 0.46, cz - D / 2 + 0.65, 0, 0, 0);
      b.add('fridge', cx + 4.8, base + 0.9, cz - D / 2 + 0.7, 0, 0, 0);
      b.add('table', cx + 3.0, base + 0.38, cz + 0.6, 0, 0, 0);
      b.add('bed', cx + 2.4, fy + 0.31, cz + 0.5, 0, 0, 0);
      b.add('bed', cx - 3.6, fy + 0.31, cz - 1.0, 0, 0, 0, qY(Math.PI / 2));
      b.add('shelf', cx + 4.9, fy + 0.95, cz - 2.6, 0, 0, 0, qY(-Math.PI / 2));
      b.add('crate', cx - 4.6, fy + 0.5, cz + 2.4, 0, 0, 0);
      foundation(b, M, cx, cz, W, D, base, [box(1.6, 0.1, 0.5, cx, 0.05, cz + D / 2 + 0.4)]);
      return b;
    },
  },
  {
    id: 'warehouse', name: 'Dockside Warehouse', bonus: 7000, cost: 7500, desc: 'A big block-wall warehouse with a steel frame and a tin roof.',
    build(types, M) {
      const b = new Builder(types);
      const cx = SITE.houseCenter.x, cz = SITE.houseCenter.z - 1;
      const W = 25 * L, D = 18 * L, base = 0.15, courses = 15;
      const hi = (u0) => ({ u0, u1: u0 + 1.98, c0: 10, c1: 13, kind: 'window' });
      perimeterWalls(b, {
        cx, cz, W, D, base, courses, mat: 'block', openings: {
          front: [{ u0: 2.0, u1: 6.0, c0: 0, c1: 12, kind: 'roller' }, { u0: 8.6, u1: 9.6, c0: 0, c1: 7, kind: 'door' }, hi(11.0), { u0: 13.2, u1: 15.0, c0: 0, c1: 10, kind: 'roller' }],
          back: [hi(1.5), hi(5.5), hi(9.5), hi(13.5)],
          left: [hi(2.0), hi(7.2)],
          right: [hi(2.0), hi(7.2)],
        },
      });
      const top = base + courses * H;
      const colName = types.column(top - base);
      for (const x of [-W / 4, 0, W / 4]) b.add(colName, cx + x, base + (top - base) / 2, cz, 0, 0, 0);
      const pitch = THREE.MathUtils.degToRad(14);
      gables(b, { cx, cz, W, D, top, pitch, mat: 'block' });
      gableRoof(b, { cx, cz, W, D, top, pitch, type: 'metalroof', ov: 0.4, ovx: 0.3 });
      for (let i = 0; i < 7; i++) b.add('pallet', cx - 6 + (i % 4) * 1.6, base + 0.425, cz - 3.5 + Math.floor(i / 4) * 1.5, 0, 0, 0, qY((i * 0.3) % 0.5));
      for (let i = 0; i < 8; i++) b.add('crate', cx + 2.5 + (i % 3) * 1.15, base + 0.5 + (i >= 6 ? 1.0 : 0), cz - 4.2 + Math.floor((i % 6) / 3) * 1.2, 0, 0, 0);
      for (let i = 0; i < 6; i++) b.add('drum', cx - 6.5 + i * 0.7, base + 0.45, cz + 4.6, 0, 0, 0);
      foundation(b, M, cx, cz, W, D, base);
      return b;
    },
  },
];
