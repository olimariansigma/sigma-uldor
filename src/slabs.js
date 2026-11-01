// Cement laid by hand with the trowel: a 1.2 m grid of concrete tiles on the ground. Each tile takes the colour of
// the cement it was laid with and dries from dark and wet to its final shade. Synced to clients and saved.
import * as THREE from 'three';
import * as T from './textures.js';

export const SLAB = 1.2;      // grid size (m)
export const SLAB_KG = 57;    // cement used per tile (simulation units, about 0.5 kg in game weight)
const MAX = 2000;
const DRY_TIME = 25;          // seconds to dry
const _m = new THREE.Matrix4(), _c = new THREE.Color();

export class Slabs {
  constructor(scene) {
    this.cells = new Map();
    const tex = T.concreteTextures([200, 198, 192], 21);
    const geo = new THREE.BoxGeometry(SLAB - 0.03, 0.07, SLAB - 0.03, 1, 1, 1);
    // bevel the top edges a little by pulling the top face in
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * 0.97); p.setZ(i, p.getZ(i) * 0.97); }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughness: 0.85 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    scene.add(this.mesh);
    this.list = [];
    this.timer = 0;
  }

  static key(ix, iz) { return ix + ',' + iz; }
  static cellOf(x, z) { return [Math.round(x / SLAB), Math.round(z / SLAB)]; }

  // lay (or re-lay) the tile at grid cell ix,iz; returns false when the yard is full
  set(ix, iz, y, color, dry = 0) {
    const k = Slabs.key(ix, iz);
    let c = this.cells.get(k);
    if (!c) {
      if (this.list.length >= MAX) return false;
      c = { ix, iz, y, col: new THREE.Color(), dry, idx: this.list.length };
      this.cells.set(k, c); this.list.push(c);
      this.mesh.count = this.list.length;
    }
    c.y = y; c.col.copy(color); c.dry = dry;
    _m.makeTranslation(ix * SLAB, y + 0.035, iz * SLAB);
    this.mesh.setMatrixAt(c.idx, _m); this.mesh.instanceMatrix.needsUpdate = true;
    this.tint(c);
    return true;
  }
  tint(c) {
    // wet cement is darker; it lightens as it dries
    _c.copy(c.col).multiplyScalar(0.55 + 0.45 * c.dry);
    this.mesh.setColorAt(c.idx, _c); this.mesh.instanceColor.needsUpdate = true;
  }
  has(ix, iz) { return this.cells.has(Slabs.key(ix, iz)); }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    for (const c of this.list) if (c.dry < 1) { c.dry = Math.min(1, c.dry + 0.5 / DRY_TIME); this.tint(c); }
  }

  clear() { this.cells.clear(); this.list = []; this.mesh.count = 0; }
  serialize() { return this.list.map((c) => [c.ix, c.iz, Math.round(c.y * 100) / 100, +c.col.r.toFixed(3), +c.col.g.toFixed(3), +c.col.b.toFixed(3), Math.round(c.dry * 100) / 100]); }
  restore(arr) {
    this.clear();
    for (const [ix, iz, y, r, g, b, dry] of arr || []) this.set(ix, iz, y, _c.setRGB(r, g, b).clone(), dry);
  }
}
