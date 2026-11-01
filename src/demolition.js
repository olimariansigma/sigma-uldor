// Every destructible piece of every building: instanced rendering, physics, structural support, damage,
// network snapshots and save-game serialisation.
//
// authority = true  (solo / host): intact pieces are fixed colliders, loose ones are dynamic rigid bodies.
// authority = false (multiplayer client): pieces mirror the host; loose ones are kinematic bodies that are
//                   interpolated toward the transforms the host sends, so the local player still collides.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const INTACT = 0, LOOSE = 1, HELD = 2, CARRIED = 3, GONE = 4;

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);

export class Demolition {
  constructor(scene, physics, types, sfx, authority = true) {
    this.scene = scene; this.physics = physics; this.world = physics.world; this.types = types;
    this.sfx = sfx; this.authority = authority;
    this.pieces = [];
    this.buildings = [];
    this.byCollider = new Map();
    this.group = new THREE.Group(); scene.add(this.group);
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.dirty = new Set();
    this.boundsDirty = new Set(); this.boundsT = 0;
    this.changes = [];         // [id, state, holder] since last network flush (authority)
    this.rr = 0;               // round-robin cursor for snapshots
  }

  // ---------------------------------------------------------------- buildings
  // scale: buildings are authored at 1:1 and built bigger; every non-unit piece (blocks, windows, props) is
  // scaled with them, weight follows volume and big blocks are tougher
  addBuilding(def, plot, specs, groundY, scale = 1) {
    const b = { id: this.buildings.length, def, plot, start: this.pieces.length, count: specs.length, meshes: [], groundY, removed: false, scale };
    const hpMul = scale > 1 ? 2 : 1;
    this.buildings.push(b);
    const counts = new Map();
    for (const s of specs) counts.set(s.type, (counts.get(s.type) || 0) + 1);
    const entries = new Map();
    for (const [name, n] of counts) {
      const t = this.types.get(name);
      const parts = t.parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geo, p.mat, n);
        im.castShadow = !p.noShadow; im.receiveShadow = !p.noShadow;
        // culled as a batch with a bounding sphere we keep up to date (updateBounds), so buildings that are
        // off screen or outside the shadow camera cost nothing
        im.frustumCulled = true; im.userData.pcs = [];
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (p.mat === this.types.M.glass) im.renderOrder = 2;
        this.group.add(im); b.meshes.push(im);
        return im;
      });
      if (t.tint) for (const im of parts) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      entries.set(name, { parts, next: 0 });
    }
    for (const s of specs) {
      const t = this.types.get(s.type);
      const entry = entries.get(s.type);
      const k = t.unit ? 1 : scale;
      const size = t.unit ? s.size.clone() : t.size.clone().multiplyScalar(k);
      const color = s.color ? s.color.clone() : null;
      const kg = t.kg ? Math.round(t.kg * k * k * k) : Math.max(1, Math.round(size.x * size.y * size.z * (t.kgm3 || 1000)));
      const p = {
        id: this.pieces.length, b: b.id, type: t, size, k, pos: s.pos.clone(), quat: s.quat ? s.quat.clone() : new THREE.Quaternion(),
        color, kg, state: INTACT, hp: t.hp * hpMul, maxHp: t.hp * hpMul, idx: entry.next++, parts: entry.parts, collider: null, body: null,
        up: [], down: [], side: [], holder: -1, holdLocal: null, target: null, sent: null,
      };
      if (t.tint) for (const im of p.parts) im.setColorAt(p.idx, color || _c.setScalar(1));
      for (const im of p.parts) im.userData.pcs.push(p);
      this.pieces.push(p);
      this.writeMatrix(p);
      p.collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(size.x / 2 - 0.004, size.y / 2 - 0.004, size.z / 2 - 0.004)
          .setTranslation(p.pos.x, p.pos.y, p.pos.z).setRotation(p.quat).setFriction(0.9), this.staticBody);
      this.byCollider.set(p.collider.handle, p);
    }
    for (const im of b.meshes) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.computeAdjacency(b);
    if (this.authority) this.recompute(b);
    this.updateBounds(b);
    return b;
  }

  removeBuilding(bid) {
    const b = this.buildings[bid];
    if (!b || b.removed) return;
    this.silent = true;
    for (let i = b.start; i < b.start + b.count; i++) this.vanish(this.pieces[i], false);
    this.silent = false;
    for (const im of b.meshes) { this.group.remove(im); im.dispose(); }
    b.meshes = []; b.removed = true;
  }

  clearAll() {
    for (const b of this.buildings) this.removeBuilding(b.id);
    this.pieces = []; this.buildings = []; this.byCollider.clear(); this.dirty.clear(); this.changes = [];
  }

  // ---------------------------------------------------------------- helpers
  dustColor(p) { return p.color ? p.color : _c.set(p.type.dust); }
  chipColor(p) { return p.color ? p.color.getHex() : p.type.chip; }

  updateBounds(b) {
    const mn = new THREE.Vector3(), mx = new THREE.Vector3();
    for (const im of b.meshes) {
      mn.setScalar(Infinity); mx.setScalar(-Infinity); let big = 0;
      for (const p of im.userData.pcs) { if (p.state === GONE) continue; mn.min(p.pos); mx.max(p.pos); big = Math.max(big, p.size.x, p.size.y, p.size.z); }
      if (!isFinite(mn.x)) { im.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.001); continue; }
      const c = mn.clone().add(mx).multiplyScalar(0.5);
      im.boundingSphere = new THREE.Sphere(c, mn.distanceTo(mx) / 2 + big + 3);
    }
  }

  writeMatrix(p, scale = 1) {
    this.boundsDirty.add(p.b);
    _s.copy(p.type.unit ? p.size : ONE).multiplyScalar(scale * (p.k || 1));
    _m.compose(p.pos, p.quat, _s);
    for (const im of p.parts) im.setMatrixAt(p.idx, _m);
  }
  flagParts(p) { for (const im of p.parts) im.instanceMatrix.needsUpdate = true; }
  hide(p) { for (const im of p.parts) { im.setMatrixAt(p.idx, ZERO); im.instanceMatrix.needsUpdate = true; } }

  setState(p, state, holder = -1) {
    p.state = state; p.holder = holder;
    if (this.authority && !this.silent) this.changes.push([p.id, state, holder]);
  }

  aabb(p) {
    const hx = p.size.x / 2, hy = p.size.y / 2, hz = p.size.z / 2;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) {
      _p.set(i & 1 ? hx : -hx, i & 2 ? hy : -hy, i & 4 ? hz : -hz).applyQuaternion(p.quat).add(p.pos);
      min.min(_p); max.max(_p);
    }
    return { min, max };
  }

  computeAdjacency(b) {
    const eps = 0.02, cell = 1.2 * (b.scale || 1);
    const grid = new Map();
    const list = this.pieces.slice(b.start, b.start + b.count);
    const boxes = list.map((p) => this.aabb(p));
    boxes.forEach((bx, i) => {
      for (let x = Math.floor(bx.min.x / cell); x <= Math.floor(bx.max.x / cell); x++)
        for (let y = Math.floor(bx.min.y / cell); y <= Math.floor(bx.max.y / cell); y++)
          for (let z = Math.floor(bx.min.z / cell); z <= Math.floor(bx.max.z / cell); z++) {
            const k = x + ',' + y + ',' + z; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
          }
    });
    const seen = new Set();
    for (const cellList of grid.values()) {
      for (let a = 0; a < cellList.length; a++) for (let c = a + 1; c < cellList.length; c++) {
        const i = cellList[a], j = cellList[c];
        const key = i < j ? i * 131072 + j : j * 131072 + i;
        if (seen.has(key)) continue; seen.add(key);
        const A = boxes[i], B = boxes[j];
        if (A.min.x > B.max.x + eps || B.min.x > A.max.x + eps || A.min.y > B.max.y + eps || B.min.y > A.max.y + eps || A.min.z > B.max.z + eps || B.min.z > A.max.z + eps) continue;
        const pi = list[i], pj = list[j];
        if (B.min.y >= A.max.y - 0.05) { pi.up.push(pj); pj.down.push(pi); }
        else if (A.min.y >= B.max.y - 0.05) { pj.up.push(pi); pi.down.push(pj); }
        else { pi.side.push(pj); pj.side.push(pi); }
      }
    }
    list.forEach((p, i) => { p.minY = boxes[i].min.y; p.cx = (boxes[i].min.x + boxes[i].max.x) / 2; p.cz = (boxes[i].min.z + boxes[i].max.z) / 2; });
  }

  // Dijkstra over the support graph. Resting on a supported piece costs nothing; spanning sideways or
  // hanging costs metres / (how far that piece type can cantilever). Anything whose total exceeds 1 falls.
  recompute(b) {
    const n = b.count, s0 = b.start;
    // big buildings: spans scale with the building, and bricks bond harder (STICK) so walls hold bigger holes
    const S = b.scale || 1, reach = S * (S > 1 ? 1.8 : 1);
    const dist = new Float64Array(n).fill(1e9);
    const heap = new MinHeap();
    for (let i = 0; i < n; i++) {
      const p = this.pieces[s0 + i];
      if (p.state === INTACT && p.minY <= b.groundY + 0.06) { dist[i] = 0; heap.push(i, 0); }
    }
    while (heap.size) {
      const [i, d] = heap.pop();
      if (d > dist[i]) continue;
      const p = this.pieces[s0 + i];
      const relax = (q, metres) => {
        if (q.state !== INTACT) return;
        const nd = d + metres / (q.type.hang * reach), qi = q.id - s0;
        if (nd < dist[qi] && nd <= 1) { dist[qi] = nd; heap.push(qi, nd); }
      };
      const span = (q) => Math.hypot(q.cx - p.cx, q.cz - p.cz) * Math.max(p.type.stiff || 1, q.type.stiff || 1);
      for (const q of p.up) relax(q, 0);
      for (const q of p.side) relax(q, span(q) + 0.05 * S);
      for (const q of p.down) relax(q, span(q) + 0.3 * S);
    }
    let fell = 0; const at = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = this.pieces[s0 + i];
      if (p.state === INTACT && dist[i] > 1) { this.detach(p, null, true); at.add(p.pos); fell++; }
    }
    if (fell > 5) {
      at.divideScalar(fell);
      this.sfx.collapse(Math.min(1, fell / 60), at);
      this.sfx.dust(at, 0xa8a49c, Math.min(16, 3 + fell / 8), 2.5, { size: 1.6, life: 3.5, alpha: 0.4 });
    }
    return fell;
  }

  // ---------------------------------------------------------------- state changes (authority)
  makeBody(p, kinematic) {
    const desc = kinematic ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.05).setAngularDamping(0.25).setCanSleep(true).setCcdEnabled(true);
    const body = this.world.createRigidBody(desc.setTranslation(p.pos.x, p.pos.y, p.pos.z).setRotation(p.quat));
    const cd = RAPIER.ColliderDesc.cuboid(p.size.x / 2 - 0.006, p.size.y / 2 - 0.006, p.size.z / 2 - 0.006)
      .setDensity(p.type.density).setFriction(0.85).setRestitution(0.05);
    if (!kinematic) cd.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(p.kg * 25 + 20);
    const col = this.world.createCollider(cd, body);
    p.body = body; p.collider = col;
    this.byCollider.set(col.handle, p);
  }

  detach(p, impulse = null, collapse = false) {
    if (p.state !== INTACT) return;
    this.byCollider.delete(p.collider.handle);
    this.world.removeCollider(p.collider, false);
    this.makeBody(p, !this.authority);
    this.setState(p, LOOSE);
    if (this.authority) {
      const body = p.body;
      if (impulse) body.applyImpulse(impulse, true);
      if (collapse) {
        const m = body.mass();
        body.applyImpulse({ x: (Math.random() - 0.5) * m * 0.6, y: 0, z: (Math.random() - 0.5) * m * 0.6 }, true);
        body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 0.03, y: 0, z: (Math.random() - 0.5) * m * 0.03 }, true);
      }
      this.dirty.add(p.b);
    }
    if (p.type.tint) { for (const im of p.parts) { im.setColorAt(p.idx, p.color); im.instanceColor.needsUpdate = true; } }
  }

  damage(p, amount, point, dir, force = 4) {
    const chip = this.chipColor(p);
    if (p.state === INTACT) {
      p.hp -= amount;
      this.sfx.chips(point, dir, chip, 5);
      this.sfx.dust(point, chip, 2, 0.5);
      if (p.hp <= 0) {
        const m = p.body ? p.body.mass() : p.size.x * p.size.y * p.size.z * p.type.density;
        this.detach(p, { x: dir.x * force * m, y: Math.max(0.2, dir.y) * force * m * 0.5, z: dir.z * force * m });
        if (p.type.sound === 'glass') this.sfx.glass(p.pos);
        return true;
      }
      this.tintDamage(p);
      return false;
    } else if (p.state === LOOSE && p.body) {
      const m = p.body.mass();
      p.body.applyImpulseAtPoint({ x: dir.x * force * m * 0.6, y: (dir.y + 0.4) * force * m * 0.6, z: dir.z * force * m * 0.6 }, point, true);
      this.sfx.dust(point, chip, 1, 0.4);
      return true;
    }
    return false;
  }

  // cracked blocks get darker as they lose hit points
  tintDamage(p) {
    if (!p.type.tint) return;
    const f = 0.55 + 0.45 * Math.max(0, p.hp / p.maxHp);
    for (const im of p.parts) { im.setColorAt(p.idx, _c.copy(p.color).multiplyScalar(f)); im.instanceColor.needsUpdate = true; }
  }

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
      if (p.type.sound === 'glass') this.sfx.glass(p.pos);
    }
    if (hits.length) {
      this.sfx.dust(center, this.chipColor(hits[0]), 3 + hits.length, 1.0);
      this.sfx.chips(center, push || new THREE.Vector3(), this.chipColor(hits[0]), 4 + hits.length);
      this.sfx.impact(hits[0].type.sound, Math.min(1, 0.4 + hits.length * 0.1), center);
    }
    return hits;
  }

  intactNear(center, radius, max = 12) {
    const hits = [];
    this.world.intersectionsWithShape(center, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(radius), (c) => {
      const p = this.byCollider.get(c.handle);
      if (p && p.state === INTACT) hits.push(p);
      return hits.length < max;
    }, RAPIER.QueryFilterFlags.ONLY_FIXED);
    return hits;
  }

  piecesInSphere(center, radius, states = [LOOSE]) {
    const out = [], r2 = radius * radius;
    for (const p of this.pieces) {
      if (!states.includes(p.state)) continue;
      const dx = p.pos.x - center.x, dy = p.pos.y - center.y, dz = p.pos.z - center.z;
      if (dx * dx + dy * dy + dz * dz < r2) out.push(p);
    }
    return out;
  }

  pieceFromCollider(c) { return this.byCollider.get(c.handle); }

  // machine grabs: piece becomes kinematic and follows the attachment
  hold(p, machineId, local) {
    if (p.state === INTACT) this.detach(p);
    if (p.state !== LOOSE) return false;
    p.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    p.holdLocal = local;
    this.setState(p, HELD, machineId);
    return true;
  }
  release(p, vel) {
    if (p.state !== HELD) return;
    p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    if (vel) p.body.setLinvel(vel, true);
    p.holdLocal = null;
    this.setState(p, LOOSE);
  }
  moveHeld(p, pos, quat) {
    p.pos.copy(pos); p.quat.copy(quat);
    if (p.body) { p.body.setNextKinematicTranslation(pos); p.body.setNextKinematicRotation(quat); }
    this.writeMatrix(p); this.flagParts(p);
  }

  // player carrying: body disabled while in the arms
  carry(p, playerId) {
    if (p.state !== LOOSE) return false;
    p.body.setEnabled(false);
    this.setState(p, CARRIED, playerId);
    return true;
  }
  throwPiece(p, pos, vel, spin) {
    if (p.state !== CARRIED) return;
    p.pos.copy(pos);
    p.body.setTranslation(pos, true);
    p.body.setLinvel(vel, true);
    p.body.setAngvel(spin || { x: 0, y: 0, z: 0 }, true);
    p.body.setEnabled(true);
    p.body.enableCcd(true);
    this.setState(p, LOOSE);
  }
  placeCarried(p, pos, quat, scale) {
    p.pos.copy(pos); p.quat.copy(quat);
    this.writeMatrix(p, scale); this.flagParts(p);
  }

  vanish(p, crushed = true) {
    if (p.state === GONE) return;
    if (p.body) { this.byCollider.delete(p.collider.handle); this.world.removeRigidBody(p.body); }
    else if (p.collider) { this.byCollider.delete(p.collider.handle); this.world.removeCollider(p.collider, false); }
    p.body = null; p.collider = null;
    this.setState(p, GONE);
    this.hide(p);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    this.boundsT -= dt;
    if (this.boundsT <= 0 && this.boundsDirty.size) {
      this.boundsT = 0.25;
      for (const bid of this.boundsDirty) { const b = this.buildings[bid]; if (b && !b.removed) this.updateBounds(b); }
      this.boundsDirty.clear();
    }
    if (this.authority) {
      for (const bid of this.dirty) this.recompute(this.buildings[bid]);
      this.dirty.clear();
      const touched = new Set();
      for (const p of this.pieces) {
        if (p.state !== LOOSE) continue;
        const b = p.body;
        if (b.isSleeping()) continue;
        const t = b.translation(), r = b.rotation();
        if (t.y < -20) { this.vanish(p); continue; }
        p.pos.set(t.x, t.y, t.z); p.quat.set(r.x, r.y, r.z, r.w);
        this.writeMatrix(p);
        touched.add(p.parts);
      }
      for (const parts of touched) for (const im of parts) im.instanceMatrix.needsUpdate = true;
    } else {
      // mirror: interpolate loose pieces toward the host transforms
      const a = 1 - Math.exp(-dt * 14);
      const touched = new Set();
      for (const p of this.pieces) {
        if (p.state !== LOOSE || !p.target) continue;
        p.pos.lerp(p.target.pos, a); p.quat.slerp(p.target.quat, a);
        if (p.pos.distanceToSquared(p.target.pos) < 1e-7) { p.pos.copy(p.target.pos); p.quat.copy(p.target.quat); p.target = null; }
        if (p.body) { p.body.setNextKinematicTranslation(p.pos); p.body.setNextKinematicRotation(p.quat); }
        this.writeMatrix(p); touched.add(p.parts);
      }
      for (const parts of touched) for (const im of parts) im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- network (host side)
  takeChanges() { const c = this.changes; this.changes = []; return c; }

  // pack loose pieces that moved since they were last sent: [id, px,py,pz, qx,qy,qz,qw]*
  packMoving(max = 260) {
    const out = [];
    const n = this.pieces.length;
    let count = 0;
    for (let k = 0; k < n && count < max; k++) {
      const i = (this.rr + k) % n;
      const p = this.pieces[i];
      if (p.state !== LOOSE) continue;
      const s = p.sent;
      if (s && Math.abs(s[0] - p.pos.x) + Math.abs(s[1] - p.pos.y) + Math.abs(s[2] - p.pos.z) < 0.002 &&
          Math.abs(s[3] - p.quat.x) + Math.abs(s[4] - p.quat.y) + Math.abs(s[5] - p.quat.z) + Math.abs(s[6] - p.quat.w) < 0.002) continue;
      p.sent = [p.pos.x, p.pos.y, p.pos.z, p.quat.x, p.quat.y, p.quat.z, p.quat.w];
      out.push(p.id, ...p.sent);
      count++;
      if (count >= max) this.rr = (i + 1) % n;
    }
    return out;
  }

  // ---------------------------------------------------------------- network (client side)
  applyChange(id, state, holder, extra) {
    const p = this.pieces[id];
    if (!p || p.state === state && p.holder === holder) return;
    if (state === GONE) { this.vanish(p); return; }
    if (p.state === INTACT && state !== INTACT) this.detach(p);
    if (extra && extra.pos) { p.pos.fromArray(extra.pos); p.quat.fromArray(extra.quat); p.target = null; if (p.body) { p.body.setTranslation(p.pos, true); p.body.setRotation(p.quat, true); } this.writeMatrix(p); this.flagParts(p); }
    if (p.body) p.body.setEnabled(state === LOOSE);
    p.state = state; p.holder = holder;
    if (state === HELD) p.holdLocal = extra && extra.local ? new THREE.Matrix4().fromArray(extra.local) : new THREE.Matrix4();
    if (state === LOOSE) p.holdLocal = null;
  }
  applyTransforms(arr) {
    for (let i = 0; i + 7 < arr.length; i += 8) {
      const p = this.pieces[arr[i]];
      if (!p || p.state !== LOOSE) continue;
      if (!p.target) p.target = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
      p.target.pos.set(arr[i + 1], arr[i + 2], arr[i + 3]);
      p.target.quat.set(arr[i + 4], arr[i + 5], arr[i + 6], arr[i + 7]);
    }
  }

  // ---------------------------------------------------------------- save / sync
  serializePieces() {
    const states = [], hp = [], xf = {}, holders = {};
    for (const p of this.pieces) {
      states.push(p.state);
      hp.push(p.hp === p.maxHp ? 0 : Math.round(p.hp * 10) / 10);
      if (p.state === LOOSE || p.state === HELD || p.state === CARRIED) xf[p.id] = [...p.pos.toArray(), ...p.quat.toArray()].map((v) => Math.round(v * 1e4) / 1e4);
      if (p.state === HELD || p.state === CARRIED) holders[p.id] = [p.holder, p.holdLocal ? p.holdLocal.toArray().map((v) => Math.round(v * 1e4) / 1e4) : null];
    }
    return { states, hp, xf, holders };
  }

  // forSave: carried / held pieces come back as loose rubble
  restorePieces(data, forSave) {
    data.states.forEach((st, i) => {
      const p = this.pieces[i];
      if (!p) return;
      if (data.hp[i]) p.hp = data.hp[i];
      if (st === INTACT) return;
      if (st === GONE) { this.vanish(p); return; }
      const x = data.xf[i];
      if (x) { p.pos.fromArray(x, 0); p.quat.fromArray(x, 3); }
      if (p.state === INTACT) {
        this.byCollider.delete(p.collider.handle); this.world.removeCollider(p.collider, false);
        this.makeBody(p, !this.authority);
        p.state = LOOSE;
        if (p.type.tint) for (const im of p.parts) { im.setColorAt(p.idx, p.color); im.instanceColor.needsUpdate = true; }
      }
      this.writeMatrix(p); this.flagParts(p);
      const h = data.holders && data.holders[i];
      if (!forSave && h && (st === HELD || st === CARRIED)) {
        p.state = st; p.holder = h[0];
        p.holdLocal = h[1] ? new THREE.Matrix4().fromArray(h[1]) : null;
        if (p.body) p.body.setEnabled(false);
      }
    });
    if (this.authority) for (const b of this.buildings) if (!b.removed) this.recompute(b);
  }

  stats() {
    let intact = 0, loose = 0, gone = 0;
    for (const p of this.pieces) { if (this.buildings[p.b].removed) continue; if (p.state === INTACT) intact++; else if (p.state === GONE) gone++; else loose++; }
    return { intact, loose, gone, total: intact + loose + gone };
  }
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
