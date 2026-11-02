// Special excavators: the tools for nine new attachments, the extras some of them carry on the house (block cage,
// water tank, wrecking ball on a chain) and the BRAVO BL4 backhoe loader body.
// Attachment local frame (as in attachments.js): origin at the stick-tip pivot, +z continues along the stick,
// -y faces the machine.
import * as THREE from 'three';
import { mergeG, rbox, bx, cy, pinX, hose, bolts, boltCircle, stick as sticker, tyreLathe, wheelRim, workLight, label, add, V, tubeAB, grille } from './detail.js';
import { coupler, rotator, sidePlate, curvePts, shell } from './attachments.js';
import { modernCab } from './mx-vehicles.js';
import { cylinder } from './mx-excavator.js';

const mesh = (geo, mat, parent, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
const point = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

export const FUN_KINDS = new Set(['magnet', 'xball', 'blaster', 'cutter', 'saw', 'auger', 'plate', 'forks', 'jet']);
// tools that the tool button switches on and off (they spawn switched off)
export const STARTS_OFF = new Set([...FUN_KINDS]);

// ------------------------------------------------------------------------------------------------ attachments
export function buildFunAttachment(kind, K, out) {
  const A = out.group;
  out.behaviour = kind; out.pieces = 0; out.cylAnchor = V(0, 0.32, 0.05);

  if (kind === 'magnet') {
    // rotator + yoke, a thick electromagnet disc with cooling fins, terminal box, power cable and a glowing coil ring
    rotator(K, A, 0.26, 0.62); coupler(K, A, 0.45);
    const R = 0.92, z0 = 1.25, H = 0.42;
    mesh(mergeG([rbox(0.5, 0.3, 0.3, 0.04, 0, 0, 0.95), rbox(0.08, 0.6, 0.45, 0.02, 0.28, 0, 1.08), rbox(0.08, 0.6, 0.45, 0.02, -0.28, 0, 1.08), pinX(0.07, 0.7, 0, 0, 1.1)]), K.dark, A);
    mesh(mergeG([cy(R, R, H, 48, 0, 0, z0 + H / 2, Math.PI / 2), cy(R * 0.55, R * 0.62, 0.1, 32, 0, 0, z0 - 0.04, Math.PI / 2)]), K.paint, A);
    const fins = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; fins.push(bx(0.42, 0.035, 0.16, Math.cos(a) * 0.62, Math.sin(a) * 0.62, z0 - 0.04, 0, 0, a)); }
    mesh(mergeG([...fins, rbox(0.34, 0.24, 0.16, 0.03, 0.32, 0.38, z0 - 0.08)]), K.dark, A);
    mesh(mergeG([cy(R - 0.06, R - 0.06, 0.05, 48, 0, 0, z0 + H + 0.02, Math.PI / 2), boltCircle(V(0, 0, z0 - 0.005), R - 0.08, 20, V(0, 0, -1), 0.018)]), K.steel, A);
    mesh(cy(R + 0.012, R + 0.012, 0.12, 48, 0, 0, z0 + 0.1, Math.PI / 2, 0, 0, true), K.hazard, A);
    mesh(hose([V(0.32, 0.42, z0 - 0.12), V(0.45, 0.55, 0.65), V(0.25, 0.5, -0.4)], 0.045, 24), K.black, A);
    out.glow = new THREE.MeshStandardMaterial({ color: 0x223a88, emissive: 0x3a6cff, emissiveIntensity: 0, roughness: 0.4 });
    const ring = mesh(new THREE.TorusGeometry(R - 0.12, 0.035, 8, 56).translate(0, 0, z0 + H + 0.05), out.glow, A, false); ring.userData.keep = true;
    const core = mesh(cy(0.3, 0.3, 0.02, 32, 0, 0, z0 + H + 0.05, Math.PI / 2), out.glow, A, false); core.userData.keep = true;
    out.face = point(A, 0, 0, z0 + H + 0.06); out.faceZ = z0 + H + 0.06; out.magR = R;
    out.grab = out.face;
    out.probes.push({ obj: point(A, 0, 0, z0 + 0.2), r: 0.8 });
    out.colliders.push({ obj: A, boxes: [[0, 0, z0 + H / 2, R * 1.8, R * 1.8, H]] });
    out.cap = 10;
  } else if (kind === 'xball') {
    // hook block on the coupler: the 2 t ball hangs from it on a chain (built in funExtras)
    coupler(K, A, 0.45);
    mesh(mergeG([rbox(0.38, 0.32, 0.55, 0.05, 0, 0, 0.5), cy(0.09, 0.09, 0.46, 14, 0, 0, 0.82, 0, 0, Math.PI / 2)]), K.dark, A);
    mesh(new THREE.TorusGeometry(0.13, 0.04, 10, 20).rotateY(Math.PI / 2).translate(0, 0, 0.98), K.steel, A);
    out.hook = point(A, 0, 0, 1.05);
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.5, 0.4, 0.4, 0.6]] });
  } else if (kind === 'blaster') {
    // suction / blast nozzle: flared steel cone with reinforcing rings, rubber bumper, flex hose
    coupler(K, A, 0.45);
    mesh(mergeG([cy(0.34, 0.34, 0.5, 28, 0, 0, 0.5, Math.PI / 2), cy(0.66, 0.34, 1.0, 36, 0, 0, 1.25, Math.PI / 2, 0, 0, true), cy(0.36, 0.36, 0.06, 28, 0, 0, 0.78, Math.PI / 2)]), K.paint, A);
    mesh(mergeG([new THREE.TorusGeometry(0.66, 0.06, 10, 40).translate(0, 0, 1.75), new THREE.TorusGeometry(0.48, 0.035, 8, 36).translate(0, 0, 1.25)]), K.rubber, A);
    const ribs = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ribs.push(tubeAB(V(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.8), V(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 1.72), 0.022, 6)); }
    mesh(mergeG(ribs), K.dark, A);
    mesh(cy(0.3, 0.3, 0.02, 24, 0, 0, 0.82, Math.PI / 2), K.black, A, false);
    mesh(hose([V(0, 0.36, 0.45), V(0, 0.75, 0.0), V(0, 0.72, -0.9)], 0.15, 24), K.rubber, A);
    out.mouth = point(A, 0, 0, 1.8); out.mouthDir = V(0, 0, 1);
    out.grab = out.mouth;
    out.probes.push({ obj: point(A, 0, 0, 1.2), r: 0.6 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 1.1, 1.2, 1.2, 1.3]] });
  } else if (kind === 'cutter') {
    // transverse twin-drum cutter: gearbox housing, motor, two drums studded with carbide picks
    coupler(K, A, 0.45);
    mesh(mergeG([rbox(0.56, 0.52, 0.95, 0.06, 0, 0, 0.78), rbox(0.72, 0.6, 0.16, 0.04, 0, 0, 0.32)]), K.paint, A);
    mesh(mergeG([cy(0.17, 0.17, 0.42, 18, 0, 0.38, 0.6), boltCircle(V(0, 0.6, 0.6), 0.12, 8, V(0, 1, 0), 0.014), cy(0.22, 0.22, 0.12, 20, 0.36, 0, 1.25, 0, 0, Math.PI / 2), cy(0.22, 0.22, 0.12, 20, -0.36, 0, 1.25, 0, 0, Math.PI / 2)]), K.dark, A);
    mesh(mergeG([hose([V(0.12, 0.3, 0.3), V(0.2, 0.55, 0.0), V(0.12, 0.45, -0.6)], 0.028, 14), hose([V(-0.12, 0.3, 0.3), V(-0.2, 0.55, 0.0), V(-0.12, 0.45, -0.6)], 0.028, 14)]), K.black, A);
    sticker(A, 'warn', 0.2, 0.282, 0, 0.8, Math.PI / 2);
    out.drums = [];
    for (const s of [-1, 1]) {
      const D = new THREE.Group(); D.position.set(s * 0.72, 0, 1.25); A.add(D);
      mesh(mergeG([cy(0.4, 0.4, 0.52, 28, 0, 0, 0, 0, 0, Math.PI / 2), cy(0.43, 0.43, 0.04, 28, s * 0.24, 0, 0, 0, 0, Math.PI / 2)]), K.paint2, D);
      const picks = [], holders = [];
      for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + r * 0.55, x = -0.2 + r * 0.135;
        const c = new THREE.ConeGeometry(0.035, 0.15, 6); c.rotateX(a); c.translate(x, Math.cos(a) * 0.5, Math.sin(a) * 0.5); picks.push(c);
        holders.push(bx(0.06, 0.08, 0.07, x, Math.cos(a) * 0.42, Math.sin(a) * 0.42, a));
      }
      mesh(mergeG(picks), K.steel, D); mesh(mergeG(holders), K.dark, D);
      out.drums.push(D);
    }
    out.zone = point(A, 0, 0, 1.25); out.zoneR = 0.95;
    out.probes.push({ obj: point(A, 0, 0, 0.8), r: 0.45 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.78, 0.6, 0.56, 1.0]] });
  } else if (kind === 'saw') {
    // 2 m diamond rock saw: arm frame, gearbox hub, segmented blade, half guard
    coupler(K, A, 0.45);
    mesh(mergeG([rbox(0.3, 0.42, 1.25, 0.04, 0, 0, 0.85), rbox(0.36, 0.5, 0.3, 0.04, 0, 0, 1.45)]), K.paint, A);
    mesh(mergeG([cy(0.24, 0.24, 0.42, 22, 0, 0, 1.6, 0, 0, Math.PI / 2), boltCircle(V(0.215, 0, 1.6), 0.16, 10, V(1, 0, 0), 0.014)]), K.dark, A);
    const B = new THREE.Group(); B.position.set(0, 0, 1.6); A.add(B);
    const segs = [];
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; segs.push(bx(0.05, 0.08, 0.14, 0, Math.cos(a) * 1.02, Math.sin(a) * 1.02, -a)); }
    mesh(mergeG([cy(0.98, 0.98, 0.025, 72, 0, 0, 0, 0, 0, Math.PI / 2)]), K.steel, B);
    mesh(mergeG(segs), K.dark, B);
    mesh(mergeG([cy(0.32, 0.32, 0.07, 28, 0, 0, 0, 0, 0, Math.PI / 2), boltCircle(V(0.04, 0, 0), 0.22, 8, V(1, 0, 0), 0.016)]), K.chrome, B);
    const gg = new THREE.CylinderGeometry(1.12, 1.12, 0.18, 40, 1, true, 0, Math.PI); gg.rotateZ(Math.PI / 2); gg.rotateX(-Math.PI / 2); gg.translate(0, 0, 1.6);
    const gm = K.paint.clone(); gm.side = THREE.DoubleSide;
    mesh(mergeG([gg]), gm, A);
    sticker(A, 'warn', 0.2, 0.16, 0, 1.0, Math.PI / 2);
    out.blade = B; out.bladeR = 1.04; out.bladeC = point(A, 0, 0, 1.6);
    out.probes.push({ obj: point(A, 0, 0, 0.9), r: 0.35 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.95, 0.38, 0.5, 1.5]] });
  } else if (kind === 'auger') {
    // drive head + motor, then a long auger: shaft, helical flight and a pilot bit
    coupler(K, A, 0.45);
    mesh(mergeG([rbox(0.48, 0.48, 0.55, 0.05, 0, 0, 0.5), rbox(0.56, 0.2, 0.2, 0.04, 0, 0, 0.82)]), K.paint, A);
    mesh(mergeG([cy(0.18, 0.18, 0.36, 18, 0.32, 0, 0.55, 0, 0, Math.PI / 2), cy(0.12, 0.12, 0.2, 16, 0, 0, 0.96, Math.PI / 2)]), K.dark, A);
    mesh(mergeG([hose([V(0.4, 0.15, 0.55), V(0.5, 0.45, 0.1), V(0.15, 0.45, -0.6)], 0.028, 14), hose([V(0.4, -0.12, 0.55), V(0.5, 0.35, 0.0), V(0.0, 0.42, -0.6)], 0.028, 14)]), K.black, A);
    const S = new THREE.Group(); S.position.set(0, 0, 1.05); A.add(S);
    class Helix extends THREE.Curve { getPoint(t, o = new THREE.Vector3()) { const a = t * 7 * Math.PI * 2; return o.set(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.12 + t * 2.0); } }
    mesh(mergeG([cy(0.07, 0.07, 2.3, 12, 0, 0, 1.15, Math.PI / 2)]), K.dark, S);
    const fl = new THREE.TubeGeometry(new Helix(), 280, 0.085, 6, false); fl.scale(1.15, 1.15, 1);
    mesh(fl, K.steel, S);
    const bit = new THREE.ConeGeometry(0.11, 0.38, 8); bit.rotateX(Math.PI / 2); bit.translate(0, 0, 2.47);
    mesh(mergeG([bit]), K.steel, S);
    out.spin = S; out.tip = point(A, 0, 0, 3.6);
    out.augerA = point(A, 0, 0, 1.3); out.augerB = point(A, 0, 0, 3.55);
    out.grab = point(A, 0, 0, 2.4);
    out.probes.push({ obj: point(A, 0, 0, 0.5), r: 0.35 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.55, 0.5, 0.5, 0.7], [0, 0, 2.2, 0.32, 0.32, 2.3]] });
  } else if (kind === 'plate') {
    // vibratory plate compactor: frame, rubber mounts, eccentric motor housing, steel base plate
    coupler(K, A, 0.45);
    const P = new THREE.Group(); P.position.set(0, 0, 0.9); A.add(P);
    mesh(mergeG([rbox(0.55, 0.5, 0.36, 0.04, 0, 0, 0.42), rbox(0.62, 0.62, 0.08, 0.02, 0, 0, 0.62)]), K.paint, A);
    mesh(mergeG([-1, 1].flatMap((sx) => [-1, 1].map((sy) => cy(0.07, 0.07, 0.14, 12, sx * 0.24, sy * 0.24, 0.72, Math.PI / 2))) ), K.rubber, A);
    mesh(mergeG([rbox(1.15, 0.9, 0.07, 0.02, 0, 0, 0.12), rbox(1.2, 0.95, 0.02, 0.01, 0, 0, 0.165)]), K.steel, P);
    mesh(mergeG([rbox(0.72, 0.58, 0.3, 0.06, 0, 0, -0.04), cy(0.16, 0.16, 0.66, 20, 0, 0, -0.05, 0, 0, Math.PI / 2)]), K.paint2, P);
    mesh(mergeG([bolts([V(0.5, 0.38, 0.08), V(-0.5, 0.38, 0.08), V(0.5, -0.38, 0.08), V(-0.5, -0.38, 0.08)], V(0, 0, -1), 0.02)]), K.dark, P);
    sticker(P, 'warn', 0.18, 0.362, 0, -0.04, Math.PI / 2);
    out.plateG = P; out.foot = point(P, 0, 0, 0.18);
    out.probes.push({ obj: point(A, 0, 0, 0.9), r: 0.5 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.6, 0.62, 0.62, 0.5], [0, 0, 1.02, 1.15, 0.9, 0.12]] });
  } else if (kind === 'forks') {
    // fork carriage with backrest and two L-shaped tines pointing toward the machine side (-y)
    coupler(K, A, 0.45);
    const tz = 1.45;
    mesh(mergeG([rbox(1.6, 0.14, 0.14, 0.03, 0, 0.05, 0.5), rbox(1.6, 0.14, 0.14, 0.03, 0, 0.05, tz - 0.05), rbox(0.14, 0.14, 1.1, 0.03, -0.72, 0.05, (0.5 + tz) / 2), rbox(0.14, 0.14, 1.1, 0.03, 0.72, 0.05, (0.5 + tz) / 2)]), K.paint, A);
    const grid = []; for (let i = 0; i < 7; i++) grid.push(bx(0.04, 0.04, tz - 0.55, -0.6 + i * 0.2, 0.05, (0.5 + tz) / 2));
    mesh(mergeG(grid), K.dark, A);
    const tines = [];
    for (const x of [-0.45, 0.45]) tines.push(rbox(0.13, 0.08, 0.95, 0.02, x, -0.02, tz - 0.42), rbox(0.13, 1.5, 0.07, 0.02, x, -0.75, tz + 0.03), bx(0.13, 0.12, 0.05, x, -1.47, tz + 0.04, 0.4));
    mesh(mergeG(tines), K.steel, A);
    sticker(A, 'lift', 0.14, 0.81, 0.05, 1.0, Math.PI / 2);
    out.tineZ = tz;
    out.grab = point(A, 0, -0.75, tz - 0.4);
    out.probes.push({ obj: point(A, 0, -0.7, tz), r: 0.4 });
    out.colliders.push({ obj: A, boxes: [[0, 0.05, 0.95, 1.6, 0.16, 1.0], [-0.45, -0.75, tz + 0.03, 0.14, 1.5, 0.08], [0.45, -0.75, tz + 0.03, 0.14, 1.5, 0.08]] });
    out.cap = 8;
  } else if (kind === 'jet') {
    // hydrodemolition lance: swivel, long chrome lance, nozzle, high-pressure hose, gauge
    coupler(K, A, 0.42);
    mesh(mergeG([cy(0.24, 0.28, 0.45, 22, 0, 0, 0.55, Math.PI / 2), rbox(0.5, 0.36, 0.3, 0.04, 0, 0, 0.25)]), K.paint, A);
    mesh(mergeG([cy(0.055, 0.055, 1.6, 14, 0, 0, 1.55, Math.PI / 2), cy(0.08, 0.08, 0.2, 14, 0, 0, 0.85, Math.PI / 2)]), K.chrome, A);
    const nz = new THREE.ConeGeometry(0.09, 0.22, 12); nz.rotateX(Math.PI / 2); nz.translate(0, 0, 2.42);
    mesh(mergeG([nz, cy(0.1, 0.1, 0.12, 14, 0, 0, 2.28, Math.PI / 2)]), K.dark, A);
    mesh(hose([V(0.22, 0.2, 0.5), V(0.45, 0.4, 0.0), V(0.3, 0.45, -0.7)], 0.05, 20), K.black, A);
    mesh(cy(0.07, 0.07, 0.03, 16, 0.25, 0, 0.55, 0, 0, Math.PI / 2), K.lens, A, false);
    out.nozzle = point(A, 0, 0, 2.55);
    out.grab = out.nozzle;
    out.probes.push({ obj: point(A, 0, 0, 0.5), r: 0.35 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.5, 0.56, 0.56, 0.7]] });
  }
}

// ------------------------------------------------------------------------------------------------ house extras
// things some special machines carry on the upper house, built after the arm (funExtras is called by buildExcavator)
export function funExtras(m) {
  const sp = m.spec, K = m.mats, U = m.upper, k = sp.attach;
  if (k === 'blaster') {
    // block cage on the counterweight: the blocks the vacuum swallows are stacked in here (2 x 2 x 2)
    const cz = -1.95, cy0 = 1.72, w = 2.7, d = 1.4, h = 1.35;
    const f = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.push(tubeAB(V(sx * w / 2, cy0, cz + sz * d / 2), V(sx * w / 2, cy0 + h, cz + sz * d / 2), 0.045, 8));
    for (const y of [cy0, cy0 + h]) for (const sz of [-1, 1]) f.push(tubeAB(V(-w / 2, y, cz + sz * d / 2), V(w / 2, y, cz + sz * d / 2), 0.04, 8));
    for (const y of [cy0, cy0 + h]) for (const sx of [-1, 1]) f.push(tubeAB(V(sx * w / 2, y, cz - d / 2), V(sx * w / 2, y, cz + d / 2), 0.04, 8));
    const bars = []; for (let i = 1; i < 9; i++) for (const sz of [-1, 1]) bars.push(tubeAB(V(-w / 2 + i * w / 9, cy0, cz + sz * d / 2), V(-w / 2 + i * w / 9, cy0 + h, cz + sz * d / 2), 0.016, 5));
    add(U, mergeG(f), K.accent); add(U, mergeG(bars), K.dark);
    add(U, bx(w, 0.06, d, 0, cy0 - 0.03, cz), K.dark);
    // a fat suction duct from the cage to the boom foot
    add(U, hose([V(0.6, cy0 + h * 0.5, cz + d / 2), V(0.6, cy0 + 1.1, 0.2), V(0.4, 1.3, 1.0)], 0.2, 24), K.rubber);
    m.magFrame = new THREE.Object3D(); m.magFrame.position.set(0, cy0, cz); U.add(m.magFrame);
    m.magSlots = [];
    for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) for (let x = 0; x < 2; x++) m.magSlots.push(V((x - 0.5) * 1.24, 0.31 + y * 0.62, (z - 0.5) * 0.66));
  }
  if (k === 'jet') {
    // water tank on the robot's back
    add(U, mergeG([cy(0.42, 0.42, 1.2, 24, 0, 1.25, -0.55, 0, 0, Math.PI / 2), cy(0.44, 0.44, 0.06, 24, 0.55, 1.25, -0.55, 0, 0, Math.PI / 2), cy(0.44, 0.44, 0.06, 24, -0.55, 1.25, -0.55, 0, 0, Math.PI / 2)]), K.accent);
    const l = label('H2O', 0.5, 0.2, '#1a6f88'); l.position.set(0, 1.25, -0.11); U.add(l);
  }
  if (k === 'xball') {
    // 2 t ball on a chain, hanging from the hook block (moves as a pendulum: stepXBall)
    const ballMat = K.dark;
    m.ball = new THREE.Group(); m.ctx.scene.add(m.ball);
    add(m.ball, mergeG([new THREE.SphereGeometry(0.55, 32, 20), cy(0.14, 0.18, 0.26, 14, 0, 0.62, 0), new THREE.TorusGeometry(0.1, 0.035, 8, 16).translate(0, 0.8, 0)]), ballMat);
    m.chainLinks = [];
    const lg = new THREE.TorusGeometry(0.075, 0.022, 6, 12); lg.scale(1, 1.6, 1);
    for (let i = 0; i < 14; i++) { const l = new THREE.Mesh(lg, K.steel); l.castShadow = true; l.userData.keep = true; m.ctx.scene.add(l); m.chainLinks.push(l); }
    m.extraMeshes.push(m.ball, ...m.chainLinks);
    m.colliderSets.push({ obj: m.ball, boxes: [[0, 0, 0, 1.0, 1.0, 1.0]], breaks: true, ball: true });
    m.ballState = null; m.xball = true;
    m.defaultsOverride = { boom: -0.8, stick: 1.1, curl: 0.5 };
  }
  m.funIdle = (dt) => funIdle(m, dt);
}

// the chain shortens / lengthens with the tool button
export function stepXBall(m, dt, groundAt) {
  const hook = m.att.hook.getWorldPosition(new THREE.Vector3());
  const L = (m.openTarget > 0.5 ? 3.0 : 1.4) * m.s;
  m.chainL = m.chainL == null ? L : m.chainL + Math.sign(L - m.chainL) * Math.min(Math.abs(L - m.chainL), dt * 1.5);
  // first frame, or the machine was moved / turned under the ball: hang it straight under the hook again
  if (!m.ballState || m.ballState.p.distanceTo(hook) > m.chainL * 1.6 + 0.5) m.ballState = { p: hook.clone().add(V(0, -m.chainL, 0)), v: V(0, 0, 0) };
  const b = m.ballState, steps = 4, h = dt / steps, r = 0.55 * m.s;
  for (let i = 0; i < steps; i++) {
    b.v.y -= 9.81 * h; b.v.multiplyScalar(1 - 0.12 * h);
    b.p.addScaledVector(b.v, h);
    const d = b.p.clone().sub(hook), len = d.length();
    if (len > m.chainL) { d.multiplyScalar(1 / len); b.p.copy(hook).addScaledVector(d, m.chainL); const vr = b.v.dot(d); if (vr > 0) b.v.addScaledVector(d, -vr); }
    const gy = groundAt(b.p.x, b.p.z) + r;
    if (b.p.y < gy) { b.p.y = gy; if (b.v.y < 0) b.v.y *= -0.2; b.v.x *= 0.97; b.v.z *= 0.97; }
  }
  m.ball.position.copy(b.p); m.ball.scale.setScalar(m.s);
  m.ball.lookAt(hook); m.ball.rotateX(Math.PI / 2);
  const top = b.p.clone().add(hook.clone().sub(b.p).setLength(0.8 * m.s));
  const n = m.chainLinks.length, dir = hook.clone().sub(top), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  for (let i = 0; i < n; i++) {
    const l = m.chainLinks[i];
    l.position.copy(top).addScaledVector(dir, (i + 0.5) / n);
    l.quaternion.copy(q); l.rotateY(i % 2 ? Math.PI / 2 : 0);
    l.scale.set(m.s, (dir.length() / n) / (0.075 * 1.6 * 2 * 0.8), m.s);
  }
  return b;
}

// every client, every frame: spinning drums / blade / auger, the magnet glow, the vibrating plate, the water jet
export function funIdle(m, dt) {
  const a = m.att; if (!a) return;
  const on = m.openTarget > 0.5;
  m.spinV = (m.spinV || 0) + ((on ? 1 : 0) - (m.spinV || 0)) * Math.min(1, dt * (on ? 2.5 : 1));
  const sv = m.spinV;
  if (a.drums) for (const [i, d] of a.drums.entries()) d.rotation.x += dt * sv * 14 * (i ? 1 : -1);
  if (a.blade) a.blade.rotation.x += dt * sv * 30;
  if (a.spin) a.spin.rotation.z += dt * sv * 12;
  if (a.glow) a.glow.emissiveIntensity = on ? 1.6 + Math.sin(performance.now() * 0.02) * 0.4 : 0;
  if (a.plateG) { const t = performance.now() * 0.09; a.plateG.position.set(sv * Math.sin(t * 1.3) * 0.02, sv * Math.cos(t) * 0.02, 0.9 + sv * Math.sin(t * 2.1) * 0.03); }
  if (m.xball) m.ballSt = stepXBall(m, dt, (x, z) => m.groundAt(x, z));
  if (a.nozzle) jetBeam(m, dt, on);
  if (m.legs) legsIdle(m, dt);
}

// the water jet: a translucent stream from the nozzle to whatever it hits (ray cast on every client)
function jetBeam(m, dt, on) {
  if (!m.jetMesh) {
    const g = new THREE.CylinderGeometry(0.05, 0.16, 1, 10, 1, true); g.translate(0, 0.5, 0);
    m.jetMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.55, depthWrite: false }));
    m.jetMesh.userData.keep = true; m.jetMesh.frustumCulled = false; m.jetMesh.visible = false;
    m.ctx.scene.add(m.jetMesh); m.extraMeshes.push(m.jetMesh);
  }
  m.jetMesh.visible = on && !m.ctx.preview;
  if (!m.jetMesh.visible) { m.jetHit = null; return; }
  const o = m.att.nozzle.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3(0, 0, 1).transformDirection(m.att.group.matrixWorld).normalize();
  const hit = m.ctx.castJet ? m.ctx.castJet(o, dir, 14, m) : null;
  const len = hit ? hit.t : 14;
  m.jetHit = hit ? { p: o.clone().addScaledVector(dir, len), dir, collider: hit.collider } : { p: o.clone().addScaledVector(dir, 14), dir, collider: null };
  m.jetMesh.position.copy(o);
  m.jetMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const wob = 1 + Math.sin(performance.now() * 0.05) * 0.12;
  m.jetMesh.scale.set(wob, len, wob);
}

// backhoe stabiliser legs: down while you dig, up when you drive
function legsIdle(m, dt) {
  const want = Math.abs(m.speed) < 0.25 && (m.driver >= 0 || m.hyd > 0.05) ? 1 : Math.abs(m.speed) > 0.4 ? 0 : m.legT ?? 0;
  m.legT = (m.legT ?? 0) + Math.sign(want - (m.legT ?? 0)) * Math.min(Math.abs(want - (m.legT ?? 0)), dt * 1.2);
  for (const l of m.legs) l.g.rotation.z = l.s * (0.08 + (1 - m.legT) * 0.95);
}

// ------------------------------------------------------------------------------------------------ backhoe loader
// BRAVO BL4: a 4x4 tractor body with a loader on the front (rot channel = loader arms, tool button = tip the
// front bucket) and a digging arm on a swing frame at the back, with stabiliser legs.
export function buildBackhoe(m, arm) {
  const sp = m.spec, K = m.mats;
  const U = new THREE.Group(); m.model.add(U); m.under = U;
  // swing frame for the rear arm (created first: every hydraulic ram is parented to m.upper)
  const post = new THREE.Group(); post.position.set(0, 1.05, -2.45); post.rotation.y = Math.PI; U.add(post);
  m.upper = new THREE.Group(); post.add(m.upper);
  const RR = 0.8, RF = 0.56, ZR = -0.95, ZF = 1.3, TR = 0.98, TF = 0.92;
  // wheels: big rear, steered front
  const rearT = tyreLathe(RR, 0.5, 0.5, { lugs: 22, style: 'chevron' }), rearR = wheelRim(0.5, 0.48, { dish: 0.08, vents: 8 });
  const frontT = tyreLathe(RF, 0.38, 0.36, { lugs: 20, style: 'chevron' }), frontR = wheelRim(0.36, 0.36, { dish: 0.06, vents: 6 });
  for (const [z, r, tx, tg, rw] of [[ZR, RR, TR, rearT, rearR], [ZF, RF, TF, frontT, frontR]]) for (const s of [-1, 1]) {
    const hub = new THREE.Group(); hub.position.set(s * tx, r, z); U.add(hub);
    const spin = new THREE.Group(); hub.add(spin); spin.userData.r = r;
    add(spin, tg, K.rubber);
    const rm = add(spin, rw.rim, m.ctx.M.paintYellow || K.paint, false), rv = add(spin, rw.vents, K.black, false);
    if (s < 0) { rm.rotation.y = Math.PI; rv.rotation.y = Math.PI; }
    m.wheels.push(spin); if (z > 0) m.steerWheels.push(hub);
  }
  // chassis, axles, engine hood with grille and lights, front counterweight/bumper
  add(U, mergeG([rbox(0.9, 0.5, 4.3, 0.05, 0, 0.78, 0.15), pinX(0.1, 2.0, 0, RR, ZR), pinX(0.08, 1.8, 0, RF, ZF), rbox(0.5, 0.36, 0.5, 0.06, 0, RR, ZR), rbox(0.4, 0.3, 0.4, 0.06, 0, RF, ZF)]), K.under);
  const hood = prismZY([[0.55, 0.95], [2.35, 0.95], [2.55, 1.15], [2.5, 1.55], [2.2, 1.72], [0.55, 1.78]], 1.05);
  add(U, hood, K.paint);
  add(U, mergeG([rbox(1.2, 0.3, 0.25, 0.05, 0, 0.72, 2.55), rbox(1.3, 0.12, 0.3, 0.03, 0, 0.92, 2.55)]), K.accent);
  grille(U, 0.75, 0.35, 0, 1.3, 2.55, 0, 18);
  for (const s of [-1, 1]) { add(U, rbox(0.2, 0.12, 0.05, 0.02, s * 0.38, 1.6, 2.24), K.lens, false); add(U, rbox(0.16, 0.08, 0.04, 0.02, s * 0.5, 0.82, 2.69), K.amber, false); }
  add(U, mergeG([cy(0.06, 0.07, 0.6, 12, 0.3, 2.05, 1.55), cy(0.08, 0.08, 0.05, 12, 0.3, 2.36, 1.55)]), K.black); // exhaust stack
  // fenders: front mudguards and big rear arches that double as steps
  const arch = (z, y, r, w, x) => shell(curvePts([[z + r * 0.95, y + r * 0.2], [z + r * 0.6, y + r * 0.85], [z, y + r * 1.05], [z - r * 0.6, y + r * 0.85], [z - r * 0.95, y + r * 0.2]].map(([a, b]) => [a, b]), 16), 0.04, w).translate(x, 0, 0);
  add(U, mergeG([arch(ZR, RR, RR + 0.12, 0.6, -TR), arch(ZR, RR, RR + 0.12, 0.6, TR), arch(ZF, RF, RF + 0.1, 0.46, -TF), arch(ZF, RF, RF + 0.1, 0.46, TF)]), K.paint);
  add(U, mergeG([rbox(0.4, 0.05, 0.3, 0.01, 1.25, 0.55, -0.1), rbox(0.4, 0.05, 0.3, 0.01, 1.25, 0.9, -0.1)]), K.dark); // steps
  // cab (the operator faces forward to drive)
  modernCab(m, U, 0, 1.0, -0.35, { w: 1.5, d: 1.75, h: 2.05, door: 1, roofMat: K.paint });
  m.door = m.anchor(U, 1.45, 0, -0.2);
  workLight(U, K, 0.55, 3.08, 0.55, 0, 0.3); workLight(U, K, -0.55, 3.08, 0.55, 0, 0.3);
  for (const s of [-1, 1]) { const l = label(sp.brand, 0.7, 0.2, '#15171a'); l.position.set(s * 0.53, 1.38, 1.6); l.rotation.y = s * Math.PI / 2; U.add(l); }

  // ---- front loader: arms pivot beside the cab, bucket on the end
  const LA = new THREE.Group(); LA.position.set(0, 1.62, -0.05); U.add(LA); m.loaderArm = LA;
  const armProf = [[-0.18, 0.14], [1.7, 0.02], [3.0, -0.9], [3.22, -1.18], [3.02, -1.25], [1.62, -0.24], [-0.18, -0.14]];
  add(LA, mergeG([sidePlate(armProf, 0.13, 0.82), sidePlate(armProf, 0.13, -0.95), pinX(0.09, 2.05, 0, 0, 0), cy(0.08, 0.08, 1.9, 14, 0, -0.95, 2.95, 0, 0, Math.PI / 2), rbox(1.7, 0.16, 0.2, 0.03, 0, -0.6, 2.4, -0.6)]), K.paint);
  const FB = new THREE.Group(); FB.position.set(0, -1.15, 3.12); LA.add(FB); m.fBucket = FB;
  const bw = 2.35, back = curvePts([[0.0, 0.42], [-0.22, 0.12], [-0.2, -0.28], [0.15, -0.42], [0.95, -0.44]], 16);
  add(FB, mergeG([shell(back, 0.04, bw), sidePlate([[0.0, 0.46], [0.35, 0.5], [0.98, -0.36], [0.98, -0.44], [0.15, -0.44], [-0.2, -0.3], [-0.24, 0.1]], 0.04, bw / 2 - 0.04), sidePlate([[0.0, 0.46], [0.35, 0.5], [0.98, -0.36], [0.98, -0.44], [0.15, -0.44], [-0.2, -0.3], [-0.24, 0.1]], 0.04, -bw / 2)]), K.paint);
  add(FB, mergeG([bx(bw + 0.02, 0.05, 0.16, 0, -0.44, 0.95), bx(bw - 0.1, 0.06, 0.08, 0, 0.44, 0.02), rbox(0.3, 0.3, 0.2, 0.03, 0.55, 0.25, -0.15), rbox(0.3, 0.3, 0.2, 0.03, -0.55, 0.25, -0.15)]), K.dark);
  m.frontFrame = FB;
  m.frontMouth = point(FB, 0, -0.15, 0.45);
  for (const s of [-1, 1]) {
    cylinder(m, m.anchor(U, s * 0.62, 0.95, 0.95), m.anchor(LA, s * 0.88, -0.32, 1.45), 0.09, 0.055);
    cylinder(m, m.anchor(LA, s * 0.6, -0.15, 1.9), m.anchor(FB, s * 0.6, 0.38, -0.1), 0.075, 0.045);
  }

  // ---- stabiliser legs at the rear corners
  m.legs = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 0.95, 1.4, -2.15); U.add(g);
    add(g, mergeG([rbox(0.22, 1.4, 0.26, 0.03, s * 0.0, -0.7, 0), rbox(0.5, 0.06, 0.45, 0.02, 0, -1.38, 0), pinX(0.07, 0.36, 0, 0, 0)]), K.paint);
    add(g, mergeG([cy(0.06, 0.06, 0.8, 12, s * -0.2, -0.35, 0.12, 0, 0, s * 0.25)]), K.chrome);
    m.legs.push({ g, s });
  }
  add(U, mergeG([rbox(2.2, 0.5, 0.6, 0.05, 0, 1.25, -2.05), rbox(1.2, 0.95, 0.5, 0.05, 0, 1.0, -2.3)]), K.paint);
  add(U, mergeG([bx(0.6, 0.12, 0.04, 0.6, 1.25, -2.36), bx(0.6, 0.12, 0.04, -0.6, 1.25, -2.36)]), K.red, false);

  // ---- rear digging arm on a swing casting (swing limited to the back half)
  add(m.upper, mergeG([rbox(0.75, 0.95, 0.85, 0.08, 0, 0.05, 0.4), cy(0.16, 0.16, 1.1, 16, 0, 0.05, 0)]), K.paint);
  m.boomMount = [0, 0.32, 0.55];
  arm(m);
  m.upperBoxes = [[0, 0.05, 0.4, 0.75, 0.95, 0.85]];
  m.underBoxes = [[0, 0.95, 0.1, 2.3, 1.2, 5.3], [0, 2.1, -0.35, 1.5, 1.4, 1.75]];
  m.radius = 2.6;
  m.colliderSets.push({ obj: U, boxes: m.underBoxes, chassis: true }, { obj: m.upper, boxes: m.upperBoxes, chassis: true },
    { obj: FB, boxes: [[0, 0.0, 0.38, bw, 0.86, 1.0]], breaks: true });
  m.bakeList.push(U, m.upper, m.boomG, m.stickG, m.cabShell || U, m.att.group, LA, FB);
  m.rig = {
    family: 'excavator', drive: 'car', swing: true, wheelbase: ZF - ZR,
    limits: { swing: [-1.45, 1.45], boom: [-1.25, 0.65], stick: [0.25, 2.55], curl: [-1.0, 2.1], rot: [-0.05, 1.2] },
    rates: { swing: 0.8, boom: 0.6, stick: 0.8, curl: 1.2, rot: 0.55 },
    apply(mm) {
      mm.upper.rotation.y = mm.swing; mm.boomG.rotation.x = mm.boom; mm.stickG.rotation.x = mm.stickA; mm.attach.rotation.x = mm.curl;
      if (mm.updateLink) mm.updateLink();
      mm.loaderArm.rotation.x = -mm.rot;
      mm.fBucket.rotation.x = mm.rot - 0.3 + 1.25 * mm.open;
      for (const w of mm.steerWheels) w.rotation.y = mm.steerVis;
    },
  };
  m.defaults = { boom: -0.85, stick: 2.3, curl: 1.8 };
  m.funIdle = (dt) => funIdle(m, dt);
}

// a side profile [z, y] extruded across x (width w, centred)
function prismZY(pts, w) { return sidePlate(pts, w - 0.07, -w / 2 + 0.035, 0.035); }
