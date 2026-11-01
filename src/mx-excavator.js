// High-detail excavator builder (tracked, rubber-tracked, wheeled, pontoon, spider and remote demolition robot).
import * as THREE from 'three';
import { buildTrackUnit } from './tracks.js';
import { buildAttachment, sidePlate } from './attachments.js';
import { mergeG, rbox, bx, cy, pinX, tubeAB, hose, bolts, boltRow, boltCircle, rail, ladder, workLight, mirror, grille, stick, label, stripeDecal, add, V } from './detail.js';
import * as T from './textures.js';

const BOOMS = { mono: { len: 5.6, ky: 1.0 }, long: { len: 9.6, ky: 1.15 }, straight: { len: 7.0, ky: 0.55 } };
const UNDER_Y = { steel: 1.06, rubber: 1.0, wheels: 1.5, pontoon: 1.75, spider: 1.55, robot: 0.95 };

export function buildExcavator(m) {
  const sp = m.spec;
  m.under = new THREE.Group(); m.model.add(m.under);
  ({ steel: tracks, rubber: tracks, wheels, pontoon: pontoons, spider, robot: robotUnder })[sp.under](m);
  if (sp.blade) blade(m);
  m.upper = new THREE.Group(); m.upper.position.y = UNDER_Y[sp.under]; m.model.add(m.upper);
  if (sp.upper === 'robot') robotUpper(m); else upperHouse(m);
  if (sp.cab !== 'none') cab(m);
  else { m.seat = m.anchor(m.upper, 0, 1.3, -0.4); m.door = m.anchor(m.upper, 1.2, 0, 0); }
  arm(m);
  m.colliderSets.push({ obj: m.under, boxes: m.underBoxes, chassis: true }, { obj: m.upper, boxes: m.upperBoxes, chassis: true });
  m.bakeList.push(m.under, m.upper, m.boomG, m.stickG, m.cabShell || m.upper, m.att.group);
  const lim = sp.boom === 'long' ? { boom: [-1.5, 0.35], stick: [0.35, 2.7], curl: [-0.9, 1.9] } : sp.boom === 'straight' ? { boom: [-1.32, 0.5], stick: [0.3, 2.6], curl: [-0.9, 2.0] } : { boom: [-1.25, 0.62], stick: [0.25, 2.55], curl: [-1.0, 2.1] };
  m.rig = {
    family: 'excavator', drive: sp.under === 'wheels' || sp.under === 'spider' ? 'car' : 'tank', swing: true,
    limits: { swing: null, ...lim, ...(sp.attach === 'brickclamp' ? { rot: null } : {}) }, rates: { swing: 0.7, boom: 0.5, stick: 0.7, curl: 1.1, rot: 0.75 },
    apply(mm) {
      mm.upper.rotation.y = mm.swing; mm.boomG.rotation.x = mm.boom; mm.stickG.rotation.x = mm.stickA; mm.attach.rotation.x = mm.curl;
      for (const j of mm.att.jaws) {
        if (j.slide) { j.obj.position.y = j.sign * (j.closed + (j.openY - j.closed) * mm.open); continue; }
        const a = j.sign * (mm.open * j.max - 0.08); if (j.axis === 'y') j.obj.rotation.y = a; else j.obj.rotation.x = a;
      }
      if (mm.att.rotor) mm.att.rotor.rotation.z = mm.rot || 0;
      if (mm.att.clampRods) for (const c of mm.att.clampRods) { c.rod.position.y = c.sgn * 0.51; c.rod.scale.y = c.sgn * Math.max(0.05, Math.abs(c.J.position.y) - 0.51); }
      if (mm.tiltPivot) mm.tiltPivot.rotation.x = Math.max(-0.5, Math.min(0, mm.boom * 0.45));
      for (const w of mm.steerWheels) w.rotation.y = mm.steerVis;
      if (mm.att.crushJaw) mm.att.crushJaw.rotation.x = mm.crushing ? Math.sin(performance.now() * 0.03) * 0.12 : 0;
    },
  };
  m.defaults = sp.boom === 'long' ? { boom: -0.75, stick: 2.0, curl: 0.9 } : { boom: -0.3, stick: 1.5, curl: 0.9 };
}

// =============================================================================== undercarriages
function tracks(m) {
  const sp = m.spec, K = m.mats, g = sp.gauge || 1.19, rubber = sp.under === 'rubber';
  for (const s of [-1, 1]) {
    const tu = buildTrackUnit(null, { length: 4.45, radius: 0.38, width: rubber ? 0.5 : 0.6, rollers: rubber ? 5 : 7, frameColor: rubber ? K.accent : K.under, rubber, mats: K, side: s });
    tu.group.position.x = s * g; tu.group.rotation.y = s > 0 ? 0 : 0; m.under.add(tu.group); m.tracks.push(tu);
  }
  carbody(m, g);
  m.underBoxes = [[-g, 0.58, 0, 0.62, 0.8, 4.45], [g, 0.58, 0, 0.62, 0.8, 4.45], [0, 0.7, 0, 1.8, 0.6, 1.8]];
  m.radius = 2.4;
}

function carbody(m, g, y0 = 0) {
  const K = m.mats;
  const xs = new THREE.Shape();
  xs.moveTo(-0.95, -1.0); xs.lineTo(0.95, -1.0); xs.lineTo(0.7, -0.3); xs.lineTo(0.7, 0.3); xs.lineTo(0.95, 1.0); xs.lineTo(-0.95, 1.0); xs.lineTo(-0.7, 0.3); xs.lineTo(-0.7, -0.3); xs.closePath();
  const xg = new THREE.ExtrudeGeometry(xs, { depth: 0.42, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  xg.rotateX(-Math.PI / 2); xg.translate(0, 0.5 + y0, 0);
  add(m.under, mergeG([xg, bx(g * 2 - 1.3, 0.36, 0.5, 0, 0.66 + y0, 0), bx(g * 2 - 1.3, 0.05, 0.62, 0, 0.86 + y0, 0)]), K.under);
  add(m.under, mergeG([cy(0.78, 0.82, 0.12, 48, 0, 0.98 + y0, 0), cy(0.86, 0.86, 0.04, 48, 0, 0.93 + y0, 0)]), K.dark);
  add(m.under, mergeG([cy(0.7, 0.7, 0.04, 48, 0, 1.05 + y0, 0), boltCircle(V(0, 1.04 + y0, 0), 0.74, 28, V(0, 1, 0), 0.016)]), K.steel);
  // lifting eyes + centre joint + hoses down to the travel motors
  const eyes = [];
  for (const s of [-1, 1]) eyes.push(new THREE.TorusGeometry(0.07, 0.022, 8, 16).translate(s * 0.55, 0.98 + y0, 0.98), new THREE.TorusGeometry(0.07, 0.022, 8, 16).translate(s * 0.55, 0.98 + y0, -0.98));
  add(m.under, mergeG([...eyes, cy(0.12, 0.14, 0.3, 16, 0, 0.82 + y0, 0)]), K.dark);
  add(m.under, mergeG([hose([[0.08, 0.75 + y0, 0.1], [0.4, 0.62 + y0, 0.2], [g - 0.4, 0.6 + y0, -0.6]], 0.022, 14), hose([[-0.08, 0.75 + y0, 0.1], [-0.4, 0.62 + y0, 0.2], [-g + 0.4, 0.6 + y0, -0.6]], 0.022, 14)]), K.black);
}

function wheels(m) {
  const K = m.mats, U = m.under;
  add(U, mergeG([rbox(1.2, 0.55, 4.6, 0.06, 0, 0.95, 0), rbox(2.2, 0.25, 1.0, 0.05, 0, 0.8, 1.35), rbox(2.2, 0.25, 1.0, 0.05, 0, 0.8, -1.35), rbox(1.0, 0.45, 0.8, 0.05, 0, 1.2, -2.1),
    rbox(0.6, 0.35, 0.5, 0.04, 0.55, 1.08, 0.2), rbox(0.6, 0.35, 0.5, 0.04, -0.55, 1.08, 0.2)]), K.accent);
  add(U, mergeG([cy(0.78, 0.82, 0.14, 48, 0, 1.3, 0), boltCircle(V(0, 1.375, 0), 0.72, 24, V(0, 1, 0), 0.015)]), K.dark);
  // axles + differentials + drive shaft
  add(U, mergeG([pinX(0.09, 2.3, 0, 0.55, 1.35), pinX(0.09, 2.3, 0, 0.55, -1.35), rbox(0.42, 0.34, 0.42, 0.06, 0, 0.6, 1.35), rbox(0.42, 0.34, 0.42, 0.06, 0, 0.6, -1.35),
    cy(0.05, 0.05, 2.4, 10, 0, 0.66, 0, Math.PI / 2), boltCircle(V(0, 0.6, 1.57), 0.12, 8, V(0, 0, 1), 0.013)]), K.dark);
  // toolbox / fuel step on the side
  add(U, mergeG([rbox(0.35, 0.4, 1.0, 0.04, 0.9, 1.0, 0.0), bx(0.36, 0.03, 0.4, 1.0, 0.65, 0.3)]), K.paint);
  add(U, mergeG([bx(0.01, 0.3, 0.9, 1.076, 1.0, 0), bx(0.02, 0.04, 0.12, 1.08, 1.1, 0.3)]), K.black);
  const tyre = [cy(0.55, 0.55, 0.32, 32, 0, 0, 0, 0, 0, Math.PI / 2), cy(0.5, 0.5, 0.34, 32, 0, 0, 0, 0, 0, Math.PI / 2)];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const tb = bx(0.14, 0.05, 0.1, k % 2 ? 0.08 : -0.08, 0, 0); tb.rotateY(k % 2 ? 0.35 : -0.35); tb.translate(0, 0.565, 0); tb.rotateX(a); tyre.push(tb);
  }
  const tyreGeo = mergeG(tyre);
  const rimGeo = mergeG([cy(0.33, 0.33, 0.35, 24, 0, 0, 0, 0, 0, Math.PI / 2), cy(0.14, 0.14, 0.4, 14, 0, 0, 0, 0, 0, Math.PI / 2)]);
  const nutGeo = boltCircle(V(0.2, 0, 0), 0.2, 10, V(1, 0, 0), 0.022);
  for (const z of [1.35, -1.35]) for (const s of [-1, 1]) {
    const hub = new THREE.Group(); hub.position.set(s * 1.05, 0.56, z); U.add(hub);
    const spin = new THREE.Group(); hub.add(spin);
    for (const dx of [-0.17, 0.17]) { add(spin, tyreGeo.clone().translate(dx, 0, 0), K.rubber); add(spin, rimGeo.clone().translate(dx, 0, 0), K.grey, false); }
    add(spin, nutGeo.clone().translate(s > 0 ? 0 : -0.4, 0, 0), K.steel, false);
    m.wheels.push(spin);
    if (z > 0) m.steerWheels.push(hub);
    add(hub, mergeG([rbox(0.82, 0.06, 1.3, 0.02, 0, 0.62, 0), bx(0.04, 0.2, 1.2, s * 0.4, 0.52, 0)]), K.paint);
  }
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.6, 0.9, -2.25); leg.rotation.z = s * 0.7; U.add(leg);
    add(leg, mergeG([rbox(0.2, 1.25, 0.22, 0.03, 0, -0.55, 0), cy(0.22, 0.25, 0.06, 16, 0, -1.18, 0), pinX(0.05, 0.3, 0, 0, 0)]), K.accent);
    add(leg, cy(0.05, 0.05, 0.75, 10, s * -0.18, -0.25, 0.16, 0, 0, 0.3), K.chrome);
    add(leg, cy(0.08, 0.08, 0.5, 12, s * -0.2, 0.05, 0.16, 0, 0, 0.3), K.black);
  }
  m.underBoxes = [[0, 0.75, 0, 2.6, 1.0, 4.6]];
  m.radius = 2.6;
}

function pontoons(m) {
  const K = m.mats, U = m.under;
  for (const s of [-1, 1]) {
    const prof = new THREE.Shape();
    prof.moveTo(-3.7, 0.7); prof.lineTo(-3.2, 0.1); prof.lineTo(3.2, 0.1); prof.lineTo(3.8, 0.75); prof.lineTo(3.3, 1.45); prof.lineTo(-3.3, 1.45); prof.closePath();
    const hull = new THREE.ExtrudeGeometry(prof, { depth: 1.2, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    hull.rotateY(-Math.PI / 2); hull.translate(s * 2.0 + 0.6, 0, 0);
    add(U, hull, K.paint);
    const tu = buildTrackUnit(null, { length: 7.9, radius: 0.72, width: 1.36, rollers: 0, noFrame: true, pitch: 0.3, mats: K, side: s });
    tu.group.position.x = s * 2.0; U.add(tu.group); m.tracks.push(tu);
    const ribs = [];
    for (let z = -3; z <= 3; z += 0.75) ribs.push(bx(0.025, 1.0, 0.06, s * 2.0 + s * 0.64, 0.85, z));
    add(U, mergeG([...ribs, bx(0.03, 0.12, 6.6, s * 2.0 + s * 0.645, 1.42, 0), boltRow(V(s * 2.66, 1.3, -3), V(s * 2.66, 1.3, 3), 14, V(s, 0, 0), 0.015, 0.012)]), K.accent);
    add(U, mergeG([cy(0.08, 0.08, 0.1, 10, s * 2.0, 1.52, 2.5), cy(0.08, 0.08, 0.1, 10, s * 2.0, 1.52, -2.5)]), K.dark); // inspection hatches
  }
  add(U, mergeG([rbox(3.2, 0.35, 0.5, 0.05, 0, 1.25, 1.8), rbox(3.2, 0.35, 0.5, 0.05, 0, 1.25, -1.8), rbox(1.8, 0.5, 2.2, 0.06, 0, 1.3, 0)]), K.under);
  add(U, mergeG([cy(0.78, 0.82, 0.14, 48, 0, 1.6, 0), boltCircle(V(0, 1.675, 0), 0.72, 24, V(0, 1, 0), 0.015)]), K.dark);
  m.underBoxes = [[-2.0, 0.85, 0, 1.3, 1.4, 7.6], [2.0, 0.85, 0, 1.3, 1.4, 7.6], [0, 1.3, 0, 2.8, 0.5, 3.8]];
  m.radius = 3.9;
}

// walking excavator: four articulated legs, wheels at the back, steel pads at the front
function spider(m) {
  const K = m.mats, U = m.under;
  add(U, mergeG([rbox(1.5, 0.7, 2.6, 0.12, 0, 1.15, 0), rbox(1.1, 0.25, 1.1, 0.05, 0, 1.55, 0)]), K.accent);
  add(U, mergeG([cy(0.78, 0.82, 0.12, 48, 0, 1.5, 0), boltCircle(V(0, 1.56, 0), 0.72, 24, V(0, 1, 0), 0.015)]), K.dark);
  const tyre = mergeG([cy(0.58, 0.58, 0.45, 32, 0, 0, 0, 0, 0, Math.PI / 2), ...Array.from({ length: 20 }, (_, k) => { const t = bx(0.46, 0.06, 0.12, 0, 0.6, 0); t.rotateX((k / 20) * Math.PI * 2); return t; })]);
  const rim = mergeG([cy(0.34, 0.34, 0.47, 20, 0, 0, 0, 0, 0, Math.PI / 2), boltCircle(V(0.24, 0, 0), 0.2, 8, V(1, 0, 0), 0.02)]);
  for (const s of [-1, 1]) {
    // rear leg with wheel
    const rl = new THREE.Group(); rl.position.set(s * 0.7, 1.1, -1.0); rl.rotation.set(-0.05, s * 0.25, 0); U.add(rl);
    add(rl, mergeG([rbox(0.28, 0.32, 1.9, 0.05, 0, 0, -0.85), pinX(0.09, 0.4, 0, 0, 0)]), K.paint);
    add(rl, mergeG([cy(0.06, 0.06, 1.0, 12, 0, 0.3, -0.45, Math.PI / 2 + 0.15)]), K.black);
    add(rl, cy(0.035, 0.035, 0.7, 10, 0, 0.25, -1.0, Math.PI / 2 + 0.15), K.chrome);
    const wh = new THREE.Group(); wh.position.set(s * 0.12, -0.45, -1.75); rl.add(wh);
    const spin = new THREE.Group(); wh.add(spin);
    add(spin, tyre, K.rubber); add(spin, rim, K.grey, false);
    m.wheels.push(spin);
    // front leg with claw pad
    const fl = new THREE.Group(); fl.position.set(s * 0.65, 1.0, 1.1); fl.rotation.set(0.3, -s * 0.35, 0); U.add(fl);
    add(fl, mergeG([rbox(0.26, 0.3, 1.5, 0.05, 0, 0, 0.7), rbox(0.2, 0.24, 1.0, 0.04, 0, -0.02, 1.5), pinX(0.08, 0.4, 0, 0, 0)]), K.paint);
    add(fl, mergeG([cy(0.05, 0.05, 0.9, 12, 0, 0.26, 0.55, Math.PI / 2 - 0.1)]), K.black);
    const pad = new THREE.Group(); pad.position.set(0, -0.15, 2.0); pad.rotation.x = -0.3; fl.add(pad);
    add(pad, mergeG([rbox(0.5, 0.08, 0.5, 0.02, 0, -0.22, 0), bx(0.1, 0.25, 0.1, 0, -0.08, 0), pinX(0.05, 0.3, 0, 0, 0), ...[-0.18, 0, 0.18].map((x) => { const c = new THREE.ConeGeometry(0.04, 0.14, 6); c.rotateX(Math.PI); return c.translate(x, -0.31, 0.2); })]), K.dark);
    m.steerWheels.push(fl);
  }
  m.steerWheels = [];
  m.underBoxes = [[0, 1.15, 0, 1.6, 0.8, 2.8], [0, 0.6, -1.9, 2.6, 1.0, 0.8], [0, 0.6, 2.2, 2.4, 0.8, 0.6]];
  m.radius = 2.8;
}

function robotUnder(m) {
  const K = m.mats, U = m.under;
  for (const s of [-1, 1]) {
    const tu = buildTrackUnit(null, { length: 2.6, radius: 0.28, width: 0.36, rollers: 4, frameColor: K.dark, rubber: true, mats: K, side: s });
    tu.group.position.x = s * 0.62; U.add(tu.group); m.tracks.push(tu);
  }
  add(U, mergeG([rbox(1.0, 0.32, 1.9, 0.05, 0, 0.62, 0), cy(0.52, 0.55, 0.1, 36, 0, 0.88, 0)]), K.dark);
  // four outrigger legs pushed down onto the ground
  for (const [x, z, s] of [[0.55, 0.85, 1], [-0.55, 0.85, -1], [0.55, -0.85, 1], [-0.55, -0.85, -1]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.7, z); leg.rotation.z = s * 0.95; U.add(leg);
    add(leg, mergeG([rbox(0.12, 0.85, 0.14, 0.02, 0, -0.4, 0), cy(0.13, 0.15, 0.04, 14, 0, -0.84, 0, 0, 0, 0)]), K.paint);
    add(leg, cy(0.03, 0.03, 0.4, 8, s * -0.08, -0.15, 0.08, 0, 0, 0.3), K.chrome);
  }
  m.underBoxes = [[-0.62, 0.4, 0, 0.4, 0.6, 2.6], [0.62, 0.4, 0, 0.4, 0.6, 2.6], [0, 0.65, 0, 1.0, 0.35, 1.9]];
  m.radius = 1.5;
}

function blade(m) {
  const K = m.mats, U = m.under, under = m.spec.under;
  const z = under === 'wheels' ? 2.55 : 2.45, w = under === 'wheels' ? 2.5 : 2.6;
  const prof = new THREE.Shape();
  prof.moveTo(0, 0); prof.quadraticCurveTo(-0.25, 0.3, -0.05, 0.62); prof.lineTo(0.03, 0.62); prof.quadraticCurveTo(-0.17, 0.3, 0.08, 0); prof.closePath();
  const g = new THREE.ExtrudeGeometry(prof, { depth: w, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); g.translate(w / 2, 0.06, z);
  add(U, g, K.paint);
  add(U, mergeG([bx(0.12, 0.12, 1.2, -0.7, 0.45, z - 0.65, 0.2), bx(0.12, 0.12, 1.2, 0.7, 0.45, z - 0.65, 0.2), bx(w, 0.05, 0.09, 0, 0.06, z + 0.04),
    boltRow(V(-w / 2 + 0.1, 0.1, z + 0.09), V(w / 2 - 0.1, 0.1, z + 0.09), 10, V(0, 0, 1), 0.012, 0.01), bx(0.06, 0.4, 0.1, -w / 2 + 0.03, 0.3, z + 0.02), bx(0.06, 0.4, 0.1, w / 2 - 0.03, 0.3, z + 0.02)]), K.dark);
  add(U, cy(0.05, 0.05, 0.7, 10, 0, 0.55, z - 0.45, 1.1), K.chrome);
  add(U, cy(0.08, 0.08, 0.45, 12, 0, 0.66, z - 0.75, 1.1), K.black);
  stick(U, 'warn', 0.18, 0.6, 0.38, z + 0.06, 0, 0);
}

// =============================================================================== upper house
function upperHouse(m) {
  const sp = m.spec, K = m.mats, U = m.upper;
  const zt = sp.zeroTail, hv = sp.heavy;
  add(U, mergeG([rbox(2.5, 0.2, 3.3, 0.04, 0, 0.1, -0.35), bx(2.3, 0.14, 3.0, 0, -0.04, -0.35)]), K.black);
  // counterweight
  const tail = zt ? -1.55 : hv ? -2.45 : -2.25;
  const cw = new THREE.Shape();
  cw.moveTo(-1.25, -1.15); cw.lineTo(1.25, -1.15); cw.lineTo(1.25, tail + 0.65); cw.quadraticCurveTo(1.15, tail + 0.05, 0, tail); cw.quadraticCurveTo(-1.15, tail + 0.05, -1.25, tail + 0.65); cw.closePath();
  const cwH = hv ? 1.15 : 0.95;
  const cwg = new THREE.ExtrudeGeometry(cw, { depth: cwH, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 4, curveSegments: 24 });
  cwg.rotateX(Math.PI / 2); cwg.translate(0, 0.23 + cwH, 0);
  add(U, cwg, K.paint);
  const band = new THREE.ExtrudeGeometry(cw, { depth: 0.12, bevelEnabled: false, curveSegments: 24 });
  band.rotateX(Math.PI / 2); band.scale(1.012, 1, 1.012); band.translate(0, 0.32, 0);
  add(U, band, K.accent);
  const top = 0.29 + cwH;
  add(U, mergeG([new THREE.TorusGeometry(0.07, 0.024, 8, 16).translate(0.75, top + 0.03, tail + 0.55), new THREE.TorusGeometry(0.07, 0.024, 8, 16).translate(-0.75, top + 0.03, tail + 0.55),
    bx(0.1, 0.06, 0.18, 0.75, top - 0.01, tail + 0.55), bx(0.1, 0.06, 0.18, -0.75, top - 0.01, tail + 0.55)]), K.dark);
  // rear camera, tail lights with chrome bezels, hazard band, brand
  add(U, mergeG([rbox(0.14, 0.1, 0.12, 0.02, 0, top - 0.15, tail - 0.02)]), K.black);
  add(U, cy(0.025, 0.025, 0.02, 12, 0, top - 0.15, tail - 0.085, Math.PI / 2), K.glass);
  for (const s of [-1, 1]) {
    add(U, rbox(0.22, 0.11, 0.05, 0.02, s * 0.62, 0.52, tail + 0.07), K.chrome);
    add(U, bx(0.18, 0.08, 0.02, s * 0.62, 0.52, tail + 0.04), K.red, false).userData.keep = true;
    stick(U, 'crush', 0.24, s * 1.262, 0.75, -1.55, s * Math.PI / 2);
  }
  const hz = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.18), K.hazard); hz.position.set(0, 0.72, tail - 0.06); hz.rotation.y = Math.PI; U.add(hz);
  const brand = label(sp.brand, 1.1, 0.3, lum(sp.paint) > 0.55 ? '#15171a' : '#ffffff'); brand.position.set(0, 0.25 + cwH * 0.72, tail - 0.075); brand.rotation.y = Math.PI; U.add(brand);
  stick(U, 'warn', 0.16, 0.85, 0.95, tail + 0.3, Math.PI);
  // engine hood with chamfered profile
  const hh = hv ? 1.38 : zt ? 1.1 : 1.24;
  const hood = new THREE.Shape();
  hood.moveTo(-1.18, 0.2); hood.lineTo(-1.18, hh - 0.14); hood.lineTo(-1.08, hh); hood.lineTo(-0.2, hh); hood.lineTo(-0.1, hh - 0.12); hood.lineTo(-0.1, 0.2); hood.closePath();
  const hg = new THREE.ExtrudeGeometry(hood, { depth: 2.46, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
  hg.rotateY(Math.PI / 2); hg.translate(-1.23, 0, 0);
  add(U, hg, K.paint);
  // seams, hinge strip, latches, side door outlines + handles
  add(U, mergeG([bx(2.4, 0.012, 0.012, 0, hh + 0.016, -0.62), bx(2.4, 0.012, 0.012, 0, hh + 0.016, -0.95), bx(0.012, 0.012, 0.9, 0.0, hh + 0.016, -0.65),
    bx(0.012, 0.85, 0.012, 1.246, 0.66, -0.15), bx(0.012, 0.85, 0.012, 1.246, 0.66, -1.12), bx(0.012, 0.012, 0.97, 1.246, 1.08, -0.63), bx(0.012, 0.85, 0.012, -1.246, 0.66, -0.6), bx(0.012, 0.85, 0.012, -1.246, 0.66, -1.12)]), K.black);
  add(U, mergeG([pinX(0.018, 2.3, 0, hh + 0.01, -0.18), bx(0.03, 0.04, 0.12, 1.26, 0.85, -0.4), bx(0.03, 0.04, 0.12, -1.26, 0.85, -0.85), bx(0.08, 0.02, 0.05, 0.6, hh + 0.02, -1.12), bx(0.08, 0.02, 0.05, -0.6, hh + 0.02, -1.12)]), K.chrome);
  grille(U, 0.85, 0.42, 0.55, hh + 0.012, -0.63, 0).rotation.x = -Math.PI / 2;
  grille(U, 0.8, 0.5, 1.247, 0.68, -0.63, Math.PI / 2);
  // exhaust: muffler stack with perforated heat shield and hinged rain cap
  const stacks = hv ? [-0.55, -0.85] : [-0.75];
  for (const x of stacks) {
    add(U, mergeG([cy(0.075, 0.075, 0.55, 16, x, hh + 0.25, -0.9), cy(0.09, 0.09, 0.08, 16, x, hh + 0.04, -0.9)]), K.black);
    add(U, cy(0.1, 0.1, 0.3, 16, x, hh + 0.22, -0.9, 0, 0, 0, true), K.galv);
    add(U, mergeG([cy(0.09, 0.09, 0.02, 16, x, hh + 0.56, -0.86, -0.4)]), K.black);
  }
  add(U, mergeG([cy(0.12, 0.13, 0.3, 18, 0.6, hh + 0.14, -0.5), cy(0.15, 0.12, 0.08, 18, 0.6, hh + 0.33, -0.5)]), K.plastic);
  // hand rails along the hood
  const railMat = hv ? m.ctx.M.paintYellow : K.paint;
  for (const s of [-1, 1]) add(U, rail([[s * 1.15, hh + 0.36, -0.25], [s * 1.15, hh + 0.36, -1.05]], 0.02, hh), railMat);
  // right-front tool box / tanks
  const tb = new THREE.Shape();
  tb.moveTo(-0.48, -0.1); tb.lineTo(-1.25, -0.1); tb.lineTo(-1.25, 1.25); tb.quadraticCurveTo(-1.22, 1.45, -1.0, 1.48); tb.lineTo(-0.48, 1.48); tb.closePath();
  const tbg = new THREE.ExtrudeGeometry(tb, { depth: zt ? 0.62 : 0.82, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 });
  tbg.rotateX(Math.PI / 2); tbg.translate(0, zt ? 0.82 : 1.02, 0);
  add(U, tbg, K.paint);
  add(U, mergeG([bx(0.012, 0.6, 1.2, -1.285, 0.6, 0.65), bx(0.012, 0.012, 1.2, -1.285, 0.95, 0.65), bx(0.012, 0.012, 1.2, -1.285, 0.28, 0.65)]), K.black);
  add(U, mergeG([bx(0.03, 0.04, 0.14, -1.3, 0.75, 0.2), cy(0.07, 0.07, 0.05, 16, -0.85, 1.07, 0.15), cy(0.025, 0.025, 0.02, 10, -1.29, 0.5, 1.15, 0, 0, Math.PI / 2)]), K.chrome);
  add(U, rbox(0.012, 0.22, 0.05, 0.005, -1.288, 0.62, 1.15), K.glass, false); // hydraulic sight gauge
  add(U, mergeG([bx(0.3, 0.04, 0.4, -1.38, 0.35, 1.0), bx(0.3, 0.04, 0.4, -1.38, 0.0, 1.0)]), K.tread);
  add(U, rail([[-1.2, 1.4, 0.3], [-1.2, 1.4, 1.3]], 0.02, 1.02), railMat);
  workLight(U, K, -0.9, 1.15, 1.45, 0, 0.2);
  mirror(U, K, V(-1.2, 1.05, 1.3), V(-1.35, 1.55, 1.4), 0.3);
  stick(U, 'ce', 0.16, -1.29, 0.85, 0.95, -Math.PI / 2);
  // boom foot bracket: thick plates, bosses, pin, retainers, grease points
  add(U, mergeG([rbox(0.12, 0.9, 0.9, 0.03, 0.1, 0.55, 1.05), rbox(0.12, 0.9, 0.9, 0.03, -0.52, 0.55, 1.05), cy(0.16, 0.16, 0.16, 20, 0.12, 0.78, 1.28, 0, 0, Math.PI / 2), cy(0.16, 0.16, 0.16, 20, -0.54, 0.78, 1.28, 0, 0, Math.PI / 2)]), K.paint);
  add(U, mergeG([pinX(0.09, 0.85, -0.21, 0.78, 1.28), bolts([V(0.2, 0.84, 1.24), V(0.2, 0.72, 1.32)], V(1, 0, 0), 0.014), bolts([V(-0.62, 0.84, 1.24), V(-0.62, 0.72, 1.32)], V(-1, 0, 0), 0.014), cy(0.01, 0.01, 0.05, 6, 0.1, 1.02, 1.28)]), K.steel);
  add(U, mergeG([hose([[0.05, 0.25, 0.4], [0.0, 0.5, 0.9], [-0.1, 0.75, 1.5]], 0.025, 16), hose([[-0.05, 0.25, 0.4], [-0.15, 0.5, 0.9], [-0.25, 0.7, 1.52]], 0.025, 16), hose([[-0.15, 0.25, 0.35], [-0.3, 0.45, 0.95], [-0.38, 0.62, 1.55]], 0.022, 16)]), K.black);
  if (hv) {
    for (const s of [-1, 1]) {
      add(U, bx(0.45, 0.05, 2.6, s * 1.48, 0.2, -0.85), K.tread);
      add(U, rail([[s * 1.68, 1.1, -2.1], [s * 1.68, 1.1, 0.4]], 0.022, 0.22), m.ctx.M.paintYellow);
      add(U, rail([[s * 1.68, 0.65, -2.1], [s * 1.68, 0.65, 0.4]], 0.018), m.ctx.M.paintYellow);
    }
    add(U, ladder(1.7, -0.95, 0.2, 0.9, 0.42, 0.27, -0.15), m.ctx.M.paintYellow);
  }
  m.upperBoxes = [[0, 0.65, -0.55, 2.5, 1.1, 3.1], [-0.86, 0.6, 0.7, 0.8, 1.0, 1.6]];
}

// remote demolition robot body (no cab)
function robotUpper(m) {
  const K = m.mats, U = m.upper;
  add(U, mergeG([rbox(1.3, 0.75, 1.6, 0.1, 0, 0.45, -0.3), rbox(1.1, 0.2, 1.4, 0.06, 0, 0.9, -0.35)]), K.paint);
  add(U, mergeG([rbox(1.32, 0.12, 1.62, 0.03, 0, 0.12, -0.3)]), K.accent);
  grille(U, 0.7, 0.4, 0.66, 0.5, -0.4, Math.PI / 2); grille(U, 0.7, 0.4, -0.66, 0.5, -0.4, -Math.PI / 2);
  add(U, mergeG([cy(0.012, 0.012, 0.7, 6, 0.45, 1.3, -0.85), cy(0.04, 0.05, 0.06, 10, 0.45, 1.02, -0.85)]), K.black);
  add(U, mergeG([cy(0.06, 0.06, 0.06, 16, -0.45, 1.03, -0.85), cy(0.045, 0.045, 0.04, 16, -0.45, 1.07, -0.85)]), K.red);
  workLight(U, K, 0.45, 1.02, 0.35, 0, 0.1, 0.8); workLight(U, K, -0.45, 1.02, 0.35, 0, 0.1, 0.8);
  add(U, mergeG([rbox(0.5, 0.6, 0.55, 0.05, -0.21, 0.55, 0.85), cy(0.14, 0.14, 0.62, 18, -0.21, 0.78, 1.0, 0, 0, Math.PI / 2)]), K.paint);
  stick(U, 'warn', 0.2, 0.0, 0.6, 0.505, 0); stick(U, 'crush', 0.22, 0.652, 0.62, 0.2, Math.PI / 2);
  m.beacon = add(U, cy(0.05, 0.05, 0.1, 12, 0, 1.06, -0.9), K.amber, false); m.beacon.userData.keep = true;
  m.upperBoxes = [[0, 0.5, -0.3, 1.3, 0.9, 1.6]];
}

// =============================================================================== cab
function cab(m) {
  const sp = m.spec, K = m.mats, U = m.upper;
  const c = new THREE.Group();
  if (sp.mini) { c.position.set(0.2, 0.2, -0.15); c.scale.setScalar(0.92 / m.s); } else c.position.set(0.76, 0.2, 0.6);
  U.add(c); m.cab = c;
  const cw2 = 0.98, ch = 1.72, zf = 0.95, zb = -0.85, cd = zf - zb;
  let shell = c;
  if (sp.cab === 'elevated') {
    const lift = 2.3;
    add(c, mergeG([rbox(0.18, lift + 0.1, 0.2, 0.03, -0.3, lift / 2, -0.6), rbox(0.18, lift + 0.1, 0.2, 0.03, 0.3, lift / 2, -0.6), rbox(0.8, 0.12, 0.3, 0.03, 0, lift, -0.55),
      bx(0.6, 0.06, 0.06, 0, lift * 0.5, -0.6), tubeAB(V(-0.3, 0.2, -0.6), V(0.3, lift * 0.5, -0.6), 0.03), tubeAB(V(0.3, 0.2, -0.6), V(-0.3, lift * 0.5, -0.6), 0.03)]), K.accent);
    add(c, tubeAB(V(0, 0.1, 0.3), V(0, lift - 0.1, -0.5), 0.07), K.black);
    add(c, tubeAB(V(0, 0.6, 0.2), V(0, lift - 0.2, -0.45), 0.04), K.chrome);
    add(c, ladder(0.55, 0, lift, -0.1, 0.36, 0.3), m.ctx.M.paintYellow);
    add(c, mergeG([bx(0.7, 0.04, 0.5, 0.15, lift - 0.02, 1.05), ...[[-0.2, 0.8], [0.5, 0.8], [0.5, 1.3]].map(([x, z]) => tubeAB(V(x, lift, z), V(x, lift + 1.0, z), 0.02, 8))]), m.ctx.M.paintYellow);
    shell = new THREE.Group(); shell.position.y = lift; c.add(shell);
  } else if (sp.cab === 'tilt') {
    shell = new THREE.Group(); shell.position.set(0, 0.05, zb); c.add(shell);
    const inner = new THREE.Group(); inner.position.z = -zb; shell.add(inner);
    m.tiltPivot = shell; shell = inner;
    add(c, cy(0.05, 0.05, 0.5, 10, 0, 0.25, -zb + 0.4, 0.6), K.chrome);
    add(c, cy(0.08, 0.08, 0.35, 12, 0, 0.1, -zb + 0.25, 0.6), K.black);
  }
  m.cabShell = shell;
  add(shell, mergeG([rbox(cw2, 0.08, cd, 0.02, 0, 0.04, (zf + zb) / 2), bx(cw2 - 0.1, 0.01, cd - 0.15, 0, 0.085, (zf + zb) / 2)]), K.black);
  if (sp.cab === 'canopy') {
    // ROPS / FOPS canopy: four tubular posts, roof with grille, work light
    add(shell, mergeG([tubeAB(V(-0.44, 0, zb + 0.08), V(-0.44, ch, zb + 0.08), 0.04), tubeAB(V(0.44, 0, zb + 0.08), V(0.44, ch, zb + 0.08), 0.04),
      tubeAB(V(-0.44, 0.05, zf - 0.2), V(-0.44, ch, zf - 0.15), 0.035), tubeAB(V(0.44, 0.05, zf - 0.2), V(0.44, ch, zf - 0.15), 0.035), bx(cw2, 0.08, 0.08, 0, ch - 0.6, zb + 0.08)]), K.black);
    add(shell, mergeG([rbox(cw2 + 0.12, 0.09, cd + 0.12, 0.03, 0, ch + 0.04, (zf + zb) / 2 - 0.05)]), K.paint);
    add(shell, mergeG(Array.from({ length: 5 }, (_, i) => bx(0.03, 0.03, cd - 0.1, -0.36 + i * 0.18, ch + 0.1, (zf + zb) / 2 - 0.05))), K.black);
    workLight(shell, K, 0, ch - 0.04, zf - 0.08, 0, 0.3, 0.9);
  } else {
    add(shell, mergeG([rbox(cw2, ch, 0.06, 0.02, 0, ch / 2, zb), bx(cw2 - 0.04, 0.5, 0.02, 0, 0.3, zb + 0.04)]), K.black);
    const roof = new THREE.Shape(); roof.moveTo(-cw2 / 2 - 0.03, zb - 0.03); roof.lineTo(cw2 / 2 + 0.03, zb - 0.03); roof.lineTo(cw2 / 2 + 0.03, zf + 0.06); roof.lineTo(-cw2 / 2 - 0.03, zf + 0.06); roof.closePath();
    const rg = new THREE.ExtrudeGeometry(roof, { depth: 0.07, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 3 });
    rg.rotateX(Math.PI / 2); rg.translate(0, ch + 0.07, 0);
    add(shell, rg, K.paint);
    add(shell, mergeG([rbox(0.5, 0.03, 0.5, 0.01, -0.1, ch + 0.11, 0.0)]), K.glass, false); // roof hatch
    // LED light bar on the roof edge, tinted sun visor over the windscreen, radio antenna and beacon base
    add(shell, mergeG([rbox(0.72, 0.075, 0.1, 0.025, 0, ch + 0.2, zf - 0.04), bx(0.05, 0.08, 0.05, -0.3, ch + 0.15, zf - 0.04), bx(0.05, 0.08, 0.05, 0.3, ch + 0.15, zf - 0.04),
      cy(0.006, 0.006, 0.62, 6, -cw2 / 2 + 0.08, ch + 0.42, zb + 0.12), cy(0.022, 0.026, 0.05, 10, -cw2 / 2 + 0.08, ch + 0.13, zb + 0.12)]), K.black);
    add(shell, mergeG([0, 1, 2, 3].map((i) => bx(0.13, 0.045, 0.012, -0.24 + i * 0.16, ch + 0.2, zf + 0.012))), K.lens, false);
    { const v = bx(cw2 - 0.04, 0.012, 0.24, 0, 0, 0); v.rotateX(-0.18); v.translate(0, ch + 0.02, zf + 0.1); add(shell, v, K.glass, false); }
    // pillars (rounded tubes) + window frames / rubber seals
    const fr = [];
    for (const s of [-1, 1]) {
      fr.push(tubeAB(V(s * (cw2 / 2 - 0.035), 0, zb + 0.04), V(s * (cw2 / 2 - 0.035), ch, zb + 0.04), 0.038, 10));
      fr.push(tubeAB(V(s * (cw2 / 2 - 0.035), 0.0, zf - 0.05), V(s * (cw2 / 2 - 0.035), ch, zf - 0.2), 0.042, 10));
      fr.push(tubeAB(V(s * (cw2 / 2 - 0.03), 0, -0.05), V(s * (cw2 / 2 - 0.03), ch, -0.05), 0.03, 8));
      fr.push(bx(0.05, 0.05, cd, s * (cw2 / 2 - 0.03), 0.62, (zf + zb) / 2), bx(0.05, 0.05, cd, s * (cw2 / 2 - 0.03), ch - 0.02, (zf + zb) / 2));
    }
    fr.push(bx(cw2, 0.06, 0.06, 0, 0.62, zf - 0.08), bx(cw2, 0.05, 0.05, 0, ch - 0.03, zf - 0.19));
    add(shell, mergeG(fr), K.black);
    const g1 = new THREE.Mesh(new THREE.PlaneGeometry(cw2 - 0.08, ch - 0.68), K.glass); g1.position.set(0, 0.62 + (ch - 0.62) / 2, zf - 0.13); g1.rotation.x = -0.09; shell.add(g1);
    const g2 = new THREE.Mesh(new THREE.PlaneGeometry(cw2 - 0.08, 0.55), K.glass); g2.position.set(0, 0.32, zf - 0.04); shell.add(g2);
    for (const s of [-1, 1]) { const g3 = new THREE.Mesh(new THREE.PlaneGeometry(cd - 0.15, ch - 0.1), K.glass); g3.rotation.y = Math.PI / 2; g3.position.set(s * (cw2 / 2 - 0.01), ch / 2 + 0.02, (zf + zb) / 2 - 0.05); shell.add(g3); }
    const g4 = new THREE.Mesh(new THREE.PlaneGeometry(cw2 - 0.2, 0.55), K.glass); g4.position.set(0, ch - 0.45, zb + 0.035); g4.rotation.y = Math.PI; shell.add(g4);
    // door: hinges, handle, step, grab handle
    add(shell, mergeG([bx(0.03, 0.03, 0.14, cw2 / 2 + 0.02, 0.95, 0.3), tubeAB(V(cw2 / 2 + 0.03, 0.45, 0.55), V(cw2 / 2 + 0.03, 1.25, 0.55), 0.016, 8), pinX(0.015, 0.05, cw2 / 2 + 0.02, 0.4, -0.05), pinX(0.015, 0.05, cw2 / 2 + 0.02, 1.3, -0.05)]), K.chrome);
    add(shell, bx(0.25, 0.03, 0.35, cw2 / 2 + 0.15, -0.25, 0.3), K.tread);
    // wiper
    const wp = mergeG([bx(0.012, 0.02, 0.7, 0, 0, 0), bx(0.02, 0.03, 0.62, 0.015, 0, 0.0), cy(0.03, 0.03, 0.05, 10, 0, 0, -0.38, Math.PI / 2)]);
    wp.rotateX(Math.PI / 2); wp.rotateZ(0.5); wp.translate(0.15, 1.15, zf - 0.11);
    add(shell, wp, K.black, false);
    // front guard grid for demolition attachments (FOGS)
    if (['grapple', 'breaker', 'pulverizer', 'shear', 'orangepeel', 'claw', 'crusher'].includes(sp.attach)) {
      const gg = [];
      for (let i = 0; i < 7; i++) gg.push(tubeAB(V(-0.42 + i * 0.14, 0.65, zf + 0.06), V(-0.42 + i * 0.14, ch - 0.05, zf - 0.08), 0.014, 6));
      for (const y of [0.66, ch - 0.06]) gg.push(bx(cw2 - 0.04, 0.04, 0.04, 0, y, y < 1 ? zf + 0.06 : zf - 0.08));
      gg.push(bx(0.04, 0.04, 0.2, -0.47, 0.66, zf - 0.03), bx(0.04, 0.04, 0.2, 0.47, 0.66, zf - 0.03));
      add(shell, mergeG(gg), K.black);
      const roofG = [];
      for (let i = 0; i < 6; i++) roofG.push(bx(0.03, 0.03, cd - 0.1, -0.4 + i * 0.16, ch + 0.22, (zf + zb) / 2));
      roofG.push(bx(cw2, 0.04, 0.04, 0, ch + 0.22, zf - 0.05), bx(cw2, 0.04, 0.04, 0, ch + 0.22, zb + 0.05));
      for (const s of [-1, 1]) for (const z of [zb + 0.05, zf - 0.05]) roofG.push(bx(0.04, 0.14, 0.04, s * 0.45, ch + 0.15, z));
      add(shell, mergeG(roofG), K.black);
    }
    mirror(shell, K, V(cw2 / 2, 1.0, zf - 0.05), V(cw2 / 2 + 0.25, 1.35, zf + 0.05), -0.3);
    workLight(shell, K, 0.3, ch + 0.13, zf - 0.02, 0, 0.25, 0.9); workLight(shell, K, -0.3, ch + 0.13, zf - 0.02, 0, 0.25, 0.9);
    workLight(shell, K, 0, ch + 0.13, zb + 0.02, Math.PI, 0.25, 0.8);
    add(shell, mergeG([cy(0.008, 0.008, 0.6, 6, 0.38, ch + 0.4, zb + 0.15), cy(0.03, 0.035, 0.04, 10, 0.38, ch + 0.12, zb + 0.15)]), K.black);
  }
  m.beacon = add(shell, cy(0.05, 0.05, 0.12, 14, -0.3, ch + 0.17 + (sp.cab === 'canopy' ? 0.05 : 0), zb + 0.2), K.amber, false); m.beacon.userData.keep = true;
  add(shell, cy(0.06, 0.07, 0.04, 14, -0.3, ch + 0.1 + (sp.cab === 'canopy' ? 0.05 : 0), zb + 0.2), K.black);
  // interior: seat with armrests and headrest, consoles, pilot joysticks, monitor, pedals, travel levers, extinguisher
  add(shell, mergeG([rbox(0.5, 0.12, 0.5, 0.04, 0, 0.5, -0.25), rbox(0.48, 0.62, 0.12, 0.04, 0, 0.86, -0.5, -0.15), rbox(0.3, 0.17, 0.1, 0.04, 0, 1.27, -0.57, -0.15),
    rbox(0.08, 0.06, 0.4, 0.02, -0.29, 0.72, -0.25), rbox(0.08, 0.06, 0.4, 0.02, 0.29, 0.72, -0.25)]), K.seat, false);
  add(shell, mergeG([bx(0.3, 0.3, 0.3, 0, 0.3, -0.25), rbox(0.16, 0.12, 0.55, 0.03, -0.33, 0.62, -0.15), rbox(0.16, 0.12, 0.55, 0.03, 0.33, 0.62, -0.15),
    bx(0.03, 0.4, 0.03, -0.1, 0.25, 0.55), bx(0.03, 0.4, 0.03, 0.1, 0.25, 0.55), bx(0.12, 0.03, 0.18, -0.12, 0.12, 0.6, 0.4), bx(0.12, 0.03, 0.18, 0.12, 0.12, 0.6, 0.4),
    rbox(0.22, 0.15, 0.04, 0.01, -0.38, 1.0, 0.45, -0.3, 0.5)]), K.plastic, false);
  const scr = add(shell, bx(0.18, 0.11, 0.005, -0.37, 1.0, 0.475, -0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0x3a8ad0 }), false); scr.userData.keep = true;
  add(shell, mergeG([cy(0.05, 0.05, 0.3, 12, 0.42, 0.3, -0.7), cy(0.02, 0.02, 0.08, 8, 0.42, 0.48, -0.7)]), m.ctx.M.paintRed, false);
  const joy = mergeG([cy(0.015, 0.02, 0.18, 8, 0, 0.09, 0), rbox(0.05, 0.11, 0.06, 0.02, 0, 0.21, 0), cy(0.012, 0.012, 0.02, 6, 0, 0.27, 0.01)]);
  m.joyL = add(shell, joy, K.plastic, false); m.joyL.position.set(-0.33, 0.68, 0.02); m.joyL.userData.keep = true;
  m.joyR = add(shell, joy.clone(), K.plastic, false); m.joyR.position.set(0.33, 0.68, 0.02); m.joyR.userData.keep = true;
  for (const x of [-0.1, 0.1]) { const lv = add(shell, mergeG([cy(0.012, 0.012, 0.35, 6, x, 0.25, 0.48, -0.4), cy(0.025, 0.025, 0.08, 8, x, 0.42, 0.55, -0.4)]), K.plastic, false); lv.userData.keep = true; }
  m.seat = m.anchor(shell, 0, 1.32, -0.15);
  m.door = m.anchor(c, 0.75, 0, 0.25);
  const cb = [0.76, 1.1, 0.65, 1.0, 1.8, 1.9];
  if (sp.cab === 'elevated') cb[1] = 2.3 + 1.1;
  if (sp.mini) { cb[0] = 0.2; cb[2] = -0.15; cb[3] = 1.0 / m.s * 0.92; cb[4] = 1.8 / m.s * 0.92; cb[5] = 1.9 / m.s * 0.92; cb[1] = cb[4] / 2 + 0.2; }
  m.upperBoxes.push(cb);
}

// =============================================================================== arm: boom, stick, cylinders, attachment
function arm(m) {
  const sp = m.spec, K = m.mats, U = m.upper;
  const armMat = sp.armPaint ? m.armMat : K.paint;
  const bd = BOOMS[sp.boom] || BOOMS.mono;
  const kz = bd.len / 5.6, ky = bd.ky;
  m.boomLen = bd.len;
  m.boomG = new THREE.Group(); m.boomG.position.set(sp.mini ? -0.55 : -0.21, sp.upper === 'robot' ? 0.78 : 0.78, sp.mini ? 1.45 : 1.28); U.add(m.boomG);
  if (sp.mini) {
    // swing post bracket that carries the boom on a mini excavator
    add(U, mergeG([rbox(0.55, 0.7, 0.45, 0.06, -0.55, 0.5, 1.45), cy(0.12, 0.12, 0.8, 16, -0.55, 0.55, 1.2)]), K.paint);
    add(U, cy(0.06, 0.06, 0.7, 12, -0.95, 0.5, 1.3, 0, 0, Math.PI / 2 - 0.2), K.black);
  }
  const P = (z, y) => [z * kz, y * ky];
  const bs = new THREE.Shape();
  const mv = (f, ...a) => { const p = []; for (let i = 0; i < a.length; i += 2) p.push(...P(a[i], a[i + 1])); bs[f](...p); };
  mv('moveTo', -0.32 / kz, -0.15 / ky);
  mv('quadraticCurveTo', -0.38 / kz, 0.28 / ky, 0.05, 0.36);
  mv('lineTo', 1.2, 0.86);
  mv('quadraticCurveTo', 2.6, 1.72, 3.2, 1.38);
  mv('lineTo', 5.55 - 0.3 / kz, 0.32);
  mv('quadraticCurveTo', 5.6 + 0.35 / kz, 0.12, 5.6 + 0.2 / kz, -0.2 / ky);
  mv('quadraticCurveTo', 5.6 + 0.02 / kz, -0.36 / ky, 5.6 - 0.3 / kz, -0.2 / ky);
  mv('lineTo', 3.1, 0.78);
  mv('quadraticCurveTo', 2.55, 0.98, 2.1, 0.66);
  mv('lineTo', 0.5, -0.24);
  mv('quadraticCurveTo', 0.0, -0.45 / ky, -0.32 / kz, -0.15 / ky);
  const depth = sp.boom === 'long' ? 0.56 : 0.5;
  const bg = new THREE.ExtrudeGeometry(bs, { depth, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 3, curveSegments: 18 });
  bg.rotateY(-Math.PI / 2); bg.translate(depth / 2, 0, 0);
  add(m.boomG, bg, armMat);
  // reinforcement plates near the foot and knee (both sides)
  const knee = P(2.75, 1.75), lug = P(2.15, 0.38), mid = P(1.7, 0.95);
  const plate = (pts, x) => sidePlate(pts.map(([z, y]) => P(z, y)), 0.018, x, 0.004);
  const rp = [];
  for (const s of [-1, 1]) {
    const x = s > 0 ? depth / 2 + 0.03 : -depth / 2 - 0.048;
    rp.push(plate([[-0.15, -0.1], [0.5, -0.12], [0.55, 0.3], [-0.1, 0.25]], x), plate([[2.2, 0.85], [3.25, 1.45], [3.3, 1.05], [2.45, 0.85]], x), plate([[5.15, -0.1], [5.55, -0.12], [5.6, 0.25], [5.2, 0.28]], x));
  }
  add(m.boomG, mergeG(rp), armMat);
  // pins, bosses, retainers, grease nipples
  const pins = [];
  for (const [z, y, r] of [[0, 0, 0.13], [bd.len, 0, 0.12], [knee[0], knee[1], 0.1], [lug[0], lug[1] - 0.08, 0.09]]) {
    pins.push(pinX(r, depth + 0.12, 0, y, z, 20));
    for (const s of [-1, 1]) pins.push(bolts([V(s * (depth / 2 + 0.06), y + r * 0.6, z), V(s * (depth / 2 + 0.06), y - r * 0.6, z)], V(s, 0, 0), 0.013, 0.012), cy(0.008, 0.008, 0.04, 6, s * (depth / 2 - 0.05), y + r + 0.02, z));
  }
  add(m.boomG, mergeG(pins.slice(0, 1).concat(pins.filter((_, i) => i % 3 !== 0))), K.steel);
  add(m.boomG, mergeG([pinX(0.13, depth + 0.12, 0, 0, 0, 20), pinX(0.12, depth + 0.12, 0, 0, bd.len, 20), pinX(0.1, depth + 0.1, 0, knee[1], knee[0], 18)]), K.dark);
  add(m.boomG, mergeG([rbox(0.08, 0.36, 0.42, 0.02, -0.2, lug[1], lug[0], 0.5), rbox(0.08, 0.36, 0.42, 0.02, 0.2, lug[1], lug[0], 0.5), rbox(0.36, 0.3, 0.12, 0.02, 0, knee[1] - 0.13, knee[0] - 0.03),
    new THREE.TorusGeometry(0.06, 0.02, 8, 14).rotateY(Math.PI / 2).translate(0, P(3.2, 1.45)[1] + 0.03, P(3.2, 1.45)[0])]), armMat);
  // decals, stripe, light
  for (const s of [-1, 1]) {
    const d = label(sp.brand, 1.1, 0.3, lum(sp.armPaint || sp.paint) > 0.55 ? '#15171a' : '#ffffff'); d.position.set(s * (depth / 2 + 0.037), mid[1], mid[0]); d.rotation.y = s * Math.PI / 2; m.boomG.add(d);
    const st = stripeDecal(1.6, 0.18, '#15171a'); st.position.set(s * (depth / 2 + 0.037), P(4.3, 0.75)[1], P(4.3, 0)[0]); st.rotation.set(-0.38 * s * 0, s * Math.PI / 2, 0); st.rotateX(0.42); m.boomG.add(st);
    stick(m.boomG, 'grease', 0.06, s * (depth / 2 + 0.037), 0.25, 0.4, s * Math.PI / 2);
  }
  const lt = P(1.6, 1.25);
  workLight(m.boomG, K, depth / 2 + 0.1, lt[1], lt[0], 0, 0.1);
  // hose bundle along the boom top with clamps
  const hoses = [], clamps = [];
  for (const x of [-0.13, -0.05, 0.05, 0.13]) hoses.push(hose([[0.1, 0.4], [1.2, 0.98], [2.6, 1.66], [4.3, 1.08], [5.5, 0.46]].map(([z, y]) => V(x, ...P(z, y + (Math.abs(x) < 0.1 ? 0.02 : 0)).reverse())), 0.022, 48));
  for (const [z, y] of [[1.0, 0.92], [2.0, 1.4], [3.4, 1.55], [4.6, 0.98]]) { const p = P(z, y); clamps.push(rbox(0.34, 0.05, 0.07, 0.01, 0, p[1] + 0.04, p[0])); }
  add(m.boomG, mergeG(hoses), K.black); add(m.boomG, mergeG(clamps), K.dark);
  // stick
  const stickLen = sp.stickLen || 2.92, ks = stickLen / 2.92;
  m.stickLen = stickLen;
  m.stickG = new THREE.Group(); m.stickG.position.set(0, 0, bd.len); m.boomG.add(m.stickG);
  const ss = new THREE.Shape();
  ss.moveTo(-0.72, 0.42); ss.lineTo(-0.45, 0.6); ss.lineTo(0.35, 0.36); ss.lineTo(2.85 * ks, 0.16); ss.quadraticCurveTo(2.92 * ks + 0.23, 0.0, 2.92 * ks + 0.03, -0.16); ss.lineTo(0.4, -0.26); ss.quadraticCurveTo(-0.1, -0.3, -0.25, -0.05); ss.lineTo(-0.72, 0.25); ss.closePath();
  const sg = new THREE.ExtrudeGeometry(ss, { depth: 0.4, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 12 });
  sg.rotateY(-Math.PI / 2); sg.translate(0.2, 0, 0);
  add(m.stickG, sg, armMat);
  add(m.stickG, mergeG([sidePlate([[0.5, -0.27], [stickLen - 0.3, -0.18], [stickLen - 0.3, -0.24], [0.5, -0.34]], 0.36, -0.18, 0.006)]), K.dark); // wear plate
  add(m.stickG, mergeG([pinX(0.065, 0.56, 0, 0.0, stickLen, 16), pinX(0.06, 0.52, 0, 0.5, -0.6, 16), cy(0.1, 0.1, 0.46, 18, 0, 0, 0, 0, 0, Math.PI / 2),
    bolts([V(0.29, 0.03, stickLen), V(0.29, -0.03, stickLen), V(-0.29, 0.03, stickLen), V(-0.29, -0.03, stickLen)], V(1, 0, 0), 0.012), cy(0.008, 0.008, 0.04, 6, 0, 0.27, stickLen - 0.1)]), K.steel);
  add(m.stickG, mergeG([rbox(0.3, 0.16, 0.24, 0.02, 0, 0.42, 0.45), rbox(0.46, 0.14, 0.2, 0.02, 0, 0.12, stickLen - 0.45)]), armMat);
  const sh = [];
  for (const x of [-0.1, 0.1]) sh.push(hose([V(x, 0.45, -0.2), V(x, 0.35, stickLen * 0.5), V(x, 0.24, stickLen - 0.2)], 0.022, 24));
  add(m.stickG, mergeG(sh), K.black);
  add(m.stickG, mergeG([rbox(0.3, 0.05, 0.07, 0.01, 0, 0.35, stickLen * 0.3), rbox(0.3, 0.05, 0.07, 0.01, 0, 0.3, stickLen * 0.65)]), K.dark);
  // attachment
  m.attach = new THREE.Group(); m.attach.position.set(0, 0, stickLen); m.stickG.add(m.attach);
  m.att = buildAttachment(sp.attach, sp.attach === 'breaker' && sp.under === 'robot' ? { ...K, small: true } : (sp.armPaint && sp.attach === 'claw' ? K : K));
  m.attach.add(m.att.group);
  // oversized tools (e.g. the WH200's giant claw): scale the attachment, its colliders and its grip
  const ak = sp.attachScale || 1;
  if (ak !== 1) {
    m.att.group.scale.setScalar(ak);
    m.att.grabR = (m.att.grabR || 1) * ak;
    if (m.att.pieces) m.att.pieces = Math.round(m.att.pieces * ak * ak);
    if (m.att.cylAnchor) m.att.cylAnchor = m.att.cylAnchor.clone().multiplyScalar(ak);
  }
  m.grabPoint = m.att.grab;
  for (const p of m.att.probes) m.probes.push(p);
  m.probes.push({ obj: m.anchor(m.stickG, 0, 0, stickLen * 0.75), r: 0.38 }, { obj: m.anchor(m.stickG, 0, 0.4, -0.4), r: 0.38 });
  // hydraulic cylinders
  for (const s of [-1, 1]) cylinder(m, m.anchor(U, (sp.mini ? -0.55 : -0.21) + s * 0.36, 0.42, sp.mini ? 2.0 : 1.95), m.anchor(m.boomG, s * 0.36, lug[1] - 0.08, lug[0]), 0.11, 0.065);
  cylinder(m, m.anchor(m.boomG, 0, knee[1] + 0.03, knee[0]), m.anchor(m.stickG, 0, 0.5, -0.6), 0.1, 0.06);
  const ca = m.att.cylAnchor;
  cylinder(m, m.anchor(m.stickG, 0, 0.5, 0.45), m.anchor(m.attach, ca.x, ca.y, ca.z), 0.085, 0.05);
  // colliders: boom (2 boxes), stick, attachment parts. These break walls they touch.
  m.colliderSets.push({ obj: m.boomG, boxes: [[0, P(1.4, 0.55)[1], P(1.4, 0)[0], 0.5, 0.6 * ky + 0.1, 2.8 * kz, -Math.atan2(1.2 * ky, 2.7 * kz)], [0, P(4.2, 0.65)[1], P(4.2, 0)[0], 0.5, 0.5, 2.8 * kz, Math.atan2(1.2 * ky, 2.8 * kz)]], breaks: true });
  m.colliderSets.push({ obj: m.stickG, boxes: [[0, 0.1, stickLen / 2 - 0.25, 0.4, 0.45, stickLen + 0.5]], breaks: true });
  for (const c of m.att.colliders) m.colliderSets.push({ obj: c.obj, boxes: c.boxes, breaks: true, k: ak });
}

export function cylinder(m, a, b, rBarrel, rRod) {
  const K = m.mats;
  const barrel = new THREE.Mesh(mergeG([cy(rBarrel, rBarrel, 1, 18, 0, 0.5, 0), cy(rBarrel * 1.18, rBarrel * 1.18, 0.06, 18, 0, 0.97, 0), cy(rBarrel * 1.12, rBarrel * 1.12, 0.12, 18, 0, 0.05, 0),
    cy(rBarrel * 0.35, rBarrel * 0.35, rBarrel * 0.9, 8, rBarrel * 0.95, 0.12, 0, 0, 0, Math.PI / 2), cy(rBarrel * 0.35, rBarrel * 0.35, rBarrel * 0.9, 8, rBarrel * 0.95, 0.88, 0, 0, 0, Math.PI / 2)]), K.black);
  const rod = new THREE.Mesh(cy(rRod, rRod, 1, 16, 0, 0.5, 0), K.chrome);
  const eye = new THREE.Mesh(mergeG([cy(rRod * 1.5, rRod * 1.5, rRod * 3.2, 14, 0, 0, 0, 0, 0, Math.PI / 2), cy(rRod * 1.15, rRod * 1.15, rRod * 1.2, 12, 0, -rRod * 1.8, 0)]), K.steel);
  const clevis = new THREE.Mesh(mergeG([rbox(rBarrel * 2.2, rBarrel * 1.2, rBarrel * 1.6, 0.01, 0, -rBarrel * 0.4, 0), pinX(rBarrel * 0.55, rBarrel * 2.6, 0, 0, 0)]), K.dark);
  for (const o of [barrel, rod, eye, clevis]) { o.castShadow = true; o.userData.keep = true; m.upper.add(o); }
  m.cylinders.push({ a, b, barrel, rod, eye, clevis });
}

export function lum(hex) { return new THREE.Color(hex).getHSL({}).l; }
