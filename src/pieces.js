// Geometry + gameplay definitions for every destructible piece type.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxMapped } from './materials.js';

export function box(w, h, d, x = 0, y = 0, z = 0, color = null, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  if (color !== null) paint(g, color);
  return g.toNonIndexed ? g : g;
}
export function cyl(rt, rb, h, seg, x = 0, y = 0, z = 0, color = null, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  if (color !== null) paint(g, color);
  return g;
}
export function paint(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export function merge(list) {
  const clean = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) ng.deleteAttribute(k);
    ng.clearGroups();
    return ng;
  });
  return mergeGeometries(clean, false);
}

export class TypeRegistry {
  constructor(M) {
    this.M = M;
    this.types = new Map();
    const unit = new THREE.BoxGeometry(1, 1, 1);
    this.unit = unit;
    const plaster = boxMapped(new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: 0.9, map: M.concrete.map }), 2, 2);
    const ceiling = boxMapped(new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.95, map: M.concrete.map }), 2, 2);
    const ridgeMat = M.shingles;
    const def = (name, d) => this.types.set(name, { name, unit: true, tint: false, value: 2, hp: 2, hang: 2, density: 1.9, kgm3: 1900, sound: 'brick', dust: 0x9a7a66, chip: 0x8a4630, ...d });
    // hollow concrete masonry units (cinder blocks): 400 x 200 x 200 mm, two cores; half block has one core
    def('cmu', { parts: [{ geo: cmuGeometry(0.4), mat: M.cinder }], unit: false, size: new THREE.Vector3(0.4, 0.2, 0.2), tint: true, hp: 2, hang: 0.55, kg: 17, density: 1.4 });
    def('cmuHalf', { parts: [{ geo: cmuGeometry(0.2), mat: M.cinder }], unit: false, size: new THREE.Vector3(0.2, 0.2, 0.2), tint: true, hp: 1, hang: 0.4, kg: 9, density: 1.4 });
    def('cmuSolid', { parts: [{ geo: unit, mat: M.cinderSolid }], tint: true, hp: 2, hang: 0.55, kgm3: 1500, density: 1.4 });
    def('brick', { parts: [{ geo: unit, mat: M.brick }], tint: true, value: 2, hp: 2, hang: 0.75 });
    def('brickY', { parts: [{ geo: unit, mat: M.brickYellow }], tint: true, value: 2, hp: 2, hang: 0.75, dust: 0xb9a07a, chip: 0xc8a46a });
    def('block', { parts: [{ geo: unit, mat: M.block }], tint: true, value: 3, hp: 3, hang: 0.75, dust: 0x9a9890, chip: 0x8a8882 });
    def('plaster', { parts: [{ geo: unit, mat: plaster }], tint: true, value: 2, hp: 2, hang: 0.75, dust: 0xd8d4ca, chip: 0xe8e4da });
    def('concrete', { parts: [{ geo: unit, mat: M.concrete }], kgm3: 2300, value: 3, hp: 3, hang: 1.0, dust: 0xaaa8a0, chip: 0x9a9890 });
    def('roof', { kgm3: 180, parts: [{ geo: unit, mat: [M.fascia, M.fascia, M.shingles, M.soffit, M.fascia, M.fascia] }], value: 2, hp: 1, hang: 3.2, stiff: 0.25, density: 0.9, sound: 'wood', dust: 0x6a6a6a, chip: 0x3a3c40 });
    def('metalroof', { kgm3: 90, parts: [{ geo: unit, mat: [M.galvanized, M.galvanized, M.metalRoof, M.timber, M.galvanized, M.galvanized] }], value: 3, hp: 1, hang: 3.6, stiff: 0.25, density: 0.8, sound: 'metal', dust: 0x9a9a9a, chip: 0xa0a8b0 });
    def('ridge', { kgm3: 300, parts: [{ geo: unit, mat: ridgeMat }], value: 1, hp: 1, hang: 3.6, stiff: 0.25, density: 0.9, sound: 'wood', dust: 0x666666, chip: 0x333333 });
    def('floor', { kgm3: 250, parts: [{ geo: unit, mat: [M.timber, M.timber, M.floorWood, ceiling, M.timber, M.timber] }], value: 2, hp: 2, hang: 3.5, stiff: 0.4, density: 0.7, sound: 'wood', dust: 0xa08060, chip: 0x9a7048 });
    def('slat', { kgm3: 400, parts: [{ geo: unit, mat: M.metalWall }], value: 2, hp: 1, hang: 1.2, density: 0.8, sound: 'metal', dust: 0x9a9a9a, chip: 0x9fb4c4 });
    def('timberpost', { kgm3: 550, parts: [{ geo: unit, mat: M.timber }], value: 2, hp: 2, hang: 1.0, density: 0.7, sound: 'wood', dust: 0xa08060, chip: 0xb08858 });

    // props
    this.prop('sofa', [2.0, 0.85, 0.9], 15, () => {
      const c = 0x5e6f7d, d = 0x4b5965, w = 0x3a2a1c;
      return merge([
        box(2.0, 0.22, 0.86, 0, -0.26, 0, d), box(2.0, 0.55, 0.22, 0, 0.12, -0.32, c),
        box(0.22, 0.42, 0.86, -0.89, -0.03, 0, c), box(0.22, 0.42, 0.86, 0.89, -0.03, 0, c),
        box(0.76, 0.16, 0.62, -0.39, -0.08, 0.08, c), box(0.76, 0.16, 0.62, 0.39, -0.08, 0.08, c),
        box(0.08, 0.08, 0.08, -0.9, -0.39, 0.36, w), box(0.08, 0.08, 0.08, 0.9, -0.39, 0.36, w),
        box(0.08, 0.08, 0.08, -0.9, -0.39, -0.36, w), box(0.08, 0.08, 0.08, 0.9, -0.39, -0.36, w),
        box(0.4, 0.34, 0.12, -0.55, 0.15, -0.16, 0xc9a24a, 0.2), box(0.4, 0.34, 0.12, 0.55, 0.15, -0.16, 0xa83a3a, 0.2),
      ]);
    }, 'wood');
    this.prop('fridge', [0.72, 1.8, 0.7], 25, () => merge([
      box(0.72, 1.8, 0.66, 0, 0, -0.02, 0xe9eaea), box(0.7, 0.02, 0.02, 0, 0.32, 0.32, 0x9a9a9a),
      box(0.03, 0.4, 0.04, 0.28, 0.6, 0.34, 0xb8b8b8), box(0.03, 0.6, 0.04, 0.28, -0.1, 0.34, 0xb8b8b8),
      box(0.66, 0.06, 0.6, 0, -0.87, 0, 0x2a2a2a),
    ]), 'metal');
    this.prop('table', [1.5, 0.76, 0.86], 10, () => {
      const w = 0x7a5232;
      return merge([box(1.5, 0.05, 0.86, 0, 0.355, 0, w), box(1.38, 0.08, 0.74, 0, 0.29, 0, 0x6a4428),
        box(0.07, 0.7, 0.07, -0.66, -0.03, -0.35, w), box(0.07, 0.7, 0.07, 0.66, -0.03, -0.35, w), box(0.07, 0.7, 0.07, -0.66, -0.03, 0.35, w), box(0.07, 0.7, 0.07, 0.66, -0.03, 0.35, w)]);
    }, 'wood');
    this.prop('bed', [1.5, 0.62, 2.05], 18, () => merge([
      box(1.5, 0.22, 2.0, 0, -0.2, 0, 0x6b4a30), box(1.42, 0.22, 1.92, 0, 0.02, 0, 0xf1efe8), box(1.44, 0.08, 1.4, 0, 0.16, 0.25, 0x3e6e9a),
      box(0.55, 0.12, 0.34, -0.36, 0.17, -0.74, 0xffffff), box(0.55, 0.12, 0.34, 0.36, 0.17, -0.74, 0xffffff), box(1.5, 0.62, 0.08, 0, 0.0, -1.0, 0x5a3d26),
    ]), 'wood');
    this.prop('kitchen', [1.98, 0.92, 0.62], 20, () => {
      const parts = [box(1.98, 0.84, 0.58, 0, -0.04, -0.02, 0xdcd6c8), box(2.0, 0.05, 0.62, 0, 0.435, 0, 0x2f3236), box(1.98, 0.08, 0.5, 0, -0.42, -0.04, 0x222222)];
      for (let i = 0; i < 4; i++) {
        parts.push(box(0.47, 0.7, 0.02, -0.74 + i * 0.494, -0.02, 0.27, 0xe9e4d6));
        parts.push(box(0.12, 0.02, 0.03, -0.74 + i * 0.494, 0.25, 0.29, 0x8a8a8a));
      }
      parts.push(box(0.5, 0.03, 0.36, 0.4, 0.46, 0, 0xb8bcc0));
      return merge(parts);
    }, 'wood');
    this.prop('shelf', [0.9, 1.9, 0.36], 12, () => {
      const w = 0x8a5e3a, p = [box(0.04, 1.9, 0.36, -0.43, 0, 0, w), box(0.04, 1.9, 0.36, 0.43, 0, 0, w), box(0.9, 1.9, 0.02, 0, 0, -0.17, 0x6e4a2c)];
      const r = mulberry(5);
      for (let i = 0; i < 5; i++) {
        const y = -0.92 + i * 0.45; p.push(box(0.86, 0.03, 0.34, 0, y, 0, w));
        if (i < 4) { let x = -0.38; while (x < 0.36) { const bw = 0.03 + r() * 0.05, bh = 0.22 + r() * 0.14; const cols = [0x8a2b2b, 0x2b4a8a, 0x2b7a4a, 0xc9a24a, 0x444444, 0xd8d0c0]; p.push(box(bw, bh, 0.24, x + bw / 2, y + 0.015 + bh / 2, 0, cols[Math.floor(r() * cols.length)])); x += bw + 0.005; } }
      }
      return merge(p);
    }, 'wood');
    this.prop('crate', [1.0, 1.0, 1.0], 8, () => {
      const w = 0xb48a52, d = 0x8a6436, p = [box(0.96, 0.96, 0.96, 0, 0, 0, w)];
      for (const s of [-1, 1]) {
        p.push(box(1.0, 0.1, 0.1, 0, 0.45 * s, 0.45, d), box(0.1, 1.0, 0.1, 0.45 * s, 0, 0.45, d), box(1.0, 0.1, 0.1, 0, 0.45 * s, -0.45, d), box(0.1, 1.0, 0.1, 0.45 * s, 0, -0.45, d));
        p.push(box(0.1, 0.1, 1.0, 0.45 * s, 0.45, 0, d), box(0.1, 0.1, 1.0, 0.45 * s, -0.45, 0, d));
      }
      p.push(box(1.28, 0.08, 0.1, 0, 0, 0.47, d, 0, 0, Math.PI / 4));
      return merge(p);
    }, 'wood');
    this.prop('drum', [0.6, 0.9, 0.6], 10, () => merge([
      cyl(0.29, 0.29, 0.9, 20, 0, 0, 0, 0x1f5fa8), cyl(0.3, 0.3, 0.03, 20, 0, 0.15, 0, 0x184a85), cyl(0.3, 0.3, 0.03, 20, 0, -0.15, 0, 0x184a85),
      cyl(0.27, 0.27, 0.01, 20, 0, 0.451, 0, 0x2a6ab8), cyl(0.03, 0.03, 0.02, 8, 0.15, 0.46, 0, 0x888888),
    ]), 'metal');
    this.prop('pallet', [1.2, 0.85, 1.0], 14, () => {
      const p = [], w = 0xc8a070;
      for (let i = 0; i < 5; i++) p.push(box(1.2, 0.025, 0.14, 0, -0.33, -0.43 + i * 0.215, w));
      for (const x of [-0.55, 0, 0.55]) p.push(box(0.1, 0.1, 1.0, x, -0.39, 0, 0xb08858));
      // stacked bags of cement
      for (let i = 0; i < 6; i++) p.push(box(0.55, 0.14, 0.42, (i % 2 ? 0.29 : -0.29), -0.24 + Math.floor(i / 2) * 0.15, (i % 4 < 2 ? 0.24 : -0.24) * 0, 0xd8cfbf));
      for (let i = 0; i < 6; i++) p.push(box(0.55, 0.14, 0.42, (i % 2 ? 0.29 : -0.29), -0.24 + Math.floor(i / 2) * 0.15, 0.27, 0xcfc4b0));
      for (let i = 0; i < 6; i++) p.push(box(0.55, 0.14, 0.42, (i % 2 ? 0.29 : -0.29), -0.24 + Math.floor(i / 2) * 0.15, -0.27, 0xd4c9b6));
      return merge(p);
    }, 'wood');
    // ---- exterior details: outdoor AC unit, electricity meter box, wall lamp, rainwater downpipe
    this.prop('aircon', [0.85, 0.62, 0.32], 20, () => {
      const p = [box(0.85, 0.62, 0.3, 0, 0, 0, 0xe9e9e4), box(0.86, 0.04, 0.31, 0, 0.3, 0, 0xd2d2cc), box(0.86, 0.04, 0.31, 0, -0.3, 0, 0xc4c4be)];
      p.push(cyl(0.22, 0.22, 0.02, 24, -0.12, 0, 0.151, 0x2a2c2f, Math.PI / 2), cyl(0.05, 0.05, 0.03, 12, -0.12, 0, 0.16, 0x9a9da2, Math.PI / 2));
      for (let i = 0; i < 5; i++) p.push(box(0.46, 0.012, 0.012, -0.12, -0.19 + i * 0.095, 0.165, 0x55585c));
      for (let i = 0; i < 9; i++) p.push(box(0.012, 0.5, 0.012, 0.2 + i * 0.022, 0, 0.152, 0xb9bab5));
      p.push(box(0.1, 0.06, 0.25, 0.37, -0.34, 0, 0x6a6c70), box(0.1, 0.06, 0.25, -0.37, -0.34, 0, 0x6a6c70));
      p.push(cyl(0.012, 0.012, 0.4, 8, 0.43, 0.05, -0.1, 0x9a7a40, 0, 0, Math.PI / 2), cyl(0.012, 0.012, 0.4, 8, 0.43, -0.02, -0.1, 0x5a5a5a, 0, 0, Math.PI / 2));
      return merge(p);
    }, 'metal');
    this.prop('meter', [0.36, 0.5, 0.16], 6, () => merge([
      box(0.36, 0.5, 0.15, 0, 0, 0, 0x9aa0a4), box(0.37, 0.03, 0.16, 0, 0.255, 0, 0x7f868b), box(0.22, 0.14, 0.01, 0, 0.08, 0.076, 0x1d2830),
      box(0.18, 0.06, 0.01, 0, 0.08, 0.081, 0xc8d6c0), box(0.04, 0.04, 0.02, 0.12, -0.15, 0.08, 0x333333), box(0.3, 0.02, 0.01, 0, -0.2, 0.076, 0xd8b020),
      cyl(0.02, 0.02, 0.4, 8, -0.1, -0.45, -0.02, 0x333333),
    ]), 'metal');
    this.prop('walllamp', [0.2, 0.32, 0.22], 4, () => merge([
      box(0.14, 0.2, 0.03, 0, 0, -0.095, 0x1b1c1e), box(0.04, 0.04, 0.14, 0, 0.04, -0.02, 0x1b1c1e),
      box(0.16, 0.2, 0.16, 0, -0.03, 0.04, 0x232427), box(0.13, 0.15, 0.13, 0, -0.03, 0.04, 0xfff1c4), box(0.2, 0.04, 0.2, 0, 0.09, 0.04, 0x1b1c1e),
    ]), 'metal');
    this.prop('downpipe', [0.12, 2.6, 0.14], 3, () => {
      const p = [cyl(0.045, 0.045, 2.45, 12, 0, 0.05, 0, 0x8e9499)];
      for (let i = 0; i < 4; i++) p.push(box(0.12, 0.03, 0.12, 0, -1.0 + i * 0.7, -0.01, 0x6f757a));
      p.push(cyl(0.045, 0.06, 0.2, 12, 0, -1.2, 0.07, 0x8e9499, -0.7), cyl(0.07, 0.045, 0.12, 12, 0, 1.25, 0, 0x8e9499));
      return merge(p);
    }, 'metal');
    this.prop('tv', [1.1, 1.0, 0.45], 30, () => merge([
      box(1.1, 0.5, 0.45, 0, -0.25, 0, 0x4a3426), box(1.0, 0.04, 0.02, 0, -0.25, 0.23, 0x2a1d14),
      box(1.0, 0.6, 0.05, 0, 0.3, -0.05, 0x111111), box(0.94, 0.54, 0.01, 0, 0.3, -0.02, 0x1e2a36), box(0.2, 0.05, 0.15, 0, 0.0, -0.05, 0x222222),
    ]), 'metal');
  }

  prop(name, size, value, build, sound) {
    const geo = build();
    this.types.set(name, {
      name, unit: false, tint: false, value, kg: PROP_KG[name] || 30, dust: avgVertexColor(geo), chip: avgVertexColor(geo), hp: 1, hang: 99, density: 0.5, sound,
      size: new THREE.Vector3(...size), parts: [{ geo, mat: this.M.vertex }], prop: true,
    });
  }

  get(name) { return this.types.get(name); }

  window(w, h, depth = 0.3) {
    const name = `window_${w.toFixed(2)}_${h.toFixed(2)}_${depth.toFixed(2)}`;
    if (this.types.has(name)) return name;
    const fz = depth * 0.17, fd = Math.min(0.12, depth * 0.6), fb = 0.07;
    const frame = merge([
      box(w, fb, fd, 0, h / 2 - fb / 2, fz), box(w, fb, fd, 0, -h / 2 + fb / 2 + 0.05, fz),
      box(fb, h - 0.05, fd, -w / 2 + fb / 2, 0.025, fz), box(fb, h - 0.05, fd, w / 2 - fb / 2, 0.025, fz),
      box(0.055, h - 0.2, 0.09, 0, 0.025, fz), box(w - 0.14, 0.055, 0.09, 0, h * 0.18, fz),
      // sashes (inner frame lips)
      box(w - 0.14, 0.03, 0.05, 0, -h / 2 + 0.14, fz + 0.03), box(w - 0.14, 0.03, 0.05, 0, h / 2 - 0.09, fz + 0.03),
    ]);
    const sill = merge([box(w + 0.14, 0.05, depth + 0.06, 0, -h / 2 + 0.025, 0.05), box(w + 0.14, 0.02, 0.05, 0, -h / 2 + 0.005, depth / 2 + 0.07)]);
    const glass = box(w - 0.12, h - 0.16, 0.012, 0, 0.02, fz);
    this.types.set(name, {
      name, unit: false, tint: false, value: 5, kg: 28, hp: 1, hang: 0.8, density: 0.6, sound: 'glass', dust: 0xdfe3e6, chip: 0xcfe8f0,
      size: new THREE.Vector3(w, h, depth), parts: [{ geo: frame, mat: this.M.pvc }, { geo: sill, mat: this.M.concretePlain }, { geo: glass, mat: this.M.glass, noShadow: true }],
    });
    return name;
  }

  door(w, h, style = 'house') {
    const name = `door_${style}_${w.toFixed(2)}_${h.toFixed(2)}`;
    if (this.types.has(name)) return name;
    const fb = 0.08;
    const frame = merge([box(w, fb, 0.18, 0, h / 2 - fb / 2, 0.0), box(fb, h, 0.18, -w / 2 + fb / 2, 0, 0), box(fb, h, 0.18, w / 2 - fb / 2, 0, 0)]);
    const dw = w - fb * 2, dh = h - fb;
    const slab = [box(dw, dh, 0.05, 0, -fb / 2, 0.04)];
    for (const [px, py] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) slab.push(box(dw * 0.34, dh * (py > 0 ? 0.3 : 0.4), 0.02, px * dw * 0.22, py > 0 ? dh * 0.22 : -dh * 0.2, 0.07));
    const knob = merge([cyl(0.035, 0.035, 0.06, 12, dw / 2 - 0.1, -0.05, 0.1, null, Math.PI / 2), box(0.04, 0.16, 0.012, dw / 2 - 0.1, -0.05, 0.072)]);
    this.types.set(name, {
      name, unit: false, tint: false, value: 4, kg: 32, hp: 2, hang: 0.9, density: 0.6, sound: 'wood', dust: 0x8a4a32, chip: 0x8a3a2a,
      size: new THREE.Vector3(w, h, 0.2), parts: [{ geo: frame, mat: this.M.pvc }, { geo: merge(slab), mat: this.M.doorWood }, { geo: knob, mat: this.M.brass }],
    });
    return name;
  }

  gutter(len) {
    const name = `gutter_${len.toFixed(2)}`;
    if (this.types.has(name)) return name;
    const s = new THREE.Shape();
    s.moveTo(-0.07, 0.06); s.lineTo(-0.075, 0.0); s.quadraticCurveTo(-0.07, -0.07, 0, -0.07); s.quadraticCurveTo(0.07, -0.07, 0.075, 0); s.lineTo(0.08, 0.06);
    s.lineTo(0.07, 0.06); s.lineTo(0.065, 0); s.quadraticCurveTo(0.06, -0.06, 0, -0.06); s.quadraticCurveTo(-0.06, -0.06, -0.065, 0); s.lineTo(-0.06, 0.06); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -len / 2); g.rotateY(Math.PI / 2);
    this.types.set(name, {
      name, unit: false, value: 2, kg: 5, hp: 1, hang: 2, stiff: 0.25, density: 0.4, sound: 'metal', dust: 0xb4b9bd, chip: 0xcccccc,
      size: new THREE.Vector3(len, 0.14, 0.16), parts: [{ geo: g, mat: this.M.galvanized }],
    });
    return name;
  }

  column(h) {
    const name = `column_${h.toFixed(2)}`;
    if (this.types.has(name)) return name;
    const g = merge([box(0.24, h, 0.02, 0, 0, 0.11), box(0.24, h, 0.02, 0, 0, -0.11), box(0.02, h, 0.2, 0, 0, 0), box(0.4, 0.03, 0.4, 0, -h / 2 + 0.015, 0)]);
    this.types.set(name, {
      name, unit: false, value: 12, kg: 160, hp: 4, hang: 0.5, density: 3, sound: 'metal', dust: 0x2f6aa8, chip: 0x777777,
      size: new THREE.Vector3(0.24, h, 0.24), parts: [{ geo: g, mat: this.M.paintBlue }],
    });
    return name;
  }
}

const PROP_KG = { sofa: 45, fridge: 70, table: 25, bed: 55, kitchen: 85, shelf: 35, crate: 30, drum: 45, pallet: 160, tv: 28, aircon: 40, meter: 6, walllamp: 2, downpipe: 4 };

function avgVertexColor(g) {
  const c = g.attributes.color; if (!c) return 0x888888;
  let r = 0, gg = 0, b = 0; for (let i = 0; i < c.count; i++) { r += c.getX(i); gg += c.getY(i); b += c.getZ(i); }
  return new THREE.Color(r / c.count, gg / c.count, b / c.count).getHex();
}

// Hollow concrete block: outer shell with rectangular cores, chamfered edges and darkened cores (baked AO).
export function cmuGeometry(len) {
  const w = len, d = 0.2, h = 0.2, shell = 0.032, web = 0.028;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.closePath();
  const cores = len > 0.3 ? 2 : 1;
  const cw = (w - 2 * shell - (cores - 1) * web) / cores, cd = d - 2 * shell;
  for (let k = 0; k < cores; k++) {
    const x0 = -w / 2 + shell + k * (cw + web), r = 0.012;
    const hole = new THREE.Path();
    hole.moveTo(x0 + r, -cd / 2); hole.lineTo(x0 + cw - r, -cd / 2); hole.quadraticCurveTo(x0 + cw, -cd / 2, x0 + cw, -cd / 2 + r);
    hole.lineTo(x0 + cw, cd / 2 - r); hole.quadraticCurveTo(x0 + cw, cd / 2, x0 + cw - r, cd / 2);
    hole.lineTo(x0 + r, cd / 2); hole.quadraticCurveTo(x0, cd / 2, x0, cd / 2 - r);
    hole.lineTo(x0, -cd / 2 + r); hole.quadraticCurveTo(x0, -cd / 2, x0 + r, -cd / 2);
    s.holes.push(hole);
  }
  const bev = 0.005;
  const g = new THREE.ExtrudeGeometry(s, { depth: h - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 2 });
  g.rotateX(-Math.PI / 2); g.translate(0, -h / 2 + bev, 0);
  g.scale((w - 0.002) / (w + 2 * bev), 1, (d - 0.002) / (d + 2 * bev));
  // baked occlusion: faces inside the cores are darker, deeper = darker
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const inside = Math.abs(z) < cd / 2 + 0.002 && Math.abs(x) < w / 2 - shell + 0.002 && Math.abs(nrm.getY(i)) < 0.5;
    const v = inside ? 0.42 + 0.25 * (Math.abs(y) / (h / 2)) : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
