// Demolition excavator: detailed procedural model, kinematic physics, driving, arm control and grapple.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from './textures.js';
import { box, cyl, merge } from './pieces.js';
import { buildTrackUnit } from './tracks.js';
import { tube } from './crusher.js';
import { INTACT, LOOSE, HELD } from './demolition.js';

const deg = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class Excavator {
  constructor(scene, physics, M, pos, yaw) {
    this.scene = scene; this.physics = physics; this.world = physics.world; this.M = M;
    this.root = new THREE.Group(); this.root.position.copy(pos); this.root.rotation.y = yaw;
    scene.add(this.root);
    this.yaw = yaw; this.swing = 0; this.boom = -0.25; this.stickA = 1.55; this.curl = 0.9; this.open = 1; this.openTarget = 1;
    this.speed = 0; this.turn = 0; this.running = false; this.rpm = 0; this.hyd = 0;
    this.held = []; this.capacity = 6;
    this.probes = [];
    this.bodies = [];
    this.cylinders = [];
    this.build();
    this.buildPhysics();
    this.pose();
    this.syncBodies(true);
    this.prevProbe = this.probes.map((p) => p.getWorldPosition(new THREE.Vector3()));
  }

  get pos() { return this.root.position; }

  mesh(geo, mat, parent, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }

  build() {
    const M = this.M;
    // ---------------- undercarriage ----------------
    this.under = new THREE.Group(); this.root.add(this.under);
    this.tracks = [];
    for (const s of [-1, 1]) {
      const tu = buildTrackUnit(M, { length: 4.45, radius: 0.38, width: 0.6, rollers: 7, frameColor: M.blackPaint });
      tu.group.position.x = s * 1.19;
      this.under.add(tu.group);
      this.tracks.push(tu);
    }
    // carbody / X-frame
    const xs = new THREE.Shape();
    xs.moveTo(-0.95, -1.0); xs.lineTo(0.95, -1.0); xs.lineTo(0.7, -0.3); xs.lineTo(0.7, 0.3); xs.lineTo(0.95, 1.0); xs.lineTo(-0.95, 1.0); xs.lineTo(-0.7, 0.3); xs.lineTo(-0.7, -0.3); xs.closePath();
    const xg = new THREE.ExtrudeGeometry(xs, { depth: 0.42, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    xg.rotateX(-Math.PI / 2); xg.translate(0, 0.5, 0);
    this.mesh(xg, M.blackPaint, this.under);
    this.mesh(merge([box(1.0, 0.36, 0.5, -0.75, 0.66, 0), box(1.0, 0.36, 0.5, 0.75, 0.66, 0)]), M.blackPaint, this.under);
    this.mesh(cyl(0.78, 0.82, 0.12, 40, 0, 0.98, 0), M.darkSteel, this.under);
    this.mesh(cyl(0.7, 0.7, 0.04, 40, 0, 1.05, 0), M.steel, this.under);

    // ---------------- upper structure ----------------
    this.upper = new THREE.Group(); this.upper.position.y = 1.06; this.root.add(this.upper);
    const U = this.upper;
    this.mesh(box(2.5, 0.2, 3.3, 0, 0.1, -0.35), M.blackPaint, U);
    // counterweight (curved back)
    const cw = new THREE.Shape();
    cw.moveTo(-1.25, -1.15); cw.lineTo(1.25, -1.15); cw.lineTo(1.25, -1.6); cw.quadraticCurveTo(1.15, -2.2, 0, -2.25); cw.quadraticCurveTo(-1.15, -2.2, -1.25, -1.6); cw.closePath();
    const cwg = new THREE.ExtrudeGeometry(cw, { depth: 0.95, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 18 });
    cwg.rotateX(Math.PI / 2); cwg.translate(0, 1.18, 0);
    this.mesh(cwg, M.paintYellow, U);
    // lower black band + hazard on the counterweight
    const band = new THREE.ExtrudeGeometry(cw, { depth: 0.12, bevelEnabled: false, curveSegments: 18 });
    band.rotateX(Math.PI / 2); band.scale(1.01, 1, 1.01); band.translate(0, 0.3, 0);
    this.mesh(band, M.blackPaint, U);
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.22), M.hazard); hz.position.set(0, 0.48, -2.31); hz.rotation.y = Math.PI; U.add(hz);
    for (const s of [-1, 1]) {
      const lamp = this.mesh(box(0.16, 0.08, 0.04, s * 0.6, 0.48, -2.27), M.redLens, U, false);
    }
    // engine hood (chamfered profile extruded across the width)
    const hood = new THREE.Shape();
    hood.moveTo(-1.18, 0.2); hood.lineTo(-1.18, 1.1); hood.lineTo(-1.08, 1.24); hood.lineTo(-0.2, 1.24); hood.lineTo(-0.1, 1.12); hood.lineTo(-0.1, 0.2); hood.closePath();
    const hg = new THREE.ExtrudeGeometry(hood, { depth: 2.46, bevelEnabled: false });
    hg.rotateY(Math.PI / 2); hg.translate(-1.23, 0, 0);
    this.mesh(hg, M.paintYellow, U);
    // hood louvres, seams, handles
    const louv = [];
    for (let i = 0; i < 9; i++) louv.push(box(0.9, 0.025, 0.07, 0.55, 1.255, -1.0 + i * 0.09));
    for (let i = 0; i < 6; i++) louv.push(box(0.02, 0.06, 0.8, 1.235, 0.5 + i * 0.09, -0.65));
    this.mesh(merge(louv), M.blackPaint, U, false);
    this.mesh(merge([box(0.012, 0.85, 0.012, 1.236, 0.66, -0.15), box(0.012, 0.85, 0.012, 1.236, 0.66, -1.12), box(0.012, 0.85, 0.012, -1.236, 0.66, -0.6)]), M.blackPaint, U, false);
    // exhaust stack + air cleaner
    this.mesh(merge([cyl(0.075, 0.075, 0.5, 14, -0.75, 1.48, -0.9), cyl(0.085, 0.08, 0.06, 14, -0.75, 1.75, -0.9)]), M.blackPaint, U);
    this.mesh(cyl(0.12, 0.12, 0.28, 16, 0.6, 1.36, -0.5), M.blackPlastic, U);
    // hand rails on the hood
    const rails = [];
    for (const s of [-1, 1]) {
      rails.push(tube(new THREE.Vector3(s * 1.15, 1.24, -0.2), new THREE.Vector3(s * 1.15, 1.6, -0.25), 0.02));
      rails.push(tube(new THREE.Vector3(s * 1.15, 1.24, -1.1), new THREE.Vector3(s * 1.15, 1.6, -1.05), 0.02));
      rails.push(tube(new THREE.Vector3(s * 1.15, 1.6, -0.25), new THREE.Vector3(s * 1.15, 1.6, -1.05), 0.02));
    }
    this.mesh(merge(rails), M.paintYellow, U);
    // right-front tool box / tank housing
    const tb = new THREE.Shape();
    tb.moveTo(-0.48, -0.1); tb.lineTo(-1.25, -0.1); tb.lineTo(-1.25, 1.25); tb.quadraticCurveTo(-1.22, 1.45, -1.0, 1.48); tb.lineTo(-0.48, 1.48); tb.closePath();
    const tbg = new THREE.ExtrudeGeometry(tb, { depth: 0.82, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    tbg.rotateX(Math.PI / 2); tbg.translate(0, 1.02, 0);
    this.mesh(tbg, M.paintYellow, U);
    this.mesh(merge([box(0.012, 0.6, 1.2, -1.282, 0.6, 0.65), box(0.08, 0.03, 0.12, -1.29, 0.75, 0.2)]), M.blackPaint, U, false);
    // access steps
    this.mesh(merge([box(0.3, 0.04, 0.4, -1.38, 0.35, 1.0), box(0.3, 0.04, 0.4, -1.38, 0.0, 1.0)]), M.tread, U);
    // boom foot brackets
    this.mesh(merge([box(0.12, 0.9, 0.9, 0.1, 0.55, 1.05), box(0.12, 0.9, 0.9, -0.52, 0.55, 1.05), cyl(0.09, 0.09, 0.85, 14, -0.21, 0.78, 1.28, null, 0, 0, Math.PI / 2)]), M.paintYellow, U);
    // decals
    const brand = (txt, w, h, pos, rotY, parent, sub = null, col = '#15171a') => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: T.labelTexture(txt, { w: 1024, h: Math.round(1024 * h / w), color: col, font: `900 ${Math.round(1024 * h / w * 0.7)}px Arial`, sub }), transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.copy(pos); m.rotation.y = rotY; parent.add(m); return m;
    };
    brand('TX330', 0.7, 0.2, new THREE.Vector3(1.256, 0.95, -0.7), Math.PI / 2, U);
    brand('TX330', 0.7, 0.2, new THREE.Vector3(-1.256, 0.95, -0.7), -Math.PI / 2, U);
    const cwDecal = brand('TORVA', 1.1, 0.3, new THREE.Vector3(0, 0.88, -2.31), Math.PI, U);

    // ---------------- cab ----------------
    const cab = new THREE.Group(); cab.position.set(0.76, 0.2, 0.6); U.add(cab);
    this.cab = cab;
    const cw2 = 0.98, ch = 1.72, cd = 1.85; // width, height, depth (z from -0.75 to +1.1)
    const zf = 0.95, zb = -0.85;
    // floor + rear wall + roof
    this.mesh(box(cw2, 0.08, cd, 0, 0.04, (zf + zb) / 2), M.blackPaint, cab);
    this.mesh(box(cw2, ch, 0.06, 0, ch / 2, zb), M.blackPaint, cab);
    const roof = new THREE.Shape(); roof.moveTo(-cw2 / 2 - 0.03, zb - 0.03); roof.lineTo(cw2 / 2 + 0.03, zb - 0.03); roof.lineTo(cw2 / 2 + 0.03, zf + 0.05); roof.lineTo(-cw2 / 2 - 0.03, zf + 0.05); roof.closePath();
    const rg = new THREE.ExtrudeGeometry(roof, { depth: 0.07, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    rg.rotateX(Math.PI / 2); rg.translate(0, ch + 0.07, 0);
    this.mesh(rg, M.blackPaint, cab);
    // pillars
    const pil = [];
    const ptop = ch, pfront = zf;
    for (const s of [-1, 1]) {
      pil.push(box(0.07, ch, 0.07, s * (cw2 / 2 - 0.035), ch / 2, zb + 0.04));
      pil.push(tube(new THREE.Vector3(s * (cw2 / 2 - 0.035), 0.0, pfront - 0.05), new THREE.Vector3(s * (cw2 / 2 - 0.035), ptop, pfront - 0.2), 0.04, 6));
      pil.push(box(0.06, ch, 0.06, s * (cw2 / 2 - 0.03), ch / 2, -0.05));
      pil.push(box(0.06, 0.06, cd, s * (cw2 / 2 - 0.03), 0.62, (zf + zb) / 2));
    }
    pil.push(box(cw2, 0.07, 0.07, 0, 0.62, zf - 0.08));
    this.mesh(merge(pil), M.blackPaint, cab);
    // glass
    const gl = M.cabGlass;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(cw2 - 0.08, ch - 0.68), gl);
    front.position.set(0, 0.62 + (ch - 0.62) / 2, zf - 0.13); front.rotation.x = -0.09; cab.add(front);
    const lowFront = new THREE.Mesh(new THREE.PlaneGeometry(cw2 - 0.08, 0.55), gl); lowFront.position.set(0, 0.32, zf - 0.04); cab.add(lowFront);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(cd - 0.15, ch - 0.1), gl);
      side.rotation.y = Math.PI / 2; side.position.set(s * (cw2 / 2 - 0.01), ch / 2 + 0.02, (zf + zb) / 2 - 0.05); cab.add(side);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(cw2 - 0.2, 0.55), gl); back.position.set(0, ch - 0.45, zb + 0.035); back.rotation.y = Math.PI; cab.add(back);
    // door handle, wiper, mirrors, lights
    this.mesh(box(0.03, 0.03, 0.14, cw2 / 2 + 0.02, 0.95, 0.3), M.chrome, cab, false);
    this.mesh(merge([box(0.01, 0.02, 0.75, 0, 0, 0), box(0.012, 0.012, 0.3, 0, 0, 0.0)]).rotateX(Math.PI / 2).rotateZ(0.4).translate(0.05, 1.2, zf - 0.11), M.blackPlastic, cab, false);
    this.mesh(merge([tube(new THREE.Vector3(cw2 / 2, 1.0, zf - 0.05), new THREE.Vector3(cw2 / 2 + 0.25, 1.35, zf + 0.05), 0.015), box(0.03, 0.22, 0.14, cw2 / 2 + 0.27, 1.42, zf + 0.06)]), M.blackPaint, cab, false);
    this.mesh(merge([box(0.18, 0.12, 0.08, 0.3, ch + 0.16, zf - 0.05), box(0.18, 0.12, 0.08, -0.3, ch + 0.16, zf - 0.05)]), M.blackPaint, cab, false);
    this.mesh(merge([box(0.15, 0.09, 0.01, 0.3, ch + 0.16, zf - 0.005), box(0.15, 0.09, 0.01, -0.3, ch + 0.16, zf - 0.005)]), M.lightLens, cab, false);
    this.mesh(merge([cyl(0.05, 0.06, 0.04, 12, -0.3, ch + 0.13, zb + 0.2), cyl(0.045, 0.045, 0.1, 12, -0.3, ch + 0.2, zb + 0.2)]), M.amberLens, cab, false);
    // interior: seat, consoles, joysticks, monitor
    const seat = merge([box(0.5, 0.12, 0.5, 0, 0.5, -0.25), box(0.5, 0.65, 0.12, 0, 0.85, -0.5, null, -0.15), box(0.34, 0.18, 0.1, 0, 1.25, -0.56, null, -0.15), box(0.3, 0.3, 0.3, 0, 0.3, -0.25)]);
    this.mesh(seat, M.seat, cab, false);
    this.mesh(merge([box(0.16, 0.12, 0.55, -0.33, 0.62, -0.15), box(0.16, 0.12, 0.55, 0.33, 0.62, -0.15)]), M.blackPlastic, cab, false);
    this.joyL = this.mesh(merge([cyl(0.015, 0.02, 0.18, 8, 0, 0.09, 0), cyl(0.03, 0.03, 0.08, 10, 0, 0.2, 0)]), M.blackPlastic, cab, false);
    this.joyL.position.set(-0.33, 0.68, 0.02);
    this.joyR = this.joyL.clone(); this.joyR.position.x = 0.33; cab.add(this.joyR);
    this.mesh(merge([box(0.03, 0.4, 0.03, -0.1, 0.25, 0.55), box(0.03, 0.4, 0.03, 0.1, 0.25, 0.55), box(0.4, 0.06, 0.12, 0, 0.5, 0.55)]), M.blackPlastic, cab, false);
    this.mesh(box(0.22, 0.15, 0.04, -0.38, 1.0, 0.45, null, -0.3, 0.5), M.blackPlastic, cab, false);
    this.mesh(box(0.18, 0.11, 0.005, -0.37, 1.0, 0.47, null, -0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0x3a8ad0 }), cab, false);
    // driver (simple figure so the cab doesn't look empty)
    this.driver = new THREE.Group(); cab.add(this.driver);
    this.mesh(merge([box(0.36, 0.48, 0.24, 0, 0.92, -0.3), box(0.34, 0.16, 0.5, 0, 0.62, -0.08)]), M.hiVis, this.driver, false);
    this.mesh(new THREE.SphereGeometry(0.11, 14, 12).translate(0, 1.3, -0.3), M.skin, this.driver, false);
    this.mesh(new THREE.SphereGeometry(0.125, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.33, -0.3), M.hardhat, this.driver, false);
    this.driver.visible = false;

    // ---------------- boom ----------------
    this.boomG = new THREE.Group(); this.boomG.position.set(-0.21, 0.78, 1.28); U.add(this.boomG);
    const bs = new THREE.Shape();
    bs.moveTo(-0.32, -0.15);
    bs.quadraticCurveTo(-0.38, 0.28, 0.05, 0.36);
    bs.lineTo(1.2, 0.86);
    bs.quadraticCurveTo(2.6, 1.72, 3.2, 1.38);
    bs.lineTo(5.55, 0.32);
    bs.quadraticCurveTo(5.95, 0.12, 5.8, -0.2);
    bs.quadraticCurveTo(5.62, -0.36, 5.3, -0.2);
    bs.lineTo(3.1, 0.78);
    bs.quadraticCurveTo(2.55, 0.98, 2.1, 0.66);
    bs.lineTo(0.5, -0.24);
    bs.quadraticCurveTo(0.0, -0.45, -0.32, -0.15);
    const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.5, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 3, curveSegments: 16 });
    bg.rotateY(-Math.PI / 2); bg.translate(0.25, 0, 0);
    this.mesh(bg, M.paintYellow, this.boomG);
    // pins + lugs
    this.mesh(merge([cyl(0.08, 0.08, 0.66, 14, 0, 0, 0, null, 0, 0, Math.PI / 2), cyl(0.07, 0.07, 0.66, 14, 0, 0, 5.6, null, 0, 0, Math.PI / 2), cyl(0.06, 0.06, 0.62, 12, 0, 1.75, 2.75, null, 0, 0, Math.PI / 2)]), M.steel, this.boomG);
    this.mesh(merge([box(0.08, 0.36, 0.42, -0.2, 0.38, 2.15, null, 0.5), box(0.08, 0.36, 0.42, 0.2, 0.38, 2.15, null, 0.5), box(0.36, 0.3, 0.12, 0, 1.62, 2.72)]), M.paintYellow, this.boomG);
    brand('TORVA', 1.1, 0.3, new THREE.Vector3(0.287, 0.95, 1.7), Math.PI / 2, this.boomG).rotation.x = 0;
    brand('TORVA', 1.1, 0.3, new THREE.Vector3(-0.287, 0.95, 1.7), -Math.PI / 2, this.boomG);
    this.boomG.children[this.boomG.children.length - 1].rotation.z = 0;
    // boom work light
    this.mesh(merge([box(0.18, 0.13, 0.1, 0.32, 1.25, 1.6)]), M.blackPaint, this.boomG, false);
    this.mesh(box(0.15, 0.1, 0.01, 0.32, 1.25, 1.655), M.lightLens, this.boomG, false);
    // hoses running along the boom top
    const hoseMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55 });
    for (const x of [-0.12, 0.12]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.4, 0.1), new THREE.Vector3(x, 0.95, 1.2), new THREE.Vector3(x, 1.62, 2.6), new THREE.Vector3(x, 1.05, 4.3), new THREE.Vector3(x, 0.45, 5.5)]);
      this.mesh(new THREE.TubeGeometry(curve, 40, 0.025, 6), hoseMat, this.boomG, false);
    }

    // ---------------- stick ----------------
    this.stickG = new THREE.Group(); this.stickG.position.set(0, 0, 5.6); this.boomG.add(this.stickG);
    const ss = new THREE.Shape();
    ss.moveTo(-0.72, 0.42); ss.lineTo(-0.45, 0.6); ss.lineTo(0.35, 0.36); ss.lineTo(2.85, 0.16); ss.quadraticCurveTo(3.15, 0.0, 2.95, -0.16); ss.lineTo(0.4, -0.26); ss.quadraticCurveTo(-0.1, -0.3, -0.25, -0.05); ss.lineTo(-0.72, 0.25); ss.closePath();
    const sg = new THREE.ExtrudeGeometry(ss, { depth: 0.4, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 10 });
    sg.rotateY(-Math.PI / 2); sg.translate(0.2, 0, 0);
    this.mesh(sg, M.paintYellow, this.stickG);
    this.mesh(merge([cyl(0.065, 0.065, 0.56, 12, 0, 0.0, 2.92, null, 0, 0, Math.PI / 2), cyl(0.06, 0.06, 0.52, 12, 0, 0.5, -0.6, null, 0, 0, Math.PI / 2)]), M.steel, this.stickG);
    this.mesh(merge([box(0.3, 0.16, 0.24, 0, 0.42, 0.45)]), M.paintYellow, this.stickG);
    for (const x of [-0.1, 0.1]) {
      const c2 = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.45, -0.2), new THREE.Vector3(x, 0.35, 1.4), new THREE.Vector3(x, 0.22, 2.7)]);
      this.mesh(new THREE.TubeGeometry(c2, 20, 0.022, 6), hoseMat, this.stickG, false);
    }

    // ---------------- grapple attachment ----------------
    this.attach = new THREE.Group(); this.attach.position.set(0, 0, 2.92); this.stickG.add(this.attach);
    const A = this.attach;
    this.mesh(merge([box(0.5, 0.42, 0.55, 0, 0.0, 0.35), box(0.56, 0.08, 0.6, 0, 0.24, 0.35), cyl(0.3, 0.3, 0.12, 24, 0, 0, 0.66, null, Math.PI / 2)]), M.paintYellow, A);
    this.mesh(merge([box(0.08, 0.3, 0.3, -0.16, 0.25, 0.05), box(0.08, 0.3, 0.3, 0.16, 0.25, 0.05)]), M.paintYellow, A);
    this.mesh(cyl(0.18, 0.2, 0.14, 20, 0, 0, 0.78, null, Math.PI / 2), M.darkSteel, A);
    this.mesh(cyl(0.07, 0.07, 0.62, 12, 0, 0, 0.92, null, 0, 0, Math.PI / 2), M.steel, A);
    // jaws
    const tineShape = (flip) => {
      const t = new THREE.Shape();
      const f = flip ? -1 : 1;
      const P = (u, v) => [u, v * f];
      t.moveTo(...P(0, -0.04)); t.quadraticCurveTo(...P(0.25, 0.38), ...P(0.75, 0.42)); t.quadraticCurveTo(...P(1.25, 0.38), ...P(1.42, -0.06));
      t.lineTo(...P(1.36, -0.16)); t.quadraticCurveTo(...P(1.12, 0.12), ...P(0.72, 0.2)); t.quadraticCurveTo(...P(0.3, 0.2), ...P(0.08, -0.12)); t.closePath();
      const g = new THREE.ExtrudeGeometry(t, { depth: 0.07, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 10 });
      g.rotateY(-Math.PI / 2); g.translate(0.035, 0, 0);
      return g;
    };
    this.jawA = new THREE.Group(); this.jawA.position.set(0, 0.05, 0.92); A.add(this.jawA);
    this.jawB = new THREE.Group(); this.jawB.position.set(0, -0.05, 0.92); A.add(this.jawB);
    const ta = [], tb2 = [], teethA = [], teethB = [];
    for (const x of [-0.22, 0, 0.22]) { ta.push(tineShape(false).translate(x, 0, 0)); teethA.push(box(0.09, 0.08, 0.12, x, -0.08, 1.4, null, 0.6)); }
    for (const x of [-0.11, 0.11]) { tb2.push(tineShape(true).translate(x, 0, 0)); teethB.push(box(0.09, 0.08, 0.12, x, 0.08, 1.4, null, -0.6)); }
    ta.push(cyl(0.05, 0.05, 0.55, 10, 0, 0.3, 0.55, null, 0, 0, Math.PI / 2), box(0.52, 0.12, 0.22, 0, 0.12, 0.12));
    tb2.push(cyl(0.05, 0.05, 0.33, 10, 0, -0.3, 0.55, null, 0, 0, Math.PI / 2), box(0.3, 0.12, 0.22, 0, -0.12, 0.12));
    this.mesh(merge(ta), M.blackPaint, this.jawA);
    this.mesh(merge(tb2), M.blackPaint, this.jawB);
    this.mesh(merge(teethA), M.steel, this.jawA);
    this.mesh(merge(teethB), M.steel, this.jawB);
    // jaw cylinder inside head (visual)
    this.grabPoint = new THREE.Object3D(); this.grabPoint.position.set(0, 0, 1.75); A.add(this.grabPoint);

    // probe points used for knocking walls down
    for (const [obj, p] of [[this.jawA, [0, -0.1, 1.38]], [this.jawB, [0, 0.1, 1.38]], [A, [0, 0, 0.5]], [this.jawA, [0, 0.35, 0.75]], [this.jawB, [0, -0.35, 0.75]], [this.stickG, [0, 0, 2.2]], [this.stickG, [0, 0.4, -0.4]]]) {
      const o = new THREE.Object3D(); o.position.set(...p); obj.add(o); this.probes.push(o);
    }

    // ---------------- hydraulic cylinders ----------------
    const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
    for (const s of [-1, 1]) this.addCylinder(anchor(U, -0.21 + s * 0.36, 0.42, 1.95), anchor(this.boomG, s * 0.36, 0.3, 2.15), 0.11, 0.065);
    this.addCylinder(anchor(this.boomG, 0, 1.78, 2.75), anchor(this.stickG, 0, 0.5, -0.6), 0.1, 0.06);
    this.addCylinder(anchor(this.stickG, 0, 0.5, 0.45), anchor(A, 0, 0.32, 0.05), 0.085, 0.05);
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
      const rl = len - bl * 0.75;
      c.rod.position.copy(pb); c.rod.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(up, d.clone().negate())); c.rod.scale.set(1, Math.max(0.1, rl + 0.05), 1);
      c.eye.position.copy(pb); c.eye.quaternion.copy(q);
    }
  }

  pose() {
    this.root.rotation.y = this.yaw;
    this.upper.rotation.y = this.swing;
    this.boomG.rotation.x = this.boom;
    this.stickG.rotation.x = this.stickA;
    this.attach.rotation.x = this.curl;
    const o = this.open;
    this.jawA.rotation.x = -o * 0.75 + 0.08;
    this.jawB.rotation.x = o * 0.75 - 0.08;
    this.root.updateMatrixWorld(true);
    this.updateCylinders();
  }

  // ---------------- physics ----------------
  buildPhysics() {
    const W = this.world;
    const mk = (obj, boxes) => {
      const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      for (const [x, y, z, sx, sy, sz, rx = 0] of boxes) {
        W.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(x, y, z).setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0))).setFriction(1.0), body);
      }
      this.bodies.push({ obj, body });
      return body;
    };
    mk(this.under, [[-1.19, 0.58, 0, 0.62, 0.8, 4.45], [1.19, 0.58, 0, 0.62, 0.8, 4.45], [0, 0.7, 0, 1.8, 0.6, 1.8]]);
    mk(this.upper, [[0, 0.65, -0.55, 2.5, 1.1, 3.1], [0.76, 1.1, 0.65, 1.0, 1.8, 1.9], [-0.86, 0.6, 0.7, 0.8, 1.0, 1.6]]);
    mk(this.boomG, [[0, 0.55, 1.4, 0.5, 0.6, 2.8, -0.38], [0, 0.85, 4.3, 0.5, 0.5, 2.8, 0.42]]);
    mk(this.stickG, [[0, 0.1, 1.2, 0.4, 0.45, 3.4]]);
    mk(this.attach, [[0, 0, 0.45, 0.55, 0.45, 0.8]]);
    mk(this.jawA, [[0, 0.25, 0.75, 0.55, 0.2, 1.0], [0, 0.0, 1.32, 0.55, 0.2, 0.2]]);
    mk(this.jawB, [[0, -0.25, 0.75, 0.35, 0.2, 1.0], [0, 0.0, 1.32, 0.35, 0.2, 0.2]]);
    // shapes used to test whether the machine may drive into something
    this.blockShapes = [
      { obj: this.under, shape: new RAPIER.Cuboid(0.31, 0.38, 2.2), off: new THREE.Vector3(-1.19, 0.6, 0) },
      { obj: this.under, shape: new RAPIER.Cuboid(0.31, 0.38, 2.2), off: new THREE.Vector3(1.19, 0.6, 0) },
      { obj: this.upper, shape: new RAPIER.Cuboid(1.22, 0.55, 1.5), off: new THREE.Vector3(0, 0.75, -0.55) },
    ];
  }

  syncBodies(teleport = false) {
    for (const { obj, body } of this.bodies) {
      obj.getWorldPosition(_v); obj.getWorldQuaternion(_q);
      if (teleport) { body.setTranslation(_v, true); body.setRotation(_q, true); }
      else { body.setNextKinematicTranslation(_v); body.setNextKinematicRotation(_q); }
    }
  }

  blocked(demo) {
    for (const b of this.blockShapes) {
      const p = b.off.clone().applyMatrix4(b.obj.matrixWorld);
      const q = b.obj.getWorldQuaternion(new THREE.Quaternion());
      let hit = false;
      this.world.intersectionsWithShape(p, q, b.shape, (c) => {
        if (c.parent() && this.bodies.some((x) => x.body.handle === c.parent().handle)) return true;
        hit = true; return false;
      }, RAPIER.QueryFilterFlags.ONLY_FIXED);
      if (hit) return true;
    }
    return false;
  }

  // ---------------- control ----------------
  update(dt, ctl, demo, fx, audio) {
    // ctl: {drive, steer, swing, boom, stick, curl, grabToggle}
    const active = !!ctl;
    const c = ctl || { drive: 0, steer: 0, swing: 0, boom: 0, stick: 0, curl: 0 };
    this.running = active || this.rpm > 0.05;
    const prev = { pos: this.root.position.clone(), yaw: this.yaw, swing: this.swing };
    // tracks
    const targetV = c.drive * 2.6, targetW = -c.steer * 0.75;
    this.speed += (targetV - this.speed) * Math.min(1, dt * 2.5);
    this.turn += (targetW - this.turn) * Math.min(1, dt * 3);
    this.yaw += this.turn * dt;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.root.position.addScaledVector(fwd, this.speed * dt);
    this.swing += c.swing * dt * 0.7;
    // arm
    this.boom = clamp(this.boom + c.boom * dt * 0.55, -0.95, 0.62);
    this.stickA = clamp(this.stickA + c.stick * dt * 0.75, 0.35, 2.55);
    this.curl = clamp(this.curl + c.curl * dt * 1.1, -0.7, 2.0);
    this.pose();
    if (this.blocked(demo)) {
      this.root.position.copy(prev.pos); this.yaw = prev.yaw; this.swing = prev.swing; this.speed *= -0.2;
      this.pose();
    }
    const dl = this.speed * dt + this.turn * dt * 1.19, dr = this.speed * dt - this.turn * dt * 1.19;
    if (Math.abs(dl) > 1e-5 || Math.abs(dr) > 1e-5) { this.tracks[0].move(dr); this.tracks[1].move(dl); }
    // grapple
    if (c.grabToggle) this.openTarget = this.openTarget > 0.5 ? 0 : 1;
    const prevOpen = this.open;
    this.open += Math.sign(this.openTarget - this.open) * Math.min(Math.abs(this.openTarget - this.open), dt * 1.8);
    this.pose();
    const motion = Math.abs(c.drive) + Math.abs(c.steer) + Math.abs(c.swing) + Math.abs(c.boom) + Math.abs(c.stick) + Math.abs(c.curl) + Math.abs(this.open - prevOpen) * 10;
    this.hyd += (Math.min(1, motion) - this.hyd) * Math.min(1, dt * 5);
    this.rpm += ((active ? 0.35 + this.hyd * 0.65 : 0) - this.rpm) * Math.min(1, dt * (active ? 2 : 0.6));
    if (this.joyL) { this.joyL.rotation.set(c.boom * 0.3, 0, -c.swing * 0.3); this.joyR.rotation.set(c.stick * 0.3, 0, -c.curl * 0.3); }

    // grab when jaws are closing
    const gp = this.grabPoint.getWorldPosition(new THREE.Vector3());
    if (this.openTarget === 0 && prevOpen > 0.4 && this.open <= 0.4) this.grab(demo, gp, fx, audio);
    if (this.openTarget === 1 && this.held.length && this.open > 0.3) this.releaseAll(demo, dt);

    // move held pieces
    const am = this.attach.matrixWorld;
    for (const h of this.held) {
      _m.multiplyMatrices(am, h.local);
      _m.decompose(_v, _q, _v2);
      h.p.body.setNextKinematicTranslation(_v);
      h.p.body.setNextKinematicRotation(_q);
      h.p.pos.copy(_v); h.p.quat.copy(_q);
    }

    // knock down walls with the tines / stick
    this.probes.forEach((o, i) => {
      const now = o.getWorldPosition(new THREE.Vector3());
      const vel = now.clone().sub(this.prevProbe[i]).divideScalar(Math.max(dt, 1e-3));
      if (vel.length() > 0.35) {
        const hits = demo.breakSphere(now, i < 2 ? 0.3 : 0.38, vel.clone().clampLength(0, 4).multiplyScalar(0.8), 6);
        if (hits.length) this.hyd = 1;
      }
      this.prevProbe[i].copy(now);
    });

    this.syncBodies();
  }

  grab(demo, gp, fx, audio) {
    const room = this.capacity - this.held.length;
    if (room <= 0) return;
    const cand = demo.piecesInSphere(gp, 1.35, [LOOSE]);
    // also rip intact pieces out of walls
    const intact = demo.piecesInSphere(gp, 0.85, [INTACT]);
    const all = [...cand, ...intact].sort((a, b) => a.pos.distanceToSquared(gp) - b.pos.distanceToSquared(gp)).slice(0, room);
    const inv = new THREE.Matrix4().copy(this.attach.matrixWorld).invert();
    for (const p of all) {
      if (!demo.hold(p)) continue;
      const pm = new THREE.Matrix4().compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1));
      const local = new THREE.Matrix4().multiplyMatrices(inv, pm);
      // squeeze towards the jaw centreline
      const lp = new THREE.Vector3().setFromMatrixPosition(local);
      lp.y *= 0.45; lp.x *= 0.8; lp.z = THREE.MathUtils.lerp(lp.z, 1.45, 0.35);
      local.setPosition(lp);
      this.held.push({ p, local });
    }
    if (all.length) { audio.impact(all[0].type.sound, 0.8, gp); fx.dust(gp, all[0].type.dust, 4, 0.8); }
  }

  releaseAll(demo, dt) {
    const gp = this.grabPoint.getWorldPosition(new THREE.Vector3());
    const vel = gp.clone().sub(this.lastGp || gp).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 6);
    for (const h of this.held) demo.release(h.p, vel);
    this.held = [];
  }

  dropHeldOnReset() { this.held = []; }

  // positions used by player interaction / cameras
  doorWorld() { return this.cab.localToWorld(new THREE.Vector3(0.75, 0.0, 0.25)); }
  seatWorld() { return this.cab.localToWorld(new THREE.Vector3(0, 1.32, -0.15)); }
  afterUpdate() { this.lastGp = this.grabPoint.getWorldPosition(new THREE.Vector3()); }
}
