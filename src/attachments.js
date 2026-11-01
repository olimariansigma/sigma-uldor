// Excavator / loader attachments. Local frame: origin at the stick-tip pivot, +z continues along the stick,
// -y faces the machine (the side a bucket curls toward). K = machine material set (weathered).
import * as THREE from 'three';
import { mergeG, rbox, bx, cy, pinX, hose, bolts, boltRow, boltCircle, stick } from './detail.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function mesh(geo, mat, parent, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
function point(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }
function shapeFrom(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; }
// extrude a profile drawn in (z, y) across x
// a flat plate in the YZ plane (profile pts = [z, y]) spanning x .. x + thick (x is the LEFT face)
export function sidePlate(pts, thick, x, bevel = 0.008) {
  const g = new THREE.ExtrudeGeometry(shapeFrom(pts), { depth: thick, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
  g.rotateY(-Math.PI / 2); // extrusion now runs from x = -thick to 0
  g.translate(x + thick, 0, 0);
  return g;
}
export function curvePts(ctrl, n = 16) {
  const c = new THREE.CatmullRomCurve3(ctrl.map(([z, y]) => V(0, y, z)));
  return c.getPoints(n).map((p) => [p.z, p.y]);
}
export function shell(curve, thick, w) {
  const inner = [];
  for (let i = 0; i < curve.length; i++) {
    const a = curve[Math.max(0, i - 1)], b = curve[Math.min(curve.length - 1, i + 1)];
    const tz = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tz, ty) || 1;
    inner.push([curve[i][0] + (ty / l) * thick, curve[i][1] - (tz / l) * thick]);
  }
  return sidePlate([...curve, ...inner.reverse()], w, -w / 2, 0);
}

// quick-coupler + mounting ears with pins, retainers and grease nipples
function coupler(K, A, w = 0.5) {
  mesh(mergeG([rbox(0.08, 0.34, 0.4, 0.015, -0.17, 0.2, 0.05), rbox(0.08, 0.34, 0.4, 0.015, 0.17, 0.2, 0.05), rbox(w, 0.1, 0.44, 0.02, 0, 0.32, 0.1), bx(w, 0.06, 0.2, 0, 0.12, 0.28)]), K.paint, A);
  mesh(mergeG([pinX(0.06, 0.52, 0, 0, 0), pinX(0.05, 0.52, 0, 0.3, 0.05), cy(0.08, 0.08, 0.03, 12, 0.26, 0, 0, 0, 0, Math.PI / 2), cy(0.08, 0.08, 0.03, 12, -0.26, 0, 0, 0, 0, Math.PI / 2)]), K.steel, A);
  mesh(mergeG([bolts([V(0.275, 0.03, 0.03), V(0.275, -0.03, -0.03), V(-0.275, 0.03, 0.03), V(-0.275, -0.03, -0.03)], V(1, 0, 0), 0.012, 0.01), cy(0.008, 0.008, 0.04, 6, 0.2, 0.39, 0.05)]), K.dark, A);
}
// rotator hub with swivel hoses (grapple / claw / shear / orange peel)
function rotator(K, A, r = 0.3, z = 0.66) {
  mesh(mergeG([cy(r, r, 0.12, 28, 0, 0, z, Math.PI / 2), cy(r * 0.86, r * 0.86, 0.1, 28, 0, 0, z + 0.11, Math.PI / 2), boltCircle(V(0, 0, z + 0.165), r * 0.7, 12, V(0, 0, 1), 0.016)]), K.dark, A);
  mesh(mergeG([hose([[0.12, 0.3, 0.2], [0.2, 0.32, 0.45], [0.2, 0.18, z]], 0.02, 12), hose([[-0.12, 0.3, 0.2], [-0.2, 0.32, 0.45], [-0.2, 0.18, z]], 0.02, 12)]), K.black, A);
}

/**
 * kind: grapple | bucket | bigbucket | minibucket | breaker | shear | orangepeel | pulverizer | tank | skip | claw | crusher
 */
export function buildAttachment(kind, K) {
  const A = new THREE.Group();
  const out = { group: A, kind, jaws: [], probes: [], colliders: [], behaviour: 'jaw', bulk: null, pieces: 6 };

  if (kind === 'grapple' || kind === 'shear') {
    const shearMode = kind === 'shear';
    mesh(mergeG([rbox(0.5, 0.42, 0.55, 0.04, 0, 0.0, 0.35), rbox(0.56, 0.08, 0.6, 0.02, 0, 0.24, 0.35), bx(0.3, 0.3, 0.06, 0.0, 0, 0.62)]), K.paint, A);
    coupler(K, A); rotator(K, A);
    mesh(mergeG([cy(0.18, 0.2, 0.14, 20, 0, 0, 0.78, Math.PI / 2), pinX(0.07, 0.64, 0, 0, 0.92), bolts([V(0.26, 0.12, 0.25), V(0.26, -0.12, 0.25), V(0.26, 0.12, 0.45), V(0.26, -0.12, 0.45)], V(1, 0, 0), 0.016)]), K.steel, A);
    // jaw cylinders
    mesh(mergeG([cy(0.06, 0.06, 0.42, 14, 0.2, 0.16, 0.55, Math.PI / 2 - 0.4), cy(0.06, 0.06, 0.42, 14, -0.2, -0.16, 0.55, Math.PI / 2 + 0.4)]), K.black, A);
    const tine = (flip, len = 1.42) => {
      const f = flip ? -1 : 1;
      const pts = shearMode
        ? [[0, -0.05], [0.4, 0.3], [1.0, 0.28], [1.5, 0.05], [1.45, -0.08], [1.0, 0.1], [0.45, 0.12], [0.1, -0.15]]
        : [[0, -0.04], [0.25, 0.36], [0.75, 0.42], [1.2, 0.36], [len, -0.06], [len - 0.06, -0.16], [1.12, 0.12], [0.72, 0.2], [0.3, 0.2], [0.08, -0.12]];
      return sidePlate(pts.map(([z, y]) => [z, y * f]), shearMode ? 0.12 : 0.07, shearMode ? -0.06 : -0.035);
    };
    const ja = point(A, 0, 0.05, 0.92), jb = point(A, 0, -0.05, 0.92);
    const ta = [], tb = [], ka = [], kb = [];
    const xa = shearMode ? [-0.12, 0.12] : [-0.22, 0, 0.22], xb = shearMode ? [0] : [-0.11, 0.11];
    for (const x of xa) { ta.push(tine(false).translate(x, 0, 0)); ka.push(rbox(0.09, 0.08, 0.13, 0.015, x, -0.08, 1.4, 0.6), bolts([V(x + 0.046, -0.07, 1.36)], V(1, 0, 0), 0.01)); }
    for (const x of xb) { tb.push(tine(true).translate(x, 0, 0)); kb.push(rbox(0.09, 0.08, 0.13, 0.015, x, 0.08, 1.4, -0.6), bolts([V(x + 0.046, 0.07, 1.36)], V(1, 0, 0), 0.01)); }
    ta.push(pinX(0.05, 0.55, 0, 0.3, 0.55), rbox(0.52, 0.12, 0.22, 0.02, 0, 0.12, 0.12));
    tb.push(pinX(0.05, 0.33, 0, -0.3, 0.55), rbox(0.3, 0.12, 0.22, 0.02, 0, -0.12, 0.12));
    mesh(mergeG(ta), shearMode ? K.dark : K.black, ja); mesh(mergeG(tb), shearMode ? K.dark : K.black, jb);
    mesh(mergeG(ka), K.steel, ja); mesh(mergeG(kb), K.steel, jb);
    if (shearMode) { mesh(bx(0.03, 0.05, 1.1, 0.075, -0.02, 0.85), K.chrome, ja); mesh(bx(0.03, 0.05, 1.1, -0.065, 0.02, 0.85), K.chrome, jb); }
    out.jaws.push({ obj: ja, sign: -1, max: 0.75 }, { obj: jb, sign: 1, max: 0.75 });
    out.grab = point(A, 0, 0, 1.55);
    out.probes.push({ obj: point(ja, 0, -0.1, 1.38), r: 0.3 }, { obj: point(jb, 0, 0.1, 1.38), r: 0.3 }, { obj: point(A, 0, 0, 0.5), r: 0.38 }, { obj: point(ja, 0, 0.35, 0.75), r: 0.3 }, { obj: point(jb, 0, -0.35, 0.75), r: 0.3 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.45, 0.55, 0.45, 0.8]] }, { obj: ja, boxes: [[0, 0.25, 0.75, 0.55, 0.2, 1.0], [0, 0, 1.32, 0.55, 0.2, 0.2]] }, { obj: jb, boxes: [[0, -0.25, 0.75, 0.35, 0.2, 1.0], [0, 0, 1.32, 0.35, 0.2, 0.2]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.pieces = shearMode ? 5 : 8;
  } else if (kind === 'claw') {
    // log claw: free-hanging rotator, two opposing jaws of curved tines that interlock like fingers
    mesh(mergeG([cy(0.12, 0.12, 0.5, 16, 0, 0, 0.25, Math.PI / 2), rbox(0.44, 0.4, 0.26, 0.04, 0, 0, 0.62)]), K.black, A);
    coupler(K, A, 0.4); rotator(K, A, 0.26, 0.42);
    mesh(mergeG([pinX(0.055, 0.62, 0, 0.12, 0.74), pinX(0.055, 0.62, 0, -0.12, 0.74), boltCircle(V(0, 0, 0.76), 0.16, 8, V(0, 0, 1), 0.014)]), K.steel, A);
    mesh(mergeG([cy(0.055, 0.055, 0.5, 14, 0.24, 0.22, 0.58, Math.PI / 2 - 0.55), cy(0.055, 0.055, 0.5, 14, -0.24, -0.22, 0.58, Math.PI / 2 + 0.55)]), K.black, A);
    mesh(mergeG([cy(0.032, 0.032, 0.42, 12, 0.24, 0.32, 0.72, Math.PI / 2 - 0.55), cy(0.032, 0.032, 0.42, 12, -0.24, -0.32, 0.72, Math.PI / 2 + 0.55)]), K.chrome, A);
    const claw = (flip) => {
      const f = flip ? -1 : 1;
      const pts = curvePts([[0, -0.02], [0.18, 0.4], [0.62, 0.62], [1.12, 0.48], [1.42, 0.14], [1.5, -0.12]], 18);
      const inner = curvePts([[1.42, -0.16], [1.3, 0.1], [1.05, 0.34], [0.62, 0.44], [0.25, 0.26], [0.1, -0.1]], 18);
      return sidePlate([...pts, ...inner].map(([z, y]) => [z, y * f]), 0.06, -0.03, 0.01);
    };
    const ja = point(A, 0, 0.12, 0.74), jb = point(A, 0, -0.12, 0.74);
    const ga = [], gb = [];
    for (const x of [-0.24, -0.08, 0.08, 0.24]) ((Math.round((x + 0.24) / 0.16) % 2 === 0) ? ga : gb).push(claw((Math.round((x + 0.24) / 0.16) % 2) === 1).translate(x, 0, 0));
    ga.push(pinX(0.045, 0.6, 0, 0.35, 0.4), rbox(0.56, 0.1, 0.16, 0.02, 0, 0.12, 0.08));
    gb.push(pinX(0.045, 0.6, 0, -0.35, 0.4), rbox(0.56, 0.1, 0.16, 0.02, 0, -0.12, 0.08));
    mesh(mergeG(ga), K.black, ja); mesh(mergeG(gb), K.black, jb);
    out.jaws.push({ obj: ja, sign: -1, max: 0.85 }, { obj: jb, sign: 1, max: 0.85 });
    out.grab = point(A, 0, 0, 1.5);
    out.probes.push({ obj: point(ja, 0, 0.2, 1.4), r: 0.3 }, { obj: point(jb, 0, -0.2, 1.4), r: 0.3 }, { obj: point(A, 0, 0, 0.6), r: 0.35 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.5, 0.45, 0.45, 0.5]] }, { obj: ja, boxes: [[0, 0.5, 0.7, 0.6, 0.2, 0.9], [0, 0.1, 1.35, 0.6, 0.3, 0.25]] }, { obj: jb, boxes: [[0, -0.5, 0.7, 0.6, 0.2, 0.9], [0, -0.1, 1.35, 0.6, 0.3, 0.25]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.pieces = 12;
  } else if (kind === 'bucket' || kind === 'bigbucket' || kind === 'minibucket' || kind === 'crusher') {
    const crusherMode = kind === 'crusher';
    const w = kind === 'bigbucket' ? 1.5 : kind === 'minibucket' ? 0.8 : crusherMode ? 1.05 : 1.15;
    const k = kind === 'bigbucket' ? 1.18 : kind === 'minibucket' ? 0.82 : crusherMode ? 1.1 : 1.0;
    const P = (z, y) => [z * k, y * k];
    const back = curvePts([P(-0.08, 0.22), P(0.3, 0.44), P(0.85, 0.38), P(1.28, 0.02), P(1.4, -0.36)]);
    const plate = [...back, P(1.36, -0.44), P(0.6, -0.5), P(0.15, -0.4), P(-0.12, -0.08)];
    const g = [shell(back, 0.035, w)];
    for (const s of [-1, 1]) g.push(sidePlate(plate, 0.03, s * (w / 2) - (s > 0 ? 0.03 : 0)));
    g.push(bx(w - 0.04, 0.04, 0.5 * k, 0, -0.43 * k, 0.4 * k, -0.1));
    mesh(mergeG(g), K.paint, A);
    // cutting edge, wear strips, side cutters, heel shroud + bolts
    mesh(mergeG([bx(w + 0.02, 0.045, 0.17, 0, P(1.35, -0.42)[1], P(1.35, -0.42)[0], 0.35), bx(w + 0.02, 0.05, 0.06, 0, 0.36 * k, 0.6 * k, 0.1), bx(w + 0.02, 0.05, 0.06, 0, 0.3 * k, 1.0 * k, -0.6),
      bx(0.05, 0.25, 0.3, -w / 2 - 0.02, -0.3 * k, 1.25 * k, 0.4), bx(0.05, 0.25, 0.3, w / 2 + 0.02, -0.3 * k, 1.25 * k, 0.4), bx(w * 0.9, 0.04, 0.3, 0, 0.42 * k, 0.25 * k, 0.35)]), K.dark, A);
    mesh(boltRow(V(-w / 2 + 0.08, P(1.35, -0.4)[1] + 0.03, P(1.3, 0)[0]), V(w / 2 - 0.08, P(1.35, -0.4)[1] + 0.03, P(1.3, 0)[0]), Math.round(w * 7), V(0, 0.93, -0.36), 0.013, 0.01), K.steel, A);
    const teeth = [];
    const nT = kind === 'minibucket' ? 4 : 5;
    for (let i = 0; i < nT; i++) {
      const x = -w / 2 + 0.1 + (i / (nT - 1)) * (w - 0.2);
      const t = new THREE.ConeGeometry(0.055, 0.24, 4); t.rotateY(Math.PI / 4); t.scale(1, 1, 0.6);
      t.rotateX(2.0); t.translate(x, -0.5 * k, 1.44 * k);
      teeth.push(t, rbox(0.11, 0.08, 0.15, 0.015, x, -0.43 * k, 1.38 * k, 0.35), pinX(0.012, 0.13, x, -0.43 * k, 1.36 * k));
    }
    mesh(mergeG(teeth), K.steel, A);
    coupler(K, A, Math.min(0.5, w - 0.2));
    stick(A, 'lift', 0.12, w / 2 + 0.002, 0.12, 0.45, Math.PI / 2);
    if (crusherMode) {
      // crusher bucket: gearbox + motor on the back, ribbed body, moving jaw plate inside, discharge grid below
      mesh(mergeG([rbox(0.5, 0.32, 0.6, 0.05, 0, 0.55 * k, 0.55 * k), cy(0.14, 0.14, 0.3, 18, 0.2, 0.56 * k, 0.55 * k, 0, 0, Math.PI / 2), boltCircle(V(0.36, 0.56 * k, 0.55 * k), 0.1, 8, V(1, 0, 0), 0.012)]), K.dark, A);
      const ribs = []; for (let i = 0; i < 4; i++) ribs.push(bx(0.04, 0.18, 0.9 * k, -w / 2 + 0.15 + i * (w - 0.3) / 3, 0.42 * k, 0.75 * k, 0.15));
      mesh(mergeG(ribs), K.paint, A);
      const jaw = point(A, 0, 0.0, 0.5 * k);
      const jg = [bx(w - 0.12, 0.05, 0.75 * k, 0, 0.12, 0.25 * k, -0.25)];
      for (let i = 0; i < 6; i++) jg.push(bx(w - 0.16, 0.035, 0.03, 0, 0.16, 0.0 + i * 0.12 * k, -0.25));
      mesh(mergeG(jg), K.steel, jaw);
      out.crushJaw = jaw;
      const grid = []; for (let i = 0; i < 7; i++) grid.push(bx(0.02, 0.03, 0.5 * k, -w / 2 + 0.12 + i * (w - 0.24) / 6, -0.48 * k, 0.45 * k));
      mesh(mergeG(grid), K.dark, A);
      mesh(mergeG([hose([[0.15, 0.4, 0.05], [0.25, 0.6 * k, 0.3], [0.2, 0.62 * k, 0.5 * k]], 0.022, 12), hose([[-0.15, 0.4, 0.05], [-0.05, 0.62 * k, 0.3], [0.05, 0.64 * k, 0.5 * k]], 0.022, 12)]), K.black, A);
    }
    out.contents = mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.9, color: 0x888888 }), A, false);
    out.contents.position.set(0, -0.32 * k, 0.72 * k); out.contents.rotation.x = Math.PI; out.contents.visible = false;
    out.contents.userData.keep = true;
    out.contentsScale = V(w * 0.42, 0.28 * k, 0.5 * k);
    out.grab = point(A, 0, -0.12 * k, 0.72 * k);
    out.grabR = 0.62 * k;
    out.mouth = point(A, 0, -0.5 * k, 0.75 * k); out.mouthN = V(0, -1, 0);
    out.probes.push({ obj: point(A, 0, -0.45 * k, 1.42 * k), r: 0.32 }, { obj: point(A, -w / 2 + 0.1, -0.4 * k, 1.35 * k), r: 0.25 }, { obj: point(A, w / 2 - 0.1, -0.4 * k, 1.35 * k), r: 0.25 }, { obj: point(A, 0, 0.3 * k, 0.8 * k), r: 0.35 });
    out.colliders.push({ obj: A, boxes: [[0, 0.34 * k, 0.6 * k, w, 0.12, 1.0 * k], [0, -0.05 * k, 1.32 * k, w, 0.75 * k, 0.14], [-w / 2, -0.05, 0.65 * k, 0.08, 0.8 * k, 1.3 * k], [w / 2, -0.05, 0.65 * k, 0.08, 0.8 * k, 1.3 * k]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.behaviour = crusherMode ? 'crusher' : 'scoop';
    out.bulk = { kinds: crusherMode ? ['dust'] : ['dust', 'cement', 'water'], capacity: { bigbucket: 3400, minibucket: 140, crusher: 1500, bucket: 1900 }[kind] };
    out.pieces = { bigbucket: 26, minibucket: 5, crusher: 10, bucket: 14 }[kind];
  } else if (kind === 'breaker') {
    const small = K.small;
    mesh(mergeG([rbox(0.46, 0.52, 1.25, 0.05, 0, 0, 0.82), rbox(0.52, 0.1, 1.3, 0.02, 0, 0.29, 0.82), rbox(0.52, 0.1, 1.3, 0.02, 0, -0.29, 0.82)]), K.paint, A);
    mesh(mergeG([bx(0.48, 0.3, 0.06, 0, 0, 0.4), bx(0.48, 0.3, 0.06, 0, 0, 1.0), boltRow(V(0.235, 0.18, 0.3), V(0.235, 0.18, 1.35), 8, V(1, 0, 0), 0.014, 0.01), boltRow(V(-0.235, 0.18, 0.3), V(-0.235, 0.18, 1.35), 8, V(-1, 0, 0), 0.014, 0.01)]), K.black, A);
    mesh(mergeG([cy(0.13, 0.13, 0.16, 16, 0, 0, 1.52, Math.PI / 2), cy(0.06, 0.06, 0.18, 10, 0, 0.18, 1.3, Math.PI / 2), cy(0.04, 0.04, 0.12, 8, 0.15, 0.27, 0.6), cy(0.04, 0.04, 0.12, 8, -0.15, 0.27, 0.6)]), K.dark, A);
    mesh(mergeG([hose([[0.15, 0.33, 0.6], [0.2, 0.5, 0.3], [0.12, 0.4, -0.1]], 0.022, 12), hose([[-0.15, 0.33, 0.6], [-0.2, 0.5, 0.3], [-0.12, 0.4, -0.1]], 0.022, 12)]), K.black, A);
    coupler(K, A);
    stick(A, 'warn', 0.2, 0.232, 0, 0.82, Math.PI / 2); stick(A, 'warn', 0.2, -0.232, 0, 0.82, -Math.PI / 2);
    const ch = new THREE.Group(); A.add(ch);
    const cg = mergeG([cy(0.075, 0.075, 0.55, 16, 0, 0, 1.85, Math.PI / 2), (() => { const c = new THREE.ConeGeometry(0.075, 0.2, 16); c.rotateX(Math.PI / 2); c.translate(0, 0, 2.22); return c; })()]);
    mesh(cg, K.chrome, ch);
    out.chisel = ch;
    out.tip = point(ch, 0, 0, 2.3);
    out.probes.push({ obj: point(A, 0, 0, 1.2), r: 0.38 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.9, 0.5, 0.6, 1.4], [0, 0, 1.95, 0.15, 0.15, 0.6]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.behaviour = 'breaker';
    out.pieces = 0;
  } else if (kind === 'orangepeel') {
    mesh(mergeG([cy(0.25, 0.25, 0.5, 24, 0, 0, 0.35, Math.PI / 2), cy(0.42, 0.42, 0.14, 28, 0, 0, 0.66, Math.PI / 2), cy(0.18, 0.18, 0.3, 18, 0, 0, 0.12, Math.PI / 2), boltCircle(V(0, 0, 0.735), 0.34, 14, V(0, 0, 1), 0.016)]), K.paint, A);
    coupler(K, A);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 2; // one tine on the centre line: mirror-symmetric left/right
      const hinge = new THREE.Group(); hinge.position.set(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.72); hinge.rotation.z = a; A.add(hinge);
      const pts = [[0, -0.05], [0.25, 0.25], [0.7, 0.36], [1.15, 0.22], [1.38, -0.22], [1.3, -0.3], [1.06, 0.08], [0.68, 0.22], [0.28, 0.12], [0.06, -0.14]];
      const g = sidePlate(pts, 0.09, -0.045); g.rotateZ(-Math.PI / 2);
      const tineObj = new THREE.Group(); hinge.add(tineObj);
      mesh(g, K.black, tineObj);
      mesh(mergeG([rbox(0.12, 0.1, 0.12, 0.02, -0.24, 0, 1.36), cy(0.045, 0.045, 0.36, 12, 0.18, 0, 0.32, Math.PI / 2 - 0.3)]), K.steel, tineObj);
      out.jaws.push({ obj: tineObj, axis: 'y', sign: 1, max: 0.7 });
      out.probes.push({ obj: point(tineObj, -0.2, 0, 1.3), r: 0.26 });
    }
    out.grab = point(A, 0, 0, 1.25);
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.45, 0.85, 0.85, 0.6]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.pieces = 12;
  } else if (kind === 'pulverizer') {
    mesh(mergeG([rbox(0.55, 0.6, 0.7, 0.05, 0, 0, 0.45), cy(0.32, 0.32, 0.14, 24, 0, 0, 0.82, Math.PI / 2), boltCircle(V(0, 0, 0.895), 0.26, 12, V(0, 0, 1), 0.015)]), K.paint, A);
    coupler(K, A);
    mesh(mergeG([cy(0.07, 0.07, 0.5, 14, 0, 0.3, 0.55, 0.9), hose([[0.12, 0.3, 0.05], [0.22, 0.42, 0.4], [0.12, 0.35, 0.7]], 0.02, 10)]), K.black, A);
    mesh(sidePlate([[0.85, -0.3], [1.9, -0.25], [2.05, 0.05], [1.85, 0.1], [0.9, 0.0]], 0.42, -0.21), K.dark, A);
    const teethF = [];
    for (let i = 0; i < 4; i++) { const c = new THREE.ConeGeometry(0.06, 0.16, 6); c.translate(0, 0.08, 0); c.translate(-0.12 + (i % 2) * 0.24, 0.05, 1.15 + i * 0.22); teethF.push(c); }
    mesh(mergeG(teethF), K.steel, A);
    const jm = point(A, 0, 0.2, 0.9);
    mesh(sidePlate([[0, 0], [0.9, 0.28], [1.2, 0.12], [1.15, -0.12], [0.9, -0.05], [0.1, -0.2]], 0.42, -0.21), K.dark, jm);
    const teethM = [];
    for (let i = 0; i < 4; i++) { const c = new THREE.ConeGeometry(0.06, 0.16, 6); c.rotateX(Math.PI); c.translate(0, -0.08, 0); c.translate(-0.12 + ((i + 1) % 2) * 0.24, -0.08, 0.3 + i * 0.22); teethM.push(c); }
    mesh(mergeG([...teethM, pinX(0.11, 0.5, 0, 0, 0)]), K.steel, jm);
    out.jaws.push({ obj: jm, sign: -1, max: 0.6 });
    out.grab = point(A, 0, 0.0, 1.45);
    out.probes.push({ obj: point(A, 0, 0, 1.95), r: 0.35 }, { obj: point(jm, 0, 0, 1.1), r: 0.3 }, { obj: point(A, 0, 0, 0.6), r: 0.38 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.5, 0.55, 0.6, 0.8], [0, -0.1, 1.45, 0.42, 0.3, 1.1]] }, { obj: jm, boxes: [[0, 0.05, 0.6, 0.42, 0.25, 1.1]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.pieces = 6;
  } else if (kind === 'tank') {
    mesh(cy(0.55, 0.55, 1.15, 32, 0, -0.05, 0.85, 0, 0, Math.PI / 2), K.paint, A);
    const rings = []; for (const x of [-0.5, -0.17, 0.17, 0.5]) rings.push(new THREE.TorusGeometry(0.56, 0.025, 6, 32).rotateY(Math.PI / 2).translate(x, -0.05, 0.85));
    mesh(mergeG(rings), K.dark, A);
    mesh(mergeG([cy(0.56, 0.56, 0.04, 32, -0.58, -0.05, 0.85, 0, 0, Math.PI / 2), cy(0.56, 0.56, 0.04, 32, 0.58, -0.05, 0.85, 0, 0, Math.PI / 2)]), K.grey, A);
    mesh(mergeG([bx(0.9, 0.06, 0.55, 0, -0.6, 0.85), boltRow(V(-0.4, -0.57, 0.6), V(0.4, -0.57, 0.6), 7, V(0, 1, 0), 0.012, 0.01)]), K.dark, A);
    mesh(mergeG([rbox(0.3, 0.18, 0.3, 0.03, 0, 0.55, 0.55), cy(0.06, 0.06, 0.3, 10, 0, 0.6, 1.0, Math.PI / 2), cy(0.1, 0.1, 0.04, 12, 0, 0.66, 0.55)]), K.galv, A);
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
    gauge.position.set(0.6, 0.2, 0.85); gauge.userData.keep = true; A.add(gauge);
    coupler(K, A);
    out.mouth = point(A, 0, -0.62, 0.85); out.mouthN = V(0, -1, 0);
    out.grab = point(A, 0, -0.05, 0.85);
    out.probes.push({ obj: point(A, 0, -0.1, 1.4), r: 0.4 });
    out.colliders.push({ obj: A, boxes: [[0, -0.05, 0.85, 1.2, 1.1, 1.1]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.behaviour = 'scoop';
    out.bulk = { kinds: ['water'], capacity: 900 };
    out.pieces = 0;
    out.gauge = gauge;
  } else if (kind === 'skip') {
    const body = new THREE.CylinderGeometry(0.62, 0.22, 1.25, 4, 1, true); body.rotateY(Math.PI / 4); body.rotateX(-Math.PI / 2); body.translate(0, 0, 1.05);
    const skipMat = K.paint.clone(); skipMat.side = THREE.DoubleSide; skipMat.onBeforeCompile = K.paint.onBeforeCompile; skipMat.customProgramCacheKey = K.paint.customProgramCacheKey;
    mesh(body, skipMat, A);
    mesh(mergeG([bx(0.95, 0.06, 0.06, 0, 0.45, 0.42), bx(0.95, 0.06, 0.06, 0, -0.45, 0.42), bx(0.06, 0.95, 0.06, 0.45, 0, 0.42), bx(0.06, 0.95, 0.06, -0.45, 0, 0.42), bx(0.06, 0.06, 0.9, 0.3, 0.38, 0.0), bx(0.06, 0.06, 0.9, -0.3, 0.38, 0.0)]), K.dark, A);
    coupler(K, A);
    const gate = point(A, 0, 0, 1.7);
    mesh(mergeG([bx(0.34, 0.34, 0.04, 0, 0, 0.0), pinX(0.03, 0.4, 0, 0.17, 0), bx(0.04, 0.3, 0.2, 0.19, 0.1, -0.1)]), K.dark, gate);
    out.jaws.push({ obj: gate, sign: 1, max: 1.3 });
    out.contents = mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshStandardMaterial({ roughness: 0.85, color: 0x888888, side: THREE.DoubleSide }), A, false);
    out.contents.position.set(0, 0, 0.6); out.contents.visible = false; out.contents.userData.keep = true;
    out.mouth = point(A, 0, 0, 0.45); out.mouthN = V(0, 0, -1);
    out.spout = point(A, 0, 0, 1.75);
    out.grab = point(A, 0, 0, 0.9);
    out.probes.push({ obj: point(A, 0, 0, 1.7), r: 0.3 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 1.0, 1.0, 1.0, 1.3]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.behaviour = 'skip';
    out.bulk = { kinds: ['cement', 'dust', 'water'], capacity: 1200 };
    out.pieces = 0;
  }
  if (!out.grab) out.grab = point(A, 0, 0, 1.2);
  return out;
}
