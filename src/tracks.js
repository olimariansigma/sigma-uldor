// Crawler track unit: individual shoes animated around sprocket + idler, rollers, track frame.
import * as THREE from 'three';
import { box, cyl, merge } from './pieces.js';

export function buildTrackUnit(M, { length = 4.4, radius = 0.38, width = 0.6, rollers = 7, frameColor = null, pitch = 0.19, rubber = false, noFrame = false } = {}) {
  const group = new THREE.Group();
  const cy = radius + 0.07;
  const R = radius + 0.035;
  const zc = length / 2 - radius - 0.04;
  const P = 4 * zc + 2 * Math.PI * R;
  const n = Math.round(P / pitch);
  const realPitch = P / n;

  // shoe geometry (local: y = outward normal, z = along track)
  const sl = realPitch * 0.94;
  const shoe = rubber ? merge([
    box(width, 0.05, sl * 1.02, 0, 0, 0),
    box(width * 0.42, 0.04, 0.05, -width * 0.24, 0.04, 0, null, 0, 0.35, 0),   // chevron lugs
    box(width * 0.42, 0.04, 0.05, width * 0.24, 0.04, 0, null, 0, -0.35, 0),
    box(0.06, 0.05, sl * 0.6, 0, -0.045, 0),
  ]) : merge([
    box(width, 0.04, sl, 0, 0, 0),
    box(width, 0.045, 0.035, 0, 0.04, -sl * 0.15),          // grouser bar
    box(0.07, 0.07, sl * 1.05, -width * 0.22, -0.05, 0),  // link rails
    box(0.07, 0.07, sl * 1.05, width * 0.22, -0.05, 0),
    cyl(0.03, 0.03, width * 0.5, 8, 0, -0.06, sl / 2, null, 0, 0, Math.PI / 2), // pin
  ]);
  const shoes = new THREE.InstancedMesh(shoe, rubber ? M.rubber : M.trackSteel, n);
  shoes.castShadow = true; shoes.receiveShadow = true;
  shoes.frustumCulled = false;
  group.add(shoes);

  const pathAt = (s, pos, nrm, tan) => {
    s = ((s % P) + P) % P;
    const L1 = 2 * zc, A = Math.PI * R;
    if (s < L1) { pos.set(0, cy - R, -zc + s); nrm.set(0, -1, 0); tan.set(0, 0, 1); return; }
    s -= L1;
    if (s < A) { const a = -Math.PI / 2 + s / R; pos.set(0, cy + Math.sin(a) * R, zc + Math.cos(a) * R); nrm.set(0, Math.sin(a), Math.cos(a)); tan.set(0, Math.cos(a), -Math.sin(a)); return; }
    s -= A;
    if (s < L1) { pos.set(0, cy + R, zc - s); nrm.set(0, 1, 0); tan.set(0, 0, -1); return; }
    s -= L1;
    const a = Math.PI / 2 + s / R; pos.set(0, cy + Math.sin(a) * R, -zc + Math.cos(a) * R); nrm.set(0, Math.sin(a), Math.cos(a)); tan.set(0, Math.cos(a), -Math.sin(a));
  };
  const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _x = new THREE.Vector3(), _m = new THREE.Matrix4();
  let offset = 0;
  const layout = () => {
    for (let i = 0; i < n; i++) {
      pathAt(i * realPitch + offset, _p, _n, _t);
      _x.crossVectors(_n, _t);
      _m.makeBasis(_x, _n, _t); _m.setPosition(_p);
      shoes.setMatrixAt(i, _m);
    }
    shoes.instanceMatrix.needsUpdate = true;
  };
  layout();

  // sprocket (rear) & idler (front)
  const gear = new THREE.Shape();
  const teeth = 11, ro = radius * 0.98, ri = radius * 0.8;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2, a1 = ((i + 0.3) / teeth) * Math.PI * 2, a2 = ((i + 0.55) / teeth) * Math.PI * 2, a3 = ((i + 0.85) / teeth) * Math.PI * 2;
    const pts = [[ri, a0], [ro, a1], [ro, a2], [ri, a3]];
    pts.forEach(([r, a], k) => { const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0 && k === 0) gear.moveTo(x, y); else gear.lineTo(x, y); });
  }
  gear.closePath();
  const gearGeo = new THREE.ExtrudeGeometry(gear, { depth: 0.08, bevelEnabled: false });
  gearGeo.translate(0, 0, -0.04); gearGeo.rotateY(Math.PI / 2);
  const sprocket = new THREE.Group();
  sprocket.position.set(0, cy, -zc);
  const sprMesh = new THREE.Mesh(merge([gearGeo.clone().translate(-0.1, 0, 0), gearGeo.clone().translate(0.1, 0, 0), cyl(ri * 0.9, ri * 0.9, 0.3, 20, 0, 0, 0, null, 0, 0, Math.PI / 2)]), M.darkSteel);
  sprMesh.castShadow = true; sprocket.add(sprMesh);
  // bolt heads
  const bolts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; bolts.push(cyl(0.025, 0.025, 0.36, 6, 0, Math.sin(a) * ri * 0.55, Math.cos(a) * ri * 0.55, null, 0, 0, Math.PI / 2)); }
  sprocket.add(new THREE.Mesh(merge(bolts), M.steel));
  group.add(sprocket);
  // travel motor housing
  const motor = new THREE.Mesh(cyl(ri * 0.75, ri * 0.85, 0.32, 18, -width * 0.5 - 0.02, cy, -zc, null, 0, 0, Math.PI / 2), M.darkSteel);
  motor.castShadow = true; group.add(motor);

  const idler = new THREE.Group();
  idler.position.set(0, cy, zc);
  const idlerMesh = new THREE.Mesh(merge([
    cyl(radius * 0.92, radius * 0.92, width * 0.22, 24, -width * 0.17, 0, 0, null, 0, 0, Math.PI / 2),
    cyl(radius * 0.92, radius * 0.92, width * 0.22, 24, width * 0.17, 0, 0, null, 0, 0, Math.PI / 2),
    cyl(radius * 0.99, radius * 0.99, width * 0.1, 24, 0, 0, 0, null, 0, 0, Math.PI / 2),
    cyl(0.08, 0.08, width * 0.75, 10, 0, 0, 0, null, 0, 0, Math.PI / 2),
  ]), M.darkSteel);
  idlerMesh.castShadow = true;
  idler.add(idlerMesh);
  // spokes holes look
  const spokes = [];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; spokes.push(cyl(0.06, 0.06, width * 0.46, 8, 0, Math.sin(a) * radius * 0.5, Math.cos(a) * radius * 0.5, null, 0, 0, Math.PI / 2)); }
  idler.add(new THREE.Mesh(merge(spokes), M.blackPaint));
  group.add(idler);

  // bottom + carrier rollers
  const rollerGroup = [];
  const rr = 0.1;
  for (let i = 0; i < rollers; i++) {
    const z = -zc + 0.3 + (i / (rollers - 1)) * (2 * zc - 0.6);
    rollerGroup.push(cyl(rr, rr, width * 0.2, 14, -width * 0.16, cy - R + 0.07 + rr, z, null, 0, 0, Math.PI / 2));
    rollerGroup.push(cyl(rr, rr, width * 0.2, 14, width * 0.16, cy - R + 0.07 + rr, z, null, 0, 0, Math.PI / 2));
    rollerGroup.push(cyl(rr * 0.6, rr * 0.6, width * 0.6, 8, 0, cy - R + 0.07 + rr, z, null, 0, 0, Math.PI / 2));
  }
  for (const z of [-zc * 0.4, zc * 0.4]) rollerGroup.push(cyl(0.075, 0.075, width * 0.45, 12, 0, cy + R - 0.07 - 0.075, z, null, 0, 0, Math.PI / 2));
  const rollerMesh = new THREE.Mesh(merge(rollerGroup), M.darkSteel);
  group.add(rollerMesh);

  // track frame between the wheels (chamfered box section)
  const fs = new THREE.Shape();
  const fh = radius * 0.62, fw = width * 0.62;
  fs.moveTo(-fw / 2, -fh / 2); fs.lineTo(fw / 2, -fh / 2); fs.lineTo(fw / 2, fh / 2 - 0.08); fs.lineTo(fw / 2 - 0.12, fh / 2); fs.lineTo(-fw / 2 + 0.12, fh / 2); fs.lineTo(-fw / 2, fh / 2 - 0.08); fs.closePath();
  const fg = new THREE.ExtrudeGeometry(fs, { depth: 2 * zc - 0.1, bevelEnabled: false });
  fg.translate(0, cy - 0.02, -zc + 0.05);
  const frame = new THREE.Mesh(fg, frameColor || M.blackPaint);
  frame.castShadow = true; frame.receiveShadow = true;
  if (!noFrame) group.add(frame);
  // track guard plates
  const guard = new THREE.Mesh(merge([box(0.03, 0.18, 2 * zc - 0.4, -fw / 2 - 0.02, cy - R + 0.2, 0), box(0.03, 0.18, 2 * zc - 0.4, fw / 2 + 0.02, cy - R + 0.2, 0)]), frameColor || M.blackPaint);
  group.add(guard);

  return {
    group, height: cy + R + 0.06,
    move(d) {
      offset -= d;
      layout();
      sprocket.rotation.x += d / radius;
      idler.rotation.x += d / (radius * 0.92);
    },
  };
}
