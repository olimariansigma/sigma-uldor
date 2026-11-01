// Potholes in the street that can be filled with cement. Patches take the cement's colour and dry over time.
import * as THREE from 'three';
import * as T from './textures.js';
import { SITE } from './site.js';

const ROAD_Y = 0.021;

export class Road {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.holes = [];
    this.holeTex = T.potholeTexture();
    this.patch = T.cementPatchTexture();
    this.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }

  defaultHoles() {
    const z0 = SITE.streetZ + 0.6;
    const spots = [[-26, 1.0, 0.9], [-14, 4.2, 1.1], [-5, 2.0, 0.8], [3, 4.6, 1.2], [12, 3.0, 1.0], [17.5, 5.0, 0.75], [24, 1.8, 1.15], [33, 4.0, 0.9], [42, 5.0, 1.0]];
    for (const [x, dz, r] of spots) this.addHole(x, z0 + dz, r);
  }

  onRoad(x, z) { return z > SITE.streetZ - 1.3 && z < SITE.streetZ + 7.3 && Math.abs(x) < 240; }

  addHole(x, z, r, filled = 0, color = null, dry = 1) {
    const hole = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ map: this.holeTex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3 }));
    hole.scale.set(r * 2.3, 1, r * 2.3); hole.rotation.y = Math.random() * 6;
    hole.position.set(x, ROAD_Y, z); hole.receiveShadow = true; hole.renderOrder = 1;
    const patchMat = new THREE.MeshStandardMaterial({ map: this.patch.map, normalMap: this.patch.normalMap, transparent: true, depthWrite: false, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -5 });
    const patch = new THREE.Mesh(this.geo, patchMat);
    patch.position.set(x, ROAD_Y + 0.004, z); patch.rotation.y = hole.rotation.y + 1.3; patch.receiveShadow = true; patch.renderOrder = 2;
    patch.visible = false;
    this.group.add(hole, patch);
    const need = Math.round(r * r * Math.PI * 60 / 5) * 5; // a thin patch of concrete
    const h = { x, z, r, need, filled: 0, col: new THREE.Color(0.7, 0.7, 0.7), dry: 1, hole, patch };
    this.holes.push(h);
    if (filled) this.fill(this.holes.length - 1, filled, color || new THREE.Color(0.7, 0.7, 0.7), dry);
    return this.holes.length - 1;
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

  refresh(h) {
    const f = Math.min(1, h.filled / h.need);
    h.patch.visible = f > 0;
    const s = h.r * 2.3 * (0.45 + 0.6 * f);
    h.patch.scale.set(s, 1, s);
    h.hole.material.opacity = 1 - f * 0.92;
    this.tint(h);
  }

  tint(h) {
    const wet = 1 - h.dry;
    h.patch.material.color.copy(h.col).multiplyScalar(1 - wet * 0.35);
    h.patch.material.roughness = 0.88 - wet * 0.7;
  }

  update(dt) {
    for (const h of this.holes) if (h.filled > 0 && h.dry < 1) { h.dry = Math.min(1, h.dry + dt / 40); this.tint(h); }
  }

  get repaired() { return this.holes.filter((h) => h.filled >= h.need).length; }

  serialize() { return this.holes.map((h) => [h.x, h.z, h.r, h.filled, h.col.r, h.col.g, h.col.b, h.dry].map((v) => Math.round(v * 1000) / 1000)); }
  restore(list) {
    for (const h of this.holes) { this.group.remove(h.hole, h.patch); h.hole.material.dispose(); h.patch.material.dispose(); }
    this.holes = [];
    for (const [x, z, r, filled, cr, cg, cb, dry] of list) this.addHole(x, z, r, filled, new THREE.Color(cr, cg, cb), dry);
  }
}
