// Day and night. The sun and the moon cross the sky; light, sky, fog and cloud colours follow; stars come out;
// street lamps, the yard's light towers, house windows and the machines' work lights switch on after dusk.
// The number of real lights never changes while playing (that would recompile every shader): a small fixed set of
// spotlights is handed to the lamps nearest the camera, and every lamp also glows (emissive lens + a soft pool of
// light on the ground), so far-away lamps look lit at no cost.
import * as THREE from 'three';
import { terrainHeight } from './site.js';

export const CYCLES = { off: 0, fast: 600, normal: 1200, slow: 2400 }; // seconds for a whole day
const DAY = 0.66;                // share of the cycle with the sun up
export const NOON = DAY / 2;
export const MORNING = DAY * 0.3;
const SS = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function moonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.save(); g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.clip();
  const base = g.createRadialGradient(108, 104, 10, 128, 128, 124);
  base.addColorStop(0, '#f6f4ec'); base.addColorStop(1, '#bdbcb4');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  // maria (dark plains) and craters
  for (const [x, y, r] of [[96, 92, 34], [150, 84, 26], [140, 132, 30], [90, 150, 22], [170, 168, 18]]) { g.fillStyle = 'rgba(120,122,126,0.32)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 40; i++) {
    const x = 20 + rnd() * 216, y = 20 + rnd() * 216, r = 2 + rnd() * 7;
    g.fillStyle = 'rgba(90,90,96,0.25)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,250,0.25)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.6, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class DayNight {
  constructor(scene, env, M, renderer) {
    this.scene = scene; this.env = env; this.M = M; this.renderer = renderer;
    this.p = NOON;               // time of day: 0 = sunrise, DAY = sunset
    this.cycle = CYCLES.normal;
    this.wasNight = false; this.onPhase = null;
    // the sun moves on a tilted circle; at noon it is exactly where the fixed sun of older versions was
    const tilt = THREE.MathUtils.degToRad(48);
    this.east = V(Math.SQRT1_2, 0, Math.SQRT1_2);
    this.top = V(0, Math.cos(tilt), 0).addScaledVector(V(Math.SQRT1_2, 0, -Math.SQRT1_2), Math.sin(tilt));
    this.sunV = V(0, 1, 0); this.moonV = V(0, -1, 0); this.key = V();
    this.col = {
      sunDay: new THREE.Color(0xfff2dc), sunLow: new THREE.Color(0xff9c55), moon: new THREE.Color(0x9db4ff),
      skyDay: new THREE.Color(0xcfe3ff), skyNight: new THREE.Color(0x3a4c76), skyDusk: new THREE.Color(0xffc29a),
      gndDay: new THREE.Color(0x5b5040), gndNight: new THREE.Color(0x17161d),
      fogDay: new THREE.Color(0xc6d3df), fogNight: new THREE.Color(0x242d3c), fogDusk: new THREE.Color(0xd7a487),
      cloudNight: new THREE.Color(0x2a3242), cloudDusk: new THREE.Color(0xffb38c), white: new THREE.Color(0xffffff),
    };
    this.tmp = new THREE.Color();

    // stars behind the clouds, the moon in front of them
    const n = 1400, pos = new Float32Array(n * 3), cols = new Float32Array(n * 3);
    let s = 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const u = rnd(), th = rnd() * Math.PI * 2, y = 0.04 + u * 0.96, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 2100, y * 2100 - 120, Math.sin(th) * r * 2100], i * 3);
      const b = 0.45 + rnd() * 0.55, warm = rnd();
      cols.set([b * (0.85 + warm * 0.15), b * 0.9, b * (1 - warm * 0.12)], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false; scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(48, 40), new THREE.MeshBasicMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }));
    this.moon.renderOrder = 1; scene.add(this.moon);

    // soft pools of light on the ground under every lamp and in front of the towers (one draw call)
    const glow = radialTexture([[0, 0.9], [0.4, 0.45], [1, 0]]);
    this.poolMat = new THREE.MeshBasicMaterial({ map: glow, color: 0xffc98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -6 });
    const quads = [];
    const quad = (x, z, sx, sz, rot) => {
      const q = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).scale(sx, 1, sz).rotateY(rot);
      q.translate(x, terrainHeight(x, z) + 0.05, z); quads.push(q);
    };
    for (const l of env.lamps) quad(l.x, l.z, 15, 15, 0);
    for (const t of env.towers) {
      const d = t.target.clone().sub(t.pos).setY(0), len = d.length(), rot = Math.atan2(d.x, d.z);
      const c = t.pos.clone().addScaledVector(d.normalize(), Math.min(len, 16));
      quad(c.x, c.z, 24, 34, rot);
    }
    const merged = mergeQuads(quads);
    this.pools = new THREE.Mesh(merged, this.poolMat); this.pools.renderOrder = 2; this.pools.frustumCulled = false;
    scene.add(this.pools);
    // light pools in front of running machines (cheap stand-in for real lights on everyone else's machines)
    this.machPoolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.machPoolMat = this.poolMat.clone(); this.machPoolMat.color.set(0xe8f0ff);
    this.machPools = [];

    // house windows: each house lights up a little differently
    this.windows = env.glowMats.map((m, i) => ({ m, k: [1.4, 0.0, 1.1, 1.6, 0.8, 1.3, 0.0, 1.5][i % 8] }));
    // light sources the real lights can be handed to
    this.sources = [
      ...env.lamps.map((l) => ({ pos: l, target: V(l.x, 0, l.z), I: 70, dist: 30, angle: 1.05, pen: 0.75, w: 1, color: 0xffd6a0 })),
      ...env.towers.map((t) => ({ pos: t.pos, target: t.target, I: 1100, dist: 95, angle: 0.62, pen: 0.55, w: 0.45, color: 0xf2f4ff })),
    ];
    this.slots = []; this.work = null;
    this.setQuality('high');
    this.apply();
  }

  // a fixed set of real lights per quality level (changing quality is the only time the light count changes)
  setQuality(q) {
    const n = q === 'low' ? 0 : q === 'medium' ? 2 : 3;
    for (const s of this.slots) { this.scene.remove(s.light, s.light.target); s.light.dispose(); }
    if (this.work) { this.scene.remove(this.work, this.work.target); this.work.dispose(); this.work = null; }
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.SpotLight(0xffd6a0, 0, 30, 1, 0.7, 2);
      this.scene.add(l, l.target);
      this.slots.push({ light: l, src: null, next: null, k: 0 });
    }
    if (q !== 'low') {
      this.work = new THREE.SpotLight(0xeef3ff, 0, 48, 0.72, 0.5, 2);
      this.scene.add(this.work, this.work.target);
    }
  }

  get isNight() { return this.night > 0.5; }
  sunAngle(p) { p = ((p % 1) + 1) % 1; return p < DAY ? (p / DAY) * Math.PI : Math.PI + ((p - DAY) / (1 - DAY)) * Math.PI; }
  skip(f) { this.p = (this.p + f) % 1; this.apply(); }

  update(dt, view) {
    if (this.cycle > 0) this.p = (this.p + dt / this.cycle) % 1;
    else this.p = NOON;
    this.apply(dt, view);
  }

  apply(dt = 0, view = null) {
    const e = this.env, C = this.col;
    const a = this.sunAngle(this.p);
    this.sunV.copy(this.east).multiplyScalar(-Math.cos(a)).addScaledVector(this.top, Math.sin(a));
    this.moonV.copy(this.sunV).negate();
    const y = this.sunV.y;
    const day = SS(y, -0.12, 0.22);           // 0 at night, 1 in daylight
    const night = 1 - SS(y, -0.2, -0.02);     // 1 deep in the night
    const dusk = Math.exp(-(((y - 0.04) / 0.14) ** 2)); // golden hour around sunrise / sunset
    const lit = 1 - SS(y, -0.08, 0.06);       // lamps switch on around sunset
    this.day = day; this.night = night; this.lit = lit;

    // sky
    const su = e.sky.material.uniforms;
    su.sunPosition.value.copy(this.sunV);
    su.uDay.value = SS(y, -0.17, 0.1);
    su.rayleigh.value = lerp(0.5, 1.4, day) + dusk * 0.8;
    su.turbidity.value = 4.5 + dusk * 3;
    // key light: the sun by day, the moon at night (it swaps while both are at the horizon and nearly dark)
    const sun = e.sun;
    if (y > -0.03) {
      this.key.copy(this.sunV);
      sun.color.copy(C.sunDay).lerp(C.sunLow, Math.min(1, dusk * 1.1) * (1 - SS(y, 0.1, 0.4)));
      sun.intensity = 2.6 * SS(y, -0.03, 0.32);
    } else {
      this.key.copy(this.moonV);
      sun.color.copy(C.moon);
      sun.intensity = 0.55 * SS(-y, 0.03, 0.3);
    }
    // shadows from a very low light are endless streaks: keep the shadow (and light) direction at least ~11° up
    if (this.key.y < 0.2) { const h = Math.hypot(this.key.x, this.key.z) || 1; const k = Math.sqrt(1 - 0.04) / h; this.key.x *= k; this.key.z *= k; this.key.y = 0.2; }
    e.sunDir.copy(this.key);

    e.hemi.color.copy(C.skyNight).lerp(C.skyDay, day).lerp(C.skyDusk, dusk * 0.35 * day);
    e.hemi.groundColor.copy(C.gndNight).lerp(C.gndDay, day);
    e.hemi.intensity = lerp(0.42, 0.55, day);
    this.scene.environmentIntensity = lerp(0.1, 0.75, day);
    const fog = this.scene.fog;
    fog.color.copy(C.fogNight).lerp(C.fogDay, day).lerp(C.fogDusk, dusk * 0.5 * SS(y, -0.1, 0.05));
    fog.near = lerp(55, 110, day); fog.far = lerp(420, 700, day);
    this.renderer.toneMappingExposure = lerp(1.35, 1.0, day); // eyes adjust to the dark

    const cm = e.clouds.material;
    cm.color.copy(C.cloudNight).lerp(C.white, day).lerp(C.cloudDusk, dusk * 0.6);
    cm.opacity = lerp(0.5, 0.85, day);
    this.stars.material.opacity = night;
    this.stars.visible = night > 0.01;
    this.stars.rotation.y = this.p * Math.PI * 2 * 0.25;
    this.moon.position.copy(this.moonV).multiplyScalar(2050);
    this.moon.lookAt(0, 0, 0);
    this.moon.visible = this.moonV.y > -0.08;
    this.moon.material.opacity = 1 - day * 0.8;

    // glowing things
    this.M.lightLens.emissiveIntensity = 0.6 + lit * 3.4;
    e.towerLens.emissiveIntensity = lit * 5;
    for (const w of this.windows) w.m.emissiveIntensity = w.k * lit;
    this.poolMat.opacity = 0.42 * lit; this.pools.visible = lit > 0.01;

    // hand the real lights to the lamps nearest to what you are looking at
    if (view) this.updateLights(dt, view, lit);
    if (this.onPhase && (night > 0.5) !== this.wasNight) { this.wasNight = night > 0.5; this.onPhase(this.wasNight); }
    else this.wasNight = night > 0.5;
  }

  updateLights(dt, view, lit) {
    const f = view.focus;
    if (this.slots.length) {
      const ranked = this.sources.map((s) => ({ s, d: Math.hypot(s.target.x - f.x, s.target.z - f.z) * s.w })).sort((a, b) => a.d - b.d).slice(0, this.slots.length).map((r) => r.s);
      for (const sl of this.slots) if (!ranked.includes(sl.next)) sl.next = null;
      for (const s of ranked) if (!this.slots.some((sl) => sl.next === s)) { const free = this.slots.find((sl) => !sl.next); if (free) free.next = s; }
      for (const sl of this.slots) {
        if (sl.src !== sl.next) {
          sl.k -= dt * 5;
          if (sl.k <= 0) {
            sl.k = 0; sl.src = sl.next;
            if (sl.src) {
              const L = sl.light, s = sl.src;
              L.position.copy(s.pos); L.target.position.copy(s.target); L.target.updateMatrixWorld();
              L.distance = s.dist; L.angle = s.angle; L.penumbra = s.pen; L.color.set(s.color);
            }
          }
        } else sl.k = Math.min(1, sl.k + dt * 3);
        sl.light.intensity = sl.src ? sl.src.I * sl.k * lit : 0;
      }
    }
    // work lights on the machine you drive, a head lamp on foot
    const W = this.work;
    if (W) {
      if (view.machine) {
        const m = view.machine, yaw = m.yaw + (m.swing || 0), fw = V(Math.sin(yaw), 0, Math.cos(yaw));
        const seat = m.seatWorld();
        W.position.copy(seat).addScaledVector(fw, 0.5); W.position.y += 1.0 * Math.max(0.7, m.s || 1);
        W.target.position.copy(seat).addScaledVector(fw, 14); W.target.position.y = terrainHeight(W.target.position.x, W.target.position.z);
        W.angle = 0.78; W.distance = 50; W.intensity = 260 * lit;
      } else {
        const d = view.dir;
        W.position.copy(view.head);
        W.target.position.copy(view.head).addScaledVector(d, 10);
        W.angle = 0.5; W.distance = 30; W.intensity = 40 * lit;
      }
      W.target.updateMatrixWorld();
    }
    // a pool of light in front of every other running machine
    let i = 0;
    if (lit > 0.01) {
      for (const m of view.machines) {
        if (m.driver < 0 || (W && m === view.machine)) continue;
        let p = this.machPools[i];
        if (!p) { p = new THREE.Mesh(this.machPoolGeo, this.machPoolMat); p.renderOrder = 2; p.frustumCulled = false; this.scene.add(p); this.machPools.push(p); }
        const yaw = m.yaw + (m.swing || 0), s = Math.max(0.7, m.s || 1);
        const x = m.pos.x + Math.sin(yaw) * 7 * s, z = m.pos.z + Math.cos(yaw) * 7 * s;
        p.position.set(x, terrainHeight(x, z) + 0.06, z); p.rotation.y = yaw; p.scale.set(8 * s, 1, 12 * s); p.visible = true;
        i++;
      }
    }
    for (; i < this.machPools.length; i++) this.machPools[i].visible = false;
    this.machPoolMat.opacity = 0.32 * lit;
  }
}

function mergeQuads(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    for (const k of g.index.array) idx.push(k + o);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.setIndex(idx);
  return m;
}
