// Ten excavator designs built by one parametric builder: undercarriage, upper house, cab, boom, stick,
// hydraulic cylinders and attachment. Kinematic physics bodies follow the model.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from './textures.js';
import { box, cyl, merge } from './pieces.js';
import { buildTrackUnit } from './tracks.js';
import { tube } from './crusher.js';
import { buildAttachment } from './attachments.js';
import { terrainHeight, SITE } from './site.js';

const clamp = THREE.MathUtils.clamp;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export const MACHINES = [
  { id: 'tx330', name: 'TORVA TX330 Demolition', brand: 'TORVA', model: 'TX330', icon: '🦾', desc: '30 t demolition excavator with a sorting grapple. The all-rounder.',
    scale: 1, paint: 0xf2b200, under: 'steel', cab: 'cab', boom: 'mono', attach: 'grapple', speed: 2.6 },
  { id: 'k35', name: 'KESTREL K35 Mini', brand: 'KESTREL', model: 'K35', icon: '🐣', desc: 'Zero-tail mini digger on rubber tracks with a canopy and dozer blade. Fits through doors.',
    scale: 0.48, paint: 0xff7300, under: 'rubber', cab: 'canopy', boom: 'mono', attach: 'minibucket', blade: true, zeroTail: true, speed: 2.4 },
  { id: 'hr450', name: 'VANTOR HR450 High Reach', brand: 'VANTOR', model: 'HR450', icon: '🦒', desc: 'Long-reach demolition machine with a tilting cab and a shear on a 15 m arm.',
    scale: 1.1, paint: 0xefefea, accent: 0xc0261b, under: 'steel', gauge: 1.42, cab: 'tilt', boom: 'long', stickLen: 5.2, attach: 'shear', speed: 1.6, heavy: true },
  { id: 'mw180', name: 'MERIDIAN MW180 Wheeled', brand: 'MERIDIAN', model: 'MW180', icon: '🛞', desc: 'Fast wheeled excavator with dual tyres, outriggers, dozer blade and a digging bucket.',
    scale: 0.92, paint: 0x2f9a46, accent: 0xf0f0ea, under: 'wheels', cab: 'cab', boom: 'mono', attach: 'bucket', blade: true, speed: 6.5 },
  { id: 'tx700', name: 'TORVA TX700 Mass Excavator', brand: 'TORVA', model: 'TX700', icon: '🦣', desc: '70 t monster with walkways, twin stacks and a 2.4 m³ rock bucket.',
    scale: 1.4, paint: 0xf2b200, under: 'steel', cab: 'cab', boom: 'mono', attach: 'bigbucket', heavy: true, speed: 1.9 },
  { id: 'bx220', name: 'BRUNO BX220 Breaker', brand: 'BRUNO', model: 'BX220', icon: '🔨', desc: 'Hydraulic hammer. Turn it on and it chews through walls (and the road).',
    scale: 0.95, paint: 0xc41e1e, accent: 0x1b1b1b, under: 'steel', cab: 'cab', boom: 'mono', attach: 'breaker', speed: 2.4 },
  { id: 'mh24', name: 'HALDEN MH24 Material Handler', brand: 'HALDEN', model: 'MH24', icon: '🐙', desc: 'Raised cab, straight boom and a five-tine orange-peel grab that sweeps up rubble.',
    scale: 1.0, paint: 0xf4f4f0, accent: 0x1f5fa8, under: 'steel', gauge: 1.32, cab: 'elevated', boom: 'straight', stickLen: 4.0, attach: 'orangepeel', speed: 2.0 },
  { id: 'amx', name: 'AQUAMOLE AMX Amphibious', brand: 'AQUAMOLE', model: 'AMX', icon: '🦆', desc: 'Pontoon tracks so it floats. Carries a sealed water tank to fetch water from the lake.',
    scale: 0.95, paint: 0x18a598, accent: 0xf2f2ee, under: 'pontoon', cab: 'cab', boom: 'mono', stickLen: 3.8, attach: 'tank', amphibious: true, speed: 2.0 },
  { id: 'gp300', name: 'GRANITE GP300 Pulverizer', brand: 'GRANITE', model: 'GP300', icon: '🦷', desc: 'Concrete pulverizer jaws. Rips and crunches walls apart.',
    scale: 1.05, paint: 0x5f656b, accent: 0xff7a00, under: 'steel', cab: 'cab', boom: 'mono', attach: 'pulverizer', speed: 2.4 },
  { id: 'lc200', name: 'LIMEWORKS LC200 Concrete', brand: 'LIMEWORKS', model: 'LC200', icon: '🪣', desc: 'Concrete skip: fill it at the mixer, open the gate over a pothole to fix the road.',
    scale: 0.9, paint: 0x9acb12, accent: 0x1b1b1b, under: 'steel', cab: 'cab', boom: 'mono', stickLen: 3.2, attach: 'skip', speed: 2.6 },
];

const BOOMS = { mono: { len: 5.6, ky: 1.0 }, long: { len: 9.6, ky: 1.15 }, straight: { len: 7.0, ky: 0.55 } };
const UNDER_Y = { steel: 1.06, rubber: 1.0, wheels: 1.5, pontoon: 1.75 };

export class Machine {
  constructor(ctx, spec, id, pos, yaw) {
    this.ctx = ctx; this.spec = spec; this.id = id; this.M = ctx.M;
    this.s = spec.scale;
    this.root = new THREE.Group(); this.root.position.copy(pos); this.root.rotation.y = yaw;
    ctx.scene.add(this.root);
    this.model = new THREE.Group(); this.model.scale.setScalar(this.s); this.root.add(this.model);
    this.yaw = yaw; this.swing = 0; this.boom = -0.3; this.stickA = 1.5; this.curl = 0.9; this.open = 1; this.openTarget = 1;
    if (spec.boom === 'long') { this.boom = -0.75; this.stickA = 2.0; }
    if (spec.attach === 'breaker' || spec.attach === 'skip') { this.open = 0; this.openTarget = 0; }
    this.speed = 0; this.turn = 0; this.steerVis = 0; this.rpm = 0; this.hyd = 0;
    this.driver = -1; this.held = []; this.payload = { kind: null, kg: 0, color: new THREE.Color(0.5, 0.5, 0.5) };
    this.bodies = []; this.cylinders = []; this.probes = [];
    this.paint = new THREE.MeshPhysicalMaterial({ color: spec.paint, roughness: 0.4, metalness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.25 });
    this.accent = new THREE.MeshStandardMaterial({ color: spec.accent ?? 0x18191b, roughness: 0.5, metalness: 0.3 });
    this.build();
    this.buildPhysics();
    this.pose();
    this.syncBodies(true);
    this.prevProbe = this.probes.map((p) => p.obj.getWorldPosition(new THREE.Vector3()));
    this.lastGp = this.grabPoint.getWorldPosition(new THREE.Vector3());
  }

  get pos() { return this.root.position; }
  mesh(geo, mat, parent, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
  anchor(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }
  decal(txt, w, h, pos, rotY, parent, dark = null) {
    const lum = new THREE.Color(this.spec.paint).getHSL({}).l;
    const col = dark ?? (lum > 0.55 ? '#15171a' : '#ffffff');
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: T.labelTexture(txt, { w: 1024, h: Math.round(1024 * h / w), color: col, font: `900 ${Math.round(1024 * h / w * 0.7)}px Arial` }), transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.copy(pos); m.rotation.y = rotY; parent.add(m); return m;
  }

  // ======================================================================= build
  build() {
    const sp = this.spec, M = this.M;
    this.under = new THREE.Group(); this.model.add(this.under);
    this.tracks = []; this.wheels = []; this.steerWheels = [];
    if (sp.under === 'steel' || sp.under === 'rubber') this.buildTracks();
    else if (sp.under === 'wheels') this.buildWheels();
    else this.buildPontoons();
    if (sp.blade) this.buildBlade();
    this.upper = new THREE.Group(); this.upper.position.y = UNDER_Y[sp.under]; this.model.add(this.upper);
    this.buildUpper();
    this.buildCab();
    this.buildArm();
  }

  buildTracks() {
    const sp = this.spec, M = this.M, g = sp.gauge || 1.19, rubber = sp.under === 'rubber';
    for (const s of [-1, 1]) {
      const tu = buildTrackUnit(M, { length: 4.45, radius: 0.38, width: rubber ? 0.5 : 0.6, rollers: rubber ? 5 : 7, frameColor: rubber ? this.accent : M.blackPaint, rubber });
      tu.group.position.x = s * g; this.under.add(tu.group); this.tracks.push(tu);
    }
    const xs = new THREE.Shape();
    xs.moveTo(-0.95, -1.0); xs.lineTo(0.95, -1.0); xs.lineTo(0.7, -0.3); xs.lineTo(0.7, 0.3); xs.lineTo(0.95, 1.0); xs.lineTo(-0.95, 1.0); xs.lineTo(-0.7, 0.3); xs.lineTo(-0.7, -0.3); xs.closePath();
    const xg = new THREE.ExtrudeGeometry(xs, { depth: 0.42, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    xg.rotateX(-Math.PI / 2); xg.translate(0, 0.5, 0);
    this.mesh(xg, M.blackPaint, this.under);
    this.mesh(merge([box(g * 2 - 1.3, 0.36, 0.5, 0, 0.66, 0)]), M.blackPaint, this.under);
    this.mesh(cyl(0.78, 0.82, 0.12, 40, 0, 0.98, 0), M.darkSteel, this.under);
    this.mesh(cyl(0.7, 0.7, 0.04, 40, 0, 1.05, 0), M.steel, this.under);
    this.underBoxes = [[-g, 0.58, 0, 0.62, 0.8, 4.45], [g, 0.58, 0, 0.62, 0.8, 4.45], [0, 0.7, 0, 1.8, 0.6, 1.8]];
    this.radius = 2.4;
  }

  buildWheels() {
    const M = this.M;
    this.mesh(merge([box(1.2, 0.55, 4.6, 0, 0.95, 0), box(2.2, 0.25, 1.0, 0, 0.8, 1.35), box(2.2, 0.25, 1.0, 0, 0.8, -1.35), box(1.0, 0.4, 0.8, 0, 1.2, -2.1)]), this.accent, this.under);
    this.mesh(cyl(0.78, 0.82, 0.14, 40, 0, 1.3, 0), M.darkSteel, this.under);
    this.mesh(merge([cyl(0.09, 0.09, 2.3, 12, 0, 0.55, 1.35, null, 0, 0, Math.PI / 2), cyl(0.09, 0.09, 2.3, 12, 0, 0.55, -1.35, null, 0, 0, Math.PI / 2), box(0.35, 0.3, 0.35, 0, 0.6, 1.35), box(0.35, 0.3, 0.35, 0, 0.6, -1.35)]), M.darkSteel, this.under);
    // tyre with tread blocks + steel rim
    const tyre = [cyl(0.55, 0.55, 0.32, 28, 0, 0, 0, null, 0, 0, Math.PI / 2)];
    for (let k = 0; k < 22; k++) { const a = (k / 22) * Math.PI * 2; const tb = box(0.3, 0.05, 0.09, 0, 0, 0); tb.rotateY(k % 2 ? 0.3 : -0.3); tb.translate(0, 0.565, 0); tb.rotateX(a); tyre.push(tb); }
    const tyreGeo = merge(tyre), rimGeo = merge([cyl(0.32, 0.32, 0.34, 20, 0, 0, 0, null, 0, 0, Math.PI / 2), cyl(0.12, 0.12, 0.38, 12, 0, 0, 0, null, 0, 0, Math.PI / 2)]);
    const boltGeo = merge(Array.from({ length: 8 }, (_, k) => cyl(0.025, 0.025, 0.4, 6, 0, Math.sin(k / 8 * Math.PI * 2) * 0.2, Math.cos(k / 8 * Math.PI * 2) * 0.2, null, 0, 0, Math.PI / 2)));
    for (const z of [1.35, -1.35]) for (const s of [-1, 1]) {
      const hub = new THREE.Group(); hub.position.set(s * 1.05, 0.56, z); this.under.add(hub);
      const spin = new THREE.Group(); hub.add(spin);
      for (const dx of [-0.17, 0.17]) {
        const t = this.mesh(tyreGeo, M.rubber, spin); t.position.x = dx;
        const r = this.mesh(rimGeo, M.paintGrey, spin, false); r.position.x = dx;
      }
      this.mesh(boltGeo, M.steel, spin, false);
      this.wheels.push(spin);
      if (z > 0) this.steerWheels.push(hub);
      this.mesh(merge([box(0.8, 0.05, 1.3, 0, 0.62, 0)]), this.paint, hub, true);
    }
    // outriggers at the rear
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.6, 0.9, -2.2); leg.rotation.z = s * 0.7; this.under.add(leg);
      this.mesh(merge([box(0.18, 1.2, 0.2, 0, -0.55, 0), box(0.5, 0.06, 0.5, 0, -1.15, 0)]), this.accent, leg);
      this.mesh(cyl(0.05, 0.05, 0.7, 10, s * -0.15, -0.2, 0.15, null, 0, 0, 0.3), M.chrome, leg);
    }
    this.underBoxes = [[0, 0.75, 0, 2.6, 1.0, 4.6]];
    this.radius = 2.6;
  }

  buildPontoons() {
    const M = this.M;
    for (const s of [-1, 1]) {
      const prof = new THREE.Shape();
      prof.moveTo(-3.7, 0.7); prof.lineTo(-3.2, 0.1); prof.lineTo(3.2, 0.1); prof.lineTo(3.8, 0.75); prof.lineTo(3.3, 1.45); prof.lineTo(-3.3, 1.45); prof.closePath();
      const hull = new THREE.ExtrudeGeometry(prof, { depth: 1.2, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
      hull.rotateY(-Math.PI / 2); hull.translate(s * 2.0 + 0.6, 0, 0);
      this.mesh(hull, this.paint, this.under);
      const tu = buildTrackUnit(M, { length: 7.9, radius: 0.72, width: 1.36, rollers: 0, noFrame: true, pitch: 0.3 });
      tu.group.position.x = s * 2.0; this.under.add(tu.group); this.tracks.push(tu);
      this.mesh(merge([box(0.03, 0.4, 5.5, s * 2.0 + s * 0.64, 1.1, 0), box(0.03, 0.12, 5.6, s * 2.0 + s * 0.64, 0.6, 0)]), this.accent, this.under);
    }
    this.mesh(merge([box(3.2, 0.35, 0.5, 0, 1.25, 1.8), box(3.2, 0.35, 0.5, 0, 1.25, -1.8), box(1.8, 0.5, 2.2, 0, 1.3, 0)]), M.blackPaint, this.under);
    this.mesh(cyl(0.78, 0.82, 0.14, 40, 0, 1.6, 0), M.darkSteel, this.under);
    this.underBoxes = [[-2.0, 0.85, 0, 1.3, 1.4, 7.6], [2.0, 0.85, 0, 1.3, 1.4, 7.6], [0, 1.3, 0, 2.8, 0.5, 3.8]];
    this.radius = 3.9;
  }

  buildBlade() {
    const M = this.M, under = this.spec.under;
    const z = under === 'wheels' ? 2.55 : 2.45, w = under === 'wheels' ? 2.5 : 2.6;
    const prof = new THREE.Shape();
    prof.moveTo(0, 0); prof.quadraticCurveTo(-0.25, 0.3, -0.05, 0.62); prof.lineTo(0.03, 0.62); prof.quadraticCurveTo(-0.17, 0.3, 0.08, 0); prof.closePath();
    const g = new THREE.ExtrudeGeometry(prof, { depth: w, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); g.translate(w / 2, 0.06, z);
    this.mesh(g, this.paint, this.under);
    this.mesh(merge([box(0.12, 0.12, 1.2, -0.7, 0.45, z - 0.65, null, 0.2), box(0.12, 0.12, 1.2, 0.7, 0.45, z - 0.65, null, 0.2), box(w, 0.05, 0.08, 0, 0.06, z + 0.04)]), M.darkSteel, this.under);
    this.mesh(cyl(0.05, 0.05, 0.7, 10, 0, 0.55, z - 0.45, null, 1.1), M.chrome, this.under);
  }

  buildUpper() {
    const sp = this.spec, M = this.M, U = this.upper;
    const zt = sp.zeroTail, hv = sp.heavy;
    this.mesh(box(2.5, 0.2, 3.3, 0, 0.1, -0.35), M.blackPaint, U);
    // counterweight
    const tail = zt ? -1.55 : hv ? -2.45 : -2.25;
    const cw = new THREE.Shape();
    cw.moveTo(-1.25, -1.15); cw.lineTo(1.25, -1.15); cw.lineTo(1.25, tail + 0.65); cw.quadraticCurveTo(1.15, tail + 0.05, 0, tail); cw.quadraticCurveTo(-1.15, tail + 0.05, -1.25, tail + 0.65); cw.closePath();
    const cwH = hv ? 1.15 : 0.95;
    const cwg = new THREE.ExtrudeGeometry(cw, { depth: cwH, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 18 });
    cwg.rotateX(Math.PI / 2); cwg.translate(0, 0.23 + cwH, 0);
    this.mesh(cwg, this.paint, U);
    const band = new THREE.ExtrudeGeometry(cw, { depth: 0.12, bevelEnabled: false, curveSegments: 18 });
    band.rotateX(Math.PI / 2); band.scale(1.01, 1, 1.01); band.translate(0, 0.3, 0);
    this.mesh(band, this.accent, U);
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.22), M.hazard); hz.position.set(0, 0.48, tail - 0.06); hz.rotation.y = Math.PI; U.add(hz);
    for (const s of [-1, 1]) this.mesh(box(0.16, 0.08, 0.04, s * 0.6, 0.48, tail - 0.02), M.redLens, U, false);
    this.decal(sp.brand, 1.1, 0.3, new THREE.Vector3(0, 0.28 + cwH * 0.7, tail - 0.07), Math.PI, U);
    // engine hood (chamfered profile across the width)
    const hh = hv ? 1.38 : 1.24;
    const hood = new THREE.Shape();
    hood.moveTo(-1.18, 0.2); hood.lineTo(-1.18, hh - 0.14); hood.lineTo(-1.08, hh); hood.lineTo(-0.2, hh); hood.lineTo(-0.1, hh - 0.12); hood.lineTo(-0.1, 0.2); hood.closePath();
    const hg = new THREE.ExtrudeGeometry(hood, { depth: 2.46, bevelEnabled: false });
    hg.rotateY(Math.PI / 2); hg.translate(-1.23, 0, 0);
    this.mesh(hg, this.paint, U);
    const louv = [];
    for (let i = 0; i < 9; i++) louv.push(box(0.9, 0.025, 0.07, -0.45, hh + 0.015, -1.0 + i * 0.09));
    for (let i = 0; i < 6; i++) louv.push(box(0.02, 0.06, 0.8, 1.235, 0.5 + i * 0.09, -0.65));
    this.mesh(merge(louv), M.blackPaint, U, false);
    this.mesh(merge([box(0.012, 0.85, 0.012, 1.236, 0.66, -0.15), box(0.012, 0.85, 0.012, 1.236, 0.66, -1.12), box(0.012, 0.85, 0.012, -1.236, 0.66, -0.6)]), M.blackPaint, U, false);
    const stacks = hv ? [-0.55, -0.85] : [-0.75];
    for (const x of stacks) this.mesh(merge([cyl(0.075, 0.075, 0.55, 14, x, hh + 0.25, -0.9), cyl(0.085, 0.08, 0.06, 14, x, hh + 0.55, -0.9)]), M.blackPaint, U);
    this.mesh(cyl(0.12, 0.12, 0.28, 16, 0.6, hh + 0.12, -0.5), M.blackPlastic, U);
    // handrails
    const rails = [];
    for (const s of [-1, 1]) {
      rails.push(tube(new THREE.Vector3(s * 1.15, hh, -0.2), new THREE.Vector3(s * 1.15, hh + 0.36, -0.25), 0.02));
      rails.push(tube(new THREE.Vector3(s * 1.15, hh, -1.1), new THREE.Vector3(s * 1.15, hh + 0.36, -1.05), 0.02));
      rails.push(tube(new THREE.Vector3(s * 1.15, hh + 0.36, -0.25), new THREE.Vector3(s * 1.15, hh + 0.36, -1.05), 0.02));
    }
    this.mesh(merge(rails), hv ? M.paintYellow : this.paint, U);
    // right-front tool box / tanks
    const tb = new THREE.Shape();
    tb.moveTo(-0.48, -0.1); tb.lineTo(-1.25, -0.1); tb.lineTo(-1.25, 1.25); tb.quadraticCurveTo(-1.22, 1.45, -1.0, 1.48); tb.lineTo(-0.48, 1.48); tb.closePath();
    const tbg = new THREE.ExtrudeGeometry(tb, { depth: 0.82, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    tbg.rotateX(Math.PI / 2); tbg.translate(0, 1.02, 0);
    this.mesh(tbg, this.paint, U);
    this.mesh(merge([box(0.012, 0.6, 1.2, -1.282, 0.6, 0.65), box(0.08, 0.03, 0.12, -1.29, 0.75, 0.2)]), M.blackPaint, U, false);
    this.mesh(merge([box(0.3, 0.04, 0.4, -1.38, 0.35, 1.0), box(0.3, 0.04, 0.4, -1.38, 0.0, 1.0)]), M.tread, U);
    this.mesh(merge([box(0.12, 0.9, 0.9, 0.1, 0.55, 1.05), box(0.12, 0.9, 0.9, -0.52, 0.55, 1.05), cyl(0.09, 0.09, 0.85, 14, -0.21, 0.78, 1.28, null, 0, 0, Math.PI / 2)]), this.paint, U);
    this.decal(sp.model, 0.7, 0.2, new THREE.Vector3(1.256, 0.95, -0.7), Math.PI / 2, U);
    this.decal(sp.model, 0.7, 0.2, new THREE.Vector3(-1.256, 0.95, -0.7), -Math.PI / 2, U);
    // heavy machines: side walkways with rails + boarding ladder
    if (hv) {
      for (const s of [-1, 1]) {
        this.mesh(box(0.45, 0.05, 2.6, s * 1.48, 0.2, -0.85), M.tread, U);
        const r = [];
        for (const z of [-2.1, -1.2, -0.3, 0.4]) r.push(cyl(0.022, 0.022, 0.9, 8, s * 1.68, 0.65, z));
        r.push(cyl(0.022, 0.022, 2.6, 8, s * 1.68, 1.1, -0.85, null, Math.PI / 2), cyl(0.018, 0.018, 2.6, 8, s * 1.68, 0.65, -0.85, null, Math.PI / 2));
        this.mesh(merge(r), M.paintYellow, U);
      }
      const lad = [tube(new THREE.Vector3(1.6, 0.2, 0.55), new THREE.Vector3(1.75, -0.95, 0.75), 0.025), tube(new THREE.Vector3(1.6, 0.2, 0.95), new THREE.Vector3(1.75, -0.95, 1.15), 0.025)];
      for (let i = 0; i < 4; i++) lad.push(box(0.06, 0.03, 0.42, 1.63 + i * 0.035, -0.05 - i * 0.27, 0.85 + i * 0.05));
      this.mesh(merge(lad), M.paintYellow, U);
    }
    this.upperBoxes = [[0, 0.65, -0.55, 2.5, 1.1, 3.1], [-0.86, 0.6, 0.7, 0.8, 1.0, 1.6]];
  }

  buildCab() {
    const sp = this.spec, M = this.M, U = this.upper;
    const cab = new THREE.Group(); cab.position.set(0.76, 0.2, 0.6); U.add(cab);
    this.cab = cab;
    const cw2 = 0.98, ch = 1.72, zf = 0.95, zb = -0.85, cd = zf - zb;
    let shell = cab;
    if (sp.cab === 'elevated') {
      // hydraulic riser: cab sits 2.3 m higher on a parallelogram frame
      const lift = 2.3;
      this.mesh(merge([box(0.18, lift + 0.1, 0.2, -0.3, lift / 2, -0.6), box(0.18, lift + 0.1, 0.2, 0.3, lift / 2, -0.6), box(0.8, 0.12, 0.3, 0, lift, -0.55)]), this.accent, cab);
      this.mesh(tube(new THREE.Vector3(0, 0.1, 0.3), new THREE.Vector3(0, lift - 0.1, -0.5), 0.07), M.blackPaint, cab);
      this.mesh(tube(new THREE.Vector3(0, 0.6, 0.2), new THREE.Vector3(0, lift - 0.2, -0.45), 0.04), M.chrome, cab);
      const lad = [tube(new THREE.Vector3(0.52, 0, -0.3), new THREE.Vector3(0.52, lift, -0.3), 0.022), tube(new THREE.Vector3(0.52, 0, 0.1), new THREE.Vector3(0.52, lift, 0.1), 0.022)];
      for (let y = 0.3; y < lift; y += 0.3) lad.push(cyl(0.015, 0.015, 0.4, 6, 0.52, y, -0.1, null, Math.PI / 2));
      this.mesh(merge(lad), M.paintYellow, cab);
      shell = new THREE.Group(); shell.position.y = lift; cab.add(shell);
    } else if (sp.cab === 'tilt') {
      shell = new THREE.Group(); shell.position.set(0, 0.05, zb); cab.add(shell);
      const inner = new THREE.Group(); inner.position.z = -zb; shell.add(inner);
      this.tiltPivot = shell; shell = inner;
      this.mesh(cyl(0.05, 0.05, 0.5, 10, 0, 0.25, -zb + 0.4, null, 0.6), M.chrome, cab);
    }
    this.cabShell = shell;
    const glass = M.cabGlass;
    this.mesh(box(cw2, 0.08, cd, 0, 0.04, (zf + zb) / 2), M.blackPaint, shell);
    if (sp.cab === 'canopy') {
      // ROPS canopy: four posts and a roof, open sides
      const posts = [];
      for (const [x, z] of [[-0.45, zb + 0.05], [0.45, zb + 0.05], [-0.45, zf - 0.15], [0.45, zf - 0.15]]) posts.push(box(0.07, ch, 0.07, x, ch / 2, z));
      this.mesh(merge(posts), M.blackPaint, shell);
      this.mesh(box(cw2 + 0.1, 0.08, cd + 0.1, 0, ch + 0.04, (zf + zb) / 2 - 0.05), this.paint, shell);
      this.mesh(box(0.25, 0.08, 0.06, 0, ch - 0.02, zf - 0.08), M.lightLens, shell, false);
    } else {
      this.mesh(box(cw2, ch, 0.06, 0, ch / 2, zb), M.blackPaint, shell);
      const roof = new THREE.Shape(); roof.moveTo(-cw2 / 2 - 0.03, zb - 0.03); roof.lineTo(cw2 / 2 + 0.03, zb - 0.03); roof.lineTo(cw2 / 2 + 0.03, zf + 0.05); roof.lineTo(-cw2 / 2 - 0.03, zf + 0.05); roof.closePath();
      const rg = new THREE.ExtrudeGeometry(roof, { depth: 0.07, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
      rg.rotateX(Math.PI / 2); rg.translate(0, ch + 0.07, 0);
      this.mesh(rg, sp.cab === 'elevated' ? this.paint : M.blackPaint, shell);
      const pil = [];
      for (const s of [-1, 1]) {
        pil.push(box(0.07, ch, 0.07, s * (cw2 / 2 - 0.035), ch / 2, zb + 0.04));
        pil.push(tube(new THREE.Vector3(s * (cw2 / 2 - 0.035), 0.0, zf - 0.05), new THREE.Vector3(s * (cw2 / 2 - 0.035), ch, zf - 0.2), 0.04, 6));
        pil.push(box(0.06, ch, 0.06, s * (cw2 / 2 - 0.03), ch / 2, -0.05));
        pil.push(box(0.06, 0.06, cd, s * (cw2 / 2 - 0.03), 0.62, (zf + zb) / 2));
      }
      pil.push(box(cw2, 0.07, 0.07, 0, 0.62, zf - 0.08));
      this.mesh(merge(pil), M.blackPaint, shell);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(cw2 - 0.08, ch - 0.68), glass); front.position.set(0, 0.62 + (ch - 0.62) / 2, zf - 0.13); front.rotation.x = -0.09; shell.add(front);
      const lowFront = new THREE.Mesh(new THREE.PlaneGeometry(cw2 - 0.08, 0.55), glass); lowFront.position.set(0, 0.32, zf - 0.04); shell.add(lowFront);
      for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(cd - 0.15, ch - 0.1), glass); side.rotation.y = Math.PI / 2; side.position.set(s * (cw2 / 2 - 0.01), ch / 2 + 0.02, (zf + zb) / 2 - 0.05); shell.add(side); }
      const back = new THREE.Mesh(new THREE.PlaneGeometry(cw2 - 0.2, 0.55), glass); back.position.set(0, ch - 0.45, zb + 0.035); back.rotation.y = Math.PI; shell.add(back);
      // roof guard for demolition machines
      if (sp.attach !== 'skip' && sp.attach !== 'tank') {
        const guard = [];
        for (let i = 0; i < 6; i++) guard.push(box(0.03, 0.03, cd - 0.1, -0.4 + i * 0.16, ch + 0.2, (zf + zb) / 2));
        guard.push(box(cw2, 0.04, 0.04, 0, ch + 0.2, zf - 0.05), box(cw2, 0.04, 0.04, 0, ch + 0.2, zb + 0.05));
        for (const s of [-1, 1]) for (const z of [zb + 0.05, zf - 0.05]) guard.push(box(0.04, 0.12, 0.04, s * 0.45, ch + 0.14, z));
        this.mesh(merge(guard), M.blackPaint, shell);
      }
      this.mesh(box(0.03, 0.03, 0.14, cw2 / 2 + 0.02, 0.95, 0.3), M.chrome, shell, false);
      this.mesh(merge([tube(new THREE.Vector3(cw2 / 2, 1.0, zf - 0.05), new THREE.Vector3(cw2 / 2 + 0.25, 1.35, zf + 0.05), 0.015), box(0.03, 0.22, 0.14, cw2 / 2 + 0.27, 1.42, zf + 0.06)]), M.blackPaint, shell, false);
      this.mesh(merge([box(0.18, 0.12, 0.08, 0.3, ch + 0.1, zf - 0.05), box(0.18, 0.12, 0.08, -0.3, ch + 0.1, zf - 0.05)]), M.blackPaint, shell, false);
      this.mesh(merge([box(0.15, 0.09, 0.01, 0.3, ch + 0.1, zf - 0.005), box(0.15, 0.09, 0.01, -0.3, ch + 0.1, zf - 0.005)]), M.lightLens, shell, false);
    }
    this.beacon = this.mesh(cyl(0.05, 0.05, 0.12, 12, -0.3, ch + 0.16 + (sp.cab === 'canopy' ? 0.04 : 0), zb + 0.2), M.amberLens, shell, false);
    // interior
    this.mesh(merge([box(0.5, 0.12, 0.5, 0, 0.5, -0.25), box(0.5, 0.65, 0.12, 0, 0.85, -0.5, null, -0.15), box(0.34, 0.18, 0.1, 0, 1.25, -0.56, null, -0.15), box(0.3, 0.3, 0.3, 0, 0.3, -0.25)]), M.seat, shell, false);
    this.mesh(merge([box(0.16, 0.12, 0.55, -0.33, 0.62, -0.15), box(0.16, 0.12, 0.55, 0.33, 0.62, -0.15)]), M.blackPlastic, shell, false);
    const joy = merge([cyl(0.015, 0.02, 0.18, 8, 0, 0.09, 0), cyl(0.03, 0.03, 0.08, 10, 0, 0.2, 0)]);
    this.joyL = this.mesh(joy, M.blackPlastic, shell, false); this.joyL.position.set(-0.33, 0.68, 0.02);
    this.joyR = this.mesh(joy, M.blackPlastic, shell, false); this.joyR.position.set(0.33, 0.68, 0.02);
    this.mesh(merge([box(0.03, 0.4, 0.03, -0.1, 0.25, 0.55), box(0.03, 0.4, 0.03, 0.1, 0.25, 0.55), box(0.4, 0.06, 0.12, 0, 0.5, 0.55)]), M.blackPlastic, shell, false);
    this.mesh(box(0.22, 0.15, 0.04, -0.38, 1.0, 0.45, null, -0.3, 0.5), M.blackPlastic, shell, false);
    this.mesh(box(0.18, 0.11, 0.005, -0.37, 1.0, 0.47, null, -0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0x3a8ad0 }), shell, false);
    this.seat = this.anchor(shell, 0, 1.32, -0.15);
    this.door = this.anchor(cab, 0.75, 0, 0.25);
    this.driverFig = new THREE.Group(); shell.add(this.driverFig); this.driverFig.visible = false;
    const upperBoxCab = [0.76, 1.1, 0.65, 1.0, 1.8, 1.9];
    if (sp.cab === 'elevated') upperBoxCab[1] = 2.3 + 1.1;
    this.upperBoxes.push(upperBoxCab);
  }

  buildArm() {
    const sp = this.spec, M = this.M, U = this.upper;
    const bd = BOOMS[sp.boom] || BOOMS.mono;
    const kz = bd.len / 5.6, ky = bd.ky;
    this.boomLen = bd.len;
    this.boomG = new THREE.Group(); this.boomG.position.set(-0.21, 0.78, 1.28); U.add(this.boomG);
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
    const bg = new THREE.ExtrudeGeometry(bs, { depth, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 3, curveSegments: 16 });
    bg.rotateY(-Math.PI / 2); bg.translate(depth / 2, 0, 0);
    this.mesh(bg, this.paint, this.boomG);
    const knee = P(2.75, 1.75), lug = P(2.15, 0.38);
    this.mesh(merge([cyl(0.08, 0.08, 0.66, 14, 0, 0, 0, null, 0, 0, Math.PI / 2), cyl(0.07, 0.07, 0.66, 14, 0, 0, bd.len, null, 0, 0, Math.PI / 2), cyl(0.06, 0.06, 0.62, 12, 0, knee[1], knee[0], null, 0, 0, Math.PI / 2)]), M.steel, this.boomG);
    this.mesh(merge([box(0.08, 0.36, 0.42, -0.2, lug[1], lug[0], null, 0.5), box(0.08, 0.36, 0.42, 0.2, lug[1], lug[0], null, 0.5), box(0.36, 0.3, 0.12, 0, knee[1] - 0.13, knee[0] - 0.03)]), this.paint, this.boomG);
    const mid = P(1.7, 0.95);
    this.decal(sp.brand, 1.1, 0.3, new THREE.Vector3(depth / 2 + 0.037, mid[1], mid[0]), Math.PI / 2, this.boomG);
    this.decal(sp.brand, 1.1, 0.3, new THREE.Vector3(-depth / 2 - 0.037, mid[1], mid[0]), -Math.PI / 2, this.boomG);
    const lt = P(1.6, 1.25);
    this.mesh(box(0.18, 0.13, 0.1, 0.32, lt[1], lt[0]), M.blackPaint, this.boomG, false);
    this.mesh(box(0.15, 0.1, 0.01, 0.32, lt[1], lt[0] + 0.055), M.lightLens, this.boomG, false);
    const hoseMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55 });
    for (const x of [-0.12, 0.12]) {
      const c = new THREE.CatmullRomCurve3([[0.1, 0.4], [1.2, 0.95], [2.6, 1.62], [4.3, 1.05], [5.5, 0.45]].map(([z, y]) => new THREE.Vector3(x, ...P(z, y).reverse())));
      this.mesh(new THREE.TubeGeometry(c, 40, 0.025, 6), hoseMat, this.boomG, false);
    }
    // stick
    const stickLen = sp.stickLen || 2.92, ks = stickLen / 2.92;
    this.stickLen = stickLen;
    this.stickG = new THREE.Group(); this.stickG.position.set(0, 0, bd.len); this.boomG.add(this.stickG);
    const ss = new THREE.Shape();
    ss.moveTo(-0.72, 0.42); ss.lineTo(-0.45, 0.6); ss.lineTo(0.35, 0.36); ss.lineTo(2.85 * ks, 0.16); ss.quadraticCurveTo(2.92 * ks + 0.23, 0.0, 2.92 * ks + 0.03, -0.16); ss.lineTo(0.4, -0.26); ss.quadraticCurveTo(-0.1, -0.3, -0.25, -0.05); ss.lineTo(-0.72, 0.25); ss.closePath();
    const sg = new THREE.ExtrudeGeometry(ss, { depth: 0.4, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 10 });
    sg.rotateY(-Math.PI / 2); sg.translate(0.2, 0, 0);
    this.mesh(sg, this.paint, this.stickG);
    this.mesh(merge([cyl(0.065, 0.065, 0.56, 12, 0, 0.0, stickLen, null, 0, 0, Math.PI / 2), cyl(0.06, 0.06, 0.52, 12, 0, 0.5, -0.6, null, 0, 0, Math.PI / 2)]), M.steel, this.stickG);
    this.mesh(box(0.3, 0.16, 0.24, 0, 0.42, 0.45), this.paint, this.stickG);
    for (const x of [-0.1, 0.1]) {
      const c2 = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.45, -0.2), new THREE.Vector3(x, 0.35, stickLen * 0.5), new THREE.Vector3(x, 0.22, stickLen - 0.2)]);
      this.mesh(new THREE.TubeGeometry(c2, 20, 0.022, 6), hoseMat, this.stickG, false);
    }
    // attachment
    this.attach = new THREE.Group(); this.attach.position.set(0, 0, stickLen); this.stickG.add(this.attach);
    this.att = buildAttachment(sp.attach, M, this.paint);
    this.attach.add(this.att.group);
    this.grabPoint = this.att.grab;
    for (const p of this.att.probes) this.probes.push(p);
    this.probes.push({ obj: this.anchor(this.stickG, 0, 0, stickLen * 0.75), r: 0.38 }, { obj: this.anchor(this.stickG, 0, 0.4, -0.4), r: 0.38 });
    // cylinders
    for (const s of [-1, 1]) this.addCylinder(this.anchor(U, -0.21 + s * 0.36, 0.42, 1.95), this.anchor(this.boomG, s * 0.36, lug[1] - 0.08, lug[0]), 0.11, 0.065);
    this.addCylinder(this.anchor(this.boomG, 0, knee[1] + 0.03, knee[0]), this.anchor(this.stickG, 0, 0.5, -0.6), 0.1, 0.06);
    const ca = this.att.cylAnchor;
    this.addCylinder(this.anchor(this.stickG, 0, 0.5, 0.45), this.anchor(this.attach, ca.x, ca.y, ca.z), 0.085, 0.05);
    this.boomBoxes = [[0, P(1.4, 0.55)[1], P(1.4, 0)[0], 0.5, 0.6 * ky + 0.1, 2.8 * kz, -Math.atan2(1.2 * ky, 2.7 * kz)], [0, P(4.2, 0.65)[1], P(4.2, 0)[0], 0.5, 0.5, 2.8 * kz, Math.atan2(1.2 * ky, 2.8 * kz)]];
    this.stickBoxes = [[0, 0.1, stickLen / 2 - 0.25, 0.4, 0.45, stickLen + 0.5]];
  }

  addCylinder(a, b, rBarrel, rRod) {
    const barrel = new THREE.Mesh(merge([cyl(rBarrel, rBarrel, 1, 16, 0, 0.5, 0), cyl(rBarrel * 1.15, rBarrel * 1.15, 0.06, 16, 0, 0.97, 0), cyl(rBarrel * 1.1, rBarrel * 1.1, 0.12, 16, 0, 0.04, 0)]), this.M.blackPaint);
    const rod = new THREE.Mesh(cyl(rRod, rRod, 1, 14, 0, 0.5, 0), this.M.chrome);
    const eye = new THREE.Mesh(cyl(rRod * 1.4, rRod * 1.4, rRod * 3, 12, 0, 0, 0, null, 0, 0, Math.PI / 2), this.M.steel);
    barrel.castShadow = rod.castShadow = true;
    this.upper.add(barrel, rod, eye);
    this.cylinders.push({ a, b, barrel, rod, eye });
  }

  updateCylinders() {
    const up = new THREE.Vector3(0, 1, 0);
    for (const c of this.cylinders) {
      const pa = this.upper.worldToLocal(c.a.getWorldPosition(new THREE.Vector3()));
      const pb = this.upper.worldToLocal(c.b.getWorldPosition(new THREE.Vector3()));
      const d = pb.clone().sub(pa); const len = d.length(); d.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, d);
      const bl = Math.max(0.3, len * 0.58);
      c.barrel.position.copy(pa); c.barrel.quaternion.copy(q); c.barrel.scale.set(1, bl, 1);
      c.rod.position.copy(pb); c.rod.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(up, d.clone().negate())); c.rod.scale.set(1, Math.max(0.1, len - bl * 0.75 + 0.05), 1);
      c.eye.position.copy(pb); c.eye.quaternion.copy(q);
    }
  }

  // ======================================================================= pose
  limits() {
    const sp = this.spec;
    if (sp.boom === 'long') return { boom: [-1.35, 0.35], stick: [0.5, 2.7], curl: [-0.8, 1.9] };
    if (sp.boom === 'straight') return { boom: [-1.1, 0.5], stick: [0.4, 2.6], curl: [-0.8, 2.0] };
    return { boom: [-0.95, 0.62], stick: [0.35, 2.55], curl: [-0.9, 2.1] };
  }

  groundAt(x, z) {
    const h = terrainHeight(x, z);
    if (this.spec.amphibious) return Math.max(h, SITE.lake.water - 0.95 * this.s);
    return h;
  }

  pose() {
    this.root.rotation.y = this.yaw;
    this.root.position.y = this.groundAt(this.root.position.x, this.root.position.z) + (this.floating ? Math.sin(performance.now() * 0.0015) * 0.04 : 0);
    this.upper.rotation.y = this.swing;
    this.boomG.rotation.x = this.boom;
    this.stickG.rotation.x = this.stickA;
    this.attach.rotation.x = this.curl;
    for (const j of this.att.jaws) {
      const a = j.sign * (this.open * j.max - 0.08);
      if (j.axis === 'y') j.obj.rotation.y = a; else j.obj.rotation.x = a;
    }
    if (this.tiltPivot) this.tiltPivot.rotation.x = clamp(this.boom * 0.45, -0.5, 0);
    for (const w of this.steerWheels) w.rotation.y = this.steerVis;
    this.root.updateMatrixWorld(true);
    this.updateCylinders();
    if (this.att.contents) {
      const f = this.payload.kg / this.att.bulk.capacity;
      this.att.contents.visible = f > 0.01;
      if (f > 0.01) {
        this.att.contents.material.color.copy(this.payload.kind === 'water' ? new THREE.Color(0x3a6f80) : this.payload.color);
        if (this.att.contentsScale) this.att.contents.scale.copy(this.att.contentsScale).multiplyScalar(0.35 + 0.65 * Math.min(1, f));
        else this.att.contents.position.z = 1.45 - Math.min(1, f) * 0.85;
      }
    }
  }

  // ======================================================================= physics
  buildPhysics() {
    const W = this.ctx.physics.world, s = this.s;
    const mk = (obj, boxes) => {
      const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      for (const [x, y, z, sx, sy, sz, rx = 0] of boxes) {
        W.createCollider(RAPIER.ColliderDesc.cuboid(sx * s / 2, sy * s / 2, sz * s / 2).setTranslation(x * s, y * s, z * s)
          .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0))).setFriction(1.0), body);
      }
      this.bodies.push({ obj, body });
    };
    mk(this.under, this.underBoxes);
    mk(this.upper, this.upperBoxes);
    mk(this.boomG, this.boomBoxes);
    mk(this.stickG, this.stickBoxes);
    for (const c of this.att.colliders) mk(c.obj, c.boxes);
    this.blockShapes = [...this.underBoxes.map((b) => ({ obj: this.under, b })), ...this.upperBoxes.map((b) => ({ obj: this.upper, b }))].map(({ obj, b }) => ({
      obj, shape: new RAPIER.Cuboid(b[3] * s / 2 - 0.03, b[4] * s / 2 - 0.03, b[5] * s / 2 - 0.03), off: new THREE.Vector3(b[0], Math.max(b[1], b[4] / 2 + 0.2), b[2]),
    }));
  }

  destroy() {
    const W = this.ctx.physics.world;
    for (const { body } of this.bodies) W.removeRigidBody(body);
    this.ctx.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  syncBodies(teleport = false) {
    for (const { obj, body } of this.bodies) {
      obj.getWorldPosition(_v); obj.getWorldQuaternion(_q);
      if (teleport) { body.setTranslation(_v, true); body.setRotation(_q, true); }
      else { body.setNextKinematicTranslation(_v); body.setNextKinematicRotation(_q); }
    }
  }

  blocked(others) {
    const terrain = this.ctx.terrainCollider;
    for (const b of this.blockShapes) {
      const p = b.off.clone().applyMatrix4(b.obj.matrixWorld);
      const q = b.obj.getWorldQuaternion(new THREE.Quaternion());
      let hit = false;
      this.ctx.physics.world.intersectionsWithShape(p, q, b.shape, (c) => {
        if (terrain && c.handle === terrain.handle) return true;
        hit = true; return false;
      }, RAPIER.QueryFilterFlags.ONLY_FIXED);
      if (hit) return true;
    }
    if (!this.spec.amphibious && terrainHeight(this.root.position.x, this.root.position.z) < -0.25) return true;
    for (const o of others) {
      if (o === this) continue;
      const d = Math.hypot(o.root.position.x - this.root.position.x, o.root.position.z - this.root.position.z);
      if (d < (o.radius * o.s + this.radius * this.s) * 0.72) return true;
    }
    return false;
  }

  // ======================================================================= local control (driver)
  drive(dt, c, others) {
    const sp = this.spec, lim = this.limits();
    const prev = { x: this.root.position.x, z: this.root.position.z, yaw: this.yaw, swing: this.swing };
    const wheels = sp.under === 'wheels';
    this.floating = sp.amphibious && terrainHeight(this.root.position.x, this.root.position.z) < SITE.lake.water - 0.95 * this.s;
    const vmax = sp.speed * (this.floating ? 0.6 : 1);
    this.speed += (c.drive * vmax - this.speed) * Math.min(1, dt * (wheels ? 1.5 : 2.5));
    if (wheels) {
      this.steerVis += (c.steer * -0.45 - this.steerVis) * Math.min(1, dt * 4);
      this.turn = (this.speed / 2.7) * Math.tan(this.steerVis) * 1.0;
    } else this.turn += (-c.steer * 0.75 - this.turn) * Math.min(1, dt * 3);
    this.yaw += this.turn * dt;
    this.root.position.x += Math.sin(this.yaw) * this.speed * dt;
    this.root.position.z += Math.cos(this.yaw) * this.speed * dt;
    this.swing += c.swing * dt * 0.7;
    this.boom = clamp(this.boom + c.boom * dt * 0.5, ...lim.boom);
    this.stickA = clamp(this.stickA + c.stick * dt * 0.7, ...lim.stick);
    this.curl = clamp(this.curl + c.curl * dt * 1.1, ...lim.curl);
    if (c.grabToggle) this.openTarget = this.openTarget > 0.5 ? 0 : 1;
    this.open += Math.sign(this.openTarget - this.open) * Math.min(Math.abs(this.openTarget - this.open), dt * 1.8);
    this.pose();
    if (this.blocked(others)) {
      this.root.position.x = prev.x; this.root.position.z = prev.z; this.yaw = prev.yaw; this.swing = prev.swing; this.speed *= -0.2;
      this.pose();
    }
    const moved = Math.hypot(this.root.position.x - prev.x, this.root.position.z - prev.z) * Math.sign(this.speed || 1);
    this.animateTracks(moved, this.yaw - prev.yaw);
    const motion = Math.abs(c.drive) + Math.abs(c.steer) + Math.abs(c.swing) + Math.abs(c.boom) + Math.abs(c.stick) + Math.abs(c.curl);
    this.hyd += (Math.min(1, motion) - this.hyd) * Math.min(1, dt * 5);
    this.joyL.rotation.set(c.boom * 0.3, 0, -c.swing * 0.3); this.joyR.rotation.set(c.stick * 0.3, 0, -c.curl * 0.3);
  }

  animateTracks(dist, dyaw) {
    const g = (this.spec.gauge || 1.19) * this.s;
    if (this.tracks.length) {
      const dl = (dist + dyaw * g) / this.s, dr = (dist - dyaw * g) / this.s;
      if (Math.abs(dl) > 1e-5 || Math.abs(dr) > 1e-5) { this.tracks[0].move(dr); this.tracks[1].move(dl); }
    }
    for (const w of this.wheels) w.rotation.x += dist / (0.55 * this.s);
  }

  // ======================================================================= network pose
  packPose() {
    return [this.id, this.root.position.x, this.root.position.z, this.yaw, this.swing, this.boom, this.stickA, this.curl, this.open, this.steerVis, this.hyd];
  }
  applyPose(a, i, instant = false) {
    const x = a[i + 1], z = a[i + 2];
    if (instant) { this.root.position.x = x; this.root.position.z = z; this.yaw = a[i + 3]; this.swing = a[i + 4]; this.boom = a[i + 5]; this.stickA = a[i + 6]; this.curl = a[i + 7]; this.open = a[i + 8]; }
    this.net = { x, z, yaw: a[i + 3], swing: a[i + 4], boom: a[i + 5], stick: a[i + 6], curl: a[i + 7], open: a[i + 8], steer: a[i + 9], hyd: a[i + 10] };
  }
  followNet(dt) {
    const n = this.net; if (!n) return;
    const k = 1 - Math.exp(-dt * 12);
    const px = this.root.position.x, pz = this.root.position.z, py = this.yaw;
    const ang = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
    this.root.position.x += (n.x - px) * k; this.root.position.z += (n.z - pz) * k;
    this.yaw = ang(this.yaw, n.yaw); this.swing = ang(this.swing, n.swing);
    this.boom += (n.boom - this.boom) * k; this.stickA += (n.stick - this.stickA) * k; this.curl += (n.curl - this.curl) * k; this.open += (n.open - this.open) * k;
    this.steerVis = n.steer; this.hyd = n.hyd;
    this.floating = this.spec.amphibious && terrainHeight(this.root.position.x, this.root.position.z) < SITE.lake.water - 0.95 * this.s;
    this.pose();
    const fwd = (this.root.position.x - px) * Math.sin(this.yaw) + (this.root.position.z - pz) * Math.cos(this.yaw);
    this.animateTracks(fwd, this.yaw - py);
  }

  // ======================================================================= shared per-frame
  idle(dt, driven) {
    this.rpm += ((driven ? 0.35 + this.hyd * 0.65 : 0) - this.rpm) * Math.min(1, dt * (driven ? 2 : 0.6));
    if (!driven) this.hyd *= Math.max(0, 1 - dt * 3);
    this.beacon.material.emissiveIntensity = driven ? 0.4 + Math.max(0, Math.sin(performance.now() * 0.012)) * 2 : 0.2;
    if (this.att.chisel) {
      const hitting = this.breakerActive && this.openTarget > 0.5;
      this.att.chisel.position.z = hitting ? Math.abs(Math.sin(performance.now() * 0.06)) * 0.12 : 0;
    }
    if (this.att.gauge) this.att.gauge.material.color.setHSL(0.55, 0.6, 0.35 + 0.5 * (1 - this.payload.kg / this.att.bulk.capacity));
  }

  serialize() {
    const p = this.payload;
    return { id: this.id, spec: this.spec.id, pose: [this.root.position.x, this.root.position.z, this.yaw, this.swing, this.boom, this.stickA, this.curl, this.open, this.openTarget].map((v) => Math.round(v * 1e4) / 1e4),
      payload: [p.kind, Math.round(p.kg * 10) / 10, +p.color.r.toFixed(4), +p.color.g.toFixed(4), +p.color.b.toFixed(4)], driver: this.driver };
  }
  restorePose(a) {
    [this.root.position.x, this.root.position.z, this.yaw, this.swing, this.boom, this.stickA, this.curl, this.open, this.openTarget] = a;
    this.pose(); this.syncBodies(true);
    this.prevProbe = this.probes.map((p) => p.obj.getWorldPosition(new THREE.Vector3()));
  }
  setPayload(kind, kg, r, g, b) { this.payload.kind = kg > 0.01 ? kind : null; this.payload.kg = kg > 0.01 ? kg : 0; this.payload.color.setRGB(r, g, b); }

  seatWorld() { return this.seat.getWorldPosition(new THREE.Vector3()); }
  doorWorld() { const d = this.door.getWorldPosition(new THREE.Vector3()); d.y = this.root.position.y; return d; }
  camDistance() { return 11 * Math.max(0.6, this.s) * (this.spec.boom === 'long' ? 1.5 : 1); }
}
