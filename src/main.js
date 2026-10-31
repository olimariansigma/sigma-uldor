import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { setAnisotropy } from './textures.js';
import { materials } from './materials.js';
import { TypeRegistry } from './pieces.js';
import { buildWorld, SITE } from './world.js';
import { Demolition } from './demolition.js';
import { JOBS } from './jobs.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Crusher } from './crusher.js';
import { Excavator } from './excavator.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { UI, UPGRADES, STATS } from './ui.js';

const SAVE_KEY = 'wreckingyard.save.v1';
const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const clamp = THREE.MathUtils.clamp;

function progress(p, text) { $('loadfill').style.width = (p * 100) + '%'; if (text) $('loadtext').textContent = text; }

function loadSave() {
  const def = { money: 0, up: { hammer: 0, carry: 0, rate: 0, sorter: 0, excavator: 0, grapple: 0 }, job: 0, unlocked: ['bungalow'], done: [], tutorial: true,
    settings: { quality: null, volume: 0.8, sens: 1, invert: false } };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) return { ...def, ...s, up: { ...def.up, ...s.up }, settings: { ...def.settings, ...s.settings } };
  } catch (e) { /* ignore */ }
  return def;
}

class Game {
  async init() {
    this.save = loadSave();
    const touch = 'ontouchstart' in window || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (!this.save.settings.quality) this.save.settings.quality = touch ? 'medium' : 'high';
    const qp = new URLSearchParams(location.search).get('q');
    if (qp) this.save.settings.quality = qp;
    const q = this.save.settings.quality;

    progress(0.05, 'Starting physics engine…');
    await RAPIER.init();
    await frame();

    const renderer = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    $('game').appendChild(renderer.domElement);
    this.renderer = renderer;
    setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 3000);
    this.applyQuality(q);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    this.physics = { world, R: RAPIER, events: new RAPIER.EventQueue(true) };

    progress(0.15, 'Firing bricks…');
    await frame();
    this.M = materials();
    progress(0.35, 'Landscaping…');
    await frame();
    this.types = new TypeRegistry(this.M);
    this.env = buildWorld(this.scene, renderer, this.physics, this.M);
    progress(0.55, 'Delivering machinery…');
    await frame();
    this.fx = new FX(this.scene);
    this.audio = new Audio();
    this.audio.setVolume(this.save.settings.volume);
    this.demo = new Demolition(this.scene, this.physics, this.types, this.fx, this.audio);
    this.crusher = new Crusher(this.scene, this.physics, this.M, SITE.crusherPos, SITE.crusherRot);
    this.excavator = new Excavator(this.scene, this.physics, this.M, SITE.excavatorPos, SITE.excavatorRot);
    this.player = new Player(this.scene, this.physics, this.M, SITE.playerSpawn);
    progress(0.75, 'Building the house…');
    await frame();
    this.input = new Input(renderer.domElement);
    this.input.sensitivity = this.save.settings.sens; this.input.invertY = this.save.settings.invert;
    this.ui = new UI(this);
    this.applyUpgrades();
    this.jobStatic = null;
    this.buildJob(this.save.job);
    console.log('init done', performance.now() | 0);
    progress(0.95, 'Compiling shaders…');
    await frame();
    this.mode = 'foot';
    this.cam = { yaw: 0.2, pitch: -0.22, dist: 4.4, exYaw: Math.PI * 0.8, exPitch: -0.3, exDist: 12, cab: false, cabYaw: 0, cabPitch: -0.1 };
    this.renderer.compile(this.scene, this.camera);
    this.updateCamera(0.016);
    this.renderer.render(this.scene, this.camera);
    progress(1, 'Ready!');
    console.log('first frame', performance.now() | 0);
    this.setupSettings();

    $('playBtn').classList.remove('hidden');
    $('titleHelp').classList.remove('hidden');
    $('loadbar').classList.add('hidden'); $('loadtext').classList.add('hidden');
    const start = () => {
      $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
      if (this.input.touch) { document.body.classList.add('touch'); $('touch').classList.remove('hidden'); this.input.bindTouchUI(); }
      this.audio.init();
      this.ui.setMode('foot', this.input.touch);
      this.ui.setMoney(this.save.money);
      if (!this.input.touch) renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
      if (this.save.tutorial) {
        this.ui.toast('🔨 Smash the house: <b>' + (this.input.touch ? 'tap 🔨' : 'click') + '</b> to swing your hammer', false, 5000);
        setTimeout(() => this.ui.toast('🧱 Pick up rubble (' + (this.input.touch ? '✋' : '<b>Q</b>') + ') and throw it (' + (this.input.touch ? '🧱' : '<b>G</b>') + ') into the yellow crusher hopper', false, 6000), 5200);
        setTimeout(() => this.ui.toast('💰 Every crushed piece earns money. Buy upgrades and the excavator in the shop!', true, 6000), 11500);
        this.save.tutorial = false;
      }
      this.last = performance.now();
      this.running = true;
      requestAnimationFrame((t) => this.loop(t));
    };
    $('playBtn').addEventListener('click', start, { once: true });
  }

  applyQuality(q) {
    const dpr = window.devicePixelRatio || 1;
    this.pixelRatio = q === 'low' ? Math.min(dpr, 1) * 0.8 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.quality = q;
    if (this.env) {
      const s = q === 'low' ? 1024 : q === 'medium' ? 2048 : 4096;
      const sh = this.env.sun.shadow;
      if (sh.mapSize.x !== s) { sh.mapSize.set(s, s); if (sh.map) { sh.map.dispose(); sh.map = null; } }
    }
    if (this.fx) this.fx.quality = q === 'low' ? 0.5 : 1;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 75 : 62;
    this.camera.updateProjectionMatrix();
  }

  setupSettings() {
    const s = this.save.settings;
    $('optQuality').value = s.quality;
    $('optVolume').value = s.volume; $('optSens').value = s.sens; $('optInvert').checked = s.invert;
    $('optQuality').addEventListener('change', (e) => { s.quality = e.target.value; this.applyQuality(s.quality); this.persist(); });
    $('optVolume').addEventListener('input', (e) => { s.volume = +e.target.value; this.audio.setVolume(s.volume); this.persist(); });
    $('optSens').addEventListener('input', (e) => { s.sens = +e.target.value; this.input.sensitivity = s.sens; this.persist(); });
    $('optInvert').addEventListener('change', (e) => { s.invert = e.target.checked; this.input.invertY = s.invert; this.persist(); });
    $('fullscreenBtn').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    });
    $('resetBtn').addEventListener('click', () => {
      if (confirm('Reset all progress?')) { localStorage.removeItem(SAVE_KEY); location.reload(); }
    });
  }

  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage full / disabled */ } }

  applyUpgrades() {
    const u = this.save.up;
    const h = STATS.hammer[u.hammer];
    this.player.damage = h.dmg; this.player.splash = h.splash; this.player.setHammerLevel(u.hammer);
    this.player.capacity = STATS.carry[u.carry];
    this.crusher.rate = STATS.rate[u.rate];
    this.crusher.mult = STATS.sorter[u.sorter];
    this.excavator.capacity = STATS.grapple[u.grapple];
  }

  buyUpgrade(id) {
    const u = UPGRADES.find((x) => x.id === id);
    const lvl = this.save.up[id] || 0;
    if (lvl >= u.levels.length - 1) return;
    const cost = u.levels[lvl + 1];
    if (this.save.money < cost) { this.audio.denied(); return; }
    this.save.money -= cost;
    this.save.up[id] = lvl + 1;
    this.applyUpgrades();
    this.audio.bigCash();
    this.ui.setMoney(this.save.money, true);
    this.ui.toast(`${u.icon} ${u.name} upgraded!`, true);
    this.ui.renderShop();
    this.persist();
  }

  startJob(i) {
    const j = JOBS[i];
    if (!this.save.unlocked.includes(j.id)) {
      if (this.save.money < j.cost) { this.audio.denied(); return; }
      this.save.money -= j.cost; this.save.unlocked.push(j.id);
      this.ui.setMoney(this.save.money, true);
    }
    if (this.mode === 'excavator') this.exitExcavator();
    this.player.dropAll(this.demo);
    this.excavator.releaseAll(this.demo, 0.016);
    this.save.job = i;
    this.buildJob(i);
    this.player.teleport(SITE.playerSpawn);
    this.ui.close('shop');
    this.ui.toast(`🏗️ New job: <b>${j.name}</b>`, true);
    this.persist();
  }

  buildJob(i) {
    const job = JOBS[i];
    const b = job.build(this.types, this.M);
    if (this.jobStatic) {
      this.scene.remove(this.jobStatic.group);
      this.physics.world.removeRigidBody(this.jobStatic.body);
    }
    const group = new THREE.Group();
    for (const d of b.decor) { const m = new THREE.Mesh(d.geo, d.mat); m.castShadow = true; m.receiveShadow = true; group.add(m); }
    this.scene.add(group);
    const body = this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const s of b.statics) this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(s.size.x / 2, s.size.y / 2, s.size.z / 2).setTranslation(s.pos.x, s.pos.y, s.pos.z), body);
    this.jobStatic = { group, body };
    this.demo.build(b.specs, 0.15);
    this.jobDoneFlag = this.save.done.includes(job.id) && false;
    this.jobCompletePaid = false;
    this.ui.setJob(job.name, 0);
  }

  onCash(value, pos) {
    this.save.money += value;
    this.earnAccum = (this.earnAccum || 0) + value;
    this.ui.popup(`+$${value % 1 ? value.toFixed(1) : value}`, pos);
    if (!this.cashCooldown || this.cashCooldown <= 0) { this.audio.cash(); this.cashCooldown = 0.12; }
    this.ui.setMoney(this.save.money, true);
    this.dirtySave = true;
  }

  // ---------- modes ----------
  enterExcavator() {
    this.mode = 'excavator';
    this.player.dropAll(this.demo);
    this.player.setVisible(false);
    this.player.body.setEnabled(false);
    this.excavator.driver.visible = true;
    this.cam.exYaw = this.excavator.yaw + this.excavator.swing + Math.PI;
    this.ui.setMode('excavator', this.input.touch);
    this.ui.toast('🚜 You are in the excavator. Rip the walls apart and drop the rubble in the hopper!', false, 3500);
  }
  exitExcavator() {
    this.mode = 'foot';
    const door = this.excavator.doorWorld();
    const out = door.clone().sub(this.excavator.cab.localToWorld(new THREE.Vector3(0, 0, 0.25))).setY(0).normalize();
    const p = door.clone().addScaledVector(out, 1.0); p.y = 0.3;
    this.player.body.setEnabled(true);
    this.player.teleport(p);
    this.player.setVisible(true);
    this.excavator.driver.visible = false;
    this.cam.yaw = this.cam.exYaw;
    this.ui.setMode('foot', this.input.touch);
  }

  // ---------- camera ----------
  updateCamera(dt) {
    const look = this.input ? this.input.consumeLook() : { x: 0, y: 0 };
    const c = this.cam;
    const cam = this.camera;
    const W = this.physics.world;
    if (this.mode === 'foot') {
      c.yaw -= look.x; c.pitch = clamp(c.pitch - look.y, -1.25, 0.95);
      if (this.input) c.dist = clamp(c.dist + this.input.wheel * 0.4, 2.2, 9);
      const target = this.player.pos.clone().add(new THREE.Vector3(0, 1.62, 0));
      const right = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
      target.addScaledVector(right, 0.5);
      const off = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), -Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
      let dist = c.dist;
      const ray = new RAPIER.Ray(target, off);
      const hit = W.castRay(ray, dist, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.player.collider);
      if (hit) dist = Math.max(0.4, hit.timeOfImpact - 0.25);
      cam.position.copy(target).addScaledVector(off, dist);
      if (cam.position.y < 0.25) cam.position.y = 0.25;
      cam.lookAt(target.clone().addScaledVector(off, -10));
      const shake = this.player.shake || 0;
      if (shake > 0) { cam.position.x += (Math.random() - 0.5) * shake * 0.15; cam.position.y += (Math.random() - 0.5) * shake * 0.15; this.player.shake = Math.max(0, shake - dt); }
    } else {
      const ex = this.excavator;
      if (c.cab) {
        c.cabYaw = clamp(c.cabYaw - look.x, -1.9, 1.9); c.cabPitch = clamp(c.cabPitch - look.y, -1.1, 0.7);
        const seat = ex.seatWorld();
        cam.position.copy(seat);
        const yaw = ex.yaw + ex.swing + c.cabYaw;
        const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(c.cabPitch), Math.sin(c.cabPitch), Math.cos(yaw) * Math.cos(c.cabPitch));
        cam.lookAt(seat.clone().add(dir));
      } else {
        c.exYaw -= look.x; c.exPitch = clamp(c.exPitch - look.y, -1.3, 0.35);
        if (this.input) c.exDist = clamp(c.exDist + this.input.wheel * 0.8, 6, 22);
        const target = ex.root.position.clone().add(new THREE.Vector3(0, 2.6, 0));
        const off = new THREE.Vector3(Math.sin(c.exYaw) * Math.cos(c.exPitch), -Math.sin(c.exPitch), Math.cos(c.exYaw) * Math.cos(c.exPitch));
        cam.position.copy(target).addScaledVector(off, c.exDist);
        if (cam.position.y < 0.4) cam.position.y = 0.4;
        cam.lookAt(target);
      }
    }
    cam.updateMatrixWorld();
  }

  aimRay() {
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const o = this.camera.position;
    return { origin: { x: o.x, y: o.y, z: o.z }, dir: { x: dir.x, y: dir.y, z: dir.z }, max: this.cam.dist + 4 };
  }

  // ---------- main loop ----------
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const input = this.input;
    const uiOpen = this.ui.isOpen();
    input.enabled = !uiOpen;
    if (input.pressed('shop')) this.ui.toggle('shop');
    if (input.pressed('help')) this.ui.toggle('help');
    this.cashCooldown = (this.cashCooldown || 0) - dt;

    // ---- simulation input (before physics step) ----
    let prompt = null, useLabel = null;
    const owned = !!this.save.up.excavator;
    if (this.mode === 'foot') {
      this.updateCamera(dt);
      const aim = this.aimRay();
      this.player.update(dt, input, this.cam.yaw, aim, this.demo, this.crusher, this.fx, this.audio);
      this.excavator.update(dt, null, this.demo, this.fx, this.audio);
      const dDoor = this.player.pos.distanceTo(this.excavator.doorWorld().setY(this.player.pos.y));
      if (dDoor < 3.2) {
        if (owned) {
          prompt = this.input.touch ? 'Tap <kbd>ENTER</kbd> to drive the excavator' : 'Press <kbd>E</kbd> to drive the excavator';
          useLabel = 'ENTER';
          if (input.pressed('use')) this.enterExcavator();
        } else prompt = `🔒 Buy the excavator in the shop for <b>$${UPGRADES[4].levels[1]}</b>`;
      } else if (this.player.carried.length) {
        const dHop = this.player.pos.distanceTo(this.crusher.feedTarget);
        prompt = dHop < 11 ? (this.input.touch ? 'Hold <kbd>🧱</kbd> to throw rubble into the hopper' : 'Hold <kbd>G</kbd> to throw rubble into the hopper') : null;
        if (this.player.carried.length >= this.player.capacity && !prompt) prompt = 'Hands full! Take the rubble to the crusher →';
      }
      this.ui.setCrosshair(!!this.player.target, true);
      this.ui.setCarry(this.player.carried.length, this.player.capacity);
    } else {
      const ctl = {
        drive: clamp(input.moveY, -1, 1), steer: clamp(input.moveX, -1, 1),
        swing: clamp(-input.armX, -1, 1), boom: clamp(-input.armY, -1, 1),
        stick: (input.held('stickIn') ? 1 : 0) - (input.held('stickOut') ? 1 : 0),
        curl: (input.held('curlIn') ? 1 : 0) - (input.held('curlOut') ? 1 : 0),
        grabToggle: input.pressed('grab'),
      };
      this.excavator.update(dt, ctl, this.demo, this.fx, this.audio);
      this.excavator.lastGp = this.excavator.grabPoint.getWorldPosition(new THREE.Vector3());
      if (input.pressed('cam')) { this.cam.cab = !this.cam.cab; this.cam.cabYaw = 0; }
      this.updateCamera(dt);
      useLabel = 'EXIT';
      if (input.pressed('use')) this.exitExcavator();
      this.ui.setCrosshair(false, this.cam.cab);
      this.ui.setVehicle(this.excavator.open, this.excavator.held.length, this.excavator.capacity);
    }
    this.ui.setPrompt(uiOpen ? null : prompt);
    if (input.touch) this.ui.setUseButton(useLabel);

    // ---- physics ----
    this.acc = (this.acc || 0) + dt;
    let steps = 0;
    while (this.acc >= 1 / 60 && steps < 3) {
      this.physics.world.step(this.physics.events);
      this.acc -= 1 / 60; steps++;
    }
    if (steps === 3) this.acc = 0;
    this.demo.update();
    this.collisionSounds();
    this.crusher.update(dt, this.demo, this.fx, this.audio, (v, p) => this.onCash(v, p));
    this.fx.update(dt, this.camera);

    // ---- audio / shadows / hud ----
    const yaw = this.mode === 'foot' ? this.cam.yaw : (this.cam.cab ? this.excavator.yaw + this.excavator.swing + Math.PI : this.cam.exYaw);
    this.audio.setListener(this.camera.position, yaw);
    this.audio.updateLoops(this.crusher, this.excavator);
    const focus = this.mode === 'foot' ? this.player.pos : this.excavator.root.position;
    this.env.updateShadow(new THREE.Vector3(Math.round(focus.x), 0, Math.round(focus.z)));
    this.ui.updatePopups(dt, this.camera);

    this.hudTimer = (this.hudTimer || 0) - dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      const job = JOBS[this.save.job];
      const prog = this.demo.progress;
      this.ui.setJob(job.name, prog);
      if (prog >= 0.9 && !this.jobCompletePaid) this.completeJob();
    }
    this.saveTimer = (this.saveTimer || 0) - dt;
    if (this.saveTimer <= 0) { this.saveTimer = 4; if (this.dirtySave) { this.dirtySave = false; this.persist(); } }

    if (this.debugCam) { this.camera.position.set(...this.debugCam[0]); this.camera.lookAt(...this.debugCam[1]); }
    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }

  completeJob() {
    this.jobCompletePaid = true;
    const i = this.save.job, job = JOBS[i];
    this.save.money += job.bonus;
    if (!this.save.done.includes(job.id)) this.save.done.push(job.id);
    this.ui.setMoney(this.save.money, true);
    this.audio.bigCash();
    this.ui.toast(`🏆 <b>${job.name}</b> demolished! Bonus <b style="color:#7dff7a">+$${job.bonus.toLocaleString()}</b>`, true, 6000);
    const next = JOBS[i + 1];
    setTimeout(() => this.ui.toast(next ? `📋 Next job available in the shop: <b>${next.name}</b>` : '🎉 You finished every job! Rebuild any site from the Jobs tab to keep earning.', false, 6000), 1800);
    this.persist();
  }

  collisionSounds() {
    const now = performance.now();
    this.physics.events.drainContactForceEvents((e) => {
      const a = this.demo.byCollider.get(e.collider1()) , b = this.demo.byCollider.get(e.collider2());
      const p = a || b;
      if (!p || (p.lastSnd && now - p.lastSnd < 250)) return;
      p.lastSnd = now;
      const f = e.totalForceMagnitude();
      const m = p.size.x * p.size.y * p.size.z * p.type.density;
      const s = Math.min(1, f / (m * 900 + 30));
      if (s > 0.08) {
        this.audio.impact(p.type.sound, s, p.pos);
        if (s > 0.35 && Math.random() < 0.5) this.fx.dust(p.pos, p.type.dust, 1, 0.4, { alpha: 0.25 });
      }
    });
  }
}


const game = new Game();
window.__game = game;
game.init().catch((e) => { console.error(e); progress(1, 'Error: ' + e.message); });
