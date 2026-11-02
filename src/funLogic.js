// Authority-side behaviour of the special excavators (models in mx-fun.js): magnet, block blaster, drum cutter,
// rock saw, auger, plate compactor, pallet forks, water cannon, the wrecking ball on a chain and the backhoe's
// front loader. Held blocks name the machine frame they ride on in their hold matrix (heldWorld in machineLogic):
// 1 = the tool, 2 = the backhoe's front bucket, 3 = the blaster's block cage.
import * as THREE from 'three';
import { INTACT, LOOSE, machineBit } from './demolition.js';
import { terrainHeight } from './site.js';

const V3 = () => new THREE.Vector3();
const _v = V3(), _w = V3(), _mi = new THREE.Matrix4();
const on = (m) => m.openTarget > 0.5;
const every = (m, key, dt, t) => { m[key] = (m[key] || 0) - dt; if (m[key] > 0) return false; m[key] = t; return true; };
const once = (m, key, ms, fn) => { const t = performance.now(); if ((m[key] || 0) > t) return; m[key] = t + ms; fn(); };
const UP = new THREE.Vector3(0, 1, 0);

export function funBehaviour(m, dt, W) {
  switch (m.att.behaviour) {
    case 'magnet': return magnet(m, dt, W);
    case 'xball': return xball(m, dt, W);
    case 'blaster': return blaster(m, dt, W);
    case 'cutter': return cutter(m, dt, W);
    case 'saw': return saw(m, dt, W);
    case 'auger': return auger(m, dt, W);
    case 'plate': return plate(m, dt, W);
    case 'forks': return forks(m, dt, W);
    case 'jet': return jet(m, dt, W);
  }
}

// ---- helpers
function hold(m, demo, p, local, code, list) {
  local.elements[15] = code;
  if (!demo.hold(p, m.id, local)) return false;
  list.push({ p, local });
  return true;
}
function frameVel(m, dt) {
  const gp = m.grabPoint.getWorldPosition(V3());
  return m.lastGp ? gp.sub(m.lastGp).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 6) : V3();
}
function releaseList(m, list, demo, dt) {
  const vel = frameVel(m, dt);
  for (const h of list) demo.release(h.p, vel, machineBit(m.id));
  list.length = 0;
}
// rotate the piece so its axis `ax` (0 x, 1 y, 2 z) lines up with `to`, then spin it about `to`
function alignQ(ax, to, spin = 0) {
  const from = new THREE.Vector3(ax === 0 ? 1 : 0, ax === 1 ? 1 : 0, ax === 2 ? 1 : 0);
  const q = new THREE.Quaternion().setFromUnitVectors(from, to);
  return new THREE.Quaternion().setFromAxisAngle(to, spin).multiply(q);
}
const minAxis = (s) => (s.x <= s.y && s.x <= s.z ? 0 : s.y <= s.z ? 1 : 2);
const maxAxis = (s) => (s.x >= s.y && s.x >= s.z ? 0 : s.y >= s.z ? 1 : 2);
// wear an intact block down without the per-hit chips (the caller does the effects); true when it breaks loose
function wear(demo, p, dmg, imp) {
  if (p.state !== INTACT) return false;
  p.hp -= dmg;
  if (p.hp > 0) { demo.tintDamage(p); return false; }
  const mass = p.size.x * p.size.y * p.size.z * p.type.density;
  demo.detach(p, imp ? { x: imp.x * mass, y: imp.y * mass, z: imp.z * mass } : null);
  return true;
}
// grind a piece into dust: it is gone, the dust counts as crushed
function toDust(p, W) {
  const demo = W.demo, col = demo.dustColor(p).clone(), at = p.pos.clone(), kg = p.kg || 100;
  if (p.state === INTACT) demo.detach(p);
  demo.vanish(p);
  W.onBucketCrush(kg, col);
  W.sfx.dust(at, col.getHex(), 5, 1.1, { alpha: 0.5 });
  W.sfx.chips(at, UP, col.getHex(), 8, 0.05, 3);
}

// ---- scrap magnet: switched on, loose blocks fly to the plate and stick (up to 10); it rips blocks out of walls
function magnet(m, dt, W) {
  const demo = W.demo, a = m.att, s = m.s;
  const face = a.face.getWorldPosition(V3());
  if (!on(m)) {
    if (m.held.length) { releaseList(m, m.held, demo, dt); W.sfx.clank(face, 1); W.sfx.tool('zap', face, 0.5); }
    m.magOn = false; return;
  }
  if (!m.magOn) { m.magOn = true; W.sfx.tool('zap', face, 1); }
  if (!every(m, 'magT', dt, 0.1)) return;
  const frame = m.holdFrame(), inv = _mi.copy(frame.matrixWorld).invert();
  const zAxis = new THREE.Vector3(0, 0, 1);
  if (m.held.length < a.cap) {
    for (const p of demo.piecesInSphere(face, 5.5 * s, [LOOSE])) {
      if (m.held.length >= a.cap) break;
      const d = _v.copy(face).sub(p.pos), dist = d.length();
      if (demo.isBig(p)) { if (dist < 2.2 * s) demo.shatter(p, 0.3); continue; }
      if (dist < 1.2 * s + 0.35) {
        // stick it flat against the plate, stacking outward where blocks already hang
        const lp = p.pos.clone().applyMatrix4(inv);
        const r = Math.hypot(lp.x, lp.y), rMax = a.magR * 0.75;
        if (r > rMax) { lp.x *= rMax / r; lp.y *= rMax / r; }
        const layer = m.held.filter((h) => Math.hypot(h.local.elements[12] - lp.x, h.local.elements[13] - lp.y) < 0.8 / s).length;
        const ax = minAxis(p.size), half = p.size.getComponent(ax) / 2;
        lp.z = a.faceZ + (half + layer * p.size.getComponent(ax)) / s;
        const local = new THREE.Matrix4().compose(lp, alignQ(ax, zAxis, Math.random() * Math.PI), new THREE.Vector3(1 / s, 1 / s, 1 / s));
        if (hold(m, demo, p, local, 1, m.held)) W.sfx.clank(face, 0.9);
        continue;
      }
      // pull it in: a strong field near the plate, weaker further out
      p.body.wakeUp();
      d.multiplyScalar(1 / Math.max(dist, 1e-3));
      const sp = Math.min(11, 2.5 + 9 / Math.max(1, dist));
      p.body.setLinvel({ x: d.x * sp, y: d.y * sp + 1.2, z: d.z * sp }, true);
    }
  } else once(m, 'magFullT', 4000, () => W.tellDriver(m, `🧲 The magnet is full (${a.cap} blocks). Switch it off to drop them`));
  // wall blocks right under the plate get ripped out
  let ripped = 0;
  for (const p of demo.intactNear(face, 1.15 * s, 4)) if (wear(demo, p, 1.4, _w.copy(face).sub(p.pos).normalize().multiplyScalar(2))) ripped++;
  if (ripped) W.sfx.impact('metal', 0.6, face);
  once(m, 'magHumT', 700, () => W.sfx.tool('hum', face, 0.5));
}

// ---- wrecking ball on a chain: the contact code breaks walls with the ball's speed; here loose blocks get knocked
function xball(m, dt, W) {
  const b = m.ballSt; if (!b) return;
  const sp = b.v.length();
  if (sp > 2.5) {
    for (const p of W.demo.piecesInSphere(b.p, 0.8 * m.s, [LOOSE]).slice(0, 6)) {
      const mass = p.body.mass();
      p.body.applyImpulse({ x: b.v.x * 0.15 * mass, y: 0.25 * mass, z: b.v.z * 0.15 * mass }, true);
    }
  }
  if (m.lastChain !== on(m)) { if (m.lastChain != null) W.sfx.tool('chain', m.att.hook.getWorldPosition(V3()), 0.8); m.lastChain = on(m); }
}

// ---- block blaster: the vacuum sucks loose blocks into the cage; turning T / Y fires them out of the nozzle
function blaster(m, dt, W) {
  const demo = W.demo, a = m.att, s = m.s;
  const mouth = a.mouth.getWorldPosition(V3()), dir = new THREE.Vector3(0, 0, 1).transformDirection(a.group.matrixWorld).normalize();
  m.held2 = m.held2 || [];
  // fire: holding T or Y turns the (synced) rot channel; every 0.18 of turn fires one block
  if (m.lastRot == null) m.lastRot = m.rot;
  m.fireAcc = Math.min(0.4, (m.fireAcc || 0) + Math.abs(m.rot - m.lastRot)); m.lastRot = m.rot;
  if (m.fireAcc >= 0.18) {
    m.fireAcc -= 0.18;
    if (m.held2.length) fire(m, W, mouth, dir);
    else once(m, 'emptyT', 3000, () => W.tellDriver(m, '🌀 The cage is empty: switch the vacuum on and suck up some blocks first'));
  }
  shots(m, dt, W);
  if (!on(m)) { m.vacOn = false; return; }
  if (!m.vacOn) { m.vacOn = true; W.sfx.tool('vac', mouth, 1); }
  if (!every(m, 'vacT', dt, 0.1)) return;
  const full = m.held2.length >= m.magSlots.length;
  for (const p of demo.piecesInSphere(mouth, 9 * s, [LOOSE])) {
    const d = _v.copy(mouth).sub(p.pos), dist = d.length();
    d.multiplyScalar(1 / Math.max(dist, 1e-3));
    if (-d.dot(dir) < 0.3 && dist > 1.6 * s) continue; // only what is in front of the nozzle
    if (demo.isBig(p)) { if (dist < 2.2 * s) demo.shatter(p, 0.3); continue; }
    if (dist < 1.25 * s + 0.35) { if (!full) swallow(m, demo, p, W, mouth); continue; }
    if (full) continue;
    p.body.wakeUp();
    const sp = Math.min(14, 3 + 18 / Math.max(1, dist));
    p.body.setLinvel({ x: d.x * sp, y: d.y * sp + 0.8, z: d.z * sp }, true);
  }
  if (full) once(m, 'fullT', 4000, () => W.tellDriver(m, '🌀 Cage full (8 blocks)! Hold T or Y to fire them'));
  for (const p of demo.intactNear(mouth, 0.95 * s, 2)) wear(demo, p, 0.9, dir.clone().multiplyScalar(-2));
  once(m, 'vacSndT', 900, () => W.sfx.tool('vac', mouth, 0.55));
}
function swallow(m, demo, p, W, mouth) {
  const used = new Set(m.held2.map((h) => h.slot ?? nearestSlot(m, h.local)));
  const i = m.magSlots.findIndex((_, k) => !used.has(k));
  if (i < 0) return;
  const s = m.s, local = new THREE.Matrix4().compose(m.magSlots[i], alignQ(maxAxis(p.size), new THREE.Vector3(1, 0, 0)), new THREE.Vector3(1 / s, 1 / s, 1 / s));
  if (hold(m, demo, p, local, 3, m.held2)) { m.held2[m.held2.length - 1].slot = i; W.sfx.tool('thunk', mouth, 0.8); W.sfx.dust(mouth, demo.chipColor(p), 2, 0.5); }
}
function nearestSlot(m, local) {
  let best = 0, bd = 1e9;
  m.magSlots.forEach((v, k) => { const d = (v.x - local.elements[12]) ** 2 + (v.y - local.elements[13]) ** 2 + (v.z - local.elements[14]) ** 2; if (d < bd) { bd = d; best = k; } });
  return best;
}
function fire(m, W, mouth, dir) {
  const demo = W.demo, h = m.held2.pop(), p = h.p;
  const pos = mouth.clone().addScaledVector(dir, 0.9 * m.s + 0.5), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  demo.moveHeld(p, pos, q);
  p.body.setTranslation(pos, true); p.body.setRotation(q, true);
  demo.release(p, { x: dir.x * 30, y: dir.y * 30 + 1.5, z: dir.z * 30 }, machineBit(m.id));
  if (p.body.enableCcd) p.body.enableCcd(true);
  p.body.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 }, true);
  (m.shotList = m.shotList || []).push({ p, t: 2.5 });
  W.sfx.tool('fire', mouth, 1);
  W.sfx.dust(mouth, 0xd8d4cc, 4, 0.8, { alpha: 0.4 });
}
// a fired block smashes the wall blocks it flies into
function shots(m, dt, W) {
  if (!m.shotList || !m.shotList.length) return;
  const demo = W.demo;
  for (const sh of m.shotList) {
    sh.t -= dt;
    const p = sh.p;
    if (p.state !== LOOSE || !p.body) { sh.t = 0; continue; }
    const v = p.body.linvel(), sp = Math.hypot(v.x, v.y, v.z);
    if (sp < 5) { sh.t = Math.min(sh.t, 0.3); continue; }
    const hits = demo.intactNear(p.pos, 1.0, 3);
    if (!hits.length) continue;
    const d = new THREE.Vector3(v.x, v.y, v.z).normalize();
    for (const q of hits) wear(demo, q, 99, d.clone().multiplyScalar(Math.min(8, sp * 0.3)).setY(Math.abs(d.y) + 1));
    p.body.setLinvel({ x: v.x * 0.55, y: v.y * 0.55, z: v.z * 0.55 }, true);
    W.sfx.impact(hits[0].type.sound, 1, p.pos);
    W.sfx.dust(p.pos, demo.chipColor(hits[0]), 5, 1.0, { alpha: 0.5 });
    W.sfx.chips(p.pos, d.clone().negate(), demo.chipColor(hits[0]), 10, 0.06, 4);
  }
  for (const sh of m.shotList) if (sh.t <= 0 && sh.p.body && sh.p.body.enableCcd) sh.p.body.enableCcd(false);
  m.shotList = m.shotList.filter((sh) => sh.t > 0);
}

// ---- drum cutter: spinning drums grind wall blocks and rubble straight into dust
function cutter(m, dt, W) {
  if (!on(m) || (m.spinV || 0) < 0.5) return;
  if (!every(m, 'cutT', dt, 0.12)) return;
  const demo = W.demo, s = m.s;
  let any = null;
  for (const D of m.att.drums) {
    const c = D.getWorldPosition(V3());
    for (const p of demo.intactNear(c, 0.62 * s, 2)) {
      any = p;
      p.hp -= 1.6;
      if (p.hp <= 0) toDust(p, W); else { demo.tintDamage(p); W.sfx.chips(c, UP, demo.chipColor(p), 4, 0.04, 3); }
    }
    const loose = demo.piecesInSphere(c, 0.85 * s, [LOOSE]);
    if (loose.length) { any = loose[0]; toDust(loose[0], W); }
  }
  if (any) once(m, 'cutSndT', 260, () => W.sfx.tool('grind', m.att.zone.getWorldPosition(V3()), 1));
}

// ---- rock saw: every block the spinning blade passes through is cut clean out of the wall
function saw(m, dt, W) {
  if (!on(m) || (m.spinV || 0) < 0.5) return;
  if (!every(m, 'sawT', dt, 0.07)) return;
  const demo = W.demo, a = m.att, s = m.s, R = a.bladeR * s;
  const c = a.bladeC.getWorldPosition(V3()), n = new THREE.Vector3(1, 0, 0).transformDirection(a.group.matrixWorld).normalize();
  const inBlade = (p) => { const d = _v.copy(p.pos).sub(c), off = d.dot(n), rad = Math.sqrt(Math.max(0, d.lengthSq() - off * off)); return Math.abs(off) < 0.3 + 0.2 * s && rad < R + 0.3 ? off : null; };
  let cut = 0, at = null;
  for (const p of demo.intactNear(c, R + 0.4, 16)) {
    const off = inBlade(p); if (off == null) continue;
    const mass = p.size.x * p.size.y * p.size.z * p.type.density, k = off >= 0 ? 1 : -1;
    demo.detach(p, { x: n.x * k * mass * 1.2, y: mass * 0.4, z: n.z * k * mass * 1.2 });
    at = p.pos.clone(); if (++cut >= 3) break;
  }
  for (const p of demo.piecesInSphere(c, R + 0.5, [LOOSE])) {
    const off = inBlade(p); if (off == null) continue;
    const mass = p.body.mass(), k = off >= 0 ? 1 : -1;
    p.body.applyImpulse({ x: n.x * k * mass * 2, y: mass * 1.5, z: n.z * k * mass * 2 }, true);
    at = at || p.pos.clone();
  }
  if (at) {
    W.sfx.chips(at, UP, 0xffb340, 8, 0.03, 5);
    once(m, 'sawSndT', 230, () => { W.sfx.tool('saw', at, 1); W.sfx.dust(at, 0xd8d4cc, 2, 0.6, { alpha: 0.35 }); });
  } else once(m, 'sawIdleT', 900, () => W.sfx.tool('whine', c, 0.4));
}

// ---- auger: bores through walls along its length, and drills new potholes into the road
function auger(m, dt, W) {
  if (!on(m) || (m.spinV || 0) < 0.5) return;
  if (!every(m, 'augT', dt, 0.1)) return;
  const demo = W.demo, a = m.att, s = m.s;
  const A = a.augerA.getWorldPosition(V3()), B = a.augerB.getWorldPosition(V3()), dir = B.clone().sub(A).normalize();
  let hit = null;
  for (const t of [0.3, 0.55, 0.8, 1]) {
    const P = A.clone().lerp(B, t);
    for (const p of demo.intactNear(P, 0.4 * s, 2)) { hit = p; if (wear(demo, p, 1.3, dir.clone().multiplyScalar(2).setY(0.6))) W.sfx.impact(p.type.sound, 0.7, P); }
    for (const p of demo.piecesInSphere(P, 0.55 * s, [LOOSE])) { const mass = p.body.mass(), tg = _w.copy(p.pos).sub(P).cross(dir).normalize(); p.body.applyImpulse({ x: tg.x * mass * 1.5, y: mass * 0.8, z: tg.z * mass * 1.5 }, true); }
  }
  if (hit) { W.sfx.chips(B, dir.clone().negate(), demo.chipColor(hit), 4, 0.04, 3); once(m, 'augSndT', 280, () => W.sfx.tool('drill', B, 1)); }
  const tip = a.tip.getWorldPosition(V3()), g = terrainHeight(tip.x, tip.z);
  if (tip.y < g + 0.45) {
    const road = W.road.onRoad(tip.x, tip.z);
    W.sfx.chips(V3().set(tip.x, g + 0.1, tip.z), UP, road ? 0x3a3b3e : 0x7a6a56, 4, 0.05, 3);
    once(m, 'augSndT', 280, () => W.sfx.tool('drill', tip, 0.9));
    if (road) {
      const k = Math.round(tip.x / 1.5) + ',' + Math.round(tip.z / 1.5);
      m.roadHits = m.roadHits || new Map();
      const n = (m.roadHits.get(k) || 0) + 1; m.roadHits.set(k, n);
      if (n === 12 && W.road.nearest(tip, 0.5, false) < 0 && W.road.onRoad(tip.x, tip.z - 1) && W.road.onRoad(tip.x, tip.z + 1)) {
        W.road.addHole(tip.x, tip.z, 0.85 + Math.random() * 0.3); W.onRoad(true);
        W.sfx.dust(tip, 0x6a6a68, 5, 0.9);
        W.tellDriver(m, '🌪️ Drilled a new pothole!');
      }
    }
  }
}

// ---- plate compactor: compacts filled potholes it is pressed onto; shakes nearby walls and makes rubble hop
function plate(m, dt, W) {
  if (!on(m)) return;
  const demo = W.demo, s = m.s, foot = m.att.foot.getWorldPosition(V3()), g = terrainHeight(foot.x, foot.z);
  if (foot.y < g + 0.5) {
    for (const h of W.road.holes) {
      if (h.filled < h.need || h.comp >= 1 || Math.hypot(foot.x - h.x, foot.z - h.z) > h.r + 0.6) continue;
      h.comp = Math.min(1, h.comp + dt * 0.35); W.road.refresh(h); W.onRoad();
      if (h.comp >= 1) W.tellDriver(m, '⭐ Pothole compacted to a perfect finish!');
    }
  }
  if (!every(m, 'plT', dt, 0.15)) return;
  let shook = null;
  for (const p of demo.intactNear(foot, 1.7 * s, 6)) { shook = p; wear(demo, p, 0.45, V3().set(Math.random() - 0.5, 0.5, Math.random() - 0.5)); }
  for (const p of demo.piecesInSphere(foot, 3.2 * s, [LOOSE])) {
    if (Math.random() > 0.45) continue;
    const mass = p.body.mass(); p.body.wakeUp();
    p.body.applyImpulse({ x: (Math.random() - 0.5) * mass * 0.8, y: mass * (1.2 + Math.random()), z: (Math.random() - 0.5) * mass * 0.8 }, true);
  }
  if (shook) W.sfx.dust(foot, demo.chipColor(shook), 1, 0.7, { alpha: 0.3 });
  once(m, 'plSndT', 300, () => W.sfx.tool('thump', foot, 0.8));
}

// ---- pallet forks: locking snaps the blocks on or right next to the tines into a neat stack (2 rows, 4 high)
function forks(m, dt, W) {
  const demo = W.demo, a = m.att, s = m.s, locked = on(m);
  const edge = locked && !m.prevLock; m.prevLock = locked;
  if (!locked) { if (m.held.length) { releaseList(m, m.held, demo, dt); W.sfx.clank(m.grabPoint.getWorldPosition(V3()), 0.7); } return; }
  if (!edge || m.held.length) return;
  const frame = m.holdFrame(), inv = _mi.copy(frame.matrixWorld).invert(), gp = m.grabPoint.getWorldPosition(V3());
  const cand = [];
  for (const p of demo.piecesInSphere(gp, 3.0 * s, [LOOSE])) {
    if (demo.isBig(p)) continue;
    const lp = p.pos.clone().applyMatrix4(inv);
    if (Math.abs(lp.x) > 1.2 || lp.y < -2.0 || lp.y > 0.4 || lp.z < a.tineZ - 2.6 || lp.z > a.tineZ + 0.7) continue;
    cand.push({ p, lp });
  }
  cand.sort((u, v) => u.lp.lengthSq() - v.lp.lengthSq());
  const xAxis = new THREE.Vector3(1, 0, 0);
  let n = 0;
  for (const { p } of cand.slice(0, a.cap)) {
    const row = n % 2, layer = Math.floor(n / 2), hgt = Math.min(p.size.x, p.size.y, p.size.z);
    const lp = new THREE.Vector3(0, row ? -1.1 : -0.42, a.tineZ - 0.04 - (hgt / 2 + layer * hgt) / s);
    const local = new THREE.Matrix4().compose(lp, alignQ(maxAxis(p.size), xAxis), new THREE.Vector3(1 / s, 1 / s, 1 / s));
    if (hold(m, demo, p, local, 1, m.held)) n++;
  }
  if (n) { W.sfx.clank(gp, 1); W.tellDriver(m, `🍴 ${n} block${n > 1 ? 's' : ''} locked on the forks`); }
  else W.tellDriver(m, '🍴 Nothing on the forks: lower them right next to some blocks, then lock');
}

// ---- water cannon: the jet (ray cast in funIdle) wears down the block it hits and blasts loose ones away
function jet(m, dt, W) {
  if (!on(m) || !m.jetHit) return;
  if (!every(m, 'jetT', dt, 0.1)) return;
  const demo = W.demo, h = m.jetHit, p = h.collider ? demo.pieceFromCollider(h.collider) : null;
  W.sfx.chips(h.p, h.dir.clone().negate().add(UP), 0xd8eef8, 5, 0.035, 3);
  if (p && p.state === INTACT) {
    if (wear(demo, p, 1.1, h.dir.clone().multiplyScalar(4).setY(1))) W.sfx.impact(p.type.sound, 0.7, h.p);
    else if (Math.random() < 0.4) W.sfx.chips(h.p, h.dir.clone().negate(), demo.chipColor(p), 3, 0.04, 2.5);
  } else if (p && p.state === LOOSE && p.body) {
    const mass = p.body.mass();
    p.body.applyImpulseAtPoint({ x: h.dir.x * mass * 1.6, y: (h.dir.y + 0.3) * mass * 1.6, z: h.dir.z * mass * 1.6 }, h.p, true);
  }
  const t = W.mixer.tubCenter;
  if (Math.hypot(h.p.x - t.x, h.p.z - t.z) < 1.6 && h.p.y > t.y - 1.2 && h.p.y < t.y + 1.6) { if (W.mixer.addWater(30) > 0) W.onMixer(); }
  once(m, 'jetSndT', 420, () => W.sfx.tool('jet', m.att.nozzle.getWorldPosition(V3()), 0.8));
  if (Math.random() < 0.3) W.sfx.dust(h.p, 0xe6f2f8, 1, 0.6, { alpha: 0.25 });
}

// ---- backhoe front loader: lowered and racked, driving into rubble fills the bucket; tipping it (tool button) dumps
export function frontLoader(m, dt, W) {
  const demo = W.demo, s = m.s;
  m.held2 = m.held2 || [];
  const mouth = m.frontMouth.getWorldPosition(V3());
  if (m.open > 0.6) {
    if (m.held2.length) { releaseList(m, m.held2, demo, dt); W.sfx.clank(mouth, 0.8); }
    return;
  }
  if (m.open > 0.3 || m.held2.length >= 5 || !every(m, 'flT', dt, 0.1)) return;
  const inv = _mi.copy(m.frontFrame.matrixWorld).invert(), ml = m.frontMouth.position;
  const cand = demo.piecesInSphere(mouth, 1.35 * s, [LOOSE]).filter((p) => !demo.isBig(p)).sort((u, v) => u.pos.distanceToSquared(mouth) - v.pos.distanceToSquared(mouth));
  for (const p of cand.slice(0, 5 - m.held2.length)) {
    const local = new THREE.Matrix4().multiplyMatrices(inv, new THREE.Matrix4().compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1)));
    const lp = new THREE.Vector3().setFromMatrixPosition(local);
    lp.lerp(ml, 0.5); lp.x = THREE.MathUtils.clamp(lp.x, -0.75, 0.75);
    local.setPosition(lp);
    if (hold(m, demo, p, local, 2, m.held2)) W.sfx.impact(p.type.sound, 0.5, mouth);
  }
}
