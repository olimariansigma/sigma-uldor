// Site vehicles: tandem roller, asphalt paver, wheel loader, bulldozer, tracked dumper, wrecking-ball crawler crane.
import * as THREE from 'three';
import { buildTrackUnit } from './tracks.js';
import { mergeG, rbox, bx, cy, pinX, tubeAB, hose, bolts, boltRow, boltCircle, rail, ladder, workLight, mirror, grille, stick, label, add, V, exteriorOnly } from './detail.js';
import { sidePlate, curvePts, shell } from './attachments.js';
import { cylinder, lum } from './mx-excavator.js';

const anchor = (p, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); p.add(o); return o; };

// --------------------------------------------------------------------------- shared bits
function tyre(K, r, w, lugs = 22, chevron = true) {
  const parts = [cy(r, r, w, 36, 0, 0, 0, 0, 0, Math.PI / 2), cy(r * 0.9, r * 0.9, w + 0.02, 36, 0, 0, 0, 0, 0, Math.PI / 2)];
  for (let k = 0; k < lugs; k++) {
    const a = (k / lugs) * Math.PI * 2;
    for (const s of chevron ? [-1, 1] : [0]) {
      const lug = bx(w * (chevron ? 0.46 : 0.9), r * 0.09, r * 0.13, s * w * 0.25, 0, 0); if (chevron) lug.rotateY(s * 0.5); lug.translate(0, r + r * 0.03, 0); lug.rotateX(a + (s > 0 ? 0.12 : 0)); parts.push(lug);
    }
  }
  return mergeG(parts);
}
function rim(K, r, w) { return mergeG([cy(r, r, w, 28, 0, 0, 0, 0, 0, Math.PI / 2), cy(r * 0.42, r * 0.42, w + 0.08, 18, 0, 0, 0, 0, 0, Math.PI / 2), boltCircle(V(w / 2 + 0.04, 0, 0), r * 0.32, 12, V(1, 0, 0), 0.022), boltCircle(V(-w / 2 - 0.04, 0, 0), r * 0.32, 12, V(-1, 0, 0), 0.022)]); }
function seat(K, parent, x, y, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  add(g, mergeG([rbox(0.5, 0.12, 0.5, 0.04, 0, 0.0, 0), rbox(0.48, 0.6, 0.12, 0.04, 0, 0.34, -0.24, -0.15), rbox(0.3, 0.16, 0.1, 0.04, 0, 0.72, -0.31, -0.15), rbox(0.08, 0.06, 0.38, 0.02, -0.29, 0.2, 0), rbox(0.08, 0.06, 0.38, 0.02, 0.29, 0.2, 0)]), K.seat, false);
  add(g, mergeG([bx(0.3, 0.3, 0.3, 0, -0.2, 0)]), K.plastic, false);
  return g;
}
function rops(K, parent, w, h, d, z0, roofMat) {
  add(parent, mergeG([tubeAB(V(-w / 2, 0, z0), V(-w / 2, h, z0), 0.05), tubeAB(V(w / 2, 0, z0), V(w / 2, h, z0), 0.05), tubeAB(V(-w / 2, h, z0), V(w / 2, h, z0), 0.05),
    tubeAB(V(-w / 2, 0, z0 + d), V(-w / 2, h, z0 + d), 0.045), tubeAB(V(w / 2, 0, z0 + d), V(w / 2, h, z0 + d), 0.045)]), K.black);
  add(parent, rbox(w + 0.2, 0.09, d + 0.25, 0.03, 0, h + 0.04, z0 + d / 2), roofMat || K.black);
  workLight(parent, K, w / 2 - 0.1, h + 0.12, z0 + d + 0.08, 0, 0.3, 0.8); workLight(parent, K, -w / 2 + 0.1, h + 0.12, z0 + d + 0.08, 0, 0.3, 0.8);
  workLight(parent, K, 0, h + 0.12, z0 - 0.1, Math.PI, 0.3, 0.8);
}
function steeringWheel(K, parent, x, y, z, tilt = 0.6) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.x = -tilt; parent.add(g);
  add(g, mergeG([new THREE.TorusGeometry(0.17, 0.018, 8, 24).rotateX(Math.PI / 2), bx(0.32, 0.02, 0.03, 0, 0, 0), cy(0.025, 0.025, 0.5, 8, 0, -0.25, 0)]), K.plastic, false);
  return g;
}
function canopyCab(m, parent, x, y, z, enclosed = true) {
  // compact enclosed cab used by roller / dozer / loader
  const K = m.mats, c = new THREE.Group(); c.position.set(x, y, z); parent.add(c);
  const w = 1.3, h = 1.75, d = 1.4;
  add(c, rbox(w, 0.1, d, 0.03, 0, 0.05, 0), K.black);
  const fr = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) fr.push(tubeAB(V(sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04)), V(sx * (w / 2 - 0.06), h, sz * (d / 2 - 0.06)), 0.045, 10));
  fr.push(bx(w, 0.06, 0.06, 0, 0.75, d / 2 - 0.04), bx(w, 0.06, 0.06, 0, 0.75, -d / 2 + 0.04), bx(0.06, 0.06, d, w / 2 - 0.04, 0.75, 0), bx(0.06, 0.06, d, -w / 2 + 0.04, 0.75, 0));
  add(c, mergeG(fr), K.black);
  add(c, rbox(w + 0.16, 0.12, d + 0.16, 0.05, 0, h + 0.05, 0), K.paint);
  if (enclosed) {
    for (const [px, pz, ry, ww] of [[0, d / 2 - 0.03, 0, w - 0.1], [0, -d / 2 + 0.03, Math.PI, w - 0.1], [w / 2 - 0.03, 0, Math.PI / 2, d - 0.1], [-w / 2 + 0.03, 0, -Math.PI / 2, d - 0.1]]) {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(ww, h - 0.2), K.glass); gl.position.set(px, h / 2 + 0.05, pz); gl.rotation.y = ry; c.add(exteriorOnly(gl));
    }
  }
  seat(K, c, 0, 0.45, -0.2);
  steeringWheel(K, c, 0, 0.95, 0.35);
  mirror(c, K, V(w / 2, 1.2, d / 2 - 0.1), V(w / 2 + 0.3, 1.5, d / 2), -0.3); mirror(c, K, V(-w / 2, 1.2, d / 2 - 0.1), V(-w / 2 - 0.3, 1.5, d / 2), 0.3);
  workLight(c, K, 0.4, h + 0.18, d / 2 + 0.05, 0, 0.25, 0.8); workLight(c, K, -0.4, h + 0.18, d / 2 + 0.05, 0, 0.25, 0.8);
  m.beacon = add(c, cy(0.05, 0.05, 0.12, 14, 0.45, h + 0.19, -d / 2 + 0.2), K.amber, false); m.beacon.userData.keep = true;
  m.seat = anchor(c, 0, 1.35, -0.1);
  m.cabShell = c;
  return c;
}
function attStub(behaviour, extra = {}) { return { group: new THREE.Group(), jaws: [], probes: [], colliders: [], behaviour, bulk: null, pieces: 0, ...extra }; }

// --------------------------------------------------------------------------- tandem vibratory roller
export function buildRoller(m) {
  const K = m.mats;
  m.under = new THREE.Group(); m.model.add(m.under);      // rear frame (engine, operator)
  m.front = new THREE.Group(); m.front.position.z = 0.35; m.model.add(m.front);   // front frame pivots at the articulation joint
  m.upper = m.under;
  const drum = (parent, z) => {
    const g = new THREE.Group(); g.position.set(0, 0.68, z); parent.add(g);
    const spin = new THREE.Group(); g.add(spin);
    add(spin, mergeG([cy(0.68, 0.68, 1.72, 48, 0, 0, 0, 0, 0, Math.PI / 2), cy(0.6, 0.6, 1.74, 36, 0, 0, 0, 0, 0, Math.PI / 2)]), K.steel);
    add(spin, mergeG([boltCircle(V(0.88, 0, 0), 0.3, 10, V(1, 0, 0), 0.02), boltCircle(V(-0.88, 0, 0), 0.3, 10, V(-1, 0, 0), 0.02)]), K.dark);
    // drum frame: side plates with round covers, scraper bar, spray bar
    add(g, mergeG([...[-1, 1].map((s) => rbox(0.12, 1.25, 1.9, 0.05, s * 0.96, 0.32, 0)), ...[-1, 1].map((s) => cy(0.38, 0.38, 0.06, 28, s * 1.03, 0, 0, 0, 0, Math.PI / 2)), rbox(2.05, 0.32, 0.4, 0.05, 0, 0.82, 0)]), K.paint);
    add(g, mergeG([bx(1.8, 0.05, 0.08, 0, -0.1, (z > 0 ? 1 : -1) * 0.72, 0.6), cy(0.025, 0.025, 1.8, 8, 0, 0.55, (z > 0 ? 1 : -1) * 0.6, 0, 0, Math.PI / 2), ...[-1, 1].map((s) => boltCircle(V(s * 1.065, 0, 0), 0.3, 8, V(s, 0, 0), 0.016))]), K.dark);
    m.wheels.push(spin);
    return g;
  };
  const fd = drum(m.front, 1.35), rd = drum(m.under, -1.75);
  // front frame: water tank, hitch, headlights
  add(m.front, mergeG([rbox(1.6, 0.85, 0.9, 0.12, 0, 1.68, 1.25), rbox(0.6, 0.5, 0.9, 0.06, 0, 1.05, 0.3), rbox(1.4, 0.12, 0.5, 0.04, 0, 1.12, 0.45)]), K.paint);
  add(m.front, mergeG([cy(0.12, 0.12, 0.06, 16, 0, 2.13, 1.25), pinX(0.07, 0.75, 0, 1.0, 0.0)]), K.dark);
  workLight(m.front, K, 0.55, 2.05, 1.72, 0, 0.05); workLight(m.front, K, -0.55, 2.05, 1.72, 0, 0.05);
  stick(m.front, 'warn', 0.18, 0.4, 1.6, 1.706, 0); stick(m.front, 'crush', 0.24, 0.81, 1.6, 1.2, Math.PI / 2);
  // rear frame: engine bay with grilles, operator platform, rear tank, exhaust
  add(m.under, mergeG([rbox(1.65, 0.95, 1.6, 0.14, 0, 1.55, -1.55), rbox(0.6, 0.5, 0.9, 0.06, 0, 1.05, 0.1), rbox(2.0, 0.14, 1.6, 0.04, 0, 1.06, -0.25)]), K.paint);
  grille(m.under, 1.2, 0.5, 0, 1.55, -2.36, Math.PI); grille(m.under, 1.0, 0.45, 0.83, 1.55, -1.6, Math.PI / 2); grille(m.under, 1.0, 0.45, -0.83, 1.55, -1.6, -Math.PI / 2);
  add(m.under, mergeG([cy(0.06, 0.06, 0.6, 12, 0.55, 2.25, -1.2), cy(0.075, 0.07, 0.06, 12, 0.55, 2.56, -1.2)]), K.black);
  add(m.under, mergeG([bx(1.5, 0.04, 0.9, 0, 1.15, -0.3)]), K.tread);
  add(m.under, mergeG([rail([[0.85, 1.15, 0.3], [0.85, 2.05, 0.3]], 0.025), rail([[-0.85, 1.15, 0.3], [-0.85, 2.05, 0.3]], 0.025), ladder(0.95, 0.25, 1.1, 0.0, 0.32, 0.28), ladder(-0.95, 0.25, 1.1, 0.0, 0.32, 0.28)]), m.ctx.M.paintYellow);
  // ROPS canopy and operator station
  const st = new THREE.Group(); st.position.y = 1.12; m.under.add(st);
  rops(K, st, 1.5, 2.0, 1.3, -1.0, K.black);
  seat(K, st, 0, 0.42, -0.45);
  steeringWheel(K, st, 0, 0.9, 0.05);
  add(st, mergeG([rbox(0.5, 0.75, 0.25, 0.05, 0, 0.38, 0.22), rbox(0.15, 0.14, 0.4, 0.03, 0.35, 0.65, -0.3)]), K.plastic, false);
  const scr = add(st, bx(0.26, 0.15, 0.01, 0, 0.72, 0.1, -0.5), new THREE.MeshBasicMaterial({ color: 0x40c070 }), false); scr.userData.keep = true;
  for (const s of [-1, 1]) { const brand = label(m.spec.brand, 0.9, 0.24, '#15171a'); brand.position.set(s * 0.832, 1.7, -1.4); brand.rotation.y = s * Math.PI / 2; m.under.add(brand); }
  const model = label(m.spec.model, 0.6, 0.18, '#15171a'); model.position.set(0.81, 1.75, 1.0); model.rotation.y = Math.PI / 2; m.front.add(model);
  m.beacon = add(m.under, cy(0.05, 0.05, 0.12, 14, 0.6, 2.18, -1.55), K.amber, false); m.beacon.userData.keep = true;
  m.seat = anchor(st, 0, 1.35, -0.4);
  m.door = anchor(m.under, 1.1, 0, 0.0);
  m.attach = m.front; m.grabPoint = anchor(m.front, 0, 0.1, 1.35);
  m.att = attStub('roller', { drums: [fd, rd] });
  m.colliderSets.push({ obj: m.under, boxes: [[0, 1.0, -1.3, 2.1, 1.9, 2.8]], chassis: true }, { obj: m.front, boxes: [[0, 1.0, 1.0, 2.1, 1.9, 2.0]], chassis: true });
  m.probes = [];
  m.radius = 2.6;
  m.bakeList.push(m.under, m.front);
  m.rig = { family: 'roller', drive: 'artic', wheelbase: 3.1, swing: false, limits: {}, rates: {},
    apply(mm) { mm.front.rotation.y = mm.steerVis; if (mm.vibrating) { const v = Math.sin(performance.now() * 0.12) * 0.004; fd.position.y = 0.68 + v; rd.position.y = 0.68 - v; } } };
  m.defaults = { boom: 0, stick: 0, curl: 0 };
}

// --------------------------------------------------------------------------- asphalt paver
export function buildPaver(m) {
  const K = m.mats, U = new THREE.Group(); m.model.add(U); m.under = U; m.upper = U;
  for (const s of [-1, 1]) { const tu = buildTrackUnit(null, { length: 3.0, radius: 0.32, width: 0.4, rollers: 5, rubber: true, frameColor: K.dark, mats: K, side: s }); tu.group.position.set(s * 0.95, 0, 0.2); U.add(tu.group); m.tracks.push(tu); }
  add(U, mergeG([rbox(2.2, 0.55, 3.6, 0.06, 0, 0.95, 0.2), rbox(2.3, 0.1, 3.6, 0.03, 0, 1.25, 0.2)]), K.paint);
  // engine hood with grilles and exhaust
  add(U, mergeG([rbox(2.0, 0.8, 1.2, 0.12, 0, 1.7, -0.2)]), K.paint);
  grille(U, 1.4, 0.4, 0, 2.11, -0.2, 0).rotation.x = -Math.PI / 2;
  grille(U, 0.9, 0.5, 1.001, 1.7, -0.2, Math.PI / 2);
  add(U, mergeG([cy(0.07, 0.07, 0.7, 12, -0.7, 2.4, -0.4), cy(0.08, 0.075, 0.06, 12, -0.7, 2.76, -0.4)]), K.black);
  // operator platform with two seats, consoles and a sun roof
  add(U, mergeG([bx(2.4, 0.05, 1.1, 0, 1.3, -1.25)]), K.tread);
  seat(K, U, 0.6, 1.62, -1.25, Math.PI); seat(K, U, -0.6, 1.62, -1.25, Math.PI);
  add(U, mergeG([rbox(0.5, 0.35, 0.3, 0.05, 0.6, 1.95, -0.85), rbox(0.5, 0.35, 0.3, 0.05, -0.6, 1.95, -0.85)]), K.plastic, false);
  add(U, mergeG([tubeAB(V(-1.05, 1.3, -1.7), V(-1.05, 3.1, -1.7), 0.04), tubeAB(V(1.05, 1.3, -1.7), V(1.05, 3.1, -1.7), 0.04), tubeAB(V(-1.05, 1.3, -0.8), V(-1.05, 3.1, -0.8), 0.04), tubeAB(V(1.05, 1.3, -0.8), V(1.05, 3.1, -0.8), 0.04)]), K.black);
  add(U, rbox(2.5, 0.08, 1.4, 0.03, 0, 3.12, -1.25), K.grey);
  add(U, rail([[1.2, 2.25, -1.8], [1.2, 2.25, -0.75]], 0.025, 1.3), m.ctx.M.paintYellow); add(U, rail([[-1.2, 2.25, -1.8], [-1.2, 2.25, -0.75]], 0.025, 1.3), m.ctx.M.paintYellow);
  // hopper with folding wings, push rollers, conveyor slats
  const hopper = new THREE.Group(); hopper.position.set(0, 1.0, 1.4); U.add(hopper);
  add(hopper, mergeG([bx(1.6, 0.06, 1.6, 0, 0, 0.6), bx(1.6, 0.8, 0.06, 0, 0.4, 1.4)]), K.dark);
  const slats = []; for (let i = 0; i < 8; i++) slats.push(bx(0.5, 0.03, 0.06, 0, 0.04, -0.2 + i * 0.2));
  add(hopper, mergeG(slats), K.steel);
  m.wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.8, 0, 0.6); hopper.add(w);
    add(w, mergeG([bx(0.05, 0.75, 1.6, s * 0.45, 0.35, 0, 0, 0, s * -0.9), bx(1.0, 0.04, 1.6, s * 0.48, 0.0, 0), bx(0.05, 0.4, 1.6, s * 0.95, 0.22, 0)]), K.paint);
    add(w, cy(0.05, 0.05, 0.6, 10, s * 0.3, -0.1, 0.0, 0, 0, s * 0.5), K.chrome);
    m.wings.push({ obj: w, s });
  }
  add(U, mergeG([pinX(0.11, 0.3, 0.55, 0.85, 2.95), pinX(0.11, 0.3, -0.55, 0.85, 2.95), bx(1.4, 0.15, 0.15, 0, 0.85, 2.8)]), K.dark);
  // screed with extensions, walkways, auger, control boxes
  const screed = new THREE.Group(); screed.position.set(0, 0.35, -2.1); U.add(screed);
  add(screed, mergeG([rbox(3.2, 0.5, 0.7, 0.05, 0, 0.0, 0), rbox(3.4, 0.08, 0.4, 0.02, 0, 0.3, -0.45), bx(3.2, 0.06, 0.6, 0, -0.27, 0.0)]), K.paint);
  add(screed, mergeG([bx(3.0, 0.04, 0.4, 0, 0.32, -0.45), ...[-1, 1].map((s) => rbox(0.3, 0.3, 0.2, 0.03, s * 1.3, 0.45, -0.55))]), K.dark);
  add(screed, rail([[-1.6, 1.0, -0.65], [1.6, 1.0, -0.65]], 0.022, 0.32), m.ctx.M.paintYellow);
  const auger = []; for (let i = 0; i < 26; i++) { const t = bx(0.2, 0.03, 0.05, -1.25 + i * 0.1, 0, 0.55); t.rotateX(i * 0.6); auger.push(t.translate(0, 0.0, 0)); }
  add(screed, mergeG([pinX(0.04, 2.8, 0, 0, 0.55), ...auger]), K.steel);
  m.screed = screed;
  for (const s of [-1, 1]) { const b = label(m.spec.brand, 0.9, 0.24, '#15171a'); b.position.set(s * 1.111, 1.0, 0.2); b.rotation.y = s * Math.PI / 2; U.add(b); }
  stick(U, 'warn', 0.2, 1.0, 1.3, 2.32, 0); stick(U, 'crush', 0.24, 1.112, 1.0, -1.2, Math.PI / 2);
  m.beacon = add(U, cy(0.05, 0.05, 0.12, 14, 1.0, 3.22, -1.25), K.amber, false); m.beacon.userData.keep = true;
  workLight(U, K, 1.1, 3.05, -0.6, 0, 0.3); workLight(U, K, -1.1, 3.05, -0.6, 0, 0.3); workLight(U, K, 0, 3.05, -1.9, Math.PI, 0.5);
  // cement in the hopper
  m.hopperFill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4 }));
  m.hopperFill.position.set(0, 0.1, 0.6); m.hopperFill.visible = false; m.hopperFill.userData.keep = true; hopper.add(m.hopperFill);
  m.seat = anchor(U, 0.6, 2.9, -1.25); m.door = anchor(U, 1.35, 0, -1.0);
  m.attach = hopper; m.grabPoint = anchor(hopper, 0, 0.3, 0.6);
  m.att = attStub('paver', { bulk: { kinds: ['cement'], capacity: 3000 }, mouth: anchor(hopper, 0, 0.5, 0.6), mouthN: V(0, 1, 0), screedPoint: anchor(screed, 0, -0.3, 0) });
  m.colliderSets.push({ obj: U, boxes: [[0, 0.9, 0.2, 2.4, 1.3, 3.6], [0, 1.7, -0.2, 2.0, 0.8, 1.2]], chassis: true }, { obj: hopper, boxes: [[0, 0.0, 0.6, 1.6, 0.1, 1.6], [0, 0.4, 1.4, 1.6, 0.8, 0.1]] }, { obj: screed, boxes: [[0, 0, 0, 3.2, 0.5, 0.7]] });
  m.radius = 2.4;
  m.bakeList.push(U, hopper, screed);
  m.rig = { family: 'paver', drive: 'tank', swing: false, limits: { boom: [0, 0.4], curl: [0, 1.0] }, rates: { boom: 0.3, curl: 0.6 },
    apply(mm) { for (const w of mm.wings) w.obj.rotation.z = w.s * mm.curl * 1.0; mm.screed.position.y = 0.35 + (0.4 - mm.boom) * 0.5; } };
  m.defaults = { boom: 0.4, stick: 0, curl: 0 };
}

// --------------------------------------------------------------------------- articulated wheel loader
export function buildLoader(m) {
  const K = m.mats;
  m.under = new THREE.Group(); m.model.add(m.under); m.upper = m.under;
  m.front = new THREE.Group(); m.front.position.z = 0.2; m.model.add(m.front);
  const tg = tyre(K, 0.88, 0.62, 20), rg = rim(K, 0.52, 0.6);
  for (const [grp, z] of [[m.front, 1.55], [m.under, -1.85]]) for (const s of [-1, 1]) {
    const hub = new THREE.Group(); hub.position.set(s * 1.05, 0.88, z - (grp === m.front ? 0.2 : 0)); grp.add(hub);
    const spin = new THREE.Group(); hub.add(spin);
    add(spin, tg, K.rubber); add(spin, rg, K.grey, false);
    m.wheels.push(spin);
    add(hub, mergeG([rbox(0.75, 0.08, 1.9, 0.03, 0, 0.95, 0), bx(0.06, 0.4, 1.7, s * 0.36, 0.78, 0)]), K.paint);
  }
  // rear frame: long rounded engine hood, grille, counterweight bumper, exhaust + intake, cab, ladder
  const U = m.under;
  add(U, mergeG([rbox(1.6, 0.6, 3.4, 0.08, 0, 1.0, -1.6), rbox(1.7, 1.1, 2.3, 0.22, 0, 1.85, -2.05), rbox(2.3, 0.75, 0.55, 0.12, 0, 1.15, -3.5), rbox(1.2, 0.5, 0.9, 0.06, 0, 1.05, -0.2)]), K.paint);
  grille(U, 1.3, 0.75, 0, 1.85, -3.21, Math.PI);
  grille(U, 1.4, 0.55, 0.851, 2.0, -2.1, Math.PI / 2); grille(U, 1.4, 0.55, -0.851, 2.0, -2.1, -Math.PI / 2);
  add(U, mergeG([cy(0.08, 0.08, 0.6, 14, 0.35, 2.65, -1.6), cy(0.095, 0.085, 0.06, 14, 0.35, 2.97, -1.6), cy(0.12, 0.13, 0.35, 16, -0.4, 2.55, -1.3)]), K.black);
  add(U, mergeG([...[-1, 1].map((s) => rbox(0.18, 0.12, 0.05, 0.02, s * 0.8, 1.3, -3.78)), ...[-1, 1].map((s) => bx(0.14, 0.08, 0.02, s * 0.8, 1.3, -3.8))]), K.red, false);
  canopyCab(m, U, 0, 1.35, -0.6);
  add(U, ladder(0.95, 0.3, 1.35, -0.35, 0.36, 0.27, -0.25), m.ctx.M.paintYellow);
  add(U, rail([[0.95, 2.2, -0.2], [0.95, 2.2, -1.3]], 0.022, 1.4), m.ctx.M.paintYellow);
  for (const s of [-1, 1]) { const b = label(m.spec.brand, 1.2, 0.32, '#15171a'); b.position.set(s * 0.852, 1.6, -2.6); b.rotation.y = s * Math.PI / 2; U.add(b); stick(U, 'crush', 0.22, s * 0.81, 1.1, -1.0, s * Math.PI / 2); }
  // front frame + lift arms (Z-bar linkage) + bucket
  const F = m.front;
  add(F, mergeG([rbox(1.2, 0.7, 2.2, 0.06, 0, 1.0, 1.4), rbox(1.6, 0.25, 0.6, 0.05, 0, 0.75, 1.35), pinX(0.12, 1.5, 0, 1.75, 0.65, 18)]), K.paint);
  m.armG = new THREE.Group(); m.armG.position.set(0, 1.75, 0.65); F.add(m.armG);
  const armL = 3.0;
  for (const s of [-1, 1]) add(m.armG, mergeG([sidePlate([[0, -0.15], [1.2, -0.25], [armL, -0.12], [armL, 0.12], [1.2, 0.18], [0, 0.18]], 0.12, s * 0.62 - 0.06, 0.01), pinX(0.1, 0.18, s * 0.62, 0, armL)]), K.paint);
  add(m.armG, mergeG([pinX(0.1, 1.36, 0, -0.05, 1.4, 16), rbox(1.2, 0.2, 0.25, 0.04, 0, -0.05, 1.4)]), K.dark);
  // bellcrank
  m.bell = new THREE.Group(); m.bell.position.set(0, 0.35, 1.4); m.armG.add(m.bell);
  add(m.bell, mergeG([rbox(0.12, 0.9, 0.22, 0.03, -0.1, 0, 0), rbox(0.12, 0.9, 0.22, 0.03, 0.1, 0, 0), pinX(0.07, 0.4, 0, 0, 0)]), K.paint);
  m.attach = new THREE.Group(); m.attach.position.set(0, 0, armL); m.armG.add(m.attach);
  const bucket = new THREE.Group(); m.attach.add(bucket);
  const W = 2.9;
  const back = curvePts([[-0.2, 0.9], [-0.35, 0.55], [-0.4, 0.0], [-0.2, -0.38], [0.3, -0.5], [1.1, -0.48]]);
  const g = [shell(back, 0.04, W)];
  for (const s of [-1, 1]) g.push(sidePlate([...back, [1.15, -0.45], [0.2, 0.95]], 0.035, s * W / 2 - (s > 0 ? 0.035 : 0)));
  add(bucket, mergeG(g), K.paint);
  add(bucket, mergeG([bx(W + 0.04, 0.05, 0.25, 0, -0.47, 1.12, 0.05), bx(W, 0.06, 0.08, 0, 0.88, -0.22), bx(0.12, 0.6, 0.22, 0.42, 0.42, -0.5), bx(0.12, 0.6, 0.22, -0.42, 0.42, -0.5), boltRow(V(-W / 2 + 0.1, -0.44, 1.05), V(W / 2 - 0.1, -0.44, 1.05), 14, V(0, 1, 0), 0.013, 0.01)]), K.dark);
  bucket.position.set(0, 0.3, -0.05);
  m.att = { group: bucket, kind: 'loader', jaws: [], probes: [{ obj: anchor(bucket, 0, -0.45, 1.1), r: 0.45 }, { obj: anchor(bucket, 1.2, -0.4, 1.0), r: 0.35 }, { obj: anchor(bucket, -1.2, -0.4, 1.0), r: 0.35 }],
    colliders: [{ obj: m.attach, boxes: [[0, -0.22, 0.45, W, 0.1, 1.3], [0, 0.25, -0.3, W, 1.2, 0.12], [-W / 2, 0.15, 0.3, 0.08, 1.0, 1.3], [W / 2, 0.15, 0.3, 0.08, 1.0, 1.3]] }],
    behaviour: 'scoop', bulk: { kinds: ['dust', 'cement', 'water'], capacity: 5200 }, pieces: 40,
    grab: anchor(bucket, 0, 0.0, 0.45), grabR: 1.2, mouth: anchor(bucket, 0, 0.25, 0.85), mouthN: V(0, 0.25, 1).normalize(), cylAnchor: V(0, 0.6, -0.2) };
  m.att.contents = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
  m.att.contents.position.set(0, -0.25, 0.35); m.att.contents.visible = false; m.att.contents.userData.keep = true; bucket.add(m.att.contents);
  m.att.contentsScale = V(1.3, 0.45, 0.6);
  m.grabPoint = m.att.grab;
  for (const p of m.att.probes) m.probes.push(p);
  for (const s of [-1, 1]) cylinder(m, anchor(F, s * 0.5, 0.95, 0.9), anchor(m.armG, s * 0.62, -0.2, 1.6), 0.12, 0.07);
  cylinder(m, anchor(F, 0, 1.45, 1.15), anchor(m.bell, 0, 0.42, 0), 0.13, 0.075);
  m.linkA = anchor(m.bell, 0, -0.42, 0); m.linkB = anchor(bucket, 0, 0.72, -0.45);
  m.link = new THREE.Mesh(mergeG([bx(0.16, 1, 0.12, 0, 0.5, 0)]), K.paint); m.link.userData.keep = true; m.link.castShadow = true; m.upper.add(m.link);
  m.seat = m.seat; m.door = anchor(U, 1.2, 0, -0.6);
  m.colliderSets.push({ obj: U, boxes: [[0, 1.3, -1.9, 2.4, 2.0, 3.8]], chassis: true }, { obj: F, boxes: [[0, 1.1, 1.3, 2.4, 1.4, 2.2]], chassis: true }, { obj: m.armG, boxes: [[0, 0, 1.5, 1.4, 0.35, 3.0]], breaks: true });
  for (const c of m.att.colliders) m.colliderSets.push({ obj: c.obj, boxes: c.boxes, breaks: true });
  m.radius = 3.2;
  m.bakeList.push(U, F, m.armG, m.bell, bucket);
  m.rig = { family: 'loader', drive: 'artic', wheelbase: 3.2, swing: false, limits: { boom: [-0.85, 0.56], curl: [-0.9, 0.85] }, rates: { boom: 0.45, curl: 0.9 },
    apply(mm) {
      mm.front.rotation.y = mm.steerVis; mm.armG.rotation.x = mm.boom; mm.attach.rotation.x = -mm.boom - mm.curl; mm.bell.rotation.x = -mm.curl * 0.7;
      mm.root.updateMatrixWorld(true);
      const a = mm.upper.worldToLocal(mm.linkA.getWorldPosition(new THREE.Vector3())), b = mm.upper.worldToLocal(mm.linkB.getWorldPosition(new THREE.Vector3()));
      const d = b.clone().sub(a); mm.link.position.copy(a); mm.link.scale.set(1, d.length(), 1); mm.link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    } };
  m.defaults = { boom: 0.38, stick: 0, curl: -0.3 };
}

// --------------------------------------------------------------------------- bulldozer
export function buildDozer(m) {
  const K = m.mats, U = new THREE.Group(); m.model.add(U); m.under = U; m.upper = U;
  for (const s of [-1, 1]) { const tu = buildTrackUnit(null, { length: 4.0, radius: 0.48, width: 0.62, rollers: 7, frameColor: K.under, mats: K, side: s }); tu.group.position.x = s * 1.25; U.add(tu.group); m.tracks.push(tu); }
  add(U, mergeG([rbox(1.9, 0.6, 3.6, 0.08, 0, 1.15, -0.1), rbox(1.7, 0.95, 1.9, 0.16, 0, 1.9, 0.75), rbox(2.0, 0.1, 3.4, 0.03, 0, 1.47, -0.2), rbox(1.6, 0.7, 0.9, 0.08, 0, 1.75, -1.55)]), K.paint);
  grille(U, 1.3, 0.75, 0, 1.95, 1.71, 0);
  grille(U, 1.3, 0.45, 0.851, 2.05, 0.75, Math.PI / 2); grille(U, 1.3, 0.45, -0.851, 2.05, 0.75, -Math.PI / 2);
  add(U, mergeG([cy(0.08, 0.08, 0.75, 14, 0.4, 2.7, 0.9), cy(0.095, 0.085, 0.06, 14, 0.4, 3.08, 0.9), cy(0.13, 0.14, 0.35, 16, -0.4, 2.55, 1.0)]), K.black);
  canopyCab(m, U, 0, 1.5, -0.5);
  add(U, rail([[1.0, 2.6, 0.0], [1.0, 2.6, 1.6]], 0.022, 1.52), m.ctx.M.paintYellow); add(U, rail([[-1.0, 2.6, 0.0], [-1.0, 2.6, 1.6]], 0.022, 1.52), m.ctx.M.paintYellow);
  for (const s of [-1, 1]) { const b = label(m.spec.brand, 1.1, 0.3, '#15171a'); b.position.set(s * 0.852, 2.0, 1.1); b.rotation.y = s * Math.PI / 2; U.add(b); stick(U, 'warn', 0.18, s * 0.952, 1.2, -1.2, s * Math.PI / 2); }
  // blade on push arms, pivoting at the track frames
  m.armG = new THREE.Group(); m.armG.position.set(0, 0.75, -0.3); U.add(m.armG);
  for (const s of [-1, 1]) add(m.armG, mergeG([rbox(0.16, 0.28, 3.0, 0.03, s * 1.62, 0, 1.5), pinX(0.1, 0.25, s * 1.62, 0, 0)]), K.paint);
  m.attach = new THREE.Group(); m.attach.position.set(0, 0, 3.05); m.armG.add(m.attach);
  const bladeW = 4.0;
  const prof = curvePts([[0.2, -0.45], [-0.05, 0.1], [0.05, 0.75], [0.35, 1.1]], 14);
  const inner = prof.map(([z, y]) => [z + 0.07, y]).reverse();
  const bg = sidePlate([...prof, ...inner], bladeW, -bladeW / 2, 0.01);
  add(m.attach, bg, K.paint);
  const ribs = []; for (let i = 0; i < 7; i++) ribs.push(bx(0.06, 1.2, 0.25, -bladeW / 2 + 0.25 + i * (bladeW - 0.5) / 6, 0.3, -0.12));
  add(m.attach, mergeG([...ribs, bx(bladeW, 0.12, 0.3, 0, 0.95, -0.05)]), K.paint);
  add(m.attach, mergeG([bx(bladeW + 0.05, 0.06, 0.12, 0, -0.45, 0.22, 0.3), bx(0.12, 0.6, 0.35, -bladeW / 2, -0.15, 0.1), bx(0.12, 0.6, 0.35, bladeW / 2, -0.15, 0.1), boltRow(V(-bladeW / 2 + 0.2, -0.4, 0.29), V(bladeW / 2 - 0.2, -0.4, 0.29), 18, V(0, 0.3, 1), 0.014, 0.01)]), K.dark);
  // ripper at the back
  m.ripper = new THREE.Group(); m.ripper.position.set(0, 1.1, -2.1); U.add(m.ripper);
  add(m.ripper, mergeG([rbox(2.0, 0.25, 0.3, 0.04, 0, 0, -0.5), ...[-0.7, 0, 0.7].map((x) => rbox(0.12, 1.2, 0.18, 0.02, x, -0.6, -0.55, -0.2)), ...[-0.7, 0, 0.7].map((x) => { const c = new THREE.ConeGeometry(0.07, 0.25, 4); c.rotateX(Math.PI + 0.4); return c.translate(x, -1.25, -0.4); })]), K.dark);
  add(m.ripper, mergeG([rbox(0.12, 0.2, 0.7, 0.02, 0.8, 0.0, -0.25), rbox(0.12, 0.2, 0.7, 0.02, -0.8, 0.0, -0.25)]), K.paint);
  for (const s of [-1, 1]) cylinder(m, anchor(U, s * 0.85, 1.9, 1.6), anchor(m.attach, s * 0.85, 0.7, -0.1), 0.1, 0.06);
  for (const s of [-1, 1]) cylinder(m, anchor(U, s * 0.6, 1.6, -1.8), anchor(m.ripper, s * 0.6, 0.15, -0.5), 0.09, 0.055);
  m.seat = m.seat; m.door = anchor(U, 1.3, 0, -0.5);
  m.attach.userData.blade = true;
  m.att = { group: m.attach, kind: 'blade', jaws: [], probes: [], colliders: [], behaviour: 'blade', bulk: null, pieces: 0, grab: anchor(m.attach, 0, 0, 0.5) };
  for (let i = 0; i < 5; i++) m.probes.push({ obj: anchor(m.attach, -1.6 + i * 0.8, 0.2, 0.25), r: 0.5 });
  m.grabPoint = m.att.grab;
  m.colliderSets.push({ obj: U, boxes: [[-1.25, 0.6, 0, 0.7, 1.1, 4.0], [1.25, 0.6, 0, 0.7, 1.1, 4.0], [0, 1.6, 0, 1.9, 1.3, 3.6]], chassis: true },
    { obj: m.attach, boxes: [[0, 0.3, 0.05, bladeW, 1.5, 0.25]], breaks: true }, { obj: m.ripper, boxes: [[0, -0.6, -0.5, 1.6, 1.2, 0.3]], breaks: true });
  m.radius = 3.0;
  m.bakeList.push(U, m.armG, m.attach, m.ripper);
  m.rig = { family: 'dozer', drive: 'tank', swing: false, limits: { boom: [-0.12, 0.18], curl: [-0.35, 0.35], stick: [-0.5, 0.3] }, rates: { boom: 0.25, curl: 0.5, stick: 0.5 },
    apply(mm) { mm.armG.rotation.x = mm.boom; mm.attach.rotation.x = -mm.boom + mm.curl; mm.ripper.rotation.x = -mm.stickA; } };
  m.defaults = { boom: 0.1, stick: 0.3, curl: 0 };
}

// --------------------------------------------------------------------------- tracked dumper with a slewing, tipping skip
export function buildDumper(m) {
  const K = m.mats, U = new THREE.Group(); m.model.add(U); m.under = U;
  for (const s of [-1, 1]) { const tu = buildTrackUnit(null, { length: 3.0, radius: 0.32, width: 0.45, rollers: 5, rubber: true, frameColor: K.dark, mats: K, side: s }); tu.group.position.x = s * 0.82; U.add(tu.group); m.tracks.push(tu); }
  add(U, mergeG([rbox(1.3, 0.45, 2.8, 0.06, 0, 0.85, 0), rbox(1.6, 0.85, 0.9, 0.12, 0, 1.45, 1.15)]), K.paint);
  grille(U, 1.1, 0.4, 0, 1.5, 1.601, 0);
  add(U, mergeG([cy(0.06, 0.06, 0.5, 12, 0.55, 2.05, 1.3), cy(0.07, 0.065, 0.05, 12, 0.55, 2.31, 1.3)]), K.black);
  add(U, mergeG([cy(0.55, 0.58, 0.12, 36, 0, 1.12, -0.35), boltCircle(V(0, 1.18, -0.35), 0.5, 16, V(0, 1, 0), 0.014)]), K.dark);
  // operator seat at the front with ROPS
  const st = new THREE.Group(); st.position.set(0, 1.9, 1.15); U.add(st);
  seat(K, st, 0, 0.2, -0.05, 0);
  add(st, mergeG([rbox(0.4, 0.4, 0.2, 0.04, 0, 0.3, 0.4)]), K.plastic, false);
  rops(K, U, 1.3, 3.2, 0.8, 0.75, K.paint);
  m.seat = anchor(st, 0, 1.15, 0); m.door = anchor(U, 1.0, 0, 1.0);
  m.beacon = add(U, cy(0.05, 0.05, 0.12, 14, 0.55, 3.32, 0.85), K.amber, false); m.beacon.userData.keep = true;
  for (const s of [-1, 1]) { const b = label(m.spec.brand, 0.8, 0.22, '#15171a'); b.position.set(s * 0.802, 1.5, 1.1); b.rotation.y = s * Math.PI / 2; U.add(b); }
  // slewing turntable + tipping skip
  m.upper = new THREE.Group(); m.upper.position.set(0, 1.2, -0.35); U.add(m.upper);
  add(m.upper, mergeG([rbox(1.2, 0.15, 1.2, 0.03, 0, 0.05, 0)]), K.dark);
  // skip pivots on its open, sloped lip (facing rearwards, away from the operator) and tips over it
  m.attach = new THREE.Group(); m.attach.position.set(0, 0.15, -0.75); m.upper.add(m.attach);
  const bed = new THREE.Group(); bed.position.set(0, 0, 0.75); bed.rotation.y = Math.PI; m.attach.add(bed);
  const prof = [[-0.9, 0.0], [0.75, 0.0], [1.15, 0.85], [-0.95, 0.85]];
  add(bed, mergeG([sidePlate(prof, 0.05, -0.95), sidePlate(prof, 0.05, 0.9), bx(1.9, 0.06, 1.7, 0, 0.03, -0.08), bx(1.9, 0.9, 0.06, 0, 0.45, -0.95), bx(1.9, 0.05, 0.6, 0, 0.42, 0.95, -1.13)]), K.paint);
  add(bed, mergeG([...[-0.6, 0, 0.6].map((x) => bx(0.05, 0.08, 1.7, x, -0.03, -0.08)), bx(2.0, 0.06, 0.06, 0, 0.87, -0.95)]), K.dark);
  stick(bed, 'warn', 0.2, 0.0, 0.5, -0.985, Math.PI);
  cylinder(m, anchor(m.upper, 0, 0.08, -0.25), anchor(bed, 0, -0.02, -0.55), 0.08, 0.05);
  m.att = attStub('bed', { group: bed, grab: anchor(bed, 0, 0.4, 0) });
  m.grabPoint = m.att.grab;
  m.colliderSets.push({ obj: U, boxes: [[0, 0.75, 0, 2.1, 1.0, 3.0], [0, 1.45, 1.15, 1.6, 0.85, 0.9]], chassis: true },
    { obj: bed, boxes: [[0, 0.0, -0.08, 1.9, 0.1, 1.75], [-0.95, 0.45, 0, 0.1, 0.9, 1.9], [0.95, 0.45, 0, 0.1, 0.9, 1.9], [0, 0.45, -0.97, 1.9, 0.9, 0.1]] });
  m.radius = 2.0;
  m.bakeList.push(U, m.upper, bed);
  m.rig = { family: 'dumper', drive: 'tank', swing: true, limits: { swing: [-1.6, 1.6], curl: [0, 1.05] }, rates: { swing: 0.6, curl: 0.6 },
    apply(mm) { mm.upper.rotation.y = mm.swing; mm.attach.rotation.x = -mm.curl; } };
  m.defaults = { boom: 0, stick: 0, curl: 0 };
}

// --------------------------------------------------------------------------- crawler crane with wrecking ball
export function buildCrane(m) {
  const K = m.mats, U0 = new THREE.Group(); m.model.add(U0); m.under = U0;
  for (const s of [-1, 1]) { const tu = buildTrackUnit(null, { length: 5.4, radius: 0.42, width: 0.8, rollers: 9, frameColor: K.under, mats: K, side: s }); tu.group.position.x = s * 1.75; U0.add(tu.group); m.tracks.push(tu); }
  add(U0, mergeG([rbox(2.8, 0.55, 2.2, 0.06, 0, 0.8, 0), cy(1.1, 1.15, 0.16, 48, 0, 1.12, 0), boltCircle(V(0, 1.2, 0), 1.0, 30, V(0, 1, 0), 0.016)]), K.under);
  m.upper = new THREE.Group(); m.upper.position.y = 1.2; m.model.add(m.upper);
  const U = m.upper;
  add(U, mergeG([rbox(2.9, 0.25, 4.6, 0.04, 0, 0.12, -0.6), rbox(2.6, 1.6, 2.8, 0.12, 0, 1.05, -1.2)]), K.paint);
  grille(U, 1.8, 0.8, 1.302, 1.2, -1.4, Math.PI / 2); grille(U, 1.8, 0.8, -1.302, 1.2, -1.4, -Math.PI / 2);
  // stacked counterweight slabs
  const cwp = []; for (let i = 0; i < 5; i++) cwp.push(rbox(2.7, 0.32, 1.0, 0.04, 0, 0.35 + i * 0.34, -3.05));
  add(U, mergeG(cwp), K.dark);
  add(U, mergeG([new THREE.TorusGeometry(0.1, 0.03, 8, 16).translate(0.9, 2.05, -3.05), new THREE.TorusGeometry(0.1, 0.03, 8, 16).translate(-0.9, 2.05, -3.05)]), K.steel);
  stick(U, 'warn', 0.25, 0, 1.0, -3.56, Math.PI);
  // gantry A-frame, winch drums, cab
  add(U, mergeG([tubeAB(V(-0.9, 1.85, -1.8), V(0, 4.2, -1.2), 0.07), tubeAB(V(0.9, 1.85, -1.8), V(0, 4.2, -1.2), 0.07), tubeAB(V(-0.9, 1.85, -0.4), V(0, 4.2, -1.2), 0.07), tubeAB(V(0.9, 1.85, -0.4), V(0, 4.2, -1.2), 0.07), pinX(0.12, 0.6, 0, 4.2, -1.2)]), K.paint);
  add(U, mergeG([cy(0.35, 0.35, 1.4, 24, 0, 1.95, -0.2, 0, 0, Math.PI / 2), cy(0.42, 0.42, 0.06, 24, 0.72, 1.95, -0.2, 0, 0, Math.PI / 2), cy(0.42, 0.42, 0.06, 24, -0.72, 1.95, -0.2, 0, 0, Math.PI / 2)]), K.dark);
  const cab = new THREE.Group(); cab.position.set(1.0, 0.25, 1.0); U.add(cab);
  m.cab = cab;
  add(cab, mergeG([rbox(1.0, 1.9, 1.7, 0.06, 0, 0.95, 0)]), K.black);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.2), K.glass); gl.position.set(0, 1.2, 0.86); cab.add(exteriorOnly(gl));
  const gl2 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.3), K.glass); gl2.position.set(0.51, 1.15, 0); gl2.rotation.y = Math.PI / 2; cab.add(exteriorOnly(gl2));
  seat(K, cab, 0, 0.5, -0.1);
  m.seat = anchor(cab, 0, 1.45, 0.0); m.door = anchor(cab, 0.8, -0.25, 0);
  add(cab, rbox(1.1, 0.08, 1.8, 0.03, 0, 1.94, 0), K.paint);
  workLight(cab, K, 0.3, 2.05, 0.85, 0, 0.3); workLight(cab, K, -0.3, 2.05, 0.85, 0, 0.3);
  m.beacon = add(U, cy(0.06, 0.06, 0.14, 14, -1.0, 1.95, -2.4), K.amber, false); m.beacon.userData.keep = true;
  for (const s of [-1, 1]) { const b = label(m.spec.brand, 1.6, 0.42, '#15171a'); b.position.set(s * 1.302, 1.3, -2.25); b.rotation.y = s * Math.PI / 2; U.add(b); }
  // lattice boom: 4 tapered chords + lacing + tip sheaves
  m.boomG = new THREE.Group(); m.boomG.position.set(0, 1.6, 1.4); U.add(m.boomG);
  const L = 16, w0 = 0.95, w1 = 0.45;
  const chordAt = (t, sx, sy) => { const w = w0 + (w1 - w0) * t; return V(sx * w / 2, sy * w / 2, t * L); };
  const lat = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lat.push(tubeAB(chordAt(0, sx, sy), chordAt(1, sx, sy), 0.045, 8));
  const bays = 20;
  for (let i = 0; i < bays; i++) {
    const t0 = i / bays, t1 = (i + 1) / bays;
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      lat.push(tubeAB(chordAt(t0, ...a), chordAt(t1, ...b), 0.02, 6));
      if (i % 2 === 0) lat.push(tubeAB(chordAt(t0, ...a), chordAt(t0, ...b), 0.018, 6));
    }
  }
  add(m.boomG, mergeG(lat), K.paint);
  add(m.boomG, mergeG([pinX(0.1, 1.2, 0, 0, 0), cy(0.35, 0.35, 0.12, 24, 0.1, 0.2, L + 0.1, 0, 0, Math.PI / 2), cy(0.35, 0.35, 0.12, 24, -0.1, 0.2, L + 0.1, 0, 0, Math.PI / 2), rbox(0.5, 0.6, 0.6, 0.04, 0, 0.1, L - 0.1)]), K.dark);
  stick(m.boomG, 'warn', 0.3, 0, 0.5, L - 0.39, 0);
  m.tip = anchor(m.boomG, 0, -0.1, L + 0.3);
  // pendant ropes from the gantry to the boom tip and the hoist rope + ball (updated every frame)
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.5 });
  m.pendants = [-1, 1].map((s) => { const r = new THREE.Mesh(cy(0.018, 0.018, 1, 6, 0, 0.5, 0), ropeMat); r.userData.keep = true; m.ctx.scene.add(r); return { r, s }; });
  m.rope = new THREE.Mesh(cy(0.022, 0.022, 1, 6, 0, 0.5, 0), ropeMat); m.rope.userData.keep = true; m.ctx.scene.add(m.rope);
  m.ball = new THREE.Group(); m.ctx.scene.add(m.ball);
  const ballMat = K.dark;
  add(m.ball, mergeG([new THREE.SphereGeometry(0.62, 32, 20), cy(0.16, 0.2, 0.3, 14, 0, 0.7, 0), new THREE.TorusGeometry(0.12, 0.04, 8, 16).translate(0, 0.92, 0), ...Array.from({ length: 8 }, (_, i) => { const r = bx(0.08, 0.04, 0.5, 0, 0, 0); r.rotateY((i / 8) * Math.PI); return r.translate(0, 0.6, 0); })]), ballMat);
  m.ballState = null;
  m.extraMeshes = [m.rope, m.ball, ...m.pendants.map((p) => p.r)];
  m.attach = m.boomG; m.grabPoint = m.tip;
  m.att = attStub('ball', { group: m.boomG });
  m.colliderSets.push({ obj: U0, boxes: [[-1.75, 0.6, 0, 0.9, 1.0, 5.4], [1.75, 0.6, 0, 0.9, 1.0, 5.4], [0, 0.8, 0, 2.8, 0.6, 2.2]], chassis: true },
    { obj: U, boxes: [[0, 1.0, -1.4, 2.9, 2.0, 4.4]], chassis: true }, { obj: m.boomG, boxes: [[0, 0, L / 2, 0.9, 0.9, L]] }, { obj: m.ball, boxes: [[0, 0, 0, 1.1, 1.1, 1.1]], breaks: true, ball: true });
  m.radius = 3.4;
  m.bakeList.push(U0, U, m.boomG, cab, m.ball);
  m.rig = { family: 'crane', drive: 'tank', swing: true, limits: { swing: null, boom: [-1.35, -0.35], stick: [3, 15] }, rates: { swing: 0.35, boom: 0.25, stick: 2.5 },
    apply(mm) { mm.upper.rotation.y = mm.swing; mm.boomG.rotation.x = mm.boom; } };
  m.defaults = { boom: -1.0, stick: 8, curl: 0 };
  m.camScale = 2.0;
}

// simple pendulum for the wrecking ball (runs on every client, breaking only on the authority)
export function stepCrane(m, dt, groundAt) {
  const tip = m.tip.getWorldPosition(new THREE.Vector3());
  const Lr = m.stickA * m.s;
  if (!m.ballState) m.ballState = { p: tip.clone().add(V(0, -Lr, 0)), v: V(0, 0, 0) };
  const b = m.ballState;
  const steps = 4, h = dt / steps;
  for (let i = 0; i < steps; i++) {
    b.v.y -= 9.81 * h; b.v.multiplyScalar(1 - 0.08 * h);
    b.p.addScaledVector(b.v, h);
    const d = b.p.clone().sub(tip), len = d.length();
    if (len > Lr) { d.multiplyScalar(1 / len); b.p.copy(tip).addScaledVector(d, Lr); const vr = b.v.dot(d); if (vr > 0) b.v.addScaledVector(d, -vr); }
    const gy = groundAt(b.p.x, b.p.z) + 0.62 * m.s;
    if (b.p.y < gy) { b.p.y = gy; if (b.v.y < 0) b.v.y *= -0.2; b.v.x *= 0.9; b.v.z *= 0.9; }
  }
  m.ball.position.copy(b.p); m.ball.scale.setScalar(m.s);
  m.ball.lookAt(tip); m.ball.rotateX(Math.PI / 2);
  const setRope = (r, a, c) => { const dd = c.clone().sub(a); r.position.copy(a); r.scale.set(1, dd.length(), 1); r.quaternion.setFromUnitVectors(V(0, 1, 0), dd.normalize()); };
  setRope(m.rope, tip, b.p.clone().add(V(0, 0.9 * m.s, 0).applyQuaternion(m.ball.quaternion).multiplyScalar(0).add(V(0, 0.92 * m.s, 0))));
  for (const p of m.pendants) setRope(p.r, m.upper.localToWorld(V(p.s * 0.3, 4.2, -1.2)), m.boomG.localToWorld(V(p.s * 0.2, 0.3, 16)));
  return b;
}
