// Authority-side machine interactions: knocking walls down, grabbing / scooping pieces, bulk material
// (dust, water, cement) and the hydraulic breaker.
import * as THREE from 'three';
import { INTACT, LOOSE, HELD } from './demolition.js';
import { inWater, terrainHeight } from './site.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const WATER_COL = new THREE.Color(0x3d7080);

export function machineInteract(m, dt, W) {
  const { demo, sfx } = W;
  const att = m.att, s = m.s;
  // ---- knock walls down with anything that moves fast enough
  m.probes.forEach((pr, i) => {
    const now = pr.obj.getWorldPosition(new THREE.Vector3());
    const vel = now.clone().sub(m.prevProbe[i]).divideScalar(Math.max(dt, 1e-3));
    if (vel.length() > 0.35 && vel.length() < 40) {
      const hits = demo.breakSphere(now, pr.r * s, vel.clone().clampLength(0, 4).multiplyScalar(0.8), 6);
      if (hits.length) m.hyd = 1;
    }
    m.prevProbe[i].copy(now);
  });

  const gp = m.grabPoint.getWorldPosition(new THREE.Vector3());
  const prevOpen = m.prevOpen ?? m.open;
  m.prevOpen = m.open;

  if (att.behaviour === 'jaw') {
    if (m.openTarget < 0.5 && prevOpen > 0.4 && m.open <= 0.4) grab(m, demo, gp, sfx, W.capacityScale || 1);
    if (m.openTarget > 0.5 && m.held.length && m.open > 0.3) releaseAll(m, demo, dt);
  } else if (att.behaviour === 'scoop' || att.behaviour === 'skip') {
    const mouth = att.mouth.getWorldPosition(new THREE.Vector3());
    const n = att.mouthN.clone().applyQuaternion(att.group.getWorldQuaternion(new THREE.Quaternion()));
    const up = n.y > 0.35, down = att.behaviour === 'skip' ? m.open > 0.5 : n.y < -0.3;
    if (att.behaviour === 'scoop' && att.pieces > 0) {
      if (up && m.held.length < att.pieces && !m.payload.kg) scoop(m, demo, gp, att.grabR * s);
      if (down && m.held.length) releaseAll(m, demo, dt);
    }
    // bulk material
    if (!down && n.y > -0.2 && !m.held.length) fillBulk(m, dt, mouth, W);
    if (down && m.payload.kg > 0) pourBulk(m, dt, att.spout ? att.spout.getWorldPosition(new THREE.Vector3()) : mouth, n, W);
  } else if (att.behaviour === 'breaker') {
    m.breakerActive = m.openTarget > 0.5;
    if (m.breakerActive) breaker(m, dt, W);
  }

  // ---- held pieces follow the attachment
  const am = m.attach.matrixWorld;
  for (const h of m.held) {
    if (h.p.state !== HELD) continue;
    _m.multiplyMatrices(am, h.local); _m.decompose(_p, _q, _s);
    demo.moveHeld(h.p, _p, _q);
  }
  m.held = m.held.filter((h) => h.p.state === HELD);
  m.lastGp = gp;
}

function grab(m, demo, gp, sfx, capScale) {
  const room = Math.round(m.att.pieces * capScale) - m.held.length;
  if (room <= 0) return;
  const s = m.s;
  const cand = demo.piecesInSphere(gp, 1.3 * s, [LOOSE]);
  const intact = demo.intactNear(gp, 0.8 * s, 12);
  const all = [...cand, ...intact].sort((a, b) => a.pos.distanceToSquared(gp) - b.pos.distanceToSquared(gp)).slice(0, room);
  const inv = new THREE.Matrix4().copy(m.attach.matrixWorld).invert();
  for (const p of all) {
    const pm = new THREE.Matrix4().compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1));
    const local = new THREE.Matrix4().multiplyMatrices(inv, pm);
    const lp = new THREE.Vector3().setFromMatrixPosition(local);
    const gl = m.grabPoint.position.clone().add(m.att.group.position);
    lp.x *= 0.7; lp.y = THREE.MathUtils.lerp(lp.y, gl.y, 0.55); lp.z = THREE.MathUtils.lerp(lp.z, gl.z, 0.35);
    local.setPosition(lp);
    if (!demo.hold(p, m.id, local)) continue;
    m.held.push({ p, local });
  }
  if (all.length) { sfx.impact(all[0].type.sound, 0.8, gp); sfx.dust(gp, demo.chipColor(all[0]), 4, 0.8); }
}

function scoop(m, demo, gp, r) {
  const room = m.att.pieces - m.held.length;
  const cand = demo.piecesInSphere(gp, r, [LOOSE]).slice(0, room);
  if (!cand.length) return;
  const inv = new THREE.Matrix4().copy(m.attach.matrixWorld).invert();
  for (const p of cand) {
    const local = new THREE.Matrix4().multiplyMatrices(inv, new THREE.Matrix4().compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1)));
    if (demo.hold(p, m.id, local)) m.held.push({ p, local });
  }
}

export function releaseAll(m, demo, dt) {
  const gp = m.grabPoint.getWorldPosition(new THREE.Vector3());
  const vel = m.lastGp ? gp.clone().sub(m.lastGp).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 6) : new THREE.Vector3();
  for (const h of m.held) demo.release(h.p, vel);
  m.held = [];
}

function setPay(m, kind, kg, color, W) {
  m.payload.kind = kg > 0.01 ? kind : null;
  m.payload.kg = kg > 0.01 ? kg : 0;
  if (color) m.payload.color.copy(color);
  W.onPayload(m);
}

function fillBulk(m, dt, mouth, W) {
  const cap = m.att.bulk.capacity * (m.s ** 3) / (m.att.kind === 'bigbucket' ? 1 : 1);
  m.capKg = cap;
  const room = cap - m.payload.kg;
  if (room <= 1) return;
  const kinds = m.att.bulk.kinds;
  const pk = m.payload.kind;
  // lake water
  if (kinds.includes('water') && (!pk || pk === 'water') && inWater(mouth.x, mouth.y, mouth.z)) {
    const add = Math.min(room, 320 * dt);
    setPay(m, 'water', m.payload.kg + add, WATER_COL, W);
    if (Math.random() < 0.5) W.sfx.chips(mouth, new THREE.Vector3(0, -1, 0), 0x6aa0b0, 2, 0.05, 1.5);
    W.sfx.splash(mouth, 0.3);
    return;
  }
  // stockpile of crushed dust
  if (kinds.includes('dust') && (!pk || pk === 'dust') && W.crusher.pileKg > 1) {
    const c = W.crusher.pileWorld(), { r } = W.crusher.pileDims();
    if (Math.hypot(mouth.x - c.x, mouth.z - c.z) < r * 0.95 && mouth.y < W.crusher.pileSurfaceY(mouth.x, mouth.z) + 0.3) {
      const got = W.crusher.take(Math.min(room, 280 * dt));
      if (got.kg > 0) {
        const tot = m.payload.kg + got.kg;
        const col = m.payload.kg ? m.payload.color.clone().lerp(got.color, got.kg / tot) : got.color;
        setPay(m, 'dust', tot, col, W);
        W.onPile(-got.kg);
        if (Math.random() < 0.4) W.sfx.dust(mouth, col.getHex(), 1, 0.5, { alpha: 0.35 });
      }
      return;
    }
  }
  // cement from the mixer tub
  if (kinds.includes('cement') && (!pk || pk === 'cement') && W.mixer.cement > 0.5) {
    const t = W.mixer.tubCenter;
    if (Math.hypot(mouth.x - t.x, mouth.z - t.z) < 1.25 && mouth.y < t.y + 0.2 && mouth.y > t.y - 1.1) {
      const got = W.mixer.takeCement(Math.min(room, 260 * dt));
      const tot = m.payload.kg + got.kg;
      const col = m.payload.kg ? m.payload.color.clone().lerp(got.color, got.kg / tot) : got.color;
      setPay(m, 'cement', tot, col, W);
      W.onMixer();
    }
  }
}

function pourBulk(m, dt, from, n, W) {
  const rate = (m.att.behaviour === 'skip' ? 220 : 320) * dt;
  const amt = Math.min(m.payload.kg, rate);
  const kind = m.payload.kind, col = m.payload.color.clone();
  let used = 0;
  // into the mixer tub?
  const t = W.mixer.tubCenter;
  if (Math.hypot(from.x - t.x, from.z - t.z) < 1.7 && from.y > t.y - 0.6 && from.y < t.y + 5) {
    used = kind === 'water' ? W.mixer.addWater(amt) : kind === 'dust' ? W.mixer.addDust(amt, col) : W.mixer.addCement(amt, col);
    if (used > 0) W.onMixer();
  } else if (kind === 'cement') {
    const h = W.road.nearest(from, 1.2);
    if (h >= 0 && from.y < 5) { used = W.road.fill(h, amt, col); if (used > 0) W.onRoad(); }
  }
  // whatever didn't go anywhere useful spills on the ground
  const spill = amt;
  setPay(m, kind, m.payload.kg - spill, null, W);
  const fall = from.clone();
  W.sfx.chips(fall, new THREE.Vector3(0, 0, 0).sub(n).multiplyScalar(0.3), kind === 'water' ? 0x6aa0b0 : col.getHex(), 3, 0.05, 0.6);
  if (Math.random() < 0.3) W.sfx.dust(fall, kind === 'water' ? 0xc8dde3 : col.getHex(), 1, 0.4, { alpha: 0.3 });
  if (kind === 'water') W.sfx.splash(fall, 0.2);
  m.lastPour = used > 0 ? 'ok' : 'spill';
}

function breaker(m, dt, W) {
  m.bkTimer = (m.bkTimer || 0) - dt;
  if (m.bkTimer > 0) return;
  m.bkTimer = 0.11;
  const tip = m.att.tip.getWorldPosition(new THREE.Vector3());
  const dir = tip.clone().sub(m.attach.getWorldPosition(new THREE.Vector3())).normalize();
  const near = W.demo.intactNear(tip, 0.32 * m.s, 4);
  if (near.length) {
    for (const p of near) W.demo.damage(p, 2, tip, dir, 3);
    W.sfx.breaker(tip, 1);
    m.hyd = 1;
    return;
  }
  const loose = W.demo.piecesInSphere(tip, 0.35 * m.s, [LOOSE]);
  if (loose.length) { for (const p of loose.slice(0, 3)) W.demo.damage(p, 1, tip, dir, 3); W.sfx.breaker(tip, 0.7); return; }
  const g = terrainHeight(tip.x, tip.z);
  if (tip.y < g + 0.25) {
    W.sfx.breaker(tip, 0.8);
    W.sfx.chips(tip, dir, W.road.onRoad(tip.x, tip.z) ? 0x3a3b3e : 0x8a7a66, 4, 0.05, 2.5);
    W.sfx.dust(tip, 0x9a9488, 1, 0.5);
    if (W.road.onRoad(tip.x, tip.z)) {
      // pound the same spot long enough and the asphalt gives way
      const k = Math.round(tip.x / 1.5) + ',' + Math.round(tip.z / 1.5);
      m.roadHits = m.roadHits || new Map();
      const n = (m.roadHits.get(k) || 0) + 1; m.roadHits.set(k, n);
      if (n === 30 && W.road.nearest(tip, 0.5, false) < 0 && W.road.onRoad(tip.x, tip.z - 1) && W.road.onRoad(tip.x, tip.z + 1)) { W.road.addHole(tip.x, tip.z, 0.8 + Math.random() * 0.3); W.onRoad(true); }
    }
  }
}
