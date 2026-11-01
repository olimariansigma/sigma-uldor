// Excavator attachments. Local frame: origin at the stick-tip pivot, +z continues along the stick,
// -y faces the machine (the side a bucket curls toward).
import * as THREE from 'three';
import { box, cyl, merge } from './pieces.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mesh(geo, mat, parent, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
function point(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }

function shapeFrom(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; }
// extrude a profile drawn in (z, y) across x
function sidePlate(pts, thick, x, bevel = 0.008) {
  const g = new THREE.ExtrudeGeometry(shapeFrom(pts), { depth: thick, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
  g.rotateY(-Math.PI / 2); g.translate(x + thick / 2, 0, 0);
  return g;
}
function curvePts(ctrl, n = 14) {
  const c = new THREE.CatmullRomCurve3(ctrl.map(([z, y]) => V(0, y, z)));
  return c.getPoints(n).map((p) => [p.z, p.y]);
}
// thick plate following a curve (z,y) across width w
function shell(curve, thick, w) {
  const outer = curve, inner = [];
  for (let i = 0; i < curve.length; i++) {
    const a = curve[Math.max(0, i - 1)], b = curve[Math.min(curve.length - 1, i + 1)];
    const tz = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tz, ty) || 1;
    inner.push([curve[i][0] + (ty / l) * thick, curve[i][1] - (tz / l) * thick]);
  }
  return sidePlate([...outer, ...inner.reverse()], w, -w / 2, 0);
}

function headstock(M, paint, A, w = 0.5) {
  mesh(merge([box(0.08, 0.32, 0.36, -0.17, 0.2, 0.05), box(0.08, 0.32, 0.36, 0.17, 0.2, 0.05), box(w, 0.1, 0.4, 0, 0.32, 0.1)]), paint, A);
  mesh(merge([cyl(0.06, 0.06, 0.5, 12, 0, 0, 0, null, 0, 0, Math.PI / 2), cyl(0.05, 0.05, 0.5, 12, 0, 0.3, 0.05, null, 0, 0, Math.PI / 2)]), M.steel, A);
}

/**
 * kind: grapple | bucket | bigbucket | minibucket | breaker | shear | orangepeel | pulverizer | tank | skip
 * returns { group, jaws:[{obj, axis, sign, max}], grab, mouth, mouthN, probes:[{obj, r}], colliders:[{obj, boxes}], cylAnchor,
 *           behaviour: 'jaw'|'scoop'|'breaker'|'skip', bulk:{kinds, capacity}, contents, chisel }
 */
export function buildAttachment(kind, M, paint) {
  const A = new THREE.Group();
  const out = { group: A, kind, jaws: [], probes: [], colliders: [], behaviour: 'jaw', bulk: null, pieces: 6 };
  const dark = M.blackPaint;

  if (kind === 'grapple' || kind === 'shear') {
    const shearMode = kind === 'shear';
    mesh(merge([box(0.5, 0.42, 0.55, 0, 0.0, 0.35), box(0.56, 0.08, 0.6, 0, 0.24, 0.35), cyl(0.3, 0.3, 0.12, 24, 0, 0, 0.66, null, Math.PI / 2)]), paint, A);
    headstock(M, paint, A);
    mesh(cyl(0.18, 0.2, 0.14, 20, 0, 0, 0.78, null, Math.PI / 2), M.darkSteel, A);
    mesh(cyl(0.07, 0.07, 0.62, 12, 0, 0, 0.92, null, 0, 0, Math.PI / 2), M.steel, A);
    const tine = (flip, len = 1.42) => {
      const f = flip ? -1 : 1;
      const pts = shearMode
        ? [[0, -0.05], [0.4, 0.3], [1.0, 0.28], [1.5, 0.05], [1.45, -0.08], [1.0, 0.1], [0.45, 0.12], [0.1, -0.15]]
        : [[0, -0.04], [0.25, 0.36], [0.75, 0.42], [1.2, 0.36], [len, -0.06], [len - 0.06, -0.16], [1.12, 0.12], [0.72, 0.2], [0.3, 0.2], [0.08, -0.12]];
      return sidePlate(pts.map(([z, y]) => [z, y * f]), shearMode ? 0.12 : 0.07, -0.035);
    };
    const ja = point(A, 0, 0.05, 0.92), jb = point(A, 0, -0.05, 0.92);
    const ta = [], tb = [], ka = [], kb = [];
    const xa = shearMode ? [-0.12, 0.12] : [-0.22, 0, 0.22], xb = shearMode ? [0] : [-0.11, 0.11];
    for (const x of xa) { ta.push(tine(false).translate(x, 0, 0)); ka.push(box(0.09, 0.08, 0.12, x, -0.08, 1.4, null, 0.6)); }
    for (const x of xb) { tb.push(tine(true).translate(x, 0, 0)); kb.push(box(0.09, 0.08, 0.12, x, 0.08, 1.4, null, -0.6)); }
    ta.push(cyl(0.05, 0.05, 0.55, 10, 0, 0.3, 0.55, null, 0, 0, Math.PI / 2), box(0.52, 0.12, 0.22, 0, 0.12, 0.12));
    tb.push(cyl(0.05, 0.05, 0.33, 10, 0, -0.3, 0.55, null, 0, 0, Math.PI / 2), box(0.3, 0.12, 0.22, 0, -0.12, 0.12));
    mesh(merge(ta), shearMode ? M.darkSteel : dark, ja); mesh(merge(tb), shearMode ? M.darkSteel : dark, jb);
    mesh(merge(ka), M.steel, ja); mesh(merge(kb), M.steel, jb);
    if (shearMode) { mesh(box(0.03, 0.05, 1.1, 0.075, -0.02, 0.85), M.chrome, ja); mesh(box(0.03, 0.05, 1.1, -0.065, 0.02, 0.85), M.chrome, jb); }
    out.jaws.push({ obj: ja, sign: -1, max: 0.75 }, { obj: jb, sign: 1, max: 0.75 });
    out.grab = point(A, 0, 0, 1.6);
    out.probes.push({ obj: point(ja, 0, -0.1, 1.38), r: 0.3 }, { obj: point(jb, 0, 0.1, 1.38), r: 0.3 }, { obj: point(A, 0, 0, 0.5), r: 0.38 }, { obj: point(ja, 0, 0.35, 0.75), r: 0.3 }, { obj: point(jb, 0, -0.35, 0.75), r: 0.3 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.45, 0.55, 0.45, 0.8]] }, { obj: ja, boxes: [[0, 0.25, 0.75, 0.55, 0.2, 1.0], [0, 0, 1.32, 0.55, 0.2, 0.2]] }, { obj: jb, boxes: [[0, -0.25, 0.75, 0.35, 0.2, 1.0], [0, 0, 1.32, 0.35, 0.2, 0.2]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.pieces = shearMode ? 5 : 8;
  } else if (kind === 'bucket' || kind === 'bigbucket' || kind === 'minibucket') {
    const w = kind === 'bigbucket' ? 1.5 : kind === 'minibucket' ? 0.95 : 1.15;
    const k = kind === 'bigbucket' ? 1.18 : 1.0;
    const P = (z, y) => [z * k, y * k];
    const back = curvePts([P(-0.08, 0.22), P(0.3, 0.44), P(0.85, 0.38), P(1.28, 0.02), P(1.4, -0.36)]);
    const plate = [...back, P(1.36, -0.44), P(0.6, -0.5), P(0.15, -0.4), P(-0.12, -0.08)];
    const g = [shell(back, 0.035, w)];
    for (const s of [-1, 1]) g.push(sidePlate(plate, 0.03, s * (w / 2) - (s > 0 ? 0.03 : 0)));
    g.push(box(w, 0.04, 0.16, 0, P(1.35, -0.42)[1], P(1.35, -0.42)[0], null, 0.35)); // cutting edge
    g.push(box(w - 0.04, 0.04, 0.5 * k, 0, -0.43 * k, 0.4 * k, null, -0.1)); // lip floor
    mesh(merge(g), paint, A);
    // wear strips + side cutters
    mesh(merge([box(w + 0.02, 0.05, 0.06, 0, 0.36 * k, 0.6 * k, null, 0.1), box(w + 0.02, 0.05, 0.06, 0, 0.3 * k, 1.0 * k, null, -0.6), box(0.05, 0.25, 0.3, -w / 2 - 0.02, -0.3 * k, 1.25 * k, null, 0.4), box(0.05, 0.25, 0.3, w / 2 + 0.02, -0.3 * k, 1.25 * k, null, 0.4)]), M.darkSteel, A);
    const teeth = [];
    const nT = kind === 'minibucket' ? 4 : 5;
    for (let i = 0; i < nT; i++) {
      const x = -w / 2 + 0.1 + (i / (nT - 1)) * (w - 0.2);
      const t = new THREE.ConeGeometry(0.055, 0.22, 4); t.rotateY(Math.PI / 4); t.scale(1, 1, 0.6);
      t.rotateX(2.0); t.translate(x, -0.5 * k, 1.44 * k);
      teeth.push(t, box(0.11, 0.08, 0.14, x, -0.43 * k, 1.38 * k, null, 0.35));
    }
    mesh(merge(teeth), M.steel, A);
    headstock(M, paint, A, Math.min(0.5, w - 0.2));
    // payload mound
    out.contents = mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.9, color: 0x888888 }), A, false);
    out.contents.position.set(0, -0.32 * k, 0.72 * k); out.contents.rotation.x = Math.PI; out.contents.visible = false;
    out.contentsScale = V(w * 0.42, 0.28 * k, 0.5 * k);
    out.grab = point(A, 0, -0.12 * k, 0.72 * k);
    out.grabR = 0.55 * k;
    out.mouth = point(A, 0, -0.5 * k, 0.75 * k); out.mouthN = V(0, -1, 0);
    out.probes.push({ obj: point(A, 0, -0.45 * k, 1.42 * k), r: 0.32 }, { obj: point(A, -w / 2 + 0.1, -0.4 * k, 1.35 * k), r: 0.25 }, { obj: point(A, w / 2 - 0.1, -0.4 * k, 1.35 * k), r: 0.25 }, { obj: point(A, 0, 0.3 * k, 0.8 * k), r: 0.35 });
    out.colliders.push({ obj: A, boxes: [[0, 0.32 * k, 0.6 * k, w, 0.08, 1.0 * k], [0, -0.05 * k, 1.3 * k, w, 0.75 * k, 0.1], [-w / 2, -0.05, 0.65 * k, 0.05, 0.8 * k, 1.3 * k], [w / 2, -0.05, 0.65 * k, 0.05, 0.8 * k, 1.3 * k]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.behaviour = 'scoop';
    const cap = kind === 'bigbucket' ? 3400 : kind === 'minibucket' ? 300 : 1900;
    out.bulk = { kinds: ['dust', 'cement', 'water'], capacity: cap };
    out.pieces = kind === 'bigbucket' ? 26 : kind === 'minibucket' ? 6 : 14;
  } else if (kind === 'breaker') {
    mesh(merge([box(0.46, 0.52, 1.25, 0, 0, 0.82), box(0.52, 0.12, 1.3, 0, 0.29, 0.82), box(0.52, 0.12, 1.3, 0, -0.29, 0.82)]), paint, A);
    mesh(merge([box(0.48, 0.3, 0.06, 0, 0, 0.4), box(0.48, 0.3, 0.06, 0, 0, 1.0)]), dark, A);
    mesh(merge([cyl(0.13, 0.13, 0.16, 16, 0, 0, 1.52, null, Math.PI / 2), cyl(0.06, 0.06, 0.18, 10, 0, 0.18, 1.3, null, Math.PI / 2)]), M.darkSteel, A);
    headstock(M, paint, A);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.16), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    lbl.position.set(0.234, 0, 0.82); lbl.rotation.y = Math.PI / 2; A.add(lbl);
    const ch = new THREE.Group(); A.add(ch);
    const cg = merge([cyl(0.075, 0.075, 0.55, 16, 0, 0, 1.85, null, Math.PI / 2), (() => { const c = new THREE.ConeGeometry(0.075, 0.2, 16); c.rotateX(Math.PI / 2); c.translate(0, 0, 2.22); return c; })()]);
    mesh(cg, M.chrome, ch);
    out.chisel = ch;
    out.tip = point(ch, 0, 0, 2.3);
    out.probes.push({ obj: point(A, 0, 0, 1.2), r: 0.38 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.9, 0.5, 0.6, 1.4], [0, 0, 1.95, 0.15, 0.15, 0.6]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.behaviour = 'breaker';
    out.pieces = 0;
  } else if (kind === 'orangepeel') {
    mesh(merge([cyl(0.25, 0.25, 0.5, 24, 0, 0, 0.35, null, Math.PI / 2), cyl(0.42, 0.42, 0.14, 28, 0, 0, 0.66, null, Math.PI / 2), cyl(0.18, 0.18, 0.3, 18, 0, 0, 0.12, null, Math.PI / 2)]), paint, A);
    headstock(M, paint, A);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const hinge = new THREE.Group(); hinge.position.set(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.72); hinge.rotation.z = a; A.add(hinge);
      const pts = [[0, -0.05], [0.25, 0.25], [0.7, 0.36], [1.15, 0.22], [1.38, -0.22], [1.3, -0.3], [1.06, 0.08], [0.68, 0.22], [0.28, 0.12], [0.06, -0.14]];
      // tine profile drawn in (z, radial) -> rotate into the hinge frame (radial = +x)
      const g = sidePlate(pts, 0.09, -0.045); g.rotateZ(-Math.PI / 2);
      const tineObj = new THREE.Group(); hinge.add(tineObj);
      mesh(g, dark, tineObj);
      mesh(box(0.12, 0.1, 0.1, -0.24, 0, 1.36, null, 0, 0, 0), M.steel, tineObj);
      out.jaws.push({ obj: tineObj, axis: 'y', sign: 1, max: 0.7 });
      out.probes.push({ obj: point(tineObj, -0.2, 0, 1.3), r: 0.26 });
    }
    out.grab = point(A, 0, 0, 1.25);
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.45, 0.85, 0.85, 0.6]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.pieces = 12;
  } else if (kind === 'pulverizer') {
    mesh(merge([box(0.55, 0.6, 0.7, 0, 0, 0.45), cyl(0.32, 0.32, 0.14, 24, 0, 0, 0.82, null, Math.PI / 2)]), paint, A);
    headstock(M, paint, A);
    // fixed jaw
    const fixed = sidePlate([[0.85, -0.3], [1.9, -0.25], [2.05, 0.05], [1.85, 0.1], [0.9, 0.0]], 0.42, -0.21);
    mesh(fixed, M.darkSteel, A);
    const teethF = [];
    for (let i = 0; i < 4; i++) { const c = new THREE.ConeGeometry(0.06, 0.16, 6); c.translate(0, 0.08, 0); c.translate(-0.12 + (i % 2) * 0.24, 0.05, 1.15 + i * 0.22); teethF.push(c); }
    mesh(merge(teethF), M.steel, A);
    const jm = point(A, 0, 0.2, 0.9);
    const moving = sidePlate([[0, 0], [0.9, 0.28], [1.2, 0.12], [1.15, -0.12], [0.9, -0.05], [0.1, -0.2]], 0.42, -0.21);
    mesh(moving, M.darkSteel, jm);
    const teethM = [];
    for (let i = 0; i < 4; i++) { const c = new THREE.ConeGeometry(0.06, 0.16, 6); c.rotateX(Math.PI); c.translate(0, -0.08, 0); c.translate(-0.12 + ((i + 1) % 2) * 0.24, -0.08, 0.3 + i * 0.22); teethM.push(c); }
    mesh(merge(teethM), M.steel, jm);
    mesh(cyl(0.11, 0.11, 0.5, 14, 0, 0, 0, null, 0, 0, Math.PI / 2), M.steel, jm);
    out.jaws.push({ obj: jm, sign: -1, max: 0.6 });
    out.grab = point(A, 0, 0.0, 1.45);
    out.probes.push({ obj: point(A, 0, 0, 1.95), r: 0.35 }, { obj: point(jm, 0, 0, 1.1), r: 0.3 }, { obj: point(A, 0, 0, 0.6), r: 0.38 });
    out.colliders.push({ obj: A, boxes: [[0, 0, 0.5, 0.55, 0.6, 0.8], [0, -0.1, 1.45, 0.42, 0.3, 1.1]] }, { obj: jm, boxes: [[0, 0.05, 0.6, 0.42, 0.25, 1.1]] });
    out.cylAnchor = V(0, 0.32, 0.05);
    out.pieces = 6;
  } else if (kind === 'tank') {
    // sealed water bucket: a ribbed drum with a scoop hatch facing the machine
    const tank = cyl(0.55, 0.55, 1.15, 32, 0, -0.05, 0.85, null, 0, 0, Math.PI / 2);
    mesh(tank, paint, A);
    const rings = []; for (const x of [-0.5, -0.17, 0.17, 0.5]) rings.push(new THREE.TorusGeometry(0.56, 0.025, 6, 32).rotateY(Math.PI / 2).translate(x, -0.05, 0.85));
    mesh(merge(rings), M.darkSteel, A);
    mesh(merge([cyl(0.56, 0.56, 0.04, 32, -0.58, -0.05, 0.85, null, 0, 0, Math.PI / 2), cyl(0.56, 0.56, 0.04, 32, 0.58, -0.05, 0.85, null, 0, 0, Math.PI / 2)]), M.paintWhite, A);
    mesh(box(0.9, 0.06, 0.55, 0, -0.6, 0.85), M.darkSteel, A); // scoop lip
    mesh(merge([box(0.3, 0.18, 0.3, 0, 0.55, 0.55), cyl(0.06, 0.06, 0.3, 10, 0, 0.6, 1.0, null, Math.PI / 2)]), M.galvanized, A);
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
    gauge.position.set(0.6, 0.2, 0.85); A.add(gauge);
    headstock(M, paint, A);
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
    // concrete skip hung below the pin: open top near the pivot, discharge gate at the far end
    const body = new THREE.CylinderGeometry(0.62, 0.22, 1.25, 4, 1, true); body.rotateY(Math.PI / 4); body.rotateX(-Math.PI / 2); body.translate(0, 0, 1.05);
    mesh(body, new THREE.MeshPhysicalMaterial({ color: paint.color, roughness: 0.4, clearcoat: 0.3, side: THREE.DoubleSide }), A);
    mesh(merge([box(0.95, 0.06, 0.06, 0, 0.45, 0.42), box(0.95, 0.06, 0.06, 0, -0.45, 0.42), box(0.06, 0.95, 0.06, 0.45, 0, 0.42), box(0.06, 0.95, 0.06, -0.45, 0, 0.42)]), M.darkSteel, A);
    mesh(merge([box(0.06, 0.06, 0.9, 0.3, 0.38, 0.0), box(0.06, 0.06, 0.9, -0.3, 0.38, 0.0)]), M.darkSteel, A);
    headstock(M, paint, A);
    const gate = point(A, 0, 0, 1.7);
    mesh(merge([box(0.34, 0.34, 0.04, 0, 0, 0.0), cyl(0.03, 0.03, 0.4, 8, 0, 0.17, 0, null, 0, 0, Math.PI / 2)]), M.darkSteel, gate);
    out.jaws.push({ obj: gate, sign: 1, max: 1.3 });
    out.contents = mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshStandardMaterial({ roughness: 0.85, color: 0x888888, side: THREE.DoubleSide }), A, false);
    out.contents.position.set(0, 0, 0.6); out.contents.visible = false;
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
