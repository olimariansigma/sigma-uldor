// Sound: real field recordings (CC0, cut by tools/make_sfx.py: diesel engine idle / under load, heavy diesel,
// rubber tracks, a hydraulic breaker, stones, gravel footsteps, bucket clanks, reverse beeper) mixed live per
// machine, plus synthesized layers (hydraulic pump whine, relief hiss, glass, UI). Falls back to synthesis only
// if the recordings can't be loaded.
import * as THREE from 'three';

export class Audio {
  constructor() {
    this.ctx = null; this.volume = 0.8;
    this.listener = new THREE.Vector3(); this.yaw = 0;
    this.lastImpact = 0; this.impactsThisFrame = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    // noise buffers
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.startLoops();
    this.loadSamples();
  }

  // ---------- recordings
  loadSamples() {
    const go = async () => {
      if (!window.__SFX) await new Promise((res, rej) => { const s = document.createElement('script'); s.onload = res; s.onerror = rej; s.src = 'sfx/sfx.js'; document.head.appendChild(s); });
      const data = window.__SFX; if (!data) return;
      const buf = {};
      for (const [name, b64] of Object.entries(data.clips)) {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        buf[name] = await new Promise((res, rej) => this.ctx.decodeAudioData(u.buffer, res, rej));
      }
      this.banks = data.banks || {};
      this.buf = buf;
      window.__SFX = null;
    };
    go().catch((e) => { console.warn('sound recordings not loaded, using synthesis', e); });
  }
  // play a slice of a one-shot bank (stones / steps / clank)
  bank(name, pos, { gain = 1, rate = 1, ref = 6, t = 0 } = {}) {
    if (!this.ctx || !this.buf || !this.buf[name] || !this.banks[name]) return false;
    const list = this.banks[name], [off, dur] = list[(Math.random() * list.length) | 0];
    const src = this.ctx.createBufferSource(); src.buffer = this.buf[name]; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(this.out(pos, ref));
    src.start(this.ctx.currentTime + t, off, dur);
    return true;
  }
  step(pos, run = false) { this.bank('steps', pos, { gain: run ? 0.55 : 0.4, rate: 0.9 + Math.random() * 0.25, ref: 3 }); }
  clank(pos, s = 1) { if (!this.bank('clank', pos, { gain: 0.9 * s, rate: 0.85 + Math.random() * 0.3, ref: 8 })) this.impact('metal', 0.5 * s, pos); }
  tamp(pos) { this.bank('stones', pos, { gain: 0.5, rate: 0.6, ref: 4 }); this.tone(this.out(pos, 4), { dur: 0.16, f: 75, f2: 40, gain: 0.5 }); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setListener(pos, yaw) { this.listener.copy(pos); this.yaw = yaw; }

  // distance attenuation + stereo pan for a world position
  spatial(pos, ref = 6) {
    if (!pos) return { gain: 1, pan: 0 };
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z, dy = pos.y - this.listener.y;
    const dist = Math.hypot(dx, dy, dz);
    const gain = ref / Math.max(ref, dist);
    const right = Math.cos(this.yaw) * dx - Math.sin(this.yaw) * dz;
    const pan = dist > 0.5 ? Math.max(-0.85, Math.min(0.85, right / dist)) : 0;
    return { gain: gain * gain * 0.6 + gain * 0.4, pan };
  }
  out(pos, ref) {
    const { gain, pan } = this.spatial(pos, ref);
    const g = this.ctx.createGain(); g.gain.value = gain;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    return g;
  }
  noiseBurst(dest, { t = 0, dur = 0.2, f = 1200, q = 1, type = 'bandpass', gain = 0.5, brown = false, attack = 0.002, rate = 1 }) {
    const c = this.ctx, now = c.currentTime + t;
    const src = c.createBufferSource(); src.buffer = brown ? this.brown : this.noise; src.playbackRate.value = rate;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gain, now + attack); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(fl); fl.connect(g); g.connect(dest);
    src.start(now, Math.random() * 1.5); src.stop(now + dur + 0.05);
    return fl;
  }
  tone(dest, { t = 0, dur = 0.2, f = 200, f2 = null, type = 'sine', gain = 0.4, attack = 0.003 }) {
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gain, now + attack); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(dest); o.start(now); o.stop(now + dur + 0.05);
  }

  impact(kind, strength = 0.5, pos = null) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.impactsThisFrame > 5) return;
    this.impactsThisFrame++;
    const s = Math.max(0.05, Math.min(1, strength));
    const d = this.out(pos, 5);
    const v = 0.85 + Math.random() * 0.3;
    if (kind === 'brick') {
      if (this.bank('stones', pos, { gain: 0.35 + s * 0.75, rate: 0.75 + Math.random() * 0.35, ref: 5 })) this.tone(d, { dur: 0.14, f: 95 * v, f2: 50, gain: 0.3 * s });
      else {
        this.noiseBurst(d, { dur: 0.12 + s * 0.15, f: 700 * v, q: 1.2, gain: 0.5 * s });
        this.noiseBurst(d, { dur: 0.06, f: 2600 * v, q: 2, gain: 0.18 * s });
        this.tone(d, { dur: 0.12, f: 120 * v, f2: 60, gain: 0.35 * s });
      }
    } else if (kind === 'wood') {
      this.tone(d, { dur: 0.1, f: 260 * v, f2: 180, type: 'triangle', gain: 0.3 * s });
      this.noiseBurst(d, { dur: 0.09, f: 900 * v, q: 3, gain: 0.3 * s });
    } else if (kind === 'metal') {
      for (const m of [1, 2.76, 5.4]) this.tone(d, { dur: 0.5 + s * 0.4, f: 320 * v * m, type: 'sine', gain: 0.12 * s / m });
      this.noiseBurst(d, { dur: 0.05, f: 3000, q: 1, gain: 0.2 * s });
    } else if (kind === 'glass') {
      this.glass(pos, s * 0.4);
    }
  }
  hammer(pos, hit = true) {
    if (!this.ctx) return;
    const d = this.out(pos, 4);
    this.noiseBurst(d, { dur: 0.18, f: 500, q: 0.7, gain: 0.07, attack: 0.08, type: 'lowpass' }); // whoosh
    if (hit && this.bank('stones', pos, { gain: 0.9, rate: 1.05 + Math.random() * 0.2, ref: 4 })) {
      this.tone(d, { dur: 0.12, f: 110, f2: 55, gain: 0.45 });
      this.tone(d, { dur: 0.05, f: 2400, type: 'triangle', gain: 0.05 }); // steel head ring
    } else if (hit) {
      this.tone(d, { t: 0.0, dur: 0.18, f: 90, f2: 45, gain: 0.6 });
      this.noiseBurst(d, { dur: 0.25, f: 1100, q: 0.8, gain: 0.55 });
      this.tone(d, { dur: 0.06, f: 1800, type: 'square', gain: 0.03 });
    }
  }
  glass(pos, s = 1) {
    if (!this.ctx) return;
    const d = this.out(pos, 6);
    this.noiseBurst(d, { dur: 0.35, f: 5200, q: 0.8, type: 'highpass', gain: 0.4 * s });
    for (let i = 0; i < 9; i++) this.tone(d, { t: Math.random() * 0.25, dur: 0.18 + Math.random() * 0.2, f: 2500 + Math.random() * 4500, gain: 0.05 * s });
  }
  collapse(s, pos) {
    if (!this.ctx) return;
    const d = this.out(pos, 20);
    this.noiseBurst(d, { dur: 1.8 + s * 1.5, f: 220, q: 0.6, type: 'lowpass', gain: 0.8 * s, brown: true, attack: 0.05 });
    for (let i = 0; i < 10; i++) this.noiseBurst(d, { t: Math.random() * 1.0, dur: 0.15, f: 600 + Math.random() * 900, q: 1, gain: 0.25 * s });
  }
  crunch(pos) {
    if (!this.ctx) return;
    const d = this.out(pos, 10);
    if (this.buf) {
      for (let i = 0; i < 3; i++) this.bank('stones', pos, { gain: 0.8, rate: 0.55 + Math.random() * 0.2, ref: 10, t: i * 0.07 });
      this.tone(d, { dur: 0.3, f: 60, f2: 35, gain: 0.45 });
      return;
    }
    for (let i = 0; i < 4; i++) this.noiseBurst(d, { t: i * 0.06 + Math.random() * 0.04, dur: 0.12, f: 400 + Math.random() * 1400, q: 1.5, gain: 0.35 });
    this.tone(d, { dur: 0.25, f: 70, f2: 40, gain: 0.4 });
  }
  cash() {
    if (!this.ctx) return;
    const d = this.out(null);
    this.tone(d, { dur: 0.12, f: 1318, type: 'triangle', gain: 0.07 });
    this.tone(d, { t: 0.07, dur: 0.25, f: 1760, type: 'triangle', gain: 0.07 });
  }
  bigCash() {
    if (!this.ctx) return;
    const d = this.out(null);
    [523, 659, 784, 1046].forEach((f, i) => this.tone(d, { t: i * 0.09, dur: 0.4, f, type: 'triangle', gain: 0.15 }));
  }
  splash(pos, s = 0.5) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.lastSplash && now - this.lastSplash < 0.12) return;
    this.lastSplash = now;
    const d = this.out(pos, 5);
    this.noiseBurst(d, { dur: 0.25 + Math.random() * 0.2, f: 900 + Math.random() * 600, q: 0.7, gain: 0.25 * s, attack: 0.02 });
    this.tone(d, { dur: 0.08, f: 500 + Math.random() * 300, f2: 900, gain: 0.04 * s });
  }
  breaker(pos, s = 1) {
    if (!this.ctx || this.buf) return; // the recorded breaker loop runs in the machine voice
    const d = this.out(pos, 6);
    this.noiseBurst(d, { dur: 0.06, f: 2400, q: 1.5, gain: 0.45 * s });
    this.tone(d, { dur: 0.05, f: 180, f2: 90, type: 'square', gain: 0.12 * s });
    this.noiseBurst(d, { dur: 0.1, f: 600, q: 1, gain: 0.25 * s });
  }
  // ---- special excavator tools (synthesised)
  tool(kind, pos, s = 1) {
    if (!this.ctx) return;
    const d = this.out(pos, 8), N = (o) => this.noiseBurst(d, o), T = (o) => this.tone(d, o);
    switch (kind) {
      case 'zap': T({ dur: 0.35, f: 90, f2: 240, type: 'sawtooth', gain: 0.12 * s }); N({ dur: 0.25, f: 3000, q: 2, gain: 0.15 * s }); break;
      case 'hum': T({ dur: 0.75, f: 100, type: 'sawtooth', gain: 0.05 * s, attack: 0.1 }); T({ dur: 0.75, f: 50, type: 'sine', gain: 0.08 * s, attack: 0.1 }); break;
      case 'chain': for (let i = 0; i < 5; i++) N({ t: i * 0.07, dur: 0.06, f: 2600 + Math.random() * 1500, q: 4, gain: 0.25 * s }); break;
      case 'vac': N({ dur: 0.95, f: 1400, q: 0.6, gain: 0.22 * s, attack: 0.15 }); T({ dur: 0.95, f: 420, f2: 470, type: 'triangle', gain: 0.03 * s, attack: 0.15 }); break;
      case 'thunk': T({ dur: 0.18, f: 160, f2: 60, type: 'sine', gain: 0.5 * s }); N({ dur: 0.12, f: 500, q: 1, gain: 0.3 * s }); break;
      case 'fire': N({ dur: 0.35, f: 700, q: 0.5, type: 'lowpass', gain: 0.7 * s, attack: 0.004, brown: true }); T({ dur: 0.25, f: 140, f2: 45, type: 'sine', gain: 0.6 * s }); N({ dur: 0.2, f: 2500, q: 0.8, gain: 0.25 * s }); break;
      case 'grind': N({ dur: 0.3, f: 900, q: 1.5, gain: 0.35 * s }); N({ dur: 0.3, f: 3200, q: 3, gain: 0.15 * s }); T({ dur: 0.3, f: 110, type: 'square', gain: 0.05 * s }); break;
      case 'saw': N({ dur: 0.26, f: 4200, q: 6, gain: 0.3 * s }); T({ dur: 0.26, f: 1800, f2: 1500, type: 'sawtooth', gain: 0.05 * s }); break;
      case 'whine': T({ dur: 0.9, f: 1300, f2: 1350, type: 'triangle', gain: 0.025 * s, attack: 0.2 }); break;
      case 'drill': N({ dur: 0.3, f: 600, q: 1.2, gain: 0.3 * s }); T({ dur: 0.3, f: 75, type: 'square', gain: 0.06 * s }); break;
      case 'thump': T({ dur: 0.1, f: 70, f2: 45, type: 'sine', gain: 0.45 * s }); T({ t: 0.15, dur: 0.1, f: 70, f2: 45, type: 'sine', gain: 0.4 * s }); break;
      case 'jet': N({ dur: 0.45, f: 5000, q: 0.7, type: 'highpass', gain: 0.18 * s, attack: 0.05 }); N({ dur: 0.45, f: 1200, q: 0.8, gain: 0.1 * s, attack: 0.05 }); break;
    }
  }
  // ---- weather
  setRain(level) {
    if (!this.ctx) return;
    if (!this.rainG) {
      if (level < 0.01) return;
      const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.master); src.start();
      this.rainG = g;
    }
    const l = Math.round(Math.min(1, level) * 100) / 100;
    if (l === this.rainL) return;
    this.rainL = l; this.rainG.gain.setTargetAtTime(l * 0.22, this.ctx.currentTime, 0.4);
  }
  thunder(delay = 1, s = 1) {
    if (!this.ctx) return;
    const d = this.out(null);
    this.noiseBurst(d, { t: delay, dur: 3.5 + s * 2, f: 140, q: 0.6, type: 'lowpass', gain: 0.85 * s, brown: true, attack: 0.08 });
    this.noiseBurst(d, { t: delay, dur: 0.5, f: 600, q: 0.5, type: 'lowpass', gain: 0.45 * s, brown: true, attack: 0.01 });
    for (let i = 0; i < 4; i++) this.noiseBurst(d, { t: delay + 0.4 + Math.random() * 2.5, dur: 1.2, f: 90 + Math.random() * 80, q: 0.7, type: 'lowpass', gain: 0.4 * s, brown: true, attack: 0.15 });
  }

  // ---- demolition charges, fireworks, horns
  explosion(pos, s = 1) {
    if (!this.ctx) return;
    const d = this.out(pos, 30);
    this.noiseBurst(d, { dur: 2.8, f: 420, q: 0.5, type: 'lowpass', gain: 1.0 * s, brown: true, attack: 0.004 });
    this.noiseBurst(d, { dur: 0.45, f: 1500, q: 0.6, gain: 0.7 * s, attack: 0.002 });
    this.noiseBurst(d, { dur: 1.2, f: 90, q: 0.7, type: 'lowpass', gain: 0.9 * s, brown: true, attack: 0.002 });
    this.tone(d, { dur: 1.1, f: 62, f2: 26, gain: 0.95 * s, attack: 0.002 });
    for (let i = 0; i < 5; i++) this.bank('stones', pos, { gain: 0.7, rate: 0.6 + Math.random() * 0.3, ref: 14, t: 0.3 + i * 0.16 + Math.random() * 0.1 });
  }
  beep(pos, urgent = false) { if (this.ctx) this.tone(this.out(pos, 5), { dur: urgent ? 0.05 : 0.08, f: urgent ? 2300 : 1900, type: 'square', gain: 0.07 }); }
  firework(pos, delay = 0) {
    if (!this.ctx) return;
    const d = this.out(pos, 60);
    this.tone(d, { t: Math.max(0, delay - 1.1), dur: 1.0, f: 700, f2: 2200, type: 'sine', gain: 0.035 });
    this.noiseBurst(d, { t: delay, dur: 1.2, f: 700, q: 0.5, type: 'lowpass', gain: 0.75, brown: true, attack: 0.003 });
    for (let i = 0; i < 12; i++) this.noiseBurst(d, { t: delay + 0.15 + Math.random() * 0.9, dur: 0.04, f: 4000 + Math.random() * 3000, q: 2, gain: 0.12 });
  }
  // an air horn that sounds while held: two detuned saws through a low-pass, per machine
  horn(key, pos, on, pitch = 1) {
    if (!this.ctx) return;
    this.horns = this.horns || new Map();
    let h = this.horns.get(key);
    const c = this.ctx, now = c.currentTime;
    if (on && !h) {
      const g = c.createGain(); g.gain.value = 0.0001;
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.8;
      const oscs = [311, 392, 466].map((f, i) => { const o = c.createOscillator(); o.type = i === 2 ? 'square' : 'sawtooth'; o.frequency.value = f * pitch; o.detune.value = (Math.random() - 0.5) * 12; o.connect(lp); o.start(); return o; });
      lp.connect(g); if (pan) { g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
      h = { g, pan, oscs, vol: 0 }; this.horns.set(key, h);
      g.gain.setTargetAtTime(1, now, 0.02);
    }
    if (!h) return;
    const sp = this.spatial(pos, 22);
    h.vol = on ? 0.16 * sp.gain : 0;
    if (h.pan) h.pan.pan.setTargetAtTime(sp.pan, now, 0.05);
    h.g.gain.setTargetAtTime(Math.max(0.0001, h.vol), now, on ? 0.02 : 0.05);
    if (!on) { for (const o of h.oscs) o.stop(now + 0.4); this.horns.delete(key); }
  }
  click() { if (this.ctx) this.tone(this.out(null), { dur: 0.05, f: 900, type: 'square', gain: 0.04 }); }
  denied() { if (this.ctx) { const d = this.out(null); this.tone(d, { dur: 0.12, f: 220, type: 'square', gain: 0.06 }); this.tone(d, { t: 0.12, dur: 0.2, f: 160, type: 'square', gain: 0.06 }); } }
  pickup(pos) { if (this.ctx) { const d = this.out(pos, 3); this.noiseBurst(d, { dur: 0.08, f: 900, q: 2, gain: 0.2 }); this.tone(d, { dur: 0.06, f: 300, f2: 420, type: 'triangle', gain: 0.08 }); } }
  throwSnd(pos) { if (this.ctx) this.noiseBurst(this.out(pos, 3), { dur: 0.2, f: 700, q: 0.6, gain: 0.12, attack: 0.06, type: 'lowpass' }); }

  // ---------- looping machinery ----------
  startLoops() {
    const c = this.ctx;
    const mk = (pos) => { const g = c.createGain(); g.gain.value = 0; const p = c.createStereoPanner ? c.createStereoPanner() : null; if (p) { g.connect(p); p.connect(this.master); } else g.connect(this.master); return { g, p, pos }; };
    // crusher: diesel + jaw rumble
    this.crusherLoop = mk(new THREE.Vector3());
    const n1 = c.createBufferSource(); n1.buffer = this.brown; n1.loop = true;
    const f1 = c.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = 260;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 38;
    const o1g = c.createGain(); o1g.gain.value = 0.12;
    const lfo = c.createOscillator(); lfo.frequency.value = 5.3; const lfog = c.createGain(); lfog.gain.value = 0.08;
    lfo.connect(lfog); lfog.connect(o1g.gain);
    const f1b = c.createBiquadFilter(); f1b.type = 'lowpass'; f1b.frequency.value = 400;
    o1.connect(f1b); f1b.connect(o1g); o1g.connect(this.crusherLoop.g);
    this.crushGain = c.createGain(); this.crushGain.gain.value = 0.3;
    n1.connect(f1); f1.connect(this.crushGain); this.crushGain.connect(this.crusherLoop.g);
    n1.start(); o1.start(); lfo.start();
    // excavator: diesel engine + hydraulic whine
    this.engineLoop = mk(new THREE.Vector3());
    const eo = c.createOscillator(); eo.type = 'sawtooth'; eo.frequency.value = 30;
    const eo2 = c.createOscillator(); eo2.type = 'square'; eo2.frequency.value = 60;
    const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 300;
    const eg = c.createGain(); eg.gain.value = 0.3;
    const eg2 = c.createGain(); eg2.gain.value = 0.05;
    eo.connect(ef); eo2.connect(eg2); eg2.connect(ef); ef.connect(eg); eg.connect(this.engineLoop.g);
    const en = c.createBufferSource(); en.buffer = this.brown; en.loop = true; const enf = c.createBiquadFilter(); enf.type = 'bandpass'; enf.frequency.value = 180; const eng = c.createGain(); eng.gain.value = 0.4;
    en.connect(enf); enf.connect(eng); eng.connect(this.engineLoop.g);
    const wo = c.createOscillator(); wo.type = 'triangle'; wo.frequency.value = 700; const wg = c.createGain(); wg.gain.value = 0;
    wo.connect(wg); wg.connect(this.engineLoop.g);
    eo.start(); eo2.start(); en.start(); wo.start();
    this.engineOsc = [eo, eo2]; this.engineFilter = ef; this.whine = wg; this.whineOsc = wo;
  }
  updateLoops(crusher, excavator) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (crusher && this.buf && !this.crushDiesel) {
      // the crusher's own diesel (recorded heavy engine, pitched down)
      const c = this.ctx, src = c.createBufferSource(); src.buffer = this.buf.engine_heavy; src.loop = true; src.playbackRate.value = 0.8;
      this.crushDiesel = c.createGain(); this.crushDiesel.gain.value = 0.9; src.connect(this.crushDiesel); this.crushDiesel.connect(this.crusherLoop.g); src.start();
    }
    if (crusher) {
      const { gain, pan } = this.spatial(crusher.pos, 9);
      this.crusherLoop.g.gain.setTargetAtTime(gain * (0.35 + crusher.load * 0.35), t, 0.2);
      if (this.crusherLoop.p) this.crusherLoop.p.pan.setTargetAtTime(pan, t, 0.1);
      this.crushGain.gain.setTargetAtTime(0.2 + crusher.load * 0.9, t, 0.15);
    }
    if (excavator) {
      const { gain, pan } = this.spatial(excavator.pos, 8);
      const on = excavator.running ? 1 : 0;
      this.engineLoop.g.gain.setTargetAtTime(gain * on * (0.45 + excavator.rpm * 0.25), t, 0.3);
      if (this.engineLoop.p) this.engineLoop.p.pan.setTargetAtTime(pan, t, 0.1);
      const f = 26 + excavator.rpm * 16;
      this.engineOsc[0].frequency.setTargetAtTime(f, t, 0.3); this.engineOsc[1].frequency.setTargetAtTime(f * 2, t, 0.3);
      this.engineFilter.frequency.setTargetAtTime(240 + excavator.rpm * 500, t, 0.3);
      this.whine.gain.setTargetAtTime(excavator.hyd * 0.025 * on, t, 0.1);
      this.whineOsc.frequency.setTargetAtTime(600 + excavator.hyd * 400, t, 0.2);
    }
    this.impactsThisFrame = 0;
  }
  // ---------- per-machine voices built from the recordings (4 nearest running machines)
  makeVoice() {
    const c = this.ctx, B = this.buf;
    const out = c.createGain(); out.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { out.connect(pan); pan.connect(this.master); } else out.connect(this.master);
    const loopSrc = (name) => {
      const src = c.createBufferSource(); src.buffer = B[name]; src.loop = true;
      const g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(out);
      src.start(c.currentTime, Math.random() * B[name].duration * 0.9);
      return { src, g };
    };
    const v = { out, pan, m: null, idle: loopSrc('engine_idle'), load: loopSrc('engine_load'), heavy: loopSrc('engine_heavy'), tracks: loopSrc('tracks'), brk: loopSrc('breaker'), beep: loopSrc('reverse_beep') };
    // hydraulic pump whine (rises with flow) and relief-valve hiss (when pushing hard)
    v.wo = c.createOscillator(); v.wo.type = 'sawtooth'; v.wo.frequency.value = 420;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 950; wf.Q.value = 4;
    v.wg = c.createGain(); v.wg.gain.value = 0; v.wo.connect(wf); wf.connect(v.wg); v.wg.connect(out); v.wo.start();
    const hn = c.createBufferSource(); hn.buffer = this.noise; hn.loop = true;
    const hf = c.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 3200; hf.Q.value = 0.9;
    v.hg = c.createGain(); v.hg.gain.value = 0; hn.connect(hf); hf.connect(v.hg); v.hg.connect(out); hn.start();
    // roller drum vibration
    v.vo = c.createOscillator(); v.vo.type = 'square'; v.vo.frequency.value = 42;
    const vf = c.createBiquadFilter(); vf.type = 'lowpass'; vf.frequency.value = 170;
    v.vg = c.createGain(); v.vg.gain.value = 0; v.vo.connect(vf); vf.connect(v.vg); v.vg.connect(out); v.vo.start();
    return v;
  }
  // list: [{ pos, running, rpm, hyd, speed, turn, vmax, tons, tracked, breaker, vibrating, beep }]
  updateMachines(list) {
    if (!this.ctx || !this.buf) return false;
    if (!this.voices) this.voices = [0, 1, 2, 3].map(() => this.makeVoice());
    const t = this.ctx.currentTime, L = this.listener;
    const want = list.filter((m) => m.running).map((m) => ({ m, d: m.pos.distanceTo(L) })).filter((x) => x.d < 110)
      .sort((a, b) => a.d - b.d).slice(0, this.voices.length).map((x) => x.m);
    for (const v of this.voices) if (v.m && !want.includes(v.m)) v.m = null;
    for (const m of want) if (!this.voices.some((v) => v.m === m)) { const v = this.voices.find((x) => !x.m); if (v) v.m = m; }
    for (const v of this.voices) {
      const m = v.m, set = (param, val, tc = 0.15) => param.setTargetAtTime(val, t, tc);
      if (!m) { set(v.out.gain, 0, 0.4); continue; }
      const { gain, pan } = this.spatial(m.pos, 7 + Math.min(60, m.tons) * 0.2);
      if (v.pan) set(v.pan.pan, pan, 0.05);
      set(v.out.gain, gain * 0.95, 0.3);
      const big = m.tons >= 16;
      const r0 = Math.min(1.12, Math.max(0.74, Math.pow(5.5 / Math.max(1, m.tons), 0.16)));
      const load = Math.min(1, m.hyd * 0.9 + Math.abs(m.speed) / Math.max(1, m.vmax) * 0.8);
      const rate = r0 * (0.92 + m.rpm * 0.3);
      set(v.idle.src.playbackRate, rate); set(v.idle.g.gain, 0.75 * (1 - load * 0.75));
      if (big) { set(v.heavy.src.playbackRate, r0 * 1.12 * (0.85 + m.rpm * 0.3)); set(v.heavy.g.gain, load * 0.95); set(v.load.g.gain, load * 0.22); set(v.load.src.playbackRate, rate * 0.9); }
      else { set(v.load.src.playbackRate, rate * 0.96); set(v.load.g.gain, load * 0.95); set(v.heavy.g.gain, 0); }
      const tr = m.tracked ? Math.min(1, Math.abs(m.speed) / 2.2 + Math.abs(m.turn || 0) * 0.4) : 0;
      set(v.tracks.g.gain, tr * 0.85); set(v.tracks.src.playbackRate, r0 * (0.8 + Math.min(1, Math.abs(m.speed) / 3) * 0.35));
      set(v.brk.g.gain, m.breaker ? 1.1 : 0, 0.04); set(v.brk.src.playbackRate, Math.sqrt(r0));
      set(v.beep.g.gain, m.beep ? 0.45 : 0, 0.05);
      set(v.wo.frequency, (300 + m.hyd * 380) / r0); set(v.wg.gain, m.hyd * 0.03); set(v.hg.gain, m.hyd * m.hyd * 0.045);
      set(v.vg.gain, m.vibrating ? 0.28 : 0, 0.2);
    }
    return true;
  }
}
