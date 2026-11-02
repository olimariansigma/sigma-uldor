// Building with pressed blocks. The trowel (with cement on it) puts ONE splash of mortar where you click on the
// slab, a wall or any block. With the build tool you lay a carried block: a ghost shows where it goes, snapped to
// a 0.3 m grid and onto the surface you aim at (on top of a course, or against the side of a block); R turns it.
// A block laid over mortar sticks: it becomes a fixed wall block (part of the support graph, so walls can be
// smashed and fall like any other). Without mortar it is only stacked loose.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { INTACT, LOOSE } from './demolition.js';
import { SITE } from './site.js';

export const MORTAR_KG = 60;         // cement per splash (the trowel holds 1150)
const MAX = 400, G = 0.3, REACH = 5.5, H = 0.6;
const V = () => new THREE.Vector3();
const hash = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };

export class Builder {
  constructor(game) {
    this.g = game; this.splashes = []; this.rot = 0;
    // a splash: a flattened, lumpy dollop
    const geo = new THREE.SphereGeometry(0.21, 14, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) - 0.5) * 0.35;
      p.setXYZ(i, x * k, Math.max(-0.01, y * 0.32 * k), z * k);
    }
    geo.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }), MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0; this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    game.scene.add(this.mesh);
    // ghosts: the block you are about to lay, and where a splash would land
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: 0x5cf2a8, transparent: true, opacity: 0.32, depthWrite: false }));
    this.ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(this.ghost.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));
    this.ghost.visible = false; this.ghost.renderOrder = 4; game.scene.add(this.ghost);
    this.splashGhost = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    this.splashGhost.visible = false; this.splashGhost.renderOrder = 4; game.scene.add(this.splashGhost);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._c = new THREE.Color();
  }

  // what the crosshair is on, with the surface normal: { point, normal, piece, slab }
  aim() {
    const g = this.g, cam = g.camera, W = g.physics.world;
    const dir = cam.getWorldDirection(V()), o = cam.position;
    const hit = W.castRayAndGetNormal(new RAPIER.Ray(o, dir), g.cam.dist + REACH + 2, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.player.collider);
    if (!hit) return null;
    const point = o.clone().addScaledVector(dir, hit.timeOfImpact);
    if (point.distanceTo(g.player.pos.clone().setY(g.player.pos.y + 1.1)) > REACH) return null;
    const body = hit.collider.parent();
    if (body && body.isKinematic() && !g.demo.pieceFromCollider(hit.collider)) return null; // a machine
    const piece = g.demo.pieceFromCollider(hit.collider) || null;
    const n = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
    const P = SITE.buildPlot;
    const slab = !piece && Math.abs(point.y - P.top) < 0.06 && Math.abs(point.x - P.x) < P.w / 2 && Math.abs(point.z - P.z) < P.d / 2;
    return { point, normal: n, piece, slab, ground: !piece && !slab && point.y < 0.12 };
  }
  // mortar goes on blocks and on the slab (on bare ground the trowel lays paving tiles instead)
  mortarTarget(hit) { return hit && (hit.slab || (hit.piece && hit.piece.state !== 4)) ? hit : null; }

  extents(rot) { return rot ? { x: 0.6, z: 1.2 } : { x: 1.2, z: 0.6 }; }
  snap(v) { return Math.round(v / G) * G; }
  // where a block would go for this aim: on top of the surface, or against the side of the block you aim at
  ghostPose(hit, rot) {
    if (!hit) return null;
    const e = this.extents(rot), n = hit.normal, p = hit.point, q = hit.piece;
    if (n.y > 0.6) {
      const top = q ? this.g.demo.aabb(q).max.y : p.y;
      return new THREE.Vector3(this.snap(p.x), top + H / 2, this.snap(p.z));
    }
    if (!q || Math.abs(n.y) > 0.4) return null;
    const A = this.g.demo.aabb(q);
    if (Math.abs(n.x) >= Math.abs(n.z)) return new THREE.Vector3(n.x > 0 ? A.max.x + e.x / 2 : A.min.x - e.x / 2, A.min.y + H / 2, this.snap(p.z));
    return new THREE.Vector3(this.snap(p.x), A.min.y + H / 2, n.z > 0 ? A.max.z + e.z / 2 : A.min.z - e.z / 2);
  }
  quatFor(rot) { return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot ? Math.PI / 2 : 0); }
  // nothing solid in the way (the ground may touch the underside)
  valid(c, rot) {
    const g = this.g, W = g.physics.world, e = this.extents(rot);
    let ok = true;
    const terrain = g.env.terrainCollider;
    W.intersectionsWithShape(c, this.quatFor(rot), new RAPIER.Cuboid(e.x / 2 - 0.05, H / 2 - 0.05, e.z / 2 - 0.05), (col) => {
      if (terrain && col.handle === terrain.handle) return true;
      if (col.isSensor && col.isSensor()) return true;
      ok = false; return false;
    });
    return ok && c.y - H / 2 > -0.2;
  }
  // splashes touching a block placed here (under it or against its sides)
  splashesFor(c, rot) {
    const e = this.extents(rot), mx = e.x / 2 + 0.22, mz = e.z / 2 + 0.22, my = H / 2 + 0.2;
    return this.splashes.filter((s) => Math.abs(s.pos.x - c.x) < mx && Math.abs(s.pos.z - c.z) < mz && Math.abs(s.pos.y - c.y) < my);
  }

  // ---- host
  addSplash(point, normal, color, piece = -1) {
    if (this.splashes.length >= MAX) this.splashes.shift();
    this.splashes.push({ pos: point.clone().addScaledVector(normal, 0.01), n: normal.clone().normalize(), col: color.clone(), piece, age: 0 });
    this.redraw();
  }
  take(list) { if (!list.length) return; this.splashes = this.splashes.filter((s) => !list.includes(s)); this.redraw(); }
  // a splash on a block goes with the block when it is knocked out of the wall
  tidy() {
    const before = this.splashes.length, demo = this.g.demo;
    this.splashes = this.splashes.filter((s) => s.piece < 0 || (demo.pieces[s.piece] && demo.pieces[s.piece].state === INTACT));
    if (this.splashes.length !== before) { this.redraw(); return true; }
    return false;
  }

  pack() { return this.splashes.map((s) => [...s.pos.toArray(), ...s.n.toArray(), s.col.r, s.col.g, s.col.b, s.piece, Math.round(s.age)].map((v) => Math.round(v * 1000) / 1000)); }
  restore(arr) {
    this.splashes = (arr || []).map((a) => ({ pos: new THREE.Vector3(a[0], a[1], a[2]), n: new THREE.Vector3(a[3], a[4], a[5]), col: new THREE.Color(a[6], a[7], a[8]), piece: a[9], age: a[10] || 60 }));
    this.redraw();
  }

  redraw() {
    const up = new THREE.Vector3(0, 1, 0);
    this.splashes.forEach((s, i) => {
      this._q.setFromUnitVectors(up, s.n);
      const k = 0.9 + hash(s.pos.x, s.pos.y, s.pos.z) * 0.3;
      this._s.set(k, 1, k);
      this._m.compose(s.pos, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
      // fresh mortar is dark and wet, it dries to the cement's colour
      const wet = Math.max(0, 1 - s.age / 40);
      this.mesh.setColorAt(i, this._c.copy(s.col).multiplyScalar(1.15 - wet * 0.55));
    });
    this.mesh.count = this.splashes.length;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let wet = false;
    for (const s of this.splashes) if (s.age < 40) { s.age += dt; wet = true; }
    this.dryT = (this.dryT || 0) - dt;
    if (wet && this.dryT <= 0) { this.dryT = 1; this.redraw(); }
  }

  // ---- the local player's ghosts
  showGhost(c, rot, ok) {
    this.ghost.visible = !!c;
    if (!c) return;
    this.ghost.position.copy(c); this.ghost.quaternion.copy(this.quatFor(rot));
    this.ghost.material.color.set(ok ? 0x5cf2a8 : 0xff5040);
  }
  showSplashGhost(hit, color) {
    this.splashGhost.visible = !!hit;
    if (!hit) return;
    this.splashGhost.position.copy(hit.point).addScaledVector(hit.normal, 0.02);
    this.splashGhost.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal);
    this.splashGhost.material.color.copy(color);
  }
  hideGhosts() { this.ghost.visible = false; this.splashGhost.visible = false; }
}
