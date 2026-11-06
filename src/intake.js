// Ground-level intake line behind the jaw crusher, for trucks:
//   truck tip funnel (wheel-stop curb) -> walled ground belt -> block compactor (bales bricks into cubes)
//   -> cleated incline belt -> drops the cubes into the crusher hopper, where they are crushed into dust.
// Everything is built in the crusher's local frame (the feed end of the crusher faces -z).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from './textures.js';
import { box, cyl, merge } from './pieces.js';
import { LOOSE } from './demolition.js';
import { tube } from './crusher.js';
import { refsOf, foldStatic } from './detail.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BELT_Y = 0.34;            // ground belt surface
const W = 1.35;                 // half inner width of the walled channel
const Z_DROP = -34.0, Z_FUNNEL = -28.0, Z_IN = -21.8; // funnel end, funnel/channel join, compactor intake face
const Z_CF = -17.4;             // compactor front face
const TAIL = V(0, 0.66, -16.9), HEAD = V(0, 5.0, -6.1); // incline belt
const BELT_SPEED = 1.35, LIFT_SPEED = 0.95;
const CHARGE_N = 5;             // blocks per cube
const PRESS_T = 2.6, EJECT_T = 1.6;

// rubber belt with raised chevron cleats (scrolls along +v)
function chevronTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#1b1b1c'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 600; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  x.strokeStyle = '#3a3b3d'; x.lineWidth = 10; x.lineCap = 'round';
  x.beginPath(); x.moveTo(10, 30); x.lineTo(64, 70); x.lineTo(118, 30); x.stroke();
  x.strokeStyle = '#4a4b4e'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(10, 26); x.lineTo(64, 66); x.lineTo(118, 26); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// a compressed bale: fragments of every block that went in, held by two steel straps
function cubeMaterial(parts) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#4a4744'; x.fillRect(0, 0, 128, 128);
  const tot = parts.reduce((a, p) => a + p.kg, 0) || 1;
  for (let i = 0; i < 70; i++) {
    let r = Math.random() * tot, p = parts[0];
    for (const q of parts) { r -= q.kg; if (r <= 0) { p = q; break; } }
    const col = p.color.clone().multiplyScalar(0.7 + Math.random() * 0.45);
    x.fillStyle = '#' + col.getHexString();
    x.beginPath();
    const cx = Math.random() * 128, cy = Math.random() * 128, n = 5 + (Math.random() * 3 | 0), rr = 6 + Math.random() * 16;
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + Math.random() * 0.5, d = rr * (0.6 + Math.random() * 0.5); x.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1.5; x.stroke();
  }
  // crushed fines in the gaps
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '30,28,26' : '170,165,158'},${0.25 + Math.random() * 0.3})`; x.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5); }
  // straps
  x.fillStyle = '#2c2f33'; x.fillRect(0, 30, 128, 9); x.fillRect(0, 89, 128, 9);
  x.fillStyle = '#6d737a'; x.fillRect(0, 31, 128, 2); x.fillRect(0, 90, 128, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0.05 });
}

export class IntakeLine {
  constructor(scene, physics, M, crusher) {
    this.physics = physics; this.M = M; this.crusher = crusher;
    this.root = new THREE.Group(); crusher.root.add(this.root);
    this.colliders = [];
    this.charge = [];          // [{kg, color}] waiting in the compactor chamber
    this.cubes = [];           // cubes leaving the compactor / riding the incline / falling into the hopper
    this.made = 0;
    this.phase = 'idle'; this.phaseT = 0; this.idleT = 0; this.pending = null;
    this.dir = HEAD.clone().sub(TAIL); this.liftLen = this.dir.length(); this.dir.normalize();
    this.ang = Math.atan2(this.dir.y, this.dir.z); this.nrm = V(0, this.dir.z, -this.dir.y);
    this.build();
    foldStatic(this.root, refsOf(this, ['scene', 'physics', 'M', 'demo', 'world', 'game', 'g']));
    this.buildPhysics();
    this.root.updateMatrixWorld(true);
    // world-space box around the belt + funnel for a cheap first test
    const a = crusher.root.localToWorld(V(-2.8, -1, Z_DROP - 0.5)), b = crusher.root.localToWorld(V(2.8, 3, Z_IN + 0.3));
    this.wmin = a.clone().min(b); this.wmax = a.clone().max(b);
    this.inv = new THREE.Matrix4().copy(crusher.root.matrixWorld).invert();
  }

  add(geo, mat, parent = this.root, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
  col(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) { this.colliders.push({ x, y, z, sx, sy, sz, rx, ry, rz }); }

  build() {
    const M = this.M;
    const paint = M.paintOrange, frame = M.darkSteel;
    // ================================================================ truck tip funnel + walled ground belt
    const len = Z_IN - Z_DROP, zc = (Z_IN + Z_DROP) / 2;
    // belt bed: side channels, legs, return idlers, rubber belt with scrolling texture
    const bed = [];
    for (const s of [-1, 1]) {
      bed.push(box(0.1, 0.22, len, s * (W + 0.05), 0.19, zc), box(0.16, 0.04, len, s * (W - 0.02), 0.3, zc));
      for (let z = Z_DROP + 0.4; z < Z_IN; z += 1.5) bed.push(box(0.12, 0.12, 0.12, s * (W + 0.05), 0.06, z), box(0.2, 0.02, 0.2, s * (W + 0.05), 0.01, z));
    }
    for (let z = Z_DROP + 0.75; z < Z_IN; z += 1.5) bed.push(cyl(0.06, 0.06, 2 * W, 10, 0, 0.14, z, null, 0, 0, Math.PI / 2));
    this.add(merge(bed), frame);
    const bt = T.beltTexture().clone(); bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.repeat.set(3, len / 0.8); bt.needsUpdate = true;
    this.groundTex = bt;
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, len), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.92 }));
    belt.rotation.x = -Math.PI / 2; belt.position.set(0, BELT_Y, zc); belt.receiveShadow = true; this.root.add(belt);
    this.col(0, BELT_Y - 0.1, zc, 2 * W + 0.2, 0.2, len);
    // walled channel between funnel and compactor: steel skirt plates with stiffeners, top rail and rubber skirts
    const wl = Z_IN - Z_FUNNEL, wzc = (Z_IN + Z_FUNNEL) / 2, wallH = 1.15;
    const walls = [], ribs = [], skirt = [];
    for (const s of [-1, 1]) {
      walls.push(box(0.06, wallH, wl, s * (W + 0.03), BELT_Y + wallH / 2 - 0.04, wzc));
      for (let z = Z_FUNNEL + 0.3; z < Z_IN; z += 0.9) ribs.push(box(0.1, wallH, 0.06, s * (W + 0.1), BELT_Y + wallH / 2 - 0.04, z));
      ribs.push(box(0.16, 0.08, wl, s * (W + 0.08), BELT_Y + wallH, wzc));
      skirt.push(box(0.02, 0.16, len, s * (W - 0.01), BELT_Y + 0.08, zc));
      this.col(s * (W + 0.05), BELT_Y + wallH / 2, wzc, 0.1, wallH + 0.1, wl);
    }
    this.add(merge(walls), paint); this.add(merge(ribs), paint); this.add(merge(skirt), M.rubber, this.root, false);
    // funnel: flared plates at 45 deg, a rear wall and the wheel-stop curb trucks back up against
    const fl = Z_FUNNEL - Z_DROP, fzc = (Z_FUNNEL + Z_DROP) / 2, rise = 1.25, slope = Math.hypot(rise, rise);
    const fun = [], fribs = [];
    for (const s of [-1, 1]) {
      const cx = s * (W + rise / 2), cy = BELT_Y + rise / 2;
      fun.push(box(slope, 0.06, fl, cx, cy, fzc, null, 0, 0, s * Math.PI / 4));
      for (let z = Z_DROP + 0.4; z < Z_FUNNEL; z += 1.1) fribs.push(box(slope, 0.12, 0.06, cx + s * 0.06, cy - 0.06, z, null, 0, 0, s * Math.PI / 4));
      fribs.push(box(0.12, 0.12, fl, s * (W + rise + 0.02), BELT_Y + rise, fzc));
      // A-frame legs under the flared plates
      for (const z of [Z_DROP + 0.3, fzc, Z_FUNNEL - 0.3]) fribs.push(box(0.12, BELT_Y + rise, 0.12, s * (W + rise), (BELT_Y + rise) / 2, z));
      this.col(cx + s * 0.03, cy - 0.03, fzc, slope, 0.08, fl, 0, 0, s * Math.PI / 4);
    }
    this.add(merge(fun), paint); this.add(merge(fribs), paint);
    // wheel-stop curb with hazard stripes (catches the truck chassis, so the tipping body hangs over the funnel)
    const curbZ = Z_DROP - 0.1;
    this.add(box(2 * (W + rise) + 0.3, 0.6, 0.2, 0, 0.3, curbZ), M.concretePlain);
    this.add(box(2 * (W + rise) + 0.32, 0.3, 0.02, 0, 0.42, curbZ - 0.11), M.hazard, this.root, false);
    this.col(0, 0.3, curbZ, 2 * (W + rise) + 0.3, 0.6, 0.2);
    // tail drum + guard under the funnel end
    this.add(merge([cyl(0.2, 0.2, 2 * W + 0.1, 18, 0, 0.15, Z_DROP + 0.25, null, 0, 0, Math.PI / 2), box(2 * W + 0.3, 0.06, 0.4, 0, 0.42, Z_DROP + 0.2)]), frame);
    // signs
    const sign = (text, w, h, x, y, z, ry, bg = '#f2b705', fg = '#16171a') => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: T.labelTexture(text, { w: 1024, h: Math.round(1024 * h / w), color: fg, bg, font: '900 96px Arial' }), roughness: 0.5 }));
      m.position.set(x, y, z); m.rotation.y = ry; this.root.add(m); return m;
    };
    for (const s of [-1, 1]) {
      this.add(merge([box(0.08, 2.4, 0.08, s * 3.3, 1.2, Z_DROP - 0.1), box(1.9, 0.5, 0.03, s * 3.3, 2.25, Z_DROP - 0.13)]), M.galvanized);
      sign('▲ TRUCKS: BACK UP · TIP ▲', 1.86, 0.46, s * 3.3, 2.25, Z_DROP - 0.15, Math.PI);
    }
    sign('INTAKE · KEEP CLEAR', 2.2, 0.32, -(W + 0.14), BELT_Y + 0.75, wzc, -Math.PI / 2);
    sign('INTAKE · KEEP CLEAR', 2.2, 0.32, W + 0.14, BELT_Y + 0.75, wzc, Math.PI / 2);

    // ================================================================ block compactor
    const C = new THREE.Group(); this.root.add(C); this.comp = C;
    const cz0 = Z_IN, cz1 = Z_CF, czc = (cz0 + cz1) / 2, cl = cz1 - cz0, cw = 1.75;
    // base frame + chamber walls (left, right, roof, back with intake tunnel, front with door frame)
    this.add(merge([box(2 * cw + 0.3, 0.3, cl + 0.3, 0, 0.15, czc)]), frame, C);
    const hz0 = czc - 1.25, hz1 = czc + 1.25;
    const sh = [box(0.12, 2.45, cl, -cw, 1.52, czc), box(0.12, 2.45, cl, cw, 1.52, czc),
      box(cw - 1.25, 0.14, cl, -(1.25 + (cw - 1.25) / 2), 2.75, czc), box(cw - 1.25, 0.14, cl, 1.25 + (cw - 1.25) / 2, 2.75, czc),
      box(2.5, 0.14, hz0 - cz0, 0, 2.75, (cz0 + hz0) / 2), box(2.5, 0.14, cz1 - hz1, 0, 2.75, (hz1 + cz1) / 2)];
    this.add(box(2.5, 0.04, 2.5, 0, 2.5, czc), new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.95 }), C, false);
    // back wall around the intake opening
    sh.push(box(2 * cw, 1.2, 0.12, 0, 2.15, cz0 + 0.06), box(cw - W, 1.3, 0.12, -(W + (cw - W) / 2), 0.95, cz0 + 0.06), box(cw - W, 1.3, 0.12, W + (cw - W) / 2, 0.95, cz0 + 0.06));
    // front wall around the cube door
    sh.push(box(2 * cw, 1.0, 0.12, 0, 2.25, cz1 - 0.06), box(cw - 0.85, 1.6, 0.12, -(0.85 + (cw - 0.85) / 2), 1.0, cz1 - 0.06), box(cw - 0.85, 1.6, 0.12, 0.85 + (cw - 0.85) / 2, 1.0, cz1 - 0.06));
    this.add(merge(sh), paint, C);
    // heavy stiffener ribs + corner posts
    const rb = [];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) rb.push(box(0.14, 2.45, 0.16, s * (cw + 0.08), 1.52, cz0 + 0.35 + k * (cl - 0.7) / 4));
      rb.push(box(0.16, 0.18, cl + 0.1, s * (cw + 0.08), 2.68, czc), box(0.16, 0.18, cl + 0.1, s * (cw + 0.08), 0.42, czc));
    }
    this.add(merge(rb), frame, C);
    // intake tunnel with rubber curtain strips
    const curtain = [];
    for (let i = 0; i < 9; i++) curtain.push(box(2 * W / 9 - 0.02, 1.1, 0.02, -W + (i + 0.5) * (2 * W / 9), BELT_Y + 0.6, cz0 - 0.25));
    this.add(merge(curtain), M.rubber, C, false);
    this.add(merge([box(2 * W + 0.3, 0.12, 0.6, 0, BELT_Y + 1.2, cz0 - 0.25), box(0.12, 1.2, 0.6, -W - 0.1, BELT_Y + 0.6, cz0 - 0.25), box(0.12, 1.2, 0.6, W + 0.1, BELT_Y + 0.6, cz0 - 0.25)]), frame, C);
    this.add(box(2 * W + 0.32, 0.12, 0.02, 0, BELT_Y + 1.32, cz0 - 0.56), M.hazard, C, false);
    // dark interior seen through the curtains
    this.add(box(2 * W, 1.2, 0.02, 0, BELT_Y + 0.6, cz0 + 0.2), M.blackPaint, C, false);
    // front guillotine door (slides up to let the cube out) with hazard stripes, guide rails
    const door = new THREE.Group(); door.position.set(0, 0, cz1 + 0.02); C.add(door); this.door = door;
    this.add(merge([box(1.72, 1.32, 0.1, 0, 1.3, 0)]), frame, door);
    this.add(box(1.72, 0.3, 0.01, 0, 0.8, 0.055), M.hazard, door, false);
    this.add(merge([box(0.12, 4.0, 0.14, -0.95, 2.3, cz1 + 0.06), box(0.12, 4.0, 0.14, 0.95, 2.3, cz1 + 0.06), box(2.0, 0.16, 0.18, 0, 4.3, cz1 + 0.04)]), frame, C);
    // door cylinder hanging from the top beam
    this.add(merge([cyl(0.08, 0.08, 0.8, 14, 0, 3.8, cz1 + 0.02), cyl(0.1, 0.1, 0.08, 14, 0, 4.18, cz1 + 0.02)]), M.blackPaint, C);
    this.doorRod = this.add(cyl(0.035, 0.035, 1, 10, 0, 0, 0), M.chrome, C);
    // gantry on the roof: four posts, top beams, the main press cylinder and the platen that drives into the chamber
    const gy0 = 2.82, gy1 = 4.9;
    const g = [];
    for (const x of [-1.35, 1.35]) for (const z of [czc - 1.25, czc + 1.25]) g.push(box(0.22, gy1 - gy0, 0.22, x, (gy0 + gy1) / 2, z));
    g.push(box(2.95, 0.3, 0.3, 0, gy1, czc - 1.25), box(2.95, 0.3, 0.3, 0, gy1, czc + 1.25), box(0.4, 0.34, 2.8, 0, gy1 + 0.02, czc));
    for (const x of [-1.35, 1.35]) g.push(box(0.12, 0.12, 2.5, x, gy0 + 0.6, czc));
    this.add(merge(g), paint, C);
    this.add(merge([cyl(0.36, 0.36, 1.3, 28, 0, gy1 + 0.75, czc), cyl(0.42, 0.42, 0.14, 28, 0, gy1 + 0.12, czc), cyl(0.42, 0.42, 0.14, 28, 0, gy1 + 1.38, czc)]), M.blackPaint, C);
    this.pressRod = this.add(cyl(0.16, 0.16, 1, 18, 0, 0, 0), M.chrome, C);
    const platen = new THREE.Group(); C.add(platen); this.platen = platen; platen.position.set(0, 0, czc);
    this.add(merge([box(2.4, 0.28, 2.4, 0, 0, 0), box(0.6, 0.3, 0.6, 0, 0.26, 0)]), frame, platen);
    for (const s of [-1, 1]) this.add(box(2.4, 0.1, 0.02, 0, 0, s * 1.21), M.hazard, platen, false);
    this.platenY = { up: 4.35, down: 2.8 };
    // hydraulic power pack on the right: oil tank, electric motor + pump, filters, hoses up to the cylinder
    const pp = [];
    pp.push(box(1.0, 1.0, 1.7, cw + 0.75, 0.8, czc + 0.6), box(1.05, 0.06, 1.75, cw + 0.75, 1.33, czc + 0.6));
    this.add(merge(pp), M.paintGrey, C);
    this.add(merge([cyl(0.25, 0.25, 0.8, 22, cw + 0.75, 1.62, czc + 0.25, null, Math.PI / 2), cyl(0.27, 0.27, 0.12, 22, cw + 0.75, 1.62, czc + 0.68, null, Math.PI / 2)]), M.paintBlue, C);
    this.add(merge([cyl(0.08, 0.08, 0.3, 12, cw + 0.45, 1.5, czc + 1.1), cyl(0.08, 0.08, 0.3, 12, cw + 0.65, 1.5, czc + 1.1)]), M.paintRed, C);
    const hoses = [tube(V(cw + 0.6, 1.4, czc + 1.2), V(cw + 0.25, 3.2, czc + 1.0), 0.04, 8), tube(V(cw + 0.25, 3.2, czc + 1.0), V(0.35, gy1 + 1.2, czc + 0.3), 0.04, 8),
      tube(V(cw + 0.75, 1.4, czc + 1.25), V(cw + 0.32, 3.4, czc + 1.1), 0.04, 8), tube(V(cw + 0.32, 3.4, czc + 1.1), V(0.3, gy1 + 0.3, czc + 0.35), 0.04, 8)];
    this.add(merge(hoses), M.rubber, C, false);
    this.col(cw + 0.75, 0.8, czc + 0.6, 1.0, 1.6, 1.7);
    // control cabinet on the left with status lamps and a screen
    this.add(merge([box(0.5, 1.4, 0.9, -cw - 0.4, 1.0, czc + 1.2), box(0.55, 0.06, 0.95, -cw - 0.4, 1.73, czc + 1.2)]), M.paintGrey, C);
    this.lampG = this.add(cyl(0.06, 0.06, 0.12, 12, -cw - 0.4, 1.83, czc + 1.0), new THREE.MeshStandardMaterial({ color: 0x29ff6a, emissive: 0x18c040, emissiveIntensity: 1 }), C, false);
    this.lampA = this.add(cyl(0.06, 0.06, 0.12, 12, -cw - 0.4, 1.83, czc + 1.4), M.amberLens.clone(), C, false);
    this.screenCanvas = document.createElement('canvas'); this.screenCanvas.width = 256; this.screenCanvas.height = 160;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas); this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.375), new THREE.MeshStandardMaterial({ map: this.screenTex, emissive: 0xffffff, emissiveMap: this.screenTex, emissiveIntensity: 0.8 }));
    scr.position.set(-cw - 0.66, 1.25, czc + 1.2); scr.rotation.y = -Math.PI / 2; C.add(scr);
    this.col(-cw - 0.4, 0.75, czc + 1.2, 0.5, 1.5, 0.9);
    // brand plate
    { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.36), new THREE.MeshStandardMaterial({ map: T.labelTexture('GRITLINE BP-40 COMPACTOR', { w: 1024, h: 205, color: '#ffffff', bg: '#16171a', font: '900 78px Arial' }), roughness: 0.5 }));
      m.position.set(cw + 0.16, 2.2, czc - 0.6); m.rotation.y = Math.PI / 2; C.add(m); }
    this.col(0, 1.5, czc + 0.1, 2 * cw + 0.3, 3.0, cl - 0.2);
    this.col(0, gy1, czc, 3.0, 0.4, 2.8);
    // short roller apron from the door to the incline tail
    const ap = [];
    for (let z = cz1 + 0.15; z < TAIL.z - 0.1; z += 0.22) ap.push(cyl(0.07, 0.07, 1.4, 12, 0, 0.62 + (z - cz1) * 0.12, z, null, 0, 0, Math.PI / 2));
    ap.push(box(0.08, 0.25, TAIL.z - cz1, -0.75, 0.6, (cz1 + TAIL.z) / 2), box(0.08, 0.25, TAIL.z - cz1, 0.75, 0.6, (cz1 + TAIL.z) / 2));
    this.add(merge(ap), M.steel, C);

    // ================================================================ cleated incline belt into the crusher hopper
    const L = this.liftLen, ang = Math.atan2(HEAD.y - TAIL.y, HEAD.z - TAIL.z);
    const lift = new THREE.Group(); lift.position.copy(TAIL); lift.rotation.x = -ang; this.root.add(lift);
    const lw = 0.8; // half belt width
    const lf = [];
    for (const s of [-1, 1]) {
      lf.push(box(0.1, 0.32, L + 0.3, s * (lw + 0.12), -0.12, L / 2));            // stringer
      lf.push(box(0.04, 0.4, L, s * (lw + 0.05), 0.2, L / 2));                     // skirt plate
      for (let z = 0.4; z < L; z += 0.9) lf.push(box(0.06, 0.06, 0.06, s * (lw + 0.14), 0.0, z), tube(V(s * (lw + 0.12), -0.24, z), V(s * (lw + 0.12), 0.02, z + 0.9), 0.025, 6));
    }
    for (let z = 0.6; z < L; z += 1.1) lf.push(cyl(0.06, 0.06, 2 * lw, 10, 0, -0.06, z, null, 0, 0, Math.PI / 2), cyl(0.05, 0.05, 2 * lw, 10, 0, -0.32, z + 0.55, null, 0, 0, Math.PI / 2));
    lf.push(cyl(0.22, 0.22, 2 * lw + 0.1, 20, 0, -0.1, 0, null, 0, 0, Math.PI / 2), cyl(0.26, 0.26, 2 * lw + 0.1, 20, 0, -0.1, L, null, 0, 0, Math.PI / 2));
    this.add(merge(lf), M.paintGrey, lift);
    const ct = chevronTexture(); ct.repeat.set(1, L / 0.9); this.liftTex = ct;
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(2 * lw, L), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.9 }));
    lb.rotation.x = -Math.PI / 2; lb.position.set(0, 0.03, L / 2); lb.receiveShadow = true; lift.add(lb);
    // head: drive motor + gearbox, hood and drop chute over the hopper
    this.add(merge([cyl(0.2, 0.2, 0.55, 18, lw + 0.5, -0.1, L, null, 0, 0, Math.PI / 2), box(0.4, 0.45, 0.4, lw + 0.25, -0.1, L)]), M.paintBlue, lift);
    this.add(merge([box(2 * lw + 0.3, 0.06, 1.1, 0, 0.55, L - 0.2), box(0.06, 0.62, 1.1, -lw - 0.15, 0.25, L - 0.2), box(0.06, 0.62, 1.1, lw + 0.15, 0.25, L - 0.2)]), M.paintGrey, lift);
    // support trestles: A-frame legs from the ground to the stringers
    const tr = [];
    for (const z of [-13.2, -9.6]) {
      const yb = TAIL.y + (z - TAIL.z) * Math.tan(ang) - 0.35;
      for (const s of [-1, 1]) { tr.push(tube(V(s * 1.6, 0, z - 0.6), V(s * (lw + 0.12), yb, z), 0.07, 8), tube(V(s * 1.6, 0, z + 0.6), V(s * (lw + 0.12), yb, z), 0.07, 8)); tr.push(box(0.4, 0.04, 1.5, s * 1.6, 0.02, z)); }
      tr.push(box(2 * (lw + 0.12), 0.12, 0.12, 0, yb, z), tube(V(-1.4, 0.3, z), V(1.4, yb * 0.7, z), 0.04, 6));
      this.col(0, yb / 2, z, 3.2, yb, 0.3);
    }
    this.add(merge(tr), M.paintGrey);
    // a walkway-height collider under the sloped belt so nothing walks through it
    const mid = TAIL.clone().add(HEAD).multiplyScalar(0.5);
    this.col(0, mid.y - 0.15, mid.z, 2 * lw + 0.4, 0.5, L, -ang);

    // cubes: one material per cube (its own colours); shared geometry
    this.cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    this.root.updateMatrixWorld(true);
    this.drawScreen();
  }

  buildPhysics() {
    const w = this.physics.world, r = this.crusher.root;
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(r.position.x, 0, r.position.z)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), r.rotation.y)));
    for (const c of this.colliders) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.rx, c.ry, c.rz));
      w.createCollider(RAPIER.ColliderDesc.cuboid(c.sx / 2, c.sy / 2, c.sz / 2).setTranslation(c.x, c.y, c.z).setRotation(q).setFriction(0.6), body);
    }
  }

  // ---------------------------------------------------------------- simulation
  // authority: drive the belt, swallow blocks at the compactor, run the press. cb = { eat(p), crush(cube), event(e) }
  update(dt, demo, fx, audio, cb) {
    const now = performance.now();
    if (cb) {
      const _p = new THREE.Vector3();
      for (const p of demo.pieces) {
        if (p.state !== LOOSE || !p.body) continue;
        const q = p.pos;
        if (q.x < this.wmin.x || q.x > this.wmax.x || q.z < this.wmin.z || q.z > this.wmax.z || q.y > this.wmax.y) continue;
        _p.copy(q).applyMatrix4(this.inv);
        if (_p.z < Z_DROP - 0.3 || _p.z > Z_IN + 0.3 || _p.y > BELT_Y + 2.2) continue;
        // swallowed by the compactor once inside the curtain
        if (_p.z > Z_IN - 0.55 && Math.abs(_p.x) < W + 0.1) { this.eat(p, cb, fx); continue; }
        // on the belt: carried toward the compactor and kept off the side walls
        if (Math.abs(_p.x) < W + 0.2 && _p.y < BELT_Y + 1.0) {
          const lv = p.body.linvel();
          const vz = BELT_SPEED, vx = -_p.x * 0.6;
          // belt direction in world space (the line is aligned with the crusher's -z..+z axis)
          const ry = this.crusher.root.rotation.y, c = Math.cos(ry), s = Math.sin(ry);
          const wx = vx * c + vz * s, wz = -vx * s + vz * c;
          p.body.setLinvel({ x: lv.x + (wx - lv.x) * Math.min(1, dt * 8), y: lv.y, z: lv.z + (wz - lv.z) * Math.min(1, dt * 8) }, true);
        }
      }
      // press cycle
      if (this.phase === 'idle') {
        this.idleT += dt;
        if (this.charge.length >= CHARGE_N || (this.charge.length && this.idleT > 6)) {
          const parts = this.charge.splice(0, CHARGE_N);
          const cube = this.makeCube(parts);
          cb.event(['ix', 'press', cube.kg, cube.color.r, cube.color.g, cube.color.b, parts.map((q) => [Math.round(q.kg * 10) / 10, +q.color.r.toFixed(3), +q.color.g.toFixed(3), +q.color.b.toFixed(3)])]);
          this.startPress(cube, audio);
        }
      }
    }
    // ---- press / eject animation (host and clients alike)
    if (this.phase !== 'idle') {
      this.phaseT += dt;
      if (this.phase === 'press') {
        const k = this.phaseT / PRESS_T, d = Math.sin(Math.min(1, k) * Math.PI);
        this.platenAt(this.platenY.up + (this.platenY.down - this.platenY.up) * d);
        if (k > 0.45 && !this.crunched) { this.crunched = true; audio.crunch(this.comp.localToWorld(V(0, 2.4, (Z_IN + Z_CF) / 2))); }
        if (k >= 1) { this.phase = 'eject'; this.phaseT = 0; this.pending.state = 'eject'; this.pending.mesh.visible = true; }
      } else if (this.phase === 'eject') {
        const k = Math.min(1, this.phaseT / EJECT_T);
        this.door.position.y = Math.sin(k * Math.PI) * 1.25;
        if (k >= 1) { this.phase = 'idle'; this.phaseT = 0; this.idleT = 0; this.pending = null; this.door.position.y = 0; }
      }
    } else this.platenAt(this.platenY.up);
    // ---- cubes
    const keep = [];
    for (const cube of this.cubes) {
      const h = cube.size / 2;
      if (cube.state === 'press') { cube.mesh.visible = false; keep.push(cube); continue; }
      if (cube.state === 'eject') {
        cube.u = (cube.u || 0) + dt * 0.9;
        const a = V(0, 0.6 + h, (Z_IN + Z_CF) / 2 + 0.6), b = this.onBelt(h, h);
        cube.mesh.position.lerpVectors(a, b, Math.min(1, cube.u / 1.4));
        cube.mesh.rotation.x = -this.ang * Math.max(0, cube.u / 1.4 - 0.8) * 5;
        if (cube.u >= 1.4) { cube.state = 'lift'; cube.s = h; }
      } else if (cube.state === 'lift') {
        // keep a gap behind the cube in front
        cube.s += LIFT_SPEED * dt;
        cube.mesh.position.copy(this.onBelt(cube.s, h));
        cube.mesh.rotation.x = -this.ang;
        if (cube.s >= this.liftLen) { cube.state = 'fall'; cube.v = this.dir.clone().multiplyScalar(LIFT_SPEED); }
      } else if (cube.state === 'fall') {
        cube.v.y -= 9.8 * dt;
        cube.mesh.position.addScaledVector(cube.v, dt);
        cube.mesh.rotation.x += dt * 1.5;
        if (cube.mesh.position.y < 2.75 + h) {
          const at = cube.mesh.getWorldPosition(new THREE.Vector3());
          this.root.remove(cube.mesh); cube.mesh.material.map.dispose(); cube.mesh.material.dispose();
          if (cb) cb.crush(cube, at);
          continue;
        }
      }
      keep.push(cube);
    }
    this.cubes = keep;
    this.groundTex.offset.y -= dt * BELT_SPEED / 0.8;
    this.liftTex.offset.y -= dt * LIFT_SPEED / 0.9;
    this.lampA.material.emissiveIntensity = this.phase !== 'idle' ? 0.4 + Math.max(0, Math.sin(now * 0.012)) * 2.2 : 0.05;
    this.screenT = (this.screenT || 0) - dt;
    if (this.screenT <= 0) { this.screenT = 0.3; this.drawScreen(); }
  }

  // centre of a cube of half-size h sitting on the incline belt, s metres up from the tail
  onBelt(s, h) { return TAIL.clone().addScaledVector(this.dir, s).addScaledVector(this.nrm, h + 0.04); }

  platenAt(y) {
    this.platen.position.y = y;
    const top = 4.9 + 0.12, bot = y + 0.4;
    this.pressRod.scale.set(1, Math.max(0.01, top - bot), 1);
    this.pressRod.position.set(0, (top + bot) / 2, (Z_IN + Z_CF) / 2);
    const dTop = 3.4, dBot = 1.96 + this.door.position.y;
    this.doorRod.scale.set(1, Math.max(0.01, dTop - dBot), 1);
    this.doorRod.position.set(0, (dTop + dBot) / 2, Z_CF + 0.02);
  }

  eat(p, cb, fx) {
    const color = (p.color ? p.color : new THREE.Color(p.type.dust)).clone();
    this.charge.push({ kg: p.kg, color });
    this.idleT = 0;
    if (fx) fx.dust(p.pos, color.getHex(), 2, 0.6, { alpha: 0.35 });
    cb.eat(p, color);
  }

  makeCube(parts) {
    const kg = parts.reduce((a, q) => a + q.kg, 0) || 1;
    const color = new THREE.Color(0, 0, 0);
    for (const q of parts) { color.r += q.color.r * q.kg / kg; color.g += q.color.g * q.kg / kg; color.b += q.color.b * q.kg / kg; }
    // 1.2 m hollow blocks (0.43 m3 each) squeezed to about 40 % of their volume
    const size = THREE.MathUtils.clamp(Math.cbrt(parts.length * 0.43 * 0.4), 0.6, 1.15);
    const mesh = new THREE.Mesh(this.cubeGeo, cubeMaterial(parts));
    mesh.scale.setScalar(size); mesh.castShadow = mesh.receiveShadow = true; mesh.visible = false;
    this.root.add(mesh);
    const cube = { kg, color, parts, size, mesh, state: 'press' };
    this.cubes.push(cube);
    return cube;
  }

  startPress(cube, audio) {
    this.phase = 'press'; this.phaseT = 0; this.crunched = false; this.pending = cube;
    this.made++;
  }

  // client side: mirror the host's events
  applyEvent(e, audio) {
    if (e[1] === 'eat') { this.charge.push({ kg: e[2], color: new THREE.Color(e[3], e[4], e[5]) }); }
    else if (e[1] === 'press') {
      const parts = e[6].map(([kg, r, g, b]) => ({ kg, color: new THREE.Color(r, g, b) }));
      this.charge.splice(0, parts.length);
      this.startPress(this.makeCube(parts), audio);
    }
  }

  drawScreen() {
    const c = this.screenCanvas.getContext('2d');
    c.fillStyle = '#0b1a12'; c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#5dff8a'; c.font = 'bold 20px monospace'; c.fillText('BP-40 COMPACTOR', 10, 26);
    c.font = '17px monospace';
    c.fillText(`STATUS ${this.phase === 'idle' ? 'READY' : this.phase === 'press' ? 'PRESSING' : 'EJECT'}`, 10, 54);
    c.fillText(`CHARGE ${this.charge.length}/${CHARGE_N}`, 10, 78);
    c.fillText(`CUBES  ${this.made}`, 10, 102);
    for (let i = 0; i < CHARGE_N; i++) {
      const q = this.charge[i];
      c.fillStyle = q ? '#' + q.color.getHexString() : '#1d3527';
      c.fillRect(10 + i * 47, 118, 40, 30);
    }
    this.screenTex.needsUpdate = true;
  }

  serialize() {
    const enc = (q) => [Math.round(q.kg * 10) / 10, +q.color.r.toFixed(3), +q.color.g.toFixed(3), +q.color.b.toFixed(3)];
    // cubes still in the line are saved as the blocks they were made of: they go back into the chamber
    const all = [...this.charge, ...this.cubes.flatMap((c) => c.parts)];
    return { charge: all.map(enc), made: this.made };
  }
  restore(d) {
    for (const c of this.cubes) { this.root.remove(c.mesh); c.mesh.material.map.dispose(); c.mesh.material.dispose(); }
    this.cubes = []; this.phase = 'idle'; this.phaseT = 0; this.pending = null; this.door.position.y = 0;
    this.charge = ((d && d.charge) || []).map(([kg, r, g, b]) => ({ kg, color: new THREE.Color(r, g, b) }));
    this.made = (d && d.made) || 0;
    this.drawScreen();
  }
}
