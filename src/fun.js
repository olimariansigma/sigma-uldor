// Demolition charges and the little celebrations.
// Charges: with the charge tool (3) click a block to stick a charge on it, then press E (or BOOM) to detonate all
// of yours after a 3-second countdown. The host decides what breaks; everyone sees and hears the blast.
import * as THREE from 'three';
import { INTACT, LOOSE, GONE } from './demolition.js';
import { box, cyl, merge } from './pieces.js';

export const MAX_CHARGES = 8;     // per player
const FUSE = 3;
const RADIUS = 2.8;
const V = () => new THREE.Vector3();

export class Charges {
  constructor(game) {
    this.g = game; this.list = []; this.nextId = 1;
    const M = game.M, N = 48;
    // three red sticks taped together, a black timer box with a display on the front
    const geo = merge([
      cyl(0.045, 0.045, 0.34, 10, -0.085, 0, 0, 0xc4261c), cyl(0.045, 0.045, 0.34, 10, 0, 0, -0.02, 0xd02a1e), cyl(0.045, 0.045, 0.34, 10, 0.085, 0, 0, 0xc4261c),
      box(0.27, 0.05, 0.1, 0, 0.09, -0.005, 0x18181a), box(0.27, 0.05, 0.1, 0, -0.09, -0.005, 0x18181a),
      box(0.17, 0.11, 0.05, 0, 0, 0.065, 0x1d1e21), box(0.1, 0.035, 0.012, 0, 0.012, 0.092, 0x2a3a2c),
      cyl(0.006, 0.006, 0.14, 4, 0.06, 0.12, 0.05, 0xd0b020, 0.4), cyl(0.006, 0.006, 0.14, 4, -0.06, 0.12, 0.05, 0x2050c0, -0.4),
    ]);
    this.mesh = new THREE.InstancedMesh(geo, M.vertex, N); this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.led = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a10 }), N);
    this.led.count = 0; this.led.frustumCulled = false;
    game.scene.add(this.mesh, this.led);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = V(); this._s = new THREE.Vector3(1, 1, 1);
    this.beepT = 0;
  }

  mine(pid) { return this.list.filter((c) => c.owner === pid); }
  armed(pid) { return this.list.some((c) => c.owner === pid && c.fuse != null); }

  // where a charge is now: it rides on its block
  pose(c, pos, quat) {
    const p = this.g.demo.pieces[c.piece];
    quat.copy(p.quat).multiply(c.lq);
    pos.copy(c.lp).applyQuaternion(p.quat).add(p.pos);
  }

  // ---- authority
  place(pid, pieceId, point, facing) {
    const g = this.g, p = g.demo.pieces[pieceId];
    if (!p || p.state === GONE || p.pool) return false;
    if (this.mine(pid).length >= MAX_CHARGES) { g.tell(pid, `🧨 That's all ${MAX_CHARGES} of your charges. Press E to set them off.`); return false; }
    if (this.armed(pid)) return false;
    const pos = new THREE.Vector3().fromArray(point), f = new THREE.Vector3().fromArray(facing).setY(0);
    if (f.lengthSq() < 1e-4) f.set(0, 0, 1);
    f.normalize();
    // stand the bundle upright, its timer facing back at whoever placed it, a few cm off the surface
    const wq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(f.x, f.z));
    pos.addScaledVector(f, 0.07);
    const inv = p.quat.clone().invert();
    const c = { id: this.nextId++, owner: pid, piece: p.id, lp: pos.sub(p.pos).applyQuaternion(inv), lq: inv.multiply(wq), fuse: null };
    this.list.push(c);
    this.changed();
    return true;
  }
  arm(pid) {
    const mine = this.mine(pid);
    if (!mine.length || this.armed(pid)) return false;
    for (const c of mine) c.fuse = FUSE;
    this.changed();
    return true;
  }
  changed() { this.g.events.push(['chg', this.pack()]); if (this.g.ui) this.g.ui.setHotbar(); }
  pack() { return this.list.map((c) => [c.id, c.owner, c.piece, ...c.lp.toArray().map((v) => Math.round(v * 1000) / 1000), ...c.lq.toArray().map((v) => Math.round(v * 1e4) / 1e4), c.fuse == null ? -1 : Math.round(c.fuse * 100) / 100]); }
  restore(arr) {
    this.list = (arr || []).map((a) => ({ id: a[0], owner: a[1], piece: a[2], lp: new THREE.Vector3(a[3], a[4], a[5]), lq: new THREE.Quaternion(a[6], a[7], a[8], a[9]), fuse: a[10] < 0 ? null : a[10] }));
    this.nextId = Math.max(this.nextId, ...this.list.map((c) => c.id + 1), 1);
    if (this.g.ui) this.g.ui.setHotbar();
  }
  clear() { this.list = []; }

  explode(c) {
    const g = this.g, demo = g.demo, ctr = V(), q = new THREE.Quaternion();
    this.pose(c, ctr, q);
    const hits = demo.piecesInSphere(ctr, RADIUS, [INTACT, LOOSE]);
    const shatter = [];
    for (const p of hits) {
      const d = p.pos.clone().sub(ctr), dist = d.length(), k = 1 - dist / RADIUS;
      if (k <= 0) continue;
      d.normalize(); d.y = Math.abs(d.y) * 0.5 + 0.35; d.normalize();
      const m = p.body ? p.body.mass() : p.size.x * p.size.y * p.size.z * p.type.density;
      const imp = { x: d.x * m * 7 * k, y: d.y * m * 7 * k, z: d.z * m * 7 * k };
      if (p.state === INTACT) demo.detach(p, imp);
      else if (p.body) p.body.applyImpulse(imp, true);
      if (demo.isBig(p) && k > 0.3) shatter.push(p);
    }
    for (const p of shatter) if (p.state === LOOSE) demo.shatter(p, 3, 1.2);
    g.events.push(['boom', Math.round(ctr.x * 100) / 100, Math.round(ctr.y * 100) / 100, Math.round(ctr.z * 100) / 100]);
    g.boomFx(ctr);
  }

  // ---- every frame, everywhere
  update(dt, auth) {
    const g = this.g;
    // charges whose block vanished (crushed, carried off as rubble...) go with it
    if (auth) {
      const before = this.list.length;
      this.list = this.list.filter((c) => { const p = g.demo.pieces[c.piece]; return p && p.state !== GONE; });
      const blow = [];
      for (const c of this.list) if (c.fuse != null) { c.fuse -= dt; if (c.fuse <= 0) blow.push(c); }
      if (blow.length) { this.list = this.list.filter((c) => !blow.includes(c)); for (const c of blow) this.explode(c); }
      if (blow.length || this.list.length !== before) this.changed();
    } else for (const c of this.list) if (c.fuse != null) c.fuse = Math.max(0, c.fuse - dt);
    // draw
    const n = Math.min(this.list.length, this.mesh.instanceMatrix.count);
    let soonest = 1e9, at = null;
    const now = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const c = this.list[i];
      this.pose(c, this._p, this._q);
      this._m.compose(this._p, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
      // LED: slow blink when set, fast when counting down
      const rate = c.fuse == null ? 1 : 2 + (FUSE - c.fuse) * 3;
      const on = Math.sin(now * Math.PI * 2 * rate) > 0 ? 1 : 0.0001;
      const lp = new THREE.Vector3(0.06, 0.035, 0.1).applyQuaternion(this._q).add(this._p);
      this._m.compose(lp, this._q, new THREE.Vector3(on, on, on)); this.led.setMatrixAt(i, this._m);
      if (c.fuse != null && c.fuse < soonest) { soonest = c.fuse; at = this._p.clone(); }
    }
    this.mesh.count = n; this.led.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; this.led.instanceMatrix.needsUpdate = true;
    // countdown beeps, faster towards the end
    if (at) {
      this.beepT -= dt;
      if (this.beepT <= 0) { this.beepT = soonest > 1.5 ? 0.5 : soonest > 0.6 ? 0.25 : 0.1; g.audio.beep(at, soonest < 1); }
    } else this.beepT = 0;
  }
}

// fireworks over a plot once its building is down to its last few blocks
export function celebrate(game, plotPos, name) {
  const cols = [0xff4040, 0x40ff70, 0x4aa0ff, 0xffd040, 0xff60e0, 0x60fff0, 0xffffff];
  for (let i = 0; i < 9; i++) {
    const t = 0.35 * i + Math.random() * 0.3;
    const p = plotPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 26 + Math.random() * 16, (Math.random() - 0.5) * 18));
    const col = cols[Math.floor(Math.random() * cols.length)];
    setTimeout(() => game.fx.firework(p, col), (t + 1.1) * 1000);
    game.audio.firework(p, t + 1.1);
  }
  game.ui.toast(`🎉 ${name} is flattened! Nice work, crew.`, true, 5000);
}
