// Brick press: turns crushed dust into full-size blocks in the dust's own colour. Dust comes in through the hopper
// (tip a loader or excavator bucket into it, or pour your bucket) or up the feeder belt from the crusher's
// stockpile when the feeder is switched on. Every cycle the ram compacts one block in the mould, the block rides
// the roller table out and is stacked on the pallet, ready to carry over the road and build with.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from './textures.js';
import { box, cyl, merge } from './pieces.js';
import { tube } from './crusher.js';
import { mergeG, rbox, bx, cy, tubeAB, hose, bolts, boltCircle, grille, weathered, restPositions, V, refsOf, foldStatic } from './detail.js';
import { sidePlate } from './attachments.js';

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
    const base = { value: 0 };
    const paint = weathered(0x1f8a6e, { base, rough: 0.5 }), paint2 = weathered(0x176b55, { base, rough: 0.55 });
    const steel = M.darkSteel, galv = M.galvanized, black = M.blackPaint;
    const yellow = weathered(0xf2b705, { base, rough: 0.5 });
    // H-beam skids with cross members and lifting eyes
    const sk = [];
    for (const z of [-0.9, 0.9]) sk.push(bx(4.4, 0.03, 0.2, 0.5, 0.215, z), bx(4.4, 0.17, 0.03, 0.5, 0.115, z), bx(4.4, 0.03, 0.2, 0.5, 0.015, z));
    for (const x of [-1.2, 0, 1.2, 2.4]) sk.push(bx(0.14, 0.14, 1.66, x, 0.16, 0));
    for (const x of [-1.6, 2.6]) for (const z of [-0.9, 0.9]) sk.push(new THREE.TorusGeometry(0.07, 0.02, 6, 12).translate(x, 0.3, z));
    this.add(mergeG(sk), steel);
    // four H-section columns on bolted base plates, top ring beams with corner gussets, diagonal braces
    const fr = [], fb = [];
    for (const [x, z] of [[0.1, -0.75], [0.1, 0.75], [1.9, -0.75], [1.9, 0.75]]) {
      fr.push(bx(0.16, 2.5, 0.025, x, 1.45, z - 0.07), bx(0.16, 2.5, 0.025, x, 1.45, z + 0.07), bx(0.02, 2.5, 0.12, x, 1.45, z));
      fr.push(bx(0.3, 0.03, 0.3, x, 0.245, z), sidePlate([[0, 0], [0.22, 0], [0, 0.22]], 0.02, x - 0.01).translate(0, 2.45, z + (z > 0 ? -0.3 : 0.08)));
      fb.push(bolts([V(x - 0.11, 0.265, z - 0.11), V(x + 0.11, 0.265, z - 0.11), V(x - 0.11, 0.265, z + 0.11), V(x + 0.11, 0.265, z + 0.11)], V(0, 1, 0), 0.018, 0.016));
    }
    fr.push(rbox(2.0, 0.2, 0.18, 0.02, 1.0, 2.75, -0.75), rbox(2.0, 0.2, 0.18, 0.02, 1.0, 2.75, 0.75), rbox(0.18, 0.2, 1.6, 0.02, 0.1, 2.75, 0), rbox(0.18, 0.2, 1.6, 0.02, 1.9, 2.75, 0));
    fr.push(tubeAB(V(0.1, 0.3, 0.75), V(1.9, 2.6, 0.75), 0.04), tubeAB(V(0.1, 0.3, -0.75), V(1.9, 2.6, -0.75), 0.04));
    this.add(mergeG(fr), paint); this.add(mergeG(fb), steel);
    this.col(1.0, 1.5, 0, 2.0, 3.0, 1.7);
    // hopper (open top) with an outer stiffening band, rim angles and a bar grate; its dust level
    const hop = new THREE.CylinderGeometry(1.15, 0.45, 0.95, 4, 1, true); hop.rotateY(Math.PI / 4); hop.translate(1.0, 3.3, 0);
    this.add(hop, new THREE.MeshPhysicalMaterial({ color: 0x1f8a6e, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }));
    const band = new THREE.CylinderGeometry(0.98, 0.93, 0.08, 4, 1, true); band.rotateY(Math.PI / 4); band.translate(1.0, 3.45, 0);
    const grate = []; for (let i = 0; i < 6; i++) grate.push(bx(0.03, 0.03, 1.62, 0.3 + i * 0.28, 3.8, 0));
    this.add(mergeG([band, bx(1.7, 0.06, 0.06, 1.0, 3.78, 0.81), bx(1.7, 0.06, 0.06, 1.0, 3.78, -0.81), bx(0.06, 0.06, 1.7, 0.19, 3.78, 0), bx(0.06, 0.06, 1.7, 1.81, 3.78, 0), ...grate]), steel);
    this.fill = this.add(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1 }), this.root, false);
    this.fill.position.set(1.0, 2.95, 0); this.fill.visible = false;
    // mould: ribbed box with two block cavities, on a vibration table with rubber mounts and two vibrator motors
    this.add(mergeG([rbox(1.5, 0.55, 1.0, 0.03, 1.0, 1.15, 0), ...[-0.5, 0, 0.5].map((x) => bx(0.05, 0.45, 1.06, 1.0 + x, 1.12, 0)), rbox(1.62, 0.08, 1.12, 0.02, 1.0, 0.86, 0)]), steel);
    this.add(mergeG([bx(0.62, 0.02, 0.5, 0.67, 1.43, 0), bx(0.62, 0.02, 0.5, 1.33, 1.43, 0)]), black, this.root, false);
    this.add(mergeG([-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(0.06, 0.07, 0.1, 12, 1.0 + sx * 0.65, 0.77, sz * 0.42)))), M.blackPaint);
    const vib = [];
    for (const sz of [-1, 1]) { vib.push(cy(0.13, 0.13, 0.3, 18, 1.0, 1.0, sz * 0.66, Math.PI / 2)); for (let i = 0; i < 5; i++) vib.push(cy(0.15, 0.15, 0.015, 18, 1.0, 1.0, sz * (0.55 + i * 0.05), Math.PI / 2)); }
    this.add(mergeG(vib), paint2);
    // feed drawer between the hopper and the mould, pushed by its own small cylinder
    this.add(mergeG([rbox(0.8, 0.32, 0.92, 0.03, 1.55, 1.62, 0), bx(0.82, 0.04, 0.94, 1.55, 1.8, 0)]), steel);
    this.add(mergeG([cy(0.06, 0.06, 0.55, 12, 2.2, 1.62, 0, 0, 0, Math.PI / 2), cy(0.03, 0.03, 0.3, 10, 1.98, 1.62, 0, 0, 0, Math.PI / 2)]), black);
    // guide rods for the ram head; the main cylinder on its top beam
    this.add(mergeG([cy(0.035, 0.035, 1.85, 12, 0.55, 1.8, 0), cy(0.035, 0.035, 1.85, 12, 1.45, 1.8, 0)]), M.chrome);
    this.add(mergeG([rbox(1.84, 0.14, 0.3, 0.02, 1.0, 2.75, 0), cy(0.17, 0.17, 0.8, 22, 1.0, 2.35, 0), cy(0.21, 0.21, 0.08, 22, 1.0, 2.75, 0), cy(0.2, 0.2, 0.06, 22, 1.0, 1.98, 0)]), black);
    this.add(mergeG([boltCircle(V(1.0, 2.795, 0), 0.16, 8, V(0, 1, 0), 0.016), cy(0.03, 0.03, 0.08, 8, 1.12, 2.62, 0.15, Math.PI / 2), cy(0.03, 0.03, 0.08, 8, 1.12, 2.15, 0.15, Math.PI / 2)]), steel);
    this.ram = new THREE.Group(); this.ram.position.set(1.0, 2.0, 0); this.root.add(this.ram);
    this.add(mergeG([rbox(1.35, 0.12, 0.85, 0.02, 0, -0.42, 0), ...[-0.3, 0, 0.3].map((z) => bx(1.2, 0.12, 0.04, 0, -0.3, z)), cy(0.07, 0.07, 0.1, 14, -0.45, -0.32, 0), cy(0.07, 0.07, 0.1, 14, 0.45, -0.32, 0)]), steel, this.ram);
    this.add(cy(0.07, 0.07, 0.75, 14, 0, -0.03, 0), M.chrome, this.ram);
    this.add(rbox(0.22, 0.1, 0.22, 0.02, 0, -0.38, 0), black, this.ram);
    // walkway along the back of the frame at hopper height, with handrails, kick plates and a ladder
    const wk = [bx(2.2, 0.04, 0.62, 1.0, 2.4, -1.16), bx(2.2, 0.12, 0.02, 1.0, 2.48, -1.46)];
    for (let i = 0; i < 9; i++) wk.push(bx(0.02, 0.03, 0.6, 0.0 + i * 0.25, 2.43, -1.16));
    const rails = [tubeAB(V(-0.1, 3.4, -1.46), V(2.1, 3.4, -1.46), 0.025), tubeAB(V(-0.1, 2.9, -1.46), V(2.1, 2.9, -1.46), 0.02), tubeAB(V(-0.1, 3.4, -0.86), V(-0.1, 3.4, -1.46), 0.025)];
    for (const x of [-0.1, 1.0, 2.1]) rails.push(tubeAB(V(x, 2.42, -1.46), V(x, 3.4, -1.46), 0.025));
    for (const z of [-0.86, -1.46]) rails.push(tubeAB(V(2.2, 0.25, z + 0.1 * Math.sign(z + 1.16)), V(2.2, 3.35, z + 0.1 * Math.sign(z + 1.16)), 0.025));
    for (let i = 0; i < 10; i++) rails.push(tubeAB(V(2.2, 0.45 + i * 0.3, -0.96), V(2.2, 0.45 + i * 0.3, -1.36), 0.018));
    this.add(mergeG(wk), galv); this.add(mergeG(rails), yellow);
    // hydraulic power pack: tank with sight glass and filler, electric motor with cooling fins and fan cowl, pump,
    // filter, gauges and hoses up to the cylinders
    this.add(mergeG([rbox(0.9, 0.6, 0.7, 0.04, 2.75, 0.6, -0.35), cy(0.07, 0.07, 0.08, 12, 2.55, 0.94, -0.5), cy(0.09, 0.09, 0.3, 14, 3.05, 1.02, -0.5)]), paint);
    const mot = [cy(0.18, 0.18, 0.55, 20, 2.75, 1.1, 0.35, Math.PI / 2)];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mot.push(bx(0.025, 0.05, 0.5, 2.75 + Math.cos(a) * 0.19, 1.1 + Math.sin(a) * 0.19, 0.35, 0, 0, a)); }
    this.add(mergeG(mot), paint2);
    this.add(mergeG([cy(0.2, 0.2, 0.12, 20, 2.75, 1.1, 0.68, Math.PI / 2), cy(0.11, 0.11, 0.22, 14, 2.75, 1.1, 0.0, Math.PI / 2), rbox(0.3, 0.2, 0.14, 0.02, 2.75, 1.0, -0.12)]), black);
    grille(this.root, 0.32, 0.32, 2.75, 1.1, 0.745, 0, 10);
    this.add(mergeG([cy(0.07, 0.07, 0.03, 16, 2.42, 0.75, -0.15, 0, 0, Math.PI / 2), cy(0.07, 0.07, 0.03, 16, 2.42, 0.6, -0.15, 0, 0, Math.PI / 2)]), M.chrome);
    this.add(mergeG([cy(0.055, 0.055, 0.005, 16, 2.405, 0.75, -0.15, 0, 0, Math.PI / 2), cy(0.055, 0.055, 0.005, 16, 2.405, 0.6, -0.15, 0, 0, Math.PI / 2), bx(0.01, 0.1, 0.2, 2.3, 0.6, -0.55)]), new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.4 }), this.root, false);
    this.add(mergeG([hose([V(2.6, 1.0, -0.15), V(2.3, 2.2, -0.2), V(1.25, 2.62, 0.15)], 0.03, 28), hose([V(2.62, 1.0, -0.05), V(2.4, 1.9, 0.1), V(1.25, 2.15, 0.15)], 0.03, 28), hose([V(2.62, 0.9, 0.0), V(2.5, 1.4, 0.2), V(2.45, 1.62, 0)], 0.025, 20)]), black);
    this.col(2.75, 0.6, 0, 1.0, 1.2, 1.4);
    // roller table from the mould to the pallet (the block slides out along -x)
    const rt = [box(2.4, 0.08, 0.12, -0.95, 0.72, -0.42), box(2.4, 0.08, 0.12, -0.95, 0.72, 0.42)];
    for (let i = 0; i < 9; i++) rt.push(cyl(0.05, 0.05, 0.78, 10, -2.05 + i * 0.27, 0.74, 0, null, Math.PI / 2));
    for (const x of [-2.0, 0.1]) for (const z of [-0.42, 0.42]) rt.push(box(0.08, 0.72, 0.08, x, 0.36, z));
    this.add(merge(rt), galv);
    this.add(mergeG([bx(2.4, 0.08, 0.02, -0.95, 0.95, -0.46), bx(2.4, 0.08, 0.02, -0.95, 0.95, 0.46), ...[-2.0, -0.95, 0.1].flatMap((x) => [bx(0.03, 0.2, 0.03, x, 0.86, -0.46), bx(0.03, 0.2, 0.03, x, 0.86, 0.46)])]), yellow);
    this.col(-0.95, 0.4, 0, 2.4, 0.8, 0.9);
    this.travel = this.add(box(1.2, 0.6, 0.6, 0, 0, 0), new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.95 }), this.root, true);
    this.travel.visible = false;
    // pallet (on the -x side)
    this.palletAt = new THREE.Vector3(-3.9, 0, 0);
    const pal = [];
    for (let i = 0; i < 7; i++) pal.push(box(2.6, 0.03, 0.22, 0, 0.135, -0.95 + i * 0.317, 0xc19a68));
    for (const z of [-0.9, 0, 0.9]) pal.push(box(2.6, 0.12, 0.14, 0, 0.06, z, 0xa98456));
    const pm = this.add(merge(pal), M.vertex); pm.position.copy(this.palletAt);
    // a stack of empty pallets waiting beside it
    for (let k = 0; k < 3; k++) { const sp = this.add(merge(pal), M.vertex); sp.position.set(this.palletAt.x, k * 0.15, -2.3); }
    this.col(this.palletAt.x, 0.23, -2.3, 2.6, 0.45, 2.0);
    this.col(this.palletAt.x, 0.075, 0, 2.6, 0.15, 2.0);
    // control cabinet on a post: door seam, handle, hinges, start / stop buttons, mushroom e-stop, key switch, beacon
    this.add(mergeG([bx(0.08, 1.2, 0.08, 0.3, 0.6, 1.9), rbox(0.6, 0.75, 0.22, 0.02, 0.3, 1.45, 1.9), rbox(0.66, 0.05, 0.28, 0.01, 0.3, 1.85, 1.9)]), paint);
    this.add(mergeG([bx(0.005, 0.68, 0.005, 0.02, 1.45, 2.012), bx(0.03, 0.12, 0.02, 0.53, 1.45, 2.02), bx(0.03, 0.08, 0.03, 0.0, 1.7, 2.0), bx(0.03, 0.08, 0.03, 0.0, 1.2, 2.0)]), steel);
    this.add(mergeG([cy(0.035, 0.035, 0.03, 12, 0.14, 1.3, 2.025, Math.PI / 2)]), M.greenLens || new THREE.MeshStandardMaterial({ color: 0x2fbf4a, emissive: 0x1a7a2c, emissiveIntensity: 0.6 }));
    this.add(mergeG([cy(0.035, 0.035, 0.03, 12, 0.26, 1.3, 2.025, Math.PI / 2), cy(0.06, 0.05, 0.04, 16, 0.44, 1.28, 2.04, Math.PI / 2)]), M.redLens);
    this.add(mergeG([cy(0.075, 0.075, 0.015, 16, 0.44, 1.28, 2.015, Math.PI / 2), cy(0.03, 0.03, 0.02, 10, 0.44, 1.16, 2.02, Math.PI / 2)]), yellow);
    this.beaconMat = new THREE.MeshStandardMaterial({ color: 0xffa316, emissive: 0xff8a00, emissiveIntensity: 0.15, transparent: true, opacity: 0.9 });
    const bc = this.add(cy(0.06, 0.06, 0.12, 16, 0.3, 1.94, 1.9), this.beaconMat, this.root, false); bc.userData.keep = true;
    this.add(cy(0.07, 0.07, 0.03, 16, 0.3, 1.875, 1.9), black);
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
    foldStatic(this.root, refsOf(this, ['scene', 'physics', 'M', 'demo', 'world', 'game', 'g']));
    this.root.updateMatrixWorld(true); restPositions(this.root);
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
    if (!cb) this.beltLoaded = feedingNow ? 1 : 0; // clients do not see the stockpile take: assume the belt carries dust
    this.beltDust.visible = feedingNow && (this.beltLoaded || 0) > 0.2;
    if (this.beltDust.visible) this.beltDust.material.color.copy(this.color);
    // press cycle
    if (this.phase < 0) {
      // looking for a free pallet spot scans every block in the world: twice a second is plenty
      this.waitT = (this.waitT || 0) - dt;
      if (cb && this.dust >= BRICK_KG && this.waitT <= 0) {
        this.waitT = 0.5;
        if (!demo.freeBrick()) this.blocked = 'All 300 pressed blocks are in use: crush some to free them';
        else {
          this.slot = this.freeSlot(demo);
          if (this.slot) { this.phase = 0; this.dust -= BRICK_KG; this.changed = true; this.blocked = null; this.refresh(); }
          else this.blocked = 'Pallet full: take the blocks away';
        }
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
          else { this.dust += BRICK_KG; this.refresh(); } // no block to hand out: the dust goes back in the hopper
          this.changed = true;
        }
        this.ram.position.y = 2.0;
      }
    }
    this.status = this.phase >= 0 ? 'Pressing a block' : this.dust >= BRICK_KG ? (this.blocked || 'Ready')
      : this.feeding ? ((this.beltLoaded || 0) > 0 ? 'Feeding dust from the stockpile' : 'Feeder on, but the stockpile is empty: crush some rubble') : 'Waiting for dust';
    if (this.beaconMat) this.beaconMat.emissiveIntensity = this.phase >= 0 ? (Math.sin(performance.now() * 0.016) > 0 ? 3.2 : 0.3) : 0.15;
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

  serialize() { return [Math.round(this.dust * 100) / 100, Math.round(this.color.r * 1000) / 1000, Math.round(this.color.g * 1000) / 1000, Math.round(this.color.b * 1000) / 1000, this.feeding ? 1 : 0, this.made, Math.round(this.phase * 100) / 100]; }
  restore(d) {
    if (!d) { this.dust = 0; this.feeding = false; this.made = 0; this.phase = -1; this.refresh(); return; }
    this.dust = d[0]; this.color.setRGB(d[1], d[2], d[3]); this.feeding = !!d[4]; this.made = d[5] || 0;
    // clients replay the press animation; the block itself arrives as a piece change
    this.phase = d[6] >= 0 ? d[6] : -1;
    this.refresh(); this.drawScreen();
  }
}
