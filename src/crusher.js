// Tracked mobile jaw crusher: detailed model, hopper intake, crushing queue, conveyor + stockpile.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from './textures.js';
import { box, cyl, merge } from './pieces.js';
import { LOOSE } from './demolition.js';
import { buildTrackUnit } from './tracks.js';

const deg = THREE.MathUtils.degToRad;

export class Crusher {
  constructor(scene, physics, M, pos, rotY = 0) {
    this.scene = scene; this.physics = physics; this.M = M;
    this.root = new THREE.Group();
    this.root.position.copy(pos); this.root.rotation.y = rotY;
    scene.add(this.root);
    this.pos = pos.clone().add(new THREE.Vector3(0, 2.5, -3));
    this.colliders = [];
    this.rate = 3;
    this.timer = 0; this.load = 0; this.spin = 0;
    this.crushedCount = 0; this.totalKg = 0;
    this.layers = [];            // stockpile layers bottom -> top: {kg, c: THREE.Color (linear)}
    this.tally = new Map();      // all-time kg per colour hex (for the HUD)
    this.belt = [];              // material riding the conveyor
    this.hopperBox = { min: new THREE.Vector3(-1.4, 1.9, -6.9), max: new THREE.Vector3(1.4, 4.3, -2.2) };
    this.feedTarget = new THREE.Vector3(0, 3.0, -4.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(pos);
    this.platformPoint = new THREE.Vector3(-2.2, 2.5, -4.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(pos);
    this.build();
    this.buildPhysics();
  }

  add(geo, mat, parent = this.root, cast = true, recv = true) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m;
  }
  col(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) { this.colliders.push({ x, y, z, sx, sy, sz, rx, ry, rz }); }

  build() {
    const M = this.M;
    // ---------------- undercarriage ----------------
    this.tracks = [];
    for (const s of [-1, 1]) {
      const tu = buildTrackUnit(M, { length: 6.4, radius: 0.36, width: 0.5, rollers: 9, frameColor: M.darkSteel });
      tu.group.position.set(s * 0.98, 0, -2.6);
      this.root.add(tu.group);
      this.tracks.push(tu);
    }
    this.add(merge([box(1.5, 0.35, 5.4, 0, 0.62, -2.6), box(0.3, 0.5, 0.3, -0.6, 0.85, -5.0), box(0.3, 0.5, 0.3, 0.6, 0.85, -5.0), box(0.3, 0.5, 0.3, -0.6, 0.85, 0.0), box(0.3, 0.5, 0.3, 0.6, 0.85, 0.0)]), M.darkSteel);

    // ---------------- main chassis ----------------
    // twin box beams
    for (const s of [-1, 1]) {
      this.add(box(0.28, 0.42, 9.0, s * 0.78, 1.06, -2.3), M.paintYellow);
      // shaped side frame plates with cut-outs, like a real crusher chassis
      const sh = new THREE.Shape();
      sh.moveTo(-6.75, 0.86); sh.lineTo(1.9, 0.86); sh.lineTo(1.9, 1.35); sh.lineTo(-0.3, 1.35); sh.lineTo(-0.7, 2.25); sh.lineTo(-2.25, 2.25);
      sh.lineTo(-2.6, 2.45); sh.lineTo(-6.75, 2.45); sh.closePath();
      for (const [a, b] of [[-6.3, -5.1], [-4.7, -3.5], [-3.1, -2.6]]) {
        const h = new THREE.Path(); h.moveTo(a, 1.3); h.lineTo(b, 1.3); h.lineTo(b, 2.05); h.lineTo(a, 2.05); h.closePath(); sh.holes.push(h);
      }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
      g.rotateY(-Math.PI / 2); g.translate(s * 1.12 + (s > 0 ? 0.035 : -0.035) + 0.035, 0, 0);
      this.add(g, M.paintYellow);
      // bracing in the frame windows
      for (const z of [-5.7, -4.1]) this.add(cyl(0.035, 0.035, 1.05, 8, s * 1.12, 1.68, z, null, 0.7, 0, 0), M.paintYellow);
    }
    // cross members
    for (const z of [-6.6, -5.0, -3.3, -0.4, 1.7]) this.add(box(2.24, 0.16, 0.18, 0, 2.38, z).translate(0, z > -1 ? -1.1 : 0, 0), M.paintYellow);
    // stabiliser jacks at the corners
    for (const [x, z] of [[-1.25, -6.4], [1.25, -6.4], [-1.25, 1.6], [1.25, 1.6]]) {
      this.add(merge([box(0.22, 0.22, 0.22, x, 1.0, z), cyl(0.07, 0.07, 0.75, 10, x, 0.5, z), box(0.36, 0.05, 0.36, x, 0.04, z)]), M.paintYellow);
      this.add(cyl(0.05, 0.05, 0.4, 10, x, 0.32, z), M.chrome);
    }

    // ---------------- hopper ----------------
    const hop = new THREE.Group(); this.root.add(hop);
    this.hopper = hop;
    const plate = M.paintYellow;
    // feeder pan (vibrating) - slopes down toward the jaw
    this.feeder = new THREE.Group(); hop.add(this.feeder);
    const panTilt = deg(4);
    this.add(box(1.3, 0.08, 4.4, 0, 2.38, -4.55, null, -panTilt), M.darkSteel, this.feeder);
    // grizzly bars at the jaw end
    const bars = [];
    for (let i = 0; i < 7; i++) bars.push(box(0.05, 0.08, 1.0, -0.45 + i * 0.15, 2.3, -2.75, null, -panTilt));
    this.add(merge(bars), M.steel, this.feeder);
    // feeder springs
    for (const z of [-6.3, -2.8]) for (const s of [-1, 1]) {
      const spring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 14), M.blackPaint);
      for (let k = 0; k < 4; k++) { const sp = spring.clone(); sp.rotation.x = Math.PI / 2; sp.position.set(s * 0.95, 2.18 + k * 0.05, z); this.feeder.add(sp); }
    }
    // flared side walls
    const hopLen = 4.5, z0 = -6.85, z1 = -2.35;
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.55, hopLen), plate);
      wall.position.set(s * 0.98, 3.12, (z0 + z1) / 2); wall.rotation.z = s * deg(-24);
      wall.castShadow = wall.receiveShadow = true; hop.add(wall);
      // vertical stiffener ribs on the outside
      for (let k = 0; k < 5; k++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.06), plate);
        rib.position.set(s * 1.05, 3.12, z0 + 0.3 + k * 0.95); rib.rotation.z = s * deg(-24); rib.castShadow = true; hop.add(rib);
      }
      // top rolled rim
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, hopLen + 0.1, 10), plate);
      rim.rotation.x = Math.PI / 2; rim.position.set(s * 1.32, 3.86, (z0 + z1) / 2); hop.add(rim);
      this.col(s * 0.98, 3.12, (z0 + z1) / 2, 0.08, 1.6, hopLen, 0, 0, s * deg(-24));
    }
    // rear wall leaning back
    const rear = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.6, 0.06), plate);
    rear.position.set(0, 3.12, z0 - 0.3); rear.rotation.x = deg(-22); rear.castShadow = true; hop.add(rear);
    this.col(0, 3.12, z0 - 0.3, 2.7, 1.6, 0.08, deg(-22));
    for (let k = 0; k < 3; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.1), plate); rib.position.set(-0.8 + k * 0.8, 3.12, z0 - 0.36); rib.rotation.x = deg(-22); hop.add(rib); }
    // hopper extension wear liners (darker strips inside)
    for (const s of [-1, 1]) {
      const liner = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, hopLen - 0.2), M.darkSteel);
      liner.position.set(s * 0.83, 2.78, (z0 + z1) / 2); liner.rotation.z = s * deg(-24); hop.add(liner);
    }
    // pan collider
    this.col(0, 2.36, -4.55, 1.4, 0.1, 4.4, -panTilt);

    // ---------------- jaw crusher ----------------
    const jaw = new THREE.Group(); this.root.add(jaw); this.jaw = jaw;
    this.add(merge([box(1.5, 1.6, 1.7, 0, 1.75, -1.45), box(1.7, 0.2, 1.9, 0, 2.6, -1.45)]), M.darkSteel, jaw);
    this.add(box(1.52, 0.6, 0.06, 0, 2.2, -2.32), M.hazard, jaw);
    // bearing housings + shaft
    for (const s of [-1, 1]) this.add(merge([box(0.3, 0.5, 0.5, s * 0.85, 2.1, -1.5), cyl(0.09, 0.09, 0.5, 14, s * 1.05, 2.1, -1.5, null, 0, 0, Math.PI / 2)]), M.steel, jaw);
    // flywheels with spokes
    this.flywheels = [];
    for (const s of [-1, 1]) {
      const fw = new THREE.Group(); fw.position.set(s * 1.33, 2.1, -1.5); this.root.add(fw);
      const rimG = new THREE.TorusGeometry(0.72, 0.075, 10, 40); rimG.rotateY(Math.PI / 2);
      const parts = [rimG, cyl(0.18, 0.18, 0.2, 18, 0, 0, 0, null, 0, 0, Math.PI / 2)];
      for (let k = 0; k < 6; k++) { const sp = box(0.05, 0.68, 0.09, 0, 0.36, 0); sp.rotateX((k / 6) * Math.PI * 2); parts.push(sp); }
      const wheel = this.add(merge(parts), M.darkSteel, fw);
      // counterweight segment so rotation is visible
      const cw = this.add(box(0.12, 0.25, 0.5, 0, -0.52, 0), M.paintYellow, fw);
      // belt groove on the drive side
      if (s > 0) this.add(new THREE.TorusGeometry(0.72, 0.035, 6, 40).rotateY(Math.PI / 2).translate(0.09, 0, 0), M.blackPlastic, fw);
      this.flywheels.push(fw);
      // guard cage (yellow frame with vertical bars)
      const cage = [];
      const gx = s * 1.6;
      cage.push(box(0.05, 0.05, 1.9, gx, 2.95, -1.5), box(0.05, 0.05, 1.9, gx, 1.25, -1.5), box(0.05, 1.75, 0.05, gx, 2.1, -2.45), box(0.05, 1.75, 0.05, gx, 2.1, -0.55));
      for (let k = 1; k < 12; k++) cage.push(cyl(0.012, 0.012, 1.7, 5, gx, 2.1, -2.45 + k * 0.158));
      for (const z of [-2.45, -0.55]) cage.push(box(0.3, 0.05, 0.05, s * 1.45, 2.95, z), box(0.3, 0.05, 0.05, s * 1.45, 1.25, z));
      this.add(merge(cage), M.paintYellow, this.root);
    }
    this.col(0, 1.9, -1.45, 1.8, 1.9, 1.9);
    this.col(-1.6, 2.1, -1.5, 0.1, 1.8, 1.9); this.col(1.6, 2.1, -1.5, 0.1, 1.8, 1.9);

    // ---------------- power unit (engine enclosure) ----------------
    const pu = new THREE.Group(); this.root.add(pu);
    const encG = new THREE.BoxGeometry(2.1, 1.75, 2.0, 1, 1, 1);
    const enc = this.add(encG, M.paintOrange, pu); enc.position.set(0, 2.15, 0.65);
    this.add(box(2.2, 0.08, 2.1, 0, 3.06, 0.65), M.paintOrange, pu);
    // roof louvres
    const louv = [];
    for (let k = 0; k < 7; k++) louv.push(box(1.4, 0.03, 0.08, 0, 3.12, 0.05 + k * 0.2, null, 0.4));
    this.add(merge(louv), M.darkSteel, pu);
    // radiator fan on the left (-x) side behind a grille
    const fanFace = new THREE.Group(); fanFace.position.set(-1.06, 2.2, 0.75); fanFace.rotation.y = -Math.PI / 2; pu.add(fanFace);
    this.add(box(1.25, 1.25, 0.04, 0, 0, -0.02), M.blackPaint, fanFace, false);
    this.fan = new THREE.Group(); fanFace.add(this.fan);
    const blades = [cyl(0.1, 0.1, 0.05, 14, 0, 0, 0.02, null, Math.PI / 2)];
    for (let k = 0; k < 7; k++) { const b = box(0.12, 0.5, 0.012, 0, 0.29, 0.02); b.rotateY(0.35); b.rotateZ((k / 7) * Math.PI * 2); blades.push(b); }
    this.add(merge(blades), M.steel, this.fan, false);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshStandardMaterial({ map: T.perforatedTexture(), alphaTest: 0.5, color: 0x333333, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
    grille.material.map.repeat.set(14, 14); grille.position.z = 0.07; fanFace.add(grille);
    const brand = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2), new THREE.MeshBasicMaterial({ map: T.labelTexture('GRITLINE', { w: 512, h: 112, color: '#ffffff', font: '900 84px Arial', bg: '#1b1b1d' }) }));
    brand.position.set(0, 0.72, 0.03); fanFace.add(brand);
    // side brand decal on the right
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), new THREE.MeshStandardMaterial({ map: T.labelTexture('GRITLINE', { w: 1024, h: 256, color: '#16171a', font: '900 170px Arial', sub: 'JC-110 MOBILE JAW CRUSHER' }), transparent: true }));
    dec.position.set(1.061, 2.45, 0.65); dec.rotation.y = Math.PI / 2; pu.add(dec);
    // service door seams / handles
    for (const s of [-1, 1]) for (const z of [0.15, 1.15]) this.add(box(0.03, 0.04, 0.16, s * 1.07, 1.95, z), M.chrome, pu, false);
    // exhaust & beacon
    this.add(merge([cyl(0.07, 0.07, 0.75, 12, 0.6, 3.45, 1.2), cyl(0.09, 0.07, 0.12, 12, 0.6, 3.85, 1.2)]), M.blackPaint, pu);
    this.add(cyl(0.08, 0.1, 0.08, 12, -0.7, 3.14, 1.4), M.blackPlastic, pu);
    this.beacon = this.add(cyl(0.07, 0.07, 0.14, 12, -0.7, 3.25, 1.4), M.amberLens, pu, false);
    this.col(0, 2.15, 0.65, 2.2, 1.85, 2.1);

    // ---------------- control panel ----------------
    const cp = new THREE.Group(); cp.position.set(-1.12, 1.15, 1.95); cp.rotation.y = -Math.PI / 2; this.root.add(cp);
    this.add(box(0.9, 0.62, 0.22, 0, 0.31, 0.11), M.paintGrey, cp);
    this.add(box(0.94, 0.05, 0.3, 0, 0.64, 0.14), M.paintGrey, cp);
    this.screenCanvas = document.createElement('canvas'); this.screenCanvas.width = 256; this.screenCanvas.height = 128;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas); this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: this.screenTex }));
    scr.position.set(-0.1, 0.4, 0.225); cp.add(scr);
    this.add(box(0.5, 0.27, 0.02, -0.1, 0.4, 0.215), M.blackPlastic, cp, false);
    this.add(cyl(0.035, 0.035, 0.03, 14, 0.25, 0.42, 0.235, null, Math.PI / 2), M.redLens, cp, false);
    this.add(cyl(0.035, 0.035, 0.03, 14, 0.36, 0.42, 0.235, null, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x20c040, emissive: 0x0a6020, roughness: 0.3 }), cp, false);
    this.add(merge([cyl(0.06, 0.06, 0.04, 16, 0.3, 0.2, 0.24, null, Math.PI / 2), cyl(0.045, 0.045, 0.03, 12, 0.3, 0.2, 0.22, null, Math.PI / 2)]), M.paintRed, cp, false);
    this.add(box(0.2, 0.2, 0.01, 0.3, 0.2, 0.222), M.paintYellow, cp, false);

    // ---------------- main product conveyor ----------------
    const conv = new THREE.Group(); this.root.add(conv);
    const tail = new THREE.Vector3(0, 0.62, -1.8), head = new THREE.Vector3(0, 3.7, 8.6);
    const dir = head.clone().sub(tail); const len = dir.length(); const ang = Math.atan2(dir.y, dir.z);
    conv.position.copy(tail); conv.rotation.x = -ang;
    // side channels
    for (const s of [-1, 1]) {
      this.add(box(0.08, 0.28, len + 0.3, s * 0.52, 0.0, len / 2), M.paintGrey, conv);
      this.add(box(0.12, 0.04, len + 0.3, s * 0.48, 0.14, len / 2), M.paintGrey, conv);
      // skirt rubber at the loading end
      this.add(box(0.02, 0.2, 2.6, s * 0.42, 0.22, 1.3), M.rubber, conv);
    }
    // belt (top + return) with scrolling texture
    const beltTex = T.beltTexture().clone(); beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping; beltTex.repeat.set(1, len / 0.8); beltTex.needsUpdate = true;
    this.beltTex = beltTex;
    const beltMat = new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 });
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.86, len), beltMat); belt.rotation.x = -Math.PI / 2; belt.position.set(0, 0.12, len / 2); belt.receiveShadow = true; conv.add(belt);
    // troughing: two angled side strips
    for (const s of [-1, 1]) { const sb = new THREE.Mesh(new THREE.PlaneGeometry(0.16, len), beltMat); sb.rotation.set(-Math.PI / 2, s * deg(25), 0); sb.position.set(s * 0.47, 0.155, len / 2); conv.add(sb); }
    this.add(box(0.86, 0.01, len, 0, -0.12, len / 2), M.rubber, conv);
    // idlers
    const idl = [];
    for (let k = 0.5; k < len; k += 0.9) { idl.push(cyl(0.05, 0.05, 0.8, 10, 0, 0.06, k, null, 0, 0, Math.PI / 2)); idl.push(cyl(0.045, 0.045, 0.8, 10, 0, -0.16, k + 0.4, null, 0, 0, Math.PI / 2)); }
    this.add(merge(idl), M.steel, conv);
    // drums
    this.add(cyl(0.16, 0.16, 0.9, 18, 0, 0.0, 0.0, null, 0, 0, Math.PI / 2), M.darkSteel, conv);
    this.add(cyl(0.16, 0.16, 0.9, 18, 0, 0.0, len, null, 0, 0, Math.PI / 2), M.darkSteel, conv);
    this.add(box(1.2, 0.3, 0.36, 0, 0.0, len + 0.05), M.paintGrey, conv); // head motor housing
    this.add(cyl(0.12, 0.12, 0.3, 14, 0.62, 0.0, len, null, 0, 0, Math.PI / 2), M.paintBlue, conv);
    // support struts down to the chassis
    const headW = head.clone();
    const struts = [
      [new THREE.Vector3(-0.55, 3.55, 6.7), new THREE.Vector3(-0.8, 1.35, 1.7)],
      [new THREE.Vector3(0.55, 3.55, 6.7), new THREE.Vector3(0.8, 1.35, 1.7)],
      [new THREE.Vector3(-0.55, 2.2, 2.6), new THREE.Vector3(-0.8, 1.35, 1.7)],
      [new THREE.Vector3(0.55, 2.2, 2.6), new THREE.Vector3(0.8, 1.35, 1.7)],
    ];
    for (const [a, b] of struts) this.add(tube(a, b, 0.045), M.paintGrey);
    this.col(0, 0, 0, 1.2, 0.4, len, 0, 0, 0); // placeholder replaced below
    this.colliders.pop();
    const mid = tail.clone().add(head).multiplyScalar(0.5);
    this.col(mid.x, mid.y, mid.z, 1.2, 0.35, len, -ang);
    this.headPoint = new THREE.Vector3(0, 3.7, 8.75);

    // ---------------- access stairs + platform (left side) ----------------
    const px0 = -2.95, px1 = -1.48, pz0 = -6.6, pz1 = -2.7, py = 2.45;
    this.add(box(px1 - px0, 0.06, pz1 - pz0, (px0 + px1) / 2, py, (pz0 + pz1) / 2), M.tread);
    this.col((px0 + px1) / 2, py - 0.1, (pz0 + pz1) / 2, px1 - px0, 0.2, pz1 - pz0);
    // platform brackets to the chassis
    for (const z of [pz0 + 0.3, pz1 - 0.3]) this.add(tube(new THREE.Vector3(px0 + 0.1, py - 0.05, z), new THREE.Vector3(-1.15, 1.4, z), 0.04), M.paintYellow);
    // railings
    const rails = [];
    const post = (x, z, h = 1.05) => rails.push(cyl(0.025, 0.025, h, 8, x, py + h / 2, z));
    for (let z = pz0; z <= pz1 + 0.01; z += (pz1 - pz0) / 4) post(px0 + 0.03, z);
    post(px1 - 0.05, pz0 + 0.03);
    rails.push(cyl(0.025, 0.025, pz1 - pz0, 8, px0 + 0.03, py + 1.05, (pz0 + pz1) / 2, null, Math.PI / 2), cyl(0.02, 0.02, pz1 - pz0, 8, px0 + 0.03, py + 0.55, (pz0 + pz1) / 2, null, Math.PI / 2));
    rails.push(cyl(0.025, 0.025, px1 - px0, 8, (px0 + px1) / 2, py + 1.05, pz0 + 0.03, null, 0, 0, Math.PI / 2), cyl(0.02, 0.02, px1 - px0, 8, (px0 + px1) / 2, py + 0.55, pz0 + 0.03, null, 0, 0, Math.PI / 2));
    this.add(merge(rails), M.paintYellow);
    this.add(box(px1 - px0, 0.1, 0.02, (px0 + px1) / 2, py + 0.08, pz0 + 0.01), M.paintYellow); // toe board
    this.col(px0 + 0.03, py + 0.55, (pz0 + pz1) / 2, 0.08, 1.1, pz1 - pz0);
    this.col((px0 + px1) / 2, py + 0.55, pz0, px1 - px0, 1.1, 0.08);
    // stairs from platform down toward +z
    const steps = Math.round(py / 0.245), rise = py / steps, runL = 0.3;
    const sx0 = -2.75, sx1 = -1.65;
    const stairParts = [];
    for (let i = 1; i < steps; i++) {
      const y = py - i * rise, z = pz1 + i * runL - runL / 2;
      stairParts.push(box(sx1 - sx0, 0.04, runL - 0.03, (sx0 + sx1) / 2, y, z));
      this.col((sx0 + sx1) / 2, y / 2 - 0.02, z, sx1 - sx0, y + 0.02, runL);
    }
    this.add(merge(stairParts), M.tread);
    const run = steps * runL;
    const stringer = (x) => tube(new THREE.Vector3(x, py, pz1), new THREE.Vector3(x, 0.0, pz1 + run), 0.05);
    this.add(stringer(sx0 - 0.03), M.paintYellow); this.add(stringer(sx1 + 0.03), M.paintYellow);
    this.add(tube(new THREE.Vector3(sx0 - 0.03, py + 1.0, pz1), new THREE.Vector3(sx0 - 0.03, 1.0, pz1 + run), 0.025), M.paintYellow);
    for (let i = 1; i < steps; i += 3) { const y = py - i * rise, z = pz1 + i * runL; this.add(cyl(0.022, 0.022, 1.0, 8, sx0 - 0.03, y + 0.5, z), M.paintYellow); }

    // ---------------- stockpile ----------------
    const gTex = T.gravelTextures();
    const pileMat = new THREE.MeshStandardMaterial({ map: gTex.map.clone(), normalMap: gTex.normalMap, roughness: 1, vertexColors: true });
    pileMat.map.repeat.set(5, 3); pileMat.map.needsUpdate = true;
    pileMat.color.setScalar(1.7);
    const pileGeo = new THREE.ConeGeometry(1, 1, 56, 14);
    const pp = pileGeo.attributes.position;
    this.pileNoise = new Float32Array(pp.count);
    for (let i = 0; i < pp.count; i++) {
      const y = pp.getY(i);
      const a = Math.atan2(pp.getZ(i), pp.getX(i));
      if (y > -0.49 && y < 0.49) { const s = 1 + Math.sin(a * 5 + y * 7) * 0.04 + (Math.random() - 0.5) * 0.08; pp.setX(i, pp.getX(i) * s); pp.setZ(i, pp.getZ(i) * s); }
      this.pileNoise[i] = Math.sin(a * 7 + y * 11) * 0.05 + Math.sin(a * 17) * 0.025 + (Math.random() - 0.5) * 0.04;
    }
    pileGeo.computeVertexNormals();
    pileGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pp.count * 3).fill(0.6), 3));
    this.pile = this.add(pileGeo, pileMat);
    this.pile.position.set(0, 0, 9.35);
    this.pileLocal = new THREE.Vector3(0, 0, 9.35);
    this.updatePile();
    // material riding on the belt / falling off the head drum
    const rockGeo = new THREE.DodecahedronGeometry(0.06, 0);
    this.beltRocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), 600);
    this.beltRocks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3);
    this.beltRocks.frustumCulled = false; this.beltRocks.castShadow = true;
    for (let i = 0; i < 600; i++) this.beltRocks.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    this.scene.add(this.beltRocks);
    this.convTail = new THREE.Vector3(0, 0.78, -1.5); this.convHead = new THREE.Vector3(0, 3.86, 8.6);

    // sign on the platform railing, facing the house
    const hl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ map: T.labelTexture('▼ DROP RUBBLE HERE ▼', { w: 1024, h: 212, color: '#16171a', bg: '#f2b705', font: '900 104px Arial' }), roughness: 0.5 }));
    hl.position.set(px0 - 0.03, py + 0.8, (pz0 + pz1) / 2); hl.rotation.y = -Math.PI / 2; this.root.add(hl);
    const hlBack = this.add(box(0.03, 0.56, 2.46, px0 - 0.005, py + 0.8, (pz0 + pz1) / 2), M.paintYellow);
    // tracks collider
    this.col(0, 0.55, -2.6, 2.5, 1.1, 6.4);
    this.root.updateMatrixWorld(true);
  }

  get pileKg() { let k = 0; for (const l of this.layers) k += l.kg; return k; }

  // 34 degree angle of repose, bulk density 1500 kg/m3
  pileDims() {
    const v = Math.max(0.02, this.pileKg / 1500);
    const r = Math.max(0.35, Math.cbrt(v / 0.7068));
    return { r, h: r * 0.675 };
  }

  pileWorld() { return this.root.localToWorld(this.pileLocal.clone()); }
  pileSurfaceY(x, z) {
    const c = this.pileWorld(), { r, h } = this.pileDims();
    const d = Math.hypot(x - c.x, z - c.z);
    return d > r ? 0 : h * (1 - d / r);
  }

  deposit(kg, color) {
    const top = this.layers[this.layers.length - 1];
    const close = top && Math.abs(top.c.r - color.r) + Math.abs(top.c.g - color.g) + Math.abs(top.c.b - color.b) < 0.04;
    if (close) { top.c.lerp(color, kg / (top.kg + kg)); top.kg += kg; }
    else this.layers.push({ kg, c: color.clone() });
    if (this.layers.length > 80) { const a = this.layers.shift(), b2 = this.layers[0]; b2.c.lerp(a.c, a.kg / (a.kg + b2.kg)); b2.kg += a.kg; }
    this.pileDirty = true;
  }

  // scoop from the top of the pile; returns {kg, color}
  take(kg) {
    let got = 0; const col = new THREE.Color(0, 0, 0); const parts = [];
    while (got < kg && this.layers.length) {
      const top = this.layers[this.layers.length - 1];
      const t = Math.min(top.kg, kg - got);
      col.r += top.c.r * t; col.g += top.c.g * t; col.b += top.c.b * t;
      parts.push({ kg: t, color: top.c.clone() });
      top.kg -= t; got += t;
      if (top.kg <= 0.01) this.layers.pop();
    }
    this.pileDirty = true;
    if (got > 0) col.multiplyScalar(1 / got);
    return { kg: got, color: col, parts };
  }

  updatePile() {
    this.pileDirty = false;
    const { r, h } = this.pileDims();
    const empty = this.pileKg < 1;
    this.pile.visible = !empty;
    this.pile.scale.set(r, h, r);
    this.pile.position.y = h / 2 - 0.04;
    const g = this.pile.geometry, pos = g.attributes.position, col = g.attributes.color;
    const total = this.pileKg || 1;
    const cum = []; let acc = 0;
    for (const l of this.layers) { acc += l.kg; cum.push(acc / total); }
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp(pos.getY(i) + 0.5, 0, 1);
      let c = 1 - Math.pow(1 - t, 3) + this.pileNoise[i];
      c = THREE.MathUtils.clamp(c, 0, 0.9999);
      let k = 0; while (k < cum.length - 1 && cum[k] < c) k++;
      const lc = this.layers[k] ? this.layers[k].c : null;
      if (lc) col.setXYZ(i, lc.r, lc.g, lc.b); else col.setXYZ(i, 0.5, 0.5, 0.5);
    }
    col.needsUpdate = true;
  }

  // a crushed piece: chunks of its colour go onto the belt, the kg arrives at the pile when they land
  crushVisual(kg, color, at, fx, audio) {
    const n = Math.max(3, Math.min(14, Math.round(kg / 4)));
    for (let i = 0; i < n; i++) this.belt.push({ s: -i * 0.09 - Math.random() * 0.05, kg: kg / n, base: color.clone(), c: color.clone().multiplyScalar(0.85 + Math.random() * 0.3), fall: null, x: (Math.random() - 0.5) * 0.5 });
    if (this.belt.length > 590) this.belt.splice(0, this.belt.length - 590).forEach((b) => this.deposit(b.kg, b.base));
    const jawW = this.root.localToWorld(new THREE.Vector3(0, 2.4, -2.3));
    fx.dust(jawW, color.getHex(), 3, 0.7, { alpha: 0.4 });
    fx.dust(this.root.localToWorld(new THREE.Vector3(0, 0.9, -1.0)), color.getHex(), 2, 0.5, { alpha: 0.35 });
    if (at) fx.dust(at, color.getHex(), 2, 0.6, { alpha: 0.3 });
    audio.crunch(jawW);
    this.load = 1;
    this.crushedCount++;
    this.totalKg += kg;
    const hex = color.getHex();
    this.tally.set(hex, (this.tally.get(hex) || 0) + kg);
  }

  updateBelt(dt, fx) {
    const len = this.convHead.distanceTo(this.convTail);
    const dir = this.convHead.clone().sub(this.convTail).normalize();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const speed = 1.6;
    let i = 0;
    const keep = [];
    for (const b of this.belt) {
      if (!b.fall) {
        b.s += speed * dt;
        if (b.s >= len) {
          // thrown off the head drum
          const p = this.root.localToWorld(this.convHead.clone().add(new THREE.Vector3(b.x * 0.6, 0.12, 0.1)));
          const vel = dir.clone().multiplyScalar(speed).applyQuaternion(this.root.quaternion);
          vel.x += (Math.random() - 0.5) * 0.4; vel.z += (Math.random() - 0.5) * 0.3;
          b.fall = { p, v: vel };
        }
      }
      if (b.fall) {
        b.fall.v.y -= 9.8 * dt; b.fall.p.addScaledVector(b.fall.v, dt);
        if (b.fall.p.y <= this.pileSurfaceY(b.fall.p.x, b.fall.p.z) + 0.05) {
          this.deposit(b.kg, b.base);
          if (Math.random() < 0.15) fx.dust(b.fall.p, b.c.getHex(), 1, 0.4, { alpha: 0.3, size: 0.8 });
          continue;
        }
        v.copy(b.fall.p);
      } else {
        const s = Math.max(0, b.s);
        v.copy(this.convTail).addScaledVector(dir, s); v.x += b.x * (s > 0 ? 1 : 0.2); v.y += 0.07;
        if (b.s < 0) v.y -= 0.6; // still inside the jaw chamber
        this.root.localToWorld(v);
      }
      keep.push(b);
      q.setFromEuler(new THREE.Euler(b.s * 3, b.s * 2, 0));
      sc.setScalar(0.7 + Math.min(1.6, b.kg / 3) * 0.6);
      m.compose(v, q, sc);
      this.beltRocks.setMatrixAt(i, m); this.beltRocks.setColorAt(i, b.c); i++;
    }
    this.belt = keep;
    for (let k = i; k < (this.lastBeltCount || 0); k++) this.beltRocks.setMatrixAt(k, m.makeScale(0, 0, 0));
    this.lastBeltCount = i;
    this.beltRocks.instanceMatrix.needsUpdate = true;
    if (this.beltRocks.instanceColor) this.beltRocks.instanceColor.needsUpdate = true;
    if (this.pileDirty) { this.pileTimer = (this.pileTimer || 0) - dt; if (this.pileTimer <= 0) { this.pileTimer = 0.25; this.updatePile(); } }
  }

  buildPhysics() {
    const w = this.physics.world;
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.root.position.x, 0, this.root.position.z)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y)));
    for (const c of this.colliders) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.rx, c.ry, c.rz));
      w.createCollider(RAPIER.ColliderDesc.cuboid(c.sx / 2, c.sy / 2, c.sz / 2).setTranslation(c.x, c.y, c.z).setRotation(q).setFriction(0.7), body);
    }
  }

  // world -> local
  toLocal(v, out = new THREE.Vector3()) { return this.root.worldToLocal(out.copy(v)); }

  inHopper(pos) {
    const l = this.toLocal(pos);
    return l.x > this.hopperBox.min.x && l.x < this.hopperBox.max.x && l.y > this.hopperBox.min.y && l.y < this.hopperBox.max.y && l.z > this.hopperBox.min.z && l.z < this.hopperBox.max.z;
  }

  // authority: actually consume pieces from the hopper; onCrush(piece) does the bookkeeping + networking
  update(dt, demo, fx, audio, onCrush) {
    if (onCrush) {
      const inside = [];
      for (const p of demo.pieces) if (p.state === LOOSE && this.inHopper(p.pos)) inside.push(p);
      this.queue = inside.length;
      this.timer += dt;
      const interval = 1 / this.rate;
      if (inside.length && this.timer >= interval) {
        this.timer = 0;
        inside.sort((a, b) => this.toLocal(b.pos).z - this.toLocal(a.pos).z);
        onCrush(inside[0]);
      } else if (!inside.length) this.timer = Math.min(this.timer, interval);
    }
    this.load = Math.max(0, this.load - dt * 0.6);

    // animation
    this.spin += dt * (6 + this.load * 6);
    for (const fw of this.flywheels) fw.rotation.x = -this.spin;
    this.fan.rotation.z += dt * 18;
    this.beltTex.offset.y -= dt * 1.4;
    const vib = Math.sin(performance.now() * 0.09) * 0.008;
    this.feeder.position.set(0, vib * (0.5 + this.load), vib * 2);
    this.jaw.position.y = Math.sin(performance.now() * 0.07) * 0.006 * (0.3 + this.load);
    this.beacon.material.emissiveIntensity = 0.4 + Math.max(0, Math.sin(performance.now() * 0.012)) * 2.0;
    this.updateBelt(dt, fx);
    this.screenTimer = (this.screenTimer || 0) - dt;
    if (this.screenTimer <= 0) { this.screenTimer = 0.4; this.drawScreen(); }
  }

  drawScreen() {
    const c = this.screenCanvas.getContext('2d');
    c.fillStyle = '#0b1a12'; c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#5dff8a'; c.font = 'bold 18px monospace';
    c.fillText('GRITLINE JC-110', 10, 22);
    c.font = '15px monospace';
    c.fillText(`RATE   ${(this.rate * 60).toFixed(0)} pcs/min`, 10, 46);
    c.fillText(`QUEUE  ${this.queue || 0}`, 10, 64);
    c.fillText(`TOTAL  ${fmtKg(this.totalKg)}`, 10, 82);
    c.fillText(`PILE   ${fmtKg(this.pileKg)}`, 10, 100);
    // colour bar of the pile, bottom -> top
    const tot = this.pileKg; let x = 10;
    if (tot > 0) for (const l of this.layers) { const w = (l.kg / tot) * 236; c.fillStyle = '#' + l.c.getHexString(); c.fillRect(x, 108, Math.max(1, w), 12); x += w; }
    c.fillStyle = this.load > 0.1 ? '#ffb000' : '#2a5a3a';
    c.fillRect(220, 10, 24, 24);
    this.screenTex.needsUpdate = true;
  }

  serialize() {
    return { layers: this.layers.map((l) => [Math.round(l.kg * 10) / 10, +l.c.r.toFixed(4), +l.c.g.toFixed(4), +l.c.b.toFixed(4)]), totalKg: this.totalKg, count: this.crushedCount, tally: [...this.tally.entries()] };
  }
  restore(d) {
    this.layers = d.layers.map(([kg, r, g, b]) => ({ kg, c: new THREE.Color(r, g, b) }));
    this.totalKg = d.totalKg || 0; this.crushedCount = d.count || 0; this.tally = new Map(d.tally || []);
    this.belt = []; this.updatePile();
  }
}

export function fmtKg(kg) { return kg >= 1000 ? (kg / 1000).toFixed(kg >= 10000 ? 1 : 2) + ' t' : Math.round(kg) + ' kg'; }

export function tube(a, b, r, seg = 10) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
  return g;
}
