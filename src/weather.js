// Weather: clear, rain or thunderstorm. Rain is a field of falling streaks drawn on the GPU around the camera; the
// sky closes over (less sun, grey fog and clouds), the ground, road and paving turn dark and glossy as they get
// wet and dry out slowly afterwards, and you hear it. Storms add lightning flashes and thunder a moment later.
// The host decides the weather (Settings: changing / always clear / rainy / stormy) and shares it.
import * as THREE from 'three';

export const WEATHERS = ['auto', 'clear', 'rain', 'storm'];
const SS = THREE.MathUtils.smoothstep;

export class Weather {
  constructor(game) {
    this.g = game; this.state = 'clear'; this.amount = 0; this.wet = 0; this.flash = 0;
    this.autoT = 60 + Math.random() * 120; this.boltT = 8;
    this.build(game.quality === 'low' ? 1500 : game.quality === 'medium' ? 3500 : 6000);
    this.flashDiv = document.createElement('div');
    Object.assign(this.flashDiv.style, { position: 'fixed', inset: '0', background: '#dfe8ff', opacity: '0', pointerEvents: 'none', zIndex: '5', mixBlendMode: 'screen' });
    document.getElementById('game').appendChild(this.flashDiv);
    // surfaces that look wet: grass, the road, paving and slabs (their dry roughness is remembered)
    this.wetMats = (game.env.wetMats || []).map((m) => ({ m, dry: m.roughness }));
  }
  build(n) {
    const seed = new Float32Array(n * 2 * 4), end = new Float32Array(n * 2), pos = new Float32Array(n * 2 * 3);
    for (let i = 0; i < n; i++) {
      const a = [Math.random(), Math.random(), Math.random(), Math.random()];
      for (let k = 0; k < 2; k++) { seed.set(a, (i * 2 + k) * 4); end[i * 2 + k] = k; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 4)); g.setAttribute('end', new THREE.BufferAttribute(end, 1));
    this.uni = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uWind: { value: new THREE.Vector2(1.2, 0.5) }, uBright: { value: 1 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false,
      vertexShader: `attribute vec4 seed; attribute float end; uniform float uTime; uniform vec3 uCam; uniform float uAmount; uniform vec2 uWind; varying float vA;
        void main() {
          const vec3 box = vec3(56.0, 28.0, 56.0);
          float speed = 16.0 + seed.w * 6.0;
          float y = mod(seed.y * box.y - uTime * speed, box.y) - box.y * 0.35;
          vec3 w = vec3(uCam.x + (seed.x - 0.5) * box.x, uCam.y + y, uCam.z + (seed.z - 0.5) * box.z);
          w.xz += uWind * (y / speed);
          float len = 0.55 + seed.w * 0.35;
          w.y += end * len; w.xz -= end * uWind * len / speed;
          if (seed.w > uAmount) w = vec3(0.0, -1000.0, 0.0);
          vA = (1.0 - end * 0.7);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `uniform float uBright; varying float vA; void main() { gl_FragColor = vec4(vec3(0.72, 0.78, 0.86) * uBright, 0.33 * vA); }`,
    });
    this.rain = new THREE.LineSegments(g, this.mat); this.rain.frustumCulled = false; this.rain.renderOrder = 8; this.rain.visible = false;
    this.g.scene.add(this.rain);
  }

  // what the host has chosen (in multiplayer clients follow the host's state)
  setState(st) { if (['clear', 'rain', 'storm'].includes(st)) this.state = st; }

  update(dt, camera, auth, pref) {
    const g = this.g;
    // the host picks the weather: fixed by the setting, or changing every few minutes
    if (auth) {
      if (pref === 'clear' || pref === 'rain' || pref === 'storm') this.state = pref;
      else {
        this.autoT -= dt;
        if (this.autoT <= 0) {
          const r = Math.random();
          this.state = this.state !== 'clear' ? (r < 0.75 ? 'clear' : this.state === 'rain' && r < 0.9 ? 'storm' : 'rain') : (r < 0.55 ? 'clear' : r < 0.85 ? 'rain' : 'storm');
          this.autoT = (this.state === 'clear' ? 240 : 150) + Math.random() * 180;
        }
      }
    }
    const target = this.state === 'clear' ? 0 : this.state === 'rain' ? 0.65 : 1;
    this.amount += Math.sign(target - this.amount) * Math.min(Math.abs(target - this.amount), dt / 25);
    // the ground soaks up quickly and dries slowly
    this.wet += (this.amount > 0.15 ? Math.min(1, this.amount * 1.4) - this.wet : -this.wet) * dt / (this.amount > 0.15 ? 20 : 90);
    for (const w of this.wetMats) w.m.roughness = w.dry + (Math.min(w.dry, 0.25) - w.dry) * this.wet * 0.8;
    // rain streaks
    this.rain.visible = this.amount > 0.02;
    if (this.rain.visible) {
      this.uni.uTime.value += dt; this.uni.uCam.value.copy(camera.position); this.uni.uAmount.value = this.amount;
      this.uni.uBright.value = g.dn ? 0.35 + 0.65 * Math.max(g.dn.day, 0.15) : 1;
    }
    if (g.dn) g.dn.overcast = SS(this.amount, 0, 0.6);
    if (g.audio) g.audio.setRain(this.amount);
    // storm: lightning, then thunder (sound travels: a second or three later)
    if (this.state === 'storm' && this.amount > 0.7) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 7 + Math.random() * 14;
        this.flash = 1; this.flash2 = 0.22;
        if (g.audio) g.audio.thunder(0.8 + Math.random() * 2.2, 0.6 + Math.random() * 0.4);
      }
    }
    if (this.flash2 > 0) { this.flash2 -= dt; if (this.flash2 <= 0) this.flash = Math.max(this.flash, 0.7); }
    this.flash = Math.max(0, this.flash - dt * 7);
    this.flashDiv.style.opacity = String((this.flash * (g.dn ? 0.35 + 0.4 * (1 - g.dn.day) : 0.4)).toFixed(3));
    if (g.dn) g.dn.flash = this.flash;
  }
}
