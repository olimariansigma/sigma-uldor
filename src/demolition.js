// Manages every destructible piece of the current building: rendering (instanced),
// physics (fixed collider while intact, dynamic body once loose), structural support and damage.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const INTACT = 0, LOOSE = 1, HELD = 2, CARRIED = 3, GONE = 4;

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Demolition {
  constructor(scene, physics, types, fx, audio) {
    this.scene = scene; this.physics = physics; this.world = physics.world; this.types = types; this.fx = fx; this.audio = audio;
    this.pieces = [];
    this.meshes = new Map(); // typeName -> [InstancedMesh per part]
    this.byCollider = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.dirty = false;
    this.groundY = 0;
    this.crushed = 0; this.lost = 0; this.total = 0;
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.onCrushable = null;
  }

  // ---------- construction ----------
  build(specs, groundY) {
    this.clear();
    this.groundY = groundY;
    const counts = new Map();
    for (const s of specs) counts.set(s.type, (counts.get(s.type) || 0) + 1);
    for (const [name, n] of counts) {
      const t = this.types.get(name);
      const parts = t.parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geo, p.mat, n);
        im.castShadow = !p.noShadow; im.receiveShadow = !p.noShadow;
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (p.mat === this.types.M.glass) im.renderOrder = 2;
        this.group.add(im);
        return im;
      });
      if (t.tint) for (const im of parts) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      this.meshes.set(name, { parts, next: 0 });
    }
    const rnd = mulberry32(specs.length);
    for (const s of specs) {
      const t = this.types.get(s.type);
      const entry = this.meshes.get(s.type);
      const size = t.unit ? s.size.clone() : t.size.clone();
      const p = {
        id: this.pieces.length, type: t, size, pos: s.pos.clone(), quat: s.quat ? s.quat.clone() : new THREE.Quaternion(),
        state: INTACT, hp: t.hp, idx: entry.next++, parts: entry.parts, collider: null, body: null,
        up: [], down: [], side: [], tint: 1, held: null,
      };
      if (t.tint) {
        p.tint = 0.86 + rnd() * 0.22;
        for (const im of p.parts) im.setColorAt(p.idx, _c.setScalar(p.tint));
      }
      this.pieces.push(p);
      this.writeMatrix(p);
      p.collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(size.x / 2 - 0.004, size.y / 2 - 0.004, size.z / 2 - 0.004)
          .setTranslation(p.pos.x, p.pos.y, p.pos.z).setRotation(p.quat).setFriction(0.9),
        this.staticBody);
      this.byCollider.set(p.collider.handle, p);
    }
    for (const { parts } of this.meshes.values()) for (const im of parts) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.total = this.pieces.length;
    this.crushed = 0; this.lost = 0;
    this.computeAdjacency();
    this.recompute();
  }

  clear() {
    for (const p of this.pieces) {
      if (p.body) this.world.removeRigidBody(p.body);
      else if (p.collider) this.world.removeCollider(p.collider, false);
    }
    this.pieces = [];
    this.byCollider.clear();
    for (const { parts } of this.meshes.values()) for (const im of parts) { this.group.remove(im); im.dispose(); }
    this.meshes.clear();
  }

  writeMatrix(p, scale = 1) {
    _s.copy(p.type.unit ? p.size : _s.set(1, 1, 1)).multiplyScalar(scale);
    _m.compose(p.pos, p.quat, _s);
    for (const im of p.parts) im.setMatrixAt(p.idx, _m);
  }
  hide(p) { for (const im of p.parts) { im.setMatrixAt(p.idx, ZERO); im.instanceMatrix.needsUpdate = true; } }

  aabb(p) {
    const hx = p.size.x / 2, hy = p.size.y / 2, hz = p.size.z / 2;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) {
      _p.set(i & 1 ? hx : -hx, i & 2 ? hy : -hy, i & 4 ? hz : -hz).applyQuaternion(p.quat).add(p.pos);
      min.min(_p); max.max(_p);
    }
    return { min, max };
  }

  computeAdjacency() {
    const eps = 0.03, cell = 1.5;
    const grid = new Map();
    const boxes = this.pieces.map((p) => this.aabb(p));
    const key = (x, y, z) => x + ',' + y + ',' + z;
    boxes.forEach((b, i) => {
      for (let x = Math.floor(b.min.x / cell); x <= Math.floor(b.max.x / cell); x++)
        for (let y = Math.floor(b.min.y / cell); y <= Math.floor(b.max.y / cell); y++)
          for (let z = Math.floor(b.min.z / cell); z <= Math.floor(b.max.z / cell); z++) {
            const k = key(x, y, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
          }
    });
    const seen = new Set();
    for (const list of grid.values()) {
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        const i = list[a], j = list[b];
        const pk = i < j ? i * 100000 + j : j * 100000 + i;
        if (seen.has(pk)) continue; seen.add(pk);
        const A = boxes[i], B = boxes[j];
        if (A.min.x > B.max.x + eps || B.min.x > A.max.x + eps || A.min.y > B.max.y + eps || B.min.y > A.max.y + eps || A.min.z > B.max.z + eps || B.min.z > A.max.z + eps) continue;
        const pi = this.pieces[i], pj = this.pieces[j];
        if (B.min.y >= A.max.y - 0.06) { pi.up.push(pj); pj.down.push(pi); }
        else if (A.min.y >= B.max.y - 0.06) { pj.up.push(pi); pi.down.push(pj); }
        else { pi.side.push(pj); pj.side.push(pi); }
      }
    }
    this.boxes = boxes;
    this.centers = new Float32Array(this.pieces.length * 2);
    this.pieces.forEach((p, i) => { this.centers[i * 2] = (boxes[i].min.x + boxes[i].max.x) / 2; this.centers[i * 2 + 1] = (boxes[i].min.z + boxes[i].max.z) / 2; });
  }

  // Dijkstra over the support graph. Resting on a supported piece costs nothing; spanning sideways or hanging
  // costs metres / (how far that piece type can cantilever). Anything whose total exceeds 1 falls.
  recompute() {
    const n = this.pieces.length;
    const dist = new Float64Array(n).fill(1e9);
    const heap = new MinHeap();
    const C = this.centers;
    for (const p of this.pieces) {
      if (p.state !== INTACT) continue;
      if (this.boxes[p.id].min.y <= this.groundY + 0.06) { dist[p.id] = 0; heap.push(p.id, 0); }
    }
    while (heap.size) {
      const [id, d] = heap.pop();
      if (d > dist[id]) continue;
      const p = this.pieces[id];
      // d is the fraction (0..1) of a piece's own cantilever capacity that is used up
      const relax = (q, metres) => {
        if (q.state !== INTACT) return;
        const nd = d + metres / q.type.hang;
        if (nd < dist[q.id] && nd <= 1) { dist[q.id] = nd; heap.push(q.id, nd); }
      };
      const span = (q) => Math.hypot(C[q.id * 2] - C[id * 2], C[q.id * 2 + 1] - C[id * 2 + 1]) * Math.max(p.type.stiff || 1, q.type.stiff || 1);
      for (const q of p.up) relax(q, 0);
      for (const q of p.side) relax(q, span(q) + 0.05);
      for (const q of p.down) relax(q, span(q) + 0.3);
    }
    let fell = 0; const at = new THREE.Vector3();
    for (const p of this.pieces) {
      if (p.state === INTACT && dist[p.id] > 1) {
        this.detach(p, null, true);
        at.add(p.pos); fell++;
      }
    }
    if (fell > 5 && this.audio) this.audio.collapse(Math.min(1, fell / 50), at.divideScalar(fell));
    if (fell > 5 && this.fx) this.fx.dust(at, 0xa08a78, Math.min(14, 3 + fell / 6), 2.5, { size: 1.6, life: 3.5, alpha: 0.4 });
    return fell;
  }
  centerOf() { return null; }

  // ---------- state changes ----------
  detach(p, impulse = null, collapse = false) {
    if (p.state !== INTACT) return;
    this.byCollider.delete(p.collider.handle);
    this.world.removeCollider(p.collider, false);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(p.pos.x, p.pos.y, p.pos.z).setRotation(p.quat)
        .setLinearDamping(0.05).setAngularDamping(0.25).setCanSleep(true));
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(p.size.x / 2 - 0.006, p.size.y / 2 - 0.006, p.size.z / 2 - 0.006)
        .setDensity(p.type.density).setFriction(0.85).setRestitution(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(14 * p.size.x * p.size.y * p.size.z * p.type.density * 30 + 4),
      body);
    p.body = body; p.collider = col; p.state = LOOSE;
    this.byCollider.set(col.handle, p);
    if (impulse) body.applyImpulse(impulse, true);
    if (collapse) {
      // tiny nudge so collapsing stacks don't stay perfectly balanced
      const m = body.mass();
      body.applyImpulse({ x: (Math.random() - 0.5) * m * 0.6, y: 0, z: (Math.random() - 0.5) * m * 0.6 }, true);
      body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 0.05, y: 0, z: (Math.random() - 0.5) * m * 0.05 }, true);
    }
    if (p.type.tint) for (const im of p.parts) { im.setColorAt(p.idx, _c.setScalar(p.tint)); im.instanceColor.needsUpdate = true; }
    this.dirty = true;
  }

  damage(p, amount, point, dir, force = 4) {
    if (p.state === INTACT) {
      p.hp -= amount;
      this.fx.chips(point, dir, p.type.chip, 5);
      this.fx.dust(point, p.type.dust, 2, 0.6);
      if (p.hp <= 0) {
        const m = p.size.x * p.size.y * p.size.z * p.type.density;
        this.detach(p, { x: dir.x * force * m, y: Math.max(0.2, dir.y) * force * m * 0.5, z: dir.z * force * m });
        if (p.type.sound === 'glass') { this.fx.glass(p.pos); this.audio && this.audio.glass(p.pos); }
        return true;
      }
      if (p.type.tint) {
        const f = 0.55 + 0.45 * (p.hp / p.type.hp);
        for (const im of p.parts) { im.setColorAt(p.idx, _c.setScalar(p.tint * f)); im.instanceColor.needsUpdate = true; }
      }
      return false;
    } else if (p.state === LOOSE) {
      const m = p.body.mass();
      p.body.applyImpulseAtPoint({ x: dir.x * force * m * 0.6, y: (dir.y + 0.4) * force * m * 0.6, z: dir.z * force * m * 0.6 }, point, true);
      this.fx.dust(point, p.type.dust, 1, 0.4);
      return true;
    }
    return false;
  }

  // Excavator / splash: break every intact piece overlapping a sphere.
  breakSphere(center, radius, push, maxCount = 12) {
    const shape = new RAPIER.Ball(radius);
    const hits = [];
    this.world.intersectionsWithShape(center, { x: 0, y: 0, z: 0, w: 1 }, shape, (c) => {
      const p = this.byCollider.get(c.handle);
      if (p && p.state === INTACT) hits.push(p);
      return hits.length < maxCount;
    }, RAPIER.QueryFilterFlags.ONLY_FIXED);
    for (const p of hits) {
      const m = p.size.x * p.size.y * p.size.z * p.type.density;
      this.detach(p, push ? { x: push.x * m, y: push.y * m, z: push.z * m } : null);
      if (p.type.sound === 'glass') { this.fx.glass(p.pos); this.audio && this.audio.glass(p.pos); }
    }
    if (hits.length) {
      this.fx.dust(center, hits[0].type.dust, 3 + hits.length, 1.2);
      this.audio && this.audio.impact(hits[0].type.sound, Math.min(1, 0.4 + hits.length * 0.1), center);
    }
    return hits;
  }

  piecesInSphere(center, radius, states = [LOOSE]) {
    const out = [];
    const r2 = radius * radius;
    for (const p of this.pieces) {
      if (!states.includes(p.state)) continue;
      const pos = p.state === INTACT ? p.pos : p.body.translation();
      const dx = pos.x - center.x, dy = pos.y - center.y, dz = pos.z - center.z;
      if (dx * dx + dy * dy + dz * dz < r2) out.push(p);
    }
    return out;
  }

  pieceFromCollider(c) { return this.byCollider.get(c.handle); }

  // Grapple: piece follows a kinematic target
  hold(p) {
    if (p.state === INTACT) this.detach(p);
    if (p.state !== LOOSE) return false;
    p.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    p.state = HELD;
    return true;
  }
  release(p, vel) {
    if (p.state !== HELD) return;
    p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    if (vel) p.body.setLinvel(vel, true);
    p.state = LOOSE;
  }

  // Player carrying: body is disabled while in the arms
  carry(p) {
    if (p.state !== LOOSE) return false;
    p.body.setEnabled(false);
    p.state = CARRIED;
    return true;
  }
  throwPiece(p, pos, vel, spin) {
    if (p.state !== CARRIED) return;
    p.body.setTranslation(pos, true);
    p.body.setLinvel(vel, true);
    p.body.setAngvel(spin || { x: 0, y: 0, z: 0 }, true);
    p.body.setEnabled(true);
    p.body.enableCcd(true);
    p.state = LOOSE;
  }
  placeCarried(p, pos, quat, scale) {
    p.pos.copy(pos); p.quat.copy(quat);
    this.writeMatrix(p, scale);
    for (const im of p.parts) im.instanceMatrix.needsUpdate = true;
  }

  consume(p) {
    if (p.state === GONE || p.state === INTACT) return;
    this.byCollider.delete(p.collider.handle);
    this.world.removeRigidBody(p.body);
    p.body = null; p.collider = null;
    p.state = GONE;
    this.hide(p);
    this.crushed++;
  }

  // ---------- per frame ----------
  update() {
    if (this.dirty) { this.dirty = false; this.recompute(); }
    const touched = new Set();
    for (const p of this.pieces) {
      if (p.state !== LOOSE && p.state !== HELD) continue;
      const b = p.body;
      if (b.isSleeping()) continue;
      const t = b.translation(), r = b.rotation();
      if (t.y < -15) {
        this.byCollider.delete(p.collider.handle);
        this.world.removeRigidBody(b); p.body = null; p.collider = null; p.state = GONE; this.hide(p); this.lost++;
        continue;
      }
      p.pos.set(t.x, t.y, t.z); p.quat.set(r.x, r.y, r.z, r.w);
      this.writeMatrix(p);
      touched.add(p.parts);
    }
    for (const parts of touched) for (const im of parts) im.instanceMatrix.needsUpdate = true;
  }

  get progress() { return this.total ? (this.crushed + this.lost) / this.total : 0; }
  remaining() { return this.pieces.filter((p) => p.state !== GONE); }
}

class MinHeap {
  constructor() { this.ids = []; this.ks = []; }
  get size() { return this.ids.length; }
  push(id, k) {
    const a = this.ids, b = this.ks; a.push(id); b.push(k);
    let i = a.length - 1;
    while (i > 0) { const pa = (i - 1) >> 1; if (b[pa] <= b[i]) break; [a[pa], a[i]] = [a[i], a[pa]]; [b[pa], b[i]] = [b[i], b[pa]]; i = pa; }
  }
  pop() {
    const a = this.ids, b = this.ks; const top = [a[0], b[0]];
    const la = a.pop(), lb = b.pop();
    if (a.length) {
      a[0] = la; b[0] = lb; let i = 0;
      for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && b[l] < b[m]) m = l; if (r < a.length && b[r] < b[m]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; [b[m], b[i]] = [b[i], b[m]]; i = m; }
    }
    return top;
  }
}

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
