// Pan mixer that turns crushed dust + lake water into cement. The contents are rendered with a shader that
// swirls each poured colour batch around the tub and gradually blends them into one mixed colour.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from './textures.js';
import { box, cyl, merge } from './pieces.js';
import { tube, fmtKg } from './crusher.js';

const R_TUB = 1.3, FLOOR = 1.42, DEPTH = 0.95;
const WATER = new THREE.Color(0x4a7d8c);

export class Mixer {
  constructor(scene, physics, M, pos) {
    this.scene = scene; this.physics = physics; this.M = M;
    this.root = new THREE.Group(); this.root.position.copy(pos); scene.add(this.root);
    this.colliders = [];
    // state
    this.dust = 0; this.dustCol = new THREE.Color(0.5, 0.5, 0.5);
    this.water = 0;
    this.cement = 0; this.cementCol = new THREE.Color(0.6, 0.6, 0.6);
    this.batches = [];      // {c, kg} for the swirl
    this.progress = 0; this.status = 'Empty'; this.spin = 0; this.speed = 0;
    this.build();
    this.buildPhysics();
    this.refresh();
  }

  add(geo, mat, parent = this.root, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
  col(x, y, z, sx, sy, sz) { this.colliders.push([x, y, z, sx, sy, sz]); }

  build() {
    const M = this.M;
    const frameMat = M.galvanized, deckY = 1.3;
    const tubMat = new THREE.MeshPhysicalMaterial({ color: 0x1d5aa6, roughness: 0.42, metalness: 0.2, clearcoat: 0.4 });
    // legs + bracing
    const legs = [];
    for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) { legs.push(box(0.16, deckY, 0.16, x, deckY / 2, z), box(0.4, 0.04, 0.4, x, 0.02, z)); }
    for (const s of [-1, 1]) {
      legs.push(tube(new THREE.Vector3(-1.8, 0.2, s * 1.8), new THREE.Vector3(1.8, deckY - 0.15, s * 1.8), 0.035));
      legs.push(tube(new THREE.Vector3(s * 1.8, 0.2, -1.8), new THREE.Vector3(s * 1.8, deckY - 0.15, 1.8), 0.035));
    }
    this.add(merge(legs), frameMat);
    this.add(box(4.0, 0.08, 4.0, 0, deckY, 0), M.tread);
    this.add(merge([box(4.1, 0.16, 0.12, 0, deckY - 0.1, 2.0), box(4.1, 0.16, 0.12, 0, deckY - 0.1, -2.0), box(0.12, 0.16, 4.1, 2.0, deckY - 0.1, 0), box(0.12, 0.16, 4.1, -2.0, deckY - 0.1, 0)]), tubMat);
    this.col(0, deckY - 0.05, 0, 4.0, 0.2, 4.0);
    for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) this.col(x, deckY / 2, z, 0.18, deckY, 0.18);
    // tub
    const outer = new THREE.CylinderGeometry(R_TUB + 0.03, R_TUB + 0.03, DEPTH + 0.05, 48, 1, true);
    outer.translate(0, FLOOR + DEPTH / 2 - 0.02, 0);
    this.add(outer, tubMat);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(R_TUB, R_TUB, DEPTH, 48, 1, true).translate(0, FLOOR + DEPTH / 2, 0), new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.55, metalness: 0.6, side: THREE.BackSide }));
    inner.receiveShadow = true; this.root.add(inner);
    this.add(cyl(R_TUB, R_TUB, 0.04, 48, 0, FLOOR - 0.02, 0), M.darkSteel);
    const rim = new THREE.TorusGeometry(R_TUB + 0.02, 0.05, 8, 48); rim.rotateX(Math.PI / 2); rim.translate(0, FLOOR + DEPTH, 0);
    this.add(rim, tubMat);
    const ribs = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ribs.push(box(0.06, DEPTH, 0.1, Math.cos(a) * (R_TUB + 0.07), FLOOR + DEPTH / 2, Math.sin(a) * (R_TUB + 0.07), null, 0, -a, 0)); }
    ribs.push(new THREE.CylinderGeometry(R_TUB + 0.06, R_TUB + 0.06, 0.08, 48, 1, true).translate(0, FLOOR + 0.25, 0));
    this.add(merge(ribs), tubMat);
    // tub wall colliders (ring of boxes)
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      this.colliders.push([Math.cos(a) * (R_TUB + 0.03), FLOOR + DEPTH / 2, Math.sin(a) * (R_TUB + 0.03), 0.1, DEPTH, 0.85, -a]);
    }
    // contents surface
    this.contents = new THREE.Mesh(new THREE.CircleGeometry(R_TUB - 0.01, 64).rotateX(-Math.PI / 2), this.contentMaterial());
    this.contents.receiveShadow = true;
    this.root.add(this.contents);
    // bridge beam, gearbox, motor, shaft and paddles
    this.add(merge([box(0.24, 0.3, 3.0, 0, FLOOR + DEPTH + 0.35, 0), box(0.5, 0.5, 0.18, 0, FLOOR + DEPTH + 0.05, 1.45), box(0.5, 0.5, 0.18, 0, FLOOR + DEPTH + 0.05, -1.45)]), tubMat);
    this.add(merge([box(0.62, 0.42, 0.62, 0, FLOOR + DEPTH + 0.72, 0), cyl(0.2, 0.2, 0.55, 18, 0.55, FLOOR + DEPTH + 0.72, 0, null, 0, 0, Math.PI / 2), box(0.2, 0.3, 0.3, 0.9, FLOOR + DEPTH + 0.72, 0)]), M.paintGrey);
    const fins = []; for (let k = 0; k < 6; k++) fins.push(box(0.5, 0.012, 0.42, 0.58, FLOOR + DEPTH + 0.55 + k * 0.06, 0));
    this.add(merge(fins), M.darkSteel);
    this.rotor = new THREE.Group(); this.rotor.position.y = FLOOR; this.root.add(this.rotor);
    const blades = [cyl(0.07, 0.07, DEPTH + 0.6, 12, 0, (DEPTH + 0.6) / 2, 0)];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const arm = box(1.1, 0.06, 0.08, 0.6, 0.18, 0); arm.rotateY(a); blades.push(arm);
      const bl = box(0.28, 0.22, 0.03, 1.05, 0.14, 0, null, 0, 0.6, 0); bl.rotateY(a); blades.push(bl);
      const bl2 = box(0.22, 0.18, 0.03, 0.5, 0.14, 0, null, 0, -0.6, 0); bl2.rotateY(a + 0.5); blades.push(bl2);
    }
    this.add(merge(blades), M.steel, this.rotor);
    // water inlet pipe with valve (north side) and dust funnel (east side)
    this.add(merge([cyl(0.06, 0.06, 1.6, 12, -0.6, FLOOR + DEPTH + 0.2, -1.6, null, 0, 0, Math.PI / 2), cyl(0.06, 0.06, 0.5, 12, 0.2, FLOOR + DEPTH + 0.0, -1.3), cyl(0.09, 0.09, 0.12, 12, -0.8, FLOOR + DEPTH + 0.2, -1.6, null, 0, 0, Math.PI / 2)]), M.galvanized);
    this.add(merge([cyl(0.12, 0.12, 0.05, 6, -0.8, FLOOR + DEPTH + 0.36, -1.6), cyl(0.012, 0.012, 0.14, 6, -0.8, FLOOR + DEPTH + 0.29, -1.6)]), M.paintRed);
    const funnel = new THREE.CylinderGeometry(0.7, 0.18, 0.7, 24, 1, true); funnel.translate(1.25, FLOOR + DEPTH + 0.55, 0);
    this.add(funnel, new THREE.MeshStandardMaterial({ color: 0x1d5aa6, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }));
    this.add(tube(new THREE.Vector3(1.25, FLOOR + DEPTH + 0.2, 0), new THREE.Vector3(0.95, FLOOR + DEPTH - 0.05, 0), 0.15), M.darkSteel);
    // discharge gate + chute (south side)
    this.add(box(0.5, 0.35, 0.12, 0, FLOOR + 0.18, R_TUB + 0.09), M.darkSteel);
    const chute = new THREE.Group(); chute.position.set(0, FLOOR + 0.05, R_TUB + 0.15); chute.rotation.x = 0.55; this.root.add(chute);
    this.add(merge([box(0.5, 0.03, 1.3, 0, 0, 0.65), box(0.03, 0.16, 1.3, -0.25, 0.08, 0.65), box(0.03, 0.16, 1.3, 0.25, 0.08, 0.65)]), M.galvanized, chute);
    // railings + stairs (west side)
    const rails = [];
    const post = (x, z) => rails.push(cyl(0.025, 0.025, 1.05, 8, x, deckY + 0.52, z));
    for (const z of [-1.95, -0.65, 0.65, 1.95]) { post(1.95, z); }
    for (const x of [-1.95, -0.65, 0.65, 1.95]) { post(x, -1.95); post(x, 1.95); }
    rails.push(cyl(0.025, 0.025, 3.9, 8, 1.95, deckY + 1.05, 0, null, Math.PI / 2), cyl(0.025, 0.025, 3.9, 8, 0, deckY + 1.05, -1.95, null, 0, 0, Math.PI / 2), cyl(0.025, 0.025, 3.9, 8, 0, deckY + 1.05, 1.95, null, 0, 0, Math.PI / 2));
    rails.push(cyl(0.02, 0.02, 3.9, 8, 1.95, deckY + 0.55, 0, null, Math.PI / 2), cyl(0.02, 0.02, 3.9, 8, 0, deckY + 0.55, -1.95, null, 0, 0, Math.PI / 2), cyl(0.02, 0.02, 3.9, 8, 0, deckY + 0.55, 1.95, null, 0, 0, Math.PI / 2));
    rails.push(cyl(0.025, 0.025, 1.4, 8, -1.95, deckY + 1.05, -1.25, null, Math.PI / 2), cyl(0.025, 0.025, 1.4, 8, -1.95, deckY + 1.05, 1.25, null, Math.PI / 2));
    post(-1.95, -1.95); post(-1.95, -0.55); post(-1.95, 0.55); post(-1.95, 1.95);
    this.add(merge(rails), M.paintYellow);
    this.col(1.95, deckY + 0.55, 0, 0.08, 1.1, 3.9); this.col(0, deckY + 0.55, -1.95, 3.9, 1.1, 0.08); this.col(0, deckY + 0.55, 1.95, 3.9, 1.1, 0.08);
    this.col(-1.95, deckY + 0.55, -1.25, 0.08, 1.1, 1.4); this.col(-1.95, deckY + 0.55, 1.25, 0.08, 1.1, 1.4);
    const steps = 6, rise = deckY / steps;
    const st = [];
    for (let i = 1; i < steps; i++) {
      const y = deckY - i * rise, x = -2.0 - i * 0.28 + 0.14;
      st.push(box(0.27, 0.04, 1.0, x, y, 0));
      this.col(x, y / 2, 0, 0.29, y + 0.02, 1.0);
    }
    this.add(merge(st), M.tread);
    for (const z of [-0.52, 0.52]) {
      this.add(tube(new THREE.Vector3(-2.0, deckY, z), new THREE.Vector3(-2.0 - steps * 0.28, 0, z), 0.04), M.galvanized);
      this.add(tube(new THREE.Vector3(-2.0, deckY + 1.0, z), new THREE.Vector3(-2.0 - steps * 0.28, 1.0, z), 0.022), M.paintYellow);
    }
    // control panel + screen on the deck by the stairs
    const cp = new THREE.Group(); cp.position.set(-1.65, deckY, -1.15); cp.rotation.y = -Math.PI / 2; this.root.add(cp);
    this.add(merge([box(0.08, 1.0, 0.08, 0, 0.5, 0), box(0.7, 0.5, 0.16, 0, 1.15, 0.05)]), M.paintGrey, cp);
    this.screenCanvas = document.createElement('canvas'); this.screenCanvas.width = 256; this.screenCanvas.height = 160;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas); this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.375), new THREE.MeshBasicMaterial({ map: this.screenTex }));
    scr.position.set(0, 1.16, 0.135); cp.add(scr);
    this.panelPoint = this.root.localToWorld(new THREE.Vector3(-2.0, deckY, -1.15));
    // sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshStandardMaterial({ map: T.labelTexture('CEMENT MIXER', { w: 1024, h: 196, color: '#ffffff', bg: '#1d5aa6', font: '900 120px Arial' }) }));
    sign.position.set(-1.98, deckY + 1.5, 0); sign.rotation.y = -Math.PI / 2;
    const signPosts = merge([box(0.05, 0.6, 0.05, -1.98, deckY + 1.2, -1.1), box(0.05, 0.6, 0.05, -1.98, deckY + 1.2, 1.1)]);
    this.add(signPosts, M.paintYellow); this.root.add(sign);
    this.root.updateMatrixWorld(true);
    this.panelPoint = this.root.localToWorld(new THREE.Vector3(-2.9, 0, -1.0));
    this.tubCenter = this.root.localToWorld(new THREE.Vector3(0, FLOOR + DEPTH, 0));
    this.chuteEnd = this.root.localToWorld(new THREE.Vector3(0, FLOOR - 0.6, R_TUB + 1.3));
  }

  contentMaterial() {
    const gTex = T.gravelTextures();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, normalMap: gTex.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
    const u = this.u = {
      uCols: { value: Array.from({ length: 8 }, () => new THREE.Color(0.5, 0.5, 0.5)) },
      uCum: { value: new Float32Array(8) }, uCount: { value: 0 },
      uAvg: { value: new THREE.Color(0.5, 0.5, 0.5) }, uMix: { value: 0 }, uWet: { value: 0 }, uWaterOnly: { value: 0 },
      uSpin: { value: 0 }, uTime: { value: 0 }, uWaterCol: { value: WATER },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vMixUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMixUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vMixUv;
        uniform vec3 uCols[8]; uniform float uCum[8]; uniform int uCount; uniform vec3 uAvg; uniform float uMix, uWet, uWaterOnly, uSpin, uTime; uniform vec3 uWaterCol;
        float mh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x), mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y); }
        float fbm2(vec2 p) { return mn(p) * 0.55 + mn(p * 2.1) * 0.3 + mn(p * 4.3) * 0.15; }`)
        .replace('#include <map_fragment>', `
          vec2 q = vMixUv * 2.0 - 1.0;
          float r = length(q), ang = atan(q.y, q.x);
          float sw = ang + uSpin * (1.2 - r) + r * 4.0;
          vec2 sp = vec2(cos(sw), sin(sw)) * r;
          float n = fbm2(sp * 3.0 + vec2(uTime * 0.03, 0.0));
          float v = fract(sw / 6.2831 * 2.0 + n * 0.9 + r * 0.6);
          vec3 bc = uCols[0];
          for (int i = 1; i < 8; i++) { if (i < uCount && v > uCum[i - 1]) bc = uCols[i]; }
          vec3 col = mix(bc, uAvg, uMix);
          col *= 0.9 + 0.2 * fbm2(sp * 12.0);
          col *= 1.0 - uWet * 0.28;
          col = mix(col, uWaterCol, uWaterOnly * 0.85);
          diffuseColor.rgb *= col;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.92, 0.18, uWet);');
    };
    mat.customProgramCacheKey = () => 'mixer-contents';
    return mat;
  }

  buildPhysics() {
    const w = this.physics.world;
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.root.position.x, this.root.position.y, this.root.position.z));
    for (const [x, y, z, sx, sy, sz, ry = 0] of this.colliders) {
      w.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(x, y, z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry)), body);
    }
  }

  // ------------------------------------------------------------------ contents
  get total() { return this.dust + this.water + this.cement; }
  get volume() { return this.dust / 1500 + this.water / 1000 + this.cement / 2100; }
  get capacity() { return Math.PI * R_TUB * R_TUB * (DEPTH - 0.08); }
  room(kind) {
    const free = Math.max(0, this.capacity - this.volume);
    return kind === 'water' ? free * 1000 : kind === 'cement' ? free * 2100 : free * 1500;
  }

  pushBatch(c, kg) {
    const last = this.batches[this.batches.length - 1];
    if (last && Math.abs(last.c.r - c.r) + Math.abs(last.c.g - c.g) + Math.abs(last.c.b - c.b) < 0.03) last.kg += kg;
    else this.batches.push({ c: c.clone(), kg });
    if (this.batches.length > 8) { const a = this.batches.shift(); this.batches[0].c.lerp(a.c, a.kg / (a.kg + this.batches[0].kg)); this.batches[0].kg += a.kg; }
  }

  // returns amount accepted
  addDust(kg, color) {
    kg = Math.min(kg, this.room('dust'));
    if (kg <= 0) return 0;
    this.dustCol.lerp(color, kg / (this.dust + kg)); this.dust += kg;
    this.pushBatch(color, kg);
    this.progress = Math.min(this.progress, 0.3);
    this.refresh(); return kg;
  }
  addWater(l) {
    l = Math.min(l, this.room('water'));
    if (l <= 0) return 0;
    this.water += l; this.refresh(); return l;
  }
  addCement(kg, color) {
    kg = Math.min(kg, this.room('cement'));
    if (kg <= 0) return 0;
    this.cementCol.lerp(color, kg / (this.cement + kg)); this.cement += kg;
    this.pushBatch(color, kg);
    this.refresh(); return kg;
  }
  takeCement(kg) {
    const t = Math.min(kg, this.cement);
    this.cement -= t;
    if (this.cement < 0.5) { this.cement = 0; if (!this.dust) this.batches = []; }
    this.refresh();
    return { kg: t, color: this.cementCol.clone() };
  }
  empty() { this.dust = 0; this.water = 0; this.cement = 0; this.batches = []; this.progress = 0; this.refresh(); }

  mixedColor() {
    const solids = this.dust + this.cement;
    if (!solids) return new THREE.Color(0.6, 0.6, 0.6);
    return this.dustCol.clone().multiplyScalar(this.dust / solids).add(this.cementCol.clone().multiplyScalar(this.cement / solids));
  }

  // authority: run the mixing process; returns true when the state changed meaningfully
  simulate(dt) {
    const before = this.status;
    if (this.dust > 0 && this.water > 0) {
      const ratio = this.water / this.dust;
      if (ratio < 0.12) { this.status = 'Too dry – add water'; this.progress = Math.min(this.progress + dt * 0.02, 0.6); }
      else if (ratio > 0.9) { this.status = 'Too wet – add dust'; this.progress = Math.min(this.progress + dt * 0.02, 0.6); }
      else {
        this.status = 'Mixing…';
        this.progress += dt / (6 + (this.dust + this.water) / 500);
        if (this.progress >= 1) {
          const w = Math.min(this.water, this.dust * 0.45);
          const made = this.dust + w;
          const col = this.mixedColor();
          this.cementCol.copy(col);
          this.cement += made;
          this.dust = 0; this.water -= w; this.progress = 0;
          this.batches = [{ c: col.clone(), kg: this.cement }];
          this.status = 'Cement ready!';
          this.refresh();
          return true;
        }
      }
    } else if (this.cement > 0) this.status = this.water > 0 ? 'Cement ready (extra water)' : 'Cement ready!';
    else if (this.dust > 0) this.status = 'Needs water';
    else if (this.water > 0) this.status = 'Needs dust';
    else this.status = 'Empty';
    return before !== this.status;
  }

  update(dt) {
    const running = this.dust > 0 && this.water > 0;
    this.speed += ((running ? 1 : this.cement > 0 ? 0.25 : 0) - this.speed) * Math.min(1, dt * 1.5);
    this.spin += this.speed * dt * 2.2;
    this.rotor.rotation.y = this.spin;
    const u = this.u;
    u.uSpin.value = this.spin; u.uTime.value += dt;
    // visual mixing factor eases toward the real progress (cement alone is fully mixed)
    const target = this.cement > 0 && !this.dust ? 1 : this.dust > 0 && this.water > 0 ? Math.min(1, this.progress * 1.15) : 0;
    u.uMix.value += (target - u.uMix.value) * Math.min(1, dt * 1.2);
    this.screenTimer = (this.screenTimer || 0) - dt;
    if (this.screenTimer <= 0) { this.screenTimer = 0.4; this.drawScreen(); }
  }

  refresh() {
    const fill = Math.min(1, this.volume / this.capacity);
    this.contents.visible = this.total > 0.5;
    this.contents.position.y = FLOOR + 0.02 + fill * (DEPTH - 0.08);
    const u = this.u;
    const list = this.batches.length ? this.batches : [{ c: this.mixedColor(), kg: 1 }];
    const tot = list.reduce((a, b) => a + b.kg, 0);
    let acc = 0;
    list.forEach((b, i) => { u.uCols.value[i].copy(b.c); acc += b.kg / tot; u.uCum.value[i] = acc; });
    u.uCount.value = list.length;
    u.uAvg.value.copy(this.mixedColor());
    const solids = this.dust + this.cement;
    u.uWaterOnly.value = solids < 1 ? 1 : Math.min(1, Math.max(0, (this.water / solids - 0.8) * 0.8));
    u.uWet.value = this.water > 0 || this.cement > 0 ? 1 : 0;
  }

  drawScreen() {
    const c = this.screenCanvas.getContext('2d');
    c.fillStyle = '#0b1424'; c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#7fd0ff'; c.font = 'bold 17px monospace'; c.fillText('PAN MIXER PM-2', 10, 22);
    c.font = '14px monospace';
    const sw = (col, x, y) => { c.fillStyle = '#' + col.getHexString(); c.fillRect(x, y - 11, 14, 14); };
    c.fillStyle = '#cfe8ff'; c.fillText(`DUST   ${fmtKg(this.dust)}`, 10, 46); if (this.dust) sw(this.dustCol, 220, 46);
    c.fillStyle = '#cfe8ff'; c.fillText(`WATER  ${Math.round(this.water)} L`, 10, 66);
    c.fillStyle = '#cfe8ff'; c.fillText(`CEMENT ${fmtKg(this.cement)}`, 10, 86); if (this.cement) sw(this.cementCol, 220, 86);
    c.fillStyle = '#ffd34d'; c.fillText(this.status, 10, 110);
    c.fillStyle = '#1e3350'; c.fillRect(10, 124, 236, 14);
    c.fillStyle = '#3fbf5a'; c.fillRect(10, 124, 236 * Math.min(1, this.progress), 14);
    c.fillStyle = '#4a6a90'; c.fillRect(10, 144, 236, 8);
    c.fillStyle = '#7fd0ff'; c.fillRect(10, 144, 236 * Math.min(1, this.volume / this.capacity), 8);
    this.screenTex.needsUpdate = true;
  }

  serialize() {
    const c = (col) => [+col.r.toFixed(4), +col.g.toFixed(4), +col.b.toFixed(4)];
    return { dust: this.dust, dustCol: c(this.dustCol), water: this.water, cement: this.cement, cementCol: c(this.cementCol), progress: this.progress, status: this.status,
      batches: this.batches.map((b) => [...c(b.c), Math.round(b.kg)]) };
  }
  restore(d) {
    this.dust = d.dust; this.dustCol.setRGB(...d.dustCol); this.water = d.water; this.cement = d.cement; this.cementCol.setRGB(...d.cementCol);
    this.progress = d.progress; this.status = d.status || this.status;
    this.batches = (d.batches || []).map(([r, g, b, kg]) => ({ c: new THREE.Color(r, g, b), kg }));
    this.refresh();
  }
}
