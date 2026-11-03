import * as THREE from 'three';
import { EXTERIOR } from './detail.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { setAnisotropy, setPack } from './textures.js';
import { materials } from './materials.js';
import { TypeRegistry } from './pieces.js';
import { buildWorld } from './world.js';
import { DayNight, CYCLES, MORNING } from './daynight.js';
import { Charges, celebrate, MAX_CHARGES } from './fun.js';
import { BrickPress, BRICK_KG } from './brickpress.js';
import { Builder, MORTAR_KG } from './build.js';
import { paintOf } from './mx-vehicles.js';
import { Traffic } from './traffic.js';
import { Weather, WEATHERS } from './weather.js';
import { encodeFloats, decodeFloats, encodeSnapshot, decodeSnapshot, kindOf, PLAYER_F, MACHINE_F } from './netcodec.js';
import { SITE, inWater, lakeDist, terrainHeight } from './site.js';
import { Demolition, INTACT, LOOSE, HELD, CARRIED, GONE, RUBBLE, BRICKS } from './demolition.js';
import { BUILDINGS } from './buildings.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Crusher, fmtKg, KG } from './crusher.js';
import { IntakeLine } from './intake.js';
import { Mixer } from './mixer.js';
import { Road } from './road.js';
import { Machine, MACHINES, BASE_MACHINES, controlsFor } from './machines.js';
import { Contracts } from './contracts.js';
import { Progression, machinePrice, BUILDING_PRICE, TOOLS, PROG_KEY } from './progression.js';
import { machineInteract, releaseAll, heldWorld } from './machineLogic.js';
import { Showroom } from './showroom.js';
import { Slabs, SLAB, SLAB_KG } from './slabs.js';
import { loadTexturePack } from './texpack.js';
import { renderLogo } from './logo3d.js';
import { Player } from './player.js';
import { Avatar, SHIRTS } from './avatar.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Net } from './net.js';

const PREFIX = 'wreckingyard.v2.';
const $ = (id) => document.getElementById(id);
const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const clamp = THREE.MathUtils.clamp;
const BUCKET = 50;
const TROWEL = 1150; // cement the trowel holds (simulation units, 10 kg in game weight)
const NET_HZ = 20;
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function progress(p, text) { $('loadfill').style.width = (p * 100) + '%'; if (text) $('loadtext').textContent = text; }
function loadPrefs() {
  const def = { quality: null, volume: 0.8, sens: 1, invert: false, name: '', hammer: 1, carry: 8, day: 'normal', traffic: true, weather: 'auto' };
  try { return { ...def, ...(JSON.parse(localStorage.getItem(PREFIX + 'prefs')) || {}) }; } catch (e) { return def; }
}

class Game {
  // ======================================================================= boot
  async init() {
    this.prefs = loadPrefs();
    const touch = 'ontouchstart' in window || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const qp = new URLSearchParams(location.search).get('q');
    if (qp) this.prefs.quality = qp;
    if (!this.prefs.quality) this.prefs.quality = touch ? 'medium' : 'high';
    const q = this.prefs.quality;

    progress(0.05, 'Starting physics engine…');
    await RAPIER.init();
    await frame();
    this.thumbMode = new URLSearchParams(location.search).has('thumbs');
    const renderer = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: this.thumbMode });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    $('game').appendChild(renderer.domElement);
    this.renderer = renderer;
    setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 3000);
    this.camera.layers.enable(EXTERIOR); // guard grids, wipers, glass: hidden only in the cab view
    window.addEventListener('resize', () => this.resize());

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    this.physics = { world, R: RAPIER, events: new RAPIER.EventQueue(true) };

    progress(0.12, 'Loading HD textures…');
    await frame();
    try {
      const pack = await loadTexturePack(q, Math.min(8, renderer.capabilities.getMaxAnisotropy()), (f) => progress(0.12 + f * 0.12, 'Loading HD textures…'));
      if (pack) setPack(pack);
      this.hdTextures = !!pack;
    } catch (e) { this.hdTextures = false; }
    progress(0.25, 'Casting cinder blocks…');
    await frame();
    this.M = materials();
    progress(0.3, 'Filling the lake…');
    await frame();
    this.types = new TypeRegistry(this.M);
    this.env = buildWorld(this.scene, renderer, this.physics, this.M);
    this.dn = new DayNight(this.scene, this.env, this.M, renderer);
    this.dn.camera = this.camera;
    this.dn.onPhase = (night) => { if (this.running && this.dn.cycle > 0) this.ui.toast(night ? '🌙 Night shift: lamps and work lights are on' : '☀️ Good morning!', true, 3500); };
    this.applyQuality(q);
    this.resize();
    progress(0.5, 'Delivering machinery…');
    await frame();
    this.fx = new FX(this.scene);
    this.audio = new Audio(); this.audio.setVolume(this.prefs.volume);
    this.sfx = this.makeSfx();
    this.demo = new Demolition(this.scene, this.physics, this.types, this.sfx, true);
    this.crusher = new Crusher(this.scene, this.physics, this.M, SITE.crusherPos, SITE.crusherRot);
    this.intake = new IntakeLine(this.scene, this.physics, this.M, this.crusher);
    this.mixer = new Mixer(this.scene, this.physics, this.M, SITE.mixerPos);
    this.press = new BrickPress(this.scene, this.physics, this.M, SITE.pressPos, 0);
    this.road = new Road(this.scene);
    this.slabs = new Slabs(this.scene);
    this.slabGhost = new THREE.Mesh(new THREE.BoxGeometry(SLAB, 0.04, SLAB), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    this.slabGhost.visible = false; this.slabGhost.renderOrder = 3; this.scene.add(this.slabGhost);
    this.tool = 'hammer';
    this.machines = new Map(); this.nextMachineId = 1;
    this.horns = new Set();
    this.plots = SITE.plots.map(() => null); this.buildingStatics = new Map(); this.groundHandles = new Set();
    this.settings = { hammer: this.prefs.hammer, carry: this.prefs.carry, crusher: 3, grapple: 1 };
    this.net = new Net(); this.setupNet();
    this.myId = 0; this.myName = this.prefs.name || 'Player' + Math.floor(Math.random() * 900 + 100);
    this.players = new Map();
    this.bucket = { kind: null, kg: 0, color: new THREE.Color(0.5, 0.5, 0.5) };
    this.events = [];
    this.player = new Player(this, SITE.playerSpawn, SHIRTS[0]);
    this.charges = new Charges(this);
    this.builder = new Builder(this);
    this.traffic = new Traffic(this);
    this.traffic.setOn(this.prefs.traffic);
    this.weather = new Weather(this);
    this.player.avatar.setHammer(this.settings.hammer);
    this.addPlayerEntry(0, this.myName, SHIRTS[0], true);
    progress(0.7, 'Building the houses…');
    await frame();
    this.input = new Input(renderer.domElement);
    this.input.sensitivity = this.prefs.sens; this.input.invertY = this.prefs.invert;
    this.ui = new UI(this);
    this.contracts = new Contracts(this);
    this.input.onPad = (id) => { document.body.classList.toggle('pad', !!id); if (id) this.ui.toast('🎮 Controller connected. <b>Start</b> menu · <b>Back</b> help (controls are listed there)', true, 5000); else this.ui.toast('🎮 Controller disconnected'); };
    this.showroom = new Showroom(this);
    this.newWorld();
    this.mode = 'foot'; this.driving = null;
    this.cam = { yaw: 0.2, pitch: -0.22, dist: 4.4, exYaw: 0, exPitch: -0.3, exDist: 12, cab: false, cabYaw: 0, cabPitch: -0.1 };
    progress(0.92, 'Compiling shaders…');
    await frame();
    this.updateCamera(0.016);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    progress(1, 'Ready!');
    this.setupSettings();
    this.setupTitle(touch);
  }

  // live 3D title backdrop: slow cinematic orbit around the yard behind the menu
  startTitleScene() {
    if (this.thumbMode) return;
    this.titleLive = true;
    const t0 = performance.now();
    let lastT = 0;
    const loop = (t) => {
      if (!this.titleLive) return;
      requestAnimationFrame(loop);
      this.input.pollPad(Math.min(0.05, (t - (lastT || t)) / 1000), false); lastT = t;
      if (this.input.padPressed.size) this.ui.padNav(this.input.padPressed, $('titleMenu'));
      this.input.pressedSet.clear(); // pad presses on the title must not fire in-game actions when play starts
      const k = (t - t0) / 1000, a = 0.35 + Math.sin(k * 0.03) * 0.55;
      this.camera.position.set(-6 + Math.sin(a) * 62, 13 + Math.sin(k * 0.11) * 3, -84 + Math.cos(a) * 62);
      this.camera.lookAt(-8, 5, -84);
      for (const m of this.machines.values()) m.idle(1 / 60, false);
      this.traffic.update(1 / 60);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
    setTimeout(() => $('title').classList.add('live'), 300);
  }

  setupTitle(touch) {
    $('loadwrap').classList.add('hidden');
    $('titleMenu').classList.remove('hidden');
    $('nameInput').value = this.myName;
    this.startTitleScene();
    const start = () => {
      if (this.started) return; this.started = true;
      this.titleLive = false;
      this.setName($('nameInput').value);
      $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
      if (touch) { document.body.classList.add('touch'); $('touch').classList.remove('hidden'); this.input.bindTouchUI(); }
      this.audio.init();
      this.ui.setMode('foot', this.input.touch);
      if (!this.input.touch && this.renderer.domElement.requestPointerLock) { try { const r = this.renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* needs a gesture */ } }
      // once per version: point at what is new
      if (this.prefs.seenTips && this.prefs.news !== '5.0') {
        this.ui.toast('📋 New in 5.0: <b>Contracts</b>! Paid jobs, cash and promotions. Press <b>J</b> or tap the cash box top left', true, 9000);
        setTimeout(() => this.ui.toast('🏗️ The brick press got rebuilt, and a cement silo and water tank now stand by the mixer', true, 6000), 9200);
      }
      this.prefs.news = '5.0'; this.savePrefs();
      if (!this.prefs.seenTips) {
        this.ui.toast('🔨 ' + (touch ? 'Tap 🔨' : 'Click') + ' to smash blocks · ' + (touch ? '✋' : '<b>Q</b>') + ' pick up · ' + (touch ? '🧱' : '<b>G</b>') + ' throw into the crusher', false, 6000);
        setTimeout(() => this.ui.toast('🏗️ Open <b>Spawn</b> to inspect and bring in any of 36 machines or new buildings', false, 6000), 6200);
        setTimeout(() => this.ui.toast('🌐 <b>Multiplayer</b>: host a game and share the code with friends', true, 6000), 12500);
        this.prefs.seenTips = true; this.savePrefs();
      }
      // compile every material now (not when it first comes into view), so play starts without hitches
      try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* older drivers: compile lazily */ }
      this.last = performance.now();
      if (!this.running) { this.running = true; requestAnimationFrame((t) => this.loop(t)); }
    };
    $('playBtn').addEventListener('click', start, { once: true });
    // progression: its own world and wallet
    let pv = null; try { pv = JSON.parse(localStorage.getItem(PROG_KEY)); } catch (e) { pv = null; }
    if (pv) $('progSub').textContent = 'continue · ' + fmtMoney(pv.money);
    $('progBtn').addEventListener('click', () => { if (this.started) return; this.startProgression(); start(); this.progIntro(); }, { once: true });
    $('titleJoin').addEventListener('click', async () => {
      const code = $('titleCode').value.trim();
      if (code.length < 6) { $('titleMsg').textContent = 'Enter the 6-letter code from your friend'; return; }
      $('titleMsg').textContent = 'Connecting…';
      this.setName($('nameInput').value);
      try { await this.joinGame(code, true); start(); } catch (e) { $('titleMsg').textContent = '❌ ' + e.message; }
    });
  }

  applyQuality(q) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) * 0.8 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    this.quality = q;
    const s = q === 'low' ? 1024 : q === 'medium' ? 2048 : 4096;
    const sh = this.env.sun.shadow;
    if (sh.mapSize.x !== s) { sh.mapSize.set(s, s); if (sh.map) { sh.map.dispose(); sh.map = null; } }
    if (this.fx) this.fx.quality = q === 'low' ? 0.5 : 1;
    if (this.dn && this.dn.quality !== q) { this.dn.quality = q; this.dn.setQuality(q); }
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.baseFov = w / h < 1 ? 75 : 62; this.camera.aspect = w / h; this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
  }
  // seconds per day: the host's choice in multiplayer, your own otherwise (0 = always day)
  dayCycle() { return this.net && this.net.isClient ? (this.hostCycle || 0) : CYCLES[this.prefs.day] || 0; }
  savePrefs() { try { localStorage.setItem(PREFIX + 'prefs', JSON.stringify(this.prefs)); } catch (e) { /* ignore */ } }
  setupSettings() {
    const s = this.prefs;
    $('optQuality').value = s.quality; $('optVolume').value = s.volume; $('optSens').value = s.sens; $('optInvert').checked = s.invert;
    $('optQuality').addEventListener('change', (e) => { s.quality = e.target.value; this.applyQuality(s.quality); this.savePrefs(); });
    $('optVolume').addEventListener('input', (e) => { s.volume = +e.target.value; this.audio.setVolume(s.volume); this.savePrefs(); });
    $('optSens').addEventListener('input', (e) => { s.sens = +e.target.value; this.input.sensitivity = s.sens; this.savePrefs(); });
    $('optInvert').addEventListener('change', (e) => { s.invert = e.target.checked; this.input.invertY = s.invert; this.savePrefs(); });
    if (!(s.day in CYCLES)) s.day = 'normal';
    $('optDay').value = s.day;
    $('optDay').addEventListener('change', (e) => { s.day = e.target.value; this.savePrefs(); this.todTimer = 0; });
    if (!WEATHERS.includes(s.weather)) s.weather = 'auto';
    $('optWeather').value = s.weather;
    $('optWeather').addEventListener('change', (e) => { s.weather = e.target.value; this.savePrefs(); if (s.weather === 'auto') this.weather.autoT = 0; });
    $('optTraffic').checked = s.traffic !== false;
    $('optTraffic').addEventListener('change', (e) => { s.traffic = e.target.checked; this.traffic.setOn(s.traffic); this.savePrefs(); });
    $('optSkip').addEventListener('click', () => {
      if (this.net.isClient) { this.ui.toast('Only the host can change the time'); return; }
      if (!this.dayCycle()) { this.ui.toast('Turn on day & night first'); return; }
      this.dn.skip(0.125); this.todTimer = 0;
    });
    $('fullscreenBtn').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); });
  }
  setName(n) {
    n = (n || '').trim().slice(0, 16) || this.myName;
    this.myName = n; this.prefs.name = n; this.savePrefs();
    const me = this.players.get(this.myId); if (me) me.name = n;
  }
  setLocal(key, value) { this.settings[key] = value; this.prefs[key] = value; this.savePrefs(); if (key === 'hammer') this.player.avatar.setHammer(value); }

  // ======================================================================= effects (played locally, mirrored to clients)
  makeSfx() {
    const g = this;
    const C = (c) => (typeof c === 'number' ? c : c.getHex ? c.getHex() : c);
    const A = (v) => (v ? [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] : null);
    const emit = (e) => { if (g.net && g.net.isHost && g.events.length < 400) g.events.push(e); };
    return {
      chips(p, d, c, n, size, speed) { g.fx.chips(p, d || new THREE.Vector3(), C(c), n, size, speed); emit(['fx', 'c', A(p), A(d), C(c), n, size, speed]); },
      dust(p, c, n, spread, o) { g.fx.dust(p, C(c), n, spread, o); emit(['fx', 'd', A(p), C(c), n, spread, o || null]); },
      glass(p) { g.fx.glass(p); g.audio.glass(p); emit(['fx', 'g', A(p)]); },
      impact(k, s, p) { g.audio.impact(k, s, p); emit(['fx', 'i', k, s, A(p)]); },
      collapse(s, p) { g.audio.collapse(s, p); emit(['fx', 'x', s, A(p)]); },
      splash(p, s) { g.audio.splash(p, s); emit(['fx', 's', A(p), s]); },
      breaker(p, s) { g.audio.breaker(p, s); emit(['fx', 'b', A(p), s]); },
      clank(p, s) { g.audio.clank(p, s); emit(['fx', 'k', A(p), s]); },
      tool(k, p, s) { g.audio.tool(k, p, s); emit(['fx', 't', k, A(p), s]); },
    };
  }
  playFx(e) {
    const V = (a) => (a ? v3(a) : null);
    switch (e[1]) {
      case 'c': this.fx.chips(V(e[2]), V(e[3]) || new THREE.Vector3(), e[4], e[5], e[6], e[7]); break;
      case 'd': this.fx.dust(V(e[2]), e[3], e[4], e[5], e[6] || undefined); break;
      case 'g': this.fx.glass(V(e[2])); this.audio.glass(V(e[2])); break;
      case 'i': this.audio.impact(e[2], e[3], V(e[4])); break;
      case 'x': this.audio.collapse(e[2], V(e[3])); break;
      case 's': this.audio.splash(V(e[2]), e[3]); break;
      case 'b': this.audio.breaker(V(e[2]), e[3]); break;
      case 'k': this.audio.clank(V(e[2]), e[3]); break;
      case 't': this.audio.tool(e[2], V(e[3]), e[4]); break;
    }
  }

  // blocks set down by a machine (or dropped) that come to rest upright on mortar stick there
  glueSettled() {
    let any = false;
    const up = new THREE.Vector3();
    for (const p of this.demo.pieces) {
      if (!p.brick || p.state !== LOOSE || !p.body || !p.body.isSleeping()) continue;
      up.set(0, 1, 0).applyQuaternion(p.quat);
      if (Math.abs(up.y) < 0.97) continue;
      const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quat), rot = Math.abs(fwd.x) > Math.abs(fwd.z) ? 0 : 1;
      const glue = this.builder.splashesFor(p.pos, rot, p);
      if (!glue.length) continue;
      this.demo.setIntact(p, p.pos.clone(), p.quat.clone()); this.builder.take(glue); any = true;
    }
    return any;
  }

  // ======================================================================= brick press
  pressCb() {
    return this._pressCb || (this._pressCb = {
      take: (kg) => { const got = this.crusher.take(kg); if (got.kg > 0) this.events.push(['take', got.kg]); return got; },
      spawn: (pos, quat, color) => {
        const p = this.demo.freeBrick(); if (!p) return false;
        this.demo.revive(p, pos, quat, color, BRICK_KG); this.demo.setState(p, LOOSE);
        return true;
      },
    });
  }

  // ======================================================================= fun: blasts, horns, celebrations
  boomFx(ctr) {
    const near = this.demo.piecesInSphere(ctr, 3, [0, 1]);
    const col = near.length ? this.demo.dustColor(near[0]) : 0x8a8278;
    this.fx.explosion(ctr, col);
    this.audio.explosion(ctr);
    // the blast wave shoves you about and shakes the camera
    const me = this.player.pos, d = me.clone().sub(ctr), dist = d.length();
    if (dist < 14) this.player.shake = Math.max(this.player.shake || 0, 0.6 * (1 - dist / 14));
    if (this.mode === 'foot' && dist < 6) { d.y = 0.6; d.normalize(); this.player.vel.addScaledVector(d, (6 - dist) * 1.6); }
  }
  hornPitch(m) { return THREE.MathUtils.clamp(1.3 - (m.spec.tons || 20) / 90, 0.82, 1.28); }
  setHorn(id, on) {
    const m = this.machines.get(id);
    if (on && m) { this.horns.add(id); this.audio.horn(id, m.pos, true, this.hornPitch(m)); }
    else { this.horns.delete(id); this.audio.horn(id, m ? m.pos : null, false); }
  }
  // fireworks when a building is down to its last few blocks (the host notices and tells everyone)
  checkCleared() {
    for (const b of this.demo.buildings) {
      if (b.removed || b.pool || b.plot < 0) continue;
      let intact = 0;
      for (let i = b.start; i < b.start + b.count; i++) if (this.demo.pieces[i].state === 0) intact++;
      const done = intact / b.count < 0.04;
      if (b.cleared === undefined) { b.cleared = done; continue; }   // already flat when loaded: no party
      if (done && !b.cleared) { b.cleared = true; this.events.push(['party', b.id]); this.party(b.id); }
      else if (!done) b.cleared = false;
    }
  }
  party(bid) {
    const b = this.demo.buildings[bid]; if (!b || b.plot < 0) return;
    const def = BUILDINGS.find((x) => x.id === b.def);
    celebrate(this, SITE.plots[b.plot], `${def ? def.name : 'The building'} on plot ${SITE.plotNames[b.plot]}`);
  }

  // ======================================================================= helpers
  get authority() { return !this.net.isClient; }
  inWater(x, y, z) { return inWater(x, y, z); }
  spawnPoint() { return SITE.playerSpawn.clone(); }
  machineSpecs() { return BASE_MACHINES; }
  playerName(id) { const p = this.players.get(id); return p ? p.name : '?'; }
  plotName(i) { const b = this.plots[i] != null ? this.demo.buildings[this.plots[i]] : null; return b && !b.removed ? (BUILDINGS.find((d) => d.id === b.def) || {}).name : 'empty'; }
  // blocks a player carries. Asked many times a frame, so the scan over every block is redone only after some
  // block changed state (demo.stateVer)
  carriedBy(pid) {
    const v = this.demo.stateVer || 0;
    if (this._carV !== v || !this._car) {
      this._carV = v; const map = this._car = new Map();
      for (const p of this.demo.pieces) if (p.state === CARRIED) { let a = map.get(p.holder); if (!a) map.set(p.holder, a = []); a.push(p); }
    }
    const a = this._car.get(pid);
    return a ? a.slice() : [];
  }

  addPlayerEntry(id, name, shirt, local = false) {
    const e = { id, name, shirt, local, pos: new THREE.Vector3().copy(SITE.playerSpawn), yaw: 0, speed: 0, grounded: true, swingT: -1, driving: -1, bucket: { kind: null, kg: 0, color: new THREE.Color(0.5, 0.5, 0.5) }, cement: { kg: 0, color: new THREE.Color(0.6, 0.6, 0.6) }, target: null };
    if (local) e.avatar = this.player.avatar;
    else { e.avatar = new Avatar(this.scene, { shirt, name }); }
    this.players.set(id, e);
    return e;
  }
  removePlayerEntry(id) {
    const e = this.players.get(id); if (!e) return;
    if (!e.local && e.avatar) e.avatar.dispose();
    this.players.delete(id);
  }

  // ======================================================================= world construction
  buildBuilding(defId, plot) {
    if (defId === RUBBLE) return this.demo.addRubblePool();
    if (defId === BRICKS) return this.demo.addBrickPool();
    const def = BUILDINGS.find((b) => b.id === defId);
    const at = SITE.plots[plot], S = SITE.buildScale || 1;
    // authored at 1:1 around the origin, then built S times bigger on the plot
    const b = def.build(this.types, this.M, { x: 0, z: 0 });
    const off = new THREE.Vector3(at.x, 0, at.z);
    for (const sp of b.specs) { sp.pos.multiplyScalar(S).add(off); sp.size.multiplyScalar(S); }
    for (const st of b.statics) { st.pos.multiplyScalar(S).add(off); st.size.multiplyScalar(S); }
    const bld = this.demo.addBuilding(defId, plot, b.specs, 0.15 * S, S);
    const group = new THREE.Group();
    for (const d of b.decor) { const m = new THREE.Mesh(d.geo, d.mat); m.scale.setScalar(S); m.position.copy(off); m.castShadow = true; m.receiveShadow = true; group.add(m); }
    this.scene.add(group);
    const body = this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const handles = [], rects = [];
    for (const s of b.statics) {
      const c = this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(s.size.x / 2, s.size.y / 2, s.size.z / 2).setTranslation(s.pos.x, s.pos.y, s.pos.z), body);
      handles.push(c.handle); this.groundHandles.add(c.handle);
      rects.push({ x0: s.pos.x - s.size.x / 2, x1: s.pos.x + s.size.x / 2, z0: s.pos.z - s.size.z / 2, z1: s.pos.z + s.size.z / 2, y: s.pos.y + s.size.y / 2 });
    }
    this.buildingStatics.set(bld.id, { group, body, handles, rects });
    this.plots[plot] = bld.id;
    return bld;
  }
  removeBuildingFull(bid) {
    const st = this.buildingStatics.get(bid);
    if (st) { this.scene.remove(st.group); this.physics.world.removeRigidBody(st.body); this.buildingStatics.delete(bid); for (const h of st.handles) this.groundHandles.delete(h); }
    for (const m of this.machines.values()) m.held = m.held.filter((h) => h.p.b !== bid);
    this.demo.removeBuilding(bid);
    this.plots = this.plots.map((p) => (p === bid ? null : p));
  }

  createMachine(specId, id, pos, yaw) {
    const spec = MACHINES.find((m) => m.id === specId);
    const m = new Machine(this.machineCtx(), spec, id, pos, yaw);
    this.machines.set(id, m);
    this.nextMachineId = Math.max(this.nextMachineId, id + 1);
    return m;
  }
  machineCtx() {
    if (this._mctx) return this._mctx;
    const g = this, terrain = this.env.terrainCollider;
    this._mctx = {
      scene: this.scene, physics: this.physics, M: this.M, terrainCollider: terrain,
      groundAt: (x, z) => g.groundAt(x, z),
      isGround: (c) => c.handle === terrain.handle || g.groundHandles.has(c.handle) || g.env.groundHandles.includes(c.handle),
      isPiece: (c) => g.demo.byCollider.has(c.handle),
      // the water cannon's jet: first thing along the ray that is not a machine (blocks held by machines count)
      castJet: (o, dir, max) => {
        const hit = g.physics.world.castRay(new RAPIER.Ray(o, dir), max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined,
          (c) => { const b = c.parent(); return !(b && b.isKinematic() && !g.demo.byCollider.has(c.handle)); });
        let t = hit ? hit.timeOfImpact ?? hit.toi : max, collider = hit ? hit.collider : null;
        // rays miss the terrain heightfield: march along the jet against the ground height
        for (let s = 0.2; s < t; s += 0.2) if (o.y + dir.y * s < g.groundAt(o.x + dir.x * s, o.z + dir.z * s)) { t = s; collider = null; break; }
        return t < max ? { t, collider } : null;
      },
    };
    return this._mctx;
  }
  // terrain + building foundations (machines drive up onto the slabs)
  groundAt(x, z) {
    let h = terrainHeight(x, z);
    for (const st of this.buildingStatics.values()) for (const r of st.rects) if (x > r.x0 - 0.3 && x < r.x1 + 0.3 && z > r.z0 - 0.3 && z < r.z1 + 0.3) h = Math.max(h, r.y);
    const P = SITE.buildPlot; // the house slab across the road
    if (Math.abs(x - P.x) < P.w / 2 + 0.3 && Math.abs(z - P.z) < P.d / 2 + 0.3) h = Math.max(h, P.top);
    return h;
  }
  destroyMachine(id) {
    const m = this.machines.get(id); if (!m) return;
    if (this.authority) releaseAll(m, this.demo, 0.016);
    if (this.driving === m) this.exitLocal();
    m.destroy(); this.machines.delete(id);
  }

  findMachineSpot(near, spec) {
    const r = ({ crane: 4.6, roller: 3.0, paver: 3.0, loader: 4.2, dozer: 3.4, dumper: 2.4, truck: 5.2 }[spec.family] || (spec.under === 'pontoon' ? 4.2 : 2.8)) * spec.scale;
    const terrain = this.env.terrainCollider;
    const free = (x, z) => {
      if (x < SITE.lotMin.x + r || x > SITE.lotMax.x - r || z < SITE.lotMin.y + r || z > SITE.lotMax.y - r) return false;
      if (!spec.amphibious && lakeDist(x, z) < 1.4) return false;
      for (const m of this.machines.values()) if (Math.hypot(m.pos.x - x, m.pos.z - z) < (m.radius * m.s + r) * 0.9) return false;
      let hit = false;
      this.physics.world.intersectionsWithShape({ x, y: 1.4 * spec.scale + 0.3, z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Cylinder(1.2 * spec.scale + 0.2, r), (c) => { if (this.machineCtx().isGround(c)) return true; hit = true; return false; }, RAPIER.QueryFilterFlags.ONLY_FIXED);
      return !hit;
    };
    for (let ring = 0; ring < 14; ring++) {
      const n = Math.max(1, ring * 6);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, d = ring * 3;
        const x = near.x + Math.cos(a) * d, z = near.z + Math.sin(a) * d;
        if (free(x, z)) return new THREE.Vector3(x, 0, z);
      }
    }
    return null;
  }

  // ---- progression mode
  startProgression() {
    this.prog = new Progression(this);
    document.body.classList.add('prog');
    this.road.noHoles = true;
    let w = null; try { w = JSON.parse(localStorage.getItem(PREFIX + 'slot.prog')); } catch (e) { w = null; }
    if (w && !this.prog.fresh) { this.loadWorld(w, { forSave: true }); this.player.teleport(this.spawnPoint()); }
    else this.newProgWorld();
    this.road.restore([]); // never any potholes here
    this.prog.apply(); this.prog.resync();
    $('spawnBtn').title = 'Shop (B)'; $('spawnBtn').querySelector('span').textContent = 'Shop';
    const save = () => this.progSave();
    window.addEventListener('pagehide', save); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  }
  progSave() { if (this.prog && !this.prog.dead) { this.saveSlot('prog', true); this.prog.save(); } }
  newProgWorld() {
    this.clearWorld();
    this.dn.p = MORNING; this.dn.apply();
    this.buildBuilding('bungalow', 0);
    this.buildBuilding(RUBBLE, -1);
    this.buildBuilding(BRICKS, -1);
    this.player.teleport(this.spawnPoint());
  }
  progIntro() {
    const t = this.input.touch;
    if (this.prog.fresh) {
      this.ui.toast('🔨 <b>Progression</b>: you start with just a hammer and ' + fmtMoney(this.prog.money) + '. Smash the bungalow, ' + (t ? 'pick blocks up' : 'pick blocks up with <b>Q</b>') + ' and ' + (t ? 'throw them' : 'throw them (<b>G</b>)') + ' into the crusher: every kg crushed pays $3', true, 10000);
      setTimeout(() => this.ui.toast('🛒 Open the <b>Shop</b> (' + (t ? 'Spawn button' : '<b>B</b>') + ') to buy tools, machines and new buildings to knock down', true, 7000), 10200);
      setTimeout(() => this.ui.toast('🏠 Later: press the dust into blocks and build your own house across the road. Every block pays $30 and house milestones pay big bonuses. Help (<b>H</b>) explains how', true, 8000), 17500);
    } else this.ui.toast('🔨 Progression: welcome back! ' + fmtMoney(this.prog.money) + ' in the bank', true, 5000);
  }

  // default sandbox world
  newWorld() {
    this.clearWorld();
    this.dn.p = MORNING; this.dn.apply();
    this.buildBuilding('bungalow', 0);
    this.buildBuilding('wall', 1);
    this.buildBuilding('warehouse', 2);
    this.buildBuilding(RUBBLE, -1);
    this.buildBuilding(BRICKS, -1);
    this.road.defaultHoles();
    const add = (spec, x, z, yaw) => { const m = this.createMachine(spec, this.nextMachineId, new THREE.Vector3(x, 0, z), yaw); return m; };
    add('tx330', -62, -52, Math.PI);
    add('bg90', -14, -54, Math.PI);
    add('hr450', 52, -55, Math.PI);
    add('wh75', -36, -20, Math.PI);
    add('amx', 27, -14, Math.PI / 2);
    add('lc200', 18, 14, -Math.PI / 2);
    add('cr64', 4, 21, Math.PI / 2);
    add('tk410', -10, -8, Math.PI / 2);
    add('lp20', 15, 19.5, Math.PI / 2);
    this.player.teleport(this.spawnPoint());
  }

  clearWorld() {
    for (const id of [...this.machines.keys()]) this.destroyMachine(id);
    for (const bid of [...this.buildingStatics.keys()]) { const st = this.buildingStatics.get(bid); this.scene.remove(st.group); this.physics.world.removeRigidBody(st.body); }
    this.buildingStatics.clear(); this.groundHandles.clear();
    this.demo.clearAll();
    if (this.charges) this.charges.clear();
    if (this.builder) this.builder.restore([]);
    if (this.press) this.press.restore(null);
    this.plots = SITE.plots.map(() => null);
    this.crusher.restore({ layers: [], totalKg: 0, count: 0, tally: [] });
    this.intake.restore(null);
    this.mixer.empty();
    this.road.restore([]);
    this.slabs.clear();
    this.nextMachineId = 1;
    for (const p of this.players.values()) p.bucket.kind = null;
    this.bucket.kind = null; this.bucket.kg = 0;
  }

  serializeWorld(forSave = false) {
    return {
      v: 3,
      buildings: this.demo.buildings.map((b) => ({ def: b.def, plot: b.plot, removed: b.removed })),
      plots: this.plots,
      pieces: this.demo.serializePieces(),
      machines: [...this.machines.values()].map((m) => m.serialize()),
      crusher: this.crusher.serialize(), intake: this.intake.serialize(), mixer: this.mixer.serialize(), road: this.road.serialize(), slabs: this.slabs.serialize(),
      settings: { crusher: this.settings.crusher, grapple: this.settings.grapple },
      players: forSave ? [] : [...this.players.values()].map((p) => ({ id: p.id, name: p.name, shirt: p.shirt, driving: p.driving, bucket: [p.bucket.kind, p.bucket.kg, p.bucket.color.r, p.bucket.color.g, p.bucket.color.b], cement: [p.cement.kg, p.cement.color.r, p.cement.color.g, p.cement.color.b] })),
      nextMachineId: this.nextMachineId,
      time: Math.round(this.dn.p * 1e4) / 1e4, cycle: this.dayCycle(), weather: this.weather.state,
      charges: forSave ? [] : this.charges.pack(),
      press: this.press.serialize(),
      splashes: this.builder.pack(),
    };
  }

  loadWorld(w, { forSave = false, mirror = false } = {}) {
    if (this.driving) this.exitLocal(true);
    this.clearWorld();
    this.demo.authority = !mirror;
    // saves from before v3.2 used small buildings on other plots: keep everything else, rebuild the plots fresh
    const legacy = !w.v || w.v < 3;
    if (legacy) { this.buildBuilding('bungalow', 0); this.buildBuilding('wall', 1); this.buildBuilding('warehouse', 2); }
    else {
      for (const b of w.buildings) {
        const bld = this.buildBuilding(b.def, b.plot);
        if (b.removed) this.removeBuildingFull(bld.id);
      }
      this.plots = w.plots.slice();
      this.demo.restorePieces(w.pieces, forSave);
    }
    // saves from before v3.7 have no rubble pool: add it after everything else so piece ids stay put
    if (!this.demo.buildings.some((b) => b.def === RUBBLE)) this.buildBuilding(RUBBLE, -1);
    // saves from before v4.2 have no brick pool either (added last, so every other id stays put)
    if (!this.demo.buildings.some((b) => b.def === BRICKS)) this.buildBuilding(BRICKS, -1);
    for (const s of w.machines) {
      const m = this.createMachine(s.spec, s.id, new THREE.Vector3(s.pose[0], 0, s.pose[1]), s.pose[2]);
      m.restorePose(s.pose);
      m.setPayload(s.payload[0], s.payload[1], s.payload[2], s.payload[3], s.payload[4]);
      if (!forSave) m.driver = s.driver;
    }
    // re-attach held pieces on the authority side
    if (!mirror) for (const p of this.demo.pieces) if (p.state === HELD) {
      const m = this.machines.get(p.holder); if (!m || !p.holdLocal) continue;
      // hold code 2 / 3: the backhoe's front bucket or the blaster's cage
      if (Math.round(p.holdLocal.elements[15]) > 1) (m.held2 = m.held2 || []).push({ p, local: p.holdLocal }); else m.held.push({ p, local: p.holdLocal });
    }
    this.nextMachineId = w.nextMachineId || this.nextMachineId;
    this.crusher.restore(w.crusher); this.intake.restore(w.intake); this.mixer.restore(w.mixer); this.road.restore(w.road); this.slabs.restore(w.slabs || []);
    if (w.settings) Object.assign(this.settings, w.settings);
    this.crusher.rate = this.settings.crusher;
    this.press.restore(w.press);
    this.builder.restore(w.splashes);
    if (typeof w.time === 'number') this.dn.p = w.time;
    if (mirror) { this.hostCycle = typeof w.cycle === 'number' ? w.cycle : 0; this.charges.restore(w.charges); if (w.weather) this.weather.setState(w.weather); }
    this.dn.apply();
  }

  // ======================================================================= save slots
  slotMeta(slot) { try { return JSON.parse(localStorage.getItem(PREFIX + 'meta.' + slot)); } catch (e) { return null; } }
  saveSlot(slot, quiet = false) {
    const w = this.serializeWorld(true);
    const st = this.demo.stats();
    const meta = { time: Date.now(), summary: `${fmtKg(this.crusher.totalKg)} crushed · ${this.machines.size} machines · road ${this.road.repaired}/${this.road.holes.length}` };
    try {
      localStorage.setItem(PREFIX + 'slot.' + slot, JSON.stringify(w));
      localStorage.setItem(PREFIX + 'meta.' + slot, JSON.stringify(meta));
      if (!quiet) this.ui.toast(`💾 Saved to ${slot === 'auto' ? 'autosave' : 'slot ' + slot}`, true);
    } catch (e) { if (!quiet) this.ui.toast('⚠️ Could not save: storage full. Delete an old slot.'); }
    return st;
  }
  loadSlot(slot) {
    if (this.net.isClient) return;
    let w; try { w = JSON.parse(localStorage.getItem(PREFIX + 'slot.' + slot)); } catch (e) { w = null; }
    if (!w) return;
    this.loadWorld(w, { forSave: true });
    this.player.teleport(this.spawnPoint());
    this.ui.toast('📂 World loaded', true);
    if (this.net.isHost) this.broadcastWorld();
  }
  deleteSlot(slot) { localStorage.removeItem(PREFIX + 'slot.' + slot); localStorage.removeItem(PREFIX + 'meta.' + slot); }

  // ======================================================================= actions
  act(name, d) {
    if (name === 'hit') { const h = [{ dmg: 1, splash: 0 }, { dmg: 2, splash: 0 }, { dmg: 3, splash: 0.4 }, { dmg: 5, splash: 0.7 }][this.settings.hammer]; d.dmg = h.dmg; d.splash = h.splash; d.force = 3 + this.settings.hammer; }
    if (name === 'pickup') d.cap = this.settings.carry;
    if (this.net.isClient) this.net.send({ t: 'act', a: name, d });
    else this.doAct(this.myId, name, d);
  }

  doAct(pid, name, d) {
    const demo = this.demo, pl = this.players.get(pid);
    switch (name) {
      case 'tamp': {
        if (this.road.tamp(d.hole)) { this.events.push(['road', this.road.serialize()]); this.onRoadChanged && this.onRoadChanged(); }
        break;
      }
      case 'hit': {
        const p = demo.pieces[d.id]; if (!p || p.state === GONE) return;
        const point = v3(d.point), dir = v3(d.dir);
        // big loose panels (roof, floor, doors) crack under the hammer and break into rubble chunks
        if (p.state === LOOSE && demo.isBig(p)) {
          p.crack = (p.crack || 0) + (d.dmg || 1);
          if (p.crack >= 3) { demo.shatter(p); break; }
        }
        demo.damage(p, d.dmg || 1, point, dir, d.force || 3);
        if (d.splash > 0) for (const q of demo.intactNear(point, d.splash, 6)) if (q !== p) demo.damage(q, Math.max(1, (d.dmg || 1) - 1), q.pos, dir, 2);
        this.sfx.impact(p.type.sound, 0.7, point);
        break;
      }
      case 'pickup': {
        const p = demo.pieces[d.id];
        if (!p || p.state !== LOOSE || !pl) return;
        if (this.carriedBy(pid).length >= (d.cap || 8)) return;
        demo.carry(p, pid);
        break;
      }
      case 'throw': {
        const p = demo.pieces[d.id];
        if (!p || p.state !== CARRIED || p.holder !== pid) return;
        demo.throwPiece(p, v3(d.pos), v3(d.vel), v3(d.spin));
        break;
      }
      case 'drop': this.dropCarried(pid); break;
      case 'enter': {
        const m = this.machines.get(d.id);
        if (!m || m.driver !== -1 || !pl || pl.driving >= 0) return;
        this.dropCarried(pid);
        m.driver = pid; pl.driving = m.id;
        this.events.push(['drv', m.id, pid]);
        if (pid === this.myId) this.enterLocal(m);
        break;
      }
      case 'charge': {
        // within reach of where the player says they stand, and that has to be close to where we last saw them
        const seen = pid === this.myId ? this.player.pos : pl && (pl.target || pl.pos);
        const from = Array.isArray(d.from) ? new THREE.Vector3().fromArray(d.from) : seen;
        if (!seen || !Array.isArray(d.point) || from.distanceTo(seen) > 12 || new THREE.Vector3().fromArray(d.point).distanceTo(from) > 6) return;
        if (this.charges.place(pid, d.id, d.point, d.facing || [0, 0, 1])) {
          const left = MAX_CHARGES - this.charges.mine(pid).length;
          this.tell(pid, left ? `🧨 Charge set (${left} left). Press <b>E</b> to detonate.` : '🧨 All charges set. Press <b>E</b> to detonate!', true);
        }
        break;
      }
      case 'mortar': {
        // one splash of mortar where the trowel was clicked
        if (!pl || !Array.isArray(d.point) || !Array.isArray(d.normal)) return;
        const pt = v3(d.point), n = v3(d.normal);
        const seen = pid === this.myId ? this.player.pos : (pl.target || pl.pos);
        if (pt.distanceTo(seen) > 8 || n.lengthSq() < 0.5) return;
        if (!(pl.cement.kg > 1)) { this.tell(pid, '🪣 No cement on the trowel. Take some from the mixer first.'); return; }
        this.builder.addSplash(pt, n, pl.cement.color, typeof d.piece === 'number' ? d.piece : -1);
        this.setCement(pid, Math.max(0, pl.cement.kg - MORTAR_KG), pl.cement.color);
        this.events.push(['mortar', this.builder.pack()]);
        break;
      }
      case 'scrape': {
        // remove tool: take a splash of mortar away, or knock a laid block loose (pick it up or crush it after)
        if (!pl || !Array.isArray(d.point)) return;
        const pt = v3(d.point), seen = pid === this.myId ? this.player.pos : (pl.target || pl.pos);
        if (pt.distanceTo(seen) > 8) return;
        const p = typeof d.piece === 'number' && d.piece >= 0 ? demo.pieces[d.piece] : null;
        if (p && p.brick && p.state === INTACT) {
          demo.detach(p);
          this.builder.tidy(); this.events.push(['mortar', this.builder.pack()]);
          this.audio.clank(pt, 0.3);
        } else if (this.builder.removeSplashNear(pt)) { this.events.push(['mortar', this.builder.pack()]); this.sfx.splash(pt, 0.2); }
        break;
      }
      case 'placeBrick': {
        // lay a carried block: it sticks if it touches mortar, otherwise it is only stacked
        const p = demo.pieces[d.id];
        if (!p || !p.brick || p.state !== CARRIED || p.holder !== pid || !Array.isArray(d.pos)) return;
        const c = v3(d.pos), rot = d.rot ? 1 : 0;
        const seen = pid === this.myId ? this.player.pos : pl && (pl.target || pl.pos);
        if (!seen || c.distanceTo(seen) > 9) return;
        if (!this.builder.valid(c, rot)) { this.tell(pid, '🧱 Something is in the way there'); return; }
        const q = this.builder.quatFor(rot);
        p.quat.copy(q); p.body.setRotation(q, true);
        demo.throwPiece(p, c, { x: 0, y: 0, z: 0 });
        demo.writeMatrix(p); demo.flagParts(p);
        const glue = this.builder.splashesFor(c, rot);
        if (glue.length) { demo.setIntact(p, c, q); this.builder.take(glue); this.events.push(['mortar', this.builder.pack()]); this.events.push(['fx', 'k', c.toArray(), 0.4]); this.audio.clank(c, 0.4); }
        else this.tell(pid, '🧱 Stacked dry: it will not stick. Click a splash of mortar down with the trowel first.');
        break;
      }
      case 'pressFeed': {
        this.press.feeding = !this.press.feeding; this.pressDirty = true;
        this.tell(pid, this.press.feeding ? '🧱 Feeder belt on: dust goes from the stockpile into the brick press' : 'Feeder belt off', true);
        break;
      }
      case 'pressPour': {
        const b = pl && pl.bucket; if (!b || b.kind !== 'dust') return;
        const used = this.press.addDust(b.kg, b.color);
        if (used > 0) { this.setBucket(pid, b.kg - used > 0.5 ? 'dust' : null, b.kg - used, b.color); this.pressDirty = true; }
        break;
      }
      case 'detonate': {
        if (this.charges.arm(pid)) this.tell(pid, '⚠️ Stand back! 3… 2… 1…');
        break;
      }
      case 'horn': {
        const m = this.machines.get(d.id);
        if (!m || m.driver !== pid) return;
        this.setHorn(m.id, d.on ? 1 : 0); this.events.push(['horn', m.id, d.on ? 1 : 0]);
        break;
      }
      case 'exit': {
        const m = this.machines.get(d.id);
        if (!m || m.driver !== pid) return;
        if (this.horns.has(m.id)) { this.setHorn(m.id, 0); this.events.push(['horn', m.id, 0]); }
        m.driver = -1; if (pl) pl.driving = -1;
        this.events.push(['drv', m.id, -1]);
        if (pid === this.myId) this.exitLocal();
        break;
      }
      case 'spawnMachine': {
        if (this.machines.size >= 20) { this.tell(pid, '⚠️ Max 20 machines. Remove one first.'); return; }
        const spec = MACHINES.find((m) => m.id === d.spec); if (!spec) return;
        const near = v3(d.near);
        const fwd = new THREE.Vector3(-Math.sin(d.yaw + Math.PI), 0, -Math.cos(d.yaw + Math.PI));
        const spot = this.findMachineSpot(near.clone().addScaledVector(fwd, 7 * Math.max(0.7, spec.scale)), spec);
        if (!spot) { this.tell(pid, '⚠️ No free space nearby. Try somewhere more open.'); return; }
        if (this.prog && pid === this.myId && !this.prog.spend(machinePrice(spec), 'The ' + spec.brand + ' ' + spec.model)) return;
        const m = this.createMachine(spec.id, this.nextMachineId, spot, Math.atan2(near.x - spot.x, near.z - spot.z) + Math.PI);
        this.events.push(['mach+', m.serialize()]);
        if (this.prog) this.progSave();
        this.tell(pid, `${spec.icon} ${spec.name} delivered!`, true);
        break;
      }
      case 'removeMachine': {
        const m = this.machines.get(d.id); if (!m) return;
        if (m.driver >= 0 && m.driver !== pid) return;
        if (m.driver >= 0) { const dp = this.players.get(m.driver); if (dp) dp.driving = -1; }
        if (this.prog) { const back = Math.round(machinePrice(m.spec) / 2 / 50) * 50; this.prog.earn(back, false); this.tell(pid, '💵 Sold the ' + m.spec.brand + ' ' + m.spec.model + ' for ' + fmtMoney(back), true); }
        this.destroyMachine(m.id);
        if (this.prog) setTimeout(() => this.progSave(), 50);
        this.events.push(['mach-', d.id]);
        break;
      }
      case 'spawnBuilding': case 'clearPlot': {
        if (this.prog && name === 'spawnBuilding' && !this.prog.spend(BUILDING_PRICE, 'A new building')) return;
        const old = this.plots[d.plot];
        for (const p of this.players.values()) if (old != null) this.dropCarried(p.id, (q) => q.b === old);
        if (old != null) { this.removeBuildingFull(old); this.events.push(['bld-', old]); }
        if (name === 'spawnBuilding') { const b = this.buildBuilding(d.def, d.plot); this.events.push(['bld+', d.def, d.plot, b.id]); }
        break;
      }
      case 'clearRubble': {
        for (const p of demo.pieces) if (p.state === LOOSE) demo.vanish(p);
        break;
      }
      case 'breakRoad': {
        for (let i = 0; i < 4; i++) { const r = 0.7 + Math.random() * 0.5; this.road.addHole(-30 + Math.random() * 75, SITE.streetZ - 1.3 + r + Math.random() * (8.6 - 2 * r), r); }
        this.events.push(['road', this.road.serialize()]);
        break;
      }
      case 'fixRoad': {
        this.road.holes.forEach((h, i) => this.road.fill(i, h.need, new THREE.Color(0.62, 0.62, 0.6), 1));
        this.events.push(['road', this.road.serialize()]);
        break;
      }
      case 'clearPile': this.crusher.layers = []; this.crusher.updatePile(); this.events.push(['pile', this.crusher.serialize().layers]); break;
      case 'setting': this.settings[d.key] = d.value; this.crusher.rate = this.settings.crusher; this.events.push(['set', { crusher: this.settings.crusher, grapple: this.settings.grapple }]); break;
      case 'mixer': {
        if (d.op === 'empty') this.mixer.empty();
        if (d.op === 'water') { const l = Math.min(this.mixer.room('water'), 1 / KG * 10); if (l > 0) { this.mixer.addWater(l); this.sfx.splash(this.mixer.tubCenter, 0.5); } }
        if (d.op === 'dust') {
          const want = Math.min(d.kg, this.mixer.room('dust'));
          const got = this.crusher.take(want);
          if (got.kg > 0) {
            // pour it in layer by layer so every colour shows up in the tub before it is mixed
            const groups = [];
            for (const part of got.parts) {
              const last = groups[groups.length - 1];
              if (last && last.kg < got.kg / 6) { last.color.lerp(part.color, part.kg / (last.kg + part.kg)); last.kg += part.kg; } else groups.push({ kg: part.kg, color: part.color.clone() });
            }
            for (const gp of groups) this.mixer.addDust(gp.kg, gp.color);
            this.events.push(['take', got.kg]);
          }
        }
        this.mixerDirty = true;
        break;
      }
      case 'bucketFill': if (d.source === 'mixer') this.takeCement(pid); else this.bucketFill(pid, d.source); break;
      case 'takeCement': this.takeCement(pid); break;
      case 'layCement': this.layCement(pid, d.x, d.z); break;
      case 'pourCement': this.pourCement(pid, d.target, d.id); break;
      case 'bucketPour': this.bucketPour(pid, d.target, d.target === 'paver' ? d.id : d.hole); break;
      case 'newWorld': if (pid === this.myId) { this.newWorld(); if (this.net.isHost) this.broadcastWorld(); } break;
    }
  }

  tell(pid, msg, good = false) {
    if (pid === this.myId) this.ui.toast(msg, good);
    else if (this.net.isHost) { const pl = this.players.get(pid); if (pl) this.net.send({ t: 'toast', m: msg, g: good }, pl.peer); }
  }

  dropCarried(pid, filter = null) {
    const pl = this.players.get(pid);
    const base = pl ? pl.pos : SITE.playerSpawn;
    for (const p of this.carriedBy(pid)) {
      if (filter && !filter(p)) continue;
      this.demo.throwPiece(p, base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.0 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8)), new THREE.Vector3());
    }
  }

  setBucket(pid, kind, kg, color) {
    const pl = this.players.get(pid); if (!pl) return;
    pl.bucket.kind = kg > 0.05 ? kind : null; pl.bucket.kg = kg > 0.05 ? kg : 0; if (color) pl.bucket.color.copy(color);
    if (pid === this.myId) { this.bucket = pl.bucket; }
    pl.avatar.setBucket(pl.bucket.kind, pl.bucket.kg, pl.bucket.color);
    this.events.push(['inv', pid, pl.bucket.kind, pl.bucket.kg, pl.bucket.color.r, pl.bucket.color.g, pl.bucket.color.b]);
  }

  bucketFill(pid, source) {
    const pl = this.players.get(pid); if (!pl) return;
    const b = pl.bucket, room = BUCKET - (b.kind ? b.kg : 0);
    if (room <= 0.5) return;
    if (source === 'lake' && (!b.kind || b.kind === 'water')) { this.setBucket(pid, 'water', b.kg + room, new THREE.Color(0x3d7080)); this.sfx.splash(pl.pos, 0.6); }
    else if (source === 'pile' && (!b.kind || b.kind === 'dust')) {
      const got = this.crusher.take(room);
      if (got.kg > 0) { const tot = b.kg + got.kg; this.setBucket(pid, 'dust', tot, b.kind ? b.color.clone().lerp(got.color, got.kg / tot) : got.color); this.events.push(['take', got.kg]); }
    } else if (source === 'mixer' && (!b.kind || b.kind === 'cement')) {
      const got = this.mixer.takeCement(room);
      if (got.kg > 0) { const tot = b.kg + got.kg; this.setBucket(pid, 'cement', tot, b.kind ? b.color.clone().lerp(got.color, got.kg / tot) : got.color); this.mixerDirty = true; }
    }
  }
  bucketPour(pid, target, hole) {
    const pl = this.players.get(pid); if (!pl || !pl.bucket.kind) return;
    const b = pl.bucket;
    let used = 0;
    if (target === 'mixer') {
      used = b.kind === 'water' ? this.mixer.addWater(b.kg) : b.kind === 'dust' ? this.mixer.addDust(b.kg, b.color) : this.mixer.addCement(b.kg, b.color);
      this.mixerDirty = true;
    } else if (target === 'paver' && b.kind === 'cement') {
      const m = this.machines.get(hole === undefined ? -1 : hole) || this.machines.get(arguments[3]);
      if (m) { used = Math.min(b.kg, m.capacity() - m.payload.kg); if (used > 0) { const tot = m.payload.kg + used; m.payload.color.copy(m.payload.kg ? m.payload.color.clone().lerp(b.color, used / tot) : b.color); m.payload.kind = 'cement'; m.payload.kg = tot; m.payDirty = true; } }
    } else if (target === 'hole' && b.kind === 'cement') {
      used = this.road.fill(hole, b.kg, b.color);
      this.events.push(['road', this.road.serialize()]);
      const h = this.road.holes[hole];
      if (h && h.filled >= h.need) this.tell(pid, '🛣️ Pothole repaired!', true);
    } else used = b.kg;
    this.setBucket(pid, b.kind, b.kg - used, b.color);
    this.sfx.chips(pl.pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(), b.kind === 'water' ? 0x6aa0b0 : b.color.getHex(), 8, 0.05, 1.2);
  }

  // ======================================================================= cement trowel
  setCement(pid, kg, color) {
    const pl = this.players.get(pid); if (!pl) return;
    pl.cement.kg = kg > 0.5 ? kg : 0; if (color) pl.cement.color.copy(color);
    this.events.push(['cem', pid, pl.cement.kg, pl.cement.color.r, pl.cement.color.g, pl.cement.color.b]);
    if (pid === this.myId) this.onMyCement();
  }
  onMyCement() {
    const c = this.players.get(this.myId).cement;
    if (c.kg > 0 && !this.hadCement) this.selectTool('trowel');
    if (c.kg <= 0 && this.tool === 'trowel') this.selectTool('hammer');
    this.hadCement = c.kg > 0;
    this.ui.setHotbar();
  }
  selectTool(t) {
    if (this.prog && !this.prog.has(t)) { const T = TOOLS[t]; if (!T) return; this.ui.toast('🔒 The ' + T.name + ' is in the Shop (' + (this.input.touch ? 'Spawn button' : 'B') + ') for ' + fmtMoney(T.price)); this.audio.denied(); return; }
    if (t === 'build' && this.tool === 'build') { this.builder.rot ^= 1; return; } // tap again to turn the block
    if (t === 'build' && this.tool !== 'build' && !this.carriedBy(this.myId).some((p) => p.brick)) this.ui.toast('🧱 Build: carry pressed blocks (<b>Q</b> at the brick press pallet), trowel a splash of mortar on the slab across the road, then click to lay a block on it. <b>R</b> turns it.', true, 7000);
    if (t === 'scrape' && this.tool !== 'scrape') this.ui.toast('🗑️ Remove: aim at a splash of mortar to scrape it off, or at a block you laid to knock it loose', true, 5000);
    if (t === 'trowel' && !(this.players.get(this.myId).cement.kg > 0)) { this.ui.toast('🪣 No cement on the trowel. Take some from the mixer first.'); return; }
    this.tool = t;
    this.player.avatar.setTool(t);
    this.ui.setHotbar();
  }
  takeCement(pid) {
    const pl = this.players.get(pid); if (!pl) return;
    const room = TROWEL - pl.cement.kg;
    if (room <= 1 || this.mixer.cement < 0.5) { if (this.mixer.cement < 0.5) this.tell(pid, '⚠️ No cement in the mixer yet. Put dust in and add water.'); return; }
    const got = this.mixer.takeCement(room);
    const tot = pl.cement.kg + got.kg;
    this.setCement(pid, tot, pl.cement.kg ? pl.cement.color.clone().lerp(got.color, got.kg / tot) : got.color);
    this.mixerDirty = true;
    this.tell(pid, `🪣 ${fmtKg(tot)} of cement on your trowel. Click (or tap 🔨) on the ground to lay it.`, true);
  }
  // lay one tile of cement at a ground point, or fill the pothole under it
  layCement(pid, x, z) {
    const pl = this.players.get(pid); if (!pl || pl.cement.kg <= 0.5) return;
    const pp = pid === this.myId ? this.player.pos : pl.pos; // the local entry's pos is not tracked
    if (Math.hypot(x - pp.x, z - pp.z) > 9) return;
    const c = pl.cement;
    const h = this.road.nearest({ x, y: 0, z }, 1.4);
    if (h >= 0) {
      const used = this.road.fill(h, c.kg, c.color);
      if (used > 0) {
        this.events.push(['road', this.road.serialize()]);
        const hole = this.road.holes[h];
        if (hole.filled >= hole.need) this.tell(pid, '🛣️ Pothole repaired! Roll it flat with the roller for a ⭐', true);
        this.setCement(pid, c.kg - used, c.color);
        this.sfx.chips(new THREE.Vector3(x, 0.2, z), new THREE.Vector3(0, -1, 0), c.color.getHex(), 6, 0.05, 1);
      }
      return;
    }
    if (lakeDist(x, z) < 1.2) return;
    const [ix, iz] = Slabs.cellOf(x, z);
    const cx = ix * SLAB, cz = iz * SLAB;
    const y = Math.max(this.groundAt(cx - 0.5, cz - 0.5), this.groundAt(cx + 0.5, cz + 0.5), this.groundAt(cx, cz));
    const used = Math.min(c.kg, SLAB_KG);
    if (!this.slabs.set(ix, iz, y, c.color, 0)) { this.tell(pid, '⚠️ That is a lot of cement! Too many tiles in the yard.'); return; }
    this.events.push(['slab', ix, iz, y, c.color.r, c.color.g, c.color.b]);
    this.setCement(pid, c.kg - used, c.color);
    this.sfx.chips(new THREE.Vector3(cx, y + 0.1, cz), new THREE.Vector3(0, 1, 0), c.color.getHex(), 5, 0.05, 1);
    this.sfx.dust(new THREE.Vector3(cx, y + 0.1, cz), c.color.getHex(), 1, 0.4, { alpha: 0.25 });
  }
  pourCement(pid, target, id) {
    const pl = this.players.get(pid); if (!pl || pl.cement.kg <= 0.5) return;
    const c = pl.cement;
    if (target === 'paver') {
      const m = this.machines.get(id); if (!m) return;
      const used = Math.min(c.kg, m.capacity() - m.payload.kg);
      if (used > 0) { const tot = m.payload.kg + used; m.payload.color.copy(m.payload.kg ? m.payload.color.clone().lerp(c.color, used / tot) : c.color); m.payload.kind = 'cement'; m.payload.kg = tot; m.payDirty = true; this.setCement(pid, c.kg - used, c.color); }
    }
  }
  // where the trowel would lay: the ground point under the crosshair (within reach), else just in front of you
  trowelTarget() {
    const r = this.aimRay(), p = this.player.pos;
    let x = p.x + Math.sin(this.player.bodyYaw) * 1.6, z = p.z + Math.cos(this.player.bodyYaw) * 1.6;
    if (r && r.dir.y < -0.05) {
      const gy = this.groundAt(p.x, p.z);
      const t = (r.origin.y - gy) / -r.dir.y;
      const hx = r.origin.x + r.dir.x * t, hz = r.origin.z + r.dir.z * t;
      if (Math.hypot(hx - p.x, hz - p.z) < 7) { x = hx; z = hz; }
    }
    return { x, z };
  }

  // ======================================================================= driving
  enterLocal(m) {
    this.mode = 'machine'; this.driving = m;
    this.player.setEnabled(false);
    this.cam.exYaw = m.yaw + m.swing + Math.PI; this.cam.exDist = m.camDistance(); this.cam.cab = false;
    this.ui.setMode('machine', this.input.touch, m);
    this.ui.toast(`${m.spec.icon} ${m.spec.name}`, false, 2500);
  }
  exitLocal(silent = false) {
    const m = this.driving;
    this.mode = 'foot'; this.driving = null; this.honking = false;
    const me = this.players.get(this.myId); if (me) me.driving = -1;
    if (m && this.machines.has(m.id)) {
      const spot = this.findExitSpot(m);
      this.player.teleport(spot);
      // face away from the machine, so walking forward takes you clear of it
      this.cam.yaw = Math.atan2(m.pos.x - spot.x, m.pos.z - spot.z);
    }
    this.player.setEnabled(true);
    if (!silent) this.ui.setMode('foot', this.input.touch);
  }
  // a free spot next to the cab door (never inside tracks, walls or the lake)
  findExitSpot(m) {
    const door = m.doorWorld(), c = m.pos;
    const out = new THREE.Vector3(door.x - c.x, 0, door.z - c.z).normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const W = this.physics.world, terrain = this.env.terrainCollider;
    const tryAt = [];
    for (const d of [1.2, 1.9, 2.7, 3.6]) for (const s of [0, 1.2, -1.2, 2.4, -2.4]) tryAt.push(door.clone().addScaledVector(out, d * Math.max(1, m.s)).addScaledVector(side, s));
    for (let a = 0; a < 12; a++) tryAt.push(c.clone().add(new THREE.Vector3(Math.cos(a / 12 * Math.PI * 2), 0, Math.sin(a / 12 * Math.PI * 2)).multiplyScalar(m.radius * m.s + 1.5)));
    for (const p of tryAt) {
      if (lakeDist(p.x, p.z) < 1.15) continue;
      const y = terrainHeight(p.x, p.z);
      let hit = false;
      W.intersectionsWithShape({ x: p.x, y: y + 1.3, z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Capsule(0.55, 0.7), (col) => { // a margin around the player: never right against wheels or tracks
        if (terrain && col.handle === terrain.handle) return true;
        if (col.handle === this.player.collider.handle) return true;
        hit = true; return false;
      });
      if (!hit) return new THREE.Vector3(p.x, y + 0.05, p.z);
    }
    return this.spawnPoint();
  }

  // ======================================================================= networking
  setupNet() {
    const net = this.net;
    const safe = (fn) => (...a) => { try { fn(...a); } catch (e) { console.error('[net handler]', e && e.message, e && e.stack); } };
    net.on('msg', safe((from, m) => (net.isHost ? this.hostMsg(from, m) : this.clientMsg(m))));
    net.on('bin', safe((from, buf) => { const k = kindOf(buf); if (net.isHost) { if (k === 1 || k === 2) this.hostBin(from, decodeFloats(buf)); } else if (k === 3) this.clientBin(decodeSnapshot(buf)); }));
    net.on('leave', (peer) => {
      for (const p of this.players.values()) if (p.peer === peer) {
        this.dropCarried(p.id); this.demo.forgetClient(p.id);
        // their charges can never be set off now, and a horn they were holding must stop
        if (this.charges.mine(p.id).length) { this.charges.list = this.charges.list.filter((c) => c.owner !== p.id); this.charges.changed(); }
        for (const m of this.machines.values()) if (m.driver === p.id) { m.driver = -1; this.events.push(['drv', m.id, -1]); if (this.horns.has(m.id)) { this.setHorn(m.id, 0); this.events.push(['horn', m.id, 0]); } }
        this.events.push(['pl-', p.id]);
        this.ui.toast(`👋 ${p.name} left`);
        this.removePlayerEntry(p.id);
      }
      this.ui.refreshOpen();
    });
    net.on('lost', () => {
      this.ui.toast('⚠️ Lost connection to the host. You keep playing solo with the same world.');
      const w = this.serializeWorld(true);
      for (const id of [...this.players.keys()]) if (id !== this.myId) this.removePlayerEntry(id);
      this.rekeyLocal(0);
      this.loadWorld(w, { forSave: true });
      this.ui.refreshOpen();
    });
  }

  rekeyLocal(newId) {
    const me = this.players.get(this.myId);
    this.players.delete(this.myId);
    this.myId = newId; me.id = newId; me.name = this.myName;
    this.players.set(newId, me);
  }

  async startHost() {
    try {
      this.ui.netMsg = 'Starting…'; this.ui.renderMulti();
      const code = await this.net.hostGame();
      this.ui.netMsg = null;
      this.ui.renderMulti();
      this.ui.toast(`🌐 Hosting! Code <b>${code}</b>`, true, 6000);
    } catch (e) { this.ui.netMsg = '❌ ' + (e.message || e.type || 'Could not host'); this.ui.renderMulti(); }
  }
  async joinGame(code, fromTitle = false) {
    if (this.net.online) this.leaveGame();
    if (!fromTitle) { this.ui.netMsg = 'Connecting…'; this.ui.renderMulti(); }
    try {
      await this.net.joinGame(code);
      this.net.send({ t: 'hello', name: this.myName });
      this.ui.netMsg = null;
      await new Promise((res, rej) => { this.onWelcome = res; setTimeout(() => rej(new Error('The host did not answer')), 30000); });
      if (!fromTitle) { this.ui.renderMulti(); this.ui.close('multi'); }
      this.ui.toast(`🌐 Joined game <b>${this.net.code}</b>`, true);
    } catch (e) {
      this.net.leave();
      if (fromTitle) throw e;
      this.ui.netMsg = '❌ ' + e.message; this.ui.renderMulti();
    }
  }
  leaveGame() {
    const wasClient = this.net.isClient;
    if (this.net.isHost) for (const p of [...this.players.values()]) if (!p.local) this.removePlayerEntry(p.id);
    this.net.leave();
    if (wasClient) {
      const w = this.serializeWorld(true);
      for (const id of [...this.players.keys()]) if (id !== this.myId) this.removePlayerEntry(id);
      this.rekeyLocal(0);
      this.loadWorld(w, { forSave: true });
    }
    this.ui.renderMulti();
  }
  kick(pid) { const p = this.players.get(pid); if (p && p.peer) this.net.kick(p.peer); }
  broadcastWorld() {
    const w = this.serializeWorld(false);
    for (const p of this.players.values()) if (!p.local && p.peer) { this.net.send({ t: 'world', w }, p.peer); this.demo.markAllSent(p.id); }
  }

  // ---- host side
  hostMsg(from, m) {
    if (m.t === 'hello') {
      let id = 1; while (this.players.has(id)) id++;
      const e = this.addPlayerEntry(id, (m.name || 'Player').slice(0, 16), SHIRTS[id % SHIRTS.length]);
      e.peer = from;
      this.flushNet(true);
      this.net.send({ t: 'welcome', you: id, w: this.serializeWorld(false) }, from);
      this.demo.markAllSent(id);
      this.events.push(['pl+', id, e.name, e.shirt]);
      this.ui.toast(`🙋 ${e.name} joined`, true);
      this.ui.refreshOpen();
      return;
    }
    const pl = [...this.players.values()].find((p) => p.peer === from);
    if (!pl) return;
    if (m.t === 'act') this.doAct(pl.id, m.a, m.d || {});
    if (m.t === 'name') { pl.name = m.name.slice(0, 16); pl.avatar.setName(pl.name); this.events.push(['pl+', pl.id, pl.name, pl.shirt]); }
  }
  hostBin(from, a) {
    const pl = [...this.players.values()].find((p) => p.peer === from);
    if (!pl) return;
    if (a[0] === 1) this.applyPlayerPose(pl, a, 1);
    else if (a[0] === 2) { const m = this.machines.get(a[1]); if (m && m.driver === pl.id) m.applyPose(a, 1); }
  }
  applyPlayerPose(pl, a, i) {
    if (!pl.target) pl.target = new THREE.Vector3();
    pl.target.set(a[i], a[i + 1], a[i + 2]);
    if (!pl.seen) { pl.pos.copy(pl.target); pl.seen = true; }
    pl.yaw = a[i + 3]; pl.speed = a[i + 4]; pl.grounded = !!(a[i + 5] & 1); pl.swingT = a[i + 6];
  }

  flushNet(force = false) {
    if (!this.net.isHost) { this.events = []; this.demo.takeChanges(); return; }
    this.netTimer = (this.netTimer || 0) - (force ? 1 : 0);
    const changes = this.demo.takeChanges();
    const list = [];
    for (const [id, st, holder] of changes) {
      const p = this.demo.pieces[id];
      const e = ['ps', id, st, holder];
      if (st === HELD && p.holdLocal) e.push({ local: p.holdLocal.toArray().map((v) => Math.round(v * 1e4) / 1e4) });
      else if ((st === LOOSE || (st === INTACT && p.pool)) && p.pos) {
        const pos = p.pos.toArray().map((v) => Math.round(v * 1000) / 1000), quat = p.quat.toArray().map((v) => Math.round(v * 1e4) / 1e4);
        e.push(p.pool ? { pos, quat, col: p.color.getHex(), kg: Math.round(p.kg) } : { pos, quat });
      }
      list.push(e);
    }
    if (this.mixerDirty) { this.mixerDirty = false; this.events.push(['mix', this.mixer.serialize()]); }
    for (const m of this.machines.values()) if (m.payDirty) { m.payDirty = false; const p = m.payload; this.events.push(['pay', m.id, p.kind, p.kg, p.color.r, p.color.g, p.color.b]); }
    list.push(...this.events); this.events = [];
    if (list.length && this.net.conns.size) this.net.send({ t: 'ev', l: list });
  }
  // one snapshot per client: everyone's pose and every machine, plus the loose blocks that matter most to that
  // client (nearest and most out of date first). A client whose link is backing up gets fewer blocks, or none.
  sendSnapshot() {
    const head = [];
    for (const p of this.players.values()) {
      const pos = p.local ? this.player.pos : p.pos;
      const yaw = p.local ? this.player.bodyYaw : p.yaw;
      head.push(p.id, pos.x, pos.y, pos.z, yaw, p.local ? Math.hypot(this.player.vel.x, this.player.vel.z) : p.speed, p.local ? (this.player.grounded ? 1 : 0) : (p.grounded ? 1 : 0), p.local ? this.player.swingT : p.swingT, p.local ? (this.driving ? this.driving.id : -1) : p.driving);
    }
    for (const m of this.machines.values()) head.push(...m.packPose());
    for (const pl of this.players.values()) {
      if (pl.local || !pl.peer) continue;
      const queued = this.net.backlogOf(pl.peer);
      if (queued > 600000) continue;                              // badly backed up: let it drain
      const budget = queued > 200000 ? 0 : queued > 64000 ? 30 : 110;
      const dm = pl.driving >= 0 ? this.machines.get(pl.driving) : null;
      const pieces = this.demo.pickUpdates(pl.id, dm ? dm.pos : pl.pos, budget);
      this.net.sendBuf(encodeSnapshot(this.players.size, this.machines.size, head, pieces), pl.peer);
    }
  }

  // ---- client side
  clientMsg(m) {
    if (m.t === 'welcome') {
      this.rekeyLocal(m.you);
      this.applyWorldFromHost(m.w);
      if (this.onWelcome) { this.onWelcome(); this.onWelcome = null; }
    } else if (m.t === 'world') this.applyWorldFromHost(m.w);
    else if (m.t === 'ev') for (const e of m.l) this.applyEvent(e);
    else if (m.t === 'toast') this.ui.toast(m.m, m.g);
  }
  applyWorldFromHost(w) {
    this.loadWorld(w, { mirror: true });
    for (const id of [...this.players.keys()]) if (id !== this.myId) this.removePlayerEntry(id);
    for (const p of w.players) {
      if (p.id === this.myId) { const me = this.players.get(this.myId); me.shirt = p.shirt; continue; }
      const e = this.addPlayerEntry(p.id, p.name, p.shirt);
      e.driving = p.driving;
      e.bucket.kind = p.bucket[0]; e.bucket.kg = p.bucket[1]; e.bucket.color.setRGB(p.bucket[2], p.bucket[3], p.bucket[4]);
      e.avatar.setBucket(e.bucket.kind, e.bucket.kg, e.bucket.color);
      if (p.cement) { e.cement.kg = p.cement[0]; e.cement.color.setRGB(p.cement[1], p.cement[2], p.cement[3]); }
    }
    const me = w.players.find((p) => p.id === this.myId);
    if (me && me.shirt !== this.players.get(this.myId).shirtApplied) {
      this.player.avatar.dispose();
      this.player.avatar = new Avatar(this.scene, { shirt: me.shirt });
      this.player.avatar.setHammer(this.settings.hammer);
      this.players.get(this.myId).avatar = this.player.avatar;
      this.players.get(this.myId).shirtApplied = me.shirt;
    }
    this.player.teleport(this.spawnPoint().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 3)));
  }
  applyEvent(e) {
    switch (e[0]) {
      case 'ps': this.demo.applyChange(e[1], e[2], e[3], e[4]); break;
      case 'fx': this.playFx(e); break;
      case 'ix': this.intake.applyEvent(e, this.audio); break;
      case 'crush': this.crusher.crushVisual(e[1], new THREE.Color(e[2], e[3], e[4]), v3(e[5]), this.fx, this.audio); break;
      case 'take': this.crusher.take(e[1]); break;
      case 'pile': this.crusher.layers = e[1].map(([kg, r, g, b]) => ({ kg, c: new THREE.Color(r, g, b) })); this.crusher.updatePile(); break;
      case 'mach+': { const s = e[1]; if (this.machines.has(s.id)) return; const m = this.createMachine(s.spec, s.id, new THREE.Vector3(s.pose[0], 0, s.pose[1]), s.pose[2]); m.restorePose(s.pose); break; }
      case 'mach-': this.destroyMachine(e[1]); break;
      case 'drv': {
        const m = this.machines.get(e[1]); if (!m) return;
        const prev = m.driver; m.driver = e[2];
        const pl = this.players.get(e[2]); if (pl) pl.driving = m.id;
        const pp = this.players.get(prev); if (pp && e[2] === -1) pp.driving = -1;
        if (e[2] === this.myId) this.enterLocal(m);
        else if (prev === this.myId && this.driving === m) this.exitLocal();
        break;
      }
      case 'pay': { const m = this.machines.get(e[1]); if (m) m.setPayload(e[2], e[3], e[4], e[5], e[6]); break; }
      case 'bld+': this.buildBuilding(e[1], e[2]); break;
      case 'bld-': this.removeBuildingFull(e[1]); break;
      case 'mix': this.mixer.restore(e[1]); break;
      case 'tod': this.dn.p = e[1]; this.hostCycle = e[2]; if (e[3]) this.weather.setState(e[3]); break;
      case 'chg': this.charges.restore(e[1]); break;
      case 'press': this.press.restore(e[1]); break;
      case 'mortar': this.builder.restore(e[1]); break;
      case 'boom': this.boomFx(new THREE.Vector3(e[1], e[2], e[3])); break;
      case 'horn': this.setHorn(e[1], e[2]); break;
      case 'party': this.party(e[1]); break;
      case 'road': this.road.restore(e[1]); break;
      case 'set': Object.assign(this.settings, e[1]); this.crusher.rate = this.settings.crusher; break;
      case 'dep': this.crusher.deposit(e[1], new THREE.Color(e[2], e[3], e[4])); break;
      case 'tally': this.crusher.totalKg += e[1]; this.crusher.tally.set(e[2], (this.crusher.tally.get(e[2]) || 0) + e[1]); break;
      case 'slab': this.slabs.set(e[1], e[2], e[3], new THREE.Color(e[4], e[5], e[6]), 0); break;
      case 'cem': { const pl = this.players.get(e[1]); if (pl) { pl.cement.kg = e[2]; pl.cement.color.setRGB(e[3], e[4], e[5]); if (e[1] === this.myId) this.onMyCement(); } break; }
      case 'inv': {
        const pl = this.players.get(e[1]); if (!pl) return;
        pl.bucket.kind = e[2]; pl.bucket.kg = e[3]; pl.bucket.color.setRGB(e[4], e[5], e[6]);
        pl.avatar.setBucket(pl.bucket.kind, pl.bucket.kg, pl.bucket.color);
        if (e[1] === this.myId) this.bucket = pl.bucket;
        break;
      }
      case 'pl+': {
        const ex = this.players.get(e[1]);
        if (ex) { ex.name = e[2]; if (!ex.local) ex.avatar.setName(e[2]); }
        else if (e[1] !== this.myId) { this.addPlayerEntry(e[1], e[2], e[3]); this.ui.toast(`🙋 ${e[2]} joined`, true); }
        this.ui.refreshOpen();
        break;
      }
      case 'pl-': { const p = this.players.get(e[1]); if (p && !p.local) { this.ui.toast(`👋 ${p.name} left`); this.removePlayerEntry(e[1]); } this.ui.refreshOpen(); break; }
    }
  }
  clientBin(snap) {
    const a = snap.head;
    let i = 0;
    const np = snap.np;
    for (let k = 0; k < np; k++, i += PLAYER_F) {
      const id = a[i];
      if (id === this.myId) continue;
      let pl = this.players.get(id);
      if (!pl) continue;
      this.applyPlayerPose(pl, a, i + 1);
      pl.driving = a[i + 8];
    }
    for (let k = 0; k < snap.nm; k++, i += MACHINE_F) {
      const m = this.machines.get(a[i]);
      if (!m || m === this.driving) continue;
      m.applyPose(a, i);
    }
    this.demo.applyTransforms(snap.pieces);
  }
  sendMyPose() {
    const p = this.player;
    this.net.sendBuf(encodeFloats(1, [p.pos.x, p.pos.y, p.pos.z, p.bodyYaw, Math.hypot(p.vel.x, p.vel.z), p.grounded ? 1 : 0, p.swingT]));
    if (this.driving) this.net.sendBuf(encodeFloats(2, this.driving.packPose()));
  }

  // ======================================================================= camera
  updateCamera(dt) {
    const look = this.input ? this.input.consumeLook() : { x: 0, y: 0 };
    const c = this.cam, cam = this.camera, W = this.physics.world;
    // wider view from the operator's seat
    const fov = (this.baseFov || 62) + (this.mode === 'machine' && c.cab ? 14 : 0);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (this.mode === 'foot') {
      cam.layers.enable(EXTERIOR);
      c.yaw -= look.x; c.pitch = clamp(c.pitch - look.y, -1.25, 0.95);
      if (this.input) c.dist = clamp(c.dist + this.input.wheel * 0.4, 2.2, 9);
      const target = this.player.pos.clone().add(new THREE.Vector3(0, 1.62, 0));
      target.addScaledVector(new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw)), 0.5);
      const off = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), -Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
      let dist = c.dist;
      const hit = W.castRay(new RAPIER.Ray(target, off), dist, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.player.collider);
      if (hit) dist = Math.max(0.4, hit.timeOfImpact - 0.25);
      cam.position.copy(target).addScaledVector(off, dist);
      const gy = terrainHeight(cam.position.x, cam.position.z) + 0.25;
      if (cam.position.y < gy) cam.position.y = gy;
      cam.lookAt(target.clone().addScaledVector(off, -10));
      if (this.player.shake > 0) { cam.position.x += (Math.random() - 0.5) * this.player.shake * 0.15; cam.position.y += (Math.random() - 0.5) * this.player.shake * 0.15; this.player.shake = Math.max(0, this.player.shake - dt); }
    } else {
      const m = this.driving;
      if (c.cab) {
        c.cabYaw = clamp(c.cabYaw - look.x, -1.9, 1.9); c.cabPitch = clamp(c.cabPitch - look.y, -1.1, 0.9);
        const seat = m.seatWorld();
        cam.position.copy(seat);
        cam.layers.disable(EXTERIOR);
        const yaw = m.yaw + m.swing + c.cabYaw;
        cam.lookAt(seat.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(c.cabPitch), Math.sin(c.cabPitch), Math.cos(yaw) * Math.cos(c.cabPitch))));
      } else {
        cam.layers.enable(EXTERIOR);
        c.exYaw -= look.x; c.exPitch = clamp(c.exPitch - look.y, -1.3, 0.35);
        if (this.frontCamT > 0) {
          // ease round to a front-quarter view of the loader bucket (manual looking cancels it)
          this.frontCamT = Math.abs(look.x) + Math.abs(look.y) > 0.002 ? 0 : this.frontCamT - dt;
          const fm = m.frontMouth.getWorldPosition(this._fm || (this._fm = new THREE.Vector3()));
          let d = (Math.atan2(fm.x - m.root.position.x, fm.z - m.root.position.z) + 0.6) - c.exYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
          const k = 1 - Math.exp(-dt * 3.5);
          c.exYaw += d * k; c.exPitch += (-0.32 - c.exPitch) * k;
          c.exDist += (Math.max(c.exDist, 11) - c.exDist) * k;
        }
        if (this.input) c.exDist = clamp(c.exDist + this.input.wheel * 0.8, 5, 34);
        const target = m.root.position.clone().add(new THREE.Vector3(0, 2.6 * Math.max(0.6, m.s), 0));
        if (this.frontCamT > 0 && this._fm) target.lerp(this._fm.clone().setY(target.y - 0.6), 0.45); // frame the front bucket
        const off = new THREE.Vector3(Math.sin(c.exYaw) * Math.cos(c.exPitch), -Math.sin(c.exPitch), Math.cos(c.exYaw) * Math.cos(c.exPitch));
        let dist = c.exDist;
        const own = new Set(m.bodies.map((b) => b.body.handle));
        const hit = W.castRay(new RAPIER.Ray(target, off), dist, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, (col) => !col.parent() || !own.has(col.parent().handle));
        if (hit) dist = Math.max(2.5, hit.timeOfImpact - 0.35);
        cam.position.copy(target).addScaledVector(off, dist);
        const gy = terrainHeight(cam.position.x, cam.position.z) + 0.4;
        if (cam.position.y < gy) cam.position.y = gy;
        cam.lookAt(target);
      }
    }
    cam.updateMatrixWorld();
  }
  // destruction combos: lots of blocks coming down within a few seconds of each other pop up big on screen
  comboUpdate(dt) {
    this.comboT = (this.comboT || 0) - dt;
    if (this.comboT > 0) return;
    this.comboT = 0.25;
    const cam = this.camera.position, total = this.demo.detachCount || 0;
    const c = this.combo || (this.combo = { last: total, n: 0, quiet: 0 });
    const fell = Math.max(0, total - c.last); c.last = total;
    if (fell > 0) { c.n += fell; c.quiet = 0; } else if (c.n) c.quiet += 0.25;
    if (c.n && (c.quiet >= 1.6 || c.n > 400)) {
      const n = c.n; c.n = 0; c.quiet = 0;
      this.contracts.onCombo(n);
      if (n < 10) return;
      const best = this.prefs.bestCombo || 0, rec = n > best && n >= 15;
      if (rec) { this.prefs.bestCombo = n; this.savePrefs(); }
      const word = n >= 120 ? 'APOCALYPSE!' : n >= 70 ? 'MEGA SMASH!' : n >= 40 ? 'HUGE SMASH!' : n >= 20 ? 'BIG SMASH!' : 'SMASH!';
      this.ui.bigPop(`<b>💥 ${n} BLOCKS</b><small>${rec ? '🏆 NEW RECORD! ' : ''}${word}${!rec && best ? ` · best ${best}` : ''}</small>`, rec ? 'rec' : '');
      if (rec && n >= 40) this.audio.firework(cam.clone().add(new THREE.Vector3(0, 8, 0)), 0.1);
    }
  }
  updateFlyCam(dt) {
    const f = this.flyCam, input = this.input, cam = this.camera;
    const look = input.consumeLook();
    f.yaw -= look.x; f.pitch = clamp(f.pitch - look.y, -1.5, 1.5);
    const dir = new THREE.Vector3(-Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), -Math.cos(f.yaw) * Math.cos(f.pitch));
    const right = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    const sp = (input.held('sprint') ? 24 : 8) * dt;
    f.pos.addScaledVector(dir, clamp(input.moveY, -1, 1) * sp).addScaledVector(right, clamp(input.moveX, -1, 1) * sp);
    if (input.held('jump')) f.pos.y += sp; if (input.held('cam')) f.pos.y -= sp;
    f.pos.y = Math.max(terrainHeight(f.pos.x, f.pos.z) + 0.3, Math.min(120, f.pos.y));
    cam.position.copy(f.pos); cam.lookAt(f.pos.clone().add(dir)); cam.updateMatrixWorld();
  }
  aimRay() {
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const o = this.camera.position;
    return { origin: { x: o.x, y: o.y, z: o.z }, dir: { x: dir.x, y: dir.y, z: dir.z }, max: this.cam.dist + 4 };
  }

  // ======================================================================= context prompts (on foot)
  contextAction() {
    const p = this.player.pos, b = this.bucket, touch = this.input.touch;
    const key = (k) => (touch ? '' : `<kbd>${k}</kbd> `);
    // charges set: E sets them off
    const mine = this.charges.mine(this.myId).length;
    if (mine && this.charges.armed(this.myId)) return { text: '🧨 Get clear, the charges are about to blow!' };
    if (mine && this.tool === 'charges') return { text: `${key('E')}Detonate ${mine} charge${mine > 1 ? 's' : ''} 🧨`, label: 'BOOM', run: () => this.act('detonate', {}) };
    // machines
    let best = null, bd = 1e9;
    for (const m of this.machines.values()) {
      const d = Math.hypot(p.x - m.doorWorld().x, p.z - m.doorWorld().z);
      if (d < 3.2 * Math.max(1, m.s) && d < bd) { bd = d; best = m; }
    }
    if (best) {
      if (best.driver >= 0) return { text: `${best.spec.icon} ${best.spec.name} · driven by ${this.playerName(best.driver)}` };
      return { text: `${key('E')}Drive the ${best.spec.icon} ${best.spec.name}`, label: 'DRIVE', run: () => this.act('enter', { id: best.id }) };
    }
    // brick press: pour your bucket of dust in, or switch the feeder belt
    const pp = this.press.panelWorld;
    if (Math.hypot(p.x - pp.x, p.z - pp.z) < 2.4) {
      const pr = this.press, blocks = Math.floor(pr.dust / BRICK_KG);
      if (b.kind === 'dust') return { text: `${key('E')}Pour ${fmtKg(b.kg)} of dust into the brick press`, label: 'POUR', run: () => this.act('pressPour', {}) };
      return { text: `${key('E')}Feeder belt ${pr.feeding ? 'OFF' : 'ON'} · ${fmtKg(pr.dust)} dust (${blocks} block${blocks === 1 ? '' : 's'}) · ${pr.status}`, label: pr.feeding ? 'FEED OFF' : 'FEED ON', run: () => this.act('pressFeed', {}) };
    }
    // mixer
    const mp = this.mixer.panelPoint, tc = this.mixer.tubCenter;
    if (Math.hypot(p.x - mp.x, p.z - mp.z) < 2.6 || (Math.hypot(p.x - tc.x, p.z - tc.z) < 2.3 && p.y > 1.0)) {
      return { text: `${key('E')}Open the cement mixer controls`, label: 'MIXER', run: () => this.ui.open('mixerPanel') };
    }
    // trowel cement: paver hopper
    const mc = this.players.get(this.myId).cement;
    if (mc.kg > 0) {
      for (const m of this.machines.values()) if (m.family === 'paver') {
        const hp = m.att.mouth.getWorldPosition(new THREE.Vector3());
        if (Math.hypot(p.x - hp.x, p.z - hp.z) < 2.6) return { text: `${key('E')}Tip your trowel cement into the paver hopper (${fmtKg(m.payload.kg)})`, label: 'POUR', run: () => this.act('pourCement', { target: 'paver', id: m.id }) };
      }
      const h = this.road.nearest(p, 1.8);
      if (h >= 0) return { text: `${key('E')}Fill the pothole (${fmtKg(this.road.holes[h].filled)} of ${fmtKg(this.road.holes[h].need)})`, label: 'FILL', run: () => this.act('layCement', { x: this.road.holes[h].x, z: this.road.holes[h].z }) };
    }
    // paver hopper
    if (b.kind === 'cement') {
      for (const m of this.machines.values()) if (m.family === 'paver') {
        const hp = m.att.mouth.getWorldPosition(new THREE.Vector3());
        if (Math.hypot(p.x - hp.x, p.z - hp.z) < 2.6) return { text: `${key('E')}Pour cement into the paver hopper (${fmtKg(m.payload.kg)})`, label: 'POUR', run: () => this.act('bucketPour', { target: 'paver', id: m.id }) };
      }
    }
    // potholes
    if (b.kind === 'cement') {
      const h = this.road.nearest(p, 1.6);
      if (h >= 0) return { text: `${key('E')}Pour cement into the pothole (${fmtKg(this.road.holes[h].filled)} of ${fmtKg(this.road.holes[h].need)})`, label: 'POUR', run: () => this.act('bucketPour', { target: 'hole', hole: h }) };
    }
    // lake
    if (lakeDist(p.x, p.z) < 1.25 && (!b.kind || (b.kind === 'water' && b.kg < BUCKET))) return { text: `${key('E')}Fill your bucket with lake water`, label: 'WATER', run: () => this.act('bucketFill', { source: 'lake' }) };
    // dust pile
    const pc = this.crusher.pileWorld(), { r } = this.crusher.pileDims();
    if (this.crusher.pileKg > 1 && Math.hypot(p.x - pc.x, p.z - pc.z) < r + 1.6 && (!b.kind || (b.kind === 'dust' && b.kg < BUCKET))) return { text: `${key('E')}Shovel dust into your bucket`, label: 'DUST', run: () => this.act('bucketFill', { source: 'pile' }) };
    if (b.kind) return { text: `${key('E')}Tip out your bucket (${b.kind})`, label: 'TIP', run: () => this.act('bucketPour', { target: 'ground' }), quiet: true };
    const carried = this.carriedBy(this.myId).length;
    if (carried) {
      const dHop = p.distanceTo(this.crusher.feedTarget);
      if (dHop < 11) return { text: touch ? 'Hold 🧱 to throw into the hopper' : 'Hold <kbd>G</kbd> to throw blocks into the hopper' };
      if (carried >= this.settings.carry) return { text: 'Arms full! Take the blocks to the crusher →' };
    }
    return null;
  }

  // ======================================================================= main loop
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.input.pollPad(dt, this.mode === 'machine');
    this.padUi();
    // one bad frame must never freeze the game: keep rendering and say what went wrong (once)
    try { this.tick(dt); } catch (e) {
      console.error(e);
      if (!this.errShown) { this.errShown = true; try { this.ui.toast('⚠️ Game error: ' + (e && e.message ? e.message : e) + ' (please report it)'); } catch (e2) { /* ignore */ } }
    }
    if (this.showroom.active) { this.showroom.render(this.renderer, dt); this.input.endFrame(); return; }
    if (this.debugCam) { this.camera.position.set(...this.debugCam[0]); this.camera.lookAt(...this.debugCam[1]); }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  // gamepad: Start opens the menu, and while a panel or the showroom is open the pad drives the UI
  padUi() {
    const P = this.input.padPressed; if (!P.size) return;
    const ui = this.ui, open = ui.isOpen();
    if (P.has('menu')) { if (open) ui.padBack(); else ui.open('menu'); return; }
    if (open) ui.padNav(P);
    else {
      if (P.has('toolPrev') || P.has('toolNext')) this.cycleTool(P.has('toolNext') ? 1 : -1);
    }
  }
  cycleTool(d) {
    const order = ['hammer', 'trowel', 'charges', 'build', 'scrape'], me = this.players.get(this.myId);
    const ok = (t) => (!this.prog || this.prog.has(t)) && (t !== 'trowel' || (me && me.cement.kg > 0));
    let i = order.indexOf(this.tool);
    for (let n = 0; n < 5; n++) { i = (i + d + 5) % 5; if (ok(order[i])) { if (order[i] !== this.tool) this.selectTool(order[i]); return; } }
  }

  // build-time asset generation (scripts/thumbs.cjs): transparent machine renders + 3D logo
  makeThumbs(w, h) {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const out = {};
    for (const sp of MACHINES) out[sp.id] = this.showroom.thumbnail(r, sp.id, w, h);
    this.showroom.close(); r.dispose();
    return out;
  }
  makeLogo(fontJson, w, h) { return renderLogo(fontJson, w, h); }
  buildingDefs() { return BUILDINGS.map((b) => b.id); }

  // run the simulation without rendering (used by automated tests)
  fastForward(seconds) { for (let i = 0; i < seconds * 60; i++) this.tick(1 / 60); }

  tick(dt) {
    const input = this.input, auth = this.authority;
    const uiOpen = this.ui.isOpen();
    input.enabled = !uiOpen;
    if (input.pressed('shop')) this.ui.toggle('spawn');
    if (input.pressed('multi')) this.ui.toggle('multi');
    if (input.pressed('help')) this.ui.toggle('help');
    if (input.pressed('jobs')) this.ui.toggle('contracts');
    const machList = [...this.machines.values()];

    // ---- local control
    let ctxPrompt = null;
    if (this.mode === 'foot' && this.flyCam) this.updateFlyCam(dt);
    else if (this.mode === 'foot') {
      this.updateCamera(dt);
      this.player.update(dt, input, this.cam.yaw, this.aimRay());
      // place the camera again on the player's new position: a camera one frame behind makes the character
      // jump away and back on every uneven frame (most visible during the hitches right after launch)
      this.updateCamera(0);
      if (input.pressed('tool1')) this.selectTool('hammer');
      if (input.pressed('tool2')) this.selectTool('trowel');
      if (input.pressed('tool3')) this.selectTool('charges');
      if (input.pressed('tool4')) this.selectTool('build');
      if (input.pressed('tool5')) this.selectTool('scrape');
      // charge tool: click a block to stick a charge on it (E sets them all off)
      const fire = input.held('hammer') && !uiOpen;
      if (this.tool === 'charges' && fire && !this.chargeDown) {
        const p = this.player.target, aim = this.aimRay();
        if (p && this.player.aimPoint) this.act('charge', { id: p.id, point: this.player.aimPoint.toArray().map((v) => Math.round(v * 1000) / 1000), facing: [-aim.dir.x, 0, -aim.dir.z], from: this.player.pos.toArray() });
        else this.ui.toast('🧨 Aim at a wall block within reach to place a charge');
        this.audio.click();
      }
      this.chargeDown = fire;
      // trowel: hold click / the action button to lay cement tiles where you aim
      this.trowelT = (this.trowelT || 0) - dt;
      const me = this.players.get(this.myId);
      // trowel on a block or the build slab: one splash of mortar per click
      const bhit = (this.tool === 'trowel' && me.cement.kg > 0) || this.tool === 'build' || this.tool === 'scrape' ? this.builder.aim() : null;
      let holeI = -1;
      if (this.tool === 'trowel' && me.cement.kg > 0) { const tt = this.trowelTarget(); holeI = this.road.nearest({ x: tt.x, y: 0, z: tt.z }, 1.4); if (holeI >= 0 && this.road.holes[holeI].filled >= this.road.holes[holeI].need) holeI = -1; }
      const m0 = this.tool === 'trowel' && me.cement.kg > 0 ? this.builder.mortarTarget(bhit) : null;
      const mhit = m0 && (holeI < 0 || m0.piece) ? m0 : null;
      // remove tool: scrape off a splash of mortar, or knock a laid block loose
      const shit = this.tool === 'scrape' ? this.builder.scrapeTarget(bhit) : null;
      if (shit) { this.builder.showSplashGhost(shit, new THREE.Color(0xff4a3a)); if (shit.piece) this.builder.splashGhost.scale.setScalar(2.4); }
      else this.builder.showSplashGhost(mhit, me.cement.color);
      const click = input.held('hammer') && !uiOpen, clicked = click && !this.clickDown; this.clickDown = click;
      if (this.tool === 'scrape') {
        this.slabGhost.visible = false;
        if (clicked) {
          if (!shit) this.ui.toast('🗑️ Aim at a splash of mortar or a block you laid to remove it');
          else { this.player.swingT = -1; this.act('scrape', { point: shit.point.toArray().map((v) => Math.round(v * 1000) / 1000), piece: shit.piece ? shit.piece.id : -1 }); this.audio.click(); }
        }
      } else if (mhit) {
        this.slabGhost.visible = false;
        if (clicked) { this.player.swingT = -1; this.act('mortar', { point: mhit.point.toArray().map((v) => Math.round(v * 1000) / 1000), normal: mhit.normal.toArray(), piece: mhit.piece ? mhit.piece.id : -1 }); this.audio.click(); }
      } else if (this.tool === 'trowel' && me.cement.kg > 0 && holeI >= 0) {
        // aiming at a pothole: the trowel fills it
        const t = this.trowelTarget(), h = this.road.holes[holeI];
        this.slabGhost.visible = true;
        this.slabGhost.position.set(h.x, 0.08, h.z); this.slabGhost.scale.set(h.r * 1.9, 1, h.r * 1.9);
        this.slabGhost.material.color.copy(me.cement.color);
        if (input.held('hammer') && this.trowelT <= 0 && !uiOpen) { this.trowelT = 0.22; this.player.swingT = -1; this.act('layCement', t); this.audio.click(); }
      } else this.slabGhost.visible = false;
      // build tool: lay the blocks you carry where the ghost shows (R turns it)
      if (this.tool === 'build') {
        const bricks = this.carriedBy(this.myId).filter((p) => p.brick);
        if (input.pressed('stickOut')) this.builder.rot ^= 1;
        const pose = bricks.length ? this.builder.ghostPose(bhit, this.builder.rot) : null, ok = pose && this.builder.valid(pose, this.builder.rot);
        this.builder.showGhost(pose, this.builder.rot, ok);
        if (clicked) {
          if (!bricks.length) this.ui.toast('🧱 Pick up pressed blocks first (<b>Q</b> at the brick press pallet)');
          else if (!pose) this.ui.toast('🧱 Aim at the slab, the ground or the top of a block');
          else if (!ok) this.ui.toast('🧱 Something is in the way there');
          else { this.act('placeBrick', { id: bricks[bricks.length - 1].id, pos: pose.toArray().map((v) => Math.round(v * 1000) / 1000), rot: this.builder.rot }); this.audio.click(); }
        }
      } else this.builder.ghost.visible = false;
      const nb = this.carriedBy(this.myId).filter((p) => p.brick).length;
      if (nb !== this.lastBricks) { this.lastBricks = nb; this.ui.setHotbar(); }
      const c = this.contextAction();
      ctxPrompt = c;
      if (c && c.run && input.pressed('use')) c.run();
      this.ui.setCrosshair(!!this.player.target, true);
      this.ui.setCarry(this.carriedBy(this.myId).length, this.settings.carry);
    } else {
      this.slabGhost.visible = false; this.builder.hideGhosts();
      const m = this.driving;
      const ctl = {
        drive: clamp(input.moveY, -1, 1), steer: clamp(input.moveX, -1, 1),
        swing: clamp(-input.armX, -1, 1), boom: clamp(-input.armY, -1, 1),
        stick: (input.held('stickIn') ? 1 : 0) - (input.held('stickOut') ? 1 : 0),
        curl: (input.held('curlIn') ? 1 : 0) - (input.held('curlOut') ? 1 : 0),
        rot: (input.held('rotR') ? 1 : 0) - (input.held('rotL') ? 1 : 0),
        grabToggle: input.pressed('grab'),
      };
      m.drive(dt, ctl, machList);
      // backhoe: using the front loader turns the camera round to the front so you can see the bucket
      if (m.frontFrame && (ctl.grabToggle || ctl.rot) && !this.cam.cab) {
        this.frontCamT = 2.5;
        if (!this.frontTold) { this.frontTold = true; this.ui.toast('🪣 Front bucket: lower it (' + (input.touch ? 'LOADER ↓' : '<b>T</b>') + '), drive into loose rubble to fill it, raise it (' + (input.touch ? 'LOADER ↑' : '<b>Y</b>') + ') and tip it (' + (input.touch ? 'FRONT' : '<b>Click</b>') + ')', true, 7000); }
      }
      if (input.pressed('cam')) { this.cam.cab = !this.cam.cab; this.cam.cabYaw = 0; this.cam.cabPitch = -0.12; }
      const honk = input.held('horn');
      if (honk !== !!this.honking) { this.honking = honk; this.act('horn', { id: m.id, on: honk ? 1 : 0 }); }
      this.updateCamera(dt);
      if (input.pressed('use')) this.act('exit', { id: m.id });
      this.ui.setCrosshair(false, this.cam.cab);
      this.ui.setVehicle(m);
      this.player.teleport(m.doorWorld());
    }
    this.ui.setPrompt(uiOpen || !ctxPrompt ? null : ctxPrompt.text);
    if (input.touch) this.ui.setUseButton(this.mode === 'machine' ? 'EXIT' : ctxPrompt && ctxPrompt.label ? ctxPrompt.label : null);
    this.ui.setBucket(this.bucket);

    // ---- machines driven by others / idle
    for (const m of machList) {
      if (m !== this.driving && (m.driver >= 0 || !auth)) m.followNet(dt);
      m.idle(dt, m.driver >= 0);
      m.syncBodies();
      // road painter: a fine mist of paint under the spray bar while it sprays and moves
      if (m.family === 'painter' && m.openTarget > 0.5 && Math.abs(m.speed) > 0.1 && Math.random() < dt * 30) this.fx.dust(m.att.nozzle.getWorldPosition(new THREE.Vector3()), paintOf(m)[1], 1, 1.8, { alpha: 0.35, size: 0.45, life: 0.9, speed: 0.3 });
    }

    // ---- physics
    this.acc = (this.acc || 0) + dt;
    let steps = 0;
    while (this.acc >= 1 / 60 && steps < 3) { this.physics.world.step(this.physics.events); this.acc -= 1 / 60; steps++; }
    if (steps === 3) this.acc = 0;

    // ---- simulation
    this.demo.update(dt);
    if (auth) {
      this.collisionSounds();
      const W = this.machineWorld();
      for (const m of machList) machineInteract(m, dt, W);
      this.crusher.update(dt, this.demo, this.fx, this.audio, (p) => this.crushPiece(p));
      this.intake.update(dt, this.demo, this.fx, this.audio, this.intakeCb());
      this.breakBigAtIntakes(dt);
      if (this.mixer.simulate(dt)) this.mixerDirty = true;
      this.mixTimer = (this.mixTimer || 0) - dt;
      if (this.mixer.dust > 0 && this.mixer.water > 0 && this.mixTimer <= 0) { this.mixTimer = 1; this.mixerDirty = true; }
    } else {
      this.crusher.update(dt, this.demo, this.fx, this.audio, null);
      this.intake.update(dt, this.demo, this.fx, this.audio, null);
      for (const p of this.demo.pieces) if (p.state === HELD && p.holdLocal) {
        const m = this.machines.get(p.holder); if (!m) continue;
        const mw = heldWorld(m, p.holdLocal, new THREE.Matrix4());
        const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); mw.decompose(pos, q, s);
        this.demo.placeCarried(p, pos, q, 1);
      }
    }
    this.mixer.update(dt);
    this.press.update(dt, this.demo, this.fx, this.audio, auth ? this.pressCb() : null);
    if (auth) {
      this.pressTimer = (this.pressTimer || 0) - dt;
      if (this.press.changed || this.pressDirty || (this.press.feeding && this.pressTimer <= 0)) { this.press.changed = false; this.pressDirty = false; this.pressTimer = 1; this.events.push(['press', this.press.serialize()]); }
    }
    this.road.update(dt, this.fx);
    this.slabs.update(dt);
    this.updatePlayers(dt);
    this.fx.update(dt, this.camera);

    // ---- network
    if (this.net.online) {
      this.netTick = (this.netTick || 0) - dt;
      if (this.netTick <= 0) {
        this.netTick = 1 / NET_HZ;
        if (this.net.isHost) { this.flushNet(); this.sendSnapshot(); }
        else this.sendMyPose();
      }
    } else { this.events = []; this.demo.changes = []; }

    // ---- audio / shadows / hud
    const yaw = this.mode === 'foot' ? this.cam.yaw : (this.cam.cab ? this.driving.yaw + this.driving.swing + Math.PI : this.cam.exYaw);
    this.audio.setListener(this.camera.position, yaw);
    let loud = this.driving;
    if (!loud) { let bd = 1e9; for (const m of machList) if (m.driver >= 0) { const d = m.pos.distanceTo(this.camera.position); if (d < bd) { bd = d; loud = m; } } }
    // every running machine nearby gets its own engine / tracks / hydraulics voice from the recordings
    const voices = (this._voiceList = this._voiceList || []); voices.length = 0;
    for (const m of machList) {
      const sp = m.spec, f = m.family;
      voices.push({ pos: m.pos, running: m.driver >= 0, rpm: m.rpm, hyd: m.hyd, speed: m.speed, turn: m.turn, vmax: sp.speed, tons: sp.tons || 20,
        tracked: ['steel', 'rubber', 'pontoon'].includes(sp.under) || ['dozer', 'crane', 'paver', 'dumper'].includes(f),
        breaker: !!m.breakerActive, vibrating: !!m.vibrating, beep: ['truck', 'loader', 'dumper', 'roller', 'painter'].includes(f) && m.speed < -0.3 });
    }
    this.traffic.voices(this.camera.position, voices);
    const sampled = this.audio.updateMachines(voices);
    this.audio.updateLoops(this.crusher, sampled ? null : loud ? { pos: loud.pos, running: true, rpm: loud.rpm, hyd: loud.hyd } : { pos: this.camera.position, running: false, rpm: 0, hyd: 0 });
    const focus = this.mode === 'foot' ? this.player.pos : this.driving.root.position;
    this.dn.cycle = this.dayCycle();
    this.weather.update(dt, this.camera, auth, this.prefs.weather);
    if (this.net.isHost && this.weather.state !== this.lastWx) { this.lastWx = this.weather.state; this.todTimer = 0; }
    const view = (this._dnView = this._dnView || { focus: new THREE.Vector3(), head: new THREE.Vector3(), dir: new THREE.Vector3(), machine: null, machines: null });
    view.focus.copy(focus); view.machine = this.driving; view.machines = machList;
    view.head.copy(this.player.pos); view.head.y += 1.75; this.camera.getWorldDirection(view.dir);
    this.dn.update(dt, view);
    if (this.net.isHost) {
      this.todTimer = (this.todTimer || 0) - dt;
      if (this.todTimer <= 0) { this.todTimer = 10; this.events.push(['tod', Math.round(this.dn.p * 1e4) / 1e4, this.dayCycle(), this.weather.state]); }
    }
    this.env.updateShadow(new THREE.Vector3(Math.round(focus.x), 0, Math.round(focus.z)));
    this.env.water.material.normalMap.offset.x += dt * 0.01; this.env.water.material.normalMap.offset.y += dt * 0.006;
    this.ui.updatePopups(dt, this.camera);
    if (input.pressed('photo') && !this.input.touch) {
      const on = document.body.classList.toggle('photo');
      // on foot, photo mode also frees the camera: fly with WASD + mouse, Space up, C down, Shift faster
      this.flyCam = on && this.mode === 'foot' ? { pos: this.camera.position.clone(), yaw: this.cam.yaw, pitch: this.cam.pitch } : null;
      if (on) this.ui.toast(this.flyCam ? '📷 Photo mode: fly with <b>WASD</b> + mouse, <b>Space</b> / <b>C</b> up and down, <b>P</b> to leave' : '📷 Photo mode: <b>P</b> to leave', true, 2500);
    }
    this.charges.update(dt, auth);
    this.traffic.update(dt);
    this.comboUpdate(dt);
    this.contracts.update(dt);
    if (this.prog) this.prog.update(dt);
    this.careerT = (this.careerT || 0) - dt; if (this.careerT <= 0) { this.careerT = 0.5; this.ui.setCareer(); }
    this.builder.update(dt);
    if (auth) {
      this.glueT = (this.glueT || 0) - dt;
      if (this.glueT <= 0) { this.glueT = 0.5; if (this.glueSettled() | this.builder.tidy()) this.events.push(['mortar', this.builder.pack()]); }
    }
    for (const id of this.horns) { const m = this.machines.get(id); if (!m) { this.horns.delete(id); this.audio.horn(id, null, false); } else this.audio.horn(id, m.pos, true, this.hornPitch(m)); }
    if (auth) {
      this.partyTimer = (this.partyTimer || 0) - dt;
      if (this.partyTimer <= 0) { this.partyTimer = 1; this.checkCleared(); }
    }
    this.hudTimer = (this.hudTimer || 0) - dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.3;
      this.ui.setDust(this.crusher.totalKg, this.crusher.tally, this.crusher.pileKg, this.mixer.cement, `${this.road.repaired}/${this.road.holes.length}${this.road.compacted ? ' ⭐' + this.road.compacted : ''}`);
      const n = this.players.size;
      this.ui.setNet(this.net.isHost ? `🌐 Hosting · code <b>${this.net.code}</b> · ${n} player${n > 1 ? 's' : ''}` : this.net.isClient ? `🌐 Online · <b>${this.net.code}</b> · ${n} players` : null);
      if (!$('mixerPanel').classList.contains('hidden')) this.ui.renderMixer();
    }
    if (auth) {
      this.autoTimer = (this.autoTimer || 60) - dt;
      if (this.autoTimer <= 0) { this.autoTimer = 60; if (this.prog) this.progSave(); else this.saveSlot('auto', true); }
    }
  }

  machineWorld() {
    if (this._mw) return this._mw;
    const g = this;
    this._mw = {
      demo: this.demo, sfx: this.sfx, crusher: this.crusher, mixer: this.mixer, road: this.road, press: this.press,
      onPress() { g.pressDirty = true; },
      get capacityScale() { return g.settings.grapple; },
      onPayload(m) { m.payDirty = true; },
      onPile(delta) { g.events.push(['take', -delta]); },
      onMixer() { g.mixerDirty = true; },
      onRoad() { g.roadTimer = 0; g.roadDirty = true; },
      onDeposit(kg, col) { g.events.push(['dep', kg, col.r, col.g, col.b]); },
      onBucketCrush(kg, col) { g.crusher.totalKg += kg; const h = col.getHex(); g.crusher.tally.set(h, (g.crusher.tally.get(h) || 0) + kg); g.events.push(['tally', kg, h]); },
      tellDriver(m, msg) { if (m.driver >= 0) g.tell(m.driver, msg, true); },
      physics: this.physics,
      get machines() { return [...g.machines.values()]; },
    };
    return this._mw;
  }

  // a big panel dropped on the crusher hopper or into the truck intake is broken up so the pieces fit
  breakBigAtIntakes(dt) {
    this.bigT = (this.bigT || 0) - dt;
    if (this.bigT > 0) return;
    this.bigT = 0.2;
    const cr = this.crusher, l = new THREE.Vector3();
    for (const p of this.demo.pieces) {
      if (p.state !== LOOSE || !this.demo.isBig(p)) continue;
      cr.toLocal(p.pos, l);
      if (Math.abs(l.x) > 3.4) continue;
      const hopper = l.z > -8.8 && l.z < -1.6 && l.y > 1.4 && l.y < 8;
      const intake = l.z > -35 && l.z < -20.5 && l.y < 3.5;
      if (!hopper && !intake) continue;
      // break it right over the opening, chunks gathered in so they drop in instead of spilling over the rim
      const c = hopper ? cr.root.localToWorld(new THREE.Vector3(0, Math.max(l.y, 4.6), -4.6)) : cr.root.localToWorld(new THREE.Vector3(0, Math.max(l.y, 1.2), THREE.MathUtils.clamp(l.z, -33, -23)));
      p.pos.copy(c);
      this.demo.shatter(p, 0, 0.3);
    }
  }

  // intake line callbacks (authority): blocks swallowed by the compactor, cubes crushed in the hopper
  intakeCb() {
    if (this._icb) return this._icb;
    const g = this, mute = { crunch() {} };
    this._icb = {
      eat(p, color) { const kg = p.kg; g.demo.vanish(p); g.events.push(['ix', 'eat', kg, color.r, color.g, color.b]); },
      event(e) { g.events.push(e); },
      crush(cube, at) {
        cube.parts.forEach((q, i) => {
          g.crusher.crushVisual(q.kg, q.color, at, g.fx, i ? mute : g.audio);
          g.events.push(['crush', q.kg, q.color.r, q.color.g, q.color.b, at.toArray().map((v) => +v.toFixed(2))]);
        });
        g.ui.popup('+' + fmtKg(cube.kg), at, '#' + cube.color.getHexString());
      },
    };
    return this._icb;
  }

  crushPiece(p) {
    const kg = p.kg, color = this.demo.dustColor(p).clone(), at = p.pos.clone();
    this.demo.vanish(p);
    this.crusher.crushVisual(kg, color, at, this.fx, this.audio);
    this.events.push(['crush', kg, color.r, color.g, color.b, at.toArray().map((v) => +v.toFixed(2))]);
    this.ui.popup('+' + fmtKg(kg), at, '#' + color.getHexString());
  }

  updatePlayers(dt) {
    if (this.roadDirty) { this.roadTimer = (this.roadTimer || 0) - dt; if (this.roadTimer <= 0) { this.roadTimer = 0.5; this.roadDirty = false; this.events.push(['road', this.road.serialize()]); } }
    const k = 1 - Math.exp(-dt * 12);
    for (const pl of this.players.values()) {
      if (!pl.local) {
        if (pl.target) pl.pos.lerp(pl.target, k);
        const a = pl.avatar;
        a.group.visible = pl.driving < 0;
        a.group.position.copy(pl.pos);
        let d = pl.yaw - a.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        a.group.rotation.y += d * k;
        a.animate(dt, { speed: pl.speed, grounded: pl.grounded, swingT: pl.swingT, carrying: this.carriedBy(pl.id).length > 0, bucket: !!pl.bucket.kind });
      }
      // stack carried blocks in front of the avatar
      const carried = this.carriedBy(pl.id);
      if (!carried.length) continue;
      const av = pl.avatar.group;
      const base = av.localToWorld(new THREE.Vector3(0, 1.05, 0.62));
      const q = av.getWorldQuaternion(new THREE.Quaternion());
      let y = 0;
      carried.forEach((p, i) => {
        const big = Math.max(p.size.x, p.size.y, p.size.z), s = Math.min(1, 0.75 / big);
        if (i >= 6) { this.demo.placeCarried(p, base, q, 0); return; }
        const h = Math.min(p.size.x, p.size.y, p.size.z) * s;
        const qq = q.clone();
        if (p.size.y > p.size.x) qq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
        this.demo.placeCarried(p, base.clone().add(new THREE.Vector3(0, y + h / 2, 0)), qq, s);
        y += h + 0.01;
      });
    }
  }

  collisionSounds() {
    const now = performance.now();
    this.physics.events.drainContactForceEvents((e) => {
      const p = this.demo.byCollider.get(e.collider1()) || this.demo.byCollider.get(e.collider2());
      if (!p || (p.lastSnd && now - p.lastSnd < 250)) return;
      p.lastSnd = now;
      const s = Math.min(1, e.totalForceMagnitude() / (p.kg * 60 + 40));
      if (s > 0.08) {
        this.sfx.impact(p.type.sound, s, p.pos);
        if (s > 0.35 && Math.random() < 0.5) this.sfx.dust(p.pos, this.demo.chipColor(p), 1, 0.4, { alpha: 0.25 });
      }
    });
  }
}

const game = new Game();
window.__game = game; window.__RAPIER = RAPIER; // test hooks
game.init().catch((e) => { console.error(e); progress(1, 'Error: ' + e.message); });
