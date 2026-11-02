// 8x4 tipper trucks (VELKA R410 XT / S650 V8 / G370): cab-over cab, four axles (two steered), twin rear tyres and a
// rear-tipping half-pipe or box body on a telescopic front cylinder. Blocks dropped in the body ride along physically;
// tipping (Z / X) raises the body around its rear hinge and the tailgate swings open.
import * as THREE from 'three';
import { mergeG, rbox, bx, cy, pinX, tubeAB, hose, bolts, boltRow, boltCircle, rail, workLight, mirror, grille, stick, label, add, V, weathered, exteriorOnly, tyreLathe, wheelRim } from './detail.js';
import { cylinder } from './mx-excavator.js';

const anchor = (p, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); p.add(o); return o; };

// chassis layouts. Axle entries: [z, steer group (1 = first steered axle, 2 = second, 0 = driven twin tyres)]
export const TRUCK_SIZES = {
  s: { label: 'Small', drive: '4x2', axles: [[3.15, 1], [-0.95, 0]], rear: -2.45, hinge: -2.05, L: 3.8, BH: 1.15, wb: 4.1, tank: 1.4, ad: 0.15, air: 0.5, guard: [1.05, 2.4], radius: 3.4, cam: 1.3 },
  m: { label: 'Medium', drive: '6x4', axles: [[3.15, 1], [-1.35, 0], [-2.75, 0]], rear: -3.8, hinge: -3.45, L: 5.0, BH: 1.3, wb: 4.6, tank: 1.2, ad: 0.0, air: -0.1, guard: [0.9, 2.8], radius: 4.1, cam: 1.45 },
  l: { label: 'Big', drive: '8x4', axles: [[3.15, 1], [1.7, 2], [-2.15, 0], [-3.55, 0]], rear: -4.6, hinge: -4.25, L: 6.0, BH: 1.45, wb: 5.0, tank: 0.3, ad: -0.75, air: -0.85, guard: [-0.35, 2.6], radius: 4.6, cam: 1.6 },
};

export function buildTruck(m) {
  const sp = m.spec, K = m.mats, U = new THREE.Group(); m.model.add(U); m.under = U; m.upper = U;
  const trim0 = sp.trim || 'xt';
  // V8: metallic silver paint and a brushed-aluminium body
  if (trim0 === 'chrome') K.paint = weathered(sp.paint, { base: K.base, rough: 0.28, metal: 0.7, clearcoat: 0.9, dirt: 0.6 });
  const bodyMat = sp.bodyPaint ? weathered(sp.bodyPaint, { base: K.base, rough: sp.bodyMetal ? 0.35 : 0.45, metal: sp.bodyMetal ? 0.75 : 0.12, clearcoat: sp.bodyMetal ? 0 : 0.4 }) : K.paint;
  const chassisMat = sp.chassisPaint ? weathered(sp.chassisPaint, { base: K.base, rough: 0.6, metal: 0.3, clearcoat: 0 }) : K.under;
  const trim = sp.trim || 'xt'; // xt | chrome | work
  const highRoof = sp.roof === 'high';
  const R = 0.54;
  const Z = TRUCK_SIZES[sp.size || 'l'], RE = Z.rear;

  // ---------------------------------------------------------------- wheels: steered front axle(s), driven axle(s) with twins
  m.steerWheels = []; m.steer2 = [];
  const axles = Z.axles.map(([z, g]) => [z, g > 0, g]), lastAxle = axles.length - 1;
  const RR = R * 0.6;
  const tg = tyreLathe(R, 0.38, RR, { lugs: 26, style: trim === 'xt' ? 'chevron' : 'block' }), tgRear = tyreLathe(R, 0.32, RR, { lugs: 26, style: 'chevron' });
  const rimF = wheelRim(RR, 0.38, { dish: 0.07, vents: 10 }), rimR = wheelRim(RR, 0.32, { dish: 0.03, vents: 10 });
  axles.forEach(([z, front], ai) => {
    for (const s of [-1, 1]) {
      const hub = new THREE.Group(); hub.position.set(s * (front ? 1.04 : 0.98), R, z); U.add(hub);
      if (front) (axles[ai][2] === 1 ? m.steerWheels : m.steer2).push(hub);
      const twins = front ? [0] : [0.17, -0.17];
      for (const ox of twins) {
        const spin = new THREE.Group(); spin.position.x = s * ox; hub.add(spin);
        add(spin, front ? tg : tgRear, K.rubber);
        // the outer twin's dish faces out, the inner twin's faces in (towards the hub)
        const rw = front ? rimF : rimR, flip = (s < 0) !== (ox < 0 && !front);
        const rm = add(spin, rw.rim, trim === 'chrome' ? K.chrome : K.grey);
        const rv = add(spin, rw.vents, K.black, false);
        if (flip) { rm.rotation.y = Math.PI; rv.rotation.y = Math.PI; }
        m.wheels.push(spin);
      }

      // mudguard: arched plastic over the wheel + mud flap
      const mg = [];
      for (let k = 0; k <= 8; k++) {
        const a0 = -0.15 + (k / 8) * 2.1, a1 = a0 + 2.1 / 8;
        const p0 = V(0, Math.sin(a0) * (R + 0.1), Math.cos(a0) * (R + 0.1)), p1 = V(0, Math.sin(a1) * (R + 0.1), Math.cos(a1) * (R + 0.1));
        const seg = bx(front ? 0.44 : 0.78, 0.03, p0.distanceTo(p1) + 0.01, 0, 0, 0); seg.rotateX(-(a0 + a1) / 2 + Math.PI / 2); seg.translate(0, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2); mg.push(seg);
      }
      const guard = add(hub, mergeG(mg), front ? K.black : K.black); guard.position.x = s * (front ? 0.02 : 0); guard.rotation.y = 0;
      if (!front && ai === lastAxle) add(U, mergeG([bx(0.78, 0.5, 0.02, s * 0.98, 0.42, z - R - 0.14)]), K.rubber);
    }
    // axle: beam + differential for driven axles, leaf springs, shock absorbers
    const ax = [cy(0.07, 0.07, 1.9, 12, 0, R, z, 0, 0, Math.PI / 2)];
    if (!front) ax.push(new THREE.SphereGeometry(0.24, 18, 12).translate(0, R, z), cy(0.09, 0.09, 0.4, 12, 0, R + 0.05, z + 0.3, Math.PI / 2));
    for (const s of [-1, 1]) for (let l = 0; l < 5; l++) ax.push(bx(0.09, 0.025, 1.2 - l * 0.16, s * 0.48, R + 0.12 + l * 0.028, z));
    add(U, mergeG(ax), K.dark);
    for (const s of [-1, 1]) add(U, tubeAB(V(s * 0.62, R + 0.05, z + 0.25), V(s * 0.55, R + 0.55, z + 0.4), 0.035), K.steel);
  });
  // drive shafts
  { const dz = axles.filter((a) => !a[1]).map((a) => a[0]); const sh = [tubeAB(V(0, R + 0.1, 0.6), V(0, R + 0.08, dz[0] + 0.3), 0.055)];
    for (let i = 1; i < dz.length; i++) sh.push(tubeAB(V(0, R + 0.08, dz[i - 1] - 0.3), V(0, R + 0.08, dz[i] + 0.3), 0.055));
    add(U, mergeG(sh), K.steel); }

  // ---------------------------------------------------------------- chassis frame + equipment
  const fl = 4.0 - RE, fc = (4.0 + RE) / 2;
  const fr = [bx(0.1, 0.3, fl, 0.45, 1.0, fc), bx(0.1, 0.3, fl, -0.45, 1.0, fc)];
  for (const z of [3.7, 2.4, 0.9, -0.6, -1.6, -2.85, -4.2]) if (z > RE + 0.5) fr.push(bx(0.9, 0.18, 0.12, 0, 1.0, z));
  fr.push(bx(0.9, 0.18, 0.12, 0, 1.0, RE + 0.4));
  const nb = Math.round(fl * 3.5);
  fr.push(boltRow(V(0.51, 1.08, 3.6), V(0.51, 1.08, RE + 0.2), nb, V(1, 0, 0), 0.016, 0.012), boltRow(V(-0.51, 1.08, 3.6), V(-0.51, 1.08, RE + 0.2), nb, V(-1, 0, 0), 0.016, 0.012));
  add(U, mergeG(fr), chassisMat);
  // rear: light bar, under-run guard, hitch, number plate
  add(U, mergeG([bx(2.3, 0.12, 0.12, 0, 0.62, RE - 0.02), bx(0.1, 0.42, 0.1, 0.6, 0.85, RE), bx(0.1, 0.42, 0.1, -0.6, 0.85, RE), rbox(2.45, 0.12, 0.16, 0.02, 0, 1.12, RE - 0.02), rbox(0.3, 0.22, 0.25, 0.03, 0, 0.95, RE + 0.05)]), K.black);
  for (const s of [-1, 1]) { add(U, rbox(0.34, 0.14, 0.04, 0.02, s * 0.95, 1.12, RE - 0.11), K.red, false); add(U, bx(0.1, 0.12, 0.03, s * 0.72, 1.12, RE - 0.11), K.amber, false); }
  add(U, mergeG([bx(0.52, 0.12, 0.01, 0, 0.98, RE - 0.08)]), m.ctx.M.paintWhite || K.grey, false);
  // fuel tank (polished aluminium, straps), AdBlue tank, battery box, air tanks, side guards
  const tz = Z.tank, az = Z.ad, rz = Z.air;
  add(U, mergeG([rbox(0.55, 0.62, 1.35, 0.14, 0.88, 0.95, tz)]), K.galv);
  add(U, mergeG([bx(0.6, 0.04, 0.06, 0.88, 0.95, tz + 0.55), bx(0.6, 0.04, 0.06, 0.88, 0.95, tz - 0.55), cy(0.06, 0.06, 0.06, 12, 0.88, 1.3, tz + 0.45)]), K.black);
  add(U, mergeG([rbox(0.45, 0.42, 0.5, 0.08, 0.86, 0.9, az), cy(0.05, 0.05, 0.05, 10, 0.86, 1.13, az + 0.15)]), K.grey);
  add(U, mergeG([rbox(0.5, 0.45, 0.9, 0.04, -0.85, 0.95, tz), bx(0.52, 0.04, 0.92, -0.85, 1.19, tz)]), K.black);
  add(U, mergeG([cy(0.13, 0.13, 0.9, 16, -0.75, 0.75, rz, Math.PI / 2), cy(0.13, 0.13, 0.9, 16, 0.25, 0.75, rz - 0.2, Math.PI / 2)]), K.steel);
  { const [gz, gl] = Z.guard; for (const s of [-1, 1]) add(U, mergeG([bx(0.04, 0.06, gl, s * 1.18, 0.7, gz), bx(0.04, 0.06, gl, s * 1.18, 1.0, gz), bx(0.04, 0.38, 0.06, s * 1.18, 0.85, gz + gl / 2 - 0.05), bx(0.04, 0.38, 0.06, s * 1.18, 0.85, gz - gl / 2 + 0.05)]), K.galv); }
  // exhaust: silencer box under the right step, tail pipe
  add(U, mergeG([rbox(0.5, 0.4, 0.7, 0.06, -0.85, 0.8, 1.35), tubeAB(V(-1.1, 0.7, 1.1), V(-1.25, 0.62, 0.9), 0.05)]), K.steel);

  // ---------------------------------------------------------------- cab (cab-over, sits on the frame)
  const C = new THREE.Group(); C.position.set(0, 1.2, 3.25); U.add(C); m.cabShell = C;
  const cw = 2.5, cd = 2.1, ch = highRoof ? 2.55 : 2.15, zf = cd / 2, zb = -cd / 2;
  // main shell: lower box, upper glasshouse, roof
  add(C, mergeG([rbox(cw, 1.0, cd, 0.12, 0, 0.5, 0), rbox(cw, ch - 0.95, cd - 0.15, 0.14, 0, 0.95 + (ch - 0.95) / 2, -0.07), rbox(cw - 0.06, 0.12, cd - 0.2, 0.08, 0, ch + 0.02, -0.1)]), K.paint);
  // front: black grille band with slats, logo, lower panel, steps
  add(C, mergeG([rbox(cw - 0.1, 0.62, 0.08, 0.03, 0, 0.62, zf + 0.01), rbox(cw - 0.2, 0.3, 0.06, 0.03, 0, 0.2, zf + 0.02)]), K.black);
  grille(C, cw - 0.5, 0.42, 0, 0.62, zf + 0.055, 0, 18);
  add(C, mergeG(Array.from({ length: 6 }, (_, i) => bx(cw - 0.5, 0.025, 0.03, 0, 0.42 + i * 0.075, zf + 0.06))), trim === 'chrome' ? K.chrome : K.dark);
  { const b = label(sp.brand, 0.9, 0.2, '#1d2024'); b.position.set(0, 1.04, zf + 0.012); C.add(b); }
  { const mdl = label(sp.model, 0.36, 0.08, '#d22a2a'); mdl.position.set(-0.55, 0.32, zf + 0.06); C.add(mdl); }
  // headlight clusters (lens + DRL strip), indicators
  for (const s of [-1, 1]) {
    add(C, mergeG([rbox(0.5, 0.2, 0.08, 0.04, s * (cw / 2 - 0.36), 0.12, zf + 0.07)]), K.black);
    add(C, mergeG([rbox(0.2, 0.12, 0.02, 0.03, s * (cw / 2 - 0.44), 0.12, zf + 0.115), rbox(0.14, 0.1, 0.02, 0.03, s * (cw / 2 - 0.24), 0.12, zf + 0.115)]), K.lens, false);
    add(C, bx(0.42, 0.025, 0.02, s * (cw / 2 - 0.36), 0.22, zf + 0.115), K.lens, false);
    add(C, bx(0.08, 0.06, 0.02, s * (cw / 2 - 0.06), 0.12, zf + 0.11), K.amber, false);
  }
  // bumper: heavy steel (XT: protruding skid plate + tow pins), fog lights, number plate
  const bumper = new THREE.Group(); bumper.position.set(0, -0.35, zf + 0.12); C.add(bumper);
  add(bumper, mergeG([rbox(cw + 0.04, 0.42, 0.32, 0.06, 0, 0, 0), rbox(cw - 0.6, 0.12, 0.42, 0.03, 0, -0.22, 0.06)]), trim === 'xt' ? K.black : trim === 'chrome' ? K.dark : K.black);
  if (trim === 'xt') { add(bumper, mergeG([rbox(1.2, 0.08, 0.5, 0.02, 0, -0.32, 0.1, -0.2), pinX(0.04, 0.3, 0, -0.12, 0.2)]), m.ctx.M.paintRed || K.red); add(bumper, mergeG([cy(0.05, 0.05, 0.14, 10, 0.4, -0.08, 0.22, Math.PI / 2), cy(0.05, 0.05, 0.14, 10, -0.4, -0.08, 0.22, Math.PI / 2)]), K.red); }
  for (const s of [-1, 1]) add(bumper, rbox(0.18, 0.1, 0.03, 0.02, s * 0.85, 0.04, 0.17), K.lens, false);
  add(bumper, bx(0.52, 0.11, 0.01, 0, 0.0, 0.165), m.ctx.M.paintWhite || K.grey, false);
  // windscreen, side windows, rear window; wipers; sun visor
  // dark interior behind the glass (planes, so the cab camera still sees out through them)
  const tint = new THREE.MeshStandardMaterial({ color: 0x0e1114, roughness: 0.85 });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.25, ch - 1.15), K.glass); ws.position.set(0, 0.97 + (ch - 1.15) / 2, zf - 0.04); ws.rotation.x = -0.05; C.add(exteriorOnly(ws));
  const wsb = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.25, ch - 1.15), tint); wsb.position.set(0, 0.97 + (ch - 1.15) / 2, zf - 0.09); wsb.rotation.x = -0.05; C.add(exteriorOnly(wsb));
  for (const s of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.75), K.glass); sw.position.set(s * (cw / 2 + 0.014), 1.42, 0.45); sw.rotation.y = s * Math.PI / 2; C.add(exteriorOnly(sw));
    const sb = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.75), tint); sb.position.set(s * (cw / 2 + 0.005), 1.42, 0.45); sb.rotation.y = s * Math.PI / 2; C.add(exteriorOnly(sb));
    add(C, mergeG([bx(0.02, 0.02, 0.5, s * 0.25, 1.0, zf - 0.02), cy(0.02, 0.02, 0.05, 8, s * 0.25, 1.0, zf - 0.27, Math.PI / 2)]).rotateZ(s * 0.9).translate(0, 0, 0), K.black, false);
  }
  add(C, mergeG([rbox(cw - 0.1, 0.06, 0.32, 0.02, 0, ch - 0.12, zf + 0.1, 0.1)]), trim === 'chrome' ? K.paint : K.black);
  // doors: seams, handles, grab rails, steps (2 per side) with tread plates
  const seams = [], chromeBits = [], treads = [];
  for (const s of [-1, 1]) {
    const x = s * (cw / 2 + 0.003);
    seams.push(bx(0.01, 1.75, 0.02, x, 0.88, zf - 0.08), bx(0.01, 1.75, 0.02, x, 0.88, -0.25), bx(0.01, 0.02, 1.25, x, 0.02, 0.38));
    chromeBits.push(bx(0.03, 0.04, 0.2, s * (cw / 2 + 0.02), 0.95, -0.05), tubeAB(V(s * (cw / 2 + 0.04), 0.3, zf - 0.15), V(s * (cw / 2 + 0.04), 1.2, zf - 0.15), 0.018, 8));
    for (const [y, z] of [[-0.55, 0.45], [-0.2, 0.45]]) treads.push(bx(0.3, 0.035, 0.55, s * (cw / 2 - 0.05), y, z));
    seams.push(bx(0.28, 0.5, 0.02, s * (cw / 2 - 0.05), -0.38, 0.73), bx(0.28, 0.5, 0.02, s * (cw / 2 - 0.05), -0.38, 0.17));
    // mirror arms: main + wide-angle + kerb mirror
    mirror(C, K, V(s * (cw / 2), 1.55, zf - 0.2), V(s * (cw / 2 + 0.38), 1.6, zf + 0.05), s * 0.15);
    mirror(C, K, V(s * (cw / 2), 1.15, zf - 0.2), V(s * (cw / 2 + 0.36), 1.1, zf + 0.05), s * 0.15);
  }
  add(C, mergeG(seams), K.black, false);
  add(C, mergeG(chromeBits), K.chrome);
  add(C, mergeG(treads), K.tread);
  // roof: beacons, marker lights, air deflector (high roof), roof light bar (V8)
  for (const s of [-1, 1]) { const b = add(C, cy(0.07, 0.08, 0.14, 16, s * 0.95, ch + 0.15, zf - 0.25), K.amber, false); if (s > 0) { m.beacon = b; b.userData.keep = true; } }
  add(C, mergeG([0, 1, 2, 3, 4].map((i) => bx(0.08, 0.04, 0.02, -0.5 + i * 0.25, ch + 0.07, zf - 0.08))), K.amber, false);
  if (trim === 'chrome') {
    add(C, mergeG([rbox(1.9, 0.12, 0.14, 0.04, 0, ch + 0.2, zf - 0.15), tubeAB(V(-0.95, ch + 0.08, zf - 0.15), V(-0.95, ch + 0.2, zf - 0.15), 0.025), tubeAB(V(0.95, ch + 0.08, zf - 0.15), V(0.95, ch + 0.2, zf - 0.15), 0.025)]), K.chrome);
    add(C, mergeG([0, 1, 2, 3, 4, 5].map((i) => bx(0.2, 0.08, 0.02, -0.75 + i * 0.3, ch + 0.2, zf - 0.07))), K.lens, false);
  } else workLight(C, K, 0, ch + 0.14, zf - 0.2, 0, 0.1, 1.1);
  // air intake snorkel behind the cab + rear wall details
  add(C, mergeG([rbox(0.38, 1.6, 0.3, 0.06, cw / 2 - 0.3, 1.3, zb - 0.2), rbox(0.42, 0.2, 0.38, 0.05, cw / 2 - 0.3, 2.15, zb - 0.2)]), K.black);
  grille(C, 0.3, 0.12, cw / 2 - 0.3, 2.15, zb - 0.01, 0, 10);
  // interior: seats, dashboard, steering wheel
  add(C, mergeG([rbox(cw - 0.2, 0.35, 0.45, 0.06, 0, 1.02, zf - 0.38), rbox(0.5, 0.5, 0.5, 0.06, 0.55, 0.85, -0.25), rbox(0.5, 0.5, 0.5, 0.06, -0.55, 0.85, -0.25), rbox(0.48, 0.65, 0.12, 0.05, 0.55, 1.35, -0.48), rbox(0.48, 0.65, 0.12, 0.05, -0.55, 1.35, -0.48)]), K.plastic, false);
  { const sw = new THREE.Group(); sw.position.set(0.55, 1.25, zf - 0.55); sw.rotation.x = -0.9; C.add(exteriorOnly(sw)); add(sw, mergeG([new THREE.TorusGeometry(0.21, 0.02, 8, 26).rotateX(Math.PI / 2), bx(0.38, 0.02, 0.03, 0, 0, 0)]), K.plastic, false); }
  // reflective stripes + side lettering
  for (const s of [-1, 1]) { const l = label(sp.brand, 0.8, 0.18, trim === 'chrome' ? '#1b1d20' : '#ffffff'); l.position.set(s * (cw / 2 + 0.005), 0.42, 0.45); l.rotation.y = s * Math.PI / 2; C.add(l); stick(C, 'ce', 0.08, s * (cw / 2 + 0.005), 0.15, -0.6, s * Math.PI / 2); }
  m.seat = anchor(C, 0.55, 1.45, -0.2); m.door = anchor(U, 1.6, 0, 3.4);

  // ---------------------------------------------------------------- tipping body on its rear hinge
  m.upper = U;
  const hinge = new THREE.Group(); hinge.position.set(0, 1.42, Z.hinge); U.add(hinge);
  m.attach = hinge;
  const body = new THREE.Group(); hinge.add(body);
  const L = Z.L, BW = 2.45, BH = Z.BH, HZ = Z.hinge;
  const box = sp.body === 'box';
  // subframe + hinge brackets
  add(U, mergeG([bx(0.12, 0.16, 1.95 - HZ, 0.45, 1.22, (1.95 + HZ) / 2), bx(0.12, 0.16, 1.95 - HZ, -0.45, 1.22, (1.95 + HZ) / 2), pinX(0.07, 1.1, 0, 1.42, HZ), bx(0.2, 0.3, 0.3, 0.45, 1.3, HZ), bx(0.2, 0.3, 0.3, -0.45, 1.3, HZ)]), chassisMat);
  if (!box) {
    // half-pipe: U-shaped shell extruded along the body
    const shp = new THREE.Shape(), n = 18;
    const outer = [], inner = [];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (i / n) * Math.PI; // 180..360 deg: the bottom half of an ellipse
      outer.push([Math.cos(a) * BW / 2, BH * 0.62 + Math.sin(a) * BH * 0.62]);
      inner.push([Math.cos(a) * (BW / 2 - 0.05), BH * 0.62 + Math.sin(a) * (BH * 0.62 - 0.05)]);
    }
    shp.moveTo(-BW / 2, BH); outer.forEach(([x, y]) => shp.lineTo(x, y)); shp.lineTo(BW / 2, BH); shp.lineTo(BW / 2 - 0.05, BH);
    inner.reverse().forEach(([x, y]) => shp.lineTo(x, y)); shp.lineTo(-BW / 2 + 0.05, BH); shp.closePath();
    const g = new THREE.ExtrudeGeometry(shp, { depth: L, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0.02, 0.05);
    add(body, g, bodyMat);
    // ribs around the pipe, top rails
    const ribs = [];
    for (let k = 0; k <= 6; k++) {
      const z = 0.3 + k * ((L - 0.6) / 6);
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 1) / n) * Math.PI;
        const p0 = V(Math.cos(a0) * (BW / 2 + 0.03), BH * 0.62 + Math.sin(a0) * (BH * 0.62 + 0.03), z), p1 = V(Math.cos(a1) * (BW / 2 + 0.03), BH * 0.62 + Math.sin(a1) * (BH * 0.62 + 0.03), z);
        ribs.push(tubeAB(p0, p1, 0.03, 6));
      }
      for (const s of [-1, 1]) ribs.push(bx(0.06, BH * 0.4, 0.07, s * (BW / 2 + 0.03), BH * 0.82, z));
    }
    for (const s of [-1, 1]) ribs.push(rbox(0.1, 0.12, L, 0.03, s * (BW / 2 + 0.02), BH + 0.04, L / 2 + 0.05));
    add(body, mergeG(ribs), bodyMat);
  } else {
    // square box body: floor, straight sides with stake pockets and top rails
    add(body, mergeG([bx(BW, 0.08, L, 0, 0.06, L / 2 + 0.05), bx(0.06, BH, L, BW / 2 - 0.03, BH / 2 + 0.06, L / 2 + 0.05), bx(0.06, BH, L, -BW / 2 + 0.03, BH / 2 + 0.06, L / 2 + 0.05)]), bodyMat);
    const posts = [];
    for (let k = 0; k <= 7; k++) for (const s of [-1, 1]) posts.push(bx(0.08, BH, 0.1, s * (BW / 2 + 0.02), BH / 2 + 0.06, 0.3 + k * ((L - 0.6) / 7)));
    for (const s of [-1, 1]) posts.push(rbox(0.12, 0.12, L, 0.03, s * (BW / 2 + 0.02), BH + 0.08, L / 2 + 0.05), bx(0.1, 0.1, L, s * (BW / 2 + 0.02), 0.12, L / 2 + 0.05));
    add(body, mergeG(posts), bodyMat);
  }
  // headboard + cab protector canopy, tarp roller, long-members under the body
  add(body, mergeG([bx(BW, BH + 0.25, 0.08, 0, (BH + 0.25) / 2, L + 0.06), bx(BW, 0.06, 0.75, 0, BH + 0.25, L + 0.38, -0.12)]), bodyMat);
  add(body, mergeG([cy(0.12, 0.12, BW, 18, 0, BH + 0.4, L - 0.1, 0, 0, Math.PI / 2), bx(0.12, 0.3, 0.12, BW / 2 - 0.05, BH + 0.22, L - 0.1), bx(0.12, 0.3, 0.12, -BW / 2 + 0.05, BH + 0.22, L - 0.1)]), K.black);
  add(body, mergeG([bx(0.14, 0.14, L, 0.45, -0.03, L / 2 + 0.05), bx(0.14, 0.14, L, -0.45, -0.03, L / 2 + 0.05), ...[0.6, 2.2, 3.8, 5.4].filter((z) => z < L - 0.3).map((z) => bx(1.2, 0.1, 0.1, 0, -0.02, z))]), K.dark);
  { const bl = label(sp.bodyLabel || 'VELKA KIPP', 1.1, 0.24, '#15171a'); bl.position.set(BW / 2 + 0.07, BH * 0.86, L * 0.75); bl.rotation.y = Math.PI / 2; body.add(bl); }
  // tailgate hinged along its top edge
  // high-lift gate: it hangs on side arms from pivots on brackets above the body, so nothing crosses the
  // opening and the whole load slides out under it when the body tips
  const GA = 0.5;
  add(body, mergeG([bx(0.1, GA + 0.12, 0.14, BW / 2 + 0.07, BH + GA / 2, 0.12), bx(0.1, GA + 0.12, 0.14, -BW / 2 - 0.07, BH + GA / 2, 0.12)]), bodyMat);
  const tail = new THREE.Group(); tail.position.set(0, BH + GA, 0.05); body.add(tail);
  add(tail, mergeG([bx(BW, BH, 0.06, 0, -GA - BH / 2, -0.03), bx(BW + 0.06, 0.1, 0.1, 0, -GA - BH + 0.05, -0.06), bx(BW + 0.06, 0.08, 0.1, 0, -GA - 0.04, -0.06), ...[-0.8, 0, 0.8].map((x) => bx(0.06, BH - 0.1, 0.06, x, -GA - BH / 2, -0.08))]), bodyMat);
  add(tail, mergeG([pinX(0.06, 0.2, BW / 2 + 0.08, 0, 0), pinX(0.06, 0.2, -BW / 2 - 0.08, 0, 0), bx(0.06, GA + 0.2, 0.08, BW / 2 + 0.06, -GA / 2 - 0.05, -0.05), bx(0.06, GA + 0.2, 0.08, -BW / 2 - 0.06, -GA / 2 - 0.05, -0.05),
    bx(0.12, 0.12, 0.12, BW / 2 + 0.03, -GA - BH + 0.1, -0.06), bx(0.12, 0.12, 0.12, -BW / 2 - 0.03, -GA - BH + 0.1, -0.06)]), K.dark);
  stick(tail, 'warn', 0.3, BW / 2 - 0.3, -GA - BH * 0.5, -0.09, Math.PI);
  m.tailgate = tail;
  // front telescopic tipping cylinder: chassis -> body underside near the headboard
  cylinder(m, anchor(U, 0, 1.1, 1.25), anchor(body, 0, -0.05, L - 0.55), 0.13, 0.08);
  m.att = { group: body, jaws: [], probes: [], colliders: [], behaviour: 'bed', bulk: null, pieces: 0, grab: anchor(body, 0, 0.6, L / 2), wakeR: 4.6,
    dump: { from: 0.75, dir: new THREE.Vector3(0, 0, -1), box: [BW / 2 + 0.2, L + 0.3, BH + 1.2] } };
  m.grabPoint = m.att.grab;

  // ---------------------------------------------------------------- physics
  // box body: flat floor + walls. Half-pipe: the curved shell as a fan of tilted slats, so loads settle in the
  // middle of the pipe the way they do on the real thing.
  const floorBoxes = [];
  if (box) floorBoxes.push([0, 0.04, L / 2 + 0.05, BW, 0.12, L], [BW / 2, BH / 2 + 0.05, L / 2 + 0.05, 0.08, BH, L], [-BW / 2, BH / 2 + 0.05, L / 2 + 0.05, 0.08, BH, L]);
  else {
    const a = BW / 2 - 0.05, b = BH * 0.62 - 0.05, cy0 = BH * 0.62 + 0.02, n = 8, T = 0.14;
    const pt = (t) => { const ang = Math.PI + t * Math.PI; return [Math.cos(ang) * a, cy0 + Math.sin(ang) * b]; };
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pt(i / n), [x1, y1] = pt((i + 1) / n);
      const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
      // centre pushed outwards by half the slat thickness so the top face lies on the inner surface
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      floorBoxes.push([(x0 + x1) / 2 - nx * T / 2, (y0 + y1) / 2 - ny * T / 2, L / 2 + 0.05, len + 0.04, T, L, 0, ang]);
    }
    for (const sg of [-1, 1]) floorBoxes.push([sg * (BW / 2 - 0.02), cy0 + (BH - cy0) / 2, L / 2 + 0.05, 0.1, BH - cy0 + 0.1, L]);
  }
  m.colliderSets.push(
    { obj: U, boxes: [[0, 2.35, 3.25, 2.5, 2.3, 2.15], [0, 0.85, (3.5 + HZ + 0.25) / 2, 2.45, 0.9, 3.5 - HZ - 0.25]], chassis: true },
    { obj: body, boxes: [...floorBoxes, [0, (BH + 0.25) / 2, L + 0.06, BW, BH + 0.25, 0.1]], friction: 0.4 }, // worn smooth steel: loads slide out when tipped
    { obj: tail, boxes: [[0, -GA - BH / 2, -0.03, BW, BH, 0.08]] },
  );
  m.radius = Z.radius; m.camScale = Z.cam;
  m.bakeList.push(U, C, body, tail);
  m.rig = {
    family: 'truck', drive: 'car', wheelbase: Z.wb, accel: 2.6, brake: 4.5, maxLat: 3.2, swing: false, limits: { curl: [0, 1.0] }, rates: { curl: 0.32 },
    apply(mm) {
      hinge.rotation.x = -mm.curl;
      mm.tailgate.rotation.x = Math.min(2.4, mm.curl * 2.4); // top-hinged gate swings up and out of the way
      for (const w of mm.steerWheels) w.rotation.y = mm.steerVis;
      for (const w of mm.steer2) w.rotation.y = mm.steerVis * 0.6;
    },
  };
  m.defaults = { boom: 0, stick: 0, curl: 0 };
}
