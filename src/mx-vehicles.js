// Site vehicles: tandem roller, asphalt paver, wheel loader, bulldozer, tracked dumper, wrecking-ball crawler crane.
import * as THREE from 'three';
import { buildTrackUnit } from './tracks.js';
import { mergeG, rbox, bx, cy, pinX, tubeAB, hose, bolts, boltRow, boltCircle, rail, ladder, workLight, mirror, grille, stick, label, add, V, exteriorOnly, tyreLathe, wheelRim } from './detail.js';
import { sidePlate, curvePts, shell } from './attachments.js';
import { cylinder, lum } from './mx-excavator.js';

const anchor = (p, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); p.add(o); return o; };

// --------------------------------------------------------------------------- shared bits
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
// ---- shaped bodies
// a body shell from a side profile drawn in (z, y), extruded across x and centred on x (soft bevelled edges)
function prism(pts, w, x = 0, bevel = 0.035) { return sidePlate(pts, Math.max(0.01, w - bevel * 2), x - w / 2 + bevel, bevel); }
// polygon with rounded corners: corners = [[z, y, r], ...]
function roundPoly(corners, n = 5) {
  const out = [], N = corners.length;
  for (let i = 0; i < N; i++) {
    const [z, y, r] = corners[i];
    if (!r) { out.push([z, y]); continue; }
    const p = corners[(i - 1 + N) % N], q = corners[(i + 1) % N];
    const la = Math.hypot(p[0] - z, p[1] - y) || 1, lb = Math.hypot(q[0] - z, q[1] - y) || 1;
    const rr = Math.min(r, la * 0.45, lb * 0.45);
    const a = [z + (p[0] - z) / la * rr, y + (p[1] - y) / la * rr], b = [z + (q[0] - z) / lb * rr, y + (q[1] - y) / lb * rr];
    for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * z + t * t * b[0], u * u * a[1] + 2 * u * t * y + t * t * b[1]]); }
  }
  return out;
}
// flat quad through four corners (glass panes)
function pane(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap((v) => [v.x, v.y, v.z]), 3));
  g.computeVertexNormals(); return g;
}
// curved mudguard over a wheel: arc around (cz, cy) in the side view, w wide, centred on x
function fender(cz, cyy, r, a0, a1, w, x, thick = 0.035) {
  const pts = []; for (let i = 0; i <= 18; i++) { const a = a0 + (a1 - a0) * (i / 18); pts.push([cz + Math.cos(a) * r, cyy + Math.sin(a) * r]); }
  return shell(pts, thick, w).translate(x, 0, 0);
}
// pointed bucket tooth on an adapter, pointing +z
function tooth(x, y, z, s = 1) { return [rbox(0.11 * s, 0.09 * s, 0.24 * s, 0.02, x, y, z), cy(0.005, 0.055 * s, 0.2 * s, 4, x, y, z + 0.21 * s, Math.PI / 2, Math.PI / 4)]; }

// enclosed operator cab with a leaning glasshouse, framed door, roof with visor and AC unit, full interior
export function modernCab(m, parent, x, y, z, { w = 1.5, d = 1.65, h = 1.95, door = 1, roofMat = null, wheel = true } = {}) {
  const K = m.mats, c = new THREE.Group(); c.position.set(x, y, z); parent.add(c);
  const hw = w / 2, hd = d / 2, base = 0.34, top = h - 0.15, bz = -0.12;
  const B = (sx, sz) => V(sx * hw, base, sz * hd);
  const T = (sx, sz) => V(sx * (hw - 0.07), top, sz > 0 ? hd - 0.17 : -hd + 0.06);
  const Bm = (sx) => V(sx * hw, base, bz), Tm = (sx) => V(sx * (hw - 0.07), top, bz - 0.03);
  // floor pan, lower rear panel, step plate
  add(c, mergeG([rbox(w + 0.04, base, d + 0.04, 0.05, 0, base / 2, 0), rbox(w - 0.02, 0.5, 0.1, 0.03, 0, base + 0.25, -hd + 0.07)]), K.paint);
  // frame: corner posts, door pillars, roof ring, waist rail, door outline
  const f = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.push(tubeAB(B(sx, sz), T(sx, sz), 0.042, 8));
  for (const sx of [-1, 1]) { f.push(tubeAB(Bm(sx), Tm(sx), 0.034, 8), tubeAB(T(sx, 1), Tm(sx), 0.036, 8), tubeAB(Tm(sx), T(sx, -1), 0.036, 8)); f.push(tubeAB(B(sx, 1), B(sx, -1), 0.03, 6)); }
  f.push(tubeAB(T(-1, 1), T(1, 1), 0.036, 8), tubeAB(T(-1, -1), T(1, -1), 0.036, 8), tubeAB(B(-1, 1), B(1, 1), 0.03, 6));
  const dx = door * (hw + 0.005), mid = V(dx, base + 0.62, bz + 0.22);
  f.push(tubeAB(V(dx, base + 0.05, bz + 0.03), V(dx, base + 0.05, hd - 0.05), 0.02, 6), tubeAB(V(dx, base + 0.62, bz + 0.03), V(dx, base + 0.62, hd - 0.06), 0.016, 6));
  add(c, mergeG(f), K.black);
  add(c, mergeG([bx(0.03, 0.03, 0.16, dx + door * 0.03, base + 0.75, bz + 0.18), bx(0.025, 0.12, 0.05, dx + door * 0.01, base + 0.32, bz + 0.05), bx(0.025, 0.12, 0.05, dx + door * 0.01, base + 1.1, bz + 0.05)]), K.chrome, false);
  // grab handle beside the door
  add(c, mergeG([tubeAB(V(door * (hw + 0.07), base + 0.2, hd - 0.02), V(door * (hw + 0.07), top - 0.2, hd - 0.15), 0.018, 8), tubeAB(V(door * hw, base + 0.2, hd - 0.02), V(door * (hw + 0.07), base + 0.2, hd - 0.02), 0.015, 6), tubeAB(V(door * (hw - 0.05), top - 0.2, hd - 0.15), V(door * (hw + 0.07), top - 0.2, hd - 0.15), 0.015, 6)]), m.ctx.M.paintYellow);
  // roof with overhang and sun visor, AC / filter unit, antenna
  add(c, mergeG([rbox(w + 0.18, 0.12, d + 0.14, 0.055, 0, h - 0.08, -0.03), rbox(w - 0.1, 0.05, 0.28, 0.02, 0, h - 0.17, hd - 0.04, 0.25)]), roofMat || K.paint);
  add(c, mergeG([rbox(0.86, 0.15, 0.48, 0.05, 0, h + 0.05, -hd + 0.34)]), K.grey);
  grille(c, 0.7, 0.09, 0, h + 0.05, -hd + 0.095, Math.PI, 30);
  add(c, mergeG([cy(0.006, 0.01, 0.55, 6, -hw + 0.12, h + 0.28, -hd + 0.15)]), K.black);
  // glass all round (hidden from the operator's own seat)
  const gl = [pane(B(-1, 1), B(1, 1), T(1, 1), T(-1, 1)), pane(V(hw, base + 0.5, -hd), V(-hw, base + 0.5, -hd), T(-1, -1), T(1, -1))];
  for (const sx of [-1, 1]) gl.push(pane(B(sx, 1), Bm(sx), Tm(sx), T(sx, 1)), pane(Bm(sx), V(sx * hw, base + 0.5, -hd), T(sx, -1), Tm(sx)));
  c.add(exteriorOnly(new THREE.Mesh(mergeG(gl), K.glass)));
  // wipers
  c.add(exteriorOnly(new THREE.Mesh(mergeG([bx(0.02, 0.6, 0.015, -0.15, base + 0.45, hd + 0.02, -0.12, 0, 0.5), bx(0.02, 0.5, 0.015, 0.35, base + 0.38, hd + 0.02, -0.12, 0, -0.3)]), K.black)));
  // interior: seat, steering column and dash with display, side console with joystick, floor mat
  seat(K, c, 0, base + 0.15, -0.28);
  if (wheel) steeringWheel(K, c, 0, base + 0.75, 0.42, 0.75);
  add(c, mergeG([rbox(0.55, 0.32, 0.22, 0.05, 0, base + 0.42, 0.58), rbox(0.2, 0.42, 0.55, 0.04, door * 0.42, base + 0.24, -0.15), cy(0.018, 0.02, 0.16, 8, door * 0.42, base + 0.52, -0.02), new THREE.SphereGeometry(0.035, 10, 8).translate(door * 0.42, base + 0.62, -0.02)]), K.plastic, false);
  add(c, bx(w - 0.12, 0.015, d - 0.12, 0, base + 0.01, 0), K.tread, false);
  add(c, mergeG([rbox(0.21, 0.15, 0.04, 0.015, -door * 0.36, base + 0.7, 0.58, -0.35), bx(0.03, 0.14, 0.03, -door * 0.36, base + 0.6, 0.6)]), K.plastic, false);
  const scr = add(c, bx(0.17, 0.11, 0.01, -door * 0.36, base + 0.705, 0.555, -0.35), new THREE.MeshBasicMaterial({ color: 0x3aa0e0 }), false); scr.userData.keep = true;
  mirror(c, K, V(hw, top - 0.4, hd - 0.2), V(hw + 0.32, top - 0.15, hd - 0.1), -0.3); mirror(c, K, V(-hw, top - 0.4, hd - 0.2), V(-hw - 0.32, top - 0.15, hd - 0.1), 0.3);
  for (const sx of [-1, 1]) { workLight(c, K, sx * (hw - 0.05), h + 0.02, hd + 0.08, 0, 0.3, 0.85); workLight(c, K, sx * (hw - 0.05), h + 0.02, -hd - 0.08, Math.PI, 0.35, 0.85); }
  m.beacon = add(c, cy(0.055, 0.055, 0.13, 14, -hw + 0.3, h + 0.08, -hd + 0.2), K.amber, false); m.beacon.userData.keep = true;
  m.seat = anchor(c, 0, base + 1.08, -0.18);
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
    add(g, mergeG([...[-1, 1].map((s) => prism(roundPoly([[-0.95, -0.3, 0.3], [-0.95, 0.95, 0.12], [0.95, 0.95, 0.12], [0.95, -0.3, 0.3]]), 0.12, s * 0.96, 0.02)), ...[-1, 1].map((s) => cy(0.38, 0.38, 0.06, 28, s * 1.03, 0, 0, 0, 0, Math.PI / 2)), rbox(2.05, 0.32, 0.4, 0.05, 0, 0.82, 0)]), K.paint);
    add(g, mergeG([-1, 1].map((s) => cy(0.2, 0.24, 0.16, 20, s * 1.1, 0, 0, 0, 0, Math.PI / 2))), K.dark);
    add(g, mergeG([bx(1.8, 0.05, 0.08, 0, -0.1, (z > 0 ? 1 : -1) * 0.72, 0.6), cy(0.025, 0.025, 1.8, 8, 0, 0.55, (z > 0 ? 1 : -1) * 0.6, 0, 0, Math.PI / 2), ...[-1, 1].map((s) => boltCircle(V(s * 1.065, 0, 0), 0.3, 8, V(s, 0, 0), 0.016))]), K.dark);
    m.wheels.push(spin);
    return g;
  };
  const fd = drum(m.front, 1.35), rd = drum(m.under, -1.75);
  // front frame: water tank, hitch, headlights
  add(m.front, mergeG([prism(roundPoly([[0.5, 1.55, 0], [0.5, 2.18, 0.1], [1.6, 2.15, 0.35], [2.18, 1.8, 0.14], [2.22, 1.55, 0]]), 1.76), rbox(0.6, 0.5, 0.9, 0.06, 0, 1.05, 0.3), rbox(1.4, 0.12, 0.5, 0.04, 0, 1.12, 0.45)]), K.paint);
  add(m.front, mergeG([cy(0.12, 0.12, 0.06, 16, -0.4, 2.2, 1.1), pinX(0.07, 0.75, 0, 1.0, 0.0), cy(0.06, 0.06, 0.55, 12, 0, 1.0, 0.0), bx(1.5, 0.006, 0.012, 0, 2.0, 1.95, -0.6)]), K.dark);
  for (const s of [-1, 1]) { add(m.front, rbox(0.3, 0.2, 0.1, 0.04, s * 0.62, 1.82, 2.17, -0.5), K.black); add(m.front, bx(0.24, 0.13, 0.01, s * 0.62, 1.84, 2.225, -0.5), K.lens, false).userData.keep = true; }
  stick(m.front, 'warn', 0.18, 0.4, 1.6, 1.706, 0); stick(m.front, 'crush', 0.24, 0.81, 1.6, 1.2, Math.PI / 2);
  // rear frame: engine bay with grilles, operator platform, rear tank, exhaust
  add(m.under, mergeG([prism(roundPoly([[-0.85, 1.55, 0], [-0.85, 2.3, 0.1], [-2.3, 2.26, 0.4], [-2.72, 1.9, 0.16], [-2.72, 1.55, 0]]), 1.76), rbox(0.6, 0.5, 0.9, 0.06, 0, 1.05, 0.1), rbox(2.0, 0.14, 1.6, 0.04, 0, 1.06, -0.25)]), K.paint);
  grille(m.under, 1.2, 0.32, 0, 1.75, -2.725, Math.PI, 18); grille(m.under, 1.0, 0.38, 0.881, 1.9, -1.75, Math.PI / 2); grille(m.under, 1.0, 0.38, -0.881, 1.9, -1.75, -Math.PI / 2);
  add(m.under, mergeG([cy(0.06, 0.06, 0.6, 12, 0.55, 2.5, -1.3), cy(0.075, 0.07, 0.06, 12, 0.55, 2.81, -1.3), bx(0.006, 0.6, 0.012, 0.878, 1.9, -1.1), bx(0.006, 0.6, 0.012, -0.878, 1.9, -1.1)]), K.black);
  add(m.under, mergeG([-1, 1].map((s) => rbox(0.2, 0.12, 0.05, 0.02, s * 0.62, 1.95, -2.715))), K.red, false);
  add(m.under, mergeG([bx(1.5, 0.04, 0.9, 0, 1.15, -0.3)]), K.tread);
  add(m.under, mergeG([rail([[0.85, 1.15, 0.3], [0.85, 2.05, 0.3]], 0.025), rail([[-0.85, 1.15, 0.3], [-0.85, 2.05, 0.3]], 0.025), ladder(0.95, 0.25, 1.1, 0.0, 0.32, 0.28), ladder(-0.95, 0.25, 1.1, 0.0, 0.32, 0.28)]), m.ctx.M.paintYellow);
  // ROPS canopy and operator station
  const st = new THREE.Group(); st.position.y = 1.12; m.under.add(st);
  // two-post ROPS with a canopy roof reaching forward over the seat
  add(st, mergeG([tubeAB(V(-0.78, 0, -1.0), V(-0.78, 1.95, -1.0), 0.06, 12), tubeAB(V(0.78, 0, -1.0), V(0.78, 1.95, -1.0), 0.06, 12), tubeAB(V(-0.78, 1.95, -1.0), V(0.78, 1.95, -1.0), 0.06, 12), tubeAB(V(-0.78, 1.0, -1.0), V(0.78, 1.0, -1.0), 0.04, 10)]), K.black);
  add(st, rbox(1.85, 0.11, 1.75, 0.05, 0, 2.03, -0.3), K.paint);
  for (const sx of [-1, 1]) { workLight(st, K, sx * 0.75, 2.14, 0.5, 0, 0.35, 0.85); workLight(st, K, sx * 0.75, 2.14, -1.1, Math.PI, 0.35, 0.85); }
  seat(K, st, 0, 0.42, -0.45);
  steeringWheel(K, st, 0, 0.9, 0.05);
  add(st, mergeG([rbox(0.5, 0.75, 0.25, 0.05, 0, 0.38, 0.22), rbox(0.15, 0.14, 0.4, 0.03, 0.35, 0.65, -0.3), rbox(0.6, 0.12, 0.3, 0.04, 0, 0.82, 0.3, -0.4)]), K.plastic, false);
  const scr = add(st, bx(0.26, 0.15, 0.01, 0, 0.72, 0.1, -0.5), new THREE.MeshBasicMaterial({ color: 0x40c070 }), false); scr.userData.keep = true;
  for (const s of [-1, 1]) { const brand = label(m.spec.brand, 0.85, 0.22, '#15171a'); brand.position.set(s * 0.882, 1.72, -2.25); brand.rotation.y = s * Math.PI / 2; m.under.add(brand); }
  const model = label(m.spec.model, 0.6, 0.18, '#15171a'); model.position.set(0.882, 1.85, 1.2); model.rotation.y = Math.PI / 2; m.front.add(model);
  m.beacon = add(st, cy(0.05, 0.05, 0.12, 14, 0.5, 2.15, -0.9), K.amber, false); m.beacon.userData.keep = true;
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
  // tractor body between sloped track shields, deck, engine hood with grilles and exhaust
  add(U, mergeG([rbox(2.0, 0.5, 3.4, 0.05, 0, 0.98, 0.15), rbox(2.34, 0.08, 3.4, 0.03, 0, 1.27, 0.1), ...[-1, 1].map((s) => prism(roundPoly([[-1.55, 0.42, 0], [-1.55, 1.28, 0.05], [1.85, 1.28, 0.1], [2.05, 0.78, 0.12], [1.75, 0.42, 0]]), 0.08, s * 1.17, 0.015))]), K.paint);
  add(U, prism(roundPoly([[-0.8, 1.3, 0], [-0.8, 2.1, 0.1], [0.1, 2.1, 0.32], [0.45, 1.78, 0.15], [0.45, 1.3, 0]]), 2.0), K.paint);
  grille(U, 1.2, 0.5, 0, 2.106, -0.4, 0).rotation.x = -Math.PI / 2;
  grille(U, 0.8, 0.45, 1.001, 1.7, -0.3, Math.PI / 2); grille(U, 0.8, 0.45, -1.001, 1.7, -0.3, -Math.PI / 2);
  add(U, mergeG([cy(0.07, 0.07, 0.7, 12, -0.7, 2.4, -0.45), cy(0.08, 0.075, 0.06, 12, -0.7, 2.76, -0.45), bx(0.006, 0.7, 0.012, 0.998, 1.7, 0.1), bx(0.006, 0.7, 0.012, -0.998, 1.7, 0.1)]), K.black);
  for (const s of [-1, 1]) { workLight(U, K, s * 1.05, 1.45, 2.0, 0, 0.1, 0.9); add(U, rbox(0.16, 0.1, 0.04, 0.02, s * 1.0, 1.0, -1.58), K.red, false); }
  // operator platform with two seats, consoles and a sun roof
  add(U, mergeG([bx(2.4, 0.05, 1.1, 0, 1.3, -1.25)]), K.tread);
  seat(K, U, 0.6, 1.62, -1.25, Math.PI); seat(K, U, -0.6, 1.62, -1.25, Math.PI);
  add(U, mergeG([rbox(0.5, 0.35, 0.3, 0.05, 0.6, 1.95, -0.85), rbox(0.5, 0.35, 0.3, 0.05, -0.6, 1.95, -0.85)]), K.plastic, false);
  add(U, mergeG([tubeAB(V(-1.05, 1.3, -1.7), V(-1.05, 3.1, -1.7), 0.045), tubeAB(V(1.05, 1.3, -1.7), V(1.05, 3.1, -1.7), 0.045), tubeAB(V(-1.05, 1.3, -0.8), V(-1.05, 3.1, -0.8), 0.045), tubeAB(V(1.05, 1.3, -0.8), V(1.05, 3.1, -0.8), 0.045)]), K.black);
  add(U, mergeG([rbox(2.6, 0.12, 1.7, 0.06, 0, 3.14, -1.25), rbox(2.4, 0.05, 0.25, 0.02, 0, 3.06, -0.35, 0.3)]), K.paint);
  add(U, mergeG([rbox(1.3, 0.14, 0.42, 0.04, 0, 1.92, -0.72, -0.25), rbox(0.3, 0.32, 0.3, 0.04, 0, 1.65, -0.75)]), K.plastic, false);
  const pdsp = add(U, bx(0.22, 0.13, 0.01, 0.3, 2.0, -0.7, -0.6), new THREE.MeshBasicMaterial({ color: 0x3aa0e0 }), false); pdsp.userData.keep = true;
  add(U, rail([[1.2, 2.25, -1.8], [1.2, 2.25, -0.75]], 0.025, 1.3), m.ctx.M.paintYellow); add(U, rail([[-1.2, 2.25, -1.8], [-1.2, 2.25, -0.75]], 0.025, 1.3), m.ctx.M.paintYellow);
  // hopper with folding wings, push rollers, conveyor slats
  const hopper = new THREE.Group(); hopper.position.set(0, 1.0, 1.4); U.add(hopper);
  add(hopper, mergeG([bx(1.6, 0.06, 1.6, 0, 0, 0.6)]), K.dark);
  add(hopper, mergeG([rbox(1.7, 0.5, 0.08, 0.02, 0, 0.25, 1.42), bx(1.7, 0.08, 0.14, 0, 0.5, 1.42)]), K.paint);
  add(hopper, mergeG([bx(1.5, 0.3, 0.02, 0, 0.32, 1.37)]), K.dark);
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
  // tow arms reaching forward to the tow points on the tractor, end gates, heating boxes
  add(screed, mergeG([...[-1, 1].map((s) => tubeAB(V(s * 1.27, 0.15, 0.2), V(s * 1.27, 0.4, 3.0), 0.07, 10)), ...[-1, 1].map((s) => cy(0.08, 0.08, 0.35, 12, s * 1.27, 0.55, 3.0)), ...[-1, 1].map((s) => rbox(0.06, 0.55, 0.95, 0.02, s * 1.63, -0.05, 0.05))]), K.dark);
  add(screed, mergeG([0, 1, 2, 3].map((i) => rbox(0.6, 0.18, 0.3, 0.03, -1.2 + i * 0.8, 0.33, 0.15))), K.paint);
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
  const tg = tyreLathe(0.88, 0.64, 0.5, { lugs: 20, style: 'chevron' }), rg = wheelRim(0.5, 0.6, { dish: 0.1, vents: 10 });
  for (const [grp, z] of [[m.front, 1.55], [m.under, -1.85]]) for (const s of [-1, 1]) {
    const hub = new THREE.Group(); hub.position.set(s * 1.05, 0.88, z - (grp === m.front ? 0.2 : 0)); grp.add(hub);
    const spin = new THREE.Group(); hub.add(spin);
    add(spin, tg, K.rubber);
    const rm = add(spin, rg.rim, K.paint, false), rv = add(spin, rg.vents, K.black, false);
    if (s < 0) { rm.rotation.y = Math.PI; rv.rotation.y = Math.PI; }
    m.wheels.push(spin);
  }
  // rear frame: long rounded engine hood, grille, counterweight bumper, exhaust + intake, cab, ladder
  const U = m.under;
  // chassis, rear axle with differential, articulation hitch plates and pin
  add(U, mergeG([rbox(1.25, 0.55, 3.3, 0.05, 0, 0.98, -1.75), rbox(0.95, 0.12, 0.55, 0.03, 0, 0.72, 0.02), rbox(0.95, 0.12, 0.55, 0.03, 0, 1.28, 0.02), pinX(0.17, 1.55, 0, 0.88, -1.85, 18), cy(0.3, 0.3, 0.42, 18, 0, 0.88, -1.85, Math.PI / 2), cy(0.07, 0.07, 0.75, 12, 0, 1.0, 0.1)]), K.dark);
  // sloping engine hood (rounded rear), counterweight with tail lights, mudguards over the rear tyres
  add(U, prism(roundPoly([[-1.36, 1.22, 0], [-1.36, 2.32, 0.08], [-2.95, 2.24, 0.4], [-3.36, 1.9, 0.18], [-3.36, 1.22, 0]]), 1.42), K.paint);
  add(U, prism(roundPoly([[-3.28, 0.68, 0], [-3.28, 1.42, 0], [-3.75, 1.4, 0.12], [-4.0, 1.1, 0.2], [-3.9, 0.78, 0.14], [-3.6, 0.66, 0]]), 2.3, 0, 0.05), K.paint);
  for (const s of [-1, 1]) add(U, fender(-1.85, 0.88, 1.03, 0.32, 2.85, 0.76, s * 1.05), K.paint);
  add(U, mergeG([...[-1, 1].map((s) => tubeAB(V(s * 0.62, 1.15, -1.3), V(s * 0.95, 1.5, -1.1), 0.035, 8)), ...[-1, 1].map((s) => tubeAB(V(s * 0.62, 1.15, -2.45), V(s * 0.95, 1.6, -2.7), 0.035, 8)), bx(0.006, 0.8, 0.012, 0.713, 1.75, -1.8), bx(0.006, 0.8, 0.012, -0.713, 1.75, -1.8), bx(0.006, 0.6, 0.012, 0.713, 1.65, -3.1), bx(0.006, 0.6, 0.012, -0.713, 1.65, -3.1)]), K.black);
  grille(U, 1.05, 0.3, 0, 1.63, -3.375, Math.PI, 18);
  grille(U, 1.0, 0.42, 0.716, 1.9, -2.6, Math.PI / 2); grille(U, 1.0, 0.42, -0.716, 1.9, -2.6, -Math.PI / 2);
  add(U, mergeG([...[-1, 1].map((s) => rbox(0.22, 0.13, 0.06, 0.02, s * 0.82, 1.18, -3.97, 0.35)), ...[-1, 1].map((s) => rbox(0.2, 0.06, 0.05, 0.02, s * 0.32, 1.32, -3.82, 0.4))]), K.red, false);
  add(U, mergeG([...[-1, 1].map((s) => rbox(0.1, 0.13, 0.06, 0.02, s * 1.0, 1.18, -3.94, 0.35))]), K.amber, false);
  add(U, mergeG([cy(0.04, 0.04, 0.3, 10, 0, 0.82, -4.02, Math.PI / 2), rbox(0.3, 0.16, 0.12, 0.03, 0, 0.82, -3.98)]), K.dark);
  // exhaust stack with rain cap, air pre-cleaner, hood handrails
  add(U, mergeG([cy(0.075, 0.075, 0.62, 14, 0.32, 2.55, -2.25), cy(0.09, 0.085, 0.05, 14, 0.32, 2.86, -2.25), cy(0.13, 0.13, 0.26, 16, -0.32, 2.42, -1.75), new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.32, 2.55, -1.75)]), K.black);
  add(U, mergeG([rail([[0.6, 2.62, -1.5], [0.6, 2.6, -2.85]], 0.02, 2.26), rail([[-0.6, 2.62, -1.5], [-0.6, 2.6, -2.85]], 0.02, 2.26)]), m.ctx.M.paintYellow);
  modernCab(m, U, 0, 1.3, -0.55, { w: 1.5, d: 1.62, h: 1.96, door: 1 });
  add(U, ladder(0.95, 0.3, 1.35, -0.35, 0.36, 0.27, -0.25), m.ctx.M.paintYellow);
  for (const s of [-1, 1]) { const b = label(m.spec.brand, 1.15, 0.3, '#15171a'); b.position.set(s * 0.716, 1.46, -2.45); b.rotation.y = s * Math.PI / 2; U.add(b); stick(U, 'crush', 0.2, s * 0.632, 0.98, -0.75, s * Math.PI / 2); }
  // front frame + lift arms (Z-bar linkage) + bucket
  const F = m.front;
  // front frame: loader tower carrying the arm pivots, front axle, hitch plates, mudguards with lamps
  add(F, mergeG([prism(roundPoly([[-0.1, 0.62, 0], [-0.1, 1.3, 0], [0.32, 2.0, 0.12], [0.98, 2.0, 0.12], [1.35, 1.25, 0.1], [2.45, 1.12, 0.06], [2.45, 0.62, 0]]), 1.05), pinX(0.12, 1.5, 0, 1.75, 0.65, 18)]), K.paint);
  add(F, mergeG([rbox(1.5, 0.22, 0.55, 0.04, 0, 0.72, 1.35), pinX(0.17, 1.55, 0, 0.88, 1.35, 18), cy(0.3, 0.3, 0.42, 18, 0, 0.88, 1.35, Math.PI / 2), rbox(0.95, 0.12, 0.5, 0.03, 0, 1.0, -0.12)]), K.dark);
  for (const s of [-1, 1]) {
    add(F, fender(1.35, 0.88, 1.0, 0.75, 2.45, 0.72, s * 1.05), K.paint);
    add(F, tubeAB(V(s * 0.52, 1.15, 1.2), V(s * 0.85, 1.7, 1.25), 0.035, 8), K.black);
    workLight(F, K, s * 1.05, 1.98, 1.62, 0, 0.12, 0.9);
  }
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
  add(bucket, mergeG([bx(W + 0.04, 0.05, 0.25, 0, -0.47, 1.12, 0.05), bx(W, 0.06, 0.08, 0, 0.88, -0.22), bx(0.12, 0.6, 0.22, 0.42, 0.42, -0.5), bx(0.12, 0.6, 0.22, -0.42, 0.42, -0.5), boltRow(V(-W / 2 + 0.1, -0.44, 1.05), V(W / 2 - 0.1, -0.44, 1.05), 14, V(0, 1, 0), 0.013, 0.01),
    ...Array.from({ length: 9 }, (_, i) => tooth(-W / 2 + 0.22 + i * (W - 0.44) / 8, -0.46, 1.22)).flat()]), K.dark);
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
  // main frame, track fenders with lamps, sloping engine hood, radiator guard, front pull hook
  add(U, mergeG([rbox(1.6, 0.5, 3.9, 0.05, 0, 0.98, -0.05), rbox(1.75, 0.3, 0.3, 0.04, 0, 0.95, 1.98), cy(0.05, 0.05, 0.3, 10, 0, 0.95, 2.16, 0, 0, Math.PI / 2)]), K.dark);
  for (const s of [-1, 1]) { add(U, rbox(0.76, 0.07, 3.35, 0.02, s * 1.25, 1.24, -0.15), K.paint); workLight(U, K, s * 1.12, 1.42, 1.5, 0, 0.1, 0.9); }
  add(U, prism(roundPoly([[0.24, 1.24, 0], [0.24, 2.3, 0.06], [1.3, 2.2, 0.3], [1.8, 1.9, 0.14], [1.84, 1.24, 0]]), 1.5), K.paint);
  grille(U, 1.18, 0.56, 0, 1.58, 1.855, 0, 16);
  add(U, mergeG([bx(1.45, 0.07, 0.08, 0, 1.92, 1.9), bx(1.45, 0.07, 0.08, 0, 1.27, 1.9), bx(0.07, 0.7, 0.08, 0.66, 1.6, 1.9), bx(0.07, 0.7, 0.08, -0.66, 1.6, 1.9), bx(0.05, 0.6, 0.05, 0.22, 1.6, 1.92), bx(0.05, 0.6, 0.05, -0.22, 1.6, 1.92),
    ...[-1, 1].map((s) => rbox(0.2, 0.34, 0.38, 0.03, s * 0.84, 1.9, 1.6))]), K.dark);
  grille(U, 0.95, 0.45, 0.756, 1.72, 0.95, Math.PI / 2); grille(U, 0.95, 0.45, -0.756, 1.72, 0.95, -Math.PI / 2);
  add(U, mergeG([bx(0.006, 0.8, 0.012, 0.753, 1.7, 0.4), bx(0.006, 0.8, 0.012, -0.753, 1.7, 0.4), bx(1.3, 0.006, 0.012, 0, 2.3, 0.6)]), K.black);
  add(U, mergeG([cy(0.08, 0.08, 0.75, 14, 0.38, 2.62, 1.0), cy(0.095, 0.09, 0.05, 14, 0.38, 3.0, 1.0), cy(0.13, 0.13, 0.28, 16, -0.38, 2.4, 0.8), new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.38, 2.54, 0.8)]), K.black);
  // rear fuel tank with filler cap, tail lights, rear work lights and rail
  add(U, prism(roundPoly([[-1.34, 1.24, 0], [-1.34, 1.98, 0.05], [-1.82, 1.95, 0.14], [-2.02, 1.6, 0.1], [-2.02, 1.24, 0]]), 1.7), K.paint);
  add(U, mergeG([cy(0.07, 0.07, 0.08, 14, 0.55, 2.0, -1.6)]), K.black);
  add(U, mergeG([-1, 1].map((s) => rbox(0.2, 0.12, 0.05, 0.02, s * 0.7, 1.72, -2.03))), K.red, false);
  for (const s of [-1, 1]) workLight(U, K, s * 0.62, 2.1, -1.9, Math.PI, 0.35, 0.9);
  add(U, rail([[0.82, 2.3, -1.4], [0.82, 2.3, -1.85], [-0.82, 2.3, -1.85], [-0.82, 2.3, -1.4]], 0.02, 1.96), m.ctx.M.paintYellow);
  modernCab(m, U, 0, 1.25, -0.55, { w: 1.56, d: 1.58, h: 1.98, door: 1 });
  for (const s of [-1, 1]) { const b = label(m.spec.brand, 1.0, 0.27, '#15171a'); b.position.set(s * 0.757, 2.02, 1.0); b.rotation.y = s * Math.PI / 2; U.add(b); stick(U, 'warn', 0.16, s * 0.757, 1.38, 1.55, s * Math.PI / 2); }
  // blade on push arms, pivoting at the track frames
  m.armG = new THREE.Group(); m.armG.position.set(0, 0.75, -0.3); U.add(m.armG);
  for (const s of [-1, 1]) add(m.armG, mergeG([prism(roundPoly([[-0.12, -0.14, 0.08], [-0.12, 0.16, 0.08], [1.4, 0.2, 0], [3.0, 0.14, 0], [3.0, -0.14, 0], [1.4, -0.2, 0]]), 0.17, s * 1.62, 0.02), rbox(0.24, 0.04, 2.6, 0.01, s * 1.62, 0.2, 1.6), pinX(0.1, 0.25, s * 1.62, 0, 0)]), K.paint);
  m.attach = new THREE.Group(); m.attach.position.set(0, 0, 3.05); m.armG.add(m.attach);
  const bladeW = 4.0;
  const prof = curvePts([[0.2, -0.45], [-0.05, 0.1], [0.05, 0.75], [0.35, 1.1]], 14);
  const inner = prof.map(([z, y]) => [z + 0.07, y]).reverse();
  const bg = sidePlate([...prof, ...inner], bladeW, -bladeW / 2, 0.01);
  add(m.attach, bg, K.paint);
  const ribs = []; for (let i = 0; i < 7; i++) ribs.push(bx(0.06, 1.2, 0.25, -bladeW / 2 + 0.25 + i * (bladeW - 0.5) / 6, 0.3, -0.12));
  add(m.attach, mergeG([...ribs, bx(bladeW, 0.12, 0.3, 0, 0.95, -0.05)]), K.paint);
  add(m.attach, mergeG([bx(bladeW + 0.05, 0.06, 0.12, 0, -0.45, 0.22, 0.3), bx(0.12, 0.6, 0.35, -bladeW / 2, -0.15, 0.1), bx(0.12, 0.6, 0.35, bladeW / 2, -0.15, 0.1), boltRow(V(-bladeW / 2 + 0.2, -0.4, 0.29), V(bladeW / 2 - 0.2, -0.4, 0.29), 18, V(0, 0.3, 1), 0.014, 0.01),
    ...[-1, 1].map((s) => tubeAB(V(s * 1.62, 0.03, -0.42), V(s * 1.22, 0.82, -0.17), 0.05, 10)), ...[-1, 1].map((s) => pinX(0.12, 0.24, s * 1.62, 0, -0.05, 16)), ...[-1, 1].map((s) => rbox(0.2, 0.3, 0.2, 0.03, s * 0.85, 0.7, -0.12))]), K.dark);
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
  add(U, mergeG([rbox(1.3, 0.45, 2.8, 0.06, 0, 0.85, 0), prism(roundPoly([[0.68, 1.05, 0], [0.68, 1.86, 0.06], [1.4, 1.86, 0.18], [1.64, 1.58, 0.1], [1.64, 1.05, 0]]), 1.56)]), K.paint);
  add(U, mergeG([-1, 1].map((s) => rbox(0.56, 0.05, 3.1, 0.02, s * 0.82, 0.86, 0))), K.dark);
  grille(U, 1.1, 0.36, 0, 1.3, 1.646, 0);
  for (const s of [-1, 1]) { add(U, rbox(0.24, 0.16, 0.06, 0.04, s * 0.58, 1.6, 1.62), K.black); add(U, bx(0.18, 0.11, 0.01, s * 0.58, 1.6, 1.655), K.lens, false).userData.keep = true; }
  add(U, mergeG([cy(0.06, 0.06, 0.5, 12, 0.55, 2.05, 1.3), cy(0.07, 0.065, 0.05, 12, 0.55, 2.31, 1.3)]), K.black);
  add(U, mergeG([cy(0.55, 0.58, 0.12, 36, 0, 1.12, -0.35), boltCircle(V(0, 1.18, -0.35), 0.5, 16, V(0, 1, 0), 0.014)]), K.dark);
  // operator seat at the front with ROPS
  const st = new THREE.Group(); st.position.set(0, 1.9, 1.15); U.add(st);
  seat(K, st, 0, 0.2, -0.05, 0);
  add(st, mergeG([rbox(0.4, 0.4, 0.2, 0.04, 0, 0.3, 0.4)]), K.plastic, false);
  // two-post ROPS behind the seat with a guard screen towards the skip, roof reaching forward over the operator
  add(U, mergeG([tubeAB(V(-0.66, 1.05, 0.72), V(-0.66, 3.15, 0.72), 0.055, 12), tubeAB(V(0.66, 1.05, 0.72), V(0.66, 3.15, 0.72), 0.055, 12), tubeAB(V(-0.66, 3.15, 0.72), V(0.66, 3.15, 0.72), 0.055, 12),
    tubeAB(V(-0.66, 2.2, 0.72), V(0.66, 2.2, 0.72), 0.04, 10), tubeAB(V(-0.66, 3.1, 0.72), V(-0.6, 3.12, 1.55), 0.035, 8), tubeAB(V(0.66, 3.1, 0.72), V(0.6, 3.12, 1.55), 0.035, 8)]), K.black);
  add(U, mergeG([rbox(1.5, 0.1, 1.15, 0.05, 0, 3.22, 1.15)]), K.paint);
  grille(U, 1.2, 0.85, 0, 2.65, 0.69, Math.PI, 12);
  for (const sx of [-1, 1]) workLight(U, K, sx * 0.6, 3.32, 1.65, 0, 0.35, 0.8);
  mirror(U, K, V(0.66, 2.6, 0.75), V(0.95, 2.75, 0.9), -0.3); mirror(U, K, V(-0.66, 2.6, 0.75), V(-0.95, 2.75, 0.9), 0.3);
  m.seat = anchor(st, 0, 1.15, 0); m.door = anchor(U, 1.0, 0, 1.0);
  m.beacon = add(U, cy(0.05, 0.05, 0.12, 14, 0.55, 3.32, 0.85), K.amber, false); m.beacon.userData.keep = true;
  for (const s of [-1, 1]) { const b = label(m.spec.brand, 0.8, 0.22, '#15171a'); b.position.set(s * 0.802, 1.5, 1.1); b.rotation.y = s * Math.PI / 2; U.add(b); }
  // slewing turntable + tipping skip
  m.upper = new THREE.Group(); m.upper.position.set(0, 1.2, -0.35); U.add(m.upper);
  add(m.upper, mergeG([rbox(1.2, 0.15, 1.2, 0.03, 0, 0.05, 0)]), K.dark);
  // skip pivots on its open, sloped lip (facing rearwards, away from the operator) and tips over it
  m.attach = new THREE.Group(); m.attach.position.set(0, 0.15, -0.75); m.upper.add(m.attach);
  const bed = new THREE.Group(); bed.position.set(0, 0, 0.75); bed.rotation.y = Math.PI; m.attach.add(bed);
  // curved tub: back wall rolling into the floor and up into the tipping lip, sides following the curve
  const tub = curvePts([[-0.95, 0.9], [-0.94, 0.3], [-0.78, 0.04], [-0.3, 0.0], [0.55, 0.02], [0.92, 0.38], [1.15, 0.88]], 22);
  add(bed, mergeG([shell(tub, 0.05, 1.86), sidePlate([...tub, [-0.95, 0.9]], 0.05, -0.98), sidePlate([...tub, [-0.95, 0.9]], 0.05, 0.93)]), K.paint);
  add(bed, mergeG([...[-0.55, 0, 0.55].map((x) => bx(0.06, 0.1, 1.4, x, -0.04, -0.1)), tubeAB(V(-0.99, 0.92, -0.97), V(0.99, 0.92, -0.97), 0.04, 10),
    ...[-1, 1].flatMap((s) => [-0.55, 0.05, 0.6].map((z) => bx(0.05, 0.75, 0.08, s * 1.0, 0.45, z))), ...[-1, 1].map((s) => tubeAB(V(s * 1.0, 0.91, -0.96), V(s * 1.0, 0.9, 1.15), 0.035, 8)),
    ...[-1, 1].map((s) => rbox(0.08, 0.18, 0.3, 0.02, s * 0.75, -0.07, -0.55))]), K.dark);
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
  add(U, mergeG([rbox(2.9, 0.25, 4.6, 0.04, 0, 0.12, -0.6), prism(roundPoly([[0.22, 0.25, 0], [0.22, 1.72, 0.08], [-1.7, 1.9, 0.15], [-2.6, 1.76, 0.12], [-2.6, 0.25, 0]]), 2.6)]), K.paint);
  add(U, mergeG([rail([[1.25, 2.4, 0.1], [1.25, 2.55, -2.4]], 0.02, 1.82), rail([[-1.25, 2.4, 0.1], [-1.25, 2.55, -2.4]], 0.02, 1.82), ladder(-1.42, 0.3, 1.85, -0.5, 0.36, 0.28)]), m.ctx.M.paintYellow);
  add(U, mergeG([bx(0.006, 1.2, 0.012, 1.302, 1.0, -0.3), bx(0.006, 1.2, 0.012, -1.302, 1.0, -0.3), bx(0.006, 1.2, 0.012, 1.302, 1.0, -2.45), bx(0.006, 1.2, 0.012, -1.302, 1.0, -2.45)]), K.black);
  grille(U, 1.8, 0.8, 1.302, 1.2, -1.4, Math.PI / 2); grille(U, 1.8, 0.8, -1.302, 1.2, -1.4, -Math.PI / 2);
  // stacked counterweight slabs
  const cwp = []; for (let i = 0; i < 5; i++) cwp.push(rbox(2.7, 0.32, 1.0, 0.04, 0, 0.35 + i * 0.34, -3.05));
  add(U, mergeG(cwp), K.dark);
  add(U, mergeG([new THREE.TorusGeometry(0.1, 0.03, 8, 16).translate(0.9, 2.05, -3.05), new THREE.TorusGeometry(0.1, 0.03, 8, 16).translate(-0.9, 2.05, -3.05)]), K.steel);
  stick(U, 'warn', 0.25, 0, 1.0, -3.56, Math.PI);
  // gantry A-frame, winch drums, cab
  add(U, mergeG([tubeAB(V(-0.9, 1.85, -1.8), V(0, 4.2, -1.2), 0.07), tubeAB(V(0.9, 1.85, -1.8), V(0, 4.2, -1.2), 0.07), tubeAB(V(-0.9, 1.85, -0.4), V(0, 4.2, -1.2), 0.07), tubeAB(V(0.9, 1.85, -0.4), V(0, 4.2, -1.2), 0.07), pinX(0.12, 0.6, 0, 4.2, -1.2)]), K.paint);
  add(U, mergeG([cy(0.35, 0.35, 1.4, 24, 0, 1.95, -0.2, 0, 0, Math.PI / 2), cy(0.42, 0.42, 0.06, 24, 0.72, 1.95, -0.2, 0, 0, Math.PI / 2), cy(0.42, 0.42, 0.06, 24, -0.72, 1.95, -0.2, 0, 0, Math.PI / 2)]), K.dark);
  const cab = modernCab(m, U, 1.0, 0.25, 1.0, { w: 1.0, d: 1.7, h: 1.95, door: 1, wheel: false });
  m.cab = cab;
  m.door = anchor(cab, 0.8, -0.25, 0);
  m.beacon = add(U, cy(0.06, 0.06, 0.14, 14, -1.0, 1.95, -2.4), K.amber, false); m.beacon.userData.keep = true;
  for (const s of [-1, 1]) { const b = label(m.spec.brand, 1.6, 0.42, '#15171a'); b.position.set(s * 1.302, 1.3, -2.25); b.rotation.y = s * Math.PI / 2; U.add(b); }
  // lattice boom: 4 tapered chords + lacing + tip sheaves
  m.boomG = new THREE.Group(); m.boomG.position.set(0, 1.6, 1.4); U.add(m.boomG);
  const L = 16, w0 = 0.95, w1 = 0.45;
  const chordAt = (t, sx, sy) => { const w = w0 + (w1 - w0) * t; return V(sx * w / 2, sy * w / 2, t * L); };
  const lat = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lat.push(tubeAB(chordAt(0, sx, sy), chordAt(1, sx, sy), 0.065, 8));
  const bays = 20;
  for (let i = 0; i < bays; i++) {
    const t0 = i / bays, t1 = (i + 1) / bays;
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      lat.push(tubeAB(chordAt(t0, ...a), chordAt(t1, ...b), 0.028, 6));
      if (i % 2 === 0) lat.push(tubeAB(chordAt(t0, ...a), chordAt(t0, ...b), 0.025, 6));
    }
  }
  add(m.boomG, mergeG(lat), K.paint);
  add(m.boomG, mergeG([pinX(0.1, 1.2, 0, 0, 0), cy(0.35, 0.35, 0.12, 24, 0.1, 0.2, L + 0.1, 0, 0, Math.PI / 2), cy(0.35, 0.35, 0.12, 24, -0.1, 0.2, L + 0.1, 0, 0, Math.PI / 2), rbox(0.5, 0.6, 0.6, 0.04, 0, 0.1, L - 0.1),
    // boom foot: side plates round the hinge pin
    ...[-1, 1].map((s) => rbox(0.06, 0.95, 1.4, 0.03, s * 0.5, 0, 0.5)), rbox(1.06, 0.06, 1.2, 0.02, 0, -0.47, 0.5)]), K.dark);
  // backstops: telescopic struts from the house to the boom that stop it going over backwards
  for (const s of [-1, 1]) cylinder(m, anchor(U, s * 0.45, 1.95, -0.6), anchor(m.boomG, s * 0.42, 0.45, 2.6), 0.07, 0.045);
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

// --------------------------------------------------------------------------- road painting truck
// Cab-over truck with two paint tanks and a compressor on the deck, an arrow board, and a spray bar behind the rear
// axle. Click / Space switches the sprayer, T / Y pick the colour (the machine's rot channel, so it is synced and
// saved like any other control). Driving over a repaired pothole with the sprayer on paints the patch.
export const PAINTS = [['WHITE', 0xf2f2ee], ['YELLOW', 0xffcf1f], ['RED', 0xe0301e], ['BLUE', 0x1f63d8], ['GREEN', 0x2fb24a], ['ORANGE', 0xff7d1a], ['PINK', 0xe04ac0], ['BLACK', 0x1c1d20]];
export const paintOf = (m) => PAINTS[THREE.MathUtils.clamp(Math.round(m.rot || 0), 0, PAINTS.length - 1)];
export function buildPainter(m) {
  const K = m.mats, U = new THREE.Group(); m.model.add(U); m.under = U; m.upper = U;
  const R = 0.5, RR = 0.3, ZF = 1.9, ZR = -1.3;
  // wheels: steered front, singles at the back
  const tg = tyreLathe(R, 0.32, RR, { lugs: 24, style: 'block' }), rw = wheelRim(RR, 0.3, { dish: 0.05, vents: 8 });
  for (const z of [ZF, ZR]) for (const s of [-1, 1]) {
    const hub = new THREE.Group(); hub.position.set(s * 1.0, R, z); U.add(hub);
    const spin = new THREE.Group(); hub.add(spin);
    add(spin, tg, K.rubber);
    const rm = add(spin, rw.rim, K.grey, false), rv = add(spin, rw.vents, K.black, false);
    if (s < 0) { rm.rotation.y = Math.PI; rv.rotation.y = Math.PI; }
    m.wheels.push(spin); if (z > 0) m.steerWheels.push(hub);
    add(U, fender(z, R, R + 0.1, 0.15, Math.PI - 0.15, 0.42, s * 1.0), K.black);
  }
  // chassis rails, axles, fuel tank, battery box, rear lights
  add(U, mergeG([rbox(0.95, 0.24, 5.6, 0.03, 0, 0.78, 0.15), pinX(0.07, 1.8, 0, R, ZF), pinX(0.09, 1.8, 0, R, ZR), cy(0.24, 0.24, 0.3, 14, 0, R, ZR, Math.PI / 2)]), K.under);
  add(U, mergeG([cy(0.26, 0.26, 0.9, 20, 0.78, 0.7, 0.3, Math.PI / 2), rbox(0.42, 0.42, 0.5, 0.03, -0.78, 0.7, 0.2)]), K.grey);
  add(U, mergeG([-1, 1].map((s) => rbox(0.22, 0.14, 0.05, 0.02, s * 0.9, 0.95, -2.62))), K.red, false);
  // cab-over cab: the shared operator cab sitting on the chassis, with a nose panel, grille, headlights and bumper
  modernCab(m, U, 0, 0.92, 2.25, { w: 2.1, d: 1.65, h: 1.95, door: 1 });
  add(U, mergeG([rbox(2.14, 0.72, 0.1, 0.03, 0, 1.62, 3.08), rbox(2.3, 0.3, 0.3, 0.05, 0, 0.82, 3.12)]), K.paint);
  grille(U, 1.3, 0.38, 0, 1.62, 3.135, 0, 18);
  for (const s of [-1, 1]) { add(U, rbox(0.3, 0.16, 0.06, 0.03, s * 0.82, 1.36, 3.14), K.black); add(U, bx(0.24, 0.11, 0.01, s * 0.82, 1.36, 3.175), K.lens, false).userData.keep = true; }
  add(U, mergeG([bx(2.0, 0.04, 0.06, 0, 1.95, 3.12), bx(0.4, 0.05, 0.02, 0, 1.47, 3.14)]), K.accent);
  // deck with the paint tanks (bands show the loaded colour), compressor, hose reel, arrow board
  add(U, mergeG([rbox(2.3, 0.12, 3.7, 0.03, 0, 1.0, -0.75), ...[-1, 1].map((s) => bx(0.06, 0.3, 3.7, s * 1.14, 1.2, -0.75))]), K.paint);
  m.paintMat = new THREE.MeshStandardMaterial({ color: PAINTS[0][1], roughness: 0.35, metalness: 0.1 });
  for (const x of [-0.55, 0.55]) {
    add(U, mergeG([cy(0.42, 0.42, 1.7, 22, x, 1.5, 0.15, Math.PI / 2), cy(0.3, 0.3, 0.1, 16, x, 1.95, 0.15)]), K.galv);
    add(U, mergeG([cy(0.43, 0.43, 0.14, 22, x, 1.5, 0.75, Math.PI / 2), cy(0.43, 0.43, 0.14, 22, x, 1.5, -0.45, Math.PI / 2), cy(0.31, 0.31, 0.05, 16, x, 2.02, 0.15)]), m.paintMat, false);
  }
  add(U, mergeG([rbox(1.6, 0.85, 0.9, 0.05, 0, 1.5, -1.6)]), K.accent);
  grille(U, 0.8, 0.4, 0.801, 1.5, -1.6, Math.PI / 2); grille(U, 0.8, 0.4, -0.801, 1.5, -1.6, -Math.PI / 2);
  add(U, mergeG([new THREE.TorusGeometry(0.28, 0.07, 8, 20).rotateY(Math.PI / 2).translate(1.12, 1.45, -0.95), cy(0.06, 0.06, 0.2, 10, 1.05, 1.45, -0.95, 0, 0, Math.PI / 2)]), K.black);
  const ab = new THREE.Group(); ab.position.set(0, 2.55, -2.45); U.add(ab);
  add(ab, mergeG([bx(0.1, 1.5, 0.1, 0, -0.75, 0.1), rbox(1.7, 0.85, 0.08, 0.03, 0, 0.35, 0)]), K.black);
  const dots = []; for (const [x, y] of [[-0.55, 0.35], [-0.25, 0.35], [0.05, 0.35], [0.35, 0.35], [0.12, 0.6], [0.12, 0.1], [0.55, 0.35]]) dots.push(cy(0.06, 0.06, 0.03, 10, x, y, -0.05, Math.PI / 2));
  add(ab, mergeG(dots), K.amber, false);
  // spray bar behind the rear axle: beam, nozzles, support arms, feed hoses
  const bar = new THREE.Group(); bar.position.set(0, 0.32, -2.95); U.add(bar);
  add(bar, mergeG([bx(2.5, 0.08, 0.1, 0, 0, 0), ...[-1, 1].map((s) => tubeAB(V(s * 0.6, 0.04, 0), V(s * 0.45, 0.6, 0.35), 0.035, 8))]), K.dark);
  const noz = []; for (let i = 0; i < 7; i++) noz.push(cy(0.03, 0.02, 0.12, 8, -1.05 + i * 0.35, -0.09, 0));
  add(bar, mergeG(noz), K.chrome);
  add(U, mergeG([hose([[0.55, 1.2, -0.6], [0.6, 0.9, -2.2], [0.45, 0.5, -2.85]], 0.022, 16), hose([[-0.55, 1.2, -0.6], [-0.6, 0.9, -2.2], [-0.45, 0.5, -2.85]], 0.022, 16)]), K.black);
  for (const s of [-1, 1]) { const l = label(m.spec.brand, 1.0, 0.24, '#15171a'); l.position.set(s * 1.175, 1.22, -0.9); l.rotation.y = s * Math.PI / 2; U.add(l); stick(U, 'warn', 0.16, s * 1.175, 1.22, -2.3, s * Math.PI / 2); }
  m.door = anchor(U, 1.35, 0, 2.2);
  m.attach = U; m.att = attStub('paint', { nozzle: anchor(bar, 0, -0.2, 0) }); m.grabPoint = m.att.nozzle;
  m.colliderSets.push({ obj: U, boxes: [[0, 1.3, 0.2, 2.3, 2.2, 6.2]], chassis: true });
  m.radius = 3.2;
  m.bakeList.push(U, bar, ab);
  m.rig = { family: 'painter', drive: 'car', wheelbase: 3.2, accel: 3.2, brake: 5, maxLat: 4, swing: false, limits: { rot: [0, PAINTS.length - 1] }, rates: { rot: 2.2 },
    apply(mm) { for (const h of mm.steerWheels) h.rotation.y = mm.steerVis; mm.paintMat.color.setHex(paintOf(mm)[1]); } };
  m.defaults = { boom: 0, stick: 0, curl: 0 };
}
