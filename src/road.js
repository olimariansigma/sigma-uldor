// Potholes in the street. Repairs work like the real thing: the hot mix goes in as a loose, stony heap standing
// proud of the road (it steams while hot), then every pass of the roller (or tamping by hand) presses it down
// until it is flush, dense and smooth. Patches take the mix's colour and cool / cure over time.
import * as THREE from 'three';
import * as T from './textures.js';
import { SITE } from './site.js';

const ROAD_Y = 0.021;
const _pc = new THREE.Color();

export class Road {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.holes = [];
    this.holeTex = T.potholeTexture();
    this.mix = T.asphaltMixTexture();
    this.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }

  defaultHoles() {
    const z0 = SITE.streetZ + 0.6;
    const spots = [[-26, 1.0, 0.9], [-14, 4.2, 1.1], [-5, 2.0, 0.8], [3, 4.6, 1.2], [12, 3.0, 1.0], [17.5, 5.0, 0.75], [24, 1.8, 1.15], [33, 4.0, 0.9], [42, 5.0, 1.0]];
    for (const [x, dz, r] of spots) this.addHole(x, z0 + dz, r);
  }

  onRoad(x, z) { return z > SITE.streetZ - 1.3 && z < SITE.streetZ + 7.3 && Math.abs(x) < 240; }

  addHole(x, z, r, filled = 0, color = null, dry = 1, comp = 0) {
    const hole = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ map: this.holeTex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3 }));
    hole.scale.set(r * 2.3, 1, r * 2.3); hole.rotation.y = Math.random() * 6;
    hole.position.set(x, ROAD_Y, z); hole.receiveShadow = true; hole.renderOrder = 1;
    const patchMat = new THREE.MeshStandardMaterial({ map: this.mix.map, normalMap: this.mix.normalMap, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 });
    const patch = new THREE.Mesh(this.moundGeometry(), patchMat);
    patch.position.set(x, ROAD_Y, z); patch.rotation.y = hole.rotation.y + 1.3; patch.receiveShadow = true; patch.castShadow = true; patch.renderOrder = 2;
    patch.visible = false;
    this.group.add(hole, patch);
    const need = Math.round(r * r * Math.PI * 60 / 5) * 5; // a thin patch of concrete
    const h = { x, z, r, need, filled: 0, comp, col: new THREE.Color(0.7, 0.7, 0.7), dry: 1, hole, patch, paint: new THREE.Color(1, 1, 1), paintAmt: 0 };
    this.holes.push(h);
    if (filled) this.fill(this.holes.length - 1, filled, color || new THREE.Color(0.7, 0.7, 0.7), dry);
    return this.holes.length - 1;
  }

  // polar grid (rings x segments) with a ragged outline and per-vertex lumps; shaped in refresh()
  moundGeometry() {
    const RINGS = 9, SEG = 40, pos = [], uv = [], idx = [], meta = [];
    const edge = []; for (let k = 0; k < SEG; k++) edge.push(0.9 + Math.random() * 0.2);
    pos.push(0, 0, 0); uv.push(0, 0); meta.push(0, 0, Math.random());
    for (let r = 1; r <= RINGS; r++) for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2, t = r / RINGS, e = 1 + (edge[k] - 1) * t;
      pos.push(Math.cos(a) * t * e, 0, Math.sin(a) * t * e); uv.push(0, 0); meta.push(t, a, Math.random());
    }
    for (let k = 0; k < SEG; k++) idx.push(0, 1 + ((k + 1) % SEG), 1 + k);
    for (let r = 1; r < RINGS; r++) for (let k = 0; k < SEG; k++) {
      const a = 1 + (r - 1) * SEG + k, b = 1 + (r - 1) * SEG + ((k + 1) % SEG), c = a + SEG, d = b + SEG;
      idx.push(a, b, d, a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.userData.meta = meta; g.userData.base = pos.slice();
    return g;
  }

  nearest(pos, maxDist = 2.2, needUnfilled = true) {
    let best = -1, bd = maxDist;
    this.holes.forEach((h, i) => {
      if (needUnfilled && h.filled >= h.need) return;
      const d = Math.hypot(pos.x - h.x, pos.z - h.z) - h.r;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  // returns kg actually used
  fill(i, kg, color, dry = 0) {
    const h = this.holes[i];
    if (!h) return 0;
    const used = Math.min(kg, h.need - h.filled);
    if (used <= 0) return 0;
    const f0 = h.filled;
    h.filled += used;
    // mass-weighted colour of everything poured into this hole
    h.col.lerp(color, f0 > 0 ? used / h.filled : 1);
    h.dry = dry;
    this.refresh(h);
    return used;
  }

  // shape the patch: a loose heap that grows as mix goes in, pressed flat and smooth as it is compacted
  refresh(h) {
    const f = Math.min(1, h.filled / h.need), c = h.comp;
    h.patch.visible = f > 0;
    const R = h.r * 1.12 * (0.5 + 0.5 * f);
    const H = (0.025 + 0.085 * f) * Math.pow(1 - c, 1.2) + 0.004;   // heap height above the road
    const L = 0.03 * Math.pow(1 - c, 1.6);                           // lumps of loose mix
    const P = 2 + c * 8;                                              // pressed: flat top, sharp edge
    const g = h.patch.geometry, pos = g.attributes.position, uv = g.attributes.uv, meta = g.userData.meta, base = g.userData.base;
    for (let i = 0; i < pos.count; i++) {
      const t = meta[i * 3], lump = meta[i * 3 + 2];
      const prof = Math.pow(Math.max(0, 1 - Math.pow(t, P)), 0.6);
      const y = 0.003 + (H - 0.003) * prof + L * (lump - 0.4) * prof;
      const x = base[i * 3] * R, z = base[i * 3 + 2] * R;
      pos.setXYZ(i, x, Math.max(0.002, y), z);
      uv.setXY(i, x * 0.9, z * 0.9);
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
    g.computeVertexNormals(); g.computeBoundingSphere();
    h.hole.material.opacity = 1 - f * 0.95;
    this.tint(h);
  }

  tint(h) {
    const hot = 1 - h.dry;
    // hot mix is dark and glossy; rolled mix closes up (smoother, slightly darker), cured mix is matt
    h.patch.material.color.copy(h.col).multiplyScalar(1.6 * (1 - hot * 0.5) * (1 - h.comp * 0.15));
    h.patch.material.roughness = Math.min(0.95, 0.9 - hot * 0.55 - h.comp * 0.12);
    // road paint from the painting truck: a satin coat over the patch
    if (h.paintAmt > 0) { h.patch.material.color.lerp(_pc.copy(h.paint).multiplyScalar(1.8), h.paintAmt); h.patch.material.roughness += (0.45 - h.patch.material.roughness) * h.paintAmt; }
    const ns = 1.8 - h.comp * 1.5;
    h.patch.material.normalScale.set(ns, ns);
  }

  update(dt, fx) {
    for (const h of this.holes) {
      if (!(h.filled > 0)) continue;
      if (h.dry < 1) { h.dry = Math.min(1, h.dry + dt / 60); this.tint(h); }
      // steam off the hot mix
      if (fx && h.dry < 0.75 && Math.random() < dt * (1 - h.dry) * 6) {
        const a = Math.random() * 6.28, d = Math.random() * h.r * 0.8;
        fx.dust(new THREE.Vector3(h.x + Math.cos(a) * d, ROAD_Y + 0.1, h.z + Math.sin(a) * d), 0xf2f2f0, 1, 0.3, { alpha: 0.16 * (1 - h.dry), size: 0.55, life: 2.8, speed: 0.55 });
      }
    }
  }
  // hand tamping: presses the heap part of the way (the roller is needed for a perfect finish)
  tamp(i) {
    const h = this.holes[i];
    if (!h || h.filled <= 0 || h.comp >= 0.6) return false;
    h.comp = Math.min(0.6, h.comp + 0.08);
    this.refresh(h);
    return true;
  }

  get repaired() { return this.holes.filter((h) => h.filled >= h.need).length; }
  get compacted() { return this.holes.filter((h) => h.filled >= h.need && h.comp >= 1).length; }

  // spray paint onto a repaired patch (amount 0..1 builds up); returns true when it changed
  paint(h, color, amt) {
    if (h.filled < h.need) return false;
    if (h.paintAmt > 0.02 && h.paint.getHex() !== color.getHex()) { h.paint.lerp(color, Math.min(1, amt * 2)); if (Math.abs(h.paint.r - color.r) + Math.abs(h.paint.g - color.g) + Math.abs(h.paint.b - color.b) < 0.03) h.paint.copy(color); }
    else h.paint.copy(color);
    const before = h.paintAmt; h.paintAmt = Math.min(1, h.paintAmt + amt);
    this.tint(h);
    return h.paintAmt !== before || amt > 0;
  }
  serialize() { return this.holes.map((h) => [h.x, h.z, h.r, h.filled, h.col.r, h.col.g, h.col.b, h.dry, h.comp, h.paint.r, h.paint.g, h.paint.b, h.paintAmt].map((v) => Math.round(v * 1000) / 1000)); }
  restore(list) {
    for (const h of this.holes) { this.group.remove(h.hole, h.patch); h.hole.material.dispose(); h.patch.material.dispose(); h.patch.geometry.dispose(); }
    this.holes = [];
    for (const [x, z, r, filled, cr, cg, cb, dry, comp = 0, pr = 1, pg = 1, pb = 1, pa = 0] of list) {
      this.addHole(x, z, r, filled, new THREE.Color(cr, cg, cb), dry, comp);
      const h = this.holes[this.holes.length - 1]; h.paint.setRGB(pr, pg, pb); h.paintAmt = pa; this.tint(h);
    }
  }
}
