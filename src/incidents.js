// Accidents: every few minutes a light plane or a car crashes through a garden wall somewhere outside the yard.
// Drive there (the yard pickup and the GPS arrow), smash the wreck apart and load it onto the tipper truck that is
// already on site, then rebuild the hole in the wall with the bricks and the mortar delivered there. Finishing an
// accident pays out (progression wallet, or the contracts cash in sandbox). Runs on the authority (solo / host);
// clients mirror the state through the 'inc' event. Saved with the world.
import * as THREE from 'three';
import { SITE } from './site.js';
import { INTACT, LOOSE, HELD, GONE } from './demolition.js';

const KINDS = {
  plane: { name: 'Plane crash', icon: '✈️', pay: 6000 },
  car: { name: 'Car crash', icon: '🚗', pay: 3500 },
};
const WALL_COLORS = [0xd9d2c3, 0xc9705a, 0xe8e2d4, 0xb7b6b0];
const CAR_COLORS = [0xd8262b, 0x1f6fd0, 0x2a9a46, 0xf2b200, 0x222428, 0xe8e8e8];
const FIRST_DELAY = 75, NEXT_DELAY = [240, 420];
const COURSES = 5, BLOCK = 1.2, HB = 0.6; // garden wall: 5 courses of 1.2 x 0.6 x 0.6 blocks
const TRUCK = 'tk410';
export const CAR_SPEC = 'pk1';

const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

// wall blocks (site-local x along the wall, y up). Running bond: odd courses start with half blocks. The crash
// knocked a crater out of the middle: those full blocks are missing and have to be laid again.
function wallLayout() {
  const keep = [], gap = [];
  const R = [2.0, 2.0, 1.5, 1.0, 0.4];
  for (let c = 0; c < COURSES; c++) {
    const y = HB / 2 + c * HB;
    if (c % 2 === 0) for (let i = 0; i < 8; i++) { const x = -4.2 + i * BLOCK; (Math.abs(x) < R[c] ? gap : keep).push({ x, y, len: BLOCK }); }
    else {
      keep.push({ x: -4.5, y, len: HB }, { x: 4.5, y, len: HB });
      for (let i = 0; i < 7; i++) { const x = -3.6 + i * BLOCK; (Math.abs(x) < R[c] ? gap : keep).push({ x, y, len: BLOCK }); }
    }
  }
  return { keep, gap };
}
const GAP = wallLayout().gap;

// the wreck, in site-local metres: [x, y, z, sx, sy, sz, colour, tiltX]
function wreckParts(kind, seed) {
  const r = rng(seed * 7 + 3), out = [];
  if (kind === 'plane') {
    // a high-wing light plane (Cessna-like: 8.3 m long, 11 m span, tricycle gear) nosed into the wall; the nose
    // gear collapsed, so it sits on its belly with the tail cocked up
    const W = 0xf2f2ee, S = [0xd8262b, 0x1f6fd0, 0xf2b200][Math.floor(r() * 3)], G = 0x7fb8d8, D = 0x2a2c30;
    out.push([0, 0.62, 0.05, 1.0, 0.9, 0.6, W]);                      // engine cowling, stuck in the wall
    out.push([0.1, 0.62, -0.4, 0.1, 1.2, 0.14, D, 0, 0.45]);          // bent propeller
    for (const [z, c] of [[0.95, W], [2.15, W]]) out.push([0, 0.62, z, 1.12, 0.8, 1.2, c]);   // cabin, lower
    for (const z of [0.95, 2.15]) out.push([0, 1.3, z, 1.04, 0.56, 1.2, G]);                  // cabin windows
    for (const [z, w, h, y, c] of [[3.35, 1.0, 0.95, 0.75, S], [4.55, 0.86, 0.8, 0.85, W], [5.75, 0.72, 0.66, 0.97, S], [6.9, 0.56, 0.52, 1.1, W]]) out.push([0, y, z, w, h, 1.2, c]); // tapering tail cone
    out.push([0, 1.98, 7.15, 0.1, 1.25, 1.0, W]);                     // fin
    out.push([0, 1.7, 7.75, 0.08, 0.9, 0.4, S]);                      // rudder
    for (const sg of [-1, 1]) out.push([sg * 0.82, 1.18, 7.25, 1.3, 0.08, 0.72, W]);   // tailplanes
    // high wing on top of the cabin, 1.3 m chord, red tips; the left tip snapped off and lies on the ground
    out.push([0, 1.64, 1.55, 1.25, 0.12, 1.3, W]);
    for (const sg of [-1, 1]) for (const [x, c] of [[1.25, W], [2.5, W], [3.75, S]]) out.push([sg * x, 1.64, 1.55, 1.25, 0.12, 1.3, c]);
    out.push([4.95, 1.64, 1.55, 1.15, 0.12, 1.3, S]);
    out.push([-5.6, 0.07, 2.6, 1.15, 0.12, 1.3, S, 0, 0.0, 0.35]);
    // wing struts from the belly to under the wing
    for (const sg of [-1, 1]) out.push([sg * 1.32, 1.08, 1.75, 0.07, 1.25, 0.12, W, 0, sg * 0.82]);
    // main gear: legs and spatted wheels; the nose wheel broke off
    for (const sg of [-1, 1]) { out.push([sg * 1.05, 0.38, 2.45, 0.08, 0.5, 0.1, D, 0, sg * 0.6]); out.push([sg * 1.3, 0.2, 2.45, 0.2, 0.4, 0.62, W]); }
    out.push([0.9, 0.17, -0.6, 0.16, 0.34, 0.34, D]);
  } else {
    const C = CAR_COLORS[Math.floor(r() * CAR_COLORS.length)], G = 0x6a8fa6, D = 0x1e1f22, M = 0x9a9ea2;
    out.push([0, 0.42, 0.12, 1.8, 0.3, 0.3, M]);                       // bumper in the wall
    out.push([0, 0.78, 0.55, 1.62, 0.32, 0.9, C, -0.25]);             // crumpled bonnet
    for (const z of [0.95, 2.25, 3.55]) out.push([0, 0.55, z, 1.78, 0.62, 1.3, C]);
    out.push([0, 1.15, 1.9, 1.56, 0.55, 1.15, G]);                     // windscreen / side glass
    out.push([0, 1.15, 3.05, 1.56, 0.55, 1.15, C]);
    out.push([0, 1.48, 2.45, 1.6, 0.1, 2.1, C]);                       // roof
    for (const s of [-1, 1]) for (const z of [1.0, 3.3]) out.push([s * 0.98, 0.32, z, 0.26, 0.62, 0.62, D]);
    out.push([0, 0.62, 4.3, 1.7, 0.42, 0.25, M]);                      // rear bumper / boot lid
  }
  return out;
}

export class Incidents {
  constructor(game) {
    this.g = game;
    this.state = null;      // active accident
    this.nextT = FIRST_DELAY;
    this.count = 0;
    this.done = 0;
    this.walls = [];        // repaired walls left standing: [{ site, b }]
    this.build3D();
  }

  // ------------------------------------------------------------------ visuals: beacon, supplies, GPS
  build3D() {
    const g = this.g;
    this.root = new THREE.Group(); g.scene.add(this.root); this.root.visible = false;
    // a tall pulsing light column you can see from anywhere
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 70, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.y = 35; this.root.add(beam); this.beam = beam;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffb020 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; this.root.add(ring); this.ring = ring;
    // supplies: the mortar tub and a tarp for the brick delivery
    const sup = new THREE.Group(); this.root.add(sup); this.supplies = sup;
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.62, 0.6, 20), new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.7 }));
    tub.position.set(-7.5, 0.3, 8.5); sup.add(tub);
    const mortar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.95 }));
    mortar.position.set(-7.5, 0.56, 8.5); sup.add(mortar);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: 0xf2b200, roughness: 0.6 }));
    sign.position.set(-7.5, 1.25, 7.8); sup.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    post.position.set(-7.5, 0.6, 7.83); sup.add(post);
    const tarp = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.9 }));
    tarp.position.set(-7.0, 0.02, 4.2); sup.add(tarp);
    // barrier tape posts around the crash
    const tape = [];
    for (const [x, z] of [[-6, 9.5], [6, 9.5], [-6, -2], [6, -2]]) tape.push(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6).translate(x, 0.5, z));
    const posts = new THREE.Mesh(mergeList(tape), new THREE.MeshStandardMaterial({ color: 0xff7a1a }));
    sup.add(posts);
  }
  site(i = this.state && this.state.site) { return SITE.incidents[i]; }
  sitePos(i) { const s = this.site(i); return new THREE.Vector3(s.x, 0, s.z); }
  local(i, x, y, z) { const s = this.site(i); return new THREE.Vector3(s.x + x, y, s.z + z); }
  mortarPoint() { return this.state ? this.local(this.state.site, -7.5, 0, 8.5) : null; }

  // ------------------------------------------------------------------ building specs (used by buildBuilding)
  specs(def) {
    const [kindTag, si, kind, seedS] = def.split(':'), site = +si, seed = +seedS || 1, s = this.site(site);
    const out = [];
    if (kindTag === '__incw') {
      const col = new THREE.Color(WALL_COLORS[site % WALL_COLORS.length]);
      const r = rng(site * 13 + 5);
      for (const b of wallLayout().keep) {
        out.push({ type: b.len > 1 ? 'cmu' : 'cmuHalf', pos: new THREE.Vector3(s.x + b.x, b.y, s.z), size: new THREE.Vector3(), quat: null, color: col.clone().multiplyScalar(0.92 + r() * 0.12) });
      }
      // two pillars at the ends
      for (const x of [-5.1, 5.1]) for (let c = 0; c < COURSES + 1; c++) out.push({ type: 'cmuHalf', pos: new THREE.Vector3(s.x + x, HB / 2 + c * HB, s.z), size: new THREE.Vector3(), quat: null, color: new THREE.Color(0x85847f) });
    } else {
      for (const [x, y, z, sx, sy, sz, c, tilt, tiltZ, tiltY] of wreckParts(kind, seed)) {
        const q = tilt || tiltZ || tiltY ? new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt || 0, tiltY || 0, tiltZ || 0)) : null;
        out.push({ type: 'wreck', pos: new THREE.Vector3(s.x + x, y, s.z + z), size: new THREE.Vector3(sx, sy, sz), quat: q, color: new THREE.Color(c) });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ authority: start / progress / finish
  start(kind = null, site = null) {
    const g = this.g;
    if (this.state) return false;
    kind = kind || (Math.random() < 0.5 ? 'plane' : 'car');
    if (site == null) { const used = this.walls.map((w) => w.site); const free = SITE.incidents.map((_, i) => i).filter((i) => !used.includes(i)); const pool = free.length ? free : SITE.incidents.map((_, i) => i); site = pool[Math.floor(Math.random() * pool.length)]; }
    // an old repaired wall on this site makes way for the new one
    const old = this.walls.find((w) => w.site === site);
    if (old) { g.removeBuildingFull(old.b); g.events.push(['bld-', old.b]); this.walls = this.walls.filter((w) => w !== old); }
    const seed = 1 + Math.floor(Math.random() * 9999);
    const wallDef = `__incw:${site}:${kind}:${seed}`, wreckDef = `__incx:${site}:${kind}:${seed}`;
    const wall = g.buildBuilding(wallDef, -1); g.events.push(['bld+', wallDef, -1, wall.id]);
    const wreck = g.buildBuilding(wreckDef, -1); g.events.push(['bld+', wreckDef, -1, wreck.id]);
    // a few blocks knocked out of the wall lie about; the wreck smoulders
    // the tipper truck that takes the wreck away, parked beside the crash
    let truckId = -1;
    if (g.machines.size < 20) {
      const tp = this.local(site, 9.5, 0, 6.5);
      const m = g.createMachine(TRUCK, g.nextMachineId, tp, Math.PI);
      m.siteTruck = true; truckId = m.id;
      g.events.push(['mach+', m.serialize()]);
    }
    // bricks for the repair: the wall's own colour, on the tarp
    const col = new THREE.Color(WALL_COLORS[site % WALL_COLORS.length]);
    const need = GAP.length, cb = g.pressCb();
    // leftover bricks from an earlier delivery here make room for the new ones
    const tarp = this.local(site, -7.0, 0, 4.2);
    for (const p of g.demo.pieces) if (p.brick && p.state === LOOSE && Math.abs(p.pos.x - tarp.x) < 3 && Math.abs(p.pos.z - tarp.z) < 2.4) g.demo.vanish(p, false);
    for (let i = 0; i < need + 2; i++) {
      const p = this.local(site, -8.2 + (i % 3) * 1.25, 0.31 + Math.floor(i / 9) * 0.62, 3.4 + (Math.floor(i / 3) % 3) * 0.66);
      cb.spawn(p, new THREE.Quaternion(), col.clone().multiplyScalar(0.92 + Math.random() * 0.12));
    }
    this.state = { kind, site, seed, wall: wall.id, wreck: wreck.id, truck: truckId, need, stage: 'drive', cleared: 0, total: wreck.count, laid: 0, pay: KINDS[kind].pay, t: 0 };
    this.count++;
    this.sync();
    const K = KINDS[kind];
    g.ui.bigPop(`<b>🚨 ${K.name}!</b><small>${this.site().name} · follow the GPS arrow</small>`, 'job');
    g.ui.toast(`🚨 <b>${K.name}</b> at ${this.site().name}! Drive there (${g.input.touch ? 'the yard pickup' : 'the yard pickup, <b>E</b> to get in'}), smash the wreck, load it on the truck and rebuild the wall. Pays <b>${money(K.pay)}</b>`, true, 9000);
    return true;
  }
  cancel() {
    const g = this.g, st = this.state; if (!st) return;
    this.cleanup(false);
    g.ui.toast('🚨 Accident handed over to another crew');
  }
  // remove the wreck and the site truck; the (repaired) wall stays
  cleanup(keepWall = true) {
    const g = this.g, st = this.state; if (!st) return;
    const wb = g.demo.buildings[st.wreck];
    if (wb && !wb.removed) { for (const p of g.players.values()) g.dropCarried(p.id, (q) => q.b === st.wreck); g.removeBuildingFull(st.wreck); g.events.push(['bld-', st.wreck]); }
    const m = g.machines.get(st.truck);
    if (m && m.driver < 0) { g.destroyMachine(m.id); g.events.push(['mach-', m.id]); }
    if (keepWall) this.walls.push({ site: st.site, b: st.wall });
    else { const b = g.demo.buildings[st.wall]; if (b && !b.removed) { g.removeBuildingFull(st.wall); g.events.push(['bld-', st.wall]); } }
    this.state = null;
    this.nextT = NEXT_DELAY[0] + Math.random() * (NEXT_DELAY[1] - NEXT_DELAY[0]);
    this.sync();
  }

  // how much of the wreck is in the truck (or crushed), how many bricks are back in the hole
  measure() {
    const g = this.g, st = this.state, demo = g.demo, b = demo.buildings[st.wreck];
    let cleared = 0, total = 0;
    const truck = g.machines.get(st.truck);
    let inv = null, box = null;
    if (truck && truck.att && truck.att.dump) { truck.att.group.updateMatrixWorld(true); inv = new THREE.Matrix4().copy(truck.att.group.matrixWorld).invert(); box = truck.att.dump.box; }
    const v = new THREE.Vector3();
    if (b) for (let i = b.start; i < b.start + b.count; i++) {
      const p = demo.pieces[i]; total++;
      if (p.state === GONE) { cleared++; continue; }
      if ((p.state === LOOSE || p.state === HELD) && inv) {
        v.copy(p.pos).applyMatrix4(inv);
        if (Math.abs(v.x) < box[0] + 0.3 && v.z > -0.6 && v.z < box[1] + 0.3 && v.y > -0.8 && v.y < box[2] + 1.0) cleared++;
      }
    }
    // bricks laid (fixed on mortar) in the hole
    const s = this.site(), x0 = s.x - 2.5, x1 = s.x + 2.5;
    let laid = 0;
    const bp = demo.brickPool;
    if (bp) for (let i = bp.start; i < bp.start + bp.count; i++) {
      const p = demo.pieces[i];
      if (p.state !== INTACT) continue;
      if (p.pos.x > x0 && p.pos.x < x1 && Math.abs(p.pos.z - s.z) < 0.45 && p.pos.y < COURSES * HB) laid++;
    }
    return { cleared, total: total || 1, laid };
  }

  update(dt) {
    const g = this.g;
    this.animate(dt);
    if (!g.authority) return;
    const st = this.state;
    if (!st) {
      // never while the player is busy in a menu at the very start; sandbox and progression both
      this.nextT -= dt;
      if (this.nextT <= 0 && g.started !== false) this.start();
      return;
    }
    st.t += dt;
    this.mT = (this.mT || 0) - dt;
    if (this.mT > 0) return;
    this.mT = 0.5;
    const me = g.driving ? g.driving.root.position : g.player.pos, d = Math.hypot(me.x - this.site().x, me.z - this.site().z);
    const m = this.measure();
    const prev = st.stage;
    st.cleared = m.cleared; st.total = m.total; st.laid = m.laid;
    if (st.stage === 'drive' && d < 28) st.stage = 'work';
    const wreckDone = m.cleared >= Math.ceil(m.total * 0.85), wallDone = m.laid >= st.need;
    if (st.stage === 'work' && wreckDone && wallDone) { this.finish(); return; }
    if (prev !== st.stage) {
      g.ui.toast('🚧 You made it! Smash the wreck apart (hammer, charges or a machine), load the pieces into the truck, then rebuild the hole: mortar from the tub, bricks from the tarp', true, 8000);
    }
    if (prev !== st.stage || this.lastSent !== `${st.cleared}|${st.laid}`) { this.lastSent = `${st.cleared}|${st.laid}`; this.sync(); }
  }
  finish() {
    const g = this.g, st = this.state, K = KINDS[st.kind];
    const fast = st.t < 8 * 60, pay = Math.round(st.pay * (fast ? 1.25 : 1));
    if (g.prog) g.prog.earn(pay, false);
    else if (g.contracts) { g.contracts.cash += pay; g.contracts.earned += pay; g.contracts.dirty = true; g.contracts.save(); g.ui.setCareer(); }
    this.done++;
    g.ui.bigPop(`<b>${K.icon} Accident cleared!</b><small>${K.name} at ${this.site().name} · +${money(pay)}${fast ? ' (fast work +25%)' : ''}</small>`, 'job');
    if (g.audio.bigCash) g.audio.bigCash();
    g.audio.firework(this.sitePos(st.site).setY(6), 0.05);
    this.cleanup(true);
  }

  // ------------------------------------------------------------------ per frame (everyone): beacon, smoke, GPS
  animate(dt) {
    const g = this.g, st = this.state;
    this.root.visible = !!st;
    const gps = document.getElementById('gps');
    if (!st) { if (gps) gps.classList.add('hidden'); return; }
    const s = this.site();
    this.root.position.set(s.x, 0, s.z);
    const t = performance.now() * 0.001;
    this.beam.material.opacity = 0.22 + Math.sin(t * 3) * 0.1;
    this.ring.scale.setScalar(1 + (t % 1.5) / 1.5 * 0.6); this.ring.material.opacity = 1;
    // the wreck smoulders until most of it is cleared away
    this.smokeT = (this.smokeT || 0) - dt;
    if (this.smokeT <= 0 && st.cleared < st.total * 0.6) { this.smokeT = 0.25; g.fx.dust(new THREE.Vector3(s.x + (Math.random() - 0.5) * 2, 1.6, s.z + 2.5), 0x3a3a3c, 1, 1.4, { alpha: 0.5, size: 1.6, life: 4, speed: 1.6 }); }
    // GPS
    if (!gps) return;
    gps.classList.remove('hidden');
    const me = g.driving ? g.driving.root.position : g.player.pos;
    const dist = Math.hypot(me.x - s.x, me.z - s.z);
    const v = new THREE.Vector3(s.x, 1, s.z).applyMatrix4(g.camera.matrixWorldInverse);
    const ang = Math.atan2(v.x, -v.z);
    const arrow = document.getElementById('gpsArrow'); if (arrow) arrow.style.transform = `rotate(${ang}rad)`;
    const K = KINDS[st.kind];
    const key = `${st.stage}|${Math.round(dist / 5)}|${st.cleared}|${st.laid}`;
    if (this.gpsKey !== key) {
      this.gpsKey = key;
      document.getElementById('gpsTitle').textContent = `${K.icon} ${K.name} · ${s.name}`;
      document.getElementById('gpsSub').innerHTML = st.stage === 'drive' ? `${Math.round(dist)} m · drive there`
        : `Wreck in truck <b>${st.cleared}/${Math.ceil(st.total * 0.85)}</b> · Wall <b>${Math.min(st.laid, st.need)}/${st.need}</b>${dist > 40 ? ` · ${Math.round(dist)} m` : ''}`;
    }
    gps.classList.toggle('near', dist < 30);
  }

  // ------------------------------------------------------------------ save / sync
  serialize() { return { state: this.state, nextT: Math.round(this.nextT), walls: this.walls, count: this.count, done: this.done }; }
  restore(d) {
    this.state = d && d.state ? { ...d.state } : null;
    this.nextT = d && typeof d.nextT === 'number' ? d.nextT : FIRST_DELAY;
    this.walls = (d && d.walls) || []; this.count = (d && d.count) || 0; this.done = (d && d.done) || 0;
    if (this.state) { const m = this.g.machines.get(this.state.truck); if (m) m.siteTruck = true; }
    this.gpsKey = null;
  }
  clear() { this.state = null; this.walls = []; this.nextT = FIRST_DELAY; this.gpsKey = null; }
  sync() { this.g.events.push(['inc', this.serialize()]); this.gpsKey = null; }
  // progression: bricks laid at an accident site are not part of your house
  atSite(pos) { return SITE.incidents.some((s) => Math.abs(pos.x - s.x) < 8 && Math.abs(pos.z - s.z) < 6); }
}

function mergeList(list) {
  const pos = [], idx = []; let off = 0;
  for (const g of list) {
    const gi = g.index ? g : g;
    const p = gi.attributes.position.array; for (const v of p) pos.push(v);
    if (gi.index) for (const i of gi.index.array) idx.push(i + off);
    off += p.length / 3;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx); out.computeVertexNormals();
  return out;
}
