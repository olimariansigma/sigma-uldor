// Fully synthesized sound (Web Audio) - no audio files needed.
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
  }
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
      this.noiseBurst(d, { dur: 0.12 + s * 0.15, f: 700 * v, q: 1.2, gain: 0.5 * s });
      this.noiseBurst(d, { dur: 0.06, f: 2600 * v, q: 2, gain: 0.18 * s });
      this.tone(d, { dur: 0.12, f: 120 * v, f2: 60, gain: 0.35 * s });
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
    if (hit) {
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
    if (!this.ctx) return;
    const d = this.out(pos, 6);
    this.noiseBurst(d, { dur: 0.06, f: 2400, q: 1.5, gain: 0.45 * s });
    this.tone(d, { dur: 0.05, f: 180, f2: 90, type: 'square', gain: 0.12 * s });
    this.noiseBurst(d, { dur: 0.1, f: 600, q: 1, gain: 0.25 * s });
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
}
