// Crawler track unit: individually animated shoes (triple grouser / rubber pads) around sprocket and idler,
// flanged rollers, recoil housing, guards, travel motor with hoses, bolts.
import * as THREE from 'three';
import { box, cyl, merge } from './pieces.js';
import { mergeG, boltCircle, boltRow, hose, bake } from './detail.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildTrackUnit(M, { length = 4.4, radius = 0.38, width = 0.6, rollers = 7, frameColor = null, pitch = 0.19, rubber = false, noFrame = false, mats = null } = {}) {
  const mat = mats || { dark: M.darkSteel, steel: M.steel, under: M.blackPaint, rubber: M.rubber, black: M.blackPaint };
  const group = new THREE.Group();
  const cy = radius + 0.07, R = radius + 0.035, zc = length / 2 - radius - 0.04;
  const P = 4 * zc + 2 * Math.PI * R;
  const n = Math.round(P / pitch), realPitch = P / n, sl = realPitch * 0.94;
  const shoe = rubber ? merge([
    box(width, 0.05, sl * 1.02, 0, 0, 0),
    box(width * 0.42, 0.045, 0.055, -width * 0.24, 0.045, -0.02, null, 0, 0.38, 0),
    box(width * 0.42, 0.045, 0.055, width * 0.24, 0.045, -0.02, null, 0, -0.38, 0),
    box(0.07, 0.05, sl * 0.6, 0, -0.045, 0), box(0.03, 0.06, sl * 0.4, -0.06, -0.05, 0), box(0.03, 0.06, sl * 0.4, 0.06, -0.05, 0),
  ]) : merge([
    box(width, 0.035, sl, 0, 0, 0),
    box(width, 0.04, 0.028, 0, 0.035, -sl * 0.3), box(width, 0.03, 0.022, 0, 0.03, 0), box(width, 0.025, 0.02, 0, 0.026, sl * 0.3), // triple grouser
    box(0.05, 0.08, sl * 1.06, -width * 0.22, -0.055, 0), box(0.05, 0.08, sl * 1.06, width * 0.22, -0.055, 0),                       // link plates
    cyl(0.035, 0.035, width * 0.5, 10, 0, -0.065, sl / 2, null, 0, 0, Math.PI / 2),                                                   // bushing
    cyl(0.012, 0.012, 0.03, 6, -width * 0.38, 0.02, -sl * 0.15), cyl(0.012, 0.012, 0.03, 6, width * 0.38, 0.02, -sl * 0.15),        // shoe bolts
    cyl(0.012, 0.012, 0.03, 6, -width * 0.38, 0.02, sl * 0.15), cyl(0.012, 0.012, 0.03, 6, width * 0.38, 0.02, sl * 0.15),
  ]);
  const shoes = new THREE.InstancedMesh(shoe, rubber ? mat.rubber : mat.dark, n);
  shoes.castShadow = true; shoes.receiveShadow = true; shoes.frustumCulled = false;
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

  // sprocket: two toothed rings, bolted segments, hub
  const gear = new THREE.Shape();
  const teeth = 11, ro = radius * 0.98, ri = radius * 0.8;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2, a1 = ((i + 0.3) / teeth) * Math.PI * 2, a2 = ((i + 0.55) / teeth) * Math.PI * 2, a3 = ((i + 0.85) / teeth) * Math.PI * 2;
    [[ri, a0], [ro, a1], [ro, a2], [ri, a3]].forEach(([r, a], k) => { const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0 && k === 0) gear.moveTo(x, y); else gear.lineTo(x, y); });
  }
  gear.closePath();
  const gearGeo = new THREE.ExtrudeGeometry(gear, { depth: 0.07, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 });
  gearGeo.translate(0, 0, -0.035); gearGeo.rotateY(Math.PI / 2);
  const sprocket = new THREE.Group(); sprocket.position.set(0, cy, -zc); group.add(sprocket);
  const sp = new THREE.Mesh(mergeG([gearGeo.clone().translate(-0.09, 0, 0), gearGeo.clone().translate(0.09, 0, 0), cyl(ri * 0.9, ri * 0.9, 0.26, 24, 0, 0, 0, null, 0, 0, Math.PI / 2), cyl(ri * 0.45, ri * 0.5, 0.36, 18, 0, 0, 0, null, 0, 0, Math.PI / 2)]), mat.dark);
  sp.castShadow = true; sprocket.add(sp);
  const spb = new THREE.Mesh(mergeG([boltCircle(V(0.19, 0, 0), ri * 0.62, 10, V(1, 0, 0), 0.018), boltCircle(V(-0.19, 0, 0), ri * 0.62, 10, V(-1, 0, 0), 0.018), boltCircle(V(0.19, 0, 0), ri * 0.3, 6, V(1, 0, 0), 0.014)]), mat.steel);
  sprocket.add(spb);
  // travel motor + cover + hoses (does not rotate)
  const motor = new THREE.Mesh(mergeG([cyl(ri * 0.72, ri * 0.82, 0.3, 22, -width * 0.5 - 0.02, cy, -zc, null, 0, 0, Math.PI / 2), cyl(ri * 0.5, ri * 0.55, 0.12, 18, -width * 0.5 - 0.2, cy, -zc, null, 0, 0, Math.PI / 2),
    boltCircle(V(-width * 0.5 - 0.17, cy, -zc), ri * 0.62, 8, V(-1, 0, 0), 0.015)]), mat.dark);
  motor.castShadow = true; group.add(motor);
  group.add(new THREE.Mesh(mergeG([hose([[-width * 0.5 - 0.1, cy + 0.15, -zc + 0.1], [-width * 0.42, cy + 0.32, -zc + 0.5], [-width * 0.3, cy + 0.3, -zc + 1.2]], 0.022, 16),
    hose([[-width * 0.5 - 0.1, cy + 0.05, -zc + 0.15], [-width * 0.42, cy + 0.22, -zc + 0.6], [-width * 0.3, cy + 0.22, -zc + 1.25]], 0.022, 16)]), mat.black));

  // idler with flange + recoil housing behind it
  const idler = new THREE.Group(); idler.position.set(0, cy, zc); group.add(idler);
  const idl = new THREE.Mesh(mergeG([
    cyl(radius * 0.92, radius * 0.92, width * 0.22, 28, -width * 0.17, 0, 0, null, 0, 0, Math.PI / 2), cyl(radius * 0.92, radius * 0.92, width * 0.22, 28, width * 0.17, 0, 0, null, 0, 0, Math.PI / 2),
    cyl(radius * 0.99, radius * 0.99, width * 0.1, 28, 0, 0, 0, null, 0, 0, Math.PI / 2), cyl(0.09, 0.09, width * 0.8, 12, 0, 0, 0, null, 0, 0, Math.PI / 2),
  ]), mat.dark);
  idl.castShadow = true; idler.add(idl);
  const holes = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; holes.push(cyl(0.065, 0.065, width * 0.46, 10, 0, Math.sin(a) * radius * 0.52, Math.cos(a) * radius * 0.52, null, 0, 0, Math.PI / 2)); }
  idler.add(new THREE.Mesh(mergeG(holes), mat.black));

  const rr = rubber ? 0.085 : 0.1;
  const rg = [];
  for (let i = 0; i < rollers; i++) {
    const z = -zc + 0.3 + (i / Math.max(1, rollers - 1)) * (2 * zc - 0.6);
    const y = cy - R + 0.07 + rr;
    rg.push(cyl(rr * 1.12, rr * 1.12, 0.035, 16, -width * 0.25, y, z, null, 0, 0, Math.PI / 2), cyl(rr, rr, width * 0.16, 16, -width * 0.15, y, z, null, 0, 0, Math.PI / 2));
    rg.push(cyl(rr * 1.12, rr * 1.12, 0.035, 16, width * 0.25, y, z, null, 0, 0, Math.PI / 2), cyl(rr, rr, width * 0.16, 16, width * 0.15, y, z, null, 0, 0, Math.PI / 2));
    rg.push(cyl(rr * 0.6, rr * 0.6, width * 0.62, 10, 0, y, z, null, 0, 0, Math.PI / 2), box(0.08, 0.1, 0.16, -width * 0.36, y + 0.06, z), box(0.08, 0.1, 0.16, width * 0.36, y + 0.06, z));
  }
  if (rollers > 0) for (const z of [-zc * 0.4, zc * 0.4]) rg.push(cyl(0.075, 0.075, width * 0.45, 14, 0, cy + R - 0.07 - 0.075, z, null, 0, 0, Math.PI / 2), box(0.1, 0.14, 0.12, -width * 0.18, cy + R - 0.2, z));
  if (rg.length) { const rm = new THREE.Mesh(mergeG(rg), mat.dark); rm.castShadow = true; group.add(rm); }

  if (!noFrame) {
    // chamfered box-section track frame + guards + recoil housing + bolts
    const fs = new THREE.Shape();
    const fh = radius * 0.64, fw = width * 0.62;
    fs.moveTo(-fw / 2, -fh / 2); fs.lineTo(fw / 2, -fh / 2); fs.lineTo(fw / 2, fh / 2 - 0.08); fs.lineTo(fw / 2 - 0.12, fh / 2); fs.lineTo(-fw / 2 + 0.12, fh / 2); fs.lineTo(-fw / 2, fh / 2 - 0.08); fs.closePath();
    const fg = new THREE.ExtrudeGeometry(fs, { depth: 2 * zc - 0.1, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
    fg.translate(0, cy - 0.02, -zc + 0.05);
    const frameParts = [fg,
      box(0.03, 0.18, 2 * zc - 0.4, -fw / 2 - 0.02, cy - R + 0.2, 0), box(0.03, 0.18, 2 * zc - 0.4, fw / 2 + 0.02, cy - R + 0.2, 0),
      box(fw * 0.8, 0.22, 0.6, 0, cy - 0.02, zc - 0.55), // recoil spring housing
    ];
    const frame = new THREE.Mesh(mergeG(frameParts), frameColor || mat.under);
    frame.castShadow = true; frame.receiveShadow = true; group.add(frame);
    const fb = [boltRow(V(fw / 2 + 0.035, cy - R + 0.25, -zc + 0.4), V(fw / 2 + 0.035, cy - R + 0.25, zc - 0.4), Math.round(zc * 3), V(1, 0, 0), 0.014, 0.012),
      boltRow(V(-fw / 2 - 0.035, cy - R + 0.25, -zc + 0.4), V(-fw / 2 - 0.035, cy - R + 0.25, zc - 0.4), Math.round(zc * 3), V(-1, 0, 0), 0.014, 0.012),
      cyl(0.03, 0.03, 0.06, 8, fw / 2 + 0.02, cy + 0.02, zc - 0.55, null, 0, 0, Math.PI / 2)]; // grease adjuster
    group.add(new THREE.Mesh(mergeG(fb), mat.steel));
  }

  return {
    group, height: cy + R + 0.06,
    move(d) { offset -= d; layout(); sprocket.rotation.x += d / radius; idler.rotation.x += d / (radius * 0.92); },
  };
}
