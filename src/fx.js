// Lightweight particle effects: dust clouds (soft sprites), flying chips and glass shards.
import * as THREE from 'three';
import { softSprite } from './textures.js';

const MAX_DUST = 420, MAX_CHIPS = 500, MAX_SPARKS = 900, MAX_FLASH = 6;

export class FX {
  constructor(scene) {
    this.scene = scene;
    // dust: points with per-particle size/alpha/colour
    const g = new THREE.BufferGeometry();
    this.dPos = new Float32Array(MAX_DUST * 3);
    this.dCol = new Float32Array(MAX_DUST * 3);
    this.dSize = new Float32Array(MAX_DUST);
    this.dAlpha = new Float32Array(MAX_DUST);
    g.setAttribute('position', new THREE.BufferAttribute(this.dPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.dCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.dSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.dAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softSprite() }, scale: { value: 600 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; varying float vRot; uniform float scale;
        void main(){ vA = alpha; vC = color; vRot = float(gl_VertexID) * 1.7; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC; varying float vRot;
        void main(){ vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), co = cos(vRot); c = mat2(co,-s,s,co) * c; vec4 t = texture2D(map, c + 0.5); if (t.a * vA < 0.01) discard; gl_FragColor = vec4(vC, t.a * vA); }`,
      transparent: true, depthWrite: false,
    });
    this.dustPoints = new THREE.Points(g, mat);
    this.dustPoints.frustumCulled = false;
    this.dustPoints.renderOrder = 5;
    scene.add(this.dustPoints);
    this.dParts = [];
    for (let i = 0; i < MAX_DUST; i++) this.dParts.push({ life: 0, max: 1, v: new THREE.Vector3(), p: new THREE.Vector3(), s0: 1, s1: 2, a: 0.5 });
    this.dNext = 0;

    // chips / shards: instanced little boxes
    this.chipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX_CHIPS);
    this.chipMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CHIPS * 3), 3);
    this.chipMesh.frustumCulled = false; this.chipMesh.castShadow = true;
    scene.add(this.chipMesh);
    this.chipList = [];
    for (let i = 0; i < MAX_CHIPS; i++) this.chipList.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: new THREE.Vector3() });
    this.cNext = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._c = new THREE.Color();
    for (let i = 0; i < MAX_CHIPS; i++) this.chipMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    this.quality = 1;

    // glowing sparks (explosions, fireworks): additive points that fade out
    const sg = new THREE.BufferGeometry();
    this.sPos = new Float32Array(MAX_SPARKS * 3); this.sCol = new Float32Array(MAX_SPARKS * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkPoints = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.65, map: softSprite(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sparkPoints.frustumCulled = false; this.sparkPoints.renderOrder = 6; scene.add(this.sparkPoints);
    this.sparkList = []; for (let i = 0; i < MAX_SPARKS; i++) this.sparkList.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), g: 9.8, drag: 0.5 });
    this.sNext = 0;
    // flashes: big soft additive sprites that blow up and fade in a fraction of a second
    this.flashes = [];
    for (let i = 0; i < MAX_FLASH; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sp.visible = false; sp.renderOrder = 7; scene.add(sp); this.flashes.push({ sp, life: 0, max: 0.3, size: 1 });
    }
    this.fNext = 0;
  }

  sparks(pos, color, count = 20, speed = 6, { life = 1.2, gravity = 9.8, drag = 0.6, up = 0.3 } = {}) {
    const c = this._c.set(color);
    count = Math.ceil(count * this.quality);
    for (let k = 0; k < count; k++) {
      const s = this.sparkList[this.sNext]; this.sNext = (this.sNext + 1) % MAX_SPARKS;
      // random direction on a sphere, a little biased upwards
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      s.v.set(Math.cos(a) * r, u + up, Math.sin(a) * r).multiplyScalar(speed * (0.55 + Math.random() * 0.45));
      s.p.copy(pos); s.max = s.life = life * (0.6 + Math.random() * 0.6); s.g = gravity; s.drag = drag;
      s.c.copy(c).multiplyScalar(0.8 + Math.random() * 0.4);
    }
  }
  flash(pos, size = 6, color = 0xffd9a0, dur = 0.3) {
    const f = this.flashes[this.fNext]; this.fNext = (this.fNext + 1) % MAX_FLASH;
    f.sp.position.copy(pos); f.sp.material.color.set(color); f.size = size; f.life = f.max = dur; f.sp.visible = true;
  }
  firework(pos, color) {
    this.flash(pos, 9, color, 0.35);
    this.sparks(pos, color, 110, 11, { life: 1.9, gravity: 2.5, drag: 0.9, up: 0 });
    this.sparks(pos, 0xffffff, 25, 6, { life: 1.0, gravity: 2.5, drag: 1.2, up: 0 });
  }
  explosion(pos, dustColor = 0x8a8278) {
    this.flash(pos, 7, 0xffc070, 0.28);
    this.sparks(pos, 0xffa040, 70, 10, { life: 0.9, gravity: 9.8, drag: 0.8, up: 0.4 });
    this.dust(pos, dustColor, 26, 3.2, { life: 5, size: 2.6, speed: 3.2, alpha: 0.6 });
    this.dust(pos, 0x3a3632, 10, 1.6, { life: 3, size: 1.6, speed: 4.5, alpha: 0.55 });
  }

  dust(pos, color, count = 4, spread = 1, opts = {}) {
    const c = this._c.set(color);
    count = Math.ceil(count * this.quality);
    for (let k = 0; k < count; k++) {
      const p = this.dParts[this.dNext]; const i = this.dNext;
      this.dNext = (this.dNext + 1) % MAX_DUST;
      p.p.set(pos.x + (Math.random() - 0.5) * spread, pos.y + (Math.random() - 0.3) * spread * 0.6, pos.z + (Math.random() - 0.5) * spread);
      p.v.set((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2).multiplyScalar(opts.speed || 1);
      p.max = p.life = (opts.life || 2.2) * (0.7 + Math.random() * 0.6);
      p.s0 = (opts.size || 1.0) * (0.5 + Math.random() * 0.5); p.s1 = p.s0 * (2.5 + Math.random());
      p.a = (opts.alpha || 0.45) * (0.6 + Math.random() * 0.4);
      const sh = 0.85 + Math.random() * 0.25;
      this.dCol[i * 3] = c.r * sh; this.dCol[i * 3 + 1] = c.g * sh; this.dCol[i * 3 + 2] = c.b * sh;
    }
  }

  chips(pos, dir, color, count = 6, size = 0.06, speed = 3.5) {
    const c = this._c.set(color);
    count = Math.ceil(count * this.quality);
    for (let k = 0; k < count; k++) {
      const ch = this.chipList[this.cNext]; const i = this.cNext;
      this.cNext = (this.cNext + 1) % MAX_CHIPS;
      ch.life = 1.6 + Math.random() * 1.2;
      ch.p.copy(pos);
      ch.v.set(-dir.x + (Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.4, -dir.z + (Math.random() - 0.5) * 1.6).multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      ch.w.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
      const s = size * (0.5 + Math.random());
      ch.s.set(s, s * (0.5 + Math.random() * 0.6), s * (0.6 + Math.random() * 0.5));
      ch.ground = false;
      const sh = 0.8 + Math.random() * 0.35;
      this.chipMesh.setColorAt(i, this._c.setRGB(c.r * sh, c.g * sh, c.b * sh));
    }
    this.chipMesh.instanceColor.needsUpdate = true;
  }

  glass(pos) {
    this.chips(pos, new THREE.Vector3(0, 0, 0), 0xd8eef5, 22, 0.05, 3.0);
    this.dust(pos, 0xffffff, 2, 0.6, { alpha: 0.25 });
  }

  update(dt, camera) {
    // sparks
    let live = 0;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const s = this.sparkList[i];
      if (s.life <= 0) { this.sCol[i * 3] = this.sCol[i * 3 + 1] = this.sCol[i * 3 + 2] = 0; this.sPos[i * 3 + 1] = -999; continue; }
      live++;
      s.life -= dt;
      s.v.multiplyScalar(1 - s.drag * dt); s.v.y -= s.g * dt;
      s.p.addScaledVector(s.v, dt);
      const k = Math.max(0, s.life / s.max), tw = k * (0.75 + Math.random() * 0.25);
      this.sPos[i * 3] = s.p.x; this.sPos[i * 3 + 1] = s.p.y; this.sPos[i * 3 + 2] = s.p.z;
      this.sCol[i * 3] = s.c.r * tw; this.sCol[i * 3 + 1] = s.c.g * tw; this.sCol[i * 3 + 2] = s.c.b * tw;
    }
    if (live || this.sparkLive) { const sg = this.sparkPoints.geometry; sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true; }
    this.sparkLive = live; this.sparkPoints.visible = live > 0;
    for (const f of this.flashes) {
      if (f.life <= 0) { f.sp.visible = false; continue; }
      f.life -= dt; const t = 1 - Math.max(0, f.life) / f.max;
      f.sp.scale.setScalar(f.size * (0.4 + t * 0.9)); f.sp.material.opacity = (1 - t) * (1 - t);
    }
    // dust
    const fog = this.scene.fog;
    for (let i = 0; i < MAX_DUST; i++) {
      const p = this.dParts[i];
      if (p.life <= 0) { this.dAlpha[i] = 0; continue; }
      p.life -= dt;
      const t = 1 - p.life / p.max;
      p.v.multiplyScalar(1 - dt * 0.9);
      p.v.y += dt * 0.05;
      p.p.addScaledVector(p.v, dt);
      this.dPos[i * 3] = p.p.x; this.dPos[i * 3 + 1] = p.p.y; this.dPos[i * 3 + 2] = p.p.z;
      this.dSize[i] = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
      this.dAlpha[i] = p.a * Math.min(1, t * 8) * (1 - t);
    }
    const g = this.dustPoints.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.color.needsUpdate = true;
    this.dustPoints.material.uniforms.scale.value = window.innerHeight * 0.9;

    // chips
    let any = false;
    for (let i = 0; i < MAX_CHIPS; i++) {
      const ch = this.chipList[i];
      if (ch.life <= 0) continue;
      any = true;
      ch.life -= dt;
      if (!ch.ground) {
        ch.v.y -= 9.8 * dt;
        ch.p.addScaledVector(ch.v, dt);
        ch.r.x += ch.w.x * dt; ch.r.y += ch.w.y * dt; ch.r.z += ch.w.z * dt;
        if (ch.p.y < 0.02) { ch.p.y = 0.02; if (Math.abs(ch.v.y) < 1.2) ch.ground = true; ch.v.y *= -0.3; ch.v.x *= 0.5; ch.v.z *= 0.5; }
      }
      const shrink = ch.life < 0.4 ? ch.life / 0.4 : 1;
      this._q.setFromEuler(ch.r);
      this._m.compose(ch.p, this._q, ch.s.clone().multiplyScalar(shrink));
      if (ch.life <= 0) this._m.makeScale(0, 0, 0);
      this.chipMesh.setMatrixAt(i, this._m);
    }
    if (any) this.chipMesh.instanceMatrix.needsUpdate = true;
  }
}
