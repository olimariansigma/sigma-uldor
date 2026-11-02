// Brick press: turns crushed dust into full-size blocks in the dust's own colour. Dust comes in through the hopper
// (tip a loader or excavator bucket into it, or pour your bucket) or up the feeder belt from the crusher's
// stockpile when the feeder is switched on. Every cycle the ram compacts one block in the mould, the block rides
// the roller table out and is stacked on the pallet, ready to carry over the road and build with.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from './textures.js';
import { box, cyl, merge } from './pieces.js';
import { tube } from './crusher.js';

export const BRICK_KG = 459;            // one block's worth of dust (what crushing a block gives back)
const CAP = 60 * BRICK_KG;              // hopper capacity
const CYCLE = 2.4;                      // seconds per block
const FEED_RATE = 420;                  // dust per second up the feeder belt
// pallet stacking: 2 columns x 3 rows x 3 layers (blocks lie along x)
const SLOTS = [];
for (let l = 0; l < 3; l++) for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) SLOTS.push(new THREE.Vector3(-0.63 + c * 1.26, 0.45 + l * 0.6, -0.64 + r * 0.64));

export class BrickPress {
  constructor(scene, physics, M, pos, rotY = 0) {
    this.scene = scene; this.physics = physics; this.M = M;
    this.root = new THREE.Group(); this.root.position.copy(pos); this.root.rotation.y = rotY; scene.add(this.root);
    this.colliders = [];
    this.dust = 0; this.color = new THREE.Color(0.55, 0.55, 0.55);
    this.feeding = false; this.made = 0;
    this.phase = -1;                     // seconds into the current press cycle, -1 when idle
    this.slot = null; this.status = 'Waiting for dust';
    this.build();
    this.buildPhysics();
    this.root.updateMatrixWorld(true);
    this.hopperWorld = this.root.localToWorld(new THREE.Vector3(1.0, 3.3, 0));
    this.panelWorld = this.root.localToWorld(new THREE.Vector3(0.3, 0, 1.9));
    this.feedFoot = this.root.localToWorld(new THREE.Vector3(7.2, 0, 0));
    this.refresh();
  }

  add(geo, mat, parent = this.root, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
  col(x, y, z, sx, sy, sz, rz = 0) { this.colliders.push([x, y, z, sx, sy, sz, rz]); }

  build() {
    const M = this.M;
    const paint = new THREE.MeshPhysicalMaterial({ color: 0x1f8a6e, roughness: 0.45, metalness: 0.25, clearcoat: 0.35 });
    const steel = M.darkSteel, galv = M.galvanized;
    // skids and base frame
    this.add(merge([box(4.2, 0.18, 0.22, 0.6, 0.09, -0.9), box(4.2, 0.18, 0.22, 0.6, 0.09, 0.9), ...[-1.2, 0, 1.2, 2.4].map((x) => box(0.18, 0.14, 2.0, x, 0.2, 0))]), steel);
    // main frame: four columns, top ring, cross braces
    const fr = [];
    for (const [x, z] of [[0.1, -0.75], [0.1, 0.75], [1.9, -0.75], [1.9, 0.75]]) fr.push(box(0.16, 2.5, 0.16, x, 1.45, z));
    fr.push(box(2.0, 0.16, 0.16, 1.0, 2.75, -0.75), box(2.0, 0.16, 0.16, 1.0, 2.75, 0.75), box(0.16, 0.16, 1.6, 0.1, 2.75, 0), box(0.16, 0.16, 1.6, 1.9, 2.75, 0));
    fr.push(tube(new THREE.Vector3(0.1, 0.3, 0.75), new THREE.Vector3(1.9, 2.6, 0.75), 0.04), tube(new THREE.Vector3(0.1, 0.3, -0.75), new THREE.Vector3(1.9, 2.6, -0.75), 0.04));
    this.add(merge(fr), paint);
    this.col(1.0, 1.5, 0, 2.0, 3.0, 1.7);
    // hopper (open top) with its dust level
    const hop = new THREE.CylinderGeometry(1.15, 0.45, 0.95, 4, 1, true); hop.rotateY(Math.PI / 4); hop.translate(1.0, 3.3, 0);
    this.add(hop, new THREE.MeshPhysicalMaterial({ color: 0x1f8a6e, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }));
    this.add(merge([box(1.7, 0.06, 0.06, 1.0, 3.78, 0.81), box(1.7, 0.06, 0.06, 1.0, 3.78, -0.81), box(0.06, 0.06, 1.7, 0.19, 3.78, 0), box(0.06, 0.06, 1.7, 1.81, 3.78, 0)]), steel);
    this.fill = this.add(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1 }), this.root, false);
    this.fill.position.set(1.0, 2.95, 0); this.fill.visible = false;
    // mould box, ram plate on a hydraulic cylinder
    this.add(merge([box(1.5, 0.55, 1.0, 1.0, 1.15, 0), box(1.6, 0.08, 1.1, 1.0, 0.86, 0)]), steel);
    this.ram = new THREE.Group(); this.ram.position.set(1.0, 2.0, 0); this.root.add(this.ram);
    this.add(merge([box(1.3, 0.12, 0.8, 0, -0.42, 0)]), steel, this.ram);
    this.add(cyl(0.07, 0.07, 0.75, 14, 0, -0.03, 0), M.chrome, this.ram);
    this.add(merge([cyl(0.16, 0.16, 0.8, 18, 1.0, 2.35, 0), cyl(0.2, 0.2, 0.08, 18, 1.0, 2.75, 0)]), paint);
    // hydraulic power pack: tank, motor, hoses
    this.add(merge([box(0.9, 0.6, 0.7, 2.75, 0.6, -0.35), cyl(0.18, 0.18, 0.55, 16, 2.75, 1.1, 0.35, null, 0, 0, Math.PI / 2)]), paint);
    this.add(merge([tube(new THREE.Vector3(2.4, 0.9, -0.3), new THREE.Vector3(1.4, 2.4, -0.2), 0.03), tube(new THREE.Vector3(2.4, 0.8, -0.1), new THREE.Vector3(1.2, 2.6, 0.1), 0.03)]), M.blackPaint);
    this.col(2.75, 0.6, 0, 1.0, 1.2, 1.4);
    // roller table from the mould to the pallet (the block slides out along -x)
    const rt = [box(2.4, 0.08, 0.12, -0.95, 0.72, -0.42), box(2.4, 0.08, 0.12, -0.95, 0.72, 0.42)];
    for (let i = 0; i < 9; i++) rt.push(cyl(0.05, 0.05, 0.78, 10, -2.05 + i * 0.27, 0.74, 0, null, Math.PI / 2));
    for (const x of [-2.0, 0.1]) for (const z of [-0.42, 0.42]) rt.push(box(0.08, 0.72, 0.08, x, 0.36, z));
    this.add(merge(rt), galv);
    this.col(-0.95, 0.4, 0, 2.4, 0.8, 0.9);
    this.travel = this.add(box(1.2, 0.6, 0.6, 0, 0, 0), new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.95 }), this.root, true);
    this.travel.visible = false;
    // pallet (on the -x side)
    this.palletAt = new THREE.Vector3(-3.9, 0, 0);
    const pal = [];
    for (let i = 0; i < 7; i++) pal.push(box(2.6, 0.03, 0.22, 0, 0.135, -0.95 + i * 0.317, 0xc19a68));
    for (const z of [-0.9, 0, 0.9]) pal.push(box(2.6, 0.12, 0.14, 0, 0.06, z, 0xa98456));
    const pm = this.add(merge(pal), M.vertex); pm.position.copy(this.palletAt);
    this.col(this.palletAt.x, 0.075, 0, 2.6, 0.15, 2.0);
    // control panel on a post: cabinet, buttons, screen
    this.add(merge([box(0.08, 1.2, 0.08, 0.3, 0.6, 1.9), box(0.55, 0.65, 0.22, 0.3, 1.45, 1.9)]), paint);
    this.add(merge([cyl(0.04, 0.04, 0.03, 12, 0.18, 1.3, 2.02, null, Math.PI / 2), cyl(0.04, 0.04, 0.03, 12, 0.42, 1.3, 2.02, null, Math.PI / 2)]), M.redLens);
    this.screenCanvas = document.createElement('canvas'); this.screenCanvas.width = 256; this.screenCanvas.height = 128;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas); this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), new THREE.MeshBasicMaterial({ map: this.screenTex }));
    scr.position.set(0.3, 1.58, 2.015); this.root.add(scr);
    // name board on the frame
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.36), new THREE.MeshStandardMaterial({ map: T.labelTexture('BRICK PRESS', { w: 1024, h: 230, bg: '#f2b705', color: '#16171a', font: '900 130px Arial', italic: false }), roughness: 0.5 }));
    sign.position.set(1.0, 2.75, 0.84); this.root.add(sign);
    const sign2 = sign.clone(); sign2.position.z = -0.84; sign2.rotation.y = Math.PI; this.root.add(sign2);
    // feeder belt from the edge of the stockpile (+x) up into the hopper
    const a = new THREE.Vector3(7.4, 0.35, 0), b = new THREE.Vector3(1.9, 3.55, 0), d = b.clone().sub(a), len = d.length(), ang = Math.atan2(d.y, -d.x);
    this.belt = new THREE.Group(); this.belt.position.copy(a.clone().lerp(b, 0.5)); this.belt.rotation.z = -ang; this.root.add(this.belt);
    const beltTex = T.beltTexture().clone(); beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping; beltTex.repeat.set(len / 1.2, 1); beltTex.needsUpdate = true;
    this.beltTex = beltTex;
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 }));
    belt.position.y = 0.09; this.belt.add(belt);
    this.add(merge([box(len, 0.16, 0.06, 0, 0, 0.31), box(len, 0.16, 0.06, 0, 0, -0.31), box(len, 0.22, 0.04, 0, 0.18, 0.33), box(len, 0.22, 0.04, 0, 0.18, -0.33),
      cyl(0.12, 0.12, 0.62, 14, len / 2, 0.02, 0, null, Math.PI / 2), cyl(0.12, 0.12, 0.62, 14, -len / 2, 0.02, 0, null, Math.PI / 2)]), galv, this.belt);
    this.beltDust = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.4, 0.3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1 }));
    this.beltDust.position.y = 0.11; this.beltDust.visible = false; this.belt.add(this.beltDust);
    const legs = [];
    for (const t of [0.3, 0.62]) { const p = a.clone().lerp(b, t); legs.push(box(0.08, p.y, 0.08, p.x, p.y / 2, 0.3), box(0.08, p.y, 0.08, p.x, p.y / 2, -0.3)); }
    this.add(merge(legs), galv);
    // a collider along the belt so machines and players don't drive through it
    this.col(a.x + d.x / 2, a.y + d.y / 2, 0, len, 0.4, 0.7, -ang);
    // drive motor at the head drum
    this.add(merge([box(0.3, 0.3, 0.3, 2.1, 3.4, 0.5)]), paint);
  }

  buildPhysics() {
    const w = this.physics.world;
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.root.position.x, this.root.position.y, this.root.position.z).setRotation(this.root.quaternion));
    for (const [x, y, z, sx, sy, sz, rz] of this.colliders) {
      w.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(x, y, z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz)), body);
    }
  }

  // ---- contents
  room() { return Math.max(0, CAP - this.dust); }
  addDust(kg, color) {
    const take = Math.min(kg, this.room());
    if (take <= 0) return 0;
    this.color.lerp(color, this.dust > 0 ? take / (this.dust + take) : 1);
    this.dust += take;
    this.refresh();
    return take;
  }
  // world position of a free spot on the pallet, or null when it is full
  freeSlot(demo) {
    for (const s of SLOTS) {
      const w = this.root.localToWorld(s.clone().add(this.palletAt));
      if (!demo.piecesInSphere(w, 0.32, [0, 1]).length) return w;
    }
    return null;
  }
  get palletWorld() { return this.root.localToWorld(this.palletAt.clone()); }

  // ---- every frame. cb (host only): take(kg) -> { kg, color } from the stockpile, spawn(pos, quat, color) -> true
  update(dt, demo, fx, audio, cb) {
    // feeder belt
    const feedingNow = this.feeding && this.dust < CAP - 50;
    if (feedingNow) this.beltTex.offset.x -= dt * 0.6;
    if (cb && feedingNow) {
      const got = cb.take(Math.min(FEED_RATE * dt, this.room()));
      if (got && got.kg > 0) { this.addDust(got.kg, got.color); this.beltLoaded = 1; }
      else this.beltLoaded = Math.max(0, (this.beltLoaded || 0) - dt);
    }
    this.beltDust.visible = feedingNow && (this.beltLoaded || 0) > 0.2;
    if (this.beltDust.visible) this.beltDust.material.color.copy(this.color);
    // press cycle
    if (this.phase < 0) {
      if (cb && this.dust >= BRICK_KG && demo.freeBrick()) {
        this.slot = this.freeSlot(demo);
        if (this.slot) { this.phase = 0; this.dust -= BRICK_KG; this.changed = true; this.refresh(); }
        else this.status = 'Pallet full: take the bricks away';
      }
    } else {
      const t0 = this.phase;
      this.phase += dt;
      const t = this.phase;
      // ram: down (0-0.8 s), dwell, up (1.0-1.5 s)
      this.ram.position.y = 2.0 - 0.3 * (t < 0.8 ? t / 0.8 : t < 1.0 ? 1 : Math.max(0, 1 - (t - 1.0) / 0.5));
      if (t0 < 0.8 && t >= 0.8 && audio) { audio.tamp(this.root.localToWorld(new THREE.Vector3(1, 1, 0))); if (fx) fx.dust(this.root.localToWorld(new THREE.Vector3(1, 1.0, 0.6)), this.color.getHex(), 2, 0.6, { alpha: 0.3 }); }
      // the fresh block rides the roller table out towards the pallet
      this.travel.visible = t > 1.4 && t < CYCLE;
      if (this.travel.visible) { const k = (t - 1.4) / (CYCLE - 1.4); this.travel.position.set(0.9 - k * 2.6, 1.07, 0); this.travel.material.color.copy(this.color); }
      if (t >= CYCLE) {
        this.phase = -1; this.travel.visible = false;
        if (cb) {
          const q = this.root.quaternion.clone();
          if (cb.spawn(this.slot, q, this.color.clone().multiplyScalar(0.92 + Math.random() * 0.12))) { this.made++; if (audio) audio.clank(this.slot, 0.5); }
          this.changed = true;
        }
        this.ram.position.y = 2.0;
      }
    }
    this.status = this.phase >= 0 ? 'Pressing a block' : this.dust >= BRICK_KG ? (this.status.startsWith('Pallet') ? this.status : 'Ready') : this.feeding ? 'Feeding dust from the stockpile' : 'Waiting for dust';
    this.screenT = (this.screenT || 0) - dt;
    if (this.screenT <= 0) { this.screenT = 0.5; this.drawScreen(); }
  }

  refresh() {
    const f = Math.min(1, this.dust / CAP);
    this.fill.visible = f > 0.005;
    this.fill.scale.setScalar(0.9 + f * 0.9); this.fill.position.y = 2.95 + f * 0.75;
    this.fill.material.color.copy(this.color);
  }
  drawScreen() {
    const x = this.screenCanvas.getContext('2d');
    x.fillStyle = '#0c1a14'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#5cf2a8'; x.font = 'bold 26px monospace';
    x.fillText(`DUST ${(this.dust * 4 / 459).toFixed(1)} kg`, 12, 36);
    x.fillText(`BLOCKS ${Math.floor(this.dust / BRICK_KG)} | ${this.made}`, 12, 72);
    x.fillStyle = this.feeding ? '#f2b705' : '#557766'; x.fillText(this.feeding ? 'FEEDER ON' : 'FEEDER OFF', 12, 108);
    this.screenTex.needsUpdate = true;
  }

  serialize() { return [Math.round(this.dust), Math.round(this.color.r * 1000) / 1000, Math.round(this.color.g * 1000) / 1000, Math.round(this.color.b * 1000) / 1000, this.feeding ? 1 : 0, this.made, Math.round(this.phase * 100) / 100]; }
  restore(d) {
    if (!d) { this.dust = 0; this.feeding = false; this.made = 0; this.phase = -1; this.refresh(); return; }
    this.dust = d[0]; this.color.setRGB(d[1], d[2], d[3]); this.feeding = !!d[4]; this.made = d[5] || 0;
    // clients replay the press animation; the block itself arrives as a piece change
    this.phase = d[6] >= 0 ? d[6] : -1;
    this.refresh(); this.drawScreen();
  }
}
